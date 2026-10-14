import assert from 'node:assert/strict'
import { resolveEligibility } from '../adapters/eligibility'
import { checkAddressInput, looksLikeSecret } from '../domain/address'
import { deriveLabel, resolveAction } from '../domain/status'
import type { Campaign, EligibilityResult, HexAddress, Identity, TxRecord } from '../domain/types'
import { resolveTransaction } from '../features/claims/resolveTransaction'
import { buildChecks } from '../features/claims/preClaimChecks'
import { buildRows } from '../features/dashboard/rows'
import { identityKey, isUnsupportedWalletChain, walletAccountKey } from '../features/wallet/identity'
import {
  classifyWalletError,
  connectMetaMaskProvider,
  parseChainId,
  switchMetaMaskChain,
  toHexChainId,
  type Eip1193Provider,
} from '../features/wallet/metamask'
import { createMemoryStorage, migrateBackupPayload } from '../storage'
import { buildScanRecordKey, isRecordMatchingIdentity } from '../storage/keys'

const NOW = Date.parse('2026-10-14T12:00:00Z')

const WALLET_A: HexAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const WALLET_B: HexAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: '8453:lumenfall:lumenfall-bridge-drop',
    name: 'Lumenfall Bridge Drop',
    project: 'Lumenfall',
    kind: 'token',
    chainId: 8453,
    status: 'claim_open',
    origin: 'demo',
    foundIn: ['demo-feed-alpha'],
    officialUrl: 'https://lumenfall.example/claim',
    checkerUrl: 'https://lumenfall.example/check',
    sourceVerified: true,
    sourceEvidence: 'Fixture DEMO: meniru pengumuman resmi',
    deadline: '2026-11-01T00:00:00.000Z',
    requirements: ['Bridge ke Base minimal sekali sebelum snapshot (fixture).'],
    allocation: '250 LUMEN',
    claimMethod: 'contract',
    contract: null,
    summary: 'Contoh campaign token.',
    checkedAt: '2026-10-14T11:30:00.000Z',
    adapterVersion: 'demo-fixture-1',
    ...overrides,
  }
}

function makeEligibility(status: EligibilityResult['status'], reason = 'Contoh alasan'): EligibilityResult {
  return {
    status,
    reason,
    rule: 'v1',
    source: 'Sumber uji',
    checkedAt: '2026-10-14T11:30:00.000Z',
  }
}

function makeTx(status: TxRecord['status'], proof: string | null = null): TxRecord {
  return {
    status,
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    proof,
    updatedAt: '2026-10-14T11:45:00.000Z',
    note: 'Transaksi uji',
  }
}

export async function runStage2Tests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0

  const step = async (name: string, fn: () => void | Promise<void>) => {
    await fn()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  // 1. Turunan label status & prioritas aturan (R3)
  await step('R3.1: Klaim terkonfirmasi + bukti menghasilkan label "claimed" dan aksi "tx"', () => {
    const campaign = makeCampaign({ status: 'claim_open' })
    const elig = makeEligibility('eligible')
    const txWithProof = makeTx('confirmed', 'Transfer event #42')
    const label = deriveLabel(campaign, elig, txWithProof, NOW)
    assert.equal(label, 'claimed')
    assert.equal(resolveAction(label, campaign, txWithProof).kind, 'tx')
  })

  await step('R3.2: Transaksi confirmed TANPA bukti (proof null) tidak diakui sebagai "claimed"', () => {
    const campaign = makeCampaign({ status: 'claim_open' })
    const elig = makeEligibility('eligible')
    const txNoProof = makeTx('confirmed', null)
    const label = deriveLabel(campaign, elig, txNoProof, NOW)
    assert.equal(label, 'ready')
    assert.equal(resolveAction(label, campaign, txNoProof).kind, 'tx')
  })

  await step('R3.3: Tenggat sudah lewat mengubah campaign "claim_open" + "eligible" menjadi "ended"', () => {
    const expiredCampaign = makeCampaign({
      status: 'claim_open',
      deadline: '2026-10-01T00:00:00.000Z',
    })
    const label = deriveLabel(expiredCampaign, makeEligibility('eligible'), null, NOW)
    assert.equal(label, 'ended')
    assert.equal(resolveAction(label, expiredCampaign, null).kind, 'archive')
  })

  await step('R3.4: Tenggat null tidak dianggap berakhir selama status bukan ended', () => {
    const noDeadlineCampaign = makeCampaign({
      status: 'claim_open',
      deadline: null,
    })
    const label = deriveLabel(noDeadlineCampaign, makeEligibility('eligible'), null, NOW)
    assert.equal(label, 'ready')
    assert.equal(resolveAction(label, noDeadlineCampaign, null).kind, 'claim')
  })

  await step('R3.5: Eligibility "ineligible" mendahului verifikasi sumber', () => {
    const campaign = makeCampaign({ sourceVerified: false })
    const label = deriveLabel(campaign, makeEligibility('ineligible'), null, NOW)
    assert.equal(label, 'ineligible')
    assert.equal(resolveAction(label, campaign, null).kind, 'reason')
  })

  await step('R3.6: Sumber belum terverifikasi selalu menghasilkan "unverified" walau eligible', () => {
    const campaign = makeCampaign({ sourceVerified: false, status: 'claim_open' })
    const label = deriveLabel(campaign, makeEligibility('eligible'), null, NOW)
    assert.equal(label, 'unverified')
    assert.equal(resolveAction(label, campaign, null).kind, 'check')
  })

  await step('R3.7: Klaim terbuka dengan eligibility "needs_tasks" menghasilkan "opportunity", dan "unknown" menghasilkan "unverified"', () => {
    const campaign = makeCampaign({ status: 'claim_open', sourceVerified: true })
    assert.equal(deriveLabel(campaign, makeEligibility('needs_tasks'), null, NOW), 'opportunity')
    assert.equal(deriveLabel(campaign, makeEligibility('unknown'), null, NOW), 'unverified')
  })

  // 2. Pemisahan wallet & identitas (R6, R7, R9)
  await step('R7.1: Kunci identitas dan akun memisahkan DEMO, watch, dan setiap wallet/chain MetaMask', () => {
    const idDemo: Identity = { kind: 'demo' }
    const idWatchA: Identity = { kind: 'watch', address: WALLET_A }
    const idMetaA1: Identity = { kind: 'metamask', address: WALLET_A, chainId: 1 }
    const idMetaA8453: Identity = { kind: 'metamask', address: WALLET_A, chainId: 8453 }
    const idMetaB1: Identity = { kind: 'metamask', address: WALLET_B, chainId: 1 }

    assert.notEqual(identityKey(idMetaA1), identityKey(idMetaA8453))
    assert.notEqual(identityKey(idMetaA1), identityKey(idMetaB1))
    assert.notEqual(identityKey(idWatchA), identityKey(idMetaA1))
    assert.notEqual(identityKey(idDemo), identityKey(idMetaA1))

    assert.notEqual(walletAccountKey(idMetaA1), walletAccountKey(idMetaB1))
    assert.notEqual(walletAccountKey(idWatchA), walletAccountKey(idMetaA1))
  })

  await step('R7.2: Pergantian identitas dari DEMO ke MetaMask/watch tidak pernah membocorkan fixture eligibility/transaksi DEMO', () => {
    const demoCampaign = makeCampaign({
      id: '8453:lumenfall:lumenfall-bridge-drop',
      origin: 'demo',
    })
    const demoElig = resolveEligibility(demoCampaign, { kind: 'demo' })
    const metaElig = resolveEligibility(demoCampaign, { kind: 'metamask', address: WALLET_A, chainId: 8453 })
    const watchElig = resolveEligibility(demoCampaign, { kind: 'watch', address: WALLET_A })

    assert.equal(demoElig.status, 'eligible')
    assert.equal(metaElig.status, 'unknown')
    assert.equal(watchElig.status, 'unknown')

    const claimedDemoCampaign = makeCampaign({
      id: '42161:harborlight:harborlight-vault-rewards',
      chainId: 42161,
      origin: 'demo',
    })
    assert.notEqual(resolveTransaction(claimedDemoCampaign, { kind: 'demo' }), null)
    assert.equal(
      resolveTransaction(claimedDemoCampaign, { kind: 'metamask', address: WALLET_A, chainId: 42161 }),
      null,
    )
  })

  await step('R7.3: Deteksi private key dan seed phrase selalu ditolak di input alamat', () => {
    const fakePk = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'
    const fakeSeed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    assert.equal(looksLikeSecret(fakePk), 'private_key')
    assert.equal(looksLikeSecret(fakeSeed), 'seed_phrase')

    const pkCheck = checkAddressInput(fakePk)
    assert.equal(pkCheck.ok, false)
    if (!pkCheck.ok) assert.equal(pkCheck.kind, 'secret')

    const seedCheck = checkAddressInput(fakeSeed)
    assert.equal(seedCheck.ok, false)
    if (!seedCheck.ok) assert.equal(seedCheck.kind, 'secret')
  })

  // 3. Koneksi MetaMask EIP-1193, error handling, dan jaringan salah (R6)
  await step('R6.1: Konektor MetaMask menangani connect, penolakan 4001, ganti jaringan, dan deteksi jaringan tidak dikenal', async () => {
    assert.equal(parseChainId('0x2105'), 8453)
    assert.equal(toHexChainId(8453), '0x2105')

    const rejected = classifyWalletError({ code: 4001 })
    assert.equal(rejected.kind, 'user_rejected')
    assert.equal(rejected.recoverable, true)

    const pending = classifyWalletError({ code: -32002 })
    assert.equal(pending.kind, 'pending_request')

    const missingChain = classifyWalletError({ code: 4902 }, 8453)
    assert.equal(missingChain.kind, 'chain_not_added')

    let activeChainHex = '0x1'
    const mockProvider: Eip1193Provider = {
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts') return [WALLET_A.toLowerCase()]
        if (method === 'eth_chainId') return activeChainHex
        if (method === 'wallet_switchEthereumChain') {
          const first = Array.isArray(params) ? (params[0] as { chainId: string }) : undefined
          if (first?.chainId) activeChainHex = first.chainId
          return null
        }
        return null
      },
    }

    const session = await connectMetaMaskProvider(mockProvider)
    assert.equal(session.address, WALLET_A)
    assert.equal(session.chainId, 1)

    const switchedChain = await switchMetaMaskChain(mockProvider, 8453)
    assert.equal(switchedChain, 8453)

    assert.equal(isUnsupportedWalletChain({ kind: 'metamask', address: WALLET_A, chainId: 999999 }), true)
    assert.equal(isUnsupportedWalletChain({ kind: 'metamask', address: WALLET_A, chainId: 8453 }), false)
  })

  await step('R6.2: Preview klaim mendeteksi ketidakcocokan jaringan MetaMask vs jaringan campaign', () => {
    const campaign = makeCampaign({ chainId: 8453 })
    const idWrongChain: Identity = { kind: 'metamask', address: WALLET_A, chainId: 1 }
    const idRightChain: Identity = { kind: 'metamask', address: WALLET_A, chainId: 8453 }

    const [rowWrong] = buildRows([campaign], idWrongChain, NOW, new Set(), new Set())
    const checksWrong = buildChecks(rowWrong, idWrongChain, NOW)
    const netCheckWrong = checksWrong.find((c) => c.label === 'Jaringan')
    assert.equal(netCheckWrong?.state, 'fail')

    const [rowRight] = buildRows([campaign], idRightChain, NOW, new Set(), new Set())
    const checksRight = buildChecks(rowRight, idRightChain, NOW)
    const netCheckRight = checksRight.find((c) => c.label === 'Jaringan')
    assert.equal(netCheckRight?.state, 'ok')
  })

  // 4. Penyimpanan lokal, pemisahan per alamat + chain ID + campaign ID + versi adapter, dan persistensi setelah refresh (R9)
  await step('R9.1: Penyimpanan memisahkan watchlist dan hasil scan per alamat + chain ID + campaign ID + versi adapter', async () => {
    const storage = createMemoryStorage()
    const idWalletA: Identity = { kind: 'metamask', address: WALLET_A, chainId: 8453 }
    const idWalletB: Identity = { kind: 'metamask', address: WALLET_B, chainId: 8453 }

    const liveCampaignV1 = makeCampaign({
      id: '8453:lumenfall:lumenfall-live-drop',
      origin: 'live',
      adapterVersion: 'live-1.0.0',
    })

    await storage.saveWatchlist(idWalletA, [liveCampaignV1.id])
    await storage.saveWatchlist(idWalletB, [])

    await storage.saveScanRecordsForIdentity(idWalletA, [
      {
        campaign: liveCampaignV1,
        eligibility: makeEligibility('eligible', 'Memenuhi syarat untuk Wallet A'),
        tx: null,
      },
    ])

    const watchA = await storage.loadWatchlist(idWalletA)
    const watchB = await storage.loadWatchlist(idWalletB)
    assert.deepEqual(watchA, [liveCampaignV1.id])
    assert.deepEqual(watchB, [])

    const recordsForA = await storage.loadScanRecordsForIdentity(idWalletA, [liveCampaignV1])
    const recordsForB = await storage.loadScanRecordsForIdentity(idWalletB, [liveCampaignV1])
    assert.equal(recordsForA.get(liveCampaignV1.id)?.eligibility.status, 'eligible')
    assert.equal(recordsForB.has(liveCampaignV1.id), false)

    // Jika versi adapter berubah (live-2.0.0), catatan lama (live-1.0.0) tidak boleh dipakai
    const liveCampaignV2 = { ...liveCampaignV1, adapterVersion: 'live-2.0.0' }
    const recordsForAV2 = await storage.loadScanRecordsForIdentity(idWalletA, [liveCampaignV2])
    assert.equal(recordsForAV2.has(liveCampaignV2.id), false)

    const keyA = buildScanRecordKey({
      identity: idWalletA,
      chainId: liveCampaignV1.chainId,
      campaignId: liveCampaignV1.id,
      adapterVersion: liveCampaignV1.adapterVersion,
    })
    const storedRecordA = recordsForA.get(liveCampaignV1.id)!
    assert.equal(storedRecordA.key, keyA)
    assert.equal(isRecordMatchingIdentity(storedRecordA, idWalletB, liveCampaignV1), false)
    assert.equal(isRecordMatchingIdentity(storedRecordA, idWalletA, liveCampaignV2), false)
  })

  await step('R9.2: Persistensi setelah refresh serta ekspor/impor cadangan dan migrasi skema v1 -> v2', async () => {
    const storageBeforeRefresh = createMemoryStorage()
    const idMeta: Identity = { kind: 'metamask', address: WALLET_A, chainId: 42161 }
    const campaign = makeCampaign({
      id: '42161:arb-project:arb-season-2',
      chainId: 42161,
      origin: 'live',
      adapterVersion: '1.2.0',
    })

    await storageBeforeRefresh.saveSettings({
      identity: idMeta,
      scenario: 'partial',
      scanTtlMs: 3_600_000,
    })
    await storageBeforeRefresh.saveWatchlist(idMeta, [campaign.id])
    await storageBeforeRefresh.saveSourceCheckpoints([
      {
        sourceId: 'demo-feed-alpha',
        lastSuccessAt: '2026-10-14T11:50:00.000Z',
        campaigns: [campaign],
        updatedAt: '2026-10-14T11:50:00.000Z',
      },
    ])
    await storageBeforeRefresh.saveScanRecordsForIdentity(idMeta, [
      {
        campaign,
        eligibility: makeEligibility('eligible', 'Snapshot Arbitrum terpenuhi'),
        tx: null,
      },
    ])

    const exported = await storageBeforeRefresh.exportBackup()
    const storageAfterRefresh = createMemoryStorage()
    const importResult = await storageAfterRefresh.importBackup(JSON.stringify(exported))
    assert.equal(importResult.ok, true)

    const restoredSettings = await storageAfterRefresh.loadSettings()
    assert.deepEqual(restoredSettings?.identity, idMeta)
    assert.equal(restoredSettings?.scenario, 'partial')

    const restoredWatchlist = await storageAfterRefresh.loadWatchlist(idMeta)
    assert.deepEqual(restoredWatchlist, [campaign.id])

    const restoredCheckpoints = await storageAfterRefresh.loadSourceCheckpoints()
    assert.equal(restoredCheckpoints.length, 1)
    assert.equal(restoredCheckpoints[0].campaigns[0].id, campaign.id)

    const restoredRecords = await storageAfterRefresh.loadScanRecordsForIdentity(idMeta, [campaign])
    assert.equal(restoredRecords.get(campaign.id)?.eligibility.status, 'eligible')

    // Uji migrasi dari payload v1
    const v1Payload = {
      app: 'airdrop-hunter',
      schemaVersion: 1,
      settings: {
        identity: { kind: 'watch', address: WALLET_B },
        scenario: 'normal',
      },
      watchlists: [{ identityKey: `watch:${WALLET_B.toLowerCase()}`, campaignIds: [campaign.id] }],
      scanRecords: [],
    }
    const migrated = migrateBackupPayload(v1Payload)
    assert.equal(migrated.ok, true)
    if (migrated.ok) {
      assert.equal(migrated.migratedFromVersion, 1)
      assert.equal(migrated.bundle.schemaVersion, 2)
      assert.equal(migrated.bundle.watchlists[0].accountKey, `watch:${WALLET_B.toLowerCase()}`)
    }

    // Pastikan cadangan yang memuat private key ditolak
    const maliciousPayload = {
      app: 'airdrop-hunter',
      schemaVersion: 2,
      settings: {
        identity: {
          kind: 'watch',
          address: '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318',
        },
      },
    }
    const rejectedImport = await storageAfterRefresh.importBackup(JSON.stringify(maliciousPayload))
    assert.equal(rejectedImport.ok, false)
  })

  return { passed, details }
}
