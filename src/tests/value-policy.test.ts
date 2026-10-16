import assert from 'node:assert/strict'
import { MARKET_TTL_MS, type TokenMarketEvidence } from '../adapters/market'
import type { WalletReward } from '../adapters/rewards/merkl'
import { assessClaimCost } from '../domain/claimCost'
import { assessFreeReward, isRewardTestnet } from '../domain/freeAirdrop'
import type { Campaign, HexAddress } from '../domain/types'

const NOW = Date.parse('2026-10-16T00:00:00.000Z')
const TOKEN: HexAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const PAIR: HexAddress = '0x2222222222222222222222222222222222222222'
const reward: Pick<WalletReward, 'chainId' | 'tokenAddress' | 'assetType' | 'isTest' | 'claimable'> = {
  chainId: 1, tokenAddress: TOKEN, assetType: 'TOKEN', isTest: false, claimable: '1',
}
const market: TokenMarketEvidence = {
  status: 'available', chainId: 1, tokenAddress: TOKEN, priceUsd: '0.000000000000000001',
  liquidityUsd: 0.01, pairAddress: PAIR, sourceUrl: `https://dexscreener.com/ethereum/${PAIR}`,
  checkedAt: new Date(NOW).toISOString(), reason: 'Indikasi pasar',
}
const campaign: Campaign = {
  id: '8453:merkl:public-program', name: 'Reward', project: 'Public project', kind: 'token',
  chainId: 8453, status: 'opportunity', origin: 'live', sourceKind: 'api',
  foundIn: ['merkl-catalog-live'], officialUrl: 'https://app.merkl.xyz/opportunities/base',
  checkerUrl: null, sourceVerified: false, sourceEvidence: 'Metadata publik', deadline: null,
  requirements: [], allocation: null, claimMethod: 'unknown', contract: null,
  summary: 'Kandidat publik', checkedAt: new Date(NOW).toISOString(), adapterVersion: 'test-1',
}

export async function runValuePolicyTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  const step = (name: string, run: () => void) => { run(); details.push(`PASS: ${name}`) }

  step('Free bernilai: jumlah positif, harga dan likuiditas positif menjadi kandidat tanpa minimum USD', () => {
    assert.equal(assessFreeReward(reward, market, NOW).status, 'market_candidate')
    assert.equal(assessFreeReward({ ...reward, claimable: ((1n << 256n) - 1n).toString() }, market, NOW).status, 'market_candidate')
    assert.match(assessFreeReward(reward, market, NOW).reason, /gas dapat dibayar/)
    assert.match(assessFreeReward(reward, market, NOW).reason, /belum bukti token masuk wallet/)
  })
  step('Free bernilai: TOKEN bukan poin, pre-TGE, token uji, atau testnet yang ditandai salah oleh feed', () => {
    for (const change of [{ assetType: 'POINT' }, { assetType: 'PRETGE' }, { isTest: true }, { chainId: 421614 }]) {
      assert.equal(assessFreeReward({ ...reward, ...change } as typeof reward, market, NOW).status, 'not_qualifying')
    }
    assert.equal(isRewardTestnet(421614), true)
    assert.equal(isRewardTestnet(1), false)
    assert.equal(isRewardTestnet(987654321), false)
  })
  step('Free bernilai: tidak ada sisa claimable tidak ditampilkan sebagai kandidat', () => {
    assert.equal(assessFreeReward({ ...reward, claimable: '0' }, market, NOW).status, 'not_qualifying')
  })
  step('Free bernilai: jumlah atau identitas tidak valid tetap unknown', () => {
    for (const claimable of ['', '-1', '1.2', '01', '1e3', (1n << 256n).toString(), '9'.repeat(79)]) {
      assert.equal(assessFreeReward({ ...reward, claimable }, market, NOW).status, 'unknown')
    }
    for (const change of [{ chainId: 0 }, { chainId: 1.5 }, { tokenAddress: 'not-an-address' }]) {
      assert.equal(assessFreeReward({ ...reward, ...change } as typeof reward, market, NOW).status, 'unknown')
    }
  })
  step('Free bernilai: harga wajib cocok tepat ke chain dan alamat token, tidak hanya simbol', () => {
    assert.equal(assessFreeReward(reward, { ...market, chainId: 8453 }, NOW).status, 'unknown')
    assert.equal(assessFreeReward(reward, { ...market, tokenAddress: PAIR }, NOW).status, 'unknown')
    assert.equal(assessFreeReward({ ...reward, tokenAddress: TOKEN.toUpperCase().replace('0X', '0x') as HexAddress }, market, NOW).status, 'market_candidate')
  })
  step('Free bernilai: pasar hilang, gagal, usang, atau dari masa depan tidak menjadi bukti', () => {
    assert.equal(assessFreeReward(reward, undefined, NOW).status, 'unknown')
    assert.equal(assessFreeReward(reward, { ...market, status: 'unknown' }, NOW).status, 'unknown')
    assert.equal(assessFreeReward(reward, market, NOW + MARKET_TTL_MS).status, 'market_candidate')
    assert.equal(assessFreeReward(reward, market, NOW + MARKET_TTL_MS + 1).status, 'unknown')
    assert.equal(assessFreeReward(reward, market, NOW - 1).status, 'unknown')
  })
  step('Free bernilai: harga nol/tidak terbatas, likuiditas nol, dan tautan palsu tidak lolos', () => {
    for (const change of [{ priceUsd: '0' }, { priceUsd: 'Infinity' }, { liquidityUsd: 0 }, { liquidityUsd: NaN }, { sourceUrl: 'https://evil.invalid' }]) {
      assert.equal(assessFreeReward(reward, { ...market, ...change }, NOW).status, 'unknown')
    }
  })
  step('Free bernilai: jaringan baru tetap tercatat tanpa dipaksakan punya bukti pasar', () => {
    assert.equal(assessFreeReward({ ...reward, chainId: 987654321 }, { ...market, chainId: 987654321 }, NOW).status, 'unknown')
  })
  step('Distribusi gratis Merkl membolehkan gas, berbeda dari kepastian eligibility dan nilai', () => {
    const cost = assessClaimCost(campaign)
    assert.equal(cost.status, 'free_distribution')
    assert.equal(cost.gas, 'user_pays_gas')
    assert.match(cost.reason, /modal sebelumnya/)
  })
  step('Identitas katalog resmi perlu cocok, bukan hanya flag bebas biaya di feed', () => {
    for (const change of [
      { id: '8453:clone:program' }, { chainId: 1 }, { foundIn: ['untrusted-feed'] },
      { sourceKind: 'manual' }, { officialUrl: 'https://app.merkl.xyz.evil.invalid' },
      { officialUrl: 'https://user@app.merkl.xyz' }, { officialUrl: 'https://app.merkl.xyz:444' },
    ]) {
      assert.equal(assessClaimCost({ ...campaign, ...change } as Campaign).status, 'unknown')
    }
  })
  return { passed: details.length, details }
}
