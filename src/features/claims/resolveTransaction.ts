import { demoTransaction } from '../../demo/eligibility'
import type { Campaign, Identity, TxRecord } from '../../domain/types'
import { isRecordMatchingIdentity } from '../../storage/keys'
import type { StoredScanRecord } from '../../storage/types'

/**
 * Riwayat transaksi klaim untuk identitas aktif.
 * Tahap 2 membaca riwayat lokal per alamat + chain ID + campaign ID + versi adapter
 * tanpa pernah mencampur catatan antar-wallet.
 */
export function resolveTransaction(
  campaign: Campaign,
  identity: Identity,
  cachedRecord?: StoredScanRecord | null,
): TxRecord | null {
  if (identity.kind === 'demo' && campaign.origin === 'demo') {
    return demoTransaction(campaign)
  }
  if (
    cachedRecord &&
    campaign.origin !== 'demo' &&
    isRecordMatchingIdentity(cachedRecord, identity, campaign)
  ) {
    return cachedRecord.tx
  }
  return null
}
