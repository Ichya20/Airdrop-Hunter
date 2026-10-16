import assert from 'node:assert/strict'
import { mergeCampaigns } from '../domain/normalize'
import {
  createMerklCatalogAdapter,
  createSourceAdapters,
  createSourceRateLimiter,
  LIVE_DEFILLAMA_ADAPTER_VERSION,
  mapDefiLlamaPayloadToCampaigns,
  mapMerklOpportunityPage,
  MERKL_CATALOG_ADAPTER_VERSION,
  MERKL_CATALOG_SOURCE_ID,
  SourceError,
  type SourceRateLimiter,
} from '../adapters/sources'

const CHECKED_AT = '2026-10-15T12:00:00.000Z'
const CONTEXT = () => ({ signal: new AbortController().signal, attempt: 1, manualRetry: false })
const token = {
  address: '0x1111111111111111111111111111111111111111', chainId: 1,
  symbol: 'ANY', decimals: 18, type: 'TOKEN', isTest: false,
}
const opportunity = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Program ${id}`, description: 'Metadata resmi program reward.',
  chainId: 1, chain: { id: 1 }, status: 'LIVE', tokens: [token], tvl: 0, apr: 0,
  ...extra,
})
const response = (payload: unknown): Response => ({
  ok: true, status: 200, json: async () => payload,
}) as Response
const fastLimiter = () => createSourceRateLimiter({ minIntervalMs: 0, maxRequestsPerWindow: 10_000, windowMs: 1 })
const isError = (kind: SourceError['kind']) => (error: unknown) => error instanceof SourceError && error.kind === kind

export async function runDiscoverySourceTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0
  const step = async (name: string, fn: () => void | Promise<void>) => {
    await fn()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  await step('Discovery: DefiLlama tidak membatasi simbol, kategori, TVL, URL, atau delapan hasil', () => {
    const payload = Array.from({ length: 25 }, (_, index) => ({
      name: `Protokol ${index}`, slug: `protocol-${index}`, symbol: `COIN${index}`,
      chain: 'Ethereum', category: ['CEX', 'Chain', 'Bridge'][index % 3], tvl: 0,
    }))
    const campaigns = mapDefiLlamaPayloadToCampaigns(payload, { checkedAt: CHECKED_AT })
    const metadata = campaigns.filter((item) => item.sourceKind === 'api')
    assert.equal(metadata.length, 25)
    assert.ok(metadata.every((item) => item.sourceVerified === false && item.status === 'opportunity'
      && item.claimMethod === 'unknown' && item.contract === null))
    assert.ok(metadata.every((item) => item.officialUrl === null))
    assert.equal(LIVE_DEFILLAMA_ADAPTER_VERSION, 'defillama-live-2.1.0', 'Checkpoint dengan kebijakan lama harus diperbarui')
  })

  await step('Discovery: semua chain EVM yang dikenali masuk; non-EVM tidak dipetakan sebagai Ethereum', () => {
    const campaigns = mapDefiLlamaPayloadToCampaigns([{
      name: 'Multichain', chain: 'Ethereum',
      chains: ['Ethereum', 'Arbitrum', 'BSC', 'Avalanche', 'Gnosis', 'Linea', 'Scroll', 'Moonbeam', 'Solana', 'Bitcoin'],
    }], { checkedAt: CHECKED_AT }).filter((item) => item.sourceKind === 'api')
    assert.deepEqual(campaigns.map((item) => item.chainId).sort((a, b) => a - b),
      [1, 56, 100, 1284, 42161, 43114, 59144, 534352].sort((a, b) => a - b))
    assert.equal(new Set(campaigns.map((item) => item.id)).size, campaigns.length)
    assert.equal(mapDefiLlamaPayloadToCampaigns([{ name: 'Solana only', chains: ['Solana'] }],
      { checkedAt: CHECKED_AT }).filter((item) => item.sourceKind === 'api').length, 0)
  })

  await step('Discovery: protokol bernama sama tidak digabung; testnet tetap dibedakan', () => {
    const mapped = mapDefiLlamaPayloadToCampaigns([
      { id: 'first', name: 'Nama Sama', chain: 'Ethereum' },
      { id: 'second', name: 'Nama Sama', chain: 'Ethereum' },
      { id: 'testnet', name: 'Uji', chain: 'Sepolia' },
    ], { checkedAt: CHECKED_AT }).filter((item) => item.sourceKind === 'api')
    assert.equal(mergeCampaigns(mapped).length, 3)
    assert.equal(mapped[0].id, '1:defillama:first')
    assert.equal(mapped[1].id, '1:defillama:second')
    assert.equal(mapped[2].origin, 'testnet')
  })

  await step('Discovery: katalog Merkl menyimpan nama asli dan ID stabil, tanpa mengaku eligible atau gratis', () => {
    const mapped = mapMerklOpportunityPage([
      opportunity('a', { name: 'Nama sama', chain: { id: 999999 }, chainId: 999999, protocol: { name: 'Protokol' } }),
      opportunity('b', { name: 'Nama sama', tokens: [{ ...token, type: 'POINT' }], status: 'PAST' }),
    ], CHECKED_AT)
    assert.equal(mapped[0].name, 'Nama sama')
    assert.equal(mapped[0].project, 'Protokol')
    assert.equal(mapped[0].chainId, 999999)
    assert.equal(mapped[0].id, '999999:merkl:a')
    assert.notEqual(mapped[0].id, mapped[1].id)
    assert.equal(mapped[1].kind, 'points')
    assert.ok(mapped.every((item) => item.sourceVerified === false && item.status === 'opportunity'
      && item.claimMethod === 'unknown' && item.contract === null && item.allocation === null))
    assert.ok(mapped.every((item) => item.checkerUrl === 'https://app.merkl.xyz/'))
    assert.equal(MERKL_CATALOG_ADAPTER_VERSION, 'merkl-catalog-1.1.0', 'Checkpoint dengan kebijakan lama harus diperbarui')
  })

  await step('Discovery: poin, PRETGE, dan data testnet tidak disamakan dengan token mainnet transferable', () => {
    const [points, preTge, testnet, testToken] = mapMerklOpportunityPage([
      opportunity('points', { rewardsRecord: { breakdowns: [{ token: { ...token, type: 'POINT' } }] } }),
      opportunity('pretge', { tokens: [{ ...token, type: 'PRETGE' }] }),
      opportunity('testnet', { chainId: 11155111, chain: { id: 11155111 } }),
      opportunity('test-token', { tokens: [{ ...token, isTest: true }] }),
    ], CHECKED_AT)
    assert.equal(points.kind, 'points')
    assert.ok(preTge.requirements.some((text) => text.includes('PRETGE')))
    assert.equal(testnet.origin, 'testnet')
    assert.equal(testToken.origin, 'testnet')
  })

  await step('Discovery: semua halaman Merkl dibaca dengan page nol dan hanya batas ukuran halaman API', async () => {
    const urls: string[] = []
    const adapter = createMerklCatalogAdapter({
      rateLimiter: fastLimiter(),
      fetchFn: async (url) => {
        urls.push(String(url))
        const page = Number(new URL(String(url)).searchParams.get('page'))
        return response(Array.from({ length: page < 2 ? 100 : 1 }, (_, index) => opportunity(String(page * 100 + index))))
      },
    })
    const mapped = await adapter.fetchCampaigns(CONTEXT())
    assert.equal(mapped.length, 201)
    assert.equal(urls.length, 3)
    assert.deepEqual(urls.map((url) => new URL(url).searchParams.get('page')), ['0', '1', '2'])
    for (const url of urls) {
      assert.deepEqual([...new URL(url).searchParams.keys()].sort(), ['items', 'page'])
      assert.equal(new URL(url).searchParams.get('items'), '100')
    }
  })

  await step('Discovery: limiter dipanggil untuk setiap halaman', async () => {
    let requests = 0
    const acquisitions: string[] = []
    const limiter: SourceRateLimiter = {
      acquire: (id) => { acquisitions.push(id) }, getRetryDelayMs: () => 0,
      recordRetryAfter: () => 30_000, reset: () => {},
    }
    const adapter = createMerklCatalogAdapter({ rateLimiter: limiter, fetchFn: async () => {
      requests += 1
      return response(requests === 1 ? Array.from({ length: 100 }, (_, index) => opportunity(String(index))) : [])
    } })
    assert.equal((await adapter.fetchCampaigns(CONTEXT())).length, 100)
    assert.deepEqual(acquisitions, [MERKL_CATALOG_SOURCE_ID, MERKL_CATALOG_SOURCE_ID])
  })

  await step('Discovery: halaman kosong valid menghasilkan kosong', async () => {
    const adapter = createMerklCatalogAdapter({ rateLimiter: fastLimiter(), fetchFn: async () => response([]) })
    assert.deepEqual(await adapter.fetchCampaigns(CONTEXT()), [])
  })

  await step('Discovery: respons/entri/token/reward/jaringan cacat ditolak, tidak menjadi kosong sukses', async () => {
    const malformed = [
      {}, { data: [] }, [opportunity('a'), null], [opportunity('', {})],
      [opportunity('a', { chain: { id: 0 } })], [opportunity('a', { chainId: 2 })],
      [opportunity('a', { tokens: [{ ...token, decimals: -1 }] })],
      [opportunity('a', { rewardsRecord: { breakdowns: [{ token: { ...token, type: 'FAKE' } }] } })],
    ]
    for (const payload of malformed) {
      const adapter = createMerklCatalogAdapter({ rateLimiter: fastLimiter(), fetchFn: async () => response(payload) })
      await assert.rejects(() => adapter.fetchCampaigns(CONTEXT()), isError('invalid'))
    }
  })

  await step('Discovery: halaman berulang dihentikan; hasil parsial tidak lolos sebagai scan lengkap', async () => {
    const payload = Array.from({ length: 100 }, (_, index) => opportunity(String(index)))
    let requests = 0
    const adapter = createMerklCatalogAdapter({ rateLimiter: fastLimiter(), fetchFn: async () => {
      requests += 1
      return response(requests % 2 === 0 ? [...payload].reverse() : payload)
    } })
    await assert.rejects(() => adapter.fetchCampaigns(CONTEXT()), isError('invalid'))
    assert.equal(requests, 2)
  })

  await step('Discovery: kegagalan halaman lanjut menolak hasil parsial', async () => {
    let requests = 0
    const adapter = createMerklCatalogAdapter({ rateLimiter: fastLimiter(), fetchFn: async () => {
      requests += 1
      return response(requests === 1 ? Array.from({ length: 100 }, (_, index) => opportunity(String(index))) : { error: 'bad' })
    } })
    await assert.rejects(() => adapter.fetchCampaigns(CONTEXT()), isError('invalid'))
    assert.equal(requests, 2)
  })

  await step('Discovery: HTTP 429 menyimpan Retry-After untuk retry berikutnya', async () => {
    const adapter = createMerklCatalogAdapter({ rateLimiter: fastLimiter(), fetchFn: async () => ({
      ok: false, status: 429, headers: { get: () => '42' },
    }) as unknown as Response })
    await assert.rejects(() => adapter.fetchCampaigns(CONTEXT()),
      (error: unknown) => error instanceof SourceError && error.kind === 'http' && error.retryAfterMs === 42_000)
    assert.ok((adapter.getRetryDelayMs?.(true) ?? 0) > 40_000)
  })

  await step('Discovery: akses berautentikasi, CORS, HTTP gagal dan JSON rusak tidak disamarkan', async () => {
    const cases: [typeof fetch, SourceError['kind']][] = [
      [async () => ({ ok: false, status: 403 }) as Response, 'unsupported'],
      [async () => ({ ok: false, status: 500 }) as Response, 'http'],
      [async () => { throw new TypeError('fetch failed') }, 'cors'],
      [async () => new Response('not-json', { status: 200 }), 'invalid'],
    ]
    for (const [fetchFn, kind] of cases) {
      const adapter = createMerklCatalogAdapter({ rateLimiter: fastLimiter(), fetchFn })
      await assert.rejects(() => adapter.fetchCampaigns(CONTEXT()), isError(kind))
    }
  })

  await step('Discovery: abort sebelum dan saat fetch tidak menghasilkan metadata terlambat', async () => {
    const controller = new AbortController()
    controller.abort()
    const adapter = createMerklCatalogAdapter({ rateLimiter: fastLimiter(), fetchFn: async () => {
      assert.fail('fetch tidak boleh dipanggil setelah abort')
    } })
    await assert.rejects(() => adapter.fetchCampaigns({ ...CONTEXT(), signal: controller.signal }), isError('aborted'))
    const active = new AbortController()
    const delayed = createMerklCatalogAdapter({ rateLimiter: fastLimiter(), fetchFn: async () => {
      active.abort()
      return response([opportunity('late')])
    } })
    await assert.rejects(() => delayed.fetchCampaigns({ ...CONTEXT(), signal: active.signal }), isError('aborted'))
  })

  await step('Discovery: registry menambah sumber live dan mempertahankan pemisahan DEMO', () => {
    const registry = createSourceAdapters(() => 'normal')
    assert.equal(registry.liveAdapter.id, 'defillama-live')
    assert.equal(registry.merklAdapter.id, MERKL_CATALOG_SOURCE_ID)
    assert.equal(registry.selectByMode('live').length, 2)
    assert.equal(registry.selectByMode('demo').length, 3)
    assert.equal(registry.selectByMode('all').length, 5)
  })
  return { passed, details }
}
