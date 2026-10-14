import type { SourceMode } from '../adapters/sources'
import { DEMO_SCENARIOS, type DemoScenario } from '../demo/demoSources'
import { checkAddressInput, looksLikeSecret } from '../domain/address'
import type { Campaign, EligibilityResult, Identity, TxRecord } from '../domain/types'
import { walletAccountKey } from '../features/wallet/identity'
import { buildScanRecordKey, formatScanRecordKey, isRecordMatchingIdentity } from './keys'
import {
  STORAGE_DB_NAME,
  STORAGE_SCHEMA_VERSION,
  type ImportBackupResult,
  type StorageBackupBundle,
  type StorageStats,
  type StoredScanRecord,
  type StoredSettings,
  type StoredSourceCheckpoint,
  type StoredWatchlistRecord,
} from './types'

const STORE_SETTINGS = 'settings'
const STORE_WATCHLISTS = 'watchlists'
const STORE_SCAN_RECORDS = 'scan_records'
const STORE_CHECKPOINTS = 'source_checkpoints'

const VALID_SCENARIOS = new Set<DemoScenario>(DEMO_SCENARIOS.map((item) => item.value))
const VALID_SOURCE_MODES = new Set<SourceMode>(['all', 'live', 'demo'])

/** Validasi objek Identity agar tidak pernah memuat private key/seed phrase atau alamat cacat. */
export function sanitizeIdentity(raw: unknown): Identity | null {
  if (typeof raw !== 'object' || raw === null || !('kind' in raw)) return null
  const kind = (raw as { kind: unknown }).kind
  if (kind === 'none') return { kind: 'none' }
  if (kind === 'demo') return { kind: 'demo' }
  if (kind === 'watch') {
    const addressRaw = (raw as { address?: unknown }).address
    if (typeof addressRaw !== 'string') return null
    const checked = checkAddressInput(addressRaw)
    if (!checked.ok) return null
    return { kind: 'watch', address: checked.address }
  }
  if (kind === 'metamask') {
    const addressRaw = (raw as { address?: unknown }).address
    const chainIdRaw = (raw as { chainId?: unknown }).chainId
    if (typeof addressRaw !== 'string' || typeof chainIdRaw !== 'number') return null
    if (!Number.isInteger(chainIdRaw) || chainIdRaw <= 0) return null
    const checked = checkAddressInput(addressRaw)
    if (!checked.ok) return null
    return { kind: 'metamask', address: checked.address, chainId: chainIdRaw }
  }
  return null
}

/** Periksa apakah sebuah nilai JSON mengandung string yang menyerupai private key atau seed phrase. */
function containsSecretDeep(value: unknown): boolean {
  if (typeof value === 'string') {
    return looksLikeSecret(value) !== null
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSecretDeep(item))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((item) => containsSecretDeep(item))
  }
  return false
}

/**
 * Migrasi payload backup dari versi skema lama (v1) ke versi saat ini (v2).
 */
export function migrateBackupPayload(raw: unknown): {
  ok: true
  migratedFromVersion: number
  bundle: StorageBackupBundle
} | {
  ok: false
  message: string
} {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'Format file cadangan tidak valid (bukan objek JSON).' }
  }
  if (containsSecretDeep(raw)) {
    return {
      ok: false,
      message:
        'File cadangan ditolak karena mengandung teks yang menyerupai private key atau seed phrase.',
    }
  }

  const record = raw as Record<string, unknown>
  if (record.app !== 'airdrop-hunter') {
    return { ok: false, message: 'File JSON ini bukan cadangan resmi AirdropHunter.' }
  }

  const version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 1
  if (!Number.isInteger(version) || version < 1 || version > STORAGE_SCHEMA_VERSION) {
    return {
      ok: false,
      message: `Versi skema cadangan (${String(record.schemaVersion)}) tidak didukung oleh aplikasi ini (maksimal v${STORAGE_SCHEMA_VERSION}).`,
    }
  }

  const nowIso = new Date().toISOString()

  let settings: StoredSettings | null = null
  if (typeof record.settings === 'object' && record.settings !== null) {
    const s = record.settings as Record<string, unknown>
    const identity = sanitizeIdentity(s.identity) ?? { kind: 'demo' }
    const scenario =
      typeof s.scenario === 'string' && VALID_SCENARIOS.has(s.scenario as DemoScenario)
        ? (s.scenario as DemoScenario)
        : 'normal'
    const sourceMode =
      typeof s.sourceMode === 'string' && VALID_SOURCE_MODES.has(s.sourceMode as SourceMode)
        ? (s.sourceMode as SourceMode)
        : 'all'
    const scanTtlMs =
      typeof s.scanTtlMs === 'number' && Number.isFinite(s.scanTtlMs) && s.scanTtlMs >= 60_000
        ? s.scanTtlMs
        : 60 * 60_000
    settings = {
      id: 'app-settings',
      schemaVersion: STORAGE_SCHEMA_VERSION,
      identity,
      scenario,
      sourceMode,
      scanTtlMs,
      updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : nowIso,
    }
  }

  const watchlists: StoredWatchlistRecord[] = []
  if (Array.isArray(record.watchlists)) {
    for (const item of record.watchlists) {
      if (typeof item !== 'object' || item === null) continue
      const w = item as Record<string, unknown>
      const rawKey = typeof w.accountKey === 'string' ? w.accountKey : typeof w.identityKey === 'string' ? w.identityKey : null
      if (!rawKey || rawKey === 'none') continue
      const campaignIds = Array.isArray(w.campaignIds)
        ? Array.from(new Set(w.campaignIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')))
        : []
      watchlists.push({
        accountKey: rawKey,
        campaignIds,
        updatedAt: typeof w.updatedAt === 'string' ? w.updatedAt : nowIso,
      })
    }
  }

  const scanRecords: StoredScanRecord[] = []
  if (Array.isArray(record.scanRecords)) {
    for (const item of record.scanRecords) {
      if (typeof item !== 'object' || item === null) continue
      const r = item as Record<string, unknown>
      const addressScope =
        typeof r.addressScope === 'string'
          ? r.addressScope
          : typeof r.identityKey === 'string'
            ? r.identityKey
            : null
      const chainId = typeof r.chainId === 'number' ? r.chainId : null
      const campaignId = typeof r.campaignId === 'string' ? r.campaignId : null
      const adapterVersion =
        typeof r.adapterVersion === 'string' && r.adapterVersion.trim() !== ''
          ? r.adapterVersion
          : '1.0.0'
      if (!addressScope || !chainId || !campaignId || typeof r.campaign !== 'object' || r.campaign === null) {
        continue
      }
      const key = formatScanRecordKey({ addressScope, chainId, campaignId, adapterVersion })
      scanRecords.push({
        key,
        addressScope,
        chainId,
        campaignId,
        adapterVersion,
        campaign: r.campaign as Campaign,
        eligibility: (r.eligibility as EligibilityResult) ?? {
          status: 'unknown',
          reason: 'Dipulihkan dari cadangan lokal.',
          rule: null,
          source: 'Cadangan lokal',
          checkedAt: null,
        },
        tx: (r.tx as TxRecord | null) ?? null,
        savedAt: typeof r.savedAt === 'string' ? r.savedAt : nowIso,
      })
    }
  }

  const sourceCheckpoints: StoredSourceCheckpoint[] = []
  if (Array.isArray(record.sourceCheckpoints)) {
    for (const item of record.sourceCheckpoints) {
      if (typeof item !== 'object' || item === null) continue
      const c = item as Record<string, unknown>
      if (typeof c.sourceId !== 'string' || !Array.isArray(c.campaigns)) continue
      sourceCheckpoints.push({
        sourceId: c.sourceId,
        lastSuccessAt: typeof c.lastSuccessAt === 'string' ? c.lastSuccessAt : null,
        campaigns: c.campaigns as Campaign[],
        updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : nowIso,
      })
    }
  }

  return {
    ok: true,
    migratedFromVersion: version,
    bundle: {
      app: 'airdrop-hunter',
      schemaVersion: STORAGE_SCHEMA_VERSION,
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : nowIso,
      settings,
      watchlists,
      scanRecords,
      sourceCheckpoints,
    },
  }
}

export interface LocalStorageAdapter {
  readonly backend: 'indexeddb' | 'memory'
  loadSettings(): Promise<StoredSettings | null>
  saveSettings(settings: Omit<StoredSettings, 'id' | 'schemaVersion' | 'updatedAt'>): Promise<StoredSettings>
  loadWatchlist(identity: Identity): Promise<string[]>
  saveWatchlist(identity: Identity, campaignIds: readonly string[]): Promise<void>
  loadAllWatchlists(): Promise<Record<string, string[]>>
  saveScanRecordsForIdentity(
    identity: Identity,
    entries: readonly {
      campaign: Campaign
      eligibility: EligibilityResult
      tx: TxRecord | null
    }[],
  ): Promise<void>
  loadScanRecordsForIdentity(
    identity: Identity,
    campaigns: readonly Campaign[],
  ): Promise<Map<string, StoredScanRecord>>
  saveSourceCheckpoints(checkpoints: readonly StoredSourceCheckpoint[]): Promise<void>
  loadSourceCheckpoints(): Promise<StoredSourceCheckpoint[]>
  getStats(): Promise<StorageStats>
  exportBackup(): Promise<StorageBackupBundle>
  importBackup(rawJson: string): Promise<ImportBackupResult>
  clearAll(): Promise<void>
}

export function createMemoryStorage(): LocalStorageAdapter {
  let settings: StoredSettings | null = null
  const watchlists = new Map<string, StoredWatchlistRecord>()
  const scanRecords = new Map<string, StoredScanRecord>()
  const checkpoints = new Map<string, StoredSourceCheckpoint>()

  return {
    backend: 'memory',

    async loadSettings() {
      return settings ? { ...settings } : null
    },

    async saveSettings(input) {
      const next: StoredSettings = {
        id: 'app-settings',
        schemaVersion: STORAGE_SCHEMA_VERSION,
        identity: input.identity,
        scenario: input.scenario,
        sourceMode: input.sourceMode ?? 'all',
        scanTtlMs: input.scanTtlMs,
        updatedAt: new Date().toISOString(),
      }
      settings = next
      return { ...next }
    },

    async loadWatchlist(identity) {
      const key = walletAccountKey(identity)
      if (key === 'none') return []
      return [...(watchlists.get(key)?.campaignIds ?? [])]
    },

    async saveWatchlist(identity, campaignIds) {
      const key = walletAccountKey(identity)
      if (key === 'none') return
      watchlists.set(key, {
        accountKey: key,
        campaignIds: Array.from(new Set(campaignIds)),
        updatedAt: new Date().toISOString(),
      })
    },

    async loadAllWatchlists() {
      const result: Record<string, string[]> = {}
      for (const [key, value] of watchlists.entries()) {
        result[key] = [...value.campaignIds]
      }
      return result
    },

    async saveScanRecordsForIdentity(identity, entries) {
      const addressScope = walletAccountKey(identity)
      if (addressScope === 'none') return
      const nowIso = new Date().toISOString()
      for (const entry of entries) {
        const key = buildScanRecordKey({
          identity,
          chainId: entry.campaign.chainId,
          campaignId: entry.campaign.id,
          adapterVersion: entry.campaign.adapterVersion,
        })
        scanRecords.set(key, {
          key,
          addressScope,
          chainId: entry.campaign.chainId,
          campaignId: entry.campaign.id,
          adapterVersion: entry.campaign.adapterVersion,
          campaign: entry.campaign,
          eligibility: entry.eligibility,
          tx: entry.tx,
          savedAt: nowIso,
        })
      }
    },

    async loadScanRecordsForIdentity(identity, campaigns) {
      const matched = new Map<string, StoredScanRecord>()
      if (walletAccountKey(identity) === 'none') return matched
      for (const campaign of campaigns) {
        const key = buildScanRecordKey({
          identity,
          chainId: campaign.chainId,
          campaignId: campaign.id,
          adapterVersion: campaign.adapterVersion,
        })
        const record = scanRecords.get(key)
        if (record && isRecordMatchingIdentity(record, identity, campaign)) {
          matched.set(campaign.id, record)
        }
      }
      return matched
    },

    async saveSourceCheckpoints(items) {
      for (const item of items) {
        checkpoints.set(item.sourceId, {
          ...item,
          campaigns: [...item.campaigns],
        })
      }
    },

    async loadSourceCheckpoints() {
      return Array.from(checkpoints.values()).map((item) => ({
        ...item,
        campaigns: [...item.campaigns],
      }))
    },

    async getStats() {
      return {
        backend: 'memory',
        schemaVersion: STORAGE_SCHEMA_VERSION,
        watchlistCount: watchlists.size,
        scanRecordCount: scanRecords.size,
        checkpointCount: checkpoints.size,
      }
    },

    async exportBackup() {
      return {
        app: 'airdrop-hunter',
        schemaVersion: STORAGE_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        settings: settings ? { ...settings } : null,
        watchlists: Array.from(watchlists.values()),
        scanRecords: Array.from(scanRecords.values()),
        sourceCheckpoints: Array.from(checkpoints.values()),
      }
    },

    async importBackup(rawJson) {
      let parsed: unknown
      try {
        parsed = JSON.parse(rawJson)
      } catch {
        return { ok: false, message: 'File tidak dapat dibaca sebagai JSON yang valid.' }
      }
      const migrated = migrateBackupPayload(parsed)
      if (!migrated.ok) return migrated

      const { bundle, migratedFromVersion } = migrated
      settings = bundle.settings
      watchlists.clear()
      for (const w of bundle.watchlists) {
        watchlists.set(w.accountKey, w)
      }
      scanRecords.clear()
      for (const r of bundle.scanRecords) {
        scanRecords.set(r.key, r)
      }
      checkpoints.clear()
      for (const c of bundle.sourceCheckpoints) {
        checkpoints.set(c.sourceId, c)
      }
      return {
        ok: true,
        migratedFromVersion,
        importedWatchlists: bundle.watchlists.length,
        importedScanRecords: bundle.scanRecords.length,
        importedCheckpoints: bundle.sourceCheckpoints.length,
      }
    },

    async clearAll() {
      settings = null
      watchlists.clear()
      scanRecords.clear()
      checkpoints.clear()
    },
  }
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Operasi IndexedDB gagal'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transaksi IndexedDB gagal'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'))
  })
}

function openDatabase(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, STORAGE_SCHEMA_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      const oldVersion = event.oldVersion

      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORE_WATCHLISTS)) {
          db.createObjectStore(STORE_WATCHLISTS, { keyPath: 'accountKey' })
        }
        if (!db.objectStoreNames.contains(STORE_SCAN_RECORDS)) {
          const scanStore = db.createObjectStore(STORE_SCAN_RECORDS, { keyPath: 'key' })
          scanStore.createIndex('by_address_scope', 'addressScope', { unique: false })
        }
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
          db.createObjectStore(STORE_CHECKPOINTS, { keyPath: 'sourceId' })
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Gagal membuka IndexedDB'))
  })
}

export function createBrowserStorage(dbName = STORAGE_DB_NAME): LocalStorageAdapter {
  if (typeof window === 'undefined' || !('indexedDB' in window) || window.indexedDB === null) {
    return createMemoryStorage()
  }

  const fallback = createMemoryStorage()
  let dbPromise: Promise<IDBDatabase> | null = null
  let useFallback = false

  const getDb = async (): Promise<IDBDatabase | null> => {
    if (useFallback) return null
    if (!dbPromise) {
      dbPromise = openDatabase(dbName).catch(() => {
        useFallback = true
        return null as unknown as IDBDatabase
      })
    }
    const db = await dbPromise
    if (!db) {
      useFallback = true
      return null
    }
    return db
  }

  return {
    get backend() {
      return useFallback ? 'memory' : 'indexeddb'
    },

    async loadSettings() {
      const db = await getDb()
      if (!db) return fallback.loadSettings()
      const tx = db.transaction(STORE_SETTINGS, 'readonly')
      const raw = await reqToPromise(tx.objectStore(STORE_SETTINGS).get('app-settings'))
      if (!raw || typeof raw !== 'object') return null
      const candidate = raw as StoredSettings
      const cleanIdentity = sanitizeIdentity(candidate.identity)
      if (!cleanIdentity) return null
      return {
        ...candidate,
        identity: cleanIdentity,
        sourceMode:
          candidate.sourceMode && VALID_SOURCE_MODES.has(candidate.sourceMode)
            ? candidate.sourceMode
            : 'all',
      }
    },

    async saveSettings(input) {
      const db = await getDb()
      if (!db) return fallback.saveSettings(input)
      const next: StoredSettings = {
        id: 'app-settings',
        schemaVersion: STORAGE_SCHEMA_VERSION,
        identity: input.identity,
        scenario: input.scenario,
        sourceMode: input.sourceMode ?? 'all',
        scanTtlMs: input.scanTtlMs,
        updatedAt: new Date().toISOString(),
      }
      const tx = db.transaction(STORE_SETTINGS, 'readwrite')
      tx.objectStore(STORE_SETTINGS).put(next)
      await txDone(tx)
      return next
    },

    async loadWatchlist(identity) {
      const db = await getDb()
      if (!db) return fallback.loadWatchlist(identity)
      const key = walletAccountKey(identity)
      if (key === 'none') return []
      const tx = db.transaction(STORE_WATCHLISTS, 'readonly')
      const record = (await reqToPromise(tx.objectStore(STORE_WATCHLISTS).get(key))) as
        | StoredWatchlistRecord
        | undefined
      return record ? [...record.campaignIds] : []
    },

    async saveWatchlist(identity, campaignIds) {
      const db = await getDb()
      if (!db) return fallback.saveWatchlist(identity, campaignIds)
      const key = walletAccountKey(identity)
      if (key === 'none') return
      const tx = db.transaction(STORE_WATCHLISTS, 'readwrite')
      const record: StoredWatchlistRecord = {
        accountKey: key,
        campaignIds: Array.from(new Set(campaignIds)),
        updatedAt: new Date().toISOString(),
      }
      tx.objectStore(STORE_WATCHLISTS).put(record)
      await txDone(tx)
    },

    async loadAllWatchlists() {
      const db = await getDb()
      if (!db) return fallback.loadAllWatchlists()
      const tx = db.transaction(STORE_WATCHLISTS, 'readonly')
      const all = (await reqToPromise(tx.objectStore(STORE_WATCHLISTS).getAll())) as StoredWatchlistRecord[]
      const map: Record<string, string[]> = {}
      for (const item of all) {
        if (item?.accountKey && Array.isArray(item.campaignIds)) {
          map[item.accountKey] = [...item.campaignIds]
        }
      }
      return map
    },

    async saveScanRecordsForIdentity(identity, entries) {
      const db = await getDb()
      if (!db) return fallback.saveScanRecordsForIdentity(identity, entries)
      const addressScope = walletAccountKey(identity)
      if (addressScope === 'none' || entries.length === 0) return
      const nowIso = new Date().toISOString()
      const tx = db.transaction(STORE_SCAN_RECORDS, 'readwrite')
      const store = tx.objectStore(STORE_SCAN_RECORDS)
      for (const entry of entries) {
        const key = buildScanRecordKey({
          identity,
          chainId: entry.campaign.chainId,
          campaignId: entry.campaign.id,
          adapterVersion: entry.campaign.adapterVersion,
        })
        const record: StoredScanRecord = {
          key,
          addressScope,
          chainId: entry.campaign.chainId,
          campaignId: entry.campaign.id,
          adapterVersion: entry.campaign.adapterVersion,
          campaign: entry.campaign,
          eligibility: entry.eligibility,
          tx: entry.tx,
          savedAt: nowIso,
        }
        store.put(record)
      }
      await txDone(tx)
    },

    async loadScanRecordsForIdentity(identity, campaigns) {
      const db = await getDb()
      if (!db) return fallback.loadScanRecordsForIdentity(identity, campaigns)
      const matched = new Map<string, StoredScanRecord>()
      if (walletAccountKey(identity) === 'none' || campaigns.length === 0) return matched
      const tx = db.transaction(STORE_SCAN_RECORDS, 'readonly')
      const store = tx.objectStore(STORE_SCAN_RECORDS)
      for (const campaign of campaigns) {
        const key = buildScanRecordKey({
          identity,
          chainId: campaign.chainId,
          campaignId: campaign.id,
          adapterVersion: campaign.adapterVersion,
        })
        const record = (await reqToPromise(store.get(key))) as StoredScanRecord | undefined
        if (record && isRecordMatchingIdentity(record, identity, campaign)) {
          matched.set(campaign.id, record)
        }
      }
      return matched
    },

    async saveSourceCheckpoints(items) {
      const db = await getDb()
      if (!db) return fallback.saveSourceCheckpoints(items)
      if (items.length === 0) return
      const tx = db.transaction(STORE_CHECKPOINTS, 'readwrite')
      const store = tx.objectStore(STORE_CHECKPOINTS)
      for (const item of items) {
        store.put(item)
      }
      await txDone(tx)
    },

    async loadSourceCheckpoints() {
      const db = await getDb()
      if (!db) return fallback.loadSourceCheckpoints()
      const tx = db.transaction(STORE_CHECKPOINTS, 'readonly')
      const all = (await reqToPromise(tx.objectStore(STORE_CHECKPOINTS).getAll())) as StoredSourceCheckpoint[]
      return Array.isArray(all) ? all : []
    },

    async getStats() {
      const db = await getDb()
      if (!db) return fallback.getStats()
      const tx = db.transaction([STORE_WATCHLISTS, STORE_SCAN_RECORDS, STORE_CHECKPOINTS], 'readonly')
      const [watchlistCount, scanRecordCount, checkpointCount] = await Promise.all([
        reqToPromise(tx.objectStore(STORE_WATCHLISTS).count()),
        reqToPromise(tx.objectStore(STORE_SCAN_RECORDS).count()),
        reqToPromise(tx.objectStore(STORE_CHECKPOINTS).count()),
      ])
      return {
        backend: 'indexeddb',
        schemaVersion: STORAGE_SCHEMA_VERSION,
        watchlistCount,
        scanRecordCount,
        checkpointCount,
      }
    },

    async exportBackup() {
      const db = await getDb()
      if (!db) return fallback.exportBackup()
      const tx = db.transaction(
        [STORE_SETTINGS, STORE_WATCHLISTS, STORE_SCAN_RECORDS, STORE_CHECKPOINTS],
        'readonly',
      )
      const [rawSettings, watchlists, scanRecords, sourceCheckpoints] = await Promise.all([
        reqToPromise(tx.objectStore(STORE_SETTINGS).get('app-settings')),
        reqToPromise(tx.objectStore(STORE_WATCHLISTS).getAll()),
        reqToPromise(tx.objectStore(STORE_SCAN_RECORDS).getAll()),
        reqToPromise(tx.objectStore(STORE_CHECKPOINTS).getAll()),
      ])
      return {
        app: 'airdrop-hunter',
        schemaVersion: STORAGE_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        settings: (rawSettings as StoredSettings | undefined) ?? null,
        watchlists: (watchlists as StoredWatchlistRecord[]) ?? [],
        scanRecords: (scanRecords as StoredScanRecord[]) ?? [],
        sourceCheckpoints: (sourceCheckpoints as StoredSourceCheckpoint[]) ?? [],
      }
    },

    async importBackup(rawJson) {
      const db = await getDb()
      if (!db) return fallback.importBackup(rawJson)
      let parsed: unknown
      try {
        parsed = JSON.parse(rawJson)
      } catch {
        return { ok: false, message: 'File tidak dapat dibaca sebagai JSON yang valid.' }
      }
      const migrated = migrateBackupPayload(parsed)
      if (!migrated.ok) return migrated
      const { bundle, migratedFromVersion } = migrated

      const tx = db.transaction(
        [STORE_SETTINGS, STORE_WATCHLISTS, STORE_SCAN_RECORDS, STORE_CHECKPOINTS],
        'readwrite',
      )
      const settingsStore = tx.objectStore(STORE_SETTINGS)
      const watchlistStore = tx.objectStore(STORE_WATCHLISTS)
      const scanStore = tx.objectStore(STORE_SCAN_RECORDS)
      const checkpointStore = tx.objectStore(STORE_CHECKPOINTS)

      settingsStore.clear()
      watchlistStore.clear()
      scanStore.clear()
      checkpointStore.clear()

      if (bundle.settings) {
        settingsStore.put(bundle.settings)
      }
      for (const item of bundle.watchlists) {
        watchlistStore.put(item)
      }
      for (const item of bundle.scanRecords) {
        scanStore.put(item)
      }
      for (const item of bundle.sourceCheckpoints) {
        checkpointStore.put(item)
      }

      await txDone(tx)
      return {
        ok: true,
        migratedFromVersion,
        importedWatchlists: bundle.watchlists.length,
        importedScanRecords: bundle.scanRecords.length,
        importedCheckpoints: bundle.sourceCheckpoints.length,
      }
    },

    async clearAll() {
      const db = await getDb()
      if (!db) return fallback.clearAll()
      const tx = db.transaction(
        [STORE_SETTINGS, STORE_WATCHLISTS, STORE_SCAN_RECORDS, STORE_CHECKPOINTS],
        'readwrite',
      )
      tx.objectStore(STORE_SETTINGS).clear()
      tx.objectStore(STORE_WATCHLISTS).clear()
      tx.objectStore(STORE_SCAN_RECORDS).clear()
      tx.objectStore(STORE_CHECKPOINTS).clear()
      await txDone(tx)
    },
  }
}
