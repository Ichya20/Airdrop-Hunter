import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Campaign, Identity } from '../../domain/types'
import type { LocalStorageAdapter } from '../../storage'
import { identityKey } from '../wallet/identity'
import { createEligibilityController } from './controller'

interface Options {
  storage: LocalStorageAdapter
  identity: Identity
  campaigns: readonly Campaign[]
  ready: boolean
  contextKey: string
  onSaved: () => void | Promise<void>
}

export function useEligibility({ storage, identity, campaigns, ready, contextKey, onSaved }: Options) {
  const controller = useMemo(() => createEligibilityController({ storage }), [storage])
  controller.setOnSaved(onSaved)
  // Invalidate old requests during the render that changes identity/source mode.
  controller.configure({ identity, campaigns, ready, contextKey }, false)
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const accountScope = identityKey(identity)

  useEffect(() => { void controller.load() }, [controller, accountScope, campaigns, ready, contextKey])
  useEffect(() => () => controller.cancel(), [controller])

  return {
    ...snapshot,
    recheck: useCallback((campaign: Campaign, proofJson?: string) => controller.recheck(campaign, proofJson), [controller]),
    invalidate: useCallback(() => controller.invalidate(), [controller]),
  }
}
