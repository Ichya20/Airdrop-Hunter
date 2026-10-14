import { getAddress, isAddress } from 'viem'
import type {
  Campaign,
  CampaignKind,
  CampaignStatus,
  ClaimMethod,
  ContractRef,
  DataOrigin,
} from './types'

/** Bentuk data mentah dari adapter sumber sebelum dinormalisasi. */
export interface RawCampaign {
  name: string
  project: string
  kind: CampaignKind
  chainId: number
  status: CampaignStatus
  officialUrl?: string | null
  checkerUrl?: string | null
  sourceVerified: boolean
  sourceEvidence: string
  deadline?: string | null
  requirements?: readonly string[]
  allocation?: string | null
  claimMethod?: ClaimMethod
  contract?: { chainId: number; address: string } | null
  summary?: string
}

export interface NormalizeContext {
  sourceId: string
  origin: DataOrigin
  checkedAt: string
  adapterVersion: string
}

const KINDS: readonly CampaignKind[] = ['token', 'nft', 'points', 'direct_distribution']
const STATUSES: readonly CampaignStatus[] = ['opportunity', 'claim_open', 'ended']
const CLAIM_METHODS: readonly ClaimMethod[] = ['contract', 'official_site', 'direct_distribution', 'unknown']

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function campaignId(chainId: number, project: string, name: string): string {
  return `${chainId}:${slugify(project)}:${slugify(name)}`
}

function cleanText(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

/** Hanya URL https yang diterima. Domain `.example` dipakai fixture DEMO. */
function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function normalizeDeadline(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function normalizeContract(
  value: RawCampaign['contract'],
  chainId: number,
): ContractRef | null | 'invalid' {
  if (value === undefined || value === null) return null
  if (value.chainId !== chainId) return 'invalid'
  if (!isAddress(value.address, { strict: false })) return 'invalid'
  return { chainId, address: getAddress(value.address) }
}

/**
 * Normalisasi satu entri sumber. Entri yang tidak valid dikembalikan sebagai `null`
 * agar dibuang, bukan ditebak.
 */
export function normalizeCampaign(raw: RawCampaign, context: NormalizeContext): Campaign | null {
  const name = cleanText(raw.name, 120)
  const project = cleanText(raw.project, 120)
  if (name === '' || project === '') return null
  if (!Number.isInteger(raw.chainId) || raw.chainId <= 0) return null
  if (!KINDS.includes(raw.kind) || !STATUSES.includes(raw.status)) return null

  const contract = normalizeContract(raw.contract, raw.chainId)
  if (contract === 'invalid') return null

  const claimMethod = raw.claimMethod && CLAIM_METHODS.includes(raw.claimMethod) ? raw.claimMethod : 'unknown'

  return {
    id: campaignId(raw.chainId, project, name),
    name,
    project,
    kind: raw.kind,
    chainId: raw.chainId,
    status: raw.status,
    origin: context.origin,
    foundIn: [context.sourceId],
    officialUrl: normalizeUrl(raw.officialUrl),
    checkerUrl: normalizeUrl(raw.checkerUrl),
    sourceVerified: raw.sourceVerified === true,
    sourceEvidence: cleanText(raw.sourceEvidence, 300) || 'Tidak ada bukti sumber.',
    deadline: normalizeDeadline(raw.deadline),
    requirements: (raw.requirements ?? []).map((item) => cleanText(item, 240)).filter(Boolean),
    allocation: cleanText(raw.allocation, 120) || null,
    claimMethod,
    contract,
    summary: cleanText(raw.summary, 400),
    checkedAt: context.checkedAt,
    adapterVersion: context.adapterVersion,
  }
}

/**
 * Gabungkan campaign dari beberapa sumber. Duplikat (ID sama) digabung:
 * data dari sumber terverifikasi diutamakan, `foundIn` digabung, `checkedAt` terbaru dipakai.
 */
export function mergeCampaigns(campaigns: readonly Campaign[]): Campaign[] {
  const byId = new Map<string, Campaign>()
  for (const campaign of campaigns) {
    const existing = byId.get(campaign.id)
    if (!existing) {
      byId.set(campaign.id, { ...campaign, foundIn: [...campaign.foundIn] })
      continue
    }
    const preferred = !existing.sourceVerified && campaign.sourceVerified ? campaign : existing
    const foundIn = Array.from(new Set([...existing.foundIn, ...campaign.foundIn]))
    const checkedAt = existing.checkedAt > campaign.checkedAt ? existing.checkedAt : campaign.checkedAt
    byId.set(campaign.id, { ...preferred, foundIn, checkedAt })
  }
  return Array.from(byId.values())
}
