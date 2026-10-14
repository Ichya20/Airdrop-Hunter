import type { Campaign, EligibilityResult, TxRecord } from '../domain/types'
import { DEMO_ELIGIBILITY, DEMO_TRANSACTIONS } from './fixtures'

/** Kelayakan fixture untuk Akun DEMO. Waktu cek mengikuti waktu sumber DEMO terakhir berhasil. */
export function demoEligibility(campaign: Campaign): EligibilityResult {
  const fixture = DEMO_ELIGIBILITY.get(campaign.id)
  if (!fixture) {
    return {
      status: 'unknown',
      reason: 'Tidak ada data fixture untuk campaign ini.',
      rule: null,
      source: 'Fixture DEMO',
      checkedAt: campaign.checkedAt,
    }
  }
  return {
    status: fixture.status,
    reason: fixture.reason,
    rule: fixture.rule,
    source: 'Fixture DEMO',
    checkedAt: campaign.checkedAt,
  }
}

/** Riwayat transaksi fixture untuk Akun DEMO. Tidak ada hash nyata. */
export function demoTransaction(campaign: Campaign): TxRecord | null {
  return DEMO_TRANSACTIONS.get(campaign.id) ?? null
}
