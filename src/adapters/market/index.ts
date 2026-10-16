import type { HexAddress } from '../../domain/types'

export const MARKET_TTL_MS = 5 * 60_000
const MARKET_TIMEOUT_MS = 8_000
const DEX_SCREENER_API = 'https://api.dexscreener.com/token-pairs/v1'
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const ZERO_ADDRESS = /^0x0{40}$/i
const PRICE = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/

// Provider slugs are verified against DEX Screener's own chain navigation.
// Unmapped networks remain discoverable; their market value is unknown here.
const CHAIN_SLUGS = new Map<number, string>([
  [1, 'ethereum'], [8453, 'base'], [42161, 'arbitrum'],
  [56, 'bsc'], [137, 'polygon'], [10, 'optimism'],
  [43114, 'avalanche'], [324, 'zksync'], [130, 'unichain'],
  [42220, 'celo'], [59144, 'linea'], [534352, 'scroll'],
])

export interface TokenMarketEvidence {
  status: 'available' | 'unknown'
  chainId: number
  tokenAddress: HexAddress
  priceUsd: string | null
  liquidityUsd: number | null
  pairAddress: HexAddress | null
  sourceUrl: string | null
  checkedAt: string | null
  reason: string
}

interface MarketRequest {
  chainId: number
  tokenAddress: HexAddress
  signal?: AbortSignal
}

interface MarketDependencies {
  fetchFn?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

function address(value: unknown): value is HexAddress {
  return typeof value === 'string' && ADDRESS.test(value) && !ZERO_ADDRESS.test(value)
}

function positivePrice(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && PRICE.test(value)
    && Number.isFinite(Number(value)) && Number(value) > 0
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function pairUrl(slug: string, pairAddress: HexAddress): string {
  return `https://dexscreener.com/${slug}/${pairAddress.toLowerCase()}`
}

export function marketTokenKey(chainId: number, tokenAddress: HexAddress): string {
  return `${chainId}:${tokenAddress.toLowerCase()}`
}

export function isMarketChainSupported(chainId: number): boolean {
  return CHAIN_SLUGS.has(chainId)
}

export function isMarketEvidenceFresh(evidence: TokenMarketEvidence, now = Date.now()): boolean {
  const slug = CHAIN_SLUGS.get(evidence.chainId)
  if (evidence.status !== 'available' || !slug || !Number.isFinite(now)
    || !address(evidence.tokenAddress) || !address(evidence.pairAddress)
    || !positivePrice(evidence.priceUsd) || !positiveNumber(evidence.liquidityUsd)
    || evidence.sourceUrl !== pairUrl(slug, evidence.pairAddress)
    || typeof evidence.checkedAt !== 'string') return false
  const checkedAt = Date.parse(evidence.checkedAt)
  return Number.isFinite(checkedAt) && new Date(checkedAt).toISOString() === evidence.checkedAt
    && checkedAt <= now && now - checkedAt <= MARKET_TTL_MS
}

function unknown(request: MarketRequest, reason: string): TokenMarketEvidence {
  return {
    status: 'unknown', chainId: request.chainId, tokenAddress: request.tokenAddress,
    priceUsd: null, liquidityUsd: null, pairAddress: null, sourceUrl: null, checkedAt: null, reason,
  }
}

function parseMarket(payload: unknown, request: MarketRequest, slug: string, now: number): TokenMarketEvidence {
  if (!Array.isArray(payload) || !Number.isFinite(now)) {
    return unknown(request, 'Data pasar tidak valid; nilai token belum diketahui.')
  }
  let best: TokenMarketEvidence | undefined
  for (const value of payload) {
    const pair = record(value)
    const baseToken = record(pair?.baseToken)
    const liquidity = record(pair?.liquidity)
    // priceUsd describes the base token. A matching quote token proves no price for our token.
    if (!pair || pair.chainId !== slug || !address(baseToken?.address)
      || baseToken.address.toLowerCase() !== request.tokenAddress.toLowerCase()
      || !address(pair.pairAddress) || !positivePrice(pair.priceUsd)
      || !positiveNumber(liquidity?.usd)) continue
    if (!best || liquidity.usd > best.liquidityUsd!) {
      best = {
        status: 'available', chainId: request.chainId, tokenAddress: request.tokenAddress,
        priceUsd: pair.priceUsd, liquidityUsd: liquidity.usd, pairAddress: pair.pairAddress,
        sourceUrl: pairUrl(slug, pair.pairAddress), checkedAt: new Date(now).toISOString(),
        reason: 'Harga USD dan likuiditas pool terdeteksi. Nilai ini merupakan indikasi pasar, bukan jaminan hasil penjualan.',
      }
    }
  }
  return best ?? unknown(request, 'Harga USD dan likuiditas positif untuk token pada jaringan ini belum ditemukan.')
}

/** Public read only. Cancellation rejects AbortError; other failures resolve unknown.
 * The API has no market-data timestamp, so checkedAt records retrieval time only.
 */
export async function fetchTokenMarket(request: MarketRequest, {
  fetchFn = fetch, now = Date.now, timeoutMs = MARKET_TIMEOUT_MS,
}: MarketDependencies = {}): Promise<TokenMarketEvidence> {
  if (request.signal?.aborted) throw new DOMException('Pemeriksaan dibatalkan.', 'AbortError')
  const slug = CHAIN_SLUGS.get(request.chainId)
  if (!Number.isSafeInteger(request.chainId) || !address(request.tokenAddress)) {
    return unknown(request, 'Identitas jaringan atau alamat token tidak valid; nilai belum diketahui.')
  }
  if (!slug) return unknown(request, 'Sumber harga belum mendukung jaringan ini; token tetap tercantum dalam pencarian.')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return unknown(request, 'Batas waktu pemeriksaan pasar tidak valid.')
  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      controller.abort()
      reject(new DOMException('Pemeriksaan dibatalkan.', 'AbortError'))
    }
    request.signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new Error('Market timeout'))
    }, timeoutMs)
  })
  try {
    const operation = (async () => {
      const response = await fetchFn(`${DEX_SCREENER_API}/${slug}/${request.tokenAddress}`, {
        method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: controller.signal,
      })
      if (!response.ok) return unknown(request, 'Sumber pasar belum tersedia; harga dan likuiditas belum diketahui.')
      return parseMarket(await response.json(), request, slug, now())
    })()
    return await Promise.race([operation, interrupted])
  } catch {
    if (request.signal?.aborted) throw new DOMException('Pemeriksaan dibatalkan.', 'AbortError')
    return unknown(request, timedOut
      ? 'Pemeriksaan pasar melewati batas waktu; harga dan likuiditas belum diketahui.'
      : 'Data pasar tidak dapat dibaca; harga dan likuiditas belum diketahui.')
  } finally {
    clearTimeout(timer)
    if (onAbort) request.signal?.removeEventListener('abort', onAbort)
  }
}
