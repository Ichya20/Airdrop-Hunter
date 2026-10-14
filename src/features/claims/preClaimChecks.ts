import { getClaimAdapter } from '../../adapters/claims'
import { shortenAddress } from '../../domain/address'
import { formatDateTime } from '../../domain/format'
import { getNetwork } from '../../domain/networks'
import { ELIGIBILITY_TEXT, isEnded } from '../../domain/status'
import type { Identity } from '../../domain/types'
import type { CampaignRow } from '../dashboard/rows'

export type CheckState = 'ok' | 'warn' | 'fail'

export interface PreClaimCheck {
  label: string
  state: CheckState
  text: string
}

export function buildChecks(row: CampaignRow, identity: Identity, now: number): PreClaimCheck[] {
  const { campaign, eligibility, network, tx } = row
  const adapter = getClaimAdapter(campaign)
  const checks: PreClaimCheck[] = []

  if (identity.kind === 'metamask') {
    checks.push({
      label: 'Akun pengirim',
      state: 'ok',
      text: `MetaMask terhubung (${shortenAddress(identity.address)}).`,
    })
  } else if (identity.kind === 'demo') {
    checks.push({ label: 'Akun pengirim', state: 'warn', text: 'Akun DEMO (fixture), bukan akun MetaMask.' })
  } else if (identity.kind === 'watch') {
    checks.push({
      label: 'Akun pengirim',
      state: 'fail',
      text: 'Mode pantau hanya membaca. Klaim harus melalui MetaMask Chrome extension di laptop.',
    })
  } else {
    checks.push({ label: 'Akun pengirim', state: 'fail', text: 'Belum ada akun yang dipilih.' })
  }

  if (identity.kind === 'metamask') {
    if (identity.chainId === network.chainId) {
      checks.push({
        label: 'Jaringan',
        state: 'ok',
        text: `Wallet berada di jaringan yang sesuai: ${network.name} (chain ID ${network.chainId}).`,
      })
    } else {
      const walletNet = getNetwork(identity.chainId)
      checks.push({
        label: 'Jaringan',
        state: 'fail',
        text: `Jaringan salah: wallet di ${walletNet.name} (chain ID ${identity.chainId}), sedangkan campaign membutuhkan ${network.name} (chain ID ${network.chainId}).`,
      })
    }
  } else {
    checks.push({
      label: 'Jaringan',
      state: 'warn',
      text: `Campaign di ${network.name} (chain ID ${network.chainId}). Hubungkan MetaMask untuk memeriksa kesesuaian jaringan wallet.`,
    })
  }

  if (isEnded(campaign, now)) {
    checks.push({ label: 'Tenggat', state: 'fail', text: 'Tenggat sudah lewat.' })
  } else if (campaign.deadline === null) {
    checks.push({ label: 'Tenggat', state: 'warn', text: 'Belum diketahui. Cek ulang di sumber resmi.' })
  } else {
    checks.push({ label: 'Tenggat', state: 'ok', text: `Berlaku sampai ${formatDateTime(campaign.deadline)}.` })
  }

  checks.push({
    label: 'Eligibility',
    state: eligibility.status === 'eligible' ? 'ok' : 'fail',
    text: `${ELIGIBILITY_TEXT[eligibility.status]} menurut ${eligibility.source}.`,
  })

  checks.push({
    label: 'Sumber',
    state: campaign.sourceVerified ? 'ok' : 'fail',
    text: campaign.sourceVerified ? `Diperiksa: ${campaign.sourceEvidence}` : 'Sumber resmi belum diverifikasi.',
  })

  checks.push({
    label: 'Transaksi tertunda',
    state: tx !== null && tx.status === 'pending' ? 'fail' : 'ok',
    text:
      tx !== null && tx.status === 'pending'
        ? 'Masih ada transaksi menunggu konfirmasi; pengiriman baru dicegah.'
        : 'Tidak ada transaksi yang menunggu.',
  })

  checks.push({
    label: 'Claim adapter',
    state: adapter ? 'ok' : 'fail',
    text: adapter
      ? `Adapter ${adapter.id} (${adapter.environment}).`
      : campaign.origin === 'demo'
        ? 'Tidak tersedia. Fixture DEMO tidak memiliki jalur klaim; klaim testnet dibuat di tahap 5.'
        : 'Belum ada adapter untuk campaign ini; gunakan situs klaim resmi.',
  })

  return checks
}
