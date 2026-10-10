import { demoTransaction } from '../../demo/eligibility'
import type { Campaign, Identity, TxRecord } from '../../domain/types'

/**
 * Riwayat transaksi klaim untuk identitas aktif.
 * Tahap 1: hanya fixture Akun DEMO. Tahap 2 membaca riwayat lokal per alamat + chain ID,
 * Tahap 5 menambah receipt dan bukti event dari claim adapter.
 */
export function resolveTransaction(campaign: Campaign, identity: Identity): TxRecord | null {
  if (identity.kind === 'demo' && campaign.origin === 'demo') return demoTransaction(campaign)
  return null
}
