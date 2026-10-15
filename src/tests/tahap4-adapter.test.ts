import assert from 'node:assert/strict'
import { checkEligibility, ELIGIBILITY_TTL_MS, getEligibilityAdapter, isEligibilityFresh, resolveEligibility } from '../adapters/eligibility'
import { createUniEligibilityAdapter, UNI_DISTRIBUTOR, UNI_ELIGIBILITY_RULE, UNI_TOKEN, type UniDistributorState } from '../adapters/eligibility/uni'
import { mapDefiLlamaPayloadToCampaigns } from '../adapters/sources'
import { demoEligibility } from '../demo/eligibility'
import { deriveLabel } from '../domain/status'
import type { Campaign, EligibilityResult, HexAddress, Identity } from '../domain/types'
import { buildScanRecordKey } from '../storage/keys'
import type { StoredScanRecord } from '../storage/types'

const NOW = Date.parse('2026-10-15T12:00:00.000Z')
const ADDRESS_A: HexAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const ADDRESS_B: HexAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
const IDENTITY: Identity = { kind: 'watch', address: ADDRESS_A }
// Vector dua daun: index 0/alokasi 400 UNI dan index 1/alokasi 1.000 UNI.
const LEAF_A = '0x6fb9c260865993abe884d1cd6f421af583be29cb1d0a22971bb88431bf1dfcfd'
const LEAF_B = '0x7377c426858054542f1545f82ee70d9d4c5758e4f942a8b7a06ecef4927f73cc'
const ROOT = '0xf72ae29d65b930b808e17f714f3752f1f202f1ce52b578a985d75dc771399141'
const PROOF = { address: ADDRESS_A, index: 0, amount: '400000000000000000000', proof: [LEAF_B] }

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  const uni = mapDefiLlamaPayloadToCampaigns([], { checkedAt: new Date(NOW).toISOString() })
    .find((campaign) => campaign.project === 'Uniswap')
  assert.ok(uni)
  return { ...uni, ...overrides }
}

function state(overrides: Partial<UniDistributorState> = {}): UniDistributorState {
  return { chainId: 1, blockNumber: 21_000_000n, merkleRoot: ROOT, token: UNI_TOKEN, isClaimed: false, ...overrides }
}

function cache(campaign: Campaign, identity: Identity, eligibility: EligibilityResult): StoredScanRecord {
  const key = buildScanRecordKey({ identity, chainId: campaign.chainId, campaignId: campaign.id, adapterVersion: campaign.adapterVersion })
  return {
    key, addressScope: key.split('::')[0], chainId: campaign.chainId, campaignId: campaign.id,
    adapterVersion: campaign.adapterVersion, campaign, eligibility, tx: null, savedAt: new Date(NOW).toISOString(),
  }
}

export async function runStage4AdapterTests(): Promise<{ passed: number; details: string[] }> {
  let passed = 0
  const details: string[] = []
  const step = async (name: string, run: () => void | Promise<void>) => {
    await run()
    passed += 1
    details.push(`PASS: ${name}`)
  }
  const campaign = makeCampaign()
  const adapter = createUniEligibilityAdapter({ readState: async () => state(), now: () => NOW })
  const validResult = await adapter.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF) })

  await step('4.1: Registry hanya menerima arsip UNI live dengan chain dan kontrak resmi', () => {
    assert.ok(getEligibilityAdapter(campaign))
    for (const other of [
      makeCampaign({ origin: 'demo' }), makeCampaign({ origin: 'testnet' }),
      makeCampaign({ chainId: 10 }), makeCampaign({ id: '1:uniswap:other' }),
      makeCampaign({ contract: null }), makeCampaign({ contract: { chainId: 10, address: UNI_DISTRIBUTOR } }),
      makeCampaign({ contract: { chainId: 1, address: ADDRESS_A } }),
    ]) assert.equal(getEligibilityAdapter(other), null)
  })

  await step('4.2: Proof valid + belum diklaim menghasilkan eligible, tanpa mengubah arsip atau transaksi', () => {
    assert.equal(validResult.status, 'eligible')
    assert.equal(validResult.rule, UNI_ELIGIBILITY_RULE)
    assert.equal(validResult.checkedAt, new Date(NOW).toISOString())
    assert.match(validResult.source, /https:\/\/github.com\/Uniswap\/merkle-distributor/)
    assert.match(validResult.source, /blok 21000000/)
    assert.match(validResult.source, new RegExp(UNI_DISTRIBUTOR))
    assert.equal(campaign.status, 'ended')
    assert.equal(campaign.sourceVerified, false)
    assert.equal(deriveLabel(campaign, validResult, null, NOW), 'ended')
    assert.equal('tx' in validResult, false)
  })

  await step('4.3: Proof sah yang sudah diklaim hanya menghasilkan ineligible, tanpa tx confirmed', async () => {
    const claimed = createUniEligibilityAdapter({ readState: async () => state({ isClaimed: true }), now: () => NOW })
    const result = await claimed.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF) })
    assert.equal(result.status, 'ineligible')
    assert.match(result.reason, /sudah diklaim/)
    assert.equal('tx' in result, false)
  })

  await step('4.4: Verifikasi kedua arah pasangan Merkle serta amount hex dan index string', async () => {
    const proof = { address: ADDRESS_B.toLowerCase(), index: '1', amount: `0x${(1000000000000000000000n).toString(16)}`, proof: [LEAF_A] }
    const result = await adapter.checkEligibility(campaign, { kind: 'metamask', address: ADDRESS_B, chainId: 1 }, { proofJson: JSON.stringify(proof) })
    assert.equal(result.status, 'eligible')
  })

  await step('4.5: Proof/amount/index salah atau root berbeda tidak pernah disebut ineligible', async () => {
    const claimed = createUniEligibilityAdapter({ readState: async () => state({ isClaimed: true }), now: () => NOW })
    for (const invalidProof of [
      { ...PROOF, amount: '1' }, { ...PROOF, index: 1 }, { ...PROOF, proof: [LEAF_A] }, { ...PROOF, proof: [] },
    ]) {
      const result = await claimed.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(invalidProof) })
      assert.equal(result.status, 'unknown')
      assert.match(result.reason, /Merkle root/)
    }
  })

  await step('4.6: Data proof kosong, invalid atau alamat lain tidak memanggil RPC', async () => {
    let calls = 0
    const noRpc = createUniEligibilityAdapter({ readState: async () => { calls += 1; return state() }, now: () => NOW })
    for (const proofJson of [undefined, '', '{bad', 'null', '[]', JSON.stringify({ ...PROOF, address: ADDRESS_B })]) {
      assert.equal((await noRpc.checkEligibility(campaign, IDENTITY, { proofJson })).status, 'unknown')
    }
    assert.equal(calls, 0)
  })

  await step('4.7: Schema strict menolak field tambahan, tipe salah, dan data melewati batas', async () => {
    let calls = 0
    const noRpc = createUniEligibilityAdapter({ readState: async () => { calls += 1; return state() }, now: () => NOW })
    const invalid = [
      { ...PROOF, privateKey: 'sensitive-input' }, { ...PROOF, seedPhrase: 'sensitive-input' },
      { ...PROOF, amount: 400 }, { ...PROOF, amount: '-1' }, { ...PROOF, amount: '1.2' },
      { ...PROOF, amount: '0x' }, { ...PROOF, amount: (1n << 256n).toString() },
      { ...PROOF, index: -1 }, { ...PROOF, index: 0.1 }, { ...PROOF, index: Number.MAX_SAFE_INTEGER + 1 },
      { ...PROOF, index: '0x00' }, { ...PROOF, index: (1n << 256n).toString() },
      { ...PROOF, proof: ['0x1234'] }, { ...PROOF, proof: [42] }, { ...PROOF, proof: Array(65).fill(LEAF_B) },
      { ...PROOF, proof: null }, { ...PROOF, address: 'invalid-address' },
    ]
    for (const input of invalid) {
      const result = await noRpc.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(input) })
      assert.equal(result.status, 'unknown')
      assert.doesNotMatch(JSON.stringify(result), /sensitive-input/)
    }
    for (const proofJson of [' '.repeat(32 * 1024 + 1), JSON.stringify({ ...PROOF, address: '界'.repeat(12 * 1024) })]) {
      assert.equal((await noRpc.checkEligibility(campaign, IDENTITY, { proofJson })).status, 'unknown')
    }
    assert.equal(calls, 0)
  })

  await step('4.8: MetaMask pada jaringan lain, DEMO, tanpa akun dan campaign lain tidak diperiksa', async () => {
    let calls = 0
    const noRpc = createUniEligibilityAdapter({ readState: async () => { calls += 1; return state() }, now: () => NOW })
    for (const identity of [{ kind: 'none' }, { kind: 'demo' }, { kind: 'metamask', address: ADDRESS_A, chainId: 10 }] as Identity[]) {
      assert.equal((await noRpc.checkEligibility(campaign, identity, { proofJson: JSON.stringify(PROOF) })).status, 'unknown')
    }
    assert.equal((await noRpc.checkEligibility(makeCampaign({ chainId: 10 }), IDENTITY, { proofJson: JSON.stringify(PROOF) })).status, 'unknown')
    assert.equal(calls, 0)
  })

  await step('4.9: Kegagalan RPC dan metadata kontrak salah selalu unknown tanpa membocorkan error mentah', async () => {
    const failed = createUniEligibilityAdapter({ readState: async () => { throw new Error('secret-server-response') }, now: () => NOW })
    const error = await failed.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF) })
    assert.equal(error.status, 'unknown')
    assert.doesNotMatch(JSON.stringify(error), /secret-server-response/)
    for (const invalid of [state({ chainId: 10 }), state({ token: ADDRESS_A }), state({ blockNumber: -1n }), state({ merkleRoot: '0x00' })]) {
      const wrong = createUniEligibilityAdapter({ readState: async () => invalid, now: () => NOW })
      assert.equal((await wrong.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF) })).status, 'unknown')
    }
  })

  await step('4.10: Abort sebelum dan selama RPC segera berhenti dengan unknown', async () => {
    let calls = 0
    const never = createUniEligibilityAdapter({ readState: async ({ signal }) => {
      calls += 1
      assert.equal(signal.aborted, false)
      return new Promise(() => {})
    }, now: () => NOW })
    const controller = new AbortController()
    controller.abort()
    assert.equal((await never.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF), signal: controller.signal })).status, 'unknown')
    assert.equal(calls, 0)
    const during = new AbortController()
    const checking = never.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF), signal: during.signal })
    during.abort()
    const result = await checking
    assert.equal(result.status, 'unknown')
    assert.match(result.reason, /dibatalkan/)
    assert.equal(calls, 1)
  })

  await step('4.11: Transport produksi hanya membaca RPC kontrak pinned pada blok sama, tanpa wallet', async () => {
    const originalFetch = globalThis.fetch
    const calls: { method: string; params: unknown[] }[] = []
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string; params?: unknown[] }
      calls.push({ method: request.method, params: request.params ?? [] })
      let result: string
      if (request.method === 'eth_chainId') result = '0x1'
      else if (request.method === 'eth_blockNumber') result = `0x${(21_000_000n).toString(16)}`
      else {
        assert.equal(request.method, 'eth_call')
        const call = request.params?.[0] as { to: string; data: string }
        assert.equal(call.to.toLowerCase(), UNI_DISTRIBUTOR.toLowerCase())
        assert.equal(request.params?.[1], `0x${(21_000_000n).toString(16)}`)
        if (call.data === '0x2eb4a7ab') result = ROOT // merkleRoot()
        else if (call.data === '0xfc0c546a') result = `0x${'0'.repeat(24)}${UNI_TOKEN.slice(2).toLowerCase()}` // token()
        else result = `0x${'0'.repeat(64)}` // isClaimed(uint256)
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const production = createUniEligibilityAdapter({ now: () => NOW })
      const result = await production.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF) })
      assert.equal(result.status, 'eligible')
      assert.deepEqual(calls.map((call) => call.method).sort(), ['eth_blockNumber', 'eth_call', 'eth_call', 'eth_call', 'eth_chainId'])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await step('4.12: Cache hanya dipakai untuk rule dikenal, alamat/mode/chain/versi cocok, dalam TTL', () => {
    const record = cache(campaign, IDENTITY, validResult)
    assert.equal(resolveEligibility(campaign, IDENTITY, record, NOW).status, 'eligible')
    assert.equal(resolveEligibility(campaign, { kind: 'watch', address: ADDRESS_B }, record, NOW).status, 'unknown')
    assert.equal(resolveEligibility(campaign, { kind: 'metamask', address: ADDRESS_A, chainId: 1 }, record, NOW).status, 'unknown')
    assert.equal(resolveEligibility(makeCampaign({ adapterVersion: 'new-version' }), IDENTITY, record, NOW).status, 'unknown')
    const meta: Identity = { kind: 'metamask', address: ADDRESS_A, chainId: 1 }
    assert.equal(resolveEligibility(campaign, { ...meta, chainId: 10 }, cache(campaign, meta, validResult), NOW).status, 'unknown')
    const unrecognized = cache(campaign, IDENTITY, { ...validResult, rule: 'unrecognized-rule' })
    assert.equal(resolveEligibility(campaign, IDENTITY, unrecognized, NOW).status, 'unknown')
  })

  await step('4.13: Cache usang/future/invalid menjadi unknown dengan provenance tetap terlihat', () => {
    assert.equal(isEligibilityFresh(campaign, validResult, NOW + ELIGIBILITY_TTL_MS - 1), true)
    assert.equal(isEligibilityFresh(campaign, validResult, NOW + ELIGIBILITY_TTL_MS), false)
    for (const checkedAt of [new Date(NOW - ELIGIBILITY_TTL_MS).toISOString(), new Date(NOW + 1).toISOString(), 'invalid', null]) {
      const old = { ...validResult, checkedAt }
      const result = resolveEligibility(campaign, IDENTITY, cache(campaign, IDENTITY, old), NOW)
      assert.equal(result.status, 'unknown')
      assert.match(result.reason, /Hasil eligibility usang/)
      assert.equal(result.checkedAt, checkedAt)
      assert.equal(result.rule, old.rule)
      assert.equal(result.source, old.source)
    }
  })

  await step('4.14: Campaign unsupported menolak cache eligible palsu dan DEMO tetap fixture', async () => {
    const unsupported = makeCampaign({ id: '1:other:campaign' })
    assert.equal(resolveEligibility(unsupported, IDENTITY, cache(unsupported, IDENTITY, validResult), NOW).status, 'unknown')
    assert.equal((await checkEligibility(unsupported, IDENTITY)).status, 'unknown')
    const demo = makeCampaign({ origin: 'demo' })
    assert.deepEqual(resolveEligibility(demo, { kind: 'demo' }, null, NOW), demoEligibility(demo))
    assert.deepEqual(await checkEligibility(demo, { kind: 'demo' }), demoEligibility(demo))
    assert.equal((await checkEligibility(campaign, IDENTITY)).status, 'unknown')
  })

  await step('4.15: Cache unknown mempertahankan alasan error spesifik, termasuk checkedAt kosong', () => {
    for (const checkedAt of [null, new Date(NOW - ELIGIBILITY_TTL_MS).toISOString()]) {
      const unknown: EligibilityResult = { ...validResult, status: 'unknown', reason: 'RPC tidak tersedia. Coba lagi.', checkedAt }
      assert.deepEqual(resolveEligibility(campaign, IDENTITY, cache(campaign, IDENTITY, unknown), NOW), unknown)
    }
  })

  await step('4.16: Batas waktu seluruh pemeriksaan tetap selesai saat dependensi mengabaikan abort', async () => {
    let receivedSignal: AbortSignal | undefined
    const blocked = createUniEligibilityAdapter({ readState: async ({ signal }) => {
      receivedSignal = signal
      return new Promise(() => {})
    }, now: () => NOW })
    const result = await blocked.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF) })
    assert.equal(result.status, 'unknown')
    assert.match(result.reason, /batas waktu 8 detik/)
    assert.equal(receivedSignal?.aborted, true)
  })

  await step('4.17: Transport berhenti pada chain salah dan tidak mengulang kegagalan jaringan', async () => {
    const originalFetch = globalThis.fetch
    try {
      for (const failNetwork of [false, true]) {
        let calls = 0
        globalThis.fetch = async (_input, init) => {
          calls += 1
          const request = JSON.parse(String(init?.body)) as { id: number; method: string }
          assert.equal(request.method, 'eth_chainId')
          if (failNetwork) throw new Error('private-network-detail')
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0xa' }), { headers: { 'Content-Type': 'application/json' } })
        }
        const production = createUniEligibilityAdapter({ now: () => NOW })
        const result = await production.checkEligibility(campaign, IDENTITY, { proofJson: JSON.stringify(PROOF) })
        assert.equal(result.status, 'unknown')
        assert.doesNotMatch(JSON.stringify(result), /private-network-detail/)
        assert.equal(calls, 1)
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  return { passed, details }
}
