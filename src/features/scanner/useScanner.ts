import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { SourceAdapter } from '../../adapters/sources/types'
import { mergeCampaigns } from '../../domain/normalize'
import type { Campaign, DataOrigin } from '../../domain/types'
import type { StoredSourceCheckpoint } from '../../storage/types'
import { DEFAULT_SCAN_OPTIONS, runScan, type ScanEvent, type ScanOptions } from './runScan'
import { sourcesNeedingRefresh } from './scanCache'

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
  origin: DataOrigin
  adapterVersion: string
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
  | { type: 'hydrate'; checkpoints: readonly StoredSourceCheckpoint[]; replace: boolean }

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
      origin: adapter.origin,
      adapterVersion: adapter.version,
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

function overallStatus(
  sources: readonly SourceView[],
  activeIds: readonly string[],
  cancelled: boolean,
): ScanStatus {
  if (cancelled) return 'cancelled'
  const scoped = activeIds.length > 0 ? sources.filter((s) => activeIds.includes(s.id)) : sources
  if (scoped.length === 0) return 'idle'
  const done = scoped.filter((source) => source.phase === 'done').length
  if (done === scoped.length) return 'done'
  return done === 0 ? 'failed' : 'partial'
}

function reducer(state: ScannerState, action: Action): ScannerState {
  switch (action.type) {
    case 'hydrate': {
      const restoredState = action.replace ? {
        ...state,
        status: 'idle' as const,
        trigger: null,
        startedAt: null,
        finishedAt: null,
        activeIds: [],
        sources: state.sources.map((source) => ({
          ...source, phase: 'idle' as const, attempt: 0, error: null,
          lastSuccessAt: null, lastAttemptAt: null, campaigns: [],
        })),
      } : state
      if (action.checkpoints.length === 0) return restoredState
      const byId = new Map(action.checkpoints.map((cp) => [cp.sourceId, cp]))
      let restoredCount = 0
      const sources = restoredState.sources.map((source) => {
        const cp = byId.get(source.id)
        if (!cp || !cp.lastSuccessAt || !Number.isFinite(Date.parse(cp.lastSuccessAt))) return source
        if (!cp.adapterVersion && cp.campaigns.length === 0) return source
        if (cp.adapterVersion && cp.adapterVersion !== source.adapterVersion) return source
        if (cp.campaigns.some((campaign) => campaign.adapterVersion !== source.adapterVersion)) return source
        if (source.lastSuccessAt && Date.parse(source.lastSuccessAt) >= Date.parse(cp.lastSuccessAt)) return source
        restoredCount += 1
        return {
          ...source,
          phase: IN_FLIGHT.has(source.phase) ? source.phase : 'done' as const,
          lastSuccessAt: cp.lastSuccessAt,
          lastAttemptAt: cp.updatedAt,
          campaigns: cp.campaigns,
        }
      })
      if (restoredCount === 0) return restoredState
      const latest = latestIso(sources.map((s) => s.lastSuccessAt))
      return {
        ...restoredState,
        sources,
        status: restoredState.status === 'idle' ? 'done' : restoredState.status,
        finishedAt: restoredState.finishedAt ?? latest,
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
        status: overallStatus(sources, state.activeIds, action.cancelled),
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
  /** Daftar sumber yang aktif sesuai mode sumber yang dipilih pengguna. */
  visibleSources: SourceView[]
  campaigns: Campaign[]
  /** ID sumber yang datanya berasal dari scan sebelumnya karena percobaan terakhir gagal/dibatalkan. */
  staleSourceIds: ReadonlySet<string>
  lastSuccessAt: string | null
  isRunning: boolean
  isReady: boolean
  hasData: boolean
  start: (trigger?: ScanTrigger) => boolean
  retrySource: (sourceId: string) => boolean
  cancel: () => void
  hydrateCheckpoints: (checkpoints: readonly StoredSourceCheckpoint[], replace?: boolean) => void
}

export function useScanner(
  adapters: readonly SourceAdapter[],
  enabledSourceIds?: ReadonlySet<string>,
  options: ScanOptions = DEFAULT_SCAN_OPTIONS,
  ttlMs: number = SCAN_TTL_MS,
  ready = true,
): Scanner {
  const [state, dispatch] = useReducer(reducer, adapters, initState)
  const controllerRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)
  const automaticSelectionRef = useRef<string | null>(null)

  const enabledAdapters = useMemo(
    () =>
      enabledSourceIds
        ? adapters.filter((adapter) => enabledSourceIds.has(adapter.id))
        : adapters,
    [adapters, enabledSourceIds],
  )

  const selectionKey = enabledAdapters.map((adapter) => adapter.id).sort().join('|')

  const visibleSources = useMemo(
    () =>
      enabledSourceIds
        ? state.sources.filter((source) => enabledSourceIds.has(source.id))
        : state.sources,
    [state.sources, enabledSourceIds],
  )

  const execute = useCallback(
    (targets: readonly SourceAdapter[], trigger: ScanTrigger): boolean => {
      if (!ready || controllerRef.current !== null || targets.length === 0) return false
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
    [options, ready],
  )

  const start = useCallback(
    (trigger: ScanTrigger = 'manual') => {
      const started = execute(enabledAdapters, trigger)
      if (started) automaticSelectionRef.current = selectionKey
      return started
    },
    [enabledAdapters, execute, selectionKey],
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

  const hydrateCheckpoints = useCallback((checkpoints: readonly StoredSourceCheckpoint[], replace = false) => {
    dispatch({ type: 'hydrate', checkpoints, replace })
  }, [])

  // Tunggu storage, lalu perbarui hanya sumber yang belum memiliki cache segar.
  useEffect(() => {
    if (!ready || state.status === 'running' || automaticSelectionRef.current === selectionKey) return
    const timer = window.setTimeout(() => {
      const targets = sourcesNeedingRefresh(enabledAdapters, state.sources, ttlMs)
      if (targets.length === 0 || execute(targets, 'open')) {
        automaticSelectionRef.current = selectionKey
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [ready, state.status, state.sources, selectionKey, enabledAdapters, ttlMs, execute])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const lastSuccessAt = useMemo(
    () => latestIso(visibleSources.map((source) => source.lastSuccessAt)),
    [visibleSources],
  )

  // Pembaruan saat tab aktif kembali, hanya jika data melewati TTL.
  const sourcesRef = useRef(state.sources)
  useEffect(() => {
    sourcesRef.current = state.sources
  }, [state.sources])

  useEffect(() => {
    const onVisibility = () => {
      if (!ready || document.visibilityState !== 'visible') return
      const targets = sourcesNeedingRefresh(enabledAdapters, sourcesRef.current, ttlMs)
      if (targets.length > 0) execute(targets, 'visible')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [ready, enabledAdapters, execute, ttlMs])

  const campaigns = useMemo(
    () => mergeCampaigns(visibleSources.flatMap((source) => source.campaigns)),
    [visibleSources],
  )

  const staleSourceIds = useMemo(
    () =>
      new Set(
        visibleSources
          .filter(
            (source) =>
              (source.phase === 'error' || source.phase === 'cancelled') &&
              source.lastSuccessAt !== null &&
              source.campaigns.length > 0,
          )
          .map((source) => source.id),
      ),
    [visibleSources],
  )

  // Ringkasan mengikuti mode yang terlihat, termasuk ketika seluruh datanya berasal dari cache.
  const displayState = useMemo(() => ({
    ...state,
    status: state.status === 'running'
      ? 'running' as const
      : visibleSources.every((source) => source.phase === 'idle')
        ? 'idle' as const
        : overallStatus(visibleSources, [], visibleSources.some((source) => source.phase === 'cancelled')),
    activeIds: state.status === 'running' ? state.activeIds : visibleSources.map((source) => source.id),
  }), [state, visibleSources])

  return {
    state: displayState,
    visibleSources,
    campaigns,
    staleSourceIds,
    lastSuccessAt,
    isRunning: state.status === 'running',
    isReady: ready,
    hasData: lastSuccessAt !== null && campaigns.length > 0,
    start,
    retrySource,
    cancel,
    hydrateCheckpoints,
  }
}
