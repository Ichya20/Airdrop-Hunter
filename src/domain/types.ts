/** Status campaign dari sisi sumber, terpisah dari kelayakan wallet. */
export type CampaignStatus = 'opportunity' | 'claim_open' | 'ended'

/** Kelayakan per alamat. `unknown` dipakai untuk data kosong, gagal, atau belum didukung. */
export type EligibilityStatus = 'unknown' | 'eligible' | 'ineligible' | 'needs_tasks'

/** Status transaksi klaim per alamat. */
export type TxStatus = 'not_sent' | 'pending' | 'confirmed' | 'failed'

/** Asal data. Selalu ditampilkan sebagai label terpisah. */
export type DataOrigin = 'demo' | 'testnet' | 'live'

export type CampaignKind = 'token' | 'nft' | 'points' | 'direct_distribution'

/** Cara klaim menurut sumber resmi. */
export type ClaimMethod = 'contract' | 'official_site' | 'direct_distribution' | 'unknown'

/** Label gabungan yang tampil di dashboard. */
export type DashboardLabel =
  | 'ready'
  | 'opportunity'
  | 'unverified'
  | 'ineligible'
  | 'claimed'
  | 'ended'

export type HexAddress = `0x${string}`

/** Alamat kontrak selalu disimpan bersama chain ID agar tidak tertukar antarjaringan. */
export interface ContractRef {
  chainId: number
  address: HexAddress
}

export interface Campaign {
  /** ID ternormalisasi: `${chainId}:${slug proyek}:${slug nama}`. */
  id: string
  name: string
  project: string
  kind: CampaignKind
  chainId: number
  status: CampaignStatus
  origin: DataOrigin
  /** ID sumber yang memuat campaign ini (setelah dedupe bisa lebih dari satu). */
  foundIn: string[]
  officialUrl: string | null
  checkerUrl: string | null
  sourceVerified: boolean
  sourceEvidence: string
  /** ISO 8601. `null` berarti belum diketahui, bukan terbuka selamanya. */
  deadline: string | null
  requirements: string[]
  allocation: string | null
  claimMethod: ClaimMethod
  contract: ContractRef | null
  summary: string
  /** Waktu sumber terakhir berhasil mengembalikan campaign ini. */
  checkedAt: string
  /** Versi adapter/aturan yang menghasilkan data ini. */
  adapterVersion: string
}

export interface EligibilityResult {
  status: EligibilityStatus
  reason: string
  /** Aturan atau versi adapter yang dipakai; `null` bila belum ada mekanisme. */
  rule: string | null
  source: string
  checkedAt: string | null
}

export interface TxRecord {
  status: TxStatus
  /** Hash transaksi. Fixture DEMO selalu `null` karena tidak ada transaksi nyata. */
  hash: HexAddress | null
  /** Bukti klaim/reward dari adapter. Wajib ada agar status terkonfirmasi diakui. */
  proof: string | null
  updatedAt: string | null
  note: string
}

/**
 * Identitas lokal yang sedang dilihat.
 * Tahap 2 menambah `{ kind: 'metamask'; address: HexAddress; chainId: number }`.
 */
export type Identity =
  | { kind: 'none' }
  | { kind: 'demo' }
  | { kind: 'watch'; address: HexAddress }
  | { kind: 'metamask'; address: HexAddress; chainId: number }
