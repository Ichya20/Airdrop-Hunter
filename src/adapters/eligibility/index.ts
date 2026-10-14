import { demoEligibility } from '../../demo/eligibility'
import type { Campaign, EligibilityResult, Identity } from '../../domain/types'
import { isRecordMatchingIdentity } from '../../storage/keys'
import type { StoredScanRecord } from '../../storage/types'

/**
 * Router eligibility per identitas.
 * - Akun DEMO: membaca fixture untuk campaign berlabel DEMO.
 * - Mode pantau / MetaMask: membaca hasil tersimpan per alamat + chain ID + campaign ID + versi adapter
 *   bila tersedia dan berasal dari sumber non-demo; selain itu `unknown` dengan alasan jelas.
 * - Hasil satu identitas/wallet tidak pernah dipakai untuk identitas/wallet lain.
 */
export function resolveEligibility(
  campaign: Campaign,
  identity: Identity,
  cachedRecord?: StoredScanRecord | null,
): EligibilityResult {
  if (
    cachedRecord &&
    campaign.origin !== 'demo' &&
    isRecordMatchingIdentity(cachedRecord, identity, campaign)
  ) {
    return cachedRecord.eligibility
  }

  switch (identity.kind) {
    case 'none':
      return {
        status: 'unknown',
        reason: 'Belum ada akun. Hubungkan MetaMask, pilih Akun DEMO, atau masukkan alamat publik untuk dipantau.',
        rule: null,
        source: 'Tidak ada pemeriksaan',
        checkedAt: null,
      }
    case 'watch':
      return {
        status: 'unknown',
        reason:
          campaign.origin === 'demo'
            ? 'Data DEMO hanya memiliki contoh kelayakan untuk Akun DEMO. Alamat pantau ini belum diperiksa.'
            : 'Mekanisme pemeriksaan kelayakan untuk campaign ini belum didukung.',
        rule: null,
        source: 'Belum ada adapter eligibility (tahap 4)',
        checkedAt: null,
      }
    case 'metamask':
      return {
        status: 'unknown',
        reason:
          campaign.origin === 'demo'
            ? 'Data DEMO hanya memiliki contoh kelayakan untuk Akun DEMO. Wallet MetaMask ini dipisahkan dari data fixture.'
            : 'Mekanisme pemeriksaan kelayakan resmi untuk campaign ini akan diaktifkan di tahap 4.',
        rule: null,
        source: 'MetaMask terhubung · menunggu adapter tahap 4',
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
