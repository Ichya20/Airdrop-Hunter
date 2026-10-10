import { demoEligibility } from '../../demo/eligibility'
import type { Campaign, EligibilityResult, Identity } from '../../domain/types'

/**
 * Router eligibility per identitas.
 * Tahap 1: hanya Akun DEMO yang memiliki data (fixture). Identitas lain selalu `unknown`
 * dengan alasan yang jelas; hasil satu identitas tidak pernah dipakai untuk identitas lain.
 * Tahap 4 menambah adapter resmi (API, proof/snapshot, atau pembacaan kontrak).
 */
export function resolveEligibility(campaign: Campaign, identity: Identity): EligibilityResult {
  switch (identity.kind) {
    case 'none':
      return {
        status: 'unknown',
        reason: 'Belum ada akun. Pilih Akun DEMO atau masukkan alamat publik untuk dipantau.',
        rule: null,
        source: 'Tidak ada pemeriksaan',
        checkedAt: null,
      }
    case 'watch':
      return {
        status: 'unknown',
        reason:
          campaign.origin === 'demo'
            ? 'Data DEMO hanya memiliki contoh kelayakan untuk Akun DEMO. Alamat ini belum diperiksa.'
            : 'Mekanisme pemeriksaan kelayakan untuk campaign ini belum didukung.',
        rule: null,
        source: 'Belum ada adapter eligibility (tahap 4)',
        checkedAt: null,
      }
    case 'demo':
      if (campaign.origin !== 'demo') {
        return {
          status: 'unknown',
          reason: 'Akun DEMO tidak dipakai untuk data non-demo.',
          rule: null,
          source: 'Tidak ada pemeriksaan',
          checkedAt: null,
        }
      }
      return demoEligibility(campaign)
  }
}
