import assert from 'node:assert/strict'
import type { Campaign, EligibilityResult, Identity, TxRecord } from '../domain/types'
import { createEligibilityController } from '../features/eligibility/controller'
import { createMemoryStorage, type LocalStorageAdapter } from '../storage'

const A: Identity = { kind: 'metamask', address: '0x1111111111111111111111111111111111111111', chainId: 1 }
const B: Identity = { kind: 'metamask', address: '0x2222222222222222222222222222222222222222', chainId: 1 }
const CAMPAIGN: Campaign = {
  id: '1:test:eligibility', name: 'Eligibility fixture', project: 'Test', kind: 'token', chainId: 1,
  status: 'claim_open', origin: 'live', foundIn: ['test'], officialUrl: null, checkerUrl: null,
  sourceVerified: false, sourceEvidence: 'Fixture pengujian', deadline: null, requirements: [],
  allocation: null, claimMethod: 'unknown', contract: null, summary: 'Fixture tanpa RPC',
  checkedAt: '2026-10-15T00:00:00.000Z', adapterVersion: 'test-1',
}
const ELIGIBLE: EligibilityResult = {
  status: 'eligible', reason: 'Fixture memenuhi aturan', rule: 'test-rule-1', source: 'Fixture', checkedAt: '2026-10-15T00:00:00.000Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function configure(controller: ReturnType<typeof createEligibilityController>, identity = A, contextKey = 'live:0') {
  controller.configure({ identity, campaigns: [CAMPAIGN], ready: true, contextKey })
}

export async function runStage4FlowTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0
  const step = async (name: string, run: () => Promise<void>) => {
    await run()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  await step('Pemeriksaan bersamaan dideduplikasi dan status sebelumnya segera menjadi unknown', async () => {
    const storage = createMemoryStorage()
    const result = deferred<EligibilityResult>()
    let calls = 0
    const controller = createEligibilityController({ storage, check: async () => { calls += 1; return result.promise } })
    configure(controller)
    const first = controller.recheck(CAMPAIGN)
    const second = controller.recheck(CAMPAIGN)
    assert.equal(calls, 1)
    assert.equal(controller.getSnapshot().records.get(CAMPAIGN.id)?.eligibility.status, 'unknown')
    assert.equal(controller.getSnapshot().pendingIds.has(CAMPAIGN.id), true)
    result.resolve(ELIGIBLE)
    await Promise.all([first, second])
    assert.equal(controller.getSnapshot().records.get(CAMPAIGN.id)?.eligibility.status, 'eligible')
    assert.equal(controller.getSnapshot().pendingIds.size, 0)
  })

  await step('Sumber gagal mengganti hasil eligible sebelumnya dengan unknown di tampilan dan penyimpanan', async () => {
    const storage = createMemoryStorage()
    await storage.saveScanRecordsForIdentity(A, [{ campaign: CAMPAIGN, eligibility: ELIGIBLE, tx: null }])
    const controller = createEligibilityController({ storage, check: async () => { throw new Error('offline') } })
    configure(controller)
    await controller.load()
    assert.equal(controller.getSnapshot().records.get(CAMPAIGN.id)?.eligibility.status, 'eligible')
    const request = controller.recheck(CAMPAIGN)
    assert.equal(controller.getSnapshot().records.get(CAMPAIGN.id)?.eligibility.status, 'unknown')
    await request
    const stored = await storage.loadScanRecordsForIdentity(A, [CAMPAIGN])
    assert.equal(stored.get(CAMPAIGN.id)?.eligibility.status, 'unknown')
  })

  for (const [name, identity, contextKey] of [
    ['akun', B, 'live:0'],
    ['jaringan aktif', { ...A, kind: 'metamask', chainId: 10 } as Identity, 'live:0'],
    ['mode sumber', A, 'demo:0'],
  ] as const) {
    await step(`Hasil terlambat diabaikan setelah pergantian ${name}`, async () => {
      const storage = createMemoryStorage()
      const result = deferred<EligibilityResult>()
      let signal: AbortSignal | undefined
      const controller = createEligibilityController({ storage, check: async (_campaign, _identity, options) => {
        signal = options?.signal
        return result.promise
      } })
      configure(controller)
      const request = controller.recheck(CAMPAIGN)
      configure(controller, identity, contextKey)
      assert.equal(signal?.aborted, true)
      result.resolve(ELIGIBLE)
      await request
      assert.equal(controller.getSnapshot().records.size, 0)
      assert.equal((await storage.getStats()).scanRecordCount, 0)
    })
  }

  await step('Invalidate membatalkan pemeriksaan sebelum clear/import dan memerlukan konteks baru', async () => {
    const storage = createMemoryStorage()
    const result = deferred<EligibilityResult>()
    let calls = 0
    const controller = createEligibilityController({ storage, check: async () => { calls += 1; return result.promise } })
    configure(controller)
    const request = controller.recheck(CAMPAIGN)
    await controller.invalidate()
    await storage.clearAll()
    await controller.recheck(CAMPAIGN)
    assert.equal(calls, 1)
    result.resolve(ELIGIBLE)
    await request
    assert.equal((await storage.getStats()).scanRecordCount, 0)
    configure(controller, A, 'live:1')
    await controller.recheck(CAMPAIGN)
    assert.equal((await storage.getStats()).scanRecordCount, 1)
  })

  await step('Invalidate menunggu penulisan yang sudah dimulai sebelum clear mengganti penyimpanan', async () => {
    const memory = createMemoryStorage()
    const started = deferred<void>()
    const release = deferred<void>()
    const storage: LocalStorageAdapter = { ...memory, async saveScanRecordsForIdentity(identity, entries) {
      started.resolve()
      await release.promise
      await memory.saveScanRecordsForIdentity(identity, entries)
    } }
    const controller = createEligibilityController({ storage, check: async () => ELIGIBLE })
    configure(controller)
    const request = controller.recheck(CAMPAIGN)
    await started.promise
    let drained = false
    const drain = controller.invalidate().then(() => { drained = true })
    await Promise.resolve()
    assert.equal(drained, false)
    release.resolve()
    await drain
    await storage.clearAll()
    await request
    assert.equal(controller.getSnapshot().records.size, 0)
    assert.equal((await storage.getStats()).scanRecordCount, 0)
  })

  await step('Pemeriksaan kelayakan mempertahankan catatan transaksi terbaru tanpa membuat konfirmasi baru', async () => {
    const storage = createMemoryStorage()
    const result = deferred<EligibilityResult>()
    const controller = createEligibilityController({ storage, check: async () => result.promise })
    configure(controller)
    const request = controller.recheck(CAMPAIGN)
    const tx: TxRecord = { status: 'pending', hash: '0x1234', proof: null, updatedAt: '2026-10-15T00:00:01.000Z', note: 'Transaksi yang sudah ada' }
    await storage.saveScanRecordsForIdentity(A, [{ campaign: CAMPAIGN, eligibility: ELIGIBLE, tx }])
    result.resolve({ ...ELIGIBLE, status: 'ineligible', reason: 'Fixture sudah diklaim menurut checker' })
    await request
    assert.deepEqual((await storage.loadScanRecordsForIdentity(A, [CAMPAIGN])).get(CAMPAIGN.id)?.tx, tx)
    assert.deepEqual(controller.getSnapshot().records.get(CAMPAIGN.id)?.tx, tx)
  })

  await step('Proof baru mengganti permintaan tanpa proof lalu digunakan ulang hanya dalam konteks yang sama', async () => {
    const storage = createMemoryStorage()
    const first = deferred<EligibilityResult>()
    const second = deferred<EligibilityResult>()
    const seen: Array<string | undefined> = []
    const signals: Array<AbortSignal | undefined> = []
    const controller = createEligibilityController({ storage, check: async (_campaign, _identity, options) => {
      seen.push(options?.proofJson)
      signals.push(options?.signal)
      return seen.length === 1 ? first.promise : second.promise
    } })
    configure(controller)
    const old = controller.recheck(CAMPAIGN)
    const replacement = controller.recheck(CAMPAIGN, '{"public":"proof"}')
    assert.equal(signals[0]?.aborted, true)
    first.resolve({ ...ELIGIBLE, status: 'unknown' })
    second.resolve(ELIGIBLE)
    await Promise.all([old, replacement])
    await controller.recheck(CAMPAIGN)
    assert.deepEqual(seen, [undefined, '{"public":"proof"}', '{"public":"proof"}'])
    configure(controller, B)
    await controller.recheck(CAMPAIGN)
    assert.equal(seen.at(-1), undefined)
  })

  await step('Proof yang gagal atau tidak valid tidak diingat untuk pemeriksaan berikutnya', async () => {
    const seen: Array<string | undefined> = []
    const controller = createEligibilityController({ storage: createMemoryStorage(), check: async (_campaign, _identity, options) => {
      seen.push(options?.proofJson)
      return { ...ELIGIBLE, status: 'unknown', reason: 'Proof tidak valid' }
    } })
    configure(controller)
    await controller.recheck(CAMPAIGN, '{"unsupported":"field"}')
    await controller.recheck(CAMPAIGN)
    assert.deepEqual(seen, ['{"unsupported":"field"}', undefined])
  })

  await step('Persistensi scan membuat catatan yang hilang dan tidak menimpa hasil pemeriksaan yang sedang berjalan', async () => {
    const storage = createMemoryStorage()
    const result = deferred<EligibilityResult>()
    const controller = createEligibilityController({ storage, check: async () => result.promise })
    configure(controller)
    const check = controller.recheck(CAMPAIGN)
    await controller.load()
    assert.equal((await storage.getStats()).scanRecordCount, 0)
    result.resolve(ELIGIBLE)
    await check
    await controller.load()
    assert.equal((await storage.loadScanRecordsForIdentity(A, [CAMPAIGN])).get(CAMPAIGN.id)?.eligibility.status, 'eligible')
    const missing = { ...CAMPAIGN, id: '1:test:second' }
    controller.configure({ identity: A, campaigns: [CAMPAIGN, missing], ready: true, contextKey: 'live:0' })
    await controller.load()
    const stored = await storage.loadScanRecordsForIdentity(A, [CAMPAIGN, missing])
    assert.equal(stored.size, 2)
    assert.equal(stored.get(CAMPAIGN.id)?.eligibility.status, 'eligible')
    assert.equal(stored.get(missing.id)?.eligibility.status, 'unknown')
  })

  return { passed, details }
}
