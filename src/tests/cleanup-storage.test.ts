import assert from 'node:assert/strict'
import {
  czech, english, french, italian, japanese, korean, portuguese,
  simplifiedChinese, spanish, traditionalChinese,
} from 'viem/accounts'
import type { Campaign, HexAddress, Identity } from '../domain/types'
import { createBrowserStorage, createMemoryStorage } from '../storage'
import { migrateBackupPayload } from '../storage/backupValidation'
import { buildScanRecordKey } from '../storage/keys'
import type { StorageBackupBundle } from '../storage/types'

const NOW = '2026-10-14T12:00:00.000Z'
const WALLET: HexAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const HASH: HexAddress = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
const ACCOUNT: Identity = { kind: 'metamask', address: WALLET, chainId: 42161 }

function makeCampaign(): Campaign {
  return {
    id: '42161:official-archive:old-drop',
    name: 'Official archive', project: 'Project', kind: 'token', chainId: 42161,
    status: 'ended', origin: 'live', sourceKind: 'local-archive', foundIn: ['source'],
    officialUrl: 'https://project.example', checkerUrl: null, sourceVerified: false,
    sourceEvidence: 'This official archive describes the previous campaign and its historical distribution details for readers who want more context',
    deadline: '2023-09-24T00:00:00.000Z', requirements: ['Read the historical announcement.'],
    allocation: null, claimMethod: 'unknown', contract: { chainId: 42161, address: WALLET },
    summary: 'An archived announcement with enough ordinary prose to ensure the old word count heuristic no longer blocks valid backups',
    checkedAt: NOW, adapterVersion: '1.1.0',
  }
}

async function makeBackup(): Promise<StorageBackupBundle> {
  const storage = createMemoryStorage()
  const campaign = makeCampaign()
  await storage.saveSettings({ identity: ACCOUNT, scenario: 'normal', sourceMode: 'live', scanTtlMs: 3_600_000 })
  await storage.saveWatchlist(ACCOUNT, [campaign.id])
  await storage.saveScanRecordsForIdentity(ACCOUNT, [{
    campaign,
    eligibility: { status: 'unknown', reason: 'No live eligibility adapter.', rule: null, source: 'Stored record', checkedAt: null },
    tx: { status: 'confirmed', hash: HASH, proof: HASH, updatedAt: NOW, note: 'Public transaction metadata.' },
  }])
  await storage.saveSourceCheckpoints([{
    sourceId: 'source', adapterVersion: '1.1.0', lastSuccessAt: NOW, campaigns: [campaign], updatedAt: NOW,
  }])
  return storage.exportBackup()
}

function setField(raw: unknown, path: string, value: unknown) {
  const segments = path.split('.')
  let cursor = raw as Record<string, unknown>
  for (const key of segments.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>
  cursor[segments[segments.length - 1]] = value
}

export async function runCleanupStorageTests(): Promise<{ passed: number; details: string[] }> {
  let passed = 0
  const details: string[] = []
  const step = async (name: string, fn: () => void | Promise<void>) => {
    await fn()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  await step('Backup: exported transaction hashes and public hash proofs survive import', async () => {
    const backup = await makeBackup()
    const restored = createMemoryStorage()
    assert.equal((await restored.importBackup(JSON.stringify(backup))).ok, true)
    const records = await restored.loadScanRecordsForIdentity(ACCOUNT, [makeCampaign()])
    assert.equal(records.get(makeCampaign().id)?.tx?.hash, HASH)
    assert.equal(records.get(makeCampaign().id)?.tx?.proof, HASH)
    assert.deepEqual(await restored.loadWatchlist(ACCOUNT), [makeCampaign().id])
    assert.deepEqual(await restored.loadSourceCheckpoints(), backup.sourceCheckpoints)
  })

  await step('Storage: pembacaan IndexedDB dibatch dan tetap menolak record akun atau versi lain', async () => {
    const backup = await makeBackup()
    const template = backup.scanRecords[0]
    const campaigns = Array.from({ length: 4 }, (_, index) => ({ ...makeCampaign(), id: `42161:batch:${index}` }))
    const stored = new Map(campaigns.map((campaign) => {
      const key = buildScanRecordKey({ identity: ACCOUNT, chainId: campaign.chainId,
        campaignId: campaign.id, adapterVersion: campaign.adapterVersion })
      return [key, { ...template, key, campaignId: campaign.id, campaign }]
    }))
    stored.get([...stored.keys()][1])!.addressScope = 'watch:0x1111111111111111111111111111111111111111'
    stored.get([...stored.keys()][2])!.adapterVersion = 'different-version'
    stored.delete([...stored.keys()][3])
    let pending = 0
    let maxPending = 0
    const db = {
      transaction: () => ({ objectStore: () => ({ get: (key: string) => {
        const request = {} as IDBRequest
        pending += 1
        maxPending = Math.max(maxPending, pending)
        queueMicrotask(() => {
          pending -= 1
          Object.assign(request, { result: stored.get(key) })
          request.onsuccess?.(new Event('success'))
        })
        return request
      } }) }),
    }
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { indexedDB: { open: () => {
      const request = {} as IDBOpenDBRequest
      queueMicrotask(() => {
        Object.assign(request, { result: db })
        request.onsuccess?.(new Event('success'))
      })
      return request
    } } } })
    try {
      const storage = createBrowserStorage('batch-read-test')
      const records = await storage.loadScanRecordsForIdentity(ACCOUNT, campaigns)
      assert.equal(maxPending, campaigns.length, 'Seluruh get harus masuk antrean sebelum menunggu hasil')
      assert.deepEqual([...records.keys()], [campaigns[0].id])
      assert.equal((await storage.loadScanRecordsForIdentity({ kind: 'none' }, campaigns)).size, 0)
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
      else Reflect.deleteProperty(globalThis, 'window')
    }
  })

  await step('Backup: long source prose, archive metadata, and old checkpoints remain valid', async () => {
    const backup = await makeBackup()
    delete backup.sourceCheckpoints[0].adapterVersion
    const migrated = migrateBackupPayload(backup)
    assert.equal(migrated.ok, true)
    if (migrated.ok) {
      assert.equal(migrated.bundle.scanRecords[0].campaign.sourceEvidence, makeCampaign().sourceEvidence)
      assert.equal(migrated.bundle.scanRecords[0].campaign.sourceKind, 'local-archive')
      assert.equal(migrated.bundle.sourceCheckpoints[0].adapterVersion, undefined)
    }
  })

  await step('Backup: malformed root, settings, watchlist, campaign, eligibility, tx and checkpoint fields are rejected', async () => {
    const valid = await makeBackup()
    const corruptions: [string, unknown][] = [
      ['schemaVersion', '2'], ['exportedAt', 'yesterday'], ['settings', []], ['watchlists', {}],
      ['settings.identity.kind', 'walletconnect'], ['settings.identity.address', HASH],
      ['settings.identity.chainId', -1], ['settings.scenario', 'made-up'], ['settings.sourceMode', 'bad-mode'],
      ['settings.scanTtlMs', 12], ['settings.schemaVersion', 1], ['settings.updatedAt', '2026-02-31T00:00:00Z'],
      ['watchlists.0.accountKey', '__proto__'], ['watchlists.0.campaignIds', [123]],
      ['scanRecords.0.chainId', 1], ['scanRecords.0.campaignId', 'different'],
      ['scanRecords.0.adapterVersion', '0.0.0'], ['scanRecords.0.key', 'wrong'],
      ['scanRecords.0.campaign', null], ['scanRecords.0.campaign.name', 123],
      ['scanRecords.0.campaign.kind', 'bad-kind'], ['scanRecords.0.campaign.origin', 'bad-origin'],
      ['scanRecords.0.campaign.status', 'bad-status'], ['scanRecords.0.campaign.sourceVerified', 'true'],
      ['scanRecords.0.campaign.sourceKind', 'scraped'], ['scanRecords.0.campaign.foundIn', [null]],
      ['scanRecords.0.campaign.requirements', ['ok', 123]], ['scanRecords.0.campaign.allocation', 100],
      ['scanRecords.0.campaign.deadline', false], ['scanRecords.0.campaign.checkedAt', 'not-a-time'],
      ['scanRecords.0.campaign.claimMethod', 'auto-claim'], ['scanRecords.0.campaign.contract.chainId', 1],
      ['scanRecords.0.campaign.contract.address', HASH], ['scanRecords.0.campaign.officialUrl', 'javascript:alert(1)'],
      ['scanRecords.0.campaign.checkerUrl', 'https://user:secret@project.example'],
      ['scanRecords.0.eligibility.status', 'ready'], ['scanRecords.0.eligibility.reason', {}],
      ['scanRecords.0.eligibility.rule', 42], ['scanRecords.0.eligibility.checkedAt', false],
      ['scanRecords.0.tx.status', 'claimed'], ['scanRecords.0.tx.hash', WALLET],
      ['scanRecords.0.tx.proof', []], ['scanRecords.0.tx.updatedAt', 'tomorrow'], ['scanRecords.0.tx.note', 123],
      ['sourceCheckpoints.0.campaigns', [null]], ['sourceCheckpoints.0.lastSuccessAt', 'bad-date'],
      ['sourceCheckpoints.0.adapterVersion', 123], ['sourceCheckpoints.0.updatedAt', null],
    ]
    for (const [path, value] of corruptions) {
      const corrupt = structuredClone(valid)
      setField(corrupt, path, value)
      const result = migrateBackupPayload(corrupt)
      assert.equal(result.ok, false, `Must reject corrupt ${path}`)
    }
  })

  await step('Backup: unexpected secret fields are rejected instead of silently copied', async () => {
    const valid = await makeBackup()
    for (const path of [
      'privateKey', 'settings.seedPhrase', 'settings.identity.privateKey',
      'scanRecords.0.campaign.secret', 'scanRecords.0.eligibility.seedPhrase',
      'scanRecords.0.tx.privateKey', 'sourceCheckpoints.0.secret',
    ]) {
      const secret = structuredClone(valid)
      setField(secret, path, 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
      assert.equal(migrateBackupPayload(secret).ok, false, `Must reject ${path}`)
    }
    const secretAddress = structuredClone(valid)
    secretAddress.settings!.identity = { kind: 'watch', address: HASH }
    assert.equal(migrateBackupPayload(secretAddress).ok, false)

    // Public BIP39 example only; no private user data or account derivation.
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    const storage = createMemoryStorage()
    await storage.saveWatchlist(ACCOUNT, ['existing-campaign'])
    for (const path of [
      'scanRecords.0.tx.note', 'scanRecords.0.campaign.sourceEvidence',
      'scanRecords.0.campaign.summary', 'scanRecords.0.campaign.requirements.0',
      'scanRecords.0.tx.proof', 'sourceCheckpoints.0.campaigns.0.sourceEvidence',
    ]) {
      const secret = structuredClone(valid)
      setField(secret, path, mnemonic)
      assert.equal(migrateBackupPayload(secret).ok, false, `Must reject mnemonic at ${path}`)
      assert.equal((await storage.importBackup(JSON.stringify(secret))).ok, false)
      assert.deepEqual(await storage.loadWatchlist(ACCOUNT), ['existing-campaign'])
      assert.equal((await storage.getStats()).scanRecordCount, 0)
    }
    for (const count of [12, 15, 18, 21, 24]) {
      const candidate = structuredClone(valid)
      setField(candidate, 'scanRecords.0.tx.note', Array(count).fill('abandon').join(' '))
      assert.equal(migrateBackupPayload(candidate).ok, false, 'Reject dictionary candidates even without a valid checksum')
    }
    for (const wordlist of [
      czech, english, french, italian, japanese, korean, portuguese,
      simplifiedChinese, spanish, traditionalChinese,
    ]) {
      const candidate = structuredClone(valid)
      setField(candidate, 'scanRecords.0.tx.note', Array(12).fill(wordlist[0]).join('\u3000'))
      assert.equal(migrateBackupPayload(candidate).ok, false, 'Reject all supported BIP39 languages with Unicode spacing')
    }
    const ordinaryProse = structuredClone(valid)
    setField(ordinaryProse, 'scanRecords.0.tx.note', 'This official archive describes completed campaign history and preserves public project announcements')
    assert.equal(migrateBackupPayload(ordinaryProse).ok, true, 'Ordinary twelve-word prose is not a mnemonic')
  })

  await step('Backup: a rejected import leaves the existing storage intact', async () => {
    const storage = createMemoryStorage()
    await storage.saveWatchlist(ACCOUNT, ['existing-campaign'])
    const corrupt = await makeBackup()
    setField(corrupt, 'sourceCheckpoints.0.campaigns.0.chainId', 0)
    assert.equal((await storage.importBackup(JSON.stringify(corrupt))).ok, false)
    assert.deepEqual(await storage.loadWatchlist(ACCOUNT), ['existing-campaign'])
    assert.equal((await storage.getStats()).scanRecordCount, 0)
  })

  await step('Backup: v1 migration preserves old account keys and scan records while applying metadata defaults', () => {
    const storedCampaign = makeCampaign()
    const oldScope = `metamask:${WALLET.toLowerCase()}:42161`
    const migrated = migrateBackupPayload({
      app: 'airdrop-hunter', schemaVersion: 1,
      settings: { identity: ACCOUNT, scenario: 'normal' },
      watchlists: [{ identityKey: oldScope, campaignIds: [storedCampaign.id] }],
      scanRecords: [{
        identityKey: oldScope, chainId: 42161, campaignId: storedCampaign.id,
        campaign: storedCampaign,
      }],
    })
    assert.equal(migrated.ok, true)
    if (migrated.ok) {
      assert.equal(migrated.migratedFromVersion, 1)
      assert.equal(migrated.bundle.schemaVersion, 2)
      assert.equal(migrated.bundle.watchlists[0].accountKey, `metamask:${WALLET.toLowerCase()}`)
      assert.equal(migrated.bundle.scanRecords[0].addressScope, `metamask:${WALLET.toLowerCase()}`)
      assert.equal(migrated.bundle.scanRecords[0].eligibility.status, 'unknown')
      assert.equal(migrated.bundle.settings?.sourceMode, 'all')
      assert.equal(migrated.bundle.settings?.scanTtlMs, 3_600_000)
      assert.deepEqual(migrated.bundle.sourceCheckpoints, [])
    }
  })

  await step('Backup: duplicate storage keys and missing current schema fields are rejected', async () => {
    const valid = await makeBackup()
    for (const field of ['watchlists', 'scanRecords', 'sourceCheckpoints'] as const) {
      const duplicate = structuredClone(valid)
      const entries = duplicate[field] as unknown[]
      entries.push(structuredClone(entries[0]))
      assert.equal(migrateBackupPayload(duplicate).ok, false)
    }
    for (const field of ['exportedAt', 'settings', 'watchlists', 'scanRecords', 'sourceCheckpoints']) {
      const missing = structuredClone(valid) as unknown as Record<string, unknown>
      delete missing[field]
      assert.equal(migrateBackupPayload(missing).ok, false, `Must reject missing v2 ${field}`)
    }
  })

  return { passed, details }
}
