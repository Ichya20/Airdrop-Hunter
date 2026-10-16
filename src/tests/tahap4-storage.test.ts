import assert from 'node:assert/strict'
import type { Campaign, EligibilityResult, HexAddress, Identity, TxRecord } from '../domain/types'
import { createMemoryStorage } from '../storage'
import { migrateBackupPayload } from '../storage/backupValidation'
import type { StorageBackupBundle } from '../storage/types'

const WALLET: HexAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const ACCOUNT: Identity = { kind: 'watch', address: WALLET }
const HASH: HexAddress = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

function makeCampaign(origin: Campaign['origin'] = 'live'): Campaign {
  return {
    id: '1:uniswap:historical-drop', name: 'Historical UNI', project: 'Uniswap',
    kind: 'token', chainId: 1, status: 'ended', origin,
    foundIn: ['official-archive'], officialUrl: 'https://uniswap.org', checkerUrl: null,
    sourceVerified: false, sourceEvidence: 'Historical public source.', deadline: null,
    requirements: [], allocation: null, claimMethod: 'unknown', contract: null,
    summary: 'Historical distribution.', checkedAt: new Date().toISOString(), adapterVersion: 'archive-1',
  }
}

function makeEligibility(status: EligibilityResult['status'] = 'eligible'): EligibilityResult {
  return {
    status, reason: 'Claims to have checked an official proof.',
    rule: 'official-merkle-proof:v1', source: 'https://uniswap.org', checkedAt: new Date().toISOString(),
  }
}

const TX: TxRecord = {
  status: 'pending', hash: HASH, proof: null, updatedAt: '2026-10-14T12:00:00.000Z', note: 'Public transaction metadata.',
}

async function makeBackup(
  identity: Identity = ACCOUNT,
  origin: Campaign['origin'] = 'live',
  status: EligibilityResult['status'] = 'eligible',
): Promise<StorageBackupBundle> {
  const storage = createMemoryStorage()
  await storage.saveScanRecordsForIdentity(identity, [{ campaign: makeCampaign(origin), eligibility: makeEligibility(status), tx: TX }])
  return storage.exportBackup()
}

function assertNeedsRecheck(result: EligibilityResult) {
  assert.equal(result.status, 'unknown')
  assert.equal(result.rule, null)
  assert.equal(result.checkedAt, null)
  assert.equal(result.source, 'Cadangan lokal · perlu verifikasi ulang')
  assert.match(result.reason, /cadangan lokal.*diperiksa ulang.*sumber resmi/)
}

export async function runStage4StorageTests(): Promise<{ passed: number; details: string[] }> {
  let passed = 0
  const details: string[] = []
  const step = async (name: string, fn: () => void | Promise<void>) => {
    await fn()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  await step('Tahap 4 backup: fresh official-looking eligibility never survives import as verified', async () => {
    for (const status of ['eligible', 'ineligible', 'needs_tasks', 'unknown'] as const) {
      const migrated = migrateBackupPayload(await makeBackup(ACCOUNT, 'live', status))
      assert.equal(migrated.ok, true)
      if (migrated.ok) {
        assertNeedsRecheck(migrated.bundle.scanRecords[0].eligibility)
        assert.deepEqual(migrated.bundle.scanRecords[0].tx, TX)
      }
    }
  })

  await step('Tahap 4 backup: campaign origin and account scope each prevent demo trust leakage', async () => {
    for (const [identity, origin] of [
      [{ kind: 'demo' }, 'live'], [{ kind: 'demo' }, 'testnet'], [ACCOUNT, 'demo'],
    ] as const) {
      const migrated = migrateBackupPayload(await makeBackup(identity, origin))
      assert.equal(migrated.ok, true)
      if (migrated.ok) assertNeedsRecheck(migrated.bundle.scanRecords[0].eligibility)
    }
  })

  await step('Tahap 4 backup: memory storage persists only unknown eligibility after a real account import', async () => {
    const backup = await makeBackup()
    const storage = createMemoryStorage()
    assert.equal((await storage.importBackup(JSON.stringify(backup))).ok, true)
    const records = await storage.loadScanRecordsForIdentity(ACCOUNT, [backup.scanRecords[0].campaign])
    const record = records.get(backup.scanRecords[0].campaignId)!
    assertNeedsRecheck(record.eligibility)
    assert.deepEqual(record.tx, TX)
    assert.equal((await storage.exportBackup()).scanRecords[0].eligibility.status, 'unknown')
  })

  await step('Tahap 4 backup: a demo account with a demo campaign retains fixture eligibility', async () => {
    const demo: Identity = { kind: 'demo' }
    const backup = await makeBackup(demo, 'demo')
    const originalEligibility = structuredClone(backup.scanRecords[0].eligibility)
    const storage = createMemoryStorage()
    assert.equal((await storage.importBackup(JSON.stringify(backup))).ok, true)
    const records = await storage.loadScanRecordsForIdentity(demo, [backup.scanRecords[0].campaign])
    assert.deepEqual(records.get(backup.scanRecords[0].campaignId)?.eligibility, originalEligibility)
  })

  await step('Tahap 4 backup: eligibility is fully validated before untrusted results are reset', async () => {
    const backup = await makeBackup()
    const storage = createMemoryStorage()
    await storage.saveWatchlist(ACCOUNT, ['existing-campaign'])
    for (const change of [
      { status: 'ready' }, { checkedAt: 'tomorrow' }, { source: 42 }, { rule: false },
      { reason: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' },
      { privateKey: 'unexpected secret field' },
    ]) {
      const corrupt = structuredClone(backup)
      Object.assign(corrupt.scanRecords[0].eligibility, change)
      assert.equal(migrateBackupPayload(corrupt).ok, false)
      assert.equal((await storage.importBackup(JSON.stringify(corrupt))).ok, false)
      assert.deepEqual(await storage.loadWatchlist(ACCOUNT), ['existing-campaign'])
      assert.equal((await storage.getStats()).scanRecordCount, 0)
    }
  })

  return { passed, details }
}
