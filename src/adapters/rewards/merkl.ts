import type { HexAddress } from '../../domain/types'

export const MERKL_REWARDS_API = 'https://api.merkl.xyz/v4/users'
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const UINT256_MAX = (1n << 256n) - 1n

export interface WalletReward {
  id: string
  chainId: number
  chainName: string
  tokenAddress: HexAddress
  symbol: string
  decimals: number
  assetType: 'TOKEN' | 'POINT' | 'PRETGE'
  isTest: boolean
  tokenVerified: boolean
  amount: string
  claimed: string
  pending: string
  claimable: string
  cost: 'user_pays_gas'
  source: string
}

export interface WalletRewardsResult {
  checkedAt: string
  rewards: WalletReward[]
}

interface WalletRewardsOptions {
  fetchFn?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function uint256(value: unknown): bigint {
  if (typeof value !== 'string' || value.length > 78 || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('Jumlah reward Merkl tidak valid; saldo belum diketahui.')
  }
  const parsed = BigInt(value)
  if (parsed > UINT256_MAX) throw new Error('Jumlah reward Merkl melampaui uint256; saldo belum diketahui.')
  return parsed
}

/** Summary lintas jaringan; hanya metadata dan saldo, tanpa proof atau instruksi transaksi. */
export function parseMerklWalletRewards(payload: unknown): WalletReward[] {
  if (!Array.isArray(payload)) throw new Error('Respons reward Merkl bukan daftar JSON yang valid.')
  const rewards: WalletReward[] = []
  const seen = new Set<string>()
  for (const group of payload) {
    if (!record(group) || !record(group.chain) || !positiveInteger(group.chain.id)
      || !nonempty(group.chain.name) || !Array.isArray(group.rewards)) {
      throw new Error('Data jaringan reward Merkl tidak valid; hasil parsial tidak digunakan.')
    }
    for (const raw of group.rewards) {
      if (!record(raw) || !record(raw.token)) throw new Error('Data token reward Merkl tidak valid.')
      const token = raw.token
      if (typeof token.address !== 'string' || !ADDRESS.test(token.address)
        || token.chainId !== group.chain.id || !nonempty(token.symbol)
        || typeof token.decimals !== 'number' || !Number.isInteger(token.decimals)
        || token.decimals < 0 || token.decimals > 255
        || (token.type !== 'TOKEN' && token.type !== 'POINT' && token.type !== 'PRETGE')
        || typeof token.isTest !== 'boolean' || typeof token.verified !== 'boolean') {
        throw new Error('Metadata token reward Merkl tidak valid; hasil parsial tidak digunakan.')
      }
      const amount = uint256(raw.amount)
      const claimed = uint256(raw.claimed)
      const pending = uint256(raw.pending)
      if (claimed > amount) throw new Error('Jumlah diklaim pada reward Merkl melebihi alokasi.')
      const tokenAddress = token.address.toLowerCase() as HexAddress
      const id = `${group.chain.id}:${tokenAddress}`
      if (seen.has(id)) throw new Error('Entri token reward Merkl berulang; saldo belum diketahui.')
      seen.add(id)
      rewards.push({
        id, chainId: group.chain.id, chainName: group.chain.name, tokenAddress,
        symbol: token.symbol, decimals: token.decimals, assetType: token.type,
        isTest: token.isTest, tokenVerified: token.verified,
        amount: amount.toString(), claimed: claimed.toString(), pending: pending.toString(),
        claimable: (amount - claimed).toString(), cost: 'user_pays_gas',
        source: 'https://docs.merkl.xyz',
      })
    }
  }
  return rewards
}

/** GET publik; kegagalan tidak dikonversi menjadi daftar saldo nol. */
export async function fetchMerklWalletRewards(address: HexAddress, {
  fetchFn = fetch, signal, timeoutMs = 8_000,
}: WalletRewardsOptions = {}): Promise<WalletRewardsResult> {
  if (signal?.aborted) throw new DOMException('Pemeriksaan reward dibatalkan.', 'AbortError')
  if (!ADDRESS.test(address)) throw new Error('Alamat wallet Merkl tidak valid.')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Batas waktu pemeriksaan reward tidak valid.')
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      const error = new DOMException('Pemeriksaan reward dibatalkan.', 'AbortError')
      controller.abort(error)
      reject(error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      const error = new Error('Pemeriksaan reward Merkl melewati batas waktu; saldo belum diketahui.')
      controller.abort(error)
      reject(error)
    }, timeoutMs)
  })
  try {
    const operation = (async () => {
      const response = await fetchFn(`${MERKL_REWARDS_API}/${address}/rewards/summary`, {
        method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Sumber reward Merkl gagal: HTTP ${response.status}; saldo belum diketahui.`)
      return { rewards: parseMerklWalletRewards(await response.json()), checkedAt: new Date().toISOString() }
    })()
    return await Promise.race([operation, interrupted])
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Pemeriksaan reward dibatalkan.', 'AbortError')
    if (error instanceof TypeError) throw new Error('Sumber reward Merkl tidak dapat dihubungi; saldo belum diketahui.')
    if (error instanceof SyntaxError) throw new Error('Respons JSON reward Merkl tidak valid; saldo belum diketahui.')
    throw error
  } finally {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  }
}
