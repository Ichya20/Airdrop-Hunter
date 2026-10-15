import { demoEligibility } from '../../demo/eligibility'
import type { Campaign, EligibilityResult, Identity } from '../../domain/types'
import { isRecordMatchingIdentity } from '../../storage/keys'
import type { StoredScanRecord } from '../../storage/types'
import { isAddress } from 'viem'
import type { EligibilityAdapter, EligibilityCheckOptions } from './types'
import { createUniEligibilityAdapter } from './uni'

export type { EligibilityAdapter, EligibilityCheckOptions } from './types'
export { createUniEligibilityAdapter } from './uni'

export const ELIGIBILITY_TTL_MS = 5 * 60 * 1000

const adapters: readonly EligibilityAdapter[] = [createUniEligibilityAdapter()]

export function getEligibilityAdapter(campaign: Campaign): EligibilityAdapter | null {
  return adapters.find((adapter) => adapter.supports(campaign)) ?? null
}

export function isEligibilityFresh(campaign: Campaign, result: EligibilityResult, now = Date.now()): boolean {
  const adapter = getEligibilityAdapter(campaign)
  if (!adapter || result.rule !== adapter.rule || !result.checkedAt || !Number.isFinite(now)) return false
  const checkedAt = Date.parse(result.checkedAt)
  if (!Number.isFinite(checkedAt) || new Date(checkedAt).toISOString() !== result.checkedAt) return false
  const age = now - checkedAt
  return age >= 0 && age < ELIGIBILITY_TTL_MS
}

export async function checkEligibility(
  campaign: Campaign,
  identity: Identity,
  options?: EligibilityCheckOptions,
): Promise<EligibilityResult> {
  const adapter = getEligibilityAdapter(campaign)
  if (!adapter || identity.kind === 'demo' || identity.kind === 'none') return resolveEligibility(campaign, identity)
  return adapter.checkEligibility(campaign, identity, options)
}

/**
 * Router eligibility per identitas.
 * - Akun DEMO: membaca fixture untuk campaign berlabel DEMO.
 * - Mode pantau / MetaMask: hanya memakai hasil adapter dikenal yang masih segar dan cocok identitas.
 * - Hasil satu identitas/wallet tidak pernah dipakai untuk identitas/wallet lain.
 */
export function resolveEligibility(
  campaign: Campaign,
  identity: Identity,
  cachedRecord?: StoredScanRecord | null,
  now = Date.now(),
): EligibilityResult {
  const adapter = getEligibilityAdapter(campaign)
  if (
    cachedRecord &&
    adapter &&
    (identity.kind === 'watch' || (identity.kind === 'metamask' && identity.chainId === campaign.chainId)) &&
    isAddress(identity.address, { strict: false }) &&
    cachedRecord.eligibility.rule === adapter.rule &&
    isRecordMatchingIdentity(cachedRecord, identity, campaign)
  ) {
    if (cachedRecord.eligibility.status === 'unknown') return cachedRecord.eligibility
    if (isEligibilityFresh(campaign, cachedRecord.eligibility, now)) return cachedRecord.eligibility
    return {
      ...cachedRecord.eligibility,
      status: 'unknown',
      reason: 'Hasil eligibility usang atau waktu pemeriksaan tidak valid. Periksa ulang proof dengan kontrak resmi.',
    }
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
            : adapter
              ? 'Masukkan JSON proof publik untuk memeriksa eligibility alamat pantau melalui kontrak resmi.'
              : 'Mekanisme pemeriksaan kelayakan untuk campaign ini belum didukung.',
        rule: adapter?.rule ?? null,
        source: adapter?.source ?? 'Belum ada adapter eligibility untuk campaign ini',
        checkedAt: null,
      }
    case 'metamask':
      return {
        status: 'unknown',
        reason:
          campaign.origin === 'demo'
            ? 'Data DEMO hanya memiliki contoh kelayakan untuk Akun DEMO. Wallet MetaMask ini dipisahkan dari data fixture.'
            : adapter
              ? identity.chainId === campaign.chainId
                ? 'Masukkan JSON proof publik untuk memeriksa eligibility wallet melalui kontrak resmi.'
                : 'Ganti jaringan MetaMask ke Ethereum Mainnet (chain ID 1) sebelum pemeriksaan UNI.'
              : 'Mekanisme pemeriksaan kelayakan resmi untuk campaign ini belum didukung.',
        rule: adapter?.rule ?? null,
        source: adapter?.source ?? 'MetaMask terhubung · adapter campaign belum tersedia',
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
