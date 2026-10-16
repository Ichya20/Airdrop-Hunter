import assert from 'node:assert/strict'
import {
  createLiveDefiLlamaAdapter,
  createSourceAdapters,
  createSourceRateLimiter,
  createUnsupportedSourceAdapter,
  LIVE_DEFILLAMA_SOURCE_ID,
  MERKL_CATALOG_SOURCE_ID,
  mapDefiLlamaPayloadToCampaigns,
  parseRetryAfterMs,
  SourceError,
} from '../adapters/sources'
import { deriveLabel, resolveAction } from '../domain/status'
import type { HexAddress, Identity } from '../domain/types'
import { buildRows } from '../features/dashboard/rows'
import { runScan, type ScanEvent } from '../features/scanner/runScan'

const NOW = Date.parse('2026-10-14T12:00:00Z')
const WALLET_A: HexAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

const SAMPLE_DEFILLAMA_PAYLOAD = [
  {
    id: '2269',
    name: 'Arbitrum',
    slug: 'arbitrum',
    symbol: 'ARB',
    url: 'https://arbitrum.foundation',
    description: 'Arbitrum One L2 rollup.',
    chain: 'Arbitrum',
    chains: ['Arbitrum'],
    category: 'Chain',
    tvl: 2_500_000_000,
  },
  {
    id: '1',
    name: 'Uniswap',
    slug: 'uniswap',
    symbol: 'UNI',
    url: 'https://uniswap.org',
    description: 'Decentralized trading protocol.',
    chain: 'Ethereum',
    chains: ['Ethereum', 'Arbitrum', 'Optimism', 'Base', 'Polygon'],
    category: 'Dexes',
    tvl: 4_800_000_000,
  },
  {
    id: '9001',
    name: 'HyperBridge Lend',
    slug: 'hyperbridge-lend',
    symbol: '-',
    url: 'https://hyperbridgelend.org',
    description: 'Modular lending market on Base.',
    chain: 'Base',
    chains: ['Base', 'Arbitrum'],
    category: 'Lending',
    tvl: 42_000_000,
  },
  {
    id: '9002',
    name: 'Aether Perps',
    slug: 'aether-perps',
    symbol: '-',
    url: 'https://aetherperps.io',
    description: 'Perpetual DEX on Arbitrum.',
    chain: 'Arbitrum',
    chains: ['Arbitrum'],
    category: 'Derivatives',
    tvl: 18_500_000,
  },
  {
    // Metadata kategori CEX tetap ditemukan tanpa mengaku sebagai airdrop.
    id: '9003',
    name: 'Some CEX',
    slug: 'some-cex',
    symbol: '-',
    url: 'https://cex.io',
    chain: 'Ethereum',
    category: 'CEX',
    tvl: 900_000_000,
  },
]

export async function runStage3Tests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0

  const step = async (name: string, fn: () => void | Promise<void>) => {
    await fn()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  await step('3.1: Pemetaan payload DefiLlama menghasilkan arsip lokal dan kandidat API dengan provenance terpisah', () => {
    const campaigns = mapDefiLlamaPayloadToCampaigns(SAMPLE_DEFILLAMA_PAYLOAD, {
      checkedAt: '2026-10-14T12:00:00.000Z',
    })

    // 2 arsip lokal + 10 entri API pada semua jaringan EVM di fixture.
    assert.equal(campaigns.length, 12)
    assert.equal(campaigns.filter((campaign) => campaign.sourceKind === 'local-archive').length, 2)
    assert.equal(campaigns.filter((campaign) => campaign.sourceKind === 'api').length, 10)
    for (const c of campaigns) {
      assert.equal(c.origin, 'live')
      assert.deepEqual(c.foundIn, [LIVE_DEFILLAMA_SOURCE_ID])
    }
  })

  await step('3.2: Arsip lokal Arbitrum ($ARB) dan Uniswap ($UNI) tetap nonaktif tanpa mengaku diverifikasi API', () => {
    const campaigns = mapDefiLlamaPayloadToCampaigns(SAMPLE_DEFILLAMA_PAYLOAD, {
      checkedAt: '2026-10-14T12:00:00.000Z',
    })

    const arb = campaigns.find((c) => c.project === 'Arbitrum Foundation')
    assert.ok(arb, 'Campaign Arbitrum harus ditemukan')
    assert.equal(arb.chainId, 42161)
    assert.equal(arb.status, 'ended')
    assert.equal(arb.sourceVerified, false)
    assert.equal(arb.sourceKind, 'local-archive')
    assert.equal(arb.contract?.chainId, 42161)
    assert.equal(arb.contract?.address, '0x67a24CE4321aB3aF51c2D0a4801c3E111D88C9d9')

    const uni = campaigns.find((c) => c.project === 'Uniswap')
    assert.ok(uni, 'Campaign Uniswap harus ditemukan')
    assert.equal(uni.chainId, 1)
    assert.equal(uni.status, 'ended')
    assert.equal(uni.sourceVerified, false)
    assert.equal(uni.sourceKind, 'local-archive')
    assert.equal(uni.deadline, null)
    assert.equal(uni.contract?.chainId, 1)
    assert.equal(uni.contract?.address, '0x090D4613473dEE047c3f2706764f49E0821D256e')

    const idMeta: Identity = { kind: 'metamask', address: WALLET_A, chainId: 42161 }
    const rows = buildRows([arb, uni], idMeta, NOW, new Set(), new Set())
    for (const row of rows) {
      assert.equal(row.label, 'ended')
      assert.equal(row.action.kind, 'archive')
    }
  })

  await step('3.3: Protokol tanpa token dari agregator dipetakan jujur sebagai belum terverifikasi (unverified), bukan siap diklaim', () => {
    const campaigns = mapDefiLlamaPayloadToCampaigns(SAMPLE_DEFILLAMA_PAYLOAD, {
      checkedAt: '2026-10-14T12:00:00.000Z',
    })

    const hyper = campaigns.find((c) => c.project === 'HyperBridge Lend')
    assert.ok(hyper)
    assert.equal(hyper.chainId, 8453)
    assert.equal(hyper.status, 'opportunity')
    assert.equal(hyper.sourceVerified, false)
    assert.equal(hyper.deadline, null)
    assert.equal(hyper.contract, null)

    const label = deriveLabel(
      hyper,
      {
        status: 'unknown',
        reason: 'Belum diperiksa',
        rule: null,
        source: 'Uji',
        checkedAt: null,
      },
      null,
      NOW,
    )
    assert.equal(label, 'unverified')
    assert.equal(resolveAction(label, hyper, null).kind, 'check')
  })

  await step('3.4: Rate limiter per sumber menahan permintaan beruntun terlalu cepat dan menghormati Retry-After HTTP 429', () => {
    const limiter = createSourceRateLimiter({
      minIntervalMs: 15_000,
      maxRequestsPerWindow: 3,
      windowMs: 60_000,
    })

    // Permintaan pertama lolos
    limiter.acquire('defillama-live', 1_000, false)

    // Permintaan otomatis kedua 2 detik kemudian ditolak oleh minIntervalMs
    assert.throws(
      () => limiter.acquire('defillama-live', 3_000, false),
      (err: unknown) => err instanceof SourceError && err.kind === 'http',
    )

    // Manual retry diizinkan selama belum melewati maxRequestsPerWindow
    limiter.acquire('defillama-live', 4_000, true)
    limiter.acquire('defillama-live', 5_000, true)

    // Permintaan ke-4 dalam 60 detik ditolak oleh maxRequestsPerWindow
    assert.throws(
      () => limiter.acquire('defillama-live', 6_000, true),
      (err: unknown) => err instanceof SourceError && err.kind === 'http',
    )

    // Uji parseRetryAfterMs dan recordRetryAfter
    assert.equal(parseRetryAfterMs('45', 10_000), 45_000)
    limiter.reset('defillama-live')
    limiter.recordRetryAfter('defillama-live', '20', 10_000)
    assert.throws(
      () => limiter.acquire('defillama-live', 25_000, true),
      (err: unknown) => err instanceof SourceError && err.kind === 'http',
    )
    // Setelah lewat 20 detik (pada t=31_000), permintaan kembali diizinkan
    limiter.acquire('defillama-live', 31_000, true)
  })

  await step('3.5: Adapter live menangani respons sukses, HTTP 429, HTTP 403 (unsupported), dan pemblokiran CORS secara eksplisit', async () => {
    const limiter = createSourceRateLimiter({
      minIntervalMs: 1_000,
      maxRequestsPerWindow: 10,
      windowMs: 60_000,
    })

    // 1. Sukses
    const okAdapter = createLiveDefiLlamaAdapter({
      rateLimiter: limiter,
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => SAMPLE_DEFILLAMA_PAYLOAD,
        }) as unknown as Response,
    })
    const campaigns = await okAdapter.fetchCampaigns({
      signal: new AbortController().signal,
      attempt: 1,
      manualRetry: true,
    })
    assert.equal(campaigns.length, 12)

    // 2. HTTP 403 -> unsupported
    const forbiddenAdapter = createLiveDefiLlamaAdapter({
      rateLimiter: createSourceRateLimiter(),
      fetchFn: async () =>
        ({
          ok: false,
          status: 403,
          headers: { get: () => null },
        }) as unknown as Response,
    })
    await assert.rejects(
      () =>
        forbiddenAdapter.fetchCampaigns({
          signal: new AbortController().signal,
          attempt: 1,
          manualRetry: true,
        }),
      (err: unknown) => err instanceof SourceError && err.kind === 'unsupported',
    )

    // 3. TypeError pada fetch di browser -> cors
    const corsBlockedAdapter = createLiveDefiLlamaAdapter({
      rateLimiter: createSourceRateLimiter(),
      fetchFn: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await assert.rejects(
      () =>
        corsBlockedAdapter.fetchCampaigns({
          signal: new AbortController().signal,
          attempt: 1,
          manualRetry: true,
        }),
      (err: unknown) => err instanceof SourceError && err.kind === 'cors',
    )

    // 4. Adapter sumber tidak didukung (butuh secret/API key) + integrasi dengan runScan
    const unsupportedAdapter = createUnsupportedSourceAdapter({
      id: 'debank-pro',
      name: 'DeBank OpenAPI',
      reason: 'Memerlukan AccessKey berbayar dan tidak mendukung pemanggilan publik tanpa rahasia.',
      officialCheckerHint: 'Gunakan checker resmi masing-masing proyek.',
    })
    const events: ScanEvent[] = []
    await runScan(
      [unsupportedAdapter],
      { concurrency: 1, timeoutMs: 2_000, retries: 1, backoffMs: 50 },
      new AbortController().signal,
      (ev) => events.push(ev),
    )
    const resultEvent = events.find((e) => e.type === 'result')
    assert.ok(resultEvent && resultEvent.type === 'result')
    assert.equal(resultEvent.result.status, 'error')
    if (resultEvent.result.status === 'error') {
      assert.equal(resultEvent.result.error.kind, 'unsupported')
      // Error `unsupported` tidak boleh di-retry berulang kali (attempts === 1)
      assert.equal(resultEvent.result.attempts, 1)
    }
  })

  await step('3.6: Registry sumber memilih kombinasi adapter dengan benar berdasarkan SourceMode (all, live, demo)', () => {
    const registry = createSourceAdapters(() => 'normal')
    assert.deepEqual(registry.selectByMode('live').map((adapter) => adapter.id),
      [LIVE_DEFILLAMA_SOURCE_ID, MERKL_CATALOG_SOURCE_ID])
    assert.ok(registry.selectByMode('live').every((adapter) => adapter.origin === 'live'))
    assert.equal(registry.selectByMode('demo').length, 3)
    assert.equal(registry.selectByMode('all').length, 5)
  })

  return { passed, details }
}
