import { Monogram, NetworkTag, OriginBadge, StatusBadge } from '../../components/Badges'
import { KIND_TEXT } from '../../domain/status'
import { OPEN_DETAIL } from './intent'
import { statusSubtext, type CampaignRow } from './rows'
import { ActionButton, DeadlineCell, WatchButton, type OpenHandler } from './RowParts'

interface CampaignListProps {
  rows: readonly CampaignRow[]
  identityLabel: string
  now: number
  onOpen: OpenHandler
  onToggleWatch: (campaignId: string) => void
}

/** Daftar ringkas untuk layar < 1024 px. Seluruh kartu dapat disentuh untuk membuka detail. */
export function CampaignList({ rows, identityLabel, now, onOpen, onToggleWatch }: CampaignListProps) {
  return (
    <ul className="clist" aria-label={`Campaign DEMO untuk ${identityLabel}`}>
      {rows.map((row) => {
        const { campaign } = row
        return (
          <li key={campaign.id} className="citem" data-label={row.label}>
            <div className="citem__head">
              <Monogram name={campaign.project} />
              <div className="citem__title">
                <button
                  type="button"
                  className="citem__name"
                  onClick={() => onOpen(campaign.id, OPEN_DETAIL)}
                >
                  {campaign.name}
                </button>
                <span className="citem__meta">
                  <NetworkTag network={row.network} />
                  <span aria-hidden="true">·</span>
                  <span>{KIND_TEXT[campaign.kind]}</span>
                </span>
              </div>
              <WatchButton row={row} onToggle={onToggleWatch} />
            </div>
            <div className="citem__status">
              <StatusBadge label={row.label} size="sm" />
              <OriginBadge origin={campaign.origin} sourceKind={campaign.sourceKind} />
              {row.stale ? <span className="tag tag--warning">Data lama</span> : null}
            </div>
            <p className="citem__sub">{statusSubtext(row)}</p>
            <div className="citem__foot">
              <span className="citem__deadline">
                <span className="citem__deadline-label">Tenggat</span>
                <DeadlineCell deadline={campaign.deadline} now={now} />
              </span>
              <ActionButton row={row} onOpen={onOpen} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
