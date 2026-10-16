import assert from 'node:assert/strict'
import { assessClaimCost } from '../domain/claimCost'
import type { Campaign } from '../domain/types'

const candidate: Campaign = {
  id: '8453:public-project:reward', name: 'Public reward', project: 'Public project',
  kind: 'token', chainId: 8453, status: 'opportunity', origin: 'live', sourceKind: 'api',
  foundIn: ['public-catalog'], officialUrl: 'https://project.invalid', checkerUrl: null,
  sourceVerified: false, sourceEvidence: 'Metadata publik', deadline: null,
  requirements: [], allocation: null, claimMethod: 'unknown', contract: null,
  summary: 'Kandidat publik', checkedAt: '2026-10-15T00:00:00.000Z', adapterVersion: 'test-1',
}

const uni: Campaign = {
  ...candidate,
  id: '1:uniswap:uniswap-governance-token-distribution-uni',
  chainId: 1,
  claimMethod: 'contract',
  contract: { chainId: 1, address: '0x090D4613473dEE047c3f2706764f49E0821D256e' },
}

export async function runDiscoveryCostTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0
  const step = (name: string, run: () => void) => {
    run()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  step('Kandidat umum memiliki biaya distribusi unknown', () => {
    const result = assessClaimCost(candidate)
    assert.equal(result.status, 'unknown')
    assert.equal(result.gas, 'unknown')
    assert.equal(result.sourceUrl, null)
    assert.match(result.reason, /belum diverifikasi/)
  })

  step('Teks feed free, gasless, dan sourceVerified tidak menjadi bukti distribusi gratis', () => {
    const result = assessClaimCost({
      ...candidate, name: 'FREE GASLESS 0', sourceVerified: true,
      summary: 'Claim guaranteed free and gasless, sponsored gas',
      sourceEvidence: 'Rp0 biaya termasuk gas', requirements: ['No fees'], allocation: '1000 FREE',
    })
    assert.equal(result.status, 'unknown')
    assert.equal(result.sourceUrl, null)
  })

  step('UNI kanonis dikenal sebagai distribusi gratis dengan gas transaksi Ethereum terpisah', () => {
    const result = assessClaimCost(uni)
    assert.equal(result.status, 'free_distribution')
    assert.equal(result.gas, 'user_pays_gas')
    assert.equal(result.sourceUrl, 'https://github.com/Uniswap/merkle-distributor')
    assert.equal(assessClaimCost({
      ...uni, contract: { chainId: 1, address: uni.contract!.address.toLowerCase() as `0x${string}` },
    }).status, 'free_distribution')
  })

  step('Nama atau kontrak UNI saja tidak menyamarkan campaign lain sebagai UNI kanonis', () => {
    assert.equal(assessClaimCost({ ...uni, id: '1:clone:uni' }).status, 'unknown')
    assert.equal(assessClaimCost({ ...uni, chainId: 8453 }).status, 'unknown')
    assert.equal(assessClaimCost({ ...uni, contract: { ...uni.contract!, chainId: 8453 } }).status, 'unknown')
    assert.equal(assessClaimCost({ ...uni, contract: null }).status, 'unknown')
    assert.equal(assessClaimCost({
      ...uni, contract: { chainId: 1, address: '0x0000000000000000000000000000000000000001' },
    }).status, 'unknown')
  })

  step('Katalog Merkl live dikenal sebagai distribusi gratis, sementara gas tetap dibayar pengguna', () => {
    const result = assessClaimCost({ ...candidate, id: '8453:merkl:public-reward',
      foundIn: ['other-source', 'merkl-catalog-live'], officialUrl: 'https://app.merkl.xyz' })
    assert.equal(result.status, 'free_distribution')
    assert.equal(result.gas, 'user_pays_gas')
    assert.equal(result.sourceUrl, 'https://app.merkl.fr/about')
    assert.match(result.reason, /gas tetap dibayar pengguna/)
  })

  step('Demo dan testnet tidak menjadi bukti distribusi aset nyata bernilai', () => {
    for (const origin of ['demo', 'testnet'] as const) {
      assert.equal(assessClaimCost({ ...uni, origin }).status, 'unknown')
      assert.equal(assessClaimCost({ ...candidate, origin, foundIn: ['merkl-catalog-live'] }).status, 'unknown')
    }
  })

  step('Metode direct distribution belum membuktikan distribusi gratis per wallet', () => {
    assert.equal(assessClaimCost({ ...candidate, claimMethod: 'direct_distribution' }).status, 'unknown')
  })

  return { passed, details }
}
