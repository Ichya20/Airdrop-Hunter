import { resolveEligibility } from '../../adapters/eligibility'
import { getNetwork, type NetworkInfo } from '../../domain/networks'
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
import { resolveTransaction } from '../claims/resolveTransaction'

/** Satu baris dashboard: campaign + status terpisah untuk identitas aktif + label turunan. */
export interface CampaignRow {
  campaign: Campaign
  network: NetworkInfo
  eligibility: EligibilityResult
  tx: TxRecord | null
  label: DashboardLabel
  action: PrimaryAction
  /** Semua sumber campaign ini gagal pada percobaan terakhir; data berasal dari checkpoint. */
  stale: boolean
  watched: boolean
}

export function buildRows(
  campaigns: readonly Campaign[],
  identity: Identity,
  now: number,
  staleSourceIds: ReadonlySet<string>,
  watched: ReadonlySet<string>,
  cachedRecords?: ReadonlyMap<string, StoredScanRecord>,
): CampaignRow[] {
  return campaigns.map((campaign) => {
    const cached = cachedRecords?.get(campaign.id) ?? null
    const eligibility = resolveEligibility(campaign, identity, cached)
    const tx = resolveTransaction(campaign, identity, cached)
    const label = deriveLabel(campaign, eligibility, tx, now)
    return {
      campaign,
      network: getNetwork(campaign.chainId),
      eligibility,
      tx,
      label,
      action: resolveAction(label, campaign, tx),
      stale: campaign.foundIn.every((sourceId) => staleSourceIds.has(sourceId)),
      watched: watched.has(campaign.id),
    }
  })
}

/** Ringkasan status terpisah di bawah label: eligibility + transaksi bila ada. */
export function statusSubtext(row: CampaignRow): string {
  const parts = [`Eligibility: ${ELIGIBILITY_TEXT[row.eligibility.status].toLowerCase()}`]
  if (row.tx !== null) parts.push(`Tx: ${TX_TEXT[row.tx.status].toLowerCase()}`)
  return parts.join(' · ')
}
