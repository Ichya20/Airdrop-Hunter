import type { MouseEvent } from 'react'
import { Monogram, NetworkTag, OriginBadge, StatusBadge } from '../../components/Badges'
import { KIND_TEXT } from '../../domain/status'
import { OPEN_DETAIL } from './intent'
import { statusSubtext, type CampaignRow } from './rows'
import { ActionButton, DeadlineCell, WatchButton, type OpenHandler } from './RowParts'

interface CampaignTableProps {
  rows: readonly CampaignRow[]
  identityLabel: string
  sortText: string
  now: number
  onOpen: OpenHandler
  onToggleWatch: (campaignId: string) => void
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a, input, select, label') !== null
}

export function CampaignTable({ rows, identityLabel, sortText, now, onOpen, onToggleWatch }: CampaignTableProps) {
  return (
    <div className="table-wrap">
      <table className="ctable">
        <caption className="sr-only">
          Campaign DEMO untuk {identityLabel}: {rows.length} baris, diurutkan menurut {sortText}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Proyek</th>
            <th scope="col">Jaringan</th>
            <th scope="col">Status untuk {identityLabel}</th>
            <th scope="col">Tenggat</th>
            <th scope="col" className="ctable__actions-head">
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { campaign } = row
            // Klik baris hanya pintasan mouse; tombol nama tetap kontrol utama untuk keyboard.
            const handleRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
              if (!isInteractive(event.target)) onOpen(campaign.id, OPEN_DETAIL)
            }
            return (
              <tr key={campaign.id} className="ctable__row" data-label={row.label} onClick={handleRowClick}>
                <th scope="row" className="ctable__project">
                  <div className="proj">
                    <Monogram name={campaign.project} />
                    <div className="proj__text">
                      <button type="button" className="proj__name" onClick={() => onOpen(campaign.id, OPEN_DETAIL)}>
                        {campaign.name}
                      </button>
                      <span className="proj__meta">
                        <span>
                          {KIND_TEXT[campaign.kind]} · {campaign.project}
                        </span>
                        <OriginBadge origin={campaign.origin} />
                        {row.stale ? <span className="tag tag--warning">Data lama</span> : null}
                      </span>
                    </div>
                  </div>
                </th>
                <td>
                  <NetworkTag network={row.network} />
                </td>
                <td>
                  <div className="cell-status">
                    <StatusBadge label={row.label} size="sm" />
                    <span className="cell-sub">{statusSubtext(row)}</span>
                  </div>
                </td>
                <td>
                  <DeadlineCell deadline={campaign.deadline} now={now} />
                </td>
                <td>
                  <div className="row-actions">
                    <ActionButton row={row} onOpen={onOpen} />
                    <WatchButton row={row} onToggle={onToggleWatch} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
