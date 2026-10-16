import { useState } from 'react'
import { CampaignList } from './CampaignList'
import { CampaignTable } from './CampaignTable'
import { paginateRows } from './pagination'
import type { CampaignRow } from './rows'
import type { OpenHandler } from './RowParts'
import '../../styles/performance.css'

interface CampaignResultsProps {
  rows: readonly CampaignRow[]
  tableLayout: boolean
  identityLabel: string
  sortText: string
  now: number
  onOpen: OpenHandler
  onToggleWatch: (campaignId: string) => void
}

export function CampaignResults({ rows, tableLayout, sortText, ...shared }: CampaignResultsProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const page = paginateRows(rows, pageIndex)

  // Menghapus item watchlist atau pembaruan scan dapat mengurangi jumlah halaman.
  if (pageIndex !== page.index) setPageIndex(page.index)

  return (
    <>
      {page.pageCount > 1 ? (
        <nav className="results-pager" aria-label="Halaman hasil campaign">
          <p className="results-pager__summary" role="status" aria-atomic="true">
            {page.start}–{page.end} dari {rows.length} campaign · Halaman {page.index + 1} dari {page.pageCount}
          </p>
          <div className="results-pager__buttons">
            <button type="button" className="btn btn--secondary btn--sm" disabled={page.index === 0}
              onClick={() => setPageIndex(page.index - 1)}>
              Sebelumnya
            </button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={page.index === page.pageCount - 1}
              onClick={() => setPageIndex(page.index + 1)}>
              Berikutnya
            </button>
          </div>
        </nav>
      ) : null}
      {tableLayout ? <CampaignTable {...shared} rows={page.rows} sortText={sortText} /> : <CampaignList {...shared} rows={page.rows} />}
    </>
  )
}

/** Kerangka saat data pertama dimuat. Disembunyikan dari pembaca layar; progres diumumkan panel scan. */
export function SkeletonResults({ tableLayout }: { tableLayout: boolean }) {
  const items = Array.from({ length: tableLayout ? 6 : 4 }, (_, index) => index)
  return (
    <div className={tableLayout ? 'skeleton skeleton--table' : 'skeleton skeleton--list'} aria-hidden="true">
      {items.map((index) => (
        <div key={index} className="skeleton__row">
          <span className="skeleton__block skeleton__block--avatar" />
          <span className="skeleton__lines">
            <span className="skeleton__block skeleton__block--title" />
            <span className="skeleton__block skeleton__block--meta" />
          </span>
          <span className="skeleton__block skeleton__block--badge" />
          {tableLayout ? <span className="skeleton__block skeleton__block--meta" /> : null}
          <span className="skeleton__block skeleton__block--button" />
        </div>
      ))}
    </div>
  )
}
