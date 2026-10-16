import assert from 'node:assert/strict'
import { UNI_TOKEN } from '../adapters/eligibility/uniMetadata'
import { marketTokenKey, MARKET_TTL_MS, type TokenMarketEvidence } from '../adapters/market'
import type { WalletReward } from '../adapters/rewards/merkl'
import { mapDefiLlamaPayloadToCampaigns } from '../adapters/sources/liveDefiLlamaAdapter'
import type { HexAddress, Identity } from '../domain/types'
import { createCampaignMarketController } from '../features/dashboard/useCampaignMarket'
import { createWalletRewardsController } from '../features/rewards/controller'

const NOW = Date.parse('2026-10-16T00:00:00.000Z')
const ADDRESS: HexAddress = '0x1111111111111111111111111111111111111111'
const PAIR: HexAddress = '0x2222222222222222222222222222222222222222'
const IDENTITY: Identity = { kind: 'watch', address: ADDRESS }

function reward(index: number, chainId = 1): WalletReward {
  const tokenAddress = `0x${index.toString(16).padStart(40, '0')}` as HexAddress
  return {
    id: `${chainId}:${tokenAddress}`, chainId, chainName: 'Jaringan fixture', tokenAddress,
    symbol: `TOKEN${index}`, decimals: 18, assetType: 'TOKEN', isTest: false, tokenVerified: true,
    amount: '10', claimed: '0', pending: '0', claimable: '10', cost: 'user_pays_gas', source: 'https://docs.merkl.xyz',
  }
}

function market(chainId: number, tokenAddress: HexAddress, checkedAt = NOW): TokenMarketEvidence {
  return {
    status: 'available', chainId, tokenAddress, priceUsd: '1', liquidityUsd: 100,
    pairAddress: PAIR, sourceUrl: `https://dexscreener.com/ethereum/${PAIR}`,
    checkedAt: new Date(checkedAt).toISOString(), reason: 'Fixture pasar',
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
  assert.fail('Pekerjaan lokal yang diharapkan tidak selesai tanpa menunggu timer API.')
}

export async function runMarketPerformanceTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  const step = async (name: string, run: () => void | Promise<void>) => { await run(); details.push(`PASS: ${name}`) }

  await step('Kinerja reward: 325 token selesai lengkap dengan pembaruan UI terkelompok dan snapshot lama tetap utuh', async () => {
    const entries = Array.from({ length: 325 }, (_, index) => reward(index + 1))
    let calls = 0
    let publications = 0
    const controller = createWalletRewardsController(async () => ({ checkedAt: new Date(NOW).toISOString(), rewards: entries }), {
      marketIntervalMs: 0,
      fetchMarket: async ({ chainId, tokenAddress }) => { calls += 1; return market(chainId, tokenAddress) },
    })
    controller.configure({ identity: IDENTITY, scanKey: 'first', enabled: true })
    controller.subscribe(() => { publications += 1 })
    const initial = controller.getSnapshot()
    await controller.refresh()
    const state = controller.getSnapshot()
    assert.equal(calls, 325)
    assert.equal(state.marketCompleted, 325)
    assert.equal(state.marketTotal, 325)
    assert.equal(state.markets.size, 325)
    assert.equal(state.marketStatus, 'done')
    assert.ok(publications <= 4, `${publications} pembaruan untuk 325 respons cepat`)
    assert.equal(initial.markets.size, 0)
    assert.equal(initial.marketCompleted, 0)
  })

  await step('Kinerja reward: jaringan harga tak didukung tetap dilaporkan tanpa menunda token jaringan yang didukung', async () => {
    const entries = [reward(1, 987654321), reward(2, 987654322), reward(3)]
    const calls: number[] = []
    const controller = createWalletRewardsController(async () => ({ checkedAt: new Date(NOW).toISOString(), rewards: entries }), {
      marketIntervalMs: 60_000,
      fetchMarket: async ({ chainId, tokenAddress }) => { calls.push(chainId); return market(chainId, tokenAddress) },
    })
    controller.configure({ identity: IDENTITY, scanKey: 'first', enabled: true })
    const request = controller.refresh()
    try {
      await until(() => calls.length === entries.length)
      await request
      assert.deepEqual(calls, [987654321, 987654322, 1])
      assert.equal(controller.getSnapshot().marketTotal, 3)
      assert.equal(controller.getSnapshot().marketCompleted, 3)
    } finally {
      controller.cancel()
      await request
    }
  })

  await step('Kinerja detail pasar: identitas token stabil menggabungkan cek otomatis dan memakai harga segar tanpa memperpanjang TTL', async () => {
    const uni = mapDefiLlamaPayloadToCampaigns([], { checkedAt: new Date(NOW).toISOString() }).find((campaign) => campaign.project === 'Uniswap')!
    const pending = deferred<TokenMarketEvidence>()
    let calls = 0
    let time = NOW
    const controller = createCampaignMarketController(async ({ chainId, tokenAddress }) => {
      calls += 1
      return calls === 1 ? pending.promise : market(chainId, tokenAddress, time)
    }, () => time)
    const requestKey = controller.configure(uni, 'walletA:live', true)
    const first = controller.refresh(false)
    assert.equal(controller.configure({ ...uni, project: 'Metadata baru' }, 'walletA:live', true), requestKey)
    await controller.refresh(false)
    assert.equal(calls, 1)
    const token = UNI_TOKEN
    pending.resolve(market(uni.chainId, token))
    await first
    const original = controller.getSnapshot()
    time = NOW + MARKET_TTL_MS
    await controller.refresh(false)
    assert.equal(calls, 1)
    assert.equal(controller.getSnapshot(), original)
    assert.equal(original.get(marketTokenKey(uni.chainId, token))?.checkedAt, new Date(NOW).toISOString())
    time += 1
    await controller.refresh(false)
    assert.equal(calls, 2)
    await controller.refresh()
    assert.equal(calls, 3, 'Periksa ulang manual tetap meminta data baru')
    controller.configure(uni, 'walletB:live', true)
    assert.equal(controller.getSnapshot().size, 0)
    await controller.refresh(false)
    assert.equal(calls, 4, 'Harga wallet sebelumnya tidak dipakai dalam scope baru')
  })

  return { passed: details.length, details }
}
