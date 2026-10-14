import { normalizeCampaign, type RawCampaign } from '../../domain/normalize'
import type { Campaign } from '../../domain/types'
import {
  createSourceRateLimiter,
  type SourceRateLimiter,
} from './rateLimit'
import { SourceError, type SourceAdapter } from './types'

export const LIVE_DEFILLAMA_SOURCE_ID = 'defillama-live'
export const LIVE_DEFILLAMA_ADAPTER_VERSION = 'defillama-live-1.0.0'
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
 * Daftar campaign resmi yang telah dibandingkan langsung dengan dokumentasi proyek (Task 3.3).
 * Campaign historis ditandai `status: 'ended'` dan memiliki tenggat yang sudah lewat sehingga
 * selalu menghasilkan label "Berakhir" dengan klaim dinonaktifkan.
 */
export const VERIFIED_OFFICIAL_CAMPAIGNS: readonly {
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
      sourceVerified: true,
      sourceEvidence:
        'Terverifikasi dari dokumentasi resmi Arbitrum DAO (docs.arbitrum.foundation/deployment-addresses): kontrak TokenDistributor 0x67a24CE4321aB3aF51c2D0a4801c3E111D88C9d9 di Arbitrum One.',
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
        'Distribusi genesis token tata kelola $ARB di Arbitrum One. Ditampilkan sebagai arsip referensi terverifikasi (Berakhir).',
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
      sourceVerified: true,
      sourceEvidence:
        'Terverifikasi dari Uniswap Technical Reference: kontrak UNI MerkleDistributor 0x090D4613473dEE047c3f2706764f49E0821D256e di Ethereum Mainnet.',
      deadline: '2020-09-17T00:00:00.000Z',
      requirements: [
        'Alamat pernah memanggil kontrak Uniswap v1 atau v2 sebelum snapshot 1 September 2020 pukul 00:00 UTC.',
        'Distribusi historis selesai; ditampilkan sebagai arsip referensi resmi.',
      ],
      allocation: 'Minimal 400 UNI untuk pengguna historis sebelum snapshot',
      claimMethod: 'contract',
      contract: {
        chainId: 1,
        address: '0x090D4613473dEE047c3f2706764f49E0821D256e',
      },
      summary:
        'Distribusi historis token tata kelola $UNI melalui MerkleDistributor di Ethereum Mainnet (Berakhir).',
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
 * menjadi daftar `Campaign` berlabel `origin: 'live'`.
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

  // Indeks item live berdasarkan slug atau nama untuk memverifikasi silang entri resmi
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

  // 1. Masukkan campaign resmi terverifikasi (termasuk arsip historis Berakhir)
  for (const verified of VERIFIED_OFFICIAL_CAMPAIGNS) {
    const matchedLive =
      liveBySlug.get(verified.matchSlug) ??
      candidates.find((c) => c.name.toLowerCase().includes(verified.matchName.toLowerCase()))
    const liveUrl = matchedLive ? sanitizeHttpsUrl(matchedLive.url) : null

    const rawCampaign: RawCampaign = {
      ...verified.raw,
      officialUrl: liveUrl ?? verified.raw.officialUrl,
      sourceEvidence: matchedLive
        ? `${verified.raw.sourceEvidence} Cocok dengan metadata live DefiLlama (${matchedLive.name}).`
        : verified.raw.sourceEvidence,
    }

    const normalized = normalizeCampaign(rawCampaign, {
      sourceId: LIVE_DEFILLAMA_SOURCE_ID,
      origin: 'live',
      checkedAt: options.checkedAt,
      adapterVersion: LIVE_DEFILLAMA_ADAPTER_VERSION,
    })
    if (normalized) {
      results.push(normalized)
    }
  }

  // 2. Saring protokol aktif tanpa token (symbol === "-") dengan TVL tertinggi di chain EVM yang didukung.
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
      name: `${item.name} — Eksplorasi Protokol Tanpa Token`,
      project: item.name,
      kind: 'points',
      chainId,
      status: 'opportunity',
      officialUrl,
      checkerUrl: null,
      // Agregator hanya petunjuk penemuan; belum ada pengumuman klaim resmi yang terverifikasi.
      sourceVerified: false,
      sourceEvidence: `Terdeteksi tanpa simbol token (symbol: "-") di endpoint publik DefiLlama (${categoryLabel}). Periksa pengumuman resmi proyek sebelum berinteraksi.`,
      deadline: null,
      requirements: [
        'Protokol tercatat aktif tanpa token di indeks publik DefiLlama; belum ada jaminan airdrop atau jadwal distribusi.',
        'Periksa dokumentasi dan pengumuman resmi proyek melalui situs resmi sebelum menghubungkan wallet.',
      ],
      allocation: null,
      claimMethod: 'unknown',
      contract: null,
      summary:
        item.description && item.description.trim() !== ''
          ? item.description.trim()
          : `${item.name} adalah protokol di jaringan EVM yang saat ini tercatat belum meluncurkan token di indeks DefiLlama.`,
    }

    const normalized = normalizeCampaign(rawOpportunity, {
      sourceId: LIVE_DEFILLAMA_SOURCE_ID,
      origin: 'live',
      checkedAt: options.checkedAt,
      adapterVersion: LIVE_DEFILLAMA_ADAPTER_VERSION,
    })
    if (normalized) {
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
    name: 'DefiLlama Live & Arsip Resmi',
    origin: 'live',
    version: LIVE_DEFILLAMA_ADAPTER_VERSION,
    description: 'Indeks protokol publik DefiLlama (CORS terbuka) + verifikasi kontrak resmi Arbitrum & Uniswap',
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
