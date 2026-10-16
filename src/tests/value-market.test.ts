import assert from 'node:assert/strict'
import { fetchTokenMarket, isMarketEvidenceFresh, marketTokenKey, MARKET_TTL_MS, type TokenMarketEvidence } from '../adapters/market'
import type { HexAddress } from '../domain/types'

const TOKEN: HexAddress = '0xAb11111111111111111111111111111111111111'
const OTHER: HexAddress = '0x2222222222222222222222222222222222222222'
const PAIR: HexAddress = '0x3333333333333333333333333333333333333333'
const SECOND_PAIR: HexAddress = '0x4444444444444444444444444444444444444444'
const NOW = Date.parse('2026-10-16T00:00:00.000Z')
const REQUEST = { chainId: 1, tokenAddress: TOKEN }

function pair(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 'ethereum', pairAddress: PAIR,
    baseToken: { address: TOKEN }, quoteToken: { address: OTHER },
    priceUsd: '1.25', liquidity: { usd: 2500 },
    url: `https://dexscreener.com/ethereum/${PAIR}`, ...overrides,
  }
}

function fetchPayload(payload: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(payload), { status: 200 })
}

async function read(payload: unknown): Promise<TokenMarketEvidence> {
  return fetchTokenMarket(REQUEST, { fetchFn: fetchPayload(payload), now: () => NOW })
}

function assertUnknown(evidence: TokenMarketEvidence) {
  assert.equal(evidence.status, 'unknown')
  assert.equal(evidence.priceUsd, null)
  assert.equal(evidence.liquidityUsd, null)
  assert.equal(evidence.pairAddress, null)
  assert.equal(evidence.sourceUrl, null)
  assert.equal(evidence.checkedAt, null)
  assert.ok(evidence.reason.length > 0)
  assert.equal(isMarketEvidenceFresh(evidence, NOW), false)
}

export async function runValueMarketTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  const step = async (name: string, run: () => void | Promise<void>) => {
    await run()
    details.push(`PASS: ${name}`)
  }

  await step('Pasar: endpoint token publik memakai chain tepat, GET tanpa kredensial dan tanpa payload transaksi', async () => {
    let url = ''
    let init: RequestInit | undefined
    const evidence = await fetchTokenMarket(REQUEST, {
      now: () => NOW,
      fetchFn: async (input, options) => {
        url = String(input)
        init = options
        return new Response(JSON.stringify([pair()]))
      },
    })
    assert.equal(url, `https://api.dexscreener.com/token-pairs/v1/ethereum/${TOKEN}`)
    assert.equal(init?.method, 'GET')
    assert.equal(init?.credentials, 'omit')
    assert.equal(init?.redirect, 'error')
    assert.equal(init?.cache, 'no-store')
    assert.equal(init?.body, undefined)
    assert.ok(init?.signal instanceof AbortSignal)
    assert.equal(evidence.status, 'available')
    assert.equal(evidence.checkedAt, new Date(NOW).toISOString())
    assert.equal(evidence.priceUsd, '1.25')
    assert.equal(evidence.liquidityUsd, 2500)
    assert.ok(isMarketEvidenceFresh(evidence, NOW))
  })

  await step('Pasar: kecocokan hanya quote token atau chain lain tidak membuktikan harga token tujuan', async () => {
    assertUnknown(await read([
      pair({ baseToken: { address: OTHER }, quoteToken: { address: TOKEN } }),
      pair({ chainId: 'base' }),
      pair({ chainId: 1 }),
    ]))
    const evidence = await read([pair({ baseToken: { address: TOKEN.toLowerCase() } })])
    assert.equal(evidence.status, 'available')
    assert.equal(marketTokenKey(1, TOKEN), marketTokenKey(1, TOKEN.toLowerCase() as HexAddress))
  })

  await step('Pasar: pool cocok berlikuiditas terbesar dipilih, tanpa ambang USD atau pembatasan koin', async () => {
    const evidence = await read([
      pair({ liquidity: { usd: 0.00001 }, priceUsd: '1e-20' }),
      pair({ pairAddress: SECOND_PAIR, liquidity: { usd: 6000 }, priceUsd: '1.3' }),
      pair({ liquidity: { usd: 5000 }, priceUsd: '1.4' }),
    ])
    assert.equal(evidence.pairAddress, SECOND_PAIR)
    assert.equal(evidence.liquidityUsd, 6000)
    assert.equal(evidence.priceUsd, '1.3')
    const tiny = await read([pair({ liquidity: { usd: 0.00001 }, priceUsd: '1e-20' })])
    assert.equal(tiny.status, 'available')
    assert.equal(tiny.priceUsd, '1e-20')
    assert.equal(tiny.liquidityUsd, 0.00001)
  })

  await step('Pasar: entri duplikat tidak menyembunyikan observasi likuiditas lebih kuat', async () => {
    const evidence = await read([
      pair({ liquidity: { usd: 1 }, priceUsd: '1' }),
      pair({ liquidity: { usd: 10 }, priceUsd: '2' }),
    ])
    assert.equal(evidence.liquidityUsd, 10)
    assert.equal(evidence.priceUsd, '2')
  })

  await step('Pasar: harga kosong, nol, negatif, nonnumerik, tidak hingga, dan bentuk nonstring tetap unknown', async () => {
    for (const priceUsd of [null, undefined, '', '0', '0.000', '-1', 'NaN', 'Infinity', '1e999', '1e-999', ' 1 ', '0x10', '1 USD', '1'.repeat(129), 1, true]) {
      assertUnknown(await read([pair({ priceUsd })]))
    }
  })

  await step('Pasar: likuiditas harus angka positif hingga; data rusak tidak menjadi harga palsu', async () => {
    for (const usd of [null, undefined, 0, -1, '100', true]) {
      assertUnknown(await read([pair({ liquidity: { usd } })]))
    }
    for (const payload of [null, {}, { pairs: [pair()] }, [], [null, 0, [], {}], [pair({ baseToken: null })], [pair({ liquidity: null })]]) {
      assertUnknown(await read(payload))
    }
  })

  await step('Pasar: link bukti dipatok ke DEX Screener; URL dan pair address sumber tidak dipercaya', async () => {
    const evidence = await read([pair({ url: 'javascript:alert(1)', pairAddress: PAIR.toUpperCase().replace('0X', '0x') })])
    assert.equal(evidence.sourceUrl, `https://dexscreener.com/ethereum/${PAIR}`)
    for (const pairAddress of ['javascript:alert(1)', `${PAIR}/../evil`, '0x0000000000000000000000000000000000000000', '0x123', null]) {
      assertUnknown(await read([pair({ pairAddress })]))
    }
  })

  await step('Pasar: TTL lima menit menolak observasi basi, masa depan, tanggal invalid, serta bukti yang berubah', async () => {
    const evidence = await read([pair()])
    assert.ok(isMarketEvidenceFresh(evidence, NOW + MARKET_TTL_MS))
    assert.equal(isMarketEvidenceFresh(evidence, NOW + MARKET_TTL_MS + 1), false)
    assert.equal(isMarketEvidenceFresh(evidence, NOW - 1), false)
    assert.equal(isMarketEvidenceFresh(evidence, Number.NaN), false)
    for (const changed of [
      { checkedAt: 'invalid' }, { checkedAt: '2026-10-16' }, { checkedAt: null },
      { status: 'unknown' }, { sourceUrl: 'https://evil.example/price' },
      { chainId: 8453 }, { priceUsd: '0' }, { liquidityUsd: 0 },
      { tokenAddress: '0x0000000000000000000000000000000000000000' },
    ]) {
      assert.equal(isMarketEvidenceFresh({ ...evidence, ...changed } as TokenMarketEvidence, NOW), false)
    }
  })

  await step('Pasar: jaringan yang belum didukung tetap unknown dan identitas invalid tidak mengirim permintaan', async () => {
    let calls = 0
    const fetchFn: typeof fetch = async () => { calls += 1; throw new Error('Unexpected call') }
    for (const request of [
      { ...REQUEST, chainId: 999999999 }, { ...REQUEST, chainId: 1.5 },
      { ...REQUEST, chainId: -1 }, { ...REQUEST, tokenAddress: '0x123' as HexAddress },
      { ...REQUEST, tokenAddress: '0x0000000000000000000000000000000000000000' as HexAddress },
    ]) assertUnknown(await fetchTokenMarket(request, { fetchFn }))
    assert.equal(calls, 0)
  })

  await step('Pasar: chain slug resmi tetap sesuai untuk jaringan provider yang didukung', async () => {
    const slugs = [
      [1, 'ethereum'], [8453, 'base'], [42161, 'arbitrum'], [56, 'bsc'],
      [137, 'polygon'], [10, 'optimism'], [43114, 'avalanche'], [324, 'zksync'],
      [130, 'unichain'], [42220, 'celo'], [59144, 'linea'], [534352, 'scroll'],
    ] as const
    for (const [chainId, slug] of slugs) {
      const evidence = await fetchTokenMarket({ ...REQUEST, chainId }, {
        now: () => NOW, fetchFn: async (input) => {
          assert.equal(String(input), `https://api.dexscreener.com/token-pairs/v1/${slug}/${TOKEN}`)
          return new Response(JSON.stringify([pair({ chainId: slug })]))
        },
      })
      assert.equal(evidence.status, 'available')
      assert.equal(evidence.sourceUrl, `https://dexscreener.com/${slug}/${PAIR}`)
    }
  })

  await step('Pasar: HTTP, CORS, JSON invalid, dan pembacaan body gagal menghasilkan unknown', async () => {
    for (const fetchFn of [
      async () => new Response('{}', { status: 429 }),
      async () => new Response('{}', { status: 500 }),
      async () => { throw new TypeError('Failed to fetch') },
      async () => new Response('{invalid json'),
      async () => ({ ok: true, json: async () => { throw new Error('Body failed') } }) as unknown as Response,
    ]) assertUnknown(await fetchTokenMarket(REQUEST, { fetchFn }))
    assertUnknown(await fetchTokenMarket(REQUEST, { now: () => Number.NaN, fetchFn: fetchPayload([pair()]) }))
  })

  await step('Pasar: timeout membatasi fetch dan body walau transport mengabaikan signal', async () => {
    const never = () => new Promise<Response>(() => {})
    const timedOut = await fetchTokenMarket(REQUEST, { fetchFn: never, timeoutMs: 2 })
    assertUnknown(timedOut)
    assert.match(timedOut.reason, /batas waktu/)
    const neverBody: typeof fetch = async () => ({ ok: true, json: () => new Promise(() => {}) }) as unknown as Response
    assertUnknown(await fetchTokenMarket(REQUEST, { fetchFn: neverBody, timeoutMs: 2 }))
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assertUnknown(await fetchTokenMarket(REQUEST, { fetchFn: never, timeoutMs }))
    }
  })

  await step('Pasar: pembatalan pengguna menolak AbortError termasuk sebelum fetch dan saat body tertunda', async () => {
    const aborted = new AbortController()
    aborted.abort()
    let calls = 0
    await assert.rejects(() => fetchTokenMarket({ ...REQUEST, signal: aborted.signal }, {
      fetchFn: async () => { calls += 1; return new Response('[]') },
    }), { name: 'AbortError' })
    assert.equal(calls, 0)
    for (const fetchFn of [
      () => new Promise<Response>(() => {}),
      async () => ({ ok: true, json: () => new Promise(() => {}) }) as unknown as Response,
    ]) {
      const controller = new AbortController()
      const promise = fetchTokenMarket({ ...REQUEST, signal: controller.signal }, { fetchFn })
      controller.abort()
      await assert.rejects(() => promise, { name: 'AbortError' })
    }
  })

  return { passed: details.length, details }
}
