import { Icon } from '../../components/Icon'
import type { CampaignRow } from './rows'

export function ClaimCostNotice({ rows }: { rows: readonly CampaignRow[] }) {
  const live = rows.filter((row) => row.campaign.origin === 'live')
  const free = live.filter((row) => row.claimCost.status === 'free_distribution').length
  return (
    <aside className="notice notice--info" aria-label="Syarat airdrop gratis dan bernilai">
      <Icon name="shield" size={18} />
      <div>
        <p>{free} entri memiliki aturan distribusi gratis. Eligibility dan nilai pasar diperiksa terpisah. Klaim dalam aplikasi belum aktif.</p>
      </div>
    </aside>
  )
}
