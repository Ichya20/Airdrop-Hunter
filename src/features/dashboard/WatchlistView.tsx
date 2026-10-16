import { useMemo, type RefObject } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import type { Identity } from '../../domain/types'
import { identityKey, identityName } from '../wallet/identity'
import { CampaignResults, SkeletonResults } from './CampaignResults'
import { sortRows } from './filtering'
import type { CampaignRow } from './rows'
import type { OpenHandler } from './RowParts'

interface WatchlistViewProps {
  rows: readonly CampaignRow[]
  watchedIds: readonly string[]
  identity: Identity
  now: number
  tableLayout: boolean
  loading: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
  onOpen: OpenHandler
  onToggleWatch: (campaignId: string) => void
}

export function WatchlistView({
  rows,
  watchedIds,
  identity,
  now,
  tableLayout,
  loading,
  headingRef,
  onOpen,
  onToggleWatch,
}: WatchlistViewProps) {
  const name = identityName(identity)
  const watchedRows = useMemo(
    () => sortRows(rows.filter((row) => row.watched), 'priority', now),
    [rows, now],
  )
  // Campaign yang dipantau tetapi tidak ada di hasil scan terakhir.
  const missing = useMemo(() => {
    const available = new Set(rows.map((row) => row.campaign.id))
    return watchedIds.filter((id) => !available.has(id)).length
  }, [rows, watchedIds])

  let content
  if (loading && watchedRows.length === 0 && watchedIds.length > 0) {
    content = <SkeletonResults tableLayout={tableLayout} />
  } else if (watchedRows.length === 0) {
    content = (
      <EmptyState
        icon="star"
        title={missing > 0 ? 'Campaign di watchlist tidak ada di hasil scan terakhir' : 'Watchlist masih kosong'}
        actions={
          <a className="btn btn--secondary" href="#/">
            <Icon name="grid" />
            Ke dashboard
          </a>
        }
      >
        <p>
          {missing > 0
            ? 'Jalankan Cari airdrop untuk memuat ulang campaign dari sumber.'
            : `Tandai campaign dengan ikon bintang untuk menyimpannya di watchlist ${name}.`}
        </p>
      </EmptyState>
    )
  } else {
    content = (
      <CampaignResults
        key={identityKey(identity)}
        rows={watchedRows}
        tableLayout={tableLayout}
        identityLabel={name}
        sortText="prioritas status"
        now={now}
        onOpen={onOpen}
        onToggleWatch={onToggleWatch}
      />
    )
  }

  return (
    <div className="view">
      <div className="view__head">
        <div>
          <h1 className="view__title" ref={headingRef} tabIndex={-1}>
            Watchlist
          </h1>
          <p className="view__sub">
            Campaign yang Anda tandai untuk <strong>{name}</strong>. Tersimpan secara terpisah di IndexedDB lokal.
          </p>
        </div>
      </div>
      <section className="panel" aria-labelledby="watchlist-title">
        <div className="panel__head">
          <h2 id="watchlist-title" className="panel__title">
            Dipantau
          </h2>
          <span className="panel__count">{watchedRows.length} campaign</span>
          {missing > 0 ? <span className="tag tag--warning">{missing} tidak ada di hasil terakhir</span> : null}
        </div>
        <div className="panel__content">{content}</div>
      </section>
    </div>
  )
}
