import type { SourceMode } from '../adapters/sources'
import type { DemoScenario } from '../demo/demoSources'
import type { Campaign, EligibilityResult, Identity, TxRecord } from '../domain/types'

export const STORAGE_DB_NAME = 'airdrop-hunter-db'
export const STORAGE_SCHEMA_VERSION = 2

export interface StoredSettings {
  id: 'app-settings'
  schemaVersion: number
  identity: Identity
  scenario: DemoScenario
  sourceMode?: SourceMode
  scanTtlMs: number
  updatedAt: string
}

export interface StoredWatchlistRecord {
  /** Kunci akun terisolasi (`demo`, `watch:0x...`, `metamask:0x...`). */
  accountKey: string
  campaignIds: string[]
  updatedAt: string
}

/**
 * Catatan hasil scan & status per alamat + chain ID + campaign ID + versi adapter (R9).
 */
export interface StoredScanRecord {
  /** Kunci gabungan: `${addressScope}::${chainId}::${campaignId}::${adapterVersion}` */
  key: string
  addressScope: string
  chainId: number
  campaignId: string
  adapterVersion: string
  campaign: Campaign
  eligibility: EligibilityResult
  tx: TxRecord | null
  savedAt: string
}

export interface StoredSourceCheckpoint {
  sourceId: string
  /** Optional for older backups; current scanners use this to invalidate obsolete data. */
  adapterVersion?: string
  lastSuccessAt: string | null
  campaigns: Campaign[]
  updatedAt: string
}

export interface StorageBackupBundle {
  app: 'airdrop-hunter'
  schemaVersion: number
  exportedAt: string
  settings: StoredSettings | null
  watchlists: StoredWatchlistRecord[]
  scanRecords: StoredScanRecord[]
  sourceCheckpoints: StoredSourceCheckpoint[]
}

export interface StorageStats {
  backend: 'indexeddb' | 'memory'
  schemaVersion: number
  watchlistCount: number
  scanRecordCount: number
  checkpointCount: number
}

export type ImportBackupResult =
  | {
      ok: true
      migratedFromVersion: number
      importedWatchlists: number
      importedScanRecords: number
      importedCheckpoints: number
    }
  | {
      ok: false
      message: string
    }
