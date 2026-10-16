import { Icon } from '../../components/Icon'
import type { CampaignRow } from './rows'

export function ClaimCostNotice({ rows }: { rows: readonly CampaignRow[] }) {
  const live = rows.filter((row) => row.campaign.origin === 'live')
  const free = live.filter((row) => row.claimCost.status === 'free_distribution').length
  return (
    <aside className="notice notice--info" aria-label="Syarat airdrop gratis dan bernilai">
      <Icon name="shield" size={18} />
      <div>
        <p><strong>Target: token gratis, bisa diklaim ke wallet, dan memiliki pasar nyata.</strong> Gas jaringan boleh diperlukan. {free} entri memiliki aturan distribusi gratis; eligibility dan nilai pasarnya diperiksa terpisah.</p>
        <p className="small">Tanpa pilihan koin, minimum TVL, atau batas total hasil lokal. Cakupan mengikuti sumber dan jaringan yang didukung. Harga serta likuiditas bukan jaminan dapat dijual; token masuk wallet tetap memerlukan bukti transaksi.</p>
      </div>
    </aside>
  )
}
