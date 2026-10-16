import { fetchMerklWalletRewards, type WalletReward } from '../../adapters/rewards/merkl'
import { fetchTokenMarket, isMarketChainSupported, marketTokenKey, type TokenMarketEvidence } from '../../adapters/market'
import { isRewardTestnet } from '../../domain/freeAirdrop'
import type { Identity } from '../../domain/types'
import { identityAddress, identityKey } from '../wallet/identity'

export interface WalletRewardsSnapshot {
  status: 'idle' | 'loading' | 'success' | 'error'
  rewards: readonly WalletReward[]
  checkedAt: string | null
  error: string | null
  markets: ReadonlyMap<string, TokenMarketEvidence>
  marketStatus: 'idle' | 'loading' | 'done'
  marketCompleted: number
  marketTotal: number
}

export interface WalletRewardsContext {
  identity: Identity
  scanKey: string
  enabled: boolean
}

interface Dependencies {
  fetchMarket?: typeof fetchTokenMarket
  marketIntervalMs?: number
}

const empty = (): WalletRewardsSnapshot => ({
  status: 'idle', rewards: [], checkedAt: null, error: null,
  markets: new Map(), marketStatus: 'idle', marketCompleted: 0, marketTotal: 0,
})

function waitForMarketStart(delay: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Pemeriksaan dibatalkan.', 'AbortError'))
  if (delay <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Pemeriksaan dibatalkan.', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** In-memory results belong to the full active identity, never to shared checkpoints. */
export function createWalletRewardsController(
  fetchRewards = fetchMerklWalletRewards,
  { fetchMarket = fetchTokenMarket, marketIntervalMs = 300 }: Dependencies = {},
) {
  let context: WalletRewardsContext | null = null
  let scope = ''
  let epoch = 0
  let active: AbortController | null = null
  let snapshot = empty()
  const listeners = new Set<() => void>()
  let marketStarts: Promise<void> = Promise.resolve()
  let lastMarketStart = -Infinity
  const interval = Number.isFinite(marketIntervalMs) ? Math.max(0, marketIntervalMs) : 300
  const publish = (next: WalletRewardsSnapshot, notify = true) => {
    snapshot = next
    if (notify) for (const listener of listeners) listener()
  }
  const cancel = (notify = true) => {
    epoch += 1
    active?.abort()
    active = null
    publish(empty(), notify)
  }

  // Two workers share one start gate, including across refreshes. The gate opens
  // as soon as a request starts; slow requests do not block the other worker.
  const checkMarket = async (reward: WalletReward, signal: AbortSignal) => {
    // Unsupported networks produce local unknown evidence without using the API.
    // They still count as checked, but must not hold up supported-network tokens.
    if (!isMarketChainSupported(reward.chainId)) {
      return fetchMarket({ chainId: reward.chainId, tokenAddress: reward.tokenAddress, signal })
    }
    const previous = marketStarts
    let release!: () => void
    marketStarts = new Promise<void>((resolve) => { release = resolve })
    let request: ReturnType<typeof fetchTokenMarket>
    try {
      await previous
      await waitForMarketStart(lastMarketStart + interval - Date.now(), signal)
      if (signal.aborted) throw new DOMException('Pemeriksaan dibatalkan.', 'AbortError')
      lastMarketStart = Date.now()
      request = fetchMarket({ chainId: reward.chainId, tokenAddress: reward.tokenAddress, signal })
    } finally {
      release()
    }
    return await request
  }

  const checkMarkets = async (targets: readonly WalletReward[], capturedEpoch: number, controller: AbortController) => {
    let next = 0
    let completed = 0
    const markets = new Map<string, TokenMarketEvidence>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const current = () => epoch === capturedEpoch && !controller.signal.aborted
    const clearPending = () => { clearTimeout(timer); timer = undefined }
    const flush = () => {
      clearPending()
      if (current()) publish({ ...snapshot, markets: new Map(markets), marketCompleted: completed })
    }
    controller.signal.addEventListener('abort', clearPending, { once: true })
    const worker = async () => {
      while (current() && next < targets.length) {
        const reward = targets[next++]
        let evidence: TokenMarketEvidence
        try {
          evidence = await checkMarket(reward, controller.signal)
        } catch (error) {
          if (!current()) return
          evidence = {
            status: 'unknown', chainId: reward.chainId, tokenAddress: reward.tokenAddress,
            priceUsd: null, liquidityUsd: null, pairAddress: null, sourceUrl: null,
            checkedAt: null, reason: error instanceof Error ? error.message : 'Harga dan likuiditas token belum diketahui.',
          }
        }
        if (!current()) return
        markets.set(marketTokenKey(reward.chainId, reward.tokenAddress), evidence)
        completed += 1
        // Keep React snapshots immutable, without cloning the growing map and
        // rendering the whole dashboard for every individual token response.
        timer ??= setTimeout(flush, 500)
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(2, targets.length) }, () => worker()))
      clearPending()
      if (current()) publish({ ...snapshot, markets: new Map(markets), marketCompleted: completed, marketStatus: 'done' })
    } finally {
      clearPending()
      controller.signal.removeEventListener('abort', clearPending)
    }
  }
  return {
    configure(next: WalletRewardsContext, notify = true) {
      const nextScope = `${identityKey(next.identity)}::${next.scanKey}::${next.enabled}`
      if (scope !== nextScope) {
        cancel(notify)
        scope = nextScope
      }
      context = next
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    cancel: () => cancel(),
    async refresh() {
      const address = context && context.enabled ? identityAddress(context.identity) : null
      if (!address) return
      active?.abort()
      const capturedEpoch = ++epoch
      const controller = new AbortController()
      active = controller
      publish({ ...empty(), status: 'loading' })
      try {
        const result = await fetchRewards(address, { signal: controller.signal })
        if (epoch !== capturedEpoch || controller.signal.aborted) return
        const targets = result.rewards.filter((reward) =>
          reward.assetType === 'TOKEN' && !reward.isTest && !isRewardTestnet(reward.chainId) && BigInt(reward.claimable) > 0n,
        )
        publish({
          ...empty(), status: 'success', rewards: result.rewards, checkedAt: result.checkedAt,
          marketStatus: targets.length > 0 ? 'loading' : 'done', marketTotal: targets.length,
        })
        await checkMarkets(targets, capturedEpoch, controller)
      } catch (error) {
        if (epoch !== capturedEpoch || controller.signal.aborted) return
        publish({ ...empty(), status: 'error', error: error instanceof Error ? error.message : 'Sumber reward gagal dibaca; saldo belum diketahui.' })
      } finally {
        if (epoch === capturedEpoch) active = null
      }
    },
  }
}
