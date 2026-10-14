import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { SourceAdapter } from '../../adapters/sources/types'
import { mergeCampaigns } from '../../domain/normalize'
import type { Campaign } from '../../domain/types'
import type { StoredSourceCheckpoint } from '../../storage/types'
import { DEFAULT_SCAN_OPTIONS, runScan, type ScanEvent, type ScanOptions } from './runScan'

export type SourcePhase =
  | 'idle'
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'done'
  | 'error'
  | 'cancelled'

export type ScanStatus = 'idle' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled'
export type ScanTrigger = 'manual' | 'open' | 'visible' | 'retry'

export interface SourceView {
  id: string
  name: string
  phase: SourcePhase
  attempt: number
  error: string | null
  lastSuccessAt: string | null
  lastAttemptAt: string | null
  /** Checkpoint: campaign dari hasil sukses terakhir sumber ini. */
  campaigns: Campaign[]
}

export interface ScannerState {
  runId: number
  status: ScanStatus
  trigger: ScanTrigger | null
  startedAt: string | null
  finishedAt: string | null
  /** Sumber yang termasuk run aktif atau terakhir. */
  activeIds: string[]
  sources: SourceView[]
}

type Action =
  | { type: 'start'; runId: number; trigger: ScanTrigger; sourceIds: string[]; at: string }
  | { type: 'event'; runId: number; event: ScanEvent }
  | { type: 'finish'; runId: number; cancelled: boolean; at: string }
  | { type: 'hydrate'; checkpoints: readonly StoredSourceCheckpoint[] }

/** TTL awal sebelum data dianggap usang (60 menit). */
export const SCAN_TTL_MS = 60 * 60_000

const IN_FLIGHT: ReadonlySet<SourcePhase> = new Set(['queued', 'running', 'retry_wait'])

function initState(adapters: readonly SourceAdapter[]): ScannerState {
  return {
    runId: 0,
    status: 'idle',
    trigger: null,
    startedAt: null,
    finishedAt: null,
    activeIds: [],
    sources: adapters.map((adapter) => ({
      id: adapter.id,
      name: adapter.name,
      phase: 'idle',
      attempt: 0,
      error: null,
      lastSuccessAt: null,
      lastAttemptAt: null,
      campaigns: [],
    })),
  }
}

function eventSourceId(event: ScanEvent): string {
  return event.type === 'result' ? event.result.sourceId : event.sourceId
}

function applyEvent(source: SourceView, event: ScanEvent): SourceView {
  switch (event.type) {
    case 'queued':
      return { ...source, phase: 'queued', attempt: 0, error: null }
    case 'attempt':
      return { ...source, phase: 'running', attempt: event.attempt }
    case 'retry_wait':
      return { ...source, phase: 'retry_wait', error: event.message }
    case 'cancelled':
      return { ...source, phase: 'cancelled' }
    case 'result': {
      const { result } = event
      if (result.status === 'ok') {
        return {
          ...source,
          phase: 'done',
          attempt: result.attempts,
          error: null,
          lastSuccessAt: result.checkedAt,
          lastAttemptAt: result.checkedAt,
          campaigns: result.campaigns,
        }
      }
      // Checkpoint campaign sebelumnya tetap dipertahankan.
      return {
        ...source,
        phase: 'error',
        attempt: result.attempts,
        error: result.error.message,
        lastAttemptAt: result.checkedAt,
      }
    }
  }
}

function overallStatus(sources: readonly SourceView[], cancelled: boolean): ScanStatus {
  if (cancelled) return 'cancelled'
  const done = sources.filter((source) => source.phase === 'done').length
  if (done === sources.length) return 'done'
  return done === 0 ? 'failed' : 'partial'
}

function reducer(state: ScannerState, action: Action): ScannerState {
  switch (action.type) {
    case 'hydrate': {
      if (state.status === 'running' || action.checkpoints.length === 0) return state
      const byId = new Map(action.checkpoints.map((cp) => [cp.sourceId, cp]))
      let restoredCount = 0
      const sources = state.sources.map((source) => {
        if (source.lastSuccessAt !== null) return source
        const cp = byId.get(source.id)
        if (!cp || cp.campaigns.length === 0) return source
        restoredCount += 1
        return {
          ...source,
          phase: 'done' as const,
          lastSuccessAt: cp.lastSuccessAt,
          lastAttemptAt: cp.updatedAt,
          campaigns: cp.campaigns,
        }
      })
      if (restoredCount === 0) return state
      const latest = latestIso(sources.map((s) => s.lastSuccessAt))
      return {
        ...state,
        sources,
        status: state.status === 'idle' ? 'done' : state.status,
        finishedAt: state.finishedAt ?? latest,
      }
    }
    case 'start':
      return {
        ...state,
        runId: action.runId,
        status: 'running',
        trigger: action.trigger,
        startedAt: action.at,
        finishedAt: null,
        activeIds: action.sourceIds,
        sources: state.sources.map((source) =>
          action.sourceIds.includes(source.id)
            ? { ...source, phase: 'queued', attempt: 0, error: null }
            : source,
        ),
      }
    case 'event': {
      if (action.runId !== state.runId) return state
      const sourceId = eventSourceId(action.event)
      return {
        ...state,
        sources: state.sources.map((source) =>
          source.id === sourceId ? applyEvent(source, action.event) : source,
        ),
      }
    }
    case 'finish': {
      if (action.runId !== state.runId) return state
      // Pengaman: sumber yang masih "berjalan" saat run selesai tidak boleh menggantung.
      const sources = state.sources.map((source) =>
        IN_FLIGHT.has(source.phase)
          ? action.cancelled
            ? { ...source, phase: 'cancelled' as const }
            : { ...source, phase: 'error' as const, error: 'Scan berhenti sebelum sumber selesai.' }
          : source,
      )
      return {
        ...state,
        sources,
        status: overallStatus(sources, action.cancelled),
        finishedAt: action.at,
      }
    }
  }
}

function latestIso(values: readonly (string | null)[]): string | null {
  let latest: string | null = null
  for (const value of values) {
    if (value !== null && (latest === null || value > latest)) latest = value
  }
  return latest
}

export interface Scanner {
  state: ScannerState
  campaigns: Campaign[]
  /** ID sumber yang datanya berasal dari scan sebelumnya karena percobaan terakhir gagal/dibatalkan. */
  staleSourceIds: ReadonlySet<string>
  lastSuccessAt: string | null
  isRunning: boolean
  hasData: boolean
  start: (trigger?: ScanTrigger) => boolean
  retrySource: (sourceId: string) => boolean
  cancel: () => void
  hydrateCheckpoints: (checkpoints: readonly StoredSourceCheckpoint[]) => void
}

export function useScanner(
  adapters: readonly SourceAdapter[],
  options: ScanOptions = DEFAULT_SCAN_OPTIONS,
  ttlMs: number = SCAN_TTL_MS,
): Scanner {
  const [state, dispatch] = useReducer(reducer, adapters, initState)
  const controllerRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)

  const execute = useCallback(
    (targets: readonly SourceAdapter[], trigger: ScanTrigger): boolean => {
      // Deduplikasi: hanya satu scan berjalan pada satu waktu.
      if (controllerRef.current !== null || targets.length === 0) return false
      const controller = new AbortController()
      controllerRef.current = controller
      runIdRef.current += 1
      const runId = runIdRef.current
      dispatch({
        type: 'start',
        runId,
        trigger,
        sourceIds: targets.map((adapter) => adapter.id),
        at: new Date().toISOString(),
      })
      runScan(
        targets,
        options,
        controller.signal,
        (event) => dispatch({ type: 'event', runId, event }),
        trigger === 'retry',
      )
        .catch((error: unknown) => {
          console.error('Scan berhenti tidak terduga', error)
        })
        .finally(() => {
          if (controllerRef.current === controller) controllerRef.current = null
          dispatch({
            type: 'finish',
            runId,
            cancelled: controller.signal.aborted,
            at: new Date().toISOString(),
          })
        })
      return true
    },
    [options],
  )

  const start = useCallback(
    (trigger: ScanTrigger = 'manual') => execute(adapters, trigger),
    [adapters, execute],
  )

  const retrySource = useCallback(
    (sourceId: string) => {
      const adapter = adapters.find((item) => item.id === sourceId)
      return adapter ? execute([adapter], 'retry') : false
    },
    [adapters, execute],
  )

  const cancel = useCallback(() => {
    controllerRef.current?.abort(new DOMException('Scan dibatalkan pengguna.', 'AbortError'))
  }, [])

  const hydrateCheckpoints = useCallback((checkpoints: readonly StoredSourceCheckpoint[]) => {
    dispatch({ type: 'hydrate', checkpoints })
  }, [])

  // Scan otomatis saat dashboard dibuka tanpa data. Timer dibersihkan saat StrictMode
  // melakukan mount ulang sehingga scan tidak berjalan dua kali.
  useEffect(() => {
    const timer = window.setTimeout(() => start('open'), 0)
    return () => window.clearTimeout(timer)
  }, [start])

  // Hentikan scan ketika komponen benar-benar dilepas.
  useEffect(() => () => controllerRef.current?.abort(), [])

  const lastSuccessAt = useMemo(
    () => latestIso(state.sources.map((source) => source.lastSuccessAt)),
    [state.sources],
  )

  // Pembaruan saat tab aktif kembali, hanya jika data melewati TTL.
  const freshnessRef = useRef<string | null>(null)
  useEffect(() => {
    freshnessRef.current = lastSuccessAt ?? state.finishedAt
  }, [lastSuccessAt, state.finishedAt])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const reference = freshnessRef.current
      if (reference !== null && Date.now() - Date.parse(reference) > ttlMs) start('visible')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [start, ttlMs])

  const campaigns = useMemo(
    () => mergeCampaigns(state.sources.flatMap((source) => source.campaigns)),
    [state.sources],
  )

  const staleSourceIds = useMemo(
    () =>
      new Set(
        state.sources
          .filter(
            (source) =>
              (source.phase === 'error' || source.phase === 'cancelled') &&
              source.lastSuccessAt !== null &&
              source.campaigns.length > 0,
          )
          .map((source) => source.id),
      ),
    [state.sources],
  )

  return {
    state,
    campaigns,
    staleSourceIds,
    lastSuccessAt,
    isRunning: state.status === 'running',
    hasData: lastSuccessAt !== null,
    start,
    retrySource,
    cancel,
    hydrateCheckpoints,
  }
}
