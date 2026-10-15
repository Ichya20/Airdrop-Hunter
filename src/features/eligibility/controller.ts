import { checkEligibility, getEligibilityAdapter, resolveEligibility } from '../../adapters/eligibility'
import type { Campaign, EligibilityResult, Identity } from '../../domain/types'
import type { LocalStorageAdapter } from '../../storage'
import { buildScanRecordKey, isRecordMatchingIdentity } from '../../storage/keys'
import type { StoredScanRecord } from '../../storage/types'
import { resolveTransaction } from '../claims/resolveTransaction'
import { identityKey, walletAccountKey } from '../wallet/identity'

export interface EligibilityContext {
  identity: Identity
  campaigns: readonly Campaign[]
  ready: boolean
  contextKey: string
}

export interface EligibilitySnapshot {
  records: ReadonlyMap<string, StoredScanRecord>
  pendingIds: ReadonlySet<string>
}

interface PendingCheck {
  controller: AbortController
  promise: Promise<void>
  proofJson: string | undefined
}

interface Dependencies {
  storage: LocalStorageAdapter
  check?: typeof checkEligibility
  now?: () => number
  onSaved?: () => void | Promise<void>
}

/** Owns eligibility writes, so a cache load cannot overwrite a newer check. */
export function createEligibilityController({ storage, check = checkEligibility, now = Date.now, onSaved }: Dependencies) {
  let context: EligibilityContext | null = null
  let scope = ''
  let epoch = 0
  let loadId = 0
  let blockedScope: string | null = null
  let snapshot: EligibilitySnapshot = { records: new Map(), pendingIds: new Set() }
  let writes: Promise<void> = Promise.resolve()
  const listeners = new Set<() => void>()
  const pending = new Map<string, PendingCheck>()
  const proofs = new Map<string, string>()

  const publish = (next: EligibilitySnapshot, notify = true) => {
    snapshot = next
    if (notify) for (const listener of listeners) listener()
  }

  const reset = (notify: boolean) => {
    epoch += 1
    loadId += 1
    for (const request of pending.values()) request.controller.abort()
    pending.clear()
    proofs.clear()
    publish({ records: new Map(), pendingIds: new Set() }, notify)
  }

  const currentCampaign = (campaign: Campaign) => context?.campaigns.some((item) =>
    item.id === campaign.id && item.chainId === campaign.chainId && item.adapterVersion === campaign.adapterVersion,
  ) === true

  const enabled = () => context?.ready === true && blockedScope !== scope

  const recordFor = (
    campaign: Campaign,
    identity: Identity,
    eligibility: EligibilityResult,
    cached?: StoredScanRecord,
  ): StoredScanRecord => ({
    key: buildScanRecordKey({ identity, chainId: campaign.chainId, campaignId: campaign.id, adapterVersion: campaign.adapterVersion }),
    addressScope: walletAccountKey(identity),
    chainId: campaign.chainId,
    campaignId: campaign.id,
    adapterVersion: campaign.adapterVersion,
    campaign,
    eligibility,
    tx: resolveTransaction(campaign, identity, cached),
    savedAt: new Date(now()).toISOString(),
  })

  const setRecord = (record: StoredScanRecord) => {
    const records = new Map(snapshot.records)
    records.set(record.campaignId, record)
    publish({ ...snapshot, records })
  }

  const configure = (next: EligibilityContext, notify = true) => {
    const nextScope = `${identityKey(next.identity)}::${next.contextKey}`
    if (nextScope !== scope || context?.ready !== next.ready) {
      reset(notify)
      if (nextScope !== scope || !next.ready) blockedScope = null
      scope = nextScope
    }
    context = next
  }

  const load = async () => {
    if (!enabled() || !context) return
    const capturedEpoch = epoch
    const capturedLoad = ++loadId
    const { identity, campaigns } = context
    try {
      const loaded = await storage.loadScanRecordsForIdentity(identity, campaigns)
      if (epoch !== capturedEpoch || capturedLoad !== loadId || !enabled()) return
      // A check may have completed while IndexedDB was loading the older record.
      for (const campaign of context?.campaigns ?? []) {
        const local = snapshot.records.get(campaign.id)
        if (local && isRecordMatchingIdentity(local, identity, campaign)) loaded.set(campaign.id, local)
      }
      publish({ ...snapshot, records: loaded })
      if (walletAccountKey(identity) === 'none') return
      const active = () => epoch === capturedEpoch && capturedLoad === loadId && enabled()
      const write = writes.catch(() => {}).then(async () => {
        if (!active()) return
        // Preserve scan persistence without overwriting an eligibility refresh.
        const latest = await storage.loadScanRecordsForIdentity(identity, campaigns)
        if (!active()) return
        const missing = campaigns.filter((campaign) => currentCampaign(campaign) && !latest.has(campaign.id) && !snapshot.pendingIds.has(campaign.id))
        const entries = missing.map((campaign) => ({
          campaign,
          eligibility: resolveEligibility(campaign, identity),
          tx: resolveTransaction(campaign, identity),
        }))
        if (entries.length === 0) return
        await storage.saveScanRecordsForIdentity(identity, entries)
        if (!active()) return
        const records = new Map(snapshot.records)
        for (const entry of entries) {
          if (!records.has(entry.campaign.id)) records.set(entry.campaign.id, recordFor(entry.campaign, identity, entry.eligibility))
        }
        publish({ ...snapshot, records })
        try { await onSaved?.() } catch { /* Statistics do not change scan data. */ }
      })
      writes = write
      await write
    } catch {
      // No cached eligibility is safer than inventing a result after a storage failure.
    }
  }

  const recheck = (campaign: Campaign, proofJson?: string): Promise<void> => {
    if (!enabled() || !context || !currentCampaign(campaign)) return Promise.resolve()
    const capturedEpoch = epoch
    const { identity } = context
    const adapter = getEligibilityAdapter(campaign)
    const key = `${scope}::${campaign.chainId}::${campaign.id}::${campaign.adapterVersion}::${adapter?.rule ?? 'unsupported'}`
    const requestedProof = proofJson ?? proofs.get(key)
    const existing = pending.get(key)
    if (existing && existing.proofJson === requestedProof) return existing.promise
    // A newly submitted proof replaces an earlier check that had no proof.
    existing?.controller.abort()
    const request: PendingCheck = {
      controller: new AbortController(),
      promise: Promise.resolve(),
      proofJson: requestedProof,
    }
    pending.set(key, request)
    const active = () => epoch === capturedEpoch && enabled() && currentCampaign(campaign) && pending.get(key) === request
    const unknown = (reason: string, checkedAt: string | null): EligibilityResult => ({
      status: 'unknown', reason, rule: adapter?.rule ?? null,
      source: adapter?.source ?? 'Tidak ada adapter eligibility resmi', checkedAt,
    })
    const pendingIds = new Set(snapshot.pendingIds)
    pendingIds.add(campaign.id)
    const records = new Map(snapshot.records)
    records.set(campaign.id, recordFor(campaign, identity, unknown('Sedang memeriksa ulang kelayakan alamat ini.', null), snapshot.records.get(campaign.id)))
    publish({ records, pendingIds })

    request.promise = (async () => {
      let result: EligibilityResult
      try {
        result = await check(campaign, identity, { proofJson: requestedProof, signal: request.controller.signal })
      } catch {
        result = unknown('Pemeriksaan sumber gagal. Kelayakan tetap belum diketahui; coba periksa ulang.', new Date(now()).toISOString())
      }
      if (!active()) return
      if (requestedProof !== undefined && (result.status === 'eligible' || result.status === 'ineligible')) {
        proofs.set(key, requestedProof)
      } else {
        proofs.delete(key)
      }
      const write = writes.catch(() => {}).then(async () => {
        if (!active()) return
        try {
          // Reload immediately before saving to preserve transaction history.
          const latest = await storage.loadScanRecordsForIdentity(identity, [campaign])
          if (!active()) return
          const record = recordFor(campaign, identity, result, latest.get(campaign.id) ?? snapshot.records.get(campaign.id))
          if (walletAccountKey(identity) !== 'none') {
            await storage.saveScanRecordsForIdentity(identity, [{ campaign, eligibility: result, tx: record.tx }])
          }
          if (!active()) return
          setRecord(record)
          try { await onSaved?.() } catch { /* Storage statistics do not change a verified result. */ }
        } catch {
          if (active()) setRecord(recordFor(campaign, identity, unknown('Hasil belum dapat disimpan secara lokal. Periksa ulang sebelum melanjutkan.', new Date(now()).toISOString()), snapshot.records.get(campaign.id)))
        }
      })
      writes = write
      await write
    })().finally(() => {
      if (pending.get(key) !== request) return
      pending.delete(key)
      if (epoch !== capturedEpoch) return
      const remaining = new Set(snapshot.pendingIds)
      remaining.delete(campaign.id)
      publish({ ...snapshot, pendingIds: remaining })
    })
    return request.promise
  }

  return {
    configure,
    load,
    recheck,
    setOnSaved(callback: Dependencies['onSaved']) { onSaved = callback },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    cancel() { reset(false) },
    /** Invalidate synchronously, then drain writes before import/clear replaces storage. */
    invalidate(): Promise<void> {
      blockedScope = scope
      reset(true)
      return writes.catch(() => {})
    },
  }
}
