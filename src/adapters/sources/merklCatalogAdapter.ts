import { normalizeCampaign } from '../../domain/normalize'
import type { Campaign } from '../../domain/types'
import * as evmChains from 'viem/chains'
import { createSourceRateLimiter, type SourceRateLimiter } from './rateLimit'
import { delay, SourceError, type SourceAdapter } from './types'

export const MERKL_CATALOG_SOURCE_ID = 'merkl-catalog-live'
export const MERKL_CATALOG_ADAPTER_VERSION = 'merkl-catalog-1.1.0'
export const MERKL_OPPORTUNITIES_ENDPOINT = 'https://api.merkl.xyz/v4/opportunities'
const MERKL_APP_URL = 'https://app.merkl.xyz/'
const PAGE_SIZE = 100
const TESTNET_CHAIN_IDS = new Set<number>(Object.values(evmChains).flatMap((chain) => (
  typeof chain === 'object' && chain !== null && 'testnet' in chain && chain.testnet === true
    && 'id' in chain && typeof chain.id === 'number' ? [chain.id] : []
)))

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function validateToken(value: unknown): void {
  if (!record(value) || !nonempty(value.address) || !nonempty(value.symbol)
    || !positiveInteger(value.chainId) || typeof value.decimals !== 'number'
    || !Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 255
    || !['TOKEN', 'PRETGE', 'POINT'].includes(String(value.type))
    || typeof value.isTest !== 'boolean') {
    throw new SourceError('invalid', 'Metadata token pada katalog Merkl tidak valid; hasil parsial tidak disimpan.')
  }
}

/** Schema resmi: /v4/opportunities/ pada https://api.merkl.xyz/docs. */
export function mapMerklOpportunityPage(payload: unknown, checkedAt: string): Campaign[] {
  if (!Array.isArray(payload) || payload.length > PAGE_SIZE) {
    throw new SourceError('invalid', 'Halaman katalog Merkl bukan daftar JSON yang valid.')
  }
  return payload.map((raw): Campaign => {
    if (!record(raw) || !nonempty(raw.id) || !nonempty(raw.name)
      || !record(raw.chain) || !positiveInteger(raw.chain.id)
      || !Array.isArray(raw.tokens)
      || !['NONE', 'PAST', 'LIVE', 'SOON'].includes(String(raw.status))) {
      throw new SourceError('invalid', 'Entri katalog Merkl tidak valid; hasil parsial tidak disimpan.')
    }
    if (raw.chainId !== undefined && raw.chainId !== raw.chain.id) {
      throw new SourceError('invalid', 'Jaringan entri katalog Merkl tidak konsisten.')
    }
    raw.tokens.forEach(validateToken)
    const rewardTokens: Record<string, unknown>[] = []
    if (raw.rewardsRecord !== undefined && raw.rewardsRecord !== null) {
      if (!record(raw.rewardsRecord) || !Array.isArray(raw.rewardsRecord.breakdowns)) {
        throw new SourceError('invalid', 'Metadata reward katalog Merkl tidak valid.')
      }
      for (const reward of raw.rewardsRecord.breakdowns) {
        if (!record(reward)) throw new SourceError('invalid', 'Rincian reward Merkl tidak valid.')
        validateToken(reward.token)
        rewardTokens.push(reward.token as Record<string, unknown>)
      }
    }
    const advertisedTokens = rewardTokens.length > 0 ? rewardTokens : raw.tokens as Record<string, unknown>[]
    const pointsOnly = advertisedTokens.length > 0 && advertisedTokens.every((token) => token.type === 'POINT')
    const preTge = advertisedTokens.some((token) => token.type === 'PRETGE')
    const testData = TESTNET_CHAIN_IDS.has(raw.chain.id)
      || (advertisedTokens.length > 0 && advertisedTokens.every((token) => token.isTest === true))
    const project = record(raw.protocol) && nonempty(raw.protocol.name) ? raw.protocol.name : 'Merkl'
    const campaign = normalizeCampaign({
      name: raw.name,
      project,
      chainId: raw.chain.id,
      kind: pointsOnly ? 'points' : 'token',
      status: 'opportunity',
      officialUrl: MERKL_APP_URL,
      checkerUrl: MERKL_APP_URL,
      sourceVerified: false,
      sourceEvidence: 'Katalog API resmi Merkl. Keberadaan program tidak membuktikan hak klaim wallet, nilai pasar token, atau keberhasilan transfer.',
      requirements: [
        `Status katalog: ${raw.status}. Program dapat memerlukan kepemilikan aset, deposit, pinjaman, atau aktivitas lain; bukan otomatis airdrop gratis.`,
        'Distribusi reward tidak memerlukan pembelian token reward saat klaim; program tetap dapat memerlukan aktivitas atau modal sebelumnya. Klaim standar Merkl memerlukan gas pengguna; gas tidak menggugurkan kriteria free.',
        'Hak klaim wallet, harga USD, dan likuiditas token reward perlu diperiksa terpisah; keberadaan program belum membuktikan semua syarat tersebut.',
        ...(pointsOnly ? ['Program mencatat poin; poin bukan token transferable yang sudah dapat masuk wallet.'] : []),
        ...(preTge ? ['Program memuat aset PRETGE; peluncuran dan hak penukaran token belum diverifikasi.'] : []),
      ],
      allocation: null,
      deadline: null,
      claimMethod: 'unknown',
      contract: null,
      summary: typeof raw.description === 'string' ? raw.description : 'Program reward dalam katalog resmi Merkl; syarat dan biaya perlu diperiksa.',
    }, {
      sourceId: MERKL_CATALOG_SOURCE_ID,
      origin: testData ? 'testnet' : 'live',
      checkedAt,
      adapterVersion: MERKL_CATALOG_ADAPTER_VERSION,
    })
    if (!campaign) throw new SourceError('invalid', 'Entri Merkl tidak dapat dinormalisasi.')
    try {
      campaign.id = `${campaign.chainId}:merkl:${encodeURIComponent(raw.id)}`
    } catch {
      throw new SourceError('invalid', 'Pengenal katalog Merkl tidak valid.')
    }
    campaign.sourceKind = 'api'
    return campaign
  })
}

export interface MerklCatalogAdapterOptions {
  endpoint?: string
  fetchFn?: typeof fetch
  rateLimiter?: SourceRateLimiter
}

function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw new SourceError('aborted', 'Pembacaan katalog Merkl dibatalkan.')
}

/** Seluruh halaman, tanpa filter token, chain, TVL, kategori, atau batas total hasil. */
export function createMerklCatalogAdapter(options: MerklCatalogAdapterOptions = {}): SourceAdapter {
  const limiter = options.rateLimiter ?? createSourceRateLimiter({
    minIntervalMs: 250, maxRequestsPerWindow: 120, windowMs: 60_000,
  })
  return {
    id: MERKL_CATALOG_SOURCE_ID,
    name: 'Merkl — Katalog Reward',
    origin: 'live',
    version: MERKL_CATALOG_ADAPTER_VERSION,
    timeoutMs: 120_000,
    description: 'Seluruh katalog publik Merkl, termasuk program yang memerlukan aktivitas/modal. Hak klaim wallet dan nilai pasar token belum diverifikasi; gas dapat diperlukan.',
    getRetryDelayMs(manualRetry) {
      return limiter.getRetryDelayMs(MERKL_CATALOG_SOURCE_ID, Date.now(), manualRetry)
    },
    async fetchCampaigns({ signal, manualRetry }): Promise<Campaign[]> {
      const fetchImpl = options.fetchFn ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
      if (!fetchImpl) throw new SourceError('unsupported', 'Lingkungan ini tidak menyediakan fetch untuk katalog Merkl.')
      const campaigns = new Map<string, Campaign>()
      const pageFingerprints = new Set<string>()
      const checkedAt = new Date().toISOString()
      for (let page = 0; ; page += 1) {
        ensureActive(signal)
        const manualPage = page === 0 && manualRetry
        const waitMs = limiter.getRetryDelayMs(MERKL_CATALOG_SOURCE_ID, Date.now(), manualPage)
        if (waitMs > 0) await delay(waitMs, signal)
        ensureActive(signal)
        limiter.acquire(MERKL_CATALOG_SOURCE_ID, Date.now(), manualPage)
        const url = new URL(options.endpoint ?? MERKL_OPPORTUNITIES_ENDPOINT)
        url.searchParams.set('page', String(page))
        url.searchParams.set('items', String(PAGE_SIZE))
        let response: Response
        try {
          response = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' }, signal })
        } catch (error) {
          ensureActive(signal)
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new SourceError('aborted', 'Pembacaan katalog Merkl dibatalkan.')
          }
          const online = typeof navigator === 'undefined' || navigator.onLine !== false
          throw new SourceError(error instanceof TypeError && online ? 'cors' : 'network',
            'Katalog Merkl tidak dapat dibaca dari browser. Periksa jaringan/CORS atau buka aplikasi resmi Merkl; hasil scan parsial tidak disimpan.')
        }
        ensureActive(signal)
        if (response.status === 401 || response.status === 403) {
          throw new SourceError('unsupported', `API Merkl menolak pembacaan publik (HTTP ${response.status}); aplikasi tidak memakai API key atau proxy.`)
        }
        if (response.status === 429) {
          const waitMs = limiter.recordRetryAfter(MERKL_CATALOG_SOURCE_ID, response.headers?.get?.('Retry-After') ?? null)
          throw new SourceError('http', 'Batas laju API Merkl tercapai (HTTP 429). Ulangi setelah waktu tunggu sumber.', waitMs)
        }
        if (!response.ok) throw new SourceError('http', `Katalog Merkl membalas HTTP ${response.status}; hasil parsial tidak disimpan.`)
        let payload: unknown
        try {
          payload = await response.json()
        } catch {
          ensureActive(signal)
          throw new SourceError('invalid', 'Halaman katalog Merkl bukan JSON yang valid.')
        }
        ensureActive(signal)
        const mapped = mapMerklOpportunityPage(payload, checkedAt)
        if (mapped.length > 0) {
          const fingerprint = JSON.stringify(mapped.map((campaign) => campaign.id).sort())
          if (pageFingerprints.has(fingerprint) || mapped.every((campaign) => campaigns.has(campaign.id))) {
            throw new SourceError('invalid', 'API Merkl mengulang halaman katalog; scan dihentikan dan hasil parsial tidak disimpan.')
          }
          pageFingerprints.add(fingerprint)
          for (const campaign of mapped) campaigns.set(campaign.id, campaign)
        }
        if (mapped.length < PAGE_SIZE) return [...campaigns.values()]
      }
    },
  }
}
