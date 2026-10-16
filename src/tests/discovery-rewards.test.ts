import assert from 'node:assert/strict'
import { fetchMerklWalletRewards, MERKL_REWARDS_API, parseMerklWalletRewards, type WalletReward, type WalletRewardsResult } from '../adapters/rewards/merkl'
import type { HexAddress, Identity } from '../domain/types'
import type { TokenMarketEvidence } from '../adapters/market'
import { createWalletRewardsController } from '../features/rewards/controller'

const ADDRESS: HexAddress = '0x1111111111111111111111111111111111111111'
const WATCH: Identity = { kind: 'watch', address: ADDRESS }

function tokenReward(index = 1, overrides: Record<string, unknown> = {}) {
  return {
    token: {
      address: `0x${index.toString(16).padStart(40, '0')}`, chainId: 1, symbol: `COIN${index}`,
      decimals: 18, type: 'TOKEN', isTest: false, verified: true,
    },
    amount: '100000000000000000000', claimed: '25000000000000000000', pending: '9000000000000000000',
    proofs: ['untrusted proof ignored'], ...overrides,
  }
}

function group(rewards: unknown[] = [tokenReward()]) {
  return { chain: { id: 1, name: 'Ethereum' }, rewards }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const RESULT: WalletRewardsResult = { checkedAt: '2026-10-15T00:00:00.000Z', rewards: [] }
const MARKET_OPTIONS = {
  marketIntervalMs: 0,
  fetchMarket: async ({ chainId, tokenAddress }: { chainId: number; tokenAddress: HexAddress }): Promise<TokenMarketEvidence> => ({
    status: 'unknown', chainId, tokenAddress, priceUsd: null, liquidityUsd: null,
    pairAddress: null, sourceUrl: null, checkedAt: null, reason: 'Stub pasar untuk pengujian controller reward.',
  }),
}

export async function runDiscoveryRewardTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  const step = async (name: string, run: () => void | Promise<void>) => {
    await run()
    details.push(`PASS: ${name}`)
  }

  await step('Reward API: amount - claimed memakai BigInt; pending terpisah dan proof tidak diteruskan', () => {
    const [reward] = parseMerklWalletRewards([group()])
    assert.equal(reward.claimable, '75000000000000000000')
    assert.equal(reward.pending, '9000000000000000000')
    assert.equal(reward.cost, 'user_pays_gas')
    assert.equal('proofs' in reward, false)
    assert.equal('tx' in reward, false)
    assert.equal('eligibility' in reward, false)
  })

  await step('Reward API: seluruh koin/jaringan dipertahankan tanpa batas total, termasuk tipe bukan token live', () => {
    const entries = Array.from({ length: 325 }, (_item, index) => tokenReward(index + 1))
    const point = tokenReward(400, { token: { ...tokenReward(400).token, type: 'POINT' } })
    const pretge = tokenReward(401, { token: { ...tokenReward(401).token, type: 'PRETGE' } })
    const test = tokenReward(402, { token: { ...tokenReward(402).token, isTest: true, verified: false } })
    const unknownChain = {
      chain: { id: 999999999, name: 'Chain baru dari API' },
      rewards: [{ ...tokenReward(403), token: { ...tokenReward(403).token, chainId: 999999999 } }],
    }
    const rewards = parseMerklWalletRewards([group([...entries, point, pretge, test]), unknownChain])
    assert.equal(rewards.length, 329)
    assert.equal(rewards[325].assetType, 'POINT')
    assert.equal(rewards[326].assetType, 'PRETGE')
    assert.equal(rewards[327].isTest, true)
    assert.equal(rewards[327].tokenVerified, false)
    assert.equal(rewards[328].chainId, 999999999)
    assert.ok(rewards.every((reward) => reward.cost === 'user_pays_gas'))
  })

  await step('Reward API: uint256 maksimum tetap presisi; data tidak konsisten atau rusak gagal tanpa saldo palsu', () => {
    const max = ((1n << 256n) - 1n).toString()
    assert.equal(parseMerklWalletRewards([group([tokenReward(1, { amount: max, claimed: '0' })])])[0].claimable, max)
    for (const invalid of ['-1', '1.5', '1e6', '01', '', (1n << 256n).toString(), 123]) {
      assert.throws(() => parseMerklWalletRewards([group([tokenReward(1, { amount: invalid })])]))
    }
    assert.throws(() => parseMerklWalletRewards([group([tokenReward(1, { claimed: '100000000000000000001' })])]))
    assert.throws(() => parseMerklWalletRewards({ rewards: [] }))
    assert.throws(() => parseMerklWalletRewards([group([tokenReward(1, { token: { ...tokenReward().token, chainId: 10 } })])]))
    assert.throws(() => parseMerklWalletRewards([group([tokenReward(1, { token: { ...tokenReward().token, decimals: 256 } })])]))
    assert.throws(() => parseMerklWalletRewards([group([tokenReward(1, { token: { ...tokenReward().token, type: 'FUTURE_UNKNOWN' } })])]))
    assert.throws(() => parseMerklWalletRewards([group([tokenReward(), tokenReward()])]))
  })

  await step('Reward API: summary resmi tanpa filter token/chain, hanya GET publik dan tanpa kredensial', async () => {
    let requestedUrl = ''
    let init: RequestInit | undefined
    const result = await fetchMerklWalletRewards(ADDRESS, { fetchFn: async (input, options) => {
      requestedUrl = String(input)
      init = options
      return new Response(JSON.stringify([group()]), { status: 200 })
    } })
    assert.equal(requestedUrl, `${MERKL_REWARDS_API}/${ADDRESS}/rewards/summary`)
    assert.equal(new URL(requestedUrl).search, '')
    assert.equal(init?.method, 'GET')
    assert.equal(init?.credentials, 'omit')
    assert.equal(init?.body, undefined)
    assert.equal(result.rewards.length, 1)
    assert.ok(Number.isFinite(Date.parse(result.checkedAt)))
  })

  await step('Reward API: kosong sah berbeda dari HTTP/CORS/format gagal', async () => {
    const empty = await fetchMerklWalletRewards(ADDRESS, { fetchFn: async () => new Response('[]') })
    assert.deepEqual(empty.rewards, [])
    await assert.rejects(() => fetchMerklWalletRewards(ADDRESS, { fetchFn: async () => new Response('{}', { status: 429 }) }), /HTTP 429/)
    await assert.rejects(() => fetchMerklWalletRewards(ADDRESS, { fetchFn: async () => { throw new TypeError('fetch failed') } }), /belum diketahui/)
    await assert.rejects(() => fetchMerklWalletRewards(ADDRESS, { fetchFn: async () => new Response('null') }), /Merkl/)
  })

  await step('Reward API: timeout dan abort selesai walau transport tidak mengindahkan signal', async () => {
    const neverFetch = () => new Promise<Response>(() => {})
    await assert.rejects(() => fetchMerklWalletRewards(ADDRESS, { fetchFn: neverFetch, timeoutMs: 2 }), /batas waktu/)
    const controller = new AbortController()
    const request = fetchMerklWalletRewards(ADDRESS, { fetchFn: neverFetch, signal: controller.signal })
    controller.abort()
    await assert.rejects(() => request, { name: 'AbortError' })
    await assert.rejects(() => fetchMerklWalletRewards(ADDRESS, { fetchFn: neverFetch, signal: controller.signal }), { name: 'AbortError' })
  })

  await step('Reward controller: akun DEMO/tanpa akun/mode nonaktif tidak mengambil data wallet', async () => {
    let calls = 0
    const controller = createWalletRewardsController(async () => { calls += 1; return RESULT }, MARKET_OPTIONS)
    for (const [identity, enabled] of [[{ kind: 'none' }, true], [{ kind: 'demo' }, true], [WATCH, false]] as const) {
      controller.configure({ identity, enabled, scanKey: 'first' })
      await controller.refresh()
      assert.equal(controller.getSnapshot().status, 'idle')
    }
    assert.equal(calls, 0)
  })

  await step('Reward controller: pergantian wallet, jaringan, dan scan mengabaikan respons terlambat', async () => {
    for (const next of [
      { identity: { ...WATCH, address: '0x2222222222222222222222222222222222222222' } as Identity, enabled: true, scanKey: '1' },
      { identity: { kind: 'metamask', address: ADDRESS, chainId: 10 } as Identity, enabled: true, scanKey: '1' },
      { identity: WATCH, enabled: true, scanKey: '2' },
      { identity: WATCH, enabled: false, scanKey: '1' },
    ]) {
      const pending = deferred<WalletRewardsResult>()
      let signal: AbortSignal | undefined
      const controller = createWalletRewardsController(async (_address, options) => { signal = options?.signal; return pending.promise }, MARKET_OPTIONS)
      controller.configure({ identity: WATCH, enabled: true, scanKey: '1' })
      const request = controller.refresh()
      assert.equal(controller.getSnapshot().status, 'loading')
      controller.configure(next)
      assert.equal(signal?.aborted, true)
      pending.resolve({ ...RESULT, rewards: parseMerklWalletRewards([group()]) })
      await request
      assert.equal(controller.getSnapshot().status, 'idle')
      assert.equal(controller.getSnapshot().rewards.length, 0)
    }
  })

  await step('Reward controller: cek ulang membuang saldo sebelumnya dan kegagalan tetap unknown', async () => {
    const known: WalletReward[] = parseMerklWalletRewards([group()])
    let fail = false
    const controller = createWalletRewardsController(async () => {
      if (fail) throw new Error('Sumber offline')
      return { ...RESULT, rewards: known }
    }, MARKET_OPTIONS)
    controller.configure({ identity: WATCH, enabled: true, scanKey: '1' })
    await controller.refresh()
    assert.equal(controller.getSnapshot().status, 'success')
    assert.equal(controller.getSnapshot().rewards.length, 1)
    fail = true
    const request = controller.refresh()
    assert.equal(controller.getSnapshot().status, 'loading')
    assert.equal(controller.getSnapshot().rewards.length, 0)
    await request
    assert.equal(controller.getSnapshot().status, 'error')
    assert.equal(controller.getSnapshot().rewards.length, 0)
    assert.equal(controller.getSnapshot().checkedAt, null)
    assert.equal(controller.getSnapshot().error, 'Sumber offline')
  })

  await step('Reward controller: cancel sebelum clear/import mencegah hasil lama muncul kembali', async () => {
    const pending = deferred<WalletRewardsResult>()
    const controller = createWalletRewardsController(async () => pending.promise, MARKET_OPTIONS)
    controller.configure({ identity: WATCH, enabled: true, scanKey: '1' })
    const request = controller.refresh()
    controller.cancel()
    pending.resolve({ ...RESULT, rewards: parseMerklWalletRewards([group()]) })
    await request
    assert.equal(controller.getSnapshot().status, 'idle')
    assert.equal(controller.getSnapshot().rewards.length, 0)
  })

  return { passed: details.length, details }
}
