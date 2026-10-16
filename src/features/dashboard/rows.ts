import { isEligibilityFresh, resolveEligibility } from '../../adapters/eligibility'
import { getNetwork, type NetworkInfo } from '../../domain/networks'
import { assessClaimCost, type ClaimCostAssessment } from '../../domain/claimCost'
import type { TokenMarketEvidence } from '../../adapters/market'
import { campaignMarket, hasCampaignMarket } from './campaignMarket'
import {
  deriveLabel,
  ELIGIBILITY_TEXT,
  resolveAction,
  TX_TEXT,
  type PrimaryAction,
} from '../../domain/status'
import type {
  Campaign,
  DashboardLabel,
  EligibilityResult,
  Identity,
  TxRecord,
} from '../../domain/types'
import type { StoredScanRecord } from '../../storage/types'
import { isRecordMatchingIdentity } from '../../storage/keys'
import { resolveTransaction } from '../claims/resolveTransaction'

/** Satu baris dashboard: campaign + status terpisah untuk identitas aktif + label turunan. */
export interface CampaignRow {
  campaign: Campaign
  network: NetworkInfo
  eligibility: EligibilityResult
  claimCost: ClaimCostAssessment
  market: TokenMarketEvidence | null
  tx: TxRecord | null
  label: DashboardLabel
  action: PrimaryAction
  /** Semua sumber campaign ini gagal pada percobaan terakhir; data berasal dari checkpoint. */
  stale: boolean
  /** Hasil kelayakan lama tidak dipakai sebagai bukti siap klaim. */
  eligibilityStale: boolean
  watched: boolean
}

export function buildRows(
  campaigns: readonly Campaign[],
  identity: Identity,
  now: number,
  staleSourceIds: ReadonlySet<string>,
  watched: ReadonlySet<string>,
  cachedRecords?: ReadonlyMap<string, StoredScanRecord>,
  markets?: ReadonlyMap<string, TokenMarketEvidence>,
): CampaignRow[] {
  return campaigns.map((campaign) => {
    const cached = cachedRecords?.get(campaign.id) ?? null
    const eligibility = resolveEligibility(campaign, identity, cached, now)
    const tx = resolveTransaction(campaign, identity, cached)
    const claimCost = assessClaimCost(campaign)
    const market = campaignMarket(campaign, markets)
    const derivedLabel = deriveLabel(campaign, eligibility, tx, now)
    // Gas is separate; live readiness still requires free distribution and fresh token market evidence.
    const meetsFreeCriterion = claimCost.status === 'free_distribution' && hasCampaignMarket(campaign, market, now)
    const label = campaign.origin !== 'demo' && derivedLabel === 'ready' && !meetsFreeCriterion ? 'unverified' : derivedLabel
    return {
      campaign,
      network: getNetwork(campaign.chainId),
      eligibility,
      claimCost,
      market,
      tx,
      label,
      action: resolveAction(label, campaign, tx),
      stale: campaign.foundIn.every((sourceId) => staleSourceIds.has(sourceId)),
      eligibilityStale: campaign.origin !== 'demo' && cached !== null &&
        isRecordMatchingIdentity(cached, identity, campaign) && cached.eligibility.checkedAt !== null &&
        !isEligibilityFresh(campaign, cached.eligibility, now),
      watched: watched.has(campaign.id),
    }
  })
}

/** Ringkasan status terpisah di bawah label: eligibility + transaksi bila ada. */
export function statusSubtext(row: CampaignRow): string {
  const parts = [`Eligibility: ${ELIGIBILITY_TEXT[row.eligibility.status].toLowerCase()}`]
  if (row.eligibilityStale) parts.push('Hasil eligibility usang')
  if (row.campaign.origin === 'live') parts.push(row.claimCost.status === 'free_distribution' ? 'Token gratis · gas terpisah' : 'Biaya distribusi belum terverifikasi')
  if (row.tx !== null) parts.push(`Tx: ${TX_TEXT[row.tx.status].toLowerCase()}`)
  return parts.join(' · ')
}
