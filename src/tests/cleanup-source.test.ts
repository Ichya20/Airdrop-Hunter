import assert from 'node:assert/strict'
import {
  createLiveDefiLlamaAdapter,
  mapDefiLlamaPayloadToCampaigns,
} from '../adapters/sources'

const CHECKED_AT = '2026-10-14T12:00:00.000Z'

export async function runCleanupSourceTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0
  const step = async (name: string, run: () => void | Promise<void>) => {
    await run()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  await step('Arsip lokal tetap jujur saat API mengembalikan daftar kosong', () => {
    const campaigns = mapDefiLlamaPayloadToCampaigns([], { checkedAt: CHECKED_AT })
    assert.equal(campaigns.length, 2)
    for (const campaign of campaigns) {
      assert.equal(campaign.sourceKind, 'local-archive')
      assert.equal(campaign.sourceVerified, false)
      assert.equal(campaign.status, 'ended')
      assert.equal(campaign.checkedAt, CHECKED_AT)
      assert.match(campaign.sourceEvidence, /Arsip referensi lokal/)
      assert.match(campaign.sourceEvidence, /tidak memeriksa eligibility wallet, proof, atau keadaan kontrak/)
      assert.doesNotMatch(campaign.sourceEvidence, /Metadata nama protokol tersedia/)
    }
    const uni = campaigns.find((campaign) => campaign.project === 'Uniswap')
    assert.ok(uni)
    assert.equal(uni.deadline, null, 'Tanggal peluncuran UNI bukan tenggat klaim')
  })

  await step('URL metadata agregator tidak dapat mengganti tautan terkurasi arsip', () => {
    const campaigns = mapDefiLlamaPayloadToCampaigns([
      { name: 'Arbitrum', slug: 'arbitrum', symbol: 'ARB', url: 'https://untrusted.invalid/arb' },
      { name: 'Uniswap', slug: 'uniswap', symbol: 'UNI', url: 'https://untrusted.invalid/uni' },
    ], { checkedAt: CHECKED_AT })
    assert.equal(campaigns.find((campaign) => campaign.project === 'Arbitrum Foundation')?.officialUrl, 'https://arbitrum.foundation/')
    assert.equal(campaigns.find((campaign) => campaign.project === 'Uniswap')?.officialUrl, 'https://uniswap.org/')
    for (const campaign of campaigns) {
      assert.equal(campaign.sourceVerified, false)
      assert.match(campaign.sourceEvidence, /Metadata nama protokol tersedia/)
    }
    const unrelated = mapDefiLlamaPayloadToCampaigns([
      { name: 'Uniswap Clone', slug: 'uniswap-clone', symbol: 'UNI', url: 'https://untrusted.invalid/' },
    ], { checkedAt: CHECKED_AT })
    assert.doesNotMatch(unrelated.find((campaign) => campaign.project === 'Uniswap')!.sourceEvidence, /Metadata nama protokol tersedia/)
  })

  await step('Kandidat dari metadata API memiliki provenance API tanpa eligibility atau jaminan airdrop', () => {
    const campaigns = mapDefiLlamaPayloadToCampaigns([
      {
        name: 'Protocol Metadata Fixture', slug: 'protocol-metadata-fixture', symbol: null,
        chain: 'Base', category: 'Lending', tvl: 10_000_000, url: 'https://protocol.invalid',
      },
    ], { checkedAt: CHECKED_AT })
    const candidate = campaigns.find((campaign) => campaign.project === 'Protocol Metadata Fixture')
    assert.ok(candidate)
    assert.equal(candidate.sourceKind, 'api')
    assert.equal(candidate.origin, 'live')
    assert.equal(candidate.sourceVerified, false)
    assert.equal(candidate.status, 'opportunity')
    assert.equal(candidate.claimMethod, 'unknown')
    assert.equal(candidate.contract, null)
    assert.equal(candidate.deadline, null)
    assert.match(candidate.sourceEvidence, /petunjuk penemuan; distribusi token gratis, nilai pasar, dan hak klaim ke wallet belum diverifikasi/)
  })

  await step('Fetch metadata tidak memanggil kontrak atau mengubah provenance arsip', async () => {
    const requests: { url: string; method: string | undefined }[] = []
    const adapter = createLiveDefiLlamaAdapter({
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), method: init?.method })
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    })
    const campaigns = await adapter.fetchCampaigns({
      signal: new AbortController().signal, attempt: 1, manualRetry: false,
    })
    assert.deepEqual(requests, [{ url: 'https://api.llama.fi/protocols', method: 'GET' }])
    assert.ok(campaigns.every((campaign) => campaign.sourceKind === 'local-archive' && !campaign.sourceVerified))
    assert.ok((adapter.getRetryDelayMs?.(false) ?? 0) > 0)
  })

  return { passed, details }
}
