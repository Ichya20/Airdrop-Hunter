import { isEnded, LABEL_META } from '../../domain/status'
import type { DashboardLabel } from '../../domain/types'
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
  const needle = fold(query)
  if (needle === '') return true
  return fold(`${row.campaign.name} ${row.campaign.project}`).includes(needle)
}

function matchesChain(row: CampaignRow, chainId: ChainFilter): boolean {
  return chainId === 'all' || row.campaign.chainId === chainId
}

function matchesLabel(row: CampaignRow, label: LabelFilter): boolean {
  return label === 'all' || row.label === label
}

/** 0 = tenggat mendatang, 1 = belum diketahui, 2 = sudah lewat/berakhir. */
function deadlineRank(row: CampaignRow, now: number): number {
  if (row.campaign.deadline === null) return isEnded(row.campaign, now) ? 2 : 1
  return isEnded(row.campaign, now) ? 2 : 0
}

function compareDeadline(a: CampaignRow, b: CampaignRow, now: number): number {
  const rankDiff = deadlineRank(a, now) - deadlineRank(b, now)
  if (rankDiff !== 0) return rankDiff
  const timeA = a.campaign.deadline === null ? 0 : Date.parse(a.campaign.deadline)
  const timeB = b.campaign.deadline === null ? 0 : Date.parse(b.campaign.deadline)
  // Mendatang: terdekat dulu. Sudah lewat: yang paling baru berakhir dulu.
  return deadlineRank(a, now) === 2 ? timeB - timeA : timeA - timeB
}

function compareName(a: CampaignRow, b: CampaignRow): number {
  return a.campaign.name.localeCompare(b.campaign.name, 'id-ID')
}

export function sortRows(rows: readonly CampaignRow[], sort: SortKey, now: number): CampaignRow[] {
  return [...rows].sort((a, b) => {
    if (sort === 'name') return compareName(a, b)
    if (sort === 'deadline') return compareDeadline(a, b, now) || compareName(a, b)
    return (
      LABEL_META[a.label].priority - LABEL_META[b.label].priority ||
      compareDeadline(a, b, now) ||
      compareName(a, b)
    )
  })
}

export function applyFilters(rows: readonly CampaignRow[], filters: Filters, now: number): CampaignRow[] {
  const filtered = rows.filter(
    (row) =>
      matchesQuery(row, filters.query) &&
      matchesChain(row, filters.chainId) &&
      matchesLabel(row, filters.label),
  )
  return sortRows(filtered, filters.sort, now)
}

/** Jumlah per label dengan filter pencarian + jaringan diterapkan (filter status diabaikan). */
export function countByLabel(rows: readonly CampaignRow[], filters: Filters): Record<LabelFilter, number> {
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
    if (!matchesQuery(row, filters.query) || !matchesChain(row, filters.chainId)) continue
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
  const byChain = new Map<number, NetworkOption>()
  for (const row of rows) {
    const option = byChain.get(row.campaign.chainId) ?? {
      chainId: row.campaign.chainId,
      name: row.network.name,
      testnet: row.network.testnet,
      count: 0,
    }
    if (matchesQuery(row, filters.query) && matchesLabel(row, filters.label)) option.count += 1
    byChain.set(row.campaign.chainId, option)
  }
  return [...byChain.values()].sort(
    (a, b) => Number(a.testnet) - Number(b.testnet) || a.name.localeCompare(b.name, 'id-ID'),
  )
}

export function hasActiveFilters(filters: Filters): boolean {
  return filters.query.trim() !== '' || filters.label !== 'all' || filters.chainId !== 'all'
}
