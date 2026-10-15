import type {
  Campaign,
  CampaignKind,
  CampaignStatus,
  DashboardLabel,
  DataOrigin,
  EligibilityResult,
  EligibilityStatus,
  TxRecord,
  TxStatus,
} from './types'

export type Tone = 'accent' | 'amber' | 'info' | 'danger' | 'teal' | 'muted'

export interface LabelMeta {
  text: string
  tone: Tone
  /** Urutan prioritas tampilan (kecil = lebih dulu). */
  priority: number
}

export const LABEL_META: Record<DashboardLabel, LabelMeta> = {
  ready: { text: 'Siap diklaim', tone: 'accent', priority: 0 },
  unverified: { text: 'Belum terverifikasi', tone: 'info', priority: 1 },
  opportunity: { text: 'Peluang', tone: 'amber', priority: 2 },
  ineligible: { text: 'Tidak memenuhi syarat', tone: 'danger', priority: 3 },
  claimed: { text: 'Sudah diklaim', tone: 'teal', priority: 4 },
  ended: { text: 'Berakhir', tone: 'muted', priority: 5 },
}

export const LABEL_ORDER: readonly DashboardLabel[] = [
  'ready',
  'unverified',
  'opportunity',
  'ineligible',
  'claimed',
  'ended',
]

export const CAMPAIGN_STATUS_TEXT: Record<CampaignStatus, string> = {
  opportunity: 'Peluang',
  claim_open: 'Klaim terbuka',
  ended: 'Berakhir',
}

export const ELIGIBILITY_TEXT: Record<EligibilityStatus, string> = {
  unknown: 'Belum diketahui',
  eligible: 'Memenuhi syarat',
  ineligible: 'Tidak memenuhi syarat',
  needs_tasks: 'Perlu tugas',
}

export const TX_TEXT: Record<TxStatus, string> = {
  not_sent: 'Belum dikirim',
  pending: 'Menunggu konfirmasi',
  confirmed: 'Terkonfirmasi',
  failed: 'Gagal',
}

export const ORIGIN_TEXT: Record<DataOrigin, string> = {
  demo: 'DEMO',
  testnet: 'TESTNET',
  live: 'LIVE',
}

export const KIND_TEXT: Record<CampaignKind, string> = {
  token: 'Token',
  nft: 'NFT',
  points: 'Poin',
  direct_distribution: 'Distribusi langsung',
}

export function isEnded(campaign: Pick<Campaign, 'status' | 'deadline'>, now: number): boolean {
  if (campaign.status === 'ended') return true
  if (campaign.deadline === null) return false
  const deadline = Date.parse(campaign.deadline)
  return Number.isFinite(deadline) && deadline <= now
}

/** Klaim dianggap terkonfirmasi hanya jika ada receipt sukses dan bukti dari adapter. */
export function isClaimConfirmed(tx: TxRecord | null): boolean {
  return tx !== null && tx.status === 'confirmed' && tx.proof !== null
}

/** Gabungkan status campaign, eligibility, transaksi, dan verifikasi sumber menjadi satu label. */
export function deriveLabel(
  campaign: Campaign,
  eligibility: EligibilityResult,
  tx: TxRecord | null,
  now: number,
): DashboardLabel {
  if (isClaimConfirmed(tx)) return 'claimed'
  if (isEnded(campaign, now)) return 'ended'
  if (eligibility.status === 'ineligible') return 'ineligible'
  if (!campaign.sourceVerified) return 'unverified'
  if (campaign.status === 'claim_open') {
    if (eligibility.status === 'eligible') return 'ready'
    if (eligibility.status === 'needs_tasks') return 'opportunity'
    return 'unverified'
  }
  return 'opportunity'
}

export type ActionKind =
  | 'claim'
  | 'claim_site'
  | 'requirements'
  | 'check'
  | 'reason'
  | 'tx'
  | 'archive'

export interface PrimaryAction {
  kind: ActionKind
  text: string
}

export function resolveAction(
  label: DashboardLabel,
  campaign: Campaign,
  tx: TxRecord | null,
): PrimaryAction {
  switch (label) {
    case 'ready':
      if (tx !== null && (tx.status === 'pending' || tx.status === 'confirmed')) {
        return { kind: 'tx', text: 'Lihat transaksi' }
      }
      if (campaign.claimMethod === 'contract') return { kind: 'claim', text: 'Klaim' }
      if (campaign.claimMethod === 'official_site') return { kind: 'claim_site', text: 'Situs klaim' }
      return { kind: 'reason', text: 'Lihat detail' }
    case 'opportunity':
      return { kind: 'requirements', text: 'Lihat syarat' }
    case 'unverified':
      return { kind: 'check', text: 'Periksa' }
    case 'ineligible':
      return { kind: 'reason', text: 'Lihat alasan' }
    case 'claimed':
      return { kind: 'tx', text: 'Lihat transaksi' }
    case 'ended':
      return { kind: 'archive', text: 'Lihat arsip' }
  }
}

/** Kalimat singkat yang menjelaskan arti label untuk identitas aktif. */
export function explainLabel(
  label: DashboardLabel,
  campaign: Campaign,
  eligibility: EligibilityResult,
  identityName: string,
): string {
  switch (label) {
    case 'ready':
      return `${identityName} tercatat memenuhi syarat dan klaim masih terbuka menurut sumber. Periksa ulang sebelum klaim.`
    case 'opportunity':
      return eligibility.status === 'needs_tasks'
        ? 'Ada tugas yang belum selesai. Ikuti syarat dari sumber resmi; tidak ada jaminan hadiah.'
        : 'Campaign masih berupa peluang. Ikuti syarat dari sumber resmi; tidak ada jaminan hadiah.'
    case 'unverified':
      return campaign.sourceVerified
        ? `Kelayakan belum diketahui: ${eligibility.reason}`
        : 'Sumber resmi belum dikonfirmasi. Jangan menghubungkan wallet ke tautan yang belum diperiksa.'
    case 'ineligible':
      return `Tidak memenuhi syarat menurut ${eligibility.source}: ${eligibility.reason}`
    case 'claimed':
      return 'Klaim tercatat terkonfirmasi dengan bukti dari adapter.'
    case 'ended':
      if (campaign.sourceKind === 'local-archive') {
        return 'Campaign diarsipkan lokal dalam aplikasi dan klaim dinonaktifkan. Eligibility alamat serta status kontrak ditampilkan terpisah.'
      }
      return campaign.status === 'ended'
        ? 'Campaign sudah berakhir dan ditampilkan sebagai arsip. Klaim dinonaktifkan.'
        : 'Tenggat sudah lewat walaupun sumber masih mencatat klaim terbuka. Ditampilkan sebagai arsip; klaim dinonaktifkan.'
  }
}
