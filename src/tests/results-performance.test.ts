import assert from 'node:assert/strict'
import type { Campaign, DashboardLabel } from '../domain/types'
import { getNetwork } from '../domain/networks'
import {
  applyFilters, countByLabel, DEFAULT_FILTERS, matchesQuery, networkOptions, sortRows,
} from '../features/dashboard/filtering'
import { paginateRows, RESULTS_PAGE_SIZE } from '../features/dashboard/pagination'
import { buildRows, type CampaignRow } from '../features/dashboard/rows'

const NOW = Date.parse('2026-10-16T04:00:00.000Z')
const CAMPAIGN: Campaign = {
  id: 'performance-fixture', name: 'Éclair Drop', project: 'Projet Éclair', kind: 'token',
  chainId: 1, status: 'claim_open', origin: 'demo', foundIn: ['demo-feed-alpha'],
  officialUrl: 'https://example.com', checkerUrl: null, sourceVerified: true,
  sourceEvidence: 'Fixture pengujian', deadline: null, requirements: [], allocation: null,
  claimMethod: 'unknown', contract: null, summary: '', checkedAt: new Date(NOW).toISOString(),
  adapterVersion: 'performance-fixture-1',
}
const BASE_ROW = buildRows([CAMPAIGN], { kind: 'none' }, NOW, new Set(), new Set())[0]

function row(id: string, overrides: Partial<Campaign> = {}, label: DashboardLabel = 'unverified'): CampaignRow {
  const campaign = { ...CAMPAIGN, id, ...overrides }
  return { ...BASE_ROW, campaign, network: getNetwork(campaign.chainId), label }
}

export async function runResultsPerformanceTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  const step = (name: string, test: () => void) => {
    test()
    details.push(`PASS: ${name}`)
  }

  step('Hasil: 2.501 campaign tetap terjangkau tanpa duplikasi lewat halaman berukuran tetap', () => {
    const rows = Array.from({ length: 2_501 }, (_, index) => row(`campaign-${index}`, { name: `Campaign ${index}` }))
    const filtered = applyFilters(rows, DEFAULT_FILTERS, NOW)
    assert.equal(filtered.length, rows.length)
    const visited: string[] = []
    const { pageCount } = paginateRows(filtered, 0)
    for (let index = 0; index < pageCount; index += 1) {
      const page = paginateRows(filtered, index)
      assert.ok(page.rows.length > 0 && page.rows.length <= RESULTS_PAGE_SIZE)
      assert.equal(page.start, index * RESULTS_PAGE_SIZE + 1)
      assert.equal(page.end - page.start + 1, page.rows.length)
      visited.push(...page.rows.map((item) => item.campaign.id))
    }
    assert.deepEqual(visited, filtered.map((item) => item.campaign.id))
    assert.equal(new Set(visited).size, rows.length)
  })

  step('Hasil: halaman lama menyusut dengan aman sesudah item dihapus atau filter diterapkan', () => {
    const rows = Array.from({ length: 35 }, (_, index) => row(`campaign-${index}`))
    assert.equal(paginateRows(rows, 99).index, 1)
    assert.equal(paginateRows(rows.slice(0, 3), 1).index, 0)
    assert.equal(paginateRows(rows, -1).index, 0)
    assert.deepEqual(paginateRows([], 5), { index: 0, pageCount: 1, start: 0, end: 0, rows: [] })
  })

  step('Pencarian: aksen, spasi, huruf besar dan pembaruan nama tidak mengubah kecocokan', () => {
    const item = row('search')
    assert.equal(matchesQuery(item, '  ECLAIR   DROP  '), true)
    assert.equal(matchesQuery(item, 'PROJET eclair'), true)
    assert.equal(matchesQuery(item, 'lainnya'), false)
    item.campaign.name = 'Nova Drop'
    item.campaign.project = 'Nova'
    assert.equal(matchesQuery(item, 'eclair'), false)
    assert.equal(matchesQuery(item, 'nova'), true)
  })

  step('Filter: jumlah status mengabaikan status aktif; jumlah jaringan mengabaikan jaringan aktif', () => {
    const rows = [
      row('eth-ready', { chainId: 1 }, 'ready'),
      row('eth-ended', { chainId: 1 }, 'ended'),
      row('base-ready', { chainId: 8453 }, 'ready'),
      row('other-name', { chainId: 8453, name: 'Nova', project: 'Nova' }, 'ready'),
    ]
    const filters = { ...DEFAULT_FILTERS, query: 'eclair', label: 'ready' as const, chainId: 1 }
    assert.deepEqual(applyFilters(rows, filters, NOW).map((item) => item.campaign.id), ['eth-ready'])
    const counts = countByLabel(rows, filters)
    assert.equal(counts.all, 2)
    assert.equal(counts.ready, 1)
    assert.equal(counts.ended, 1)
    const networks = networkOptions(rows, filters)
    assert.equal(networks.find((network) => network.chainId === 1)?.count, 1)
    assert.equal(networks.find((network) => network.chainId === 8453)?.count, 1)
  })

  step('Urutan: tenggat mendatang, belum diketahui dan arsip mempertahankan urutan serta sumber data', () => {
    const rows = [
      row('old', { name: 'Old', deadline: '2026-10-01T00:00:00.000Z' }),
      row('unknown', { name: 'Unknown' }),
      row('far', { name: 'Far', deadline: '2026-11-01T00:00:00.000Z' }),
      row('recent', { name: 'Recent', deadline: '2026-10-15T00:00:00.000Z' }),
      row('near', { name: 'Near', deadline: '2026-10-17T00:00:00.000Z' }),
      row('archive', { name: 'Archive', status: 'ended', deadline: null }),
    ]
    const original = [...rows]
    assert.deepEqual(sortRows(rows, 'deadline', NOW).map((item) => item.campaign.id), ['near', 'far', 'unknown', 'recent', 'old', 'archive'])
    assert.deepEqual(rows, original)
    rows[0].label = 'ready'
    assert.equal(sortRows(rows, 'priority', NOW)[0].campaign.id, 'old')
  })

  step('Urutan: 1.000 tenggat diparsing satu kali per campaign saat sort', () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => row(`campaign-${index}`, {
      name: `Campaign ${index}`, deadline: new Date(NOW + (1_000 - index) * 60_000).toISOString(),
    }))
    const parse = Date.parse
    let parseCount = 0
    Date.parse = (value) => { parseCount += 1; return parse(value) }
    try {
      const sorted = sortRows(rows, 'deadline', NOW)
      assert.equal(sorted[0].campaign.id, 'campaign-999')
      assert.equal(sorted[999].campaign.id, 'campaign-0')
      assert.equal(parseCount, rows.length)
    } finally {
      Date.parse = parse
    }
  })

  return { passed: details.length, details }
}
