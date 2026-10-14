import type { Campaign, DataOrigin } from '../../domain/types'

export type SourceErrorKind =
  | 'network'
  | 'timeout'
  | 'http'
  | 'invalid'
  | 'cors'
  | 'unsupported'
  | 'aborted'

const RETRYABLE: ReadonlySet<SourceErrorKind> = new Set(['network', 'timeout', 'http'])

export class SourceError extends Error {
  readonly kind: SourceErrorKind
  readonly retryable: boolean
  /** Jeda minimum sebelum percobaan berikutnya, bila sumber membatasinya. */
  readonly retryAfterMs: number | undefined

  constructor(kind: SourceErrorKind, message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'SourceError'
    this.kind = kind
    this.retryable = RETRYABLE.has(kind)
    this.retryAfterMs = retryAfterMs !== undefined && Number.isFinite(retryAfterMs)
      ? Math.max(0, retryAfterMs)
      : undefined
  }
}

export interface SourceFetchContext {
  signal: AbortSignal
  attempt: number
  /** `true` jika dipicu tombol "Coba lagi" pada satu sumber. */
  manualRetry: boolean
}

/**
 * Kontrak collector per sumber. UI tidak memanggil endpoint langsung;
 * semua akses data melewati adapter ini.
 */
export interface SourceAdapter {
  id: string
  name: string
  origin: DataOrigin
  version: string
  description: string
  /** Mengembalikan campaign yang sudah dinormalisasi, atau melempar `SourceError`. */
  fetchCampaigns(context: SourceFetchContext): Promise<Campaign[]>
  /** Jeda yang masih diwajibkan limiter sebelum mencoba sumber ini kembali. */
  getRetryDelayMs?(manualRetry: boolean): number
}

/** Hasil terstruktur per sumber yang disimpan scanner. */
export type SourceResult =
  | {
      sourceId: string
      status: 'ok'
      checkedAt: string
      attempts: number
      campaigns: Campaign[]
      error: null
    }
  | {
      sourceId: string
      status: 'error'
      checkedAt: string
      attempts: number
      campaigns: []
      error: { kind: SourceErrorKind; message: string }
    }

export function toSourceError(error: unknown): SourceError {
  if (error instanceof SourceError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new SourceError('aborted', 'Permintaan dibatalkan.')
  }
  if (error instanceof TypeError) {
    return new SourceError('network', 'Tidak dapat terhubung ke sumber.')
  }
  return new SourceError('invalid', 'Respons sumber tidak dapat diproses.')
}

/** Jeda yang dapat dibatalkan melalui AbortSignal. */
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal))
      return
    }
    let timer: ReturnType<typeof setTimeout>
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortReason(signal))
    }
    // Timer browser meluap untuk jeda > 2^31-1 ms; tunggu dalam potongan agar
    // Retry-After panjang tidak berubah menjadi retry langsung.
    const schedule = (remainingMs: number) => {
      const chunkMs = Math.min(remainingMs, 2_147_483_647)
      timer = setTimeout(() => {
        if (remainingMs > chunkMs) {
          schedule(remainingMs - chunkMs)
          return
        }
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, chunkMs)
    }
    schedule(Math.max(0, ms))
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Dibatalkan', 'AbortError')
}
