import type { Campaign } from '../../domain/types'

/**
 * Kontrak claim adapter untuk Tahap 5. Adapter harus memverifikasi kontrak, ABI, fungsi,
 * argumen, penerima, dan jumlah; mensimulasikan dengan akun pengirim; lalu meminta
 * konfirmasi MetaMask. Tidak boleh meminta unlimited approval, Permit, atau transfer aset lain.
 */
export interface ClaimAdapter {
  id: string
  version: string
  /** Campaign (ID ternormalisasi, sudah memuat chain ID) yang didukung adapter ini. */
  campaignIds: readonly string[]
  /** Hanya konfigurasi testnet yang boleh didaftarkan sebelum integrasi live diperiksa. */
  environment: 'testnet' | 'live'
}

const REGISTRY: readonly ClaimAdapter[] = []

/**
 * Tahap 1 belum memiliki claim adapter. Fixture DEMO tidak pernah mendapat jalur klaim,
 * sehingga campaign demo selalu menghasilkan `null`.
 */
export function getClaimAdapter(campaign: Campaign): ClaimAdapter | null {
  if (campaign.origin === 'demo') return null
  return REGISTRY.find((adapter) => adapter.campaignIds.includes(campaign.id)) ?? null
}
