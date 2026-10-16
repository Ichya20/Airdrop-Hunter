import { OriginBadge } from '../../components/Badges'
import { Icon, type IconName } from '../../components/Icon'
import { formatClock, formatDateTime, formatRelative, formatTime } from '../../domain/format'
import { SCAN_TTL_MS, type ScannerState, type Scanner, type SourceView } from './useScanner'

interface ScanPanelProps {
  scanner: Scanner
  now: number
  /** Layar sempit: daftar sumber diringkas dan terbuka otomatis bila ada masalah. */
  compact: boolean
  onScan: () => void
}

function agoText(iso: string, now: number): string {
  return formatRelative(iso, Math.max(now, Date.parse(iso)))
}

function titleFor(state: ScannerState): string {
  switch (state.status) {
    case 'running':
      if (state.trigger === 'open') return 'Memuat campaign dari sumber…'
      if (state.trigger === 'visible') return 'Memperbarui data yang usang…'
      if (state.trigger === 'retry') return 'Mencoba lagi sumber yang gagal…'
      return 'Memindai sumber airdrop…'
    case 'done':
      return 'Scan selesai'
    case 'partial':
      return 'Scan selesai sebagian'
    case 'failed':
      return 'Semua sumber gagal'
    case 'cancelled':
      return 'Scan dibatalkan'
    case 'idle':
      return 'Belum ada scan'
  }
}

function announcementFor(state: ScannerState, visibleCount: number, okCount: number, campaignCount: number): string {
  switch (state.status) {
    case 'running':
      return `Memindai ${state.activeIds.length} sumber airdrop.`
    case 'done':
      return `Scan selesai: ${campaignCount} campaign dari ${visibleCount} sumber.`
    case 'partial':
      return `Scan selesai sebagian: ${okCount} dari ${visibleCount} sumber berhasil. ${campaignCount} campaign ditampilkan.`
    case 'failed':
      return 'Scan gagal: semua sumber gagal. Gunakan Coba lagi.'
    case 'cancelled':
      return `Scan dibatalkan. ${okCount} dari ${visibleCount} sumber memiliki hasil.`
    case 'idle':
      return ''
  }
}

const PHASE_ICON: Record<SourceView['phase'], IconName | null> = {
  idle: 'clock',
  queued: 'clock',
  running: null,
  retry_wait: null,
  done: 'checkCircle',
  error: 'xCircle',
  cancelled: 'stop',
}

function phaseText(source: SourceView): string {
  const checkpoint =
    source.lastSuccessAt !== null && source.campaigns.length > 0
      ? ` · memakai hasil ${formatTime(source.lastSuccessAt)}`
      : ''
  switch (source.phase) {
    case 'idle':
      return 'Belum dipindai'
    case 'queued':
      return 'Antre'
    case 'running':
      return source.attempt > 1 ? `Memindai… (percobaan ${source.attempt})` : 'Memindai…'
    case 'retry_wait':
      return `Gagal, mencoba lagi… ${source.error ?? ''}`.trim()
    case 'done':
      return `${source.campaigns.length} campaign · ${source.lastSuccessAt ? formatTime(source.lastSuccessAt) : ''}`
    case 'error':
      return `Gagal: ${source.error ?? 'kesalahan tidak diketahui'}${checkpoint}`
    case 'cancelled':
      return `Dibatalkan${checkpoint}`
  }
}

export function ScanPanel({ scanner, now, compact, onScan }: ScanPanelProps) {
  const { state, visibleSources, isRunning, lastSuccessAt, campaigns } = scanner
  const activeSources = state.sources.filter((source) => state.activeIds.includes(source.id))
  const finished = activeSources.filter(
    (source) => source.phase === 'done' || source.phase === 'error' || source.phase === 'cancelled',
  ).length
  const okCount = visibleSources.filter((source) => source.phase === 'done').length
  const hasProblem = visibleSources.some(
    (source) => source.phase === 'error' || source.phase === 'cancelled' || source.phase === 'retry_wait',
  )
  const stale = lastSuccessAt !== null && now - Date.parse(lastSuccessAt) > SCAN_TTL_MS
  const tone =
    state.status === 'failed'
      ? 'error'
      : state.status === 'partial' || state.status === 'cancelled'
        ? 'warning'
        : 'ok'

  const sourceList = (
    <ul className="sources" aria-label="Status per sumber">
      {visibleSources.map((source) => {
        const icon = PHASE_ICON[source.phase]
        return (
          <li key={source.id} className={`source source--${source.phase}`}>
            <span className="source__icon">
              {icon ? <Icon name={icon} size={16} /> : <span className="spinner" aria-hidden="true" />}
            </span>
            <OriginBadge origin={source.origin} />
            <span className="source__name">{source.name}</span>
            <span className="source__state">{phaseText(source)}</span>
            {source.phase === 'error' && !isRunning ? (
              <button
                type="button"
                className="btn btn--ghost btn--xs source__retry"
                onClick={() => scanner.retrySource(source.id)}
              >
                <Icon name="refresh" size={14} />
                Coba lagi<span className="sr-only"> {source.name}</span>
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )

  return (
    <section
      className="scan"
      aria-labelledby="scan-title"
      data-status={state.status}
      data-tone={tone}
      data-run={state.runId}
      data-trigger={state.trigger ?? undefined}
    >
      <div className="scan__radar" aria-hidden="true">
        <span className="radar">
          <span className="radar__sweep" />
          <span className="radar__dot" />
        </span>
      </div>

      <div className="scan__body">
        <div className="scan__headline">
          <h2 id="scan-title" className="scan__title">
            {titleFor(state)}
          </h2>
          {stale && !isRunning ? <span className="tag tag--warning">Usang · lebih dari 60 menit</span> : null}
        </div>
        <p className="scan__meta">
          {lastSuccessAt !== null ? (
            <span>
              Terakhir berhasil{' '}
              <time dateTime={lastSuccessAt}>
                {compact ? formatClock(lastSuccessAt) : formatDateTime(lastSuccessAt)}
              </time>{' '}
              ({agoText(lastSuccessAt, now)})
            </span>
          ) : (
            <span>Belum ada hasil yang berhasil</span>
          )}
          <span className="scan__dot" aria-hidden="true">
            ·
          </span>
          <span>
            {okCount}/{visibleSources.length} sumber aktif berhasil
          </span>
          <span className="scan__dot" aria-hidden="true">
            ·
          </span>
          <span>{campaigns.length} campaign</span>
        </p>

        {isRunning ? (
          <div className="scan__progress">
            <progress max={Math.max(activeSources.length, 1)} value={finished} aria-labelledby="scan-title" />
            <span className="scan__progress-text">
              {finished}/{activeSources.length} sumber selesai
            </span>
          </div>
        ) : null}

        <details
            key={`${state.runId}:${state.status}`}
            className="scan__details"
            open={isRunning || hasProblem}
          >
            <summary className="scan__summary">
              <Icon name="chevronDown" size={16} className="scan__chevron" />
              Status per sumber
            </summary>
            {sourceList}
        </details>
      </div>

      <div className="scan__actions">
        {isRunning ? (
          <button type="button" className="btn btn--secondary" onClick={scanner.cancel}>
            <Icon name="stop" />
            Batalkan
          </button>
        ) : state.status === 'failed' || state.status === 'partial' || state.status === 'cancelled' ? (
          <button type="button" className="btn btn--secondary" onClick={onScan}>
            <Icon name="refresh" />
            Scan ulang
          </button>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcementFor(state, visibleSources.length, okCount, campaigns.length)}
      </p>
    </section>
  )
}
