import { normalizeCampaign, type RawCampaign } from '../../domain/normalize'
import type { Campaign } from '../../domain/types'
import * as evmChains from 'viem/chains'
import {
  createSourceRateLimiter,
  type SourceRateLimiter,
} from './rateLimit'
import { SourceError, type SourceAdapter } from './types'

export const LIVE_DEFILLAMA_SOURCE_ID = 'defillama-live'
export const LIVE_DEFILLAMA_ADAPTER_VERSION = 'defillama-live-2.1.0'
export const DEFILLAMA_PROTOCOLS_ENDPOINT = 'https://api.llama.fi/protocols'

function chainKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Nama dan export resmi viem, ditambah alias penamaan jaringan DefiLlama. */
const DEFILLAMA_CHAIN_TO_ID = new Map<string, number>()
const DEFILLAMA_TESTNET_CHAIN_IDS = new Set<number>()
for (const [exportName, chain] of Object.entries(evmChains)) {
  if (typeof chain !== 'object' || chain === null || !('id' in chain) || !('name' in chain)) continue
  if (typeof chain.id !== 'number' || typeof chain.name !== 'string') continue
  DEFILLAMA_CHAIN_TO_ID.set(chainKey(exportName), chain.id)
  DEFILLAMA_CHAIN_TO_ID.set(chainKey(chain.name), chain.id)
  if ('testnet' in chain && chain.testnet === true) DEFILLAMA_TESTNET_CHAIN_IDS.add(chain.id)
}
for (const [name, id] of Object.entries({
  Ethereum: 1, Optimism: 10, 'OP Mainnet': 10, Polygon: 137, 'Polygon PoS': 137,
  Base: 8453, Arbitrum: 42161, 'Arbitrum One': 42161, Avalanche: 43114,
  BSC: 56, 'Binance Smart Chain': 56, xDai: 100, 'zkSync Era': 324,
})) {
  DEFILLAMA_CHAIN_TO_ID.set(chainKey(name), id)
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

function resolveSupportedChainIds(item: DefiLlamaProtocolItem): number[] {
  const names = [...(item.chain ? [item.chain] : []), ...(item.chains ?? [])]
  return [...new Set(names.flatMap((name) => {
    const id = DEFILLAMA_CHAIN_TO_ID.get(chainKey(name))
    return id === undefined ? [] : [id]
  }))]
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

  // 2. Semua metadata dengan jaringan EVM yang dikenali, tanpa filter token/TVL/kategori/top-N.
  // Penemuan metadata tetap bukan bukti bahwa ada airdrop gratis atau wallet eligible.
  for (const item of candidates) {
    const officialUrl = sanitizeHttpsUrl(item.url)
    for (const chainId of resolveSupportedChainIds(item)) {
      const categoryLabel = item.category ? `Kategori ${item.category}` : 'Protokol DeFi'
      const rawOpportunity: RawCampaign = {
        name: `${item.name} — Kandidat Eksplorasi Protokol`,
        project: item.name,
        kind: 'token',
        chainId,
        status: 'opportunity',
        officialUrl,
        checkerUrl: null,
        // Metadata agregator belum memverifikasi pengumuman atau kontrak klaim.
        sourceVerified: false,
        sourceEvidence: `Metadata protokol dari endpoint publik DefiLlama (${categoryLabel}). Ini petunjuk penemuan; distribusi token gratis, nilai pasar, dan hak klaim ke wallet belum diverifikasi.`,
        deadline: null,
        requirements: [
          'Entri indeks protokol, bukan pengumuman airdrop. Simbol token, TVL, dan kategori tidak membuktikan distribusi gratis, nilai pasar, atau hak klaim ke wallet. Gas jaringan diperiksa terpisah.',
          'Periksa dokumentasi dan pengumuman resmi proyek melalui situs resmi sebelum menghubungkan wallet.',
        ],
        allocation: null,
        claimMethod: 'unknown',
        contract: null,
        summary:
          item.description && item.description.trim() !== ''
            ? item.description.trim()
            : `${item.name} tercatat dalam metadata DefiLlama pada jaringan EVM ini; belum ada airdrop yang diverifikasi.`,
      }

      const normalized = normalizeCampaign(rawOpportunity, {
        sourceId: LIVE_DEFILLAMA_SOURCE_ID,
        origin: DEFILLAMA_TESTNET_CHAIN_IDS.has(chainId) ? 'testnet' : 'live',
        checkedAt: options.checkedAt,
        adapterVersion: LIVE_DEFILLAMA_ADAPTER_VERSION,
      })
      if (normalized) {
        normalized.id = `${chainId}:defillama:${encodeURIComponent(item.id ?? item.slug ?? item.name)}`
        normalized.sourceKind = 'api'
        results.push(normalized)
      }
    }
  }

  return results
}

export interface LiveDefiLlamaAdapterOptions {
  endpoint?: string
  fetchFn?: typeof fetch
  rateLimiter?: SourceRateLimiter
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
