/**
 * FIXTURE DEMO — bukan campaign nyata.
 * Nama proyek fiktif, domain memakai TLD `.example` (RFC 2606) yang tidak dapat dibuka,
 * dan tidak ada alamat kontrak. Data ini tidak boleh dipakai untuk klaim atau transaksi.
 */
import { campaignId, type RawCampaign } from '../domain/normalize'
import type { EligibilityStatus, TxRecord } from '../domain/types'

export const DEMO_ADAPTER_VERSION = 'demo-fixture-1'

export interface DemoSourceMeta {
  id: string
  name: string
  description: string
  baseLatencyMs: number
}

export const DEMO_SOURCE_META: readonly DemoSourceMeta[] = [
  {
    id: 'demo-feed-alpha',
    name: 'Feed DEMO Alpha',
    description: 'Fixture daftar campaign umum',
    baseLatencyMs: 700,
  },
  {
    id: 'demo-feed-beta',
    name: 'Feed DEMO Beta',
    description: 'Fixture agregator (memuat satu duplikat)',
    baseLatencyMs: 1100,
  },
  {
    id: 'demo-checker-gamma',
    name: 'Checker DEMO Gamma',
    description: 'Fixture checker poin dan testnet',
    baseLatencyMs: 1500,
  },
]

const DAY = 86_400_000

/** Tenggat relatif terhadap waktu scan, pukul 23.59 WIB (16.59 UTC). */
function daysFromNow(now: number, days: number): string {
  const date = new Date(now + days * DAY)
  date.setUTCHours(16, 59, 0, 0)
  return date.toISOString()
}

interface CampaignRef {
  project: string
  name: string
  chainId: number
}

const REF = {
  lumenfall: { project: 'Lumenfall', name: 'Lumenfall Bridge Drop', chainId: 8453 },
  kestrel: { project: 'Kestrel Swap', name: 'Kestrel Poin Musim 2', chainId: 42161 },
  mossgate: { project: 'Mossgate Lend', name: 'Mossgate Retro Drop', chainId: 1 },
  orbitwell: { project: 'Orbitwell', name: 'Orbitwell Points', chainId: 10 },
  quillstone: { project: 'Quillstone', name: 'Quillstone Genesis Pass', chainId: 1 },
  tidewire: { project: 'Tidewire', name: 'Tidewire Relay Drop', chainId: 8453 },
  harborlight: { project: 'Harborlight', name: 'Harborlight Vault Rewards', chainId: 42161 },
  fernhollow: { project: 'Fernhollow', name: 'Fernhollow Testnet Drop', chainId: 11155111 },
  cinderpath: { project: 'Cinderpath', name: 'Cinderpath Quest', chainId: 84532 },
  glintmark: { project: 'Glintmark', name: 'Glintmark Rewards', chainId: 137 },
  saltmeadow: { project: 'Saltmeadow DAO', name: 'Saltmeadow DAO Drop', chainId: 1 },
} satisfies Record<string, CampaignRef>

function idOf(ref: CampaignRef): string {
  return campaignId(ref.chainId, ref.project, ref.name)
}

const EVIDENCE = 'Fixture DEMO: meniru pengumuman resmi; tidak ada domain atau kontrak nyata.'

export interface DemoCampaignFixture {
  sourceId: string
  build: (now: number) => RawCampaign
}

export const DEMO_CAMPAIGNS: readonly DemoCampaignFixture[] = [
  {
    sourceId: 'demo-feed-alpha',
    build: (now) => ({
      ...REF.lumenfall,
      kind: 'token',
      status: 'claim_open',
      officialUrl: 'https://lumenfall.example/claim',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, 14),
      requirements: [
        'Bridge ke Base minimal sekali sebelum snapshot (fixture).',
        'Alamat tercantum di daftar alokasi fixture.',
      ],
      claimMethod: 'contract',
      summary: 'Contoh campaign token dengan klaim melalui kontrak. Dipakai untuk mencoba preview klaim tanpa transaksi.',
    }),
  },
  {
    sourceId: 'demo-feed-alpha',
    build: () => ({
      ...REF.kestrel,
      kind: 'points',
      status: 'opportunity',
      officialUrl: 'https://kestrel.example/points',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: null,
      requirements: [
        'Lakukan swap mingguan di Kestrel Swap (fixture).',
        'Hubungkan alamat ke dashboard poin resmi (fixture).',
      ],
      claimMethod: 'unknown',
      summary: 'Program poin tanpa jadwal distribusi. Tenggat belum diumumkan.',
    }),
  },
  {
    sourceId: 'demo-feed-alpha',
    build: (now) => ({
      ...REF.mossgate,
      kind: 'token',
      status: 'claim_open',
      officialUrl: 'https://mossgate.example',
      checkerUrl: 'https://mossgate.example/check',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, 2),
      requirements: ['Pernah menyetor aset di Mossgate Lend sebelum snapshot (fixture).'],
      claimMethod: 'contract',
      summary: 'Kelayakan hanya dapat dicek melalui checker resmi yang belum didukung adapter.',
    }),
  },
  {
    sourceId: 'demo-feed-alpha',
    build: (now) => ({
      ...REF.orbitwell,
      kind: 'points',
      status: 'opportunity',
      officialUrl: null,
      sourceVerified: false,
      sourceEvidence:
        'Hanya muncul di agregator; belum ada pengumuman resmi yang dapat diperiksa (fixture).',
      deadline: daysFromNow(now, 20),
      requirements: ['Menurut agregator: bridge ke OP Mainnet (belum dikonfirmasi sumber resmi).'],
      claimMethod: 'unknown',
      summary: 'Contoh campaign dengan sumber yang belum terverifikasi.',
    }),
  },
  {
    sourceId: 'demo-feed-alpha',
    build: (now) => ({
      ...REF.quillstone,
      kind: 'nft',
      status: 'ended',
      officialUrl: 'https://quillstone.example',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, -8),
      requirements: ['Memegang Quillstone Badge saat snapshot (fixture).'],
      claimMethod: 'contract',
      summary: 'Campaign NFT yang sudah berakhir; tampil sebagai arsip.',
    }),
  },
  {
    sourceId: 'demo-feed-beta',
    build: (now) => ({
      ...REF.tidewire,
      kind: 'token',
      status: 'claim_open',
      officialUrl: 'https://tidewire.example/claim',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, 30),
      requirements: [
        'Mengirim pesan lintas chain minimal 3 kali (fixture).',
        'Tidak termasuk daftar sybil (fixture).',
      ],
      claimMethod: 'contract',
      summary: 'Klaim terbuka, tetapi Akun DEMO tidak ada di snapshot fixture.',
    }),
  },
  {
    sourceId: 'demo-feed-beta',
    build: (now) => ({
      ...REF.harborlight,
      kind: 'token',
      status: 'claim_open',
      officialUrl: 'https://harborlight.example',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, 45),
      requirements: ['Menyetor ke vault Harborlight minimal 30 hari (fixture).'],
      claimMethod: 'contract',
      summary: 'Contoh klaim yang sudah terkonfirmasi untuk Akun DEMO.',
    }),
  },
  {
    sourceId: 'demo-feed-beta',
    build: (now) => ({
      ...REF.fernhollow,
      kind: 'token',
      status: 'claim_open',
      officialUrl: 'https://fernhollow.example/claim',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, 21),
      requirements: ['Menjalankan node testnet Fernhollow minimal 7 hari (fixture).'],
      claimMethod: 'official_site',
      summary: 'Campaign di Sepolia yang klaimnya hanya melalui situs resmi.',
    }),
  },
  {
    // Duplikat dari Feed DEMO Alpha untuk menguji deduplikasi: data terverifikasi diutamakan.
    sourceId: 'demo-feed-beta',
    build: (now) => ({
      ...REF.lumenfall,
      kind: 'token',
      status: 'claim_open',
      officialUrl: 'https://lumenfall.example/claim',
      sourceVerified: false,
      sourceEvidence: 'Salinan agregator (fixture).',
      deadline: daysFromNow(now, 14),
      requirements: ['Bridge ke Base (salinan agregator).'],
      claimMethod: 'contract',
    }),
  },
  {
    sourceId: 'demo-checker-gamma',
    build: (now) => ({
      ...REF.cinderpath,
      kind: 'points',
      status: 'opportunity',
      officialUrl: 'https://cinderpath.example/quests',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, 9),
      requirements: [
        'Selesaikan 5 quest testnet (fixture).',
        'Gunakan alamat yang sama di semua quest.',
      ],
      claimMethod: 'unknown',
      summary: 'Quest testnet di Base Sepolia. Progres quest tidak tersedia dari sumber.',
    }),
  },
  {
    sourceId: 'demo-checker-gamma',
    build: (now) => ({
      ...REF.glintmark,
      kind: 'token',
      status: 'claim_open',
      officialUrl: 'https://glintmark.example',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, 6),
      requirements: ['Memberikan likuiditas di Glintmark sebelum snapshot (fixture).'],
      claimMethod: 'contract',
      summary: 'Akun DEMO memiliki transaksi klaim yang masih menunggu konfirmasi.',
    }),
  },
  {
    sourceId: 'demo-checker-gamma',
    build: (now) => ({
      ...REF.saltmeadow,
      kind: 'token',
      // Sumber belum diperbarui: masih "klaim terbuka" walau tenggat sudah lewat.
      status: 'claim_open',
      officialUrl: 'https://saltmeadow.example',
      sourceVerified: true,
      sourceEvidence: EVIDENCE,
      deadline: daysFromNow(now, -40),
      requirements: ['Anggota DAO sebelum snapshot (fixture).'],
      claimMethod: 'official_site',
      summary: 'Sumber masih mencatat klaim terbuka, tetapi tenggat sudah lewat.',
    }),
  },
]

export interface DemoEligibilityFixture {
  status: EligibilityStatus
  reason: string
  rule: string | null
}

export const DEMO_ELIGIBILITY: ReadonlyMap<string, DemoEligibilityFixture> = new Map<string, DemoEligibilityFixture>([
  [idOf(REF.lumenfall), { status: 'eligible', reason: 'Akun DEMO ada di daftar alokasi fixture.', rule: 'fixture-allowlist v1' }],
  [idOf(REF.kestrel), { status: 'needs_tasks', reason: 'Tugas swap mingguan baru 2 dari 4 (fixture).', rule: 'fixture-tasks v1' }],
  [idOf(REF.mossgate), { status: 'unknown', reason: 'Checker resmi belum didukung adapter; periksa melalui checker resmi.', rule: null }],
  [idOf(REF.orbitwell), { status: 'unknown', reason: 'Sumber belum terverifikasi sehingga kelayakan tidak diperiksa.', rule: null }],
  [idOf(REF.quillstone), { status: 'eligible', reason: 'Tercatat di snapshot fixture; campaign sudah berakhir.', rule: 'fixture-snapshot v1' }],
  [idOf(REF.tidewire), { status: 'ineligible', reason: 'Akun DEMO tidak ada di snapshot fixture.', rule: 'fixture-snapshot v1' }],
  [idOf(REF.harborlight), { status: 'eligible', reason: 'Akun DEMO ada di daftar alokasi fixture.', rule: 'fixture-allowlist v1' }],
  [idOf(REF.fernhollow), { status: 'eligible', reason: 'Akun DEMO ada di daftar testnet fixture.', rule: 'fixture-allowlist v1' }],
  [idOf(REF.cinderpath), { status: 'unknown', reason: 'Progres quest tidak tersedia dari sumber fixture.', rule: null }],
  [idOf(REF.glintmark), { status: 'eligible', reason: 'Akun DEMO ada di daftar alokasi fixture.', rule: 'fixture-allowlist v1' }],
  [idOf(REF.saltmeadow), { status: 'unknown', reason: 'Tidak diperiksa karena tenggat sudah lewat.', rule: null }],
])

const LOADED_AT = Date.now()

export const DEMO_TRANSACTIONS: ReadonlyMap<string, TxRecord> = new Map<string, TxRecord>([
  [
    idOf(REF.harborlight),
    {
      status: 'confirmed',
      hash: null,
      proof: 'Receipt fixture DEMO: status sukses dan event Claimed tercatat (bukan transaksi nyata).',
      updatedAt: new Date(LOADED_AT - 3 * DAY).toISOString(),
      note: 'Fixture DEMO: tidak ada hash atau explorer nyata.',
    },
  ],
  [
    idOf(REF.glintmark),
    {
      status: 'pending',
      hash: null,
      proof: null,
      updatedAt: new Date(LOADED_AT - 20 * 60_000).toISOString(),
      note: 'Fixture DEMO: transaksi menunggu konfirmasi. Hash saja tidak berarti klaim berhasil.',
    },
  ],
])
