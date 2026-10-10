import { CampaignList } from './CampaignList'
import { CampaignTable } from './CampaignTable'
import type { CampaignRow } from './rows'
import type { OpenHandler } from './RowParts'

interface CampaignResultsProps {
  rows: readonly CampaignRow[]
  tableLayout: boolean
  identityLabel: string
  sortText: string
  now: number
  onOpen: OpenHandler
  onToggleWatch: (campaignId: string) => void
}

export function CampaignResults({ tableLayout, sortText, ...shared }: CampaignResultsProps) {
  return tableLayout ? <CampaignTable {...shared} sortText={sortText} /> : <CampaignList {...shared} />
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
