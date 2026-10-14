import type { Campaign, Identity } from '../domain/types'
import { walletAccountKey } from '../features/wallet/identity'
import type { StoredScanRecord } from './types'

export interface ScanRecordKeyParts {
  addressScope: string
  chainId: number
  campaignId: string
  adapterVersion: string
}

/**
 * Buat kunci penyimpanan lokal per alamat + chain ID + campaign ID + versi adapter (R9).
 * Data satu wallet tidak pernah disimpan atau dibaca menggunakan kunci wallet lain.
 */
export function buildScanRecordKey(params: {
  identity: Identity
  chainId: number
  campaignId: string
  adapterVersion: string
}): string {
  const addressScope = walletAccountKey(params.identity)
  return formatScanRecordKey({
    addressScope,
    chainId: params.chainId,
    campaignId: params.campaignId,
    adapterVersion: params.adapterVersion,
  })
}

export function formatScanRecordKey(parts: ScanRecordKeyParts): string {
  return `${parts.addressScope}::${parts.chainId}::${parts.campaignId}::${parts.adapterVersion}`
}

export function parseScanRecordKey(key: string): ScanRecordKeyParts | null {
  const segments = key.split('::')
  if (segments.length !== 4) return null
  const [addressScope, chainIdRaw, campaignId, adapterVersion] = segments
  const chainId = Number.parseInt(chainIdRaw, 10)
  if (!addressScope || !Number.isInteger(chainId) || chainId <= 0 || !campaignId || !adapterVersion) {
    return null
  }
  return { addressScope, chainId, campaignId, adapterVersion }
}

/**
 * Pastikan catatan scan yang dibaca dari storage benar-benar cocok dengan
 * identitas aktif, chain ID campaign, ID campaign, dan versi adapter saat ini.
 */
export function isRecordMatchingIdentity(
  record: StoredScanRecord,
  identity: Identity,
  campaign: Pick<Campaign, 'id' | 'chainId' | 'adapterVersion'>,
): boolean {
  const expectedScope = walletAccountKey(identity)
  if (expectedScope === 'none') return false
  return (
    record.addressScope === expectedScope &&
    record.chainId === campaign.chainId &&
    record.campaignId === campaign.id &&
    record.adapterVersion === campaign.adapterVersion
  )
}
