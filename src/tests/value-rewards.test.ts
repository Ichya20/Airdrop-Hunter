import assert from 'node:assert/strict'
import { marketTokenKey, type TokenMarketEvidence } from '../adapters/market'
import type { WalletReward, WalletRewardsResult } from '../adapters/rewards/merkl'
import type { HexAddress, Identity } from '../domain/types'
import { createWalletRewardsController } from '../features/rewards/controller'

const ADDRESS: HexAddress = '0x1111111111111111111111111111111111111111'
const PAIR: HexAddress = '0x2222222222222222222222222222222222222222'
const WATCH: Identity = { kind: 'watch', address: ADDRESS }
const checkedAt = '2026-10-16T00:00:00.000Z'

function reward(index = 1, overrides: Partial<WalletReward> = {}): WalletReward {
  const tokenAddress = `0x${index.toString(16).padStart(40, '0')}` as HexAddress
  return {
    id: `1:${tokenAddress}`, chainId: 1, chainName: 'Ethereum', tokenAddress,
    symbol: `COIN${index}`, decimals: 18, assetType: 'TOKEN', isTest: false, tokenVerified: true,
    amount: '100', claimed: '20', pending: '3', claimable: '80', cost: 'user_pays_gas',
    source: 'https://docs.merkl.xyz', ...overrides,
  }
}
function market(chainId: number, tokenAddress: HexAddress): TokenMarketEvidence {
  return {
    status: 'available', chainId, tokenAddress, priceUsd: '2', liquidityUsd: 1000,
    pairAddress: PAIR, sourceUrl: `https://dexscreener.com/ethereum/${PAIR}`, checkedAt, reason: 'Indikasi pasar',
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return
    await Promise.resolve()
  }
  assert.fail('Pembaruan controller yang diharapkan tidak terjadi.')
}
function configure(controller: ReturnType<typeof createWalletRewardsController>) {
  controller.configure({ identity: WATCH, scanKey: 'first', enabled: true })
}

export async function runValueRewardTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  const step = async (name: string, run: () => void | Promise<void>) => { await run(); details.push(`PASS: ${name}`) }

  await step('Reward bernilai: laporan token tampil segera sambil pemeriksaan pasar berlangsung', async () => {
    const pending = deferred<TokenMarketEvidence>()
    const entry = reward()
    const controller = createWalletRewardsController(async () => ({ checkedAt, rewards: [entry] }), {
      fetchMarket: async () => pending.promise, marketIntervalMs: 0,
    })
    configure(controller)
    const request = controller.refresh()
    await until(() => controller.getSnapshot().marketStatus === 'loading')
    assert.equal(controller.getSnapshot().status, 'success')
    assert.equal(controller.getSnapshot().rewards.length, 1)
    assert.equal(controller.getSnapshot().marketTotal, 1)
    assert.equal(controller.getSnapshot().marketCompleted, 0)
    pending.resolve(market(entry.chainId, entry.tokenAddress))
    await request
    assert.equal(controller.getSnapshot().marketStatus, 'done')
    assert.equal(controller.getSnapshot().marketCompleted, 1)
    assert.equal(controller.getSnapshot().markets.get(marketTokenKey(1, entry.tokenAddress))?.status, 'available')
  })
  await step('Reward bernilai: semua token positif diperiksa tanpa batas total dan tanpa daftar simbol', async () => {
    const entries = Array.from({ length: 325 }, (_item, index) => reward(index + 1))
    const calls: string[] = []
    const controller = createWalletRewardsController(async () => ({ checkedAt, rewards: entries }), {
      fetchMarket: async ({ chainId, tokenAddress }) => { calls.push(marketTokenKey(chainId, tokenAddress)); return market(chainId, tokenAddress) },
      marketIntervalMs: 0,
    })
    configure(controller)
    await controller.refresh()
    const state = controller.getSnapshot()
    assert.equal(calls.length, 325)
    assert.equal(new Set(calls).size, 325)
    assert.equal(state.rewards.length, 325)
    assert.equal(state.markets.size, 325)
    assert.equal(state.marketCompleted, 325)
    assert.equal(state.marketStatus, 'done')
  })
  await step('Reward bernilai: nol, poin, pre-TGE, dan testnet tidak meminta harga; jaringan baru tetap diperiksa', async () => {
    const entries = [reward(1, { claimable: '0' }), reward(2, { assetType: 'POINT' }), reward(3, { assetType: 'PRETGE' }),
      reward(4, { isTest: true }), reward(5, { chainId: 421614, isTest: false }), reward(6, { chainId: 987654321 }), reward(7)]
    const calls: number[] = []
    const controller = createWalletRewardsController(async () => ({ checkedAt, rewards: entries }), {
      fetchMarket: async ({ chainId, tokenAddress }) => { calls.push(chainId); return { ...market(chainId, tokenAddress), status: 'unknown' } },
      marketIntervalMs: 0,
    })
    configure(controller)
    await controller.refresh()
    assert.deepEqual(calls, [987654321, 1])
    assert.equal(controller.getSnapshot().rewards.length, 7)
    assert.equal(controller.getSnapshot().marketTotal, 2)
  })
  await step('Reward bernilai: dua pekerja membatasi permintaan serentak', async () => {
    const entries = [reward(1), reward(2), reward(3)]
    const pending: { entry: WalletReward; wait: ReturnType<typeof deferred<TokenMarketEvidence>> }[] = []
    let inFlight = 0
    let maximum = 0
    const controller = createWalletRewardsController(async () => ({ checkedAt, rewards: entries }), {
      fetchMarket: async ({ tokenAddress }) => {
        inFlight += 1
        maximum = Math.max(maximum, inFlight)
        const wait = deferred<TokenMarketEvidence>()
        pending.push({ entry: entries.find((entry) => entry.tokenAddress === tokenAddress)!, wait })
        const result = await wait.promise
        inFlight -= 1
        return result
      }, marketIntervalMs: 0,
    })
    configure(controller)
    const request = controller.refresh()
    await until(() => pending.length === 2)
    assert.equal(inFlight, 2)
    pending[0].wait.resolve(market(1, pending[0].entry.tokenAddress))
    await until(() => pending.length === 3)
    pending[1].wait.resolve(market(1, pending[1].entry.tokenAddress))
    pending[2].wait.resolve(market(1, pending[2].entry.tokenAddress))
    await request
    assert.equal(maximum, 2)
    assert.equal(controller.getSnapshot().marketCompleted, 3)
  })
  await step('Reward bernilai: gate membatasi laju awal permintaan pada kedua pekerja', async () => {
    const starts: number[] = []
    const controller = createWalletRewardsController(async () => ({ checkedAt, rewards: [reward(1), reward(2), reward(3)] }), {
      fetchMarket: async ({ chainId, tokenAddress }) => { starts.push(Date.now()); return market(chainId, tokenAddress) },
      marketIntervalMs: 20,
    })
    configure(controller)
    await controller.refresh()
    assert.equal(starts.length, 3)
    assert.ok(starts[1] - starts[0] >= 19)
    assert.ok(starts[2] - starts[1] >= 19)
  })
  await step('Reward bernilai: satu sumber harga gagal tidak menghapus laporan reward atau token lainnya', async () => {
    const entries = [reward(1), reward(2)]
    const controller = createWalletRewardsController(async () => ({ checkedAt, rewards: entries }), {
      fetchMarket: async ({ chainId, tokenAddress }) => {
        if (tokenAddress === entries[0].tokenAddress) throw new Error('Harga offline')
        return market(chainId, tokenAddress)
      }, marketIntervalMs: 0,
    })
    configure(controller)
    await controller.refresh()
    const state = controller.getSnapshot()
    assert.equal(state.status, 'success')
    assert.equal(state.rewards.length, 2)
    assert.equal(state.marketCompleted, 2)
    assert.equal(state.markets.get(marketTokenKey(1, entries[0].tokenAddress))?.status, 'unknown')
    assert.equal(state.markets.get(marketTokenKey(1, entries[1].tokenAddress))?.status, 'available')
  })
  await step('Reward bernilai: pergantian wallet, chain, mode, scan, dan cancel membuang hasil pasar terlambat', async () => {
    const nextContexts = [
      { identity: { kind: 'watch', address: PAIR } as Identity, scanKey: 'first', enabled: true },
      { identity: { kind: 'metamask', address: ADDRESS, chainId: 10 } as Identity, scanKey: 'first', enabled: true },
      { identity: WATCH, scanKey: 'first', enabled: false },
      { identity: WATCH, scanKey: 'second', enabled: true },
      null,
    ]
    for (const next of nextContexts) {
      const pending = deferred<TokenMarketEvidence>()
      let signal: AbortSignal | undefined
      const entry = reward()
      const controller = createWalletRewardsController(async () => ({ checkedAt, rewards: [entry] }), {
        fetchMarket: async (request) => { signal = request.signal; return pending.promise }, marketIntervalMs: 0,
      })
      configure(controller)
      const request = controller.refresh()
      await until(() => signal !== undefined)
      if (next) controller.configure(next)
      else controller.cancel()
      assert.equal(signal?.aborted, true)
      assert.equal(controller.getSnapshot().status, 'idle')
      assert.equal(controller.getSnapshot().markets.size, 0)
      pending.resolve(market(1, entry.tokenAddress))
      await request
      assert.equal(controller.getSnapshot().status, 'idle')
      assert.equal(controller.getSnapshot().markets.size, 0)
    }
  })
  await step('Reward bernilai: refresh menghapus kutipan lama dan menolak hasil refresh yang digantikan', async () => {
    const pending = deferred<TokenMarketEvidence>()
    const entry = reward()
    let marketCalls = 0
    const controller = createWalletRewardsController(async () => ({ checkedAt, rewards: [entry] }), {
      fetchMarket: async ({ chainId, tokenAddress }) => { marketCalls += 1; return marketCalls === 1 ? pending.promise : { ...market(chainId, tokenAddress), priceUsd: '9' } },
      marketIntervalMs: 0,
    })
    configure(controller)
    const first = controller.refresh()
    await until(() => marketCalls === 1)
    const second = controller.refresh()
    assert.equal(controller.getSnapshot().markets.size, 0)
    await second
    assert.equal(controller.getSnapshot().markets.get(marketTokenKey(1, entry.tokenAddress))?.priceUsd, '9')
    pending.resolve(market(1, entry.tokenAddress))
    await first
    assert.equal(controller.getSnapshot().markets.get(marketTokenKey(1, entry.tokenAddress))?.priceUsd, '9')
  })
  await step('Reward bernilai: API kosong selesai tanpa membuat harga atau kandidat palsu', async () => {
    let calls = 0
    const controller = createWalletRewardsController(async (): Promise<WalletRewardsResult> => ({ checkedAt, rewards: [] }), {
      fetchMarket: async ({ chainId, tokenAddress }) => { calls += 1; return market(chainId, tokenAddress) }, marketIntervalMs: 0,
    })
    configure(controller)
    await controller.refresh()
    assert.equal(controller.getSnapshot().status, 'success')
    assert.equal(controller.getSnapshot().marketStatus, 'done')
    assert.equal(controller.getSnapshot().marketCompleted, 0)
    assert.equal(controller.getSnapshot().marketTotal, 0)
    assert.equal(calls, 0)
  })
  return { passed: details.length, details }
}
