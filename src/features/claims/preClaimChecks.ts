import { getClaimAdapter } from '../../adapters/claims'
import { isEligibilityFresh } from '../../adapters/eligibility'
import { assessClaimCost } from '../../domain/claimCost'
import { shortenAddress } from '../../domain/address'
import { formatDateTime } from '../../domain/format'
import { getNetwork } from '../../domain/networks'
import { ELIGIBILITY_TEXT, isEnded } from '../../domain/status'
import type { Identity } from '../../domain/types'
import type { CampaignRow } from '../dashboard/rows'
import { hasCampaignMarket } from '../dashboard/campaignMarket'

export type CheckState = 'ok' | 'warn' | 'fail'

export interface PreClaimCheck {
  label: string
  state: CheckState
  text: string
}

export function buildChecks(row: CampaignRow, identity: Identity, now: number): PreClaimCheck[] {
  const { campaign, network, tx } = row
  const eligibility = row.eligibility
  const eligibilityCurrent = campaign.origin === 'demo' || isEligibilityFresh(campaign, eligibility, now)
  const adapter = getClaimAdapter(campaign)
  const checks: PreClaimCheck[] = []
  const claimCost = assessClaimCost(campaign)
  checks.push({
    label: 'Distribusi token gratis',
    state: campaign.origin === 'demo' ? 'warn' : claimCost.status === 'free_distribution' ? 'ok' : 'fail',
    text: claimCost.reason,
  })
  checks.push({
    label: 'Nilai pasar token',
    state: campaign.origin === 'demo' ? 'warn' : hasCampaignMarket(campaign, row.market, now) ? 'ok' : 'fail',
    text: hasCampaignMarket(campaign, row.market, now)
      ? 'Alamat token dan jaringan cocok dengan harga USD serta likuiditas positif yang masih segar. Ini belum menjamin hasil penjualan.'
      : 'Harga dan likuiditas pasar token belum tersedia atau sudah usang; token belum memenuhi kriteria airdrop bernilai.',
  })
  checks.push({
    label: 'Gas jaringan',
    state: 'warn',
    text: claimCost.gas === 'user_pays_gas'
      ? 'Gas dibayar pengguna. Biaya gas boleh terpisah dari distribusi token gratis; estimasi transaksi belum aktif.'
      : 'Kebutuhan dan nominal gas belum diketahui. Gas tidak menentukan apakah distribusi token gratis.',
  })

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
    state: eligibilityCurrent && eligibility.status === 'eligible' ? 'ok' : 'fail',
    text: eligibilityCurrent
      ? `${ELIGIBILITY_TEXT[eligibility.status]} menurut ${eligibility.source}. ${eligibility.reason}`
      : 'Eligibility belum diverifikasi atau hasil sudah usang. Periksa ulang melalui sumber resmi.',
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
