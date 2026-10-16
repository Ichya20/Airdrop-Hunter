import { LABEL_META } from '../../domain/status'
import type { Campaign, DashboardLabel } from '../../domain/types'
import type { CampaignRow } from './rows'

export type SortKey = 'priority' | 'deadline' | 'name'
export type LabelFilter = DashboardLabel | 'all'
export type ChainFilter = number | 'all'

export interface Filters {
  query: string
  label: LabelFilter
  chainId: ChainFilter
  sort: SortKey
}

export const DEFAULT_FILTERS: Filters = { query: '', label: 'all', chainId: 'all', sort: 'priority' }

const nameCollator = new Intl.Collator('id-ID')
const searchableText = new WeakMap<Campaign, { name: string; project: string; text: string }>()

/** `text` ringkas untuk pilihan; `caption` untuk keterangan tabel bagi pembaca layar. */
export const SORT_OPTIONS: readonly { value: SortKey; text: string; caption: string }[] = [
  { value: 'priority', text: 'Prioritas', caption: 'prioritas status' },
  { value: 'deadline', text: 'Tenggat', caption: 'tenggat terdekat' },
  { value: 'name', text: 'Nama A–Z', caption: 'nama A–Z' },
]

function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchesQuery(row: CampaignRow, query: string): boolean {
  return matchesFoldedQuery(row, fold(query))
}

function matchesFoldedQuery({ campaign }: CampaignRow, needle: string): boolean {
  if (needle === '') return true
  let cached = searchableText.get(campaign)
  if (!cached || cached.name !== campaign.name || cached.project !== campaign.project) {
    cached = { name: campaign.name, project: campaign.project, text: fold(`${campaign.name} ${campaign.project}`) }
    searchableText.set(campaign, cached)
  }
  return cached.text.includes(needle)
}

function matchesChain(row: CampaignRow, chainId: ChainFilter): boolean {
  return chainId === 'all' || row.campaign.chainId === chainId
}

function matchesLabel(row: CampaignRow, label: LabelFilter): boolean {
  return label === 'all' || row.label === label
}

function compareName(a: CampaignRow, b: CampaignRow): number {
  return nameCollator.compare(a.campaign.name, b.campaign.name)
}

export function sortRows(rows: readonly CampaignRow[], sort: SortKey, now: number): CampaignRow[] {
  if (sort === 'name') return [...rows].sort(compareName)
  // Parse satu kali per campaign, bukan berulang di setiap perbandingan sort.
  return rows.map((row) => {
    const time = row.campaign.deadline === null ? 0 : Date.parse(row.campaign.deadline)
    const ended = row.campaign.status === 'ended' || (row.campaign.deadline !== null && Number.isFinite(time) && time <= now)
    // 0 = mendatang, 1 = belum diketahui, 2 = lewat/berakhir.
    const rank = ended ? 2 : row.campaign.deadline === null ? 1 : 0
    return { row, time, rank, priority: LABEL_META[row.label].priority }
  }).sort((a, b) => {
    const priority = sort === 'priority' ? a.priority - b.priority : 0
    const deadline = a.rank - b.rank || (a.rank === 2 ? b.time - a.time : a.time - b.time)
    return priority || deadline || compareName(a.row, b.row)
  }).map(({ row }) => row)
}

export function applyFilters(rows: readonly CampaignRow[], filters: Filters, now: number): CampaignRow[] {
  const needle = fold(filters.query)
  const filtered = rows.filter(
    (row) =>
      matchesChain(row, filters.chainId) &&
      matchesLabel(row, filters.label) &&
      matchesFoldedQuery(row, needle),
  )
  return sortRows(filtered, filters.sort, now)
}

/** Jumlah per label dengan filter pencarian + jaringan diterapkan (filter status diabaikan). */
export function countByLabel(rows: readonly CampaignRow[], filters: Filters): Record<LabelFilter, number> {
  const needle = fold(filters.query)
  const counts: Record<LabelFilter, number> = {
    all: 0,
    ready: 0,
    unverified: 0,
    opportunity: 0,
    ineligible: 0,
    claimed: 0,
    ended: 0,
  }
  for (const row of rows) {
    if (!matchesChain(row, filters.chainId) || !matchesFoldedQuery(row, needle)) continue
    counts.all += 1
    counts[row.label] += 1
  }
  return counts
}

export interface NetworkOption {
  chainId: number
  name: string
  testnet: boolean
  count: number
}

/** Opsi jaringan yang benar-benar ada di data, dengan jumlah mengikuti pencarian + status. */
export function networkOptions(rows: readonly CampaignRow[], filters: Filters): NetworkOption[] {
  const needle = fold(filters.query)
  const byChain = new Map<number, NetworkOption>()
  for (const row of rows) {
    const option = byChain.get(row.campaign.chainId) ?? {
      chainId: row.campaign.chainId,
      name: row.network.name,
      testnet: row.network.testnet,
      count: 0,
    }
    if (matchesLabel(row, filters.label) && matchesFoldedQuery(row, needle)) option.count += 1
    byChain.set(row.campaign.chainId, option)
  }
  return [...byChain.values()].sort(
    (a, b) => Number(a.testnet) - Number(b.testnet) || nameCollator.compare(a.name, b.name),
  )
}

export function hasActiveFilters(filters: Filters): boolean {
  return filters.query.trim() !== '' || filters.label !== 'all' || filters.chainId !== 'all'
}
