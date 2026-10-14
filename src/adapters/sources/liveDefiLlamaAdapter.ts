import { normalizeCampaign, type RawCampaign } from '../../domain/normalize'
import type { Campaign } from '../../domain/types'
import {
  createSourceRateLimiter,
  type SourceRateLimiter,
} from './rateLimit'
import { SourceError, type SourceAdapter } from './types'

export const LIVE_DEFILLAMA_SOURCE_ID = 'defillama-live'
export const LIVE_DEFILLAMA_ADAPTER_VERSION = 'defillama-live-1.1.0'
export const DEFILLAMA_PROTOCOLS_ENDPOINT = 'https://api.llama.fi/protocols'

/** Pemetaan nama jaringan pada respons DefiLlama ke chainId EVM yang didukung aplikasi. */
const DEFILLAMA_CHAIN_TO_ID: Readonly<Record<string, number>> = {
  Ethereum: 1,
  Optimism: 10,
  'OP Mainnet': 10,
  Polygon: 137,
  'Polygon PoS': 137,
  Base: 8453,
  Arbitrum: 42161,
  'Arbitrum One': 42161,
}

export interface DefiLlamaProtocolItem {
  id?: string
  name: string
  slug?: string
  symbol?: string | null
  url?: string | null
  description?: string | null
  chain?: string | null
  chains?: readonly string[]
  category?: string | null
  tvl?: number | null
  listedAt?: number | null
}

/**
 * Referensi historis yang tersimpan lokal di kode, bukan hasil pemeriksaan klaim oleh API.
 * Status `ended` menjaga arsip tetap nonaktif di aplikasi; status ini tidak menyatakan
 * hasil pemeriksaan eligibility wallet atau keadaan kontrak saat ini.
 */
export const LOCAL_ARCHIVE_CAMPAIGNS: readonly {
  matchSlug: string
  matchName: string
  raw: RawCampaign
}[] = [
  {
    matchSlug: 'arbitrum',
    matchName: 'Arbitrum',
    raw: {
      name: 'Arbitrum Initial Token Airdrop ($ARB)',
      project: 'Arbitrum Foundation',
      kind: 'token',
      chainId: 42161,
      status: 'ended',
      officialUrl: 'https://arbitrum.foundation',
      checkerUrl: 'https://docs.arbitrum.foundation/deployment-addresses',
      sourceVerified: false,
      sourceEvidence:
        'Arsip referensi lokal dengan tautan dokumentasi Arbitrum. API DefiLlama tidak memeriksa eligibility wallet, proof, atau keadaan kontrak klaim.',
      deadline: '2023-09-24T00:00:00.000Z',
      requirements: [
        'Interaksi historis dengan jembatan atau kontrak Arbitrum One/Nova sebelum snapshot blok 58642080 (6 Februari 2023).',
        'Periode klaim telah berakhir pada blok L1 18208000 (24 September 2023); sisa token yang tidak diklaim dialihkan ke Arbitrum DAO Treasury.',
      ],
      allocation: 'Berdasarkan skor poin snapshot (625 – 10.250 ARB)',
      claimMethod: 'contract',
      contract: {
        chainId: 42161,
        address: '0x67a24CE4321aB3aF51c2D0a4801c3E111D88C9d9',
      },
      summary:
        'Distribusi genesis token tata kelola $ARB di Arbitrum One. Arsip referensi lokal; klaim tidak tersedia di aplikasi.',
    },
  },
  {
    matchSlug: 'uniswap',
    matchName: 'Uniswap',
    raw: {
      name: 'Uniswap Governance Token Distribution ($UNI)',
      project: 'Uniswap',
      kind: 'token',
      chainId: 1,
      status: 'ended',
      officialUrl: 'https://uniswap.org',
      checkerUrl: 'https://developers.uniswap.org/docs/ecosystem/governance/technical-reference',
      sourceVerified: false,
      sourceEvidence:
        'Arsip referensi lokal dengan tautan dokumentasi Uniswap. API DefiLlama tidak memeriksa eligibility wallet, proof, atau keadaan kontrak klaim.',
      deadline: null,
      requirements: [
        'Alamat pernah memanggil kontrak Uniswap v1 atau v2 sebelum snapshot 1 September 2020 pukul 00:00 UTC.',
        'Ditampilkan sebagai arsip referensi lokal; status klaim aktual belum diperiksa dan klaim tidak tersedia di aplikasi.',
      ],
      allocation: 'Minimal 400 UNI untuk pengguna historis sebelum snapshot',
      claimMethod: 'contract',
      contract: {
        chainId: 1,
        address: '0x090D4613473dEE047c3f2706764f49E0821D256e',
      },
      summary:
        'Distribusi historis token tata kelola $UNI melalui MerkleDistributor di Ethereum Mainnet. Arsip lokal; tenggat klaim belum diketahui aplikasi.',
    },
  },
]

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function resolveSupportedChainId(item: DefiLlamaProtocolItem): number | null {
  if (typeof item.chain === 'string' && item.chain in DEFILLAMA_CHAIN_TO_ID) {
    return DEFILLAMA_CHAIN_TO_ID[item.chain]
  }
  if (Array.isArray(item.chains)) {
    for (const chainName of item.chains) {
      if (typeof chainName === 'string' && chainName in DEFILLAMA_CHAIN_TO_ID) {
        return DEFILLAMA_CHAIN_TO_ID[chainName]
      }
    }
  }
  return null
}

function isTokenlessSymbol(symbol: unknown): boolean {
  if (symbol === null || symbol === undefined) return true
  if (typeof symbol !== 'string') return false
  const trimmed = symbol.trim()
  return trimmed === '' || trimmed === '-'
}

function sanitizeHttpsUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return null
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== 'https:') return null
    if (parsed.hostname.endsWith('.example')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

export interface MapDefiLlamaOptions {
  checkedAt: string
  maxOpportunities?: number
  minTvlUsd?: number
}

/**
 * Konversi dan normalisasi payload JSON dari `https://api.llama.fi/protocols`
 * menjadi kandidat API dan referensi lokal yang memiliki provenance terpisah.
 * `checkedAt` arsip adalah waktu pemuatan referensi pada scan, bukan verifikasi klaim.
 */
export function mapDefiLlamaPayloadToCampaigns(
  payload: unknown,
  options: MapDefiLlamaOptions,
): Campaign[] {
  if (!Array.isArray(payload)) {
    throw new SourceError('invalid', 'Respons sumber live bukan daftar protokol JSON yang valid.')
  }

  const maxOpportunities = options.maxOpportunities ?? 8
  const minTvlUsd = options.minTvlUsd ?? 5_000_000
  const results: Campaign[] = []

  // Indeks metadata protokol; kecocokan nama tidak memverifikasi campaign atau kontrak.
  const liveBySlug = new Map<string, DefiLlamaProtocolItem>()
  const candidates: DefiLlamaProtocolItem[] = []

  for (const rawItem of payload) {
    if (!isObjectRecord(rawItem)) continue
    const name = typeof rawItem.name === 'string' ? rawItem.name.trim() : ''
    if (!name) continue
    const slug = typeof rawItem.slug === 'string' ? rawItem.slug.trim().toLowerCase() : name.toLowerCase()
    const item: DefiLlamaProtocolItem = {
      id: typeof rawItem.id === 'string' ? rawItem.id : undefined,
      name,
      slug,
      symbol: typeof rawItem.symbol === 'string' ? rawItem.symbol : null,
      url: typeof rawItem.url === 'string' ? rawItem.url : null,
      description: typeof rawItem.description === 'string' ? rawItem.description : null,
      chain: typeof rawItem.chain === 'string' ? rawItem.chain : null,
      chains: Array.isArray(rawItem.chains)
        ? rawItem.chains.filter((c): c is string => typeof c === 'string')
        : undefined,
      category: typeof rawItem.category === 'string' ? rawItem.category : null,
      tvl: typeof rawItem.tvl === 'number' && Number.isFinite(rawItem.tvl) ? rawItem.tvl : 0,
      listedAt: typeof rawItem.listedAt === 'number' ? rawItem.listedAt : null,
    }
    liveBySlug.set(slug, item)
    candidates.push(item)
  }

  // 1. Muat referensi lokal. URL terkurasi tidak diganti dengan metadata agregator.
  for (const archive of LOCAL_ARCHIVE_CAMPAIGNS) {
    const matchedLive =
      liveBySlug.get(archive.matchSlug) ??
      candidates.find((c) => c.name.toLowerCase() === archive.matchName.toLowerCase())

    const rawCampaign: RawCampaign = {
      ...archive.raw,
      sourceEvidence: matchedLive
        ? `${archive.raw.sourceEvidence} Metadata nama protokol tersedia pada respons DefiLlama.`
        : archive.raw.sourceEvidence,
    }

    const normalized = normalizeCampaign(rawCampaign, {
      sourceId: LIVE_DEFILLAMA_SOURCE_ID,
      origin: 'live',
      checkedAt: options.checkedAt,
      adapterVersion: LIVE_DEFILLAMA_ADAPTER_VERSION,
    })
    if (normalized) {
      normalized.sourceKind = 'local-archive'
      results.push(normalized)
    }
  }

  // 2. Saring metadata tanpa simbol token dengan TVL tertinggi di chain EVM yang didukung.
  // Sesuai aturan produk: agregator hanya petunjuk penemuan (`status: 'opportunity'`, `sourceVerified: false`).
  const tokenlessCandidates = candidates
    .filter((item) => {
      if (!isTokenlessSymbol(item.symbol)) return false
      if ((item.tvl ?? 0) < minTvlUsd) return false
      if (item.category === 'CEX' || item.category === 'Chain' || item.category === 'Bridge') return false
      return resolveSupportedChainId(item) !== null && sanitizeHttpsUrl(item.url) !== null
    })
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, maxOpportunities)

  for (const item of tokenlessCandidates) {
    const chainId = resolveSupportedChainId(item)
    const officialUrl = sanitizeHttpsUrl(item.url)
    if (chainId === null || officialUrl === null) continue

    const categoryLabel = item.category ? `Kategori ${item.category}` : 'Protokol DeFi'
    const rawOpportunity: RawCampaign = {
      name: `${item.name} — Kandidat Eksplorasi Protokol`,
      project: item.name,
      kind: 'points',
      chainId,
      status: 'opportunity',
      officialUrl,
      checkerUrl: null,
      // Agregator hanya petunjuk penemuan; belum ada pengumuman klaim resmi yang terverifikasi.
      sourceVerified: false,
      sourceEvidence: `Metadata tanpa simbol token dari endpoint publik DefiLlama (${categoryLabel}). Ini petunjuk penemuan; belum ada campaign airdrop yang diverifikasi.`,
      deadline: null,
      requirements: [
        'Metadata protokol belum memuat simbol token di indeks publik DefiLlama; belum ada jaminan airdrop atau jadwal distribusi.',
        'Periksa dokumentasi dan pengumuman resmi proyek melalui situs resmi sebelum menghubungkan wallet.',
      ],
      allocation: null,
      claimMethod: 'unknown',
      contract: null,
      summary:
        item.description && item.description.trim() !== ''
          ? item.description.trim()
          : `${item.name} adalah protokol di jaringan EVM yang metadata DefiLlama-nya belum memuat simbol token.`,
    }

    const normalized = normalizeCampaign(rawOpportunity, {
      sourceId: LIVE_DEFILLAMA_SOURCE_ID,
      origin: 'live',
      checkedAt: options.checkedAt,
      adapterVersion: LIVE_DEFILLAMA_ADAPTER_VERSION,
    })
    if (normalized) {
      normalized.sourceKind = 'api'
      results.push(normalized)
    }
  }

  return results
}

export interface LiveDefiLlamaAdapterOptions {
  endpoint?: string
  fetchFn?: typeof fetch
  rateLimiter?: SourceRateLimiter
  maxOpportunities?: number
  minTvlUsd?: number
}

/**
 * Buat adapter sumber live DefiLlama (`https://api.llama.fi/protocols`).
 * Mendukung pembatasan laju (rate limit) per sumber, penanganan HTTP 429 + Retry-After,
 * serta klasifikasi error CORS/jaringan tanpa menggunakan proxy cloud.
 */
export function createLiveDefiLlamaAdapter(
  options: LiveDefiLlamaAdapterOptions = {},
): SourceAdapter {
  const endpoint = options.endpoint ?? DEFILLAMA_PROTOCOLS_ENDPOINT
  const rateLimiter = options.rateLimiter ?? createSourceRateLimiter()

  return {
    id: LIVE_DEFILLAMA_SOURCE_ID,
    name: 'DefiLlama Live & Arsip Lokal',
    origin: 'live',
    version: LIVE_DEFILLAMA_ADAPTER_VERSION,
    description: 'Metadata protokol publik DefiLlama + arsip referensi lokal Arbitrum & Uniswap; belum memeriksa eligibility atau kontrak klaim.',
    getRetryDelayMs(manualRetry) {
      return rateLimiter.getRetryDelayMs(LIVE_DEFILLAMA_SOURCE_ID, Date.now(), manualRetry)
    },
    async fetchCampaigns({ signal, manualRetry }): Promise<Campaign[]> {
      const now = Date.now()
      rateLimiter.acquire(LIVE_DEFILLAMA_SOURCE_ID, now, manualRetry)

      const fetchImpl = options.fetchFn ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
      if (!fetchImpl) {
        throw new SourceError(
          'unsupported',
          'Lingkungan ini tidak menyediakan API fetch standar untuk menghubungi sumber live.',
        )
      }

      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal,
        })
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new SourceError('aborted', 'Permintaan ke sumber live dibatalkan.')
        }
        if (error instanceof SourceError) {
          throw error
        }
        // Deteksi kemungkinan pemblokiran CORS / ekstensi saat browser online
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true
        if (error instanceof TypeError && isOnline) {
          throw new SourceError(
            'cors',
            'Tidak dapat membaca respons api.llama.fi dari browser (kemungkinan diblokir kebijakan CORS, ekstensi pemblokir, atau jaringan lokal). Tanpa proxy cloud: silakan periksa checker resmi proyek secara langsung.',
          )
        }
        throw new SourceError('network', 'Gagal terhubung ke endpoint live api.llama.fi.')
      }

      if (response.status === 401 || response.status === 403) {
        throw new SourceError(
          'unsupported',
          `Sumber menolak akses publik (HTTP ${response.status}). Sumber yang memerlukan API key/rahasia tidak didukung tanpa backend.`,
        )
      }

      if (response.status === 429) {
        const retryHeader = response.headers?.get?.('Retry-After') ?? null
        const waitMs = rateLimiter.recordRetryAfter(LIVE_DEFILLAMA_SOURCE_ID, retryHeader)
        const waitSec = Math.max(1, Math.ceil(waitMs / 1000))
        throw new SourceError(
          'http',
          `Batas permintaan sumber live tercapai (HTTP 429). Tunggu sekitar ${waitSec} detik lalu gunakan Coba lagi.`,
          waitMs,
        )
      }

      if (!response.ok) {
        throw new SourceError(
          'http',
          `Sumber live membalas HTTP ${response.status}. Checkpoint terakhir tetap dipertahankan bila ada.`,
        )
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new SourceError('invalid', 'Respons dari sumber live bukan JSON yang valid.')
      }

      return mapDefiLlamaPayloadToCampaigns(payload, {
        checkedAt: new Date().toISOString(),
        maxOpportunities: options.maxOpportunities,
        minTvlUsd: options.minTvlUsd,
      })
    },
  }
}

/**
 * Contoh konstruktor adapter untuk sumber yang diketahui terhalang CORS atau mewajibkan API key rahasia.
 * Mengembalikan `SourceError('unsupported', ...)` secara jujur dan mengarahkan ke checker resmi.
 */
export function createUnsupportedSourceAdapter(params: {
  id: string
  name: string
  reason: string
  officialCheckerHint: string
}): SourceAdapter {
  return {
    id: params.id,
    name: params.name,
    origin: 'live',
    version: 'unsupported-1.0.0',
    description: params.reason,
    async fetchCampaigns(): Promise<Campaign[]> {
      throw new SourceError('unsupported', `${params.reason} ${params.officialCheckerHint}`)
    },
  }
}
