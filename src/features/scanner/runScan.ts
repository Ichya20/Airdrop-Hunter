import {
  delay,
  SourceError,
  toSourceError,
  type SourceAdapter,
  type SourceResult,
} from '../../adapters/sources/types'
import type { Campaign } from '../../domain/types'

export interface ScanOptions {
  /** Jumlah sumber yang diproses bersamaan. */
  concurrency: number
  /** Batas waktu per percobaan. */
  timeoutMs: number
  /** Retry tambahan untuk error sementara (network, timeout, http). */
  retries: number
  /** Jeda awal sebelum retry; berlipat dua tiap percobaan. */
  backoffMs: number
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  concurrency: 2,
  timeoutMs: 8_000,
  retries: 1,
  backoffMs: 600,
}

export type ScanEvent =
  | { type: 'queued'; sourceId: string }
  | { type: 'attempt'; sourceId: string; attempt: number }
  | { type: 'retry_wait'; sourceId: string; attempt: number; message: string }
  | { type: 'result'; result: SourceResult }
  | { type: 'cancelled'; sourceId: string }

type AttemptOutcome =
  | { kind: 'ok'; campaigns: Campaign[] }
  | { kind: 'error'; error: SourceError }
  | { kind: 'cancelled' }

/**
 * Jalankan adapter dengan concurrency terbatas, timeout per percobaan, retry terbatas
 * dengan backoff, dan pembatalan. Fungsi ini tidak melempar error; semua hasil dikirim
 * melalui `onEvent`.
 */
export async function runScan(
  adapters: readonly SourceAdapter[],
  options: ScanOptions,
  signal: AbortSignal,
  onEvent: (event: ScanEvent) => void,
  manualRetry = false,
): Promise<void> {
  const queue = [...adapters]
  for (const adapter of queue) onEvent({ type: 'queued', sourceId: adapter.id })

  const worker = async () => {
    while (queue.length > 0 && !signal.aborted) {
      const adapter = queue.shift()
      if (adapter) await runAdapter(adapter, options, signal, onEvent, manualRetry)
    }
  }

  const workerCount = Math.max(1, Math.min(options.concurrency, queue.length))
  await Promise.all(Array.from({ length: workerCount }, worker))

  // Sumber yang belum sempat dimulai ketika scan dibatalkan.
  for (const adapter of queue) onEvent({ type: 'cancelled', sourceId: adapter.id })
}

async function attemptOnce(
  adapter: SourceAdapter,
  options: ScanOptions,
  signal: AbortSignal,
  attempt: number,
  manualRetry: boolean,
): Promise<AttemptOutcome> {
  const attemptController = new AbortController()
  const forwardAbort = () => attemptController.abort(signal.reason)
  signal.addEventListener('abort', forwardAbort, { once: true })
  const timer = setTimeout(() => {
    attemptController.abort(
      new SourceError('timeout', `Tidak ada respons dalam ${Math.round(options.timeoutMs / 1000)} detik.`),
    )
  }, options.timeoutMs)

  try {
    const campaigns = await adapter.fetchCampaigns({
      signal: attemptController.signal,
      attempt,
      manualRetry,
    })
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'ok', campaigns }
  } catch (error) {
    if (signal.aborted) return { kind: 'cancelled' }
    const reason: unknown = attemptController.signal.reason
    return { kind: 'error', error: reason instanceof SourceError ? reason : toSourceError(error) }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', forwardAbort)
  }
}

async function runAdapter(
  adapter: SourceAdapter,
  options: ScanOptions,
  signal: AbortSignal,
  onEvent: (event: ScanEvent) => void,
  manualRetry: boolean,
): Promise<void> {
  const maxAttempts = options.retries + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal.aborted) {
      onEvent({ type: 'cancelled', sourceId: adapter.id })
      return
    }
    onEvent({ type: 'attempt', sourceId: adapter.id, attempt })
    const outcome = await attemptOnce(adapter, options, signal, attempt, manualRetry)

    if (outcome.kind === 'cancelled') {
      onEvent({ type: 'cancelled', sourceId: adapter.id })
      return
    }

    if (outcome.kind === 'ok') {
      onEvent({
        type: 'result',
        result: {
          sourceId: adapter.id,
          status: 'ok',
          checkedAt: new Date().toISOString(),
          attempts: attempt,
          campaigns: outcome.campaigns,
          error: null,
        },
      })
      return
    }

    const { error } = outcome
    if (error.retryable && attempt < maxAttempts) {
      onEvent({ type: 'retry_wait', sourceId: adapter.id, attempt, message: error.message })
      try {
        await delay(options.backoffMs * 2 ** (attempt - 1), signal)
      } catch {
        onEvent({ type: 'cancelled', sourceId: adapter.id })
        return
      }
      continue
    }

    onEvent({
      type: 'result',
      result: {
        sourceId: adapter.id,
        status: 'error',
        checkedAt: new Date().toISOString(),
        attempts: attempt,
        campaigns: [],
        error: { kind: error.kind, message: error.message },
      },
    })
    return
  }
}
