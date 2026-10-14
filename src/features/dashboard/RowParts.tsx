import { Icon } from '../../components/Icon'
import { describeDeadline } from '../../domain/format'
import { intentFor, type OpenIntent } from './intent'
import type { CampaignRow } from './rows'

export type OpenHandler = (campaignId: string, intent: OpenIntent) => void

export function ActionButton({ row, onOpen }: { row: CampaignRow; onOpen: OpenHandler }) {
  const { action, campaign } = row
  const primary = action.kind === 'claim' || action.kind === 'claim_site'
  return (
    <button
      type="button"
      className={`btn btn--sm ${primary ? 'btn--primary' : 'btn--secondary'} row-action`}
      onClick={() => onOpen(campaign.id, intentFor(action.kind))}
    >
      {action.text}
      <span className="sr-only"> {campaign.name}</span>
    </button>
  )
}

export function WatchButton({
  row,
  onToggle,
}: {
  row: CampaignRow
  onToggle: (campaignId: string) => void
}) {
  return (
    <button
      type="button"
      className={`icon-btn watch${row.watched ? ' watch--on' : ''}`}
      aria-pressed={row.watched}
      aria-label={`Simpan ${row.campaign.name} di watchlist`}
      onClick={() => onToggle(row.campaign.id)}
    >
      <Icon name={row.watched ? 'starFilled' : 'star'} />
    </button>
  )
}

export function DeadlineCell({ deadline, now }: { deadline: string | null; now: number }) {
  const view = describeDeadline(deadline, now)
  const className = ['deadline', view.urgent ? 'deadline--urgent' : '', view.known ? '' : 'deadline--unknown']
    .filter(Boolean)
    .join(' ')
  return (
    <span className={className}>
      {view.known && deadline !== null ? (
        <time className="deadline__date" dateTime={deadline}>
          {view.text}
        </time>
      ) : (
        <span className="deadline__date">{view.text}</span>
      )}
      <span className="deadline__hint">
        {view.urgent ? <Icon name="clock" size={13} /> : null}
        {view.urgent ? `Segera · ${view.hint}` : view.hint}
      </span>
    </span>
  )
}
