import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { fetchTokenMarket, isMarketEvidenceFresh, marketTokenKey, type TokenMarketEvidence } from '../../adapters/market'
import type { Campaign } from '../../domain/types'
import { campaignRewardToken } from './campaignMarket'

export function createCampaignMarketController(fetchMarket = fetchTokenMarket, now = Date.now) {
  let campaign: Campaign | null = null
  let key = ''
  let epoch = 0
  let active: AbortController | null = null
  let markets: ReadonlyMap<string, TokenMarketEvidence> = new Map()
  const listeners = new Set<() => void>()
  const cancel = (notify = true) => {
    epoch += 1
    active?.abort()
    active = null
    markets = new Map()
    if (notify) for (const listener of listeners) listener()
  }
  return {
    configure(next: Campaign | null, scope: string, enabled: boolean) {
      const token = next ? campaignRewardToken(next) : null
      const nextKey = enabled && next && token ? `${scope}:${marketTokenKey(next.chainId, token)}` : ''
      if (key !== nextKey) cancel(false)
      key = nextKey
      campaign = next
      return key
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => markets,
    cancel,
    async refresh(force = true) {
      const token = campaign ? campaignRewardToken(campaign) : null
      const chainId = campaign?.chainId
      if (!force && key && token && chainId !== undefined) {
        const evidence = markets.get(marketTokenKey(chainId, token))
        if (active || (evidence && isMarketEvidenceFresh(evidence, now()))) return
      }
      cancel()
      if (!key || chainId === undefined || !token) return
      const capturedEpoch = epoch
      const controller = new AbortController()
      active = controller
      try {
        const evidence = await fetchMarket({ chainId, tokenAddress: token, signal: controller.signal })
        if (epoch === capturedEpoch && !controller.signal.aborted) {
          markets = new Map([[marketTokenKey(chainId, token), evidence]])
          for (const listener of listeners) listener()
        }
      } catch {
        // Caller cancellation is silent; transport errors return unknown evidence.
      } finally {
        if (epoch === capturedEpoch) active = null
      }
    },
  }
}

/** Quotes belong to the active wallet/source scope and are never persisted. */
export function useCampaignMarket(campaign: Campaign | null, scope: string, enabled: boolean) {
  const controller = useMemo(() => createCampaignMarketController(), [])
  const requestKey = controller.configure(campaign, scope, enabled)
  const markets = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => { void controller.refresh(false) }, [controller, requestKey])
  useEffect(() => () => controller.cancel(), [controller])
  return { markets, refresh: useCallback(() => controller.refresh(), [controller]) }
}
