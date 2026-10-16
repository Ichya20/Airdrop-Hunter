import assert from 'node:assert/strict'
import { UNI_ELIGIBILITY_RULE, UNI_TOKEN } from '../adapters/eligibility/uni'
import { MARKET_TTL_MS, marketTokenKey, type TokenMarketEvidence } from '../adapters/market'
import { mapDefiLlamaPayloadToCampaigns } from '../adapters/sources'
import type { SourceAdapter } from '../adapters/sources/types'
import type { Identity } from '../domain/types'
import { buildChecks } from '../features/claims/preClaimChecks'
import { buildRows, statusSubtext, type CampaignRow } from '../features/dashboard/rows'
import { createCampaignMarketController } from '../features/dashboard/useCampaignMarket'
import { runScan, type ScanEvent } from '../features/scanner/runScan'
import { createMemoryStorage } from '../storage'

export async function runDiscoveryIntegrationTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  const step = async (name: string, test: () => Promise<void>) => { await test(); details.push(`PASS: ${name}`) }
  const base: SourceAdapter = { id: 'paged', name: 'Paged fixture', version: '1', origin: 'live', description: '', async fetchCampaigns() { return [] } }

  await step('Discovery scanner: sumber berhalaman memakai anggaran sendiri tanpa memotong hasil pada timeout default', async () => {
    const events: ScanEvent[] = []
    await runScan([{ ...base, timeoutMs: 200, async fetchCampaigns() {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return mapDefiLlamaPayloadToCampaigns([], { checkedAt: new Date().toISOString() })
    } }], { concurrency: 1, timeoutMs: 1, retries: 0, backoffMs: 0 }, new AbortController().signal, (event) => events.push(event))
    const result = events.find((event) => event.type === 'result')
    assert.ok(result?.type === 'result' && result.result.status === 'ok')
    assert.equal(result.result.campaigns.length, 2)
  })
  await step('Discovery scanner: sumber yang mengabaikan abort tetap timeout, tanpa keberhasilan parsial palsu', async () => {
    const events: ScanEvent[] = []
    let received: AbortSignal | undefined
    await runScan([{ ...base, timeoutMs: 10, async fetchCampaigns({ signal }) { received = signal; return new Promise(() => {}) } }],
      { concurrency: 1, timeoutMs: 1, retries: 0, backoffMs: 0 }, new AbortController().signal, (event) => events.push(event))
    const result = events.find((event) => event.type === 'result')
    assert.ok(result?.type === 'result' && result.result.status === 'error')
    assert.equal(result.result.error.kind, 'timeout')
    assert.equal(received?.aborted, true)
    assert.equal(result.result.campaigns.length, 0)
  })
  await step('Discovery scanner: pembatalan tidak menunggu adapter yang mengabaikan signal', async () => {
    const events: ScanEvent[] = []
    const controller = new AbortController()
    const running = runScan([{ ...base, async fetchCampaigns() { return new Promise(() => {}) } }],
      { concurrency: 1, timeoutMs: 60_000, retries: 0, backoffMs: 0 }, controller.signal, (event) => events.push(event))
    controller.abort()
    await running
    assert.equal(events.filter((event) => event.type === 'cancelled').length, 1)
    assert.equal(events.filter((event) => event.type === 'result').length, 0)
  })
  await step('Discovery biaya: UNI gratis dengan gas terpisah; arsip tetap nonaktif tanpa bukti transfer', async () => {
    const now = Date.now()
    const identity: Identity = { kind: 'watch', address: '0x1111111111111111111111111111111111111111' }
    const uni = mapDefiLlamaPayloadToCampaigns([], { checkedAt: new Date(now).toISOString() }).find((campaign) => campaign.project === 'Uniswap')!
    const storage = createMemoryStorage()
    await storage.saveScanRecordsForIdentity(identity, [{ campaign: uni, eligibility: {
      status: 'eligible', reason: 'Fixture proof sah', source: 'Fixture transport', checkedAt: new Date(now).toISOString(), rule: UNI_ELIGIBILITY_RULE,
    }, tx: null }])
    const records = await storage.loadScanRecordsForIdentity(identity, [uni])
    const row = buildRows([uni], identity, now, new Set(), new Set(), records)[0]
    assert.equal(row.eligibility.status, 'eligible')
    assert.equal(row.claimCost.status, 'free_distribution')
    assert.equal(row.claimCost.gas, 'user_pays_gas')
    assert.match(statusSubtext(row), /gas terpisah/)
    assert.equal(buildChecks(row, identity, now).find((check) => check.label === 'Distribusi token gratis')?.state, 'ok')
    assert.equal(buildChecks(row, identity, now).find((check) => check.label === 'Nilai pasar token')?.state, 'fail')
    assert.equal(row.tx, null)
    assert.equal(row.label, 'ended')
  })
  await step('Discovery nilai: eligible dan claim_open belum siap tanpa harga dan likuiditas token', async () => {
    const now = Date.now()
    const identity: Identity = { kind: 'watch', address: '0x1111111111111111111111111111111111111111' }
    const archive = mapDefiLlamaPayloadToCampaigns([], { checkedAt: new Date(now).toISOString() }).find((campaign) => campaign.project === 'Uniswap')!
    const campaign = { ...archive, status: 'claim_open' as const, sourceVerified: true }
    const storage = createMemoryStorage()
    await storage.saveScanRecordsForIdentity(identity, [{ campaign, eligibility: {
      status: 'eligible', reason: 'Fixture proof sah', source: 'Fixture transport', checkedAt: new Date(now).toISOString(), rule: UNI_ELIGIBILITY_RULE,
    }, tx: null }])
    const rows = buildRows([campaign], identity, now, new Set(), new Set(), await storage.loadScanRecordsForIdentity(identity, [campaign]))
    assert.equal(rows[0].eligibility.status, 'eligible')
    assert.equal(rows[0].label, 'unverified')
    assert.equal(rows[0].action.kind, 'check')
    assert.equal(rows[0].claimCost.status, 'free_distribution')
    const pair = '0x2222222222222222222222222222222222222222' as const
    const quote: TokenMarketEvidence = {
      status: 'available', chainId: 1, tokenAddress: UNI_TOKEN, priceUsd: '0.00001', liquidityUsd: 0.01,
      pairAddress: pair, sourceUrl: `https://dexscreener.com/ethereum/${pair}`, checkedAt: new Date(now).toISOString(), reason: 'Fixture pasar',
    }
    const records = await storage.loadScanRecordsForIdentity(identity, [campaign])
    const priced = buildRows([campaign], identity, now, new Set(), new Set(), records, new Map([[marketTokenKey(1, UNI_TOKEN), quote]]))[0]
    assert.equal(priced.label, 'ready', 'Gas pengguna tidak menggagalkan kriteria token gratis')
    const checks = buildChecks(priced, identity, now)
    assert.equal(checks.find((check) => check.label === 'Nilai pasar token')?.state, 'ok')
    assert.equal(checks.find((check) => check.label === 'Gas jaringan')?.state, 'warn')
    assert.equal(checks.find((check) => check.label === 'Claim adapter')?.state, 'fail', 'Tahap 5 tetap belum aktif')
    assert.equal(priced.tx, null)
    assert.equal(buildChecks(priced, identity, now + MARKET_TTL_MS + 1).find((check) => check.label === 'Nilai pasar token')?.state, 'fail')
    const wrongEvidence: TokenMarketEvidence[] = [
      { ...quote, chainId: 8453 },
      { ...quote, tokenAddress: pair },
      { ...quote, liquidityUsd: 0 },
      { ...quote, checkedAt: new Date(now - MARKET_TTL_MS - 1).toISOString() },
    ]
    for (const wrong of wrongEvidence) {
      const invalid: CampaignRow = buildRows([campaign], identity, now, new Set(), new Set(), records, new Map([[marketTokenKey(1, UNI_TOKEN), wrong]]))[0]
      assert.equal(invalid.label, 'unverified')
    }
    const distributorQuote = { ...quote, tokenAddress: campaign.contract!.address }
    assert.equal(buildRows([campaign], identity, now, new Set(), new Set(), records,
      new Map([[marketTokenKey(1, campaign.contract!.address), distributorQuote]]))[0].label, 'unverified', 'Kontrak distributor bukan token reward')
  })
  await step('Detail pasar: ganti wallet/sumber membatalkan kutipan lama meskipun transport terlambat', async () => {
    const uni = mapDefiLlamaPayloadToCampaigns([], { checkedAt: new Date().toISOString() }).find((campaign) => campaign.project === 'Uniswap')!
    let finish!: (value: TokenMarketEvidence) => void
    let signal: AbortSignal | undefined
    const controller = createCampaignMarketController(async (request) => {
      assert.equal(request.tokenAddress, UNI_TOKEN)
      signal = request.signal
      return new Promise((resolve) => { finish = resolve })
    })
    controller.configure(uni, 'walletA:all', true)
    const reading = controller.refresh()
    controller.configure(uni, 'walletB:live', true)
    assert.equal(signal?.aborted, true)
    finish({ status: 'unknown', chainId: 1, tokenAddress: UNI_TOKEN, priceUsd: null, liquidityUsd: null,
      pairAddress: null, sourceUrl: null, checkedAt: null, reason: 'Fixture terlambat' })
    await reading
    assert.equal(controller.getSnapshot().size, 0)
    controller.configure(uni, 'walletB:live', false)
    await controller.refresh()
    assert.equal(controller.getSnapshot().size, 0)
  })
  await step('Detail pasar: harga yang telah dibaca dibersihkan saat tutup atau buka campaign tanpa token terverifikasi', async () => {
    const uni = mapDefiLlamaPayloadToCampaigns([], { checkedAt: new Date().toISOString() }).find((campaign) => campaign.project === 'Uniswap')!
    let calls = 0
    const controller = createCampaignMarketController(async ({ chainId, tokenAddress }) => {
      calls += 1
      return { status: 'unknown', chainId, tokenAddress, priceUsd: null, liquidityUsd: null,
        pairAddress: null, sourceUrl: null, checkedAt: null, reason: 'Fixture unknown' }
    })
    controller.configure(uni, 'walletA', true)
    await controller.refresh()
    assert.equal(controller.getSnapshot().size, 1)
    controller.configure(null, 'walletA', true)
    assert.equal(controller.getSnapshot().size, 0)
    controller.configure({ ...uni, id: '1:clone:uni' }, 'walletA', true)
    await controller.refresh()
    assert.equal(calls, 1)
  })
  return { passed: details.length, details }
}
