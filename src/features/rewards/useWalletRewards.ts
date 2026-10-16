import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { identityKey } from '../wallet/identity'
import { createWalletRewardsController, type WalletRewardsContext } from './controller'

export function useWalletRewards({ identity, scanKey, enabled }: WalletRewardsContext) {
  const controller = useMemo(() => createWalletRewardsController(), [])
  controller.configure({ identity, scanKey, enabled }, false)
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const accountScope = identityKey(identity)

  useEffect(() => { void controller.refresh() }, [controller, accountScope, scanKey, enabled])
  useEffect(() => () => controller.cancel(), [controller])

  return {
    ...snapshot,
    refresh: useCallback(() => controller.refresh(), [controller]),
    cancel: useCallback(() => controller.cancel(), [controller]),
  }
}
