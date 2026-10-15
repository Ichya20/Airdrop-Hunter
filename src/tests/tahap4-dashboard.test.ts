import assert from 'node:assert/strict'
import { ELIGIBILITY_TTL_MS } from '../adapters/eligibility'
import { UNI_CAMPAIGN_ID, UNI_DISTRIBUTOR, UNI_ELIGIBILITY_RULE } from '../adapters/eligibility/uni'
import type { Campaign, EligibilityResult, Identity } from '../domain/types'
import { explainLabel } from '../domain/status'
import { buildChecks } from '../features/claims/preClaimChecks'
import { buildRows, statusSubtext } from '../features/dashboard/rows'
import { createMemoryStorage } from '../storage'

const NOW = Date.parse('2026-10-15T04:00:00.000Z')
const IDENTITY: Identity = { kind: 'watch', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' }
const CAMPAIGN: Campaign = {
  id: UNI_CAMPAIGN_ID, name: 'Uniswap Governance Token Distribution ($UNI)', project: 'Uniswap',
  kind: 'token', chainId: 1, status: 'ended', origin: 'live', sourceKind: 'local-archive',
  foundIn: ['defillama-live'], officialUrl: 'https://uniswap.org', checkerUrl: null,
  sourceVerified: false, sourceEvidence: 'Arsip lokal', deadline: null, requirements: [],
  allocation: null, claimMethod: 'contract', contract: { chainId: 1, address: UNI_DISTRIBUTOR },
  summary: '', checkedAt: new Date(NOW).toISOString(), adapterVersion: 'archive-1',
}

export async function runStage4DashboardTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  const step = async (name: string, test: () => Promise<void>) => {
    await test()
    details.push(`PASS: ${name}`)
  }
  const records = async (campaign: Campaign, checkedAt: number, status: EligibilityResult['status'] = 'eligible') => {
    const storage = createMemoryStorage()
    await storage.saveScanRecordsForIdentity(IDENTITY, [{ campaign, eligibility: {
      status, reason: 'Hasil proof uji', source: 'Kontrak resmi (fixture transport)',
      rule: UNI_ELIGIBILITY_RULE, checkedAt: new Date(checkedAt).toISOString(),
    }, tx: null }])
    return storage.loadScanRecordsForIdentity(IDENTITY, [campaign])
  }

  await step('Dashboard: proof eligible atau sudah dipakai tidak membuka klaim arsip atau membuat transaksi', async () => {
    for (const status of ['eligible', 'ineligible'] as const) {
      const row = buildRows([CAMPAIGN], IDENTITY, NOW, new Set(), new Set(), await records(CAMPAIGN, NOW, status))[0]
      assert.equal(row.eligibility.status, status)
      assert.equal(row.label, 'ended')
      assert.equal(row.action.kind, 'archive')
      assert.equal(row.tx, null)
      assert.match(explainLabel(row.label, CAMPAIGN, row.eligibility, 'Alamat uji'), /diarsipkan lokal/)
    }
  })
  await step('Dashboard: TTL eligibility terpisah dari kegagalan sumber metadata dan savedAt', async () => {
    const campaign: Campaign = { ...CAMPAIGN, status: 'claim_open', sourceVerified: true }
    const row = buildRows([campaign], IDENTITY, NOW, new Set(), new Set(), await records(campaign, NOW - ELIGIBILITY_TTL_MS))[0]
    assert.equal(row.eligibility.status, 'unknown')
    assert.equal(row.eligibilityStale, true)
    assert.equal(row.stale, false)
    assert.equal(row.label, 'unverified')
    assert.match(statusSubtext(row), /eligibility usang/)
    assert.equal(buildChecks(row, IDENTITY, NOW).find((check) => check.label === 'Eligibility')?.state, 'fail')
  })
  await step('Preview: hasil kedaluwarsa ditolak walaupun baris lama belum dibangun ulang', async () => {
    const row = buildRows([CAMPAIGN], IDENTITY, NOW, new Set(), new Set(), await records(CAMPAIGN, NOW))[0]
    assert.equal(buildChecks(row, IDENTITY, NOW).find((check) => check.label === 'Eligibility')?.state, 'ok')
    assert.equal(buildChecks(row, IDENTITY, NOW + ELIGIBILITY_TTL_MS).find((check) => check.label === 'Eligibility')?.state, 'fail')
  })
  await step('Dashboard: hasil dan penanda usang wallet A tidak muncul pada wallet B', async () => {
    const walletB: Identity = { kind: 'watch', address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' }
    const row = buildRows([CAMPAIGN], walletB, NOW, new Set(), new Set(), await records(CAMPAIGN, NOW - ELIGIBILITY_TTL_MS))[0]
    assert.equal(row.eligibility.status, 'unknown')
    assert.equal(row.eligibilityStale, false)
  })
  return { passed: details.length, details }
}
