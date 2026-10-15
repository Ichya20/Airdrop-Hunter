import type { SourceMode } from '../adapters/sources'
import {
  czech, english, french, italian, japanese, korean, portuguese,
  simplifiedChinese, spanish, traditionalChinese,
} from 'viem/accounts'
import { DEMO_SCENARIOS, type DemoScenario } from '../demo/demoSources'
import { checkAddressInput } from '../domain/address'
import type { Campaign, EligibilityResult, HexAddress, Identity, TxRecord } from '../domain/types'
import { formatScanRecordKey } from './keys'
import {
  STORAGE_SCHEMA_VERSION,
  type StorageBackupBundle,
  type StoredScanRecord,
  type StoredSettings,
  type StoredSourceCheckpoint,
  type StoredWatchlistRecord,
} from './types'

const HASH = /^0x[0-9a-fA-F]{64}$/
const PRIVATE_KEY = /^(0x)?[0-9a-fA-F]{64}$/
const SCENARIOS = DEMO_SCENARIOS.map((item) => item.value)
const SOURCE_MODES: readonly SourceMode[] = ['all', 'live', 'demo']
const MNEMONIC_LENGTHS = new Set([12, 15, 18, 21, 24])
let mnemonicWordSets: Set<string>[] | undefined

function resemblesMnemonic(value: string): boolean {
  const words = value.normalize('NFKD').trim().toLowerCase().split(/\s+/u)
  if (!MNEMONIC_LENGTHS.has(words.length)) return false
  mnemonicWordSets ??= [
    czech, english, french, italian, japanese, korean, portuguese,
    simplifiedChinese, spanish, traditionalChinese,
  ].map((wordlist) => new Set(wordlist.map((word) => word.normalize('NFKD').toLowerCase())))
  // A candidate phrase need not have a valid checksum to be sensitive. Only
  // dictionary membership is checked; no account or key is derived.
  return mnemonicWordSets.some((wordlist) => words.every((word) => wordlist.has(word)))
}

class BackupValidationError extends Error {}

function invalid(path: string, reason: string): never {
  throw new BackupValidationError(`Cadangan tidak valid pada ${path}: ${reason}.`)
}

/** Only supported fields are retained; extra fields, including wallet secrets, are rejected. */
function object(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(path, 'harus berupa objek')
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) invalid(path, 'memuat field yang tidak didukung')
  }
  return value as Record<string, unknown>
}

function text(value: unknown, path: string, nonempty = false, allowHash = false): string {
  if (typeof value !== 'string' || (nonempty && value.trim() === '')) {
    return invalid(path, nonempty ? 'harus berupa teks yang tidak kosong' : 'harus berupa teks')
  }
  if (PRIVATE_KEY.test(value.trim()) && !(allowHash && HASH.test(value))) {
    invalid(path, 'teks menyerupai private key di luar field hash publik')
  }
  if (resemblesMnemonic(value)) invalid(path, 'teks menyerupai seed phrase BIP39')
  // Ordinary source prose is accepted; word count alone does not imply a secret.
  return value
}

function identifier(value: unknown, path: string): string {
  const result = text(value, path, true)
  if (result !== result.trim() || result.includes('::')) invalid(path, 'format pengenal tidak valid')
  return result
}

function choice<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid(path, 'nilai tidak didukung')
  return value as T
}

function positiveInteger(value: unknown, path: string, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    invalid(path, `harus berupa bilangan bulat minimal ${minimum}`)
  }
  return value
}

function timestamp(value: unknown, path: string): string {
  const result = text(value, path, true)
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(result)
  if (!parts || !Number.isFinite(Date.parse(result))) invalid(path, 'harus berupa waktu ISO 8601 yang valid')
  const [, year, month, day, hour, minute, second] = parts
  const calendar = new Date(`${year}-${month}-${day}T00:00:00Z`)
  if (
    calendar.getUTCFullYear() !== Number(year) ||
    calendar.getUTCMonth() + 1 !== Number(month) ||
    calendar.getUTCDate() !== Number(day) ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
  ) invalid(path, 'tanggal atau jam tidak valid')
  return result
}

function nullable<T>(value: unknown, path: string, parse: (value: unknown, path: string) => T): T | null {
  return value === null ? null : parse(value, path)
}

function array<T>(value: unknown, path: string, parse: (value: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) invalid(path, 'harus berupa daftar')
  return value.map((item, index) => parse(item, `${path}[${index}]`))
}

function address(value: unknown, path: string): HexAddress {
  if (typeof value !== 'string') invalid(path, 'harus berupa alamat publik EVM')
  const checked = checkAddressInput(value)
  if (!checked.ok) invalid(path, 'alamat publik EVM tidak valid atau menyerupai rahasia wallet')
  return checked.address
}

function identity(value: unknown, path: string): Identity {
  const raw = object(value, path, ['kind', 'address', 'chainId'])
  const kind = choice(raw.kind, `${path}.kind`, ['none', 'demo', 'watch', 'metamask'])
  if (kind === 'none' || kind === 'demo') {
    if ('address' in raw || 'chainId' in raw) invalid(path, 'identitas ini tidak memiliki alamat atau chain ID')
    return { kind }
  }
  const publicAddress = address(raw.address, `${path}.address`)
  if (kind === 'watch') {
    if ('chainId' in raw) invalid(path, 'mode pantau tidak memiliki chain ID wallet aktif')
    return { kind, address: publicAddress }
  }
  return { kind, address: publicAddress, chainId: positiveInteger(raw.chainId, `${path}.chainId`) }
}

function accountKey(value: unknown, path: string, legacy: boolean): string {
  const result = identifier(value, path)
  if (result === 'demo') return result
  const parts = result.split(':')
  if ((parts[0] !== 'watch' && parts[0] !== 'metamask') || (parts.length !== 2 && !(legacy && parts.length === 3))) {
    invalid(path, 'kunci akun tidak valid')
  }
  if (parts.length === 3) positiveInteger(Number(parts[2]), `${path}.chainId`)
  return `${parts[0]}:${address(parts[1], path).toLowerCase()}`
}

function url(value: unknown, path: string): string {
  const result = text(value, path, true)
  let parsed: URL
  try {
    parsed = new URL(result)
  } catch {
    return invalid(path, 'URL tidak valid')
  }
  if (result !== result.trim() || !['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    invalid(path, 'URL harus HTTP/HTTPS tanpa kredensial')
  }
  return result
}

function campaign(value: unknown, path: string, legacy: boolean): Campaign {
  const raw = object(value, path, [
    'id', 'name', 'project', 'kind', 'chainId', 'status', 'origin', 'foundIn', 'officialUrl', 'checkerUrl',
    'sourceVerified', 'sourceEvidence', 'deadline', 'requirements', 'allocation', 'claimMethod', 'contract',
    'summary', 'checkedAt', 'adapterVersion', 'sourceKind',
  ])
  const chainId = positiveInteger(raw.chainId, `${path}.chainId`)
  if (typeof raw.sourceVerified !== 'boolean') invalid(`${path}.sourceVerified`, 'harus berupa boolean')
  let contract: Campaign['contract'] = null
  if (raw.contract !== null) {
    const reference = object(raw.contract, `${path}.contract`, ['chainId', 'address'])
    contract = {
      chainId: positiveInteger(reference.chainId, `${path}.contract.chainId`),
      address: address(reference.address, `${path}.contract.address`),
    }
    if (contract.chainId !== chainId) invalid(`${path}.contract.chainId`, 'tidak cocok dengan jaringan campaign')
  }
  return {
    id: identifier(raw.id, `${path}.id`),
    name: text(raw.name, `${path}.name`, true),
    project: text(raw.project, `${path}.project`, true),
    kind: choice(raw.kind, `${path}.kind`, ['token', 'nft', 'points', 'direct_distribution']),
    chainId,
    status: choice(raw.status, `${path}.status`, ['opportunity', 'claim_open', 'ended']),
    origin: choice(raw.origin, `${path}.origin`, ['demo', 'testnet', 'live']),
    foundIn: array(raw.foundIn, `${path}.foundIn`, identifier),
    officialUrl: nullable(raw.officialUrl, `${path}.officialUrl`, url),
    checkerUrl: nullable(raw.checkerUrl, `${path}.checkerUrl`, url),
    sourceVerified: raw.sourceVerified,
    sourceEvidence: text(raw.sourceEvidence, `${path}.sourceEvidence`),
    deadline: nullable(raw.deadline, `${path}.deadline`, timestamp),
    requirements: array(raw.requirements, `${path}.requirements`, (item, itemPath) => text(item, itemPath)),
    allocation: nullable(raw.allocation, `${path}.allocation`, (item, itemPath) => text(item, itemPath)),
    claimMethod: choice(raw.claimMethod, `${path}.claimMethod`, ['contract', 'official_site', 'direct_distribution', 'unknown']),
    contract,
    summary: text(raw.summary, `${path}.summary`),
    checkedAt: timestamp(raw.checkedAt, `${path}.checkedAt`),
    adapterVersion: identifier(legacy && raw.adapterVersion === undefined ? '1.0.0' : raw.adapterVersion, `${path}.adapterVersion`),
    ...(raw.sourceKind === undefined ? {} : {
      sourceKind: choice<'api' | 'local-archive'>(raw.sourceKind, `${path}.sourceKind`, ['api', 'local-archive']),
    }),
  }
}

function eligibility(value: unknown, path: string): EligibilityResult {
  const raw = object(value, path, ['status', 'reason', 'rule', 'source', 'checkedAt'])
  return {
    status: choice(raw.status, `${path}.status`, ['unknown', 'eligible', 'ineligible', 'needs_tasks']),
    reason: text(raw.reason, `${path}.reason`),
    rule: nullable(raw.rule, `${path}.rule`, (item, itemPath) => text(item, itemPath)),
    source: text(raw.source, `${path}.source`),
    checkedAt: nullable(raw.checkedAt, `${path}.checkedAt`, timestamp),
  }
}

function transaction(value: unknown, path: string): TxRecord {
  const raw = object(value, path, ['status', 'hash', 'proof', 'updatedAt', 'note'])
  const hash = nullable(raw.hash, `${path}.hash`, (item, itemPath): HexAddress => {
    if (typeof item !== 'string' || !HASH.test(item)) invalid(itemPath, 'harus berupa hash transaksi 32 byte')
    return item as HexAddress
  })
  return {
    status: choice(raw.status, `${path}.status`, ['not_sent', 'pending', 'confirmed', 'failed']),
    hash,
    proof: nullable(raw.proof, `${path}.proof`, (item, itemPath) => text(item, itemPath, false, true)),
    updatedAt: nullable(raw.updatedAt, `${path}.updatedAt`, timestamp),
    note: text(raw.note, `${path}.note`),
  }
}

function unique<T>(items: T[], path: string, key: (item: T) => string): T[] {
  const keys = items.map(key)
  if (new Set(keys).size !== keys.length) invalid(path, 'memuat kunci duplikat')
  return items
}

export type BackupValidationResult =
  | { ok: true; migratedFromVersion: number; bundle: StorageBackupBundle }
  | { ok: false; message: string }

/** Validate the full payload before either storage adapter replaces existing data. */
export function validateBackupPayload(value: unknown): BackupValidationResult {
  try {
    const raw = object(value, 'backup', ['app', 'schemaVersion', 'exportedAt', 'settings', 'watchlists', 'scanRecords', 'sourceCheckpoints'])
    if (raw.app !== 'airdrop-hunter') invalid('backup.app', 'bukan cadangan AirdropHunter')
    const version = raw.schemaVersion === undefined ? 1 : positiveInteger(raw.schemaVersion, 'backup.schemaVersion')
    if (version > STORAGE_SCHEMA_VERSION) invalid('backup.schemaVersion', 'versi skema belum didukung')
    const legacy = version === 1
    const now = new Date().toISOString()
    const oldDefault = (field: unknown, fallback: unknown) => legacy && field === undefined ? fallback : field

    let settings: StoredSettings | null = null
    if (oldDefault(raw.settings, null) !== null) {
      const s = object(raw.settings, 'settings', ['id', 'schemaVersion', 'identity', 'scenario', 'sourceMode', 'scanTtlMs', 'updatedAt'])
      if (oldDefault(s.id, 'app-settings') !== 'app-settings') invalid('settings.id', 'pengenal tidak valid')
      if (positiveInteger(oldDefault(s.schemaVersion, version), 'settings.schemaVersion') !== version) {
        invalid('settings.schemaVersion', 'tidak cocok dengan versi backup')
      }
      settings = {
        id: 'app-settings',
        schemaVersion: STORAGE_SCHEMA_VERSION,
        identity: identity(s.identity, 'settings.identity'),
        scenario: choice<DemoScenario>(oldDefault(s.scenario, 'normal'), 'settings.scenario', SCENARIOS),
        sourceMode: choice<SourceMode>(s.sourceMode === undefined ? 'all' : s.sourceMode, 'settings.sourceMode', SOURCE_MODES),
        scanTtlMs: positiveInteger(oldDefault(s.scanTtlMs, 60 * 60_000), 'settings.scanTtlMs', 60_000),
        updatedAt: timestamp(oldDefault(s.updatedAt, now), 'settings.updatedAt'),
      }
    }

    const watchlists = unique(array(oldDefault(raw.watchlists, []), 'watchlists', (item, path): StoredWatchlistRecord => {
      const w = object(item, path, legacy ? ['accountKey', 'identityKey', 'campaignIds', 'updatedAt'] : ['accountKey', 'campaignIds', 'updatedAt'])
      const key = accountKey('accountKey' in w ? w.accountKey : w.identityKey, `${path}.accountKey`, legacy)
      if (w.identityKey !== undefined && accountKey(w.identityKey, `${path}.identityKey`, legacy) !== key) {
        invalid(path, 'kunci akun lama tidak cocok')
      }
      return {
        accountKey: key,
        campaignIds: Array.from(new Set(array(w.campaignIds, `${path}.campaignIds`, identifier))),
        updatedAt: timestamp(oldDefault(w.updatedAt, now), `${path}.updatedAt`),
      }
    }), 'watchlists', (item) => item.accountKey)

    const scanRecords = unique(array(oldDefault(raw.scanRecords, []), 'scanRecords', (item, path): StoredScanRecord => {
      const r = object(item, path, [
        'key', 'addressScope', ...(legacy ? ['identityKey'] : []), 'chainId', 'campaignId', 'adapterVersion',
        'campaign', 'eligibility', 'tx', 'savedAt',
      ])
      const addressScope = accountKey('addressScope' in r ? r.addressScope : r.identityKey, `${path}.addressScope`, legacy)
      if (r.identityKey !== undefined && accountKey(r.identityKey, `${path}.identityKey`, legacy) !== addressScope) {
        invalid(path, 'kunci akun lama tidak cocok')
      }
      const storedCampaign = campaign(r.campaign, `${path}.campaign`, legacy)
      const chainId = positiveInteger(r.chainId, `${path}.chainId`)
      const campaignId = identifier(r.campaignId, `${path}.campaignId`)
      const adapterVersion = identifier(oldDefault(r.adapterVersion, storedCampaign.adapterVersion), `${path}.adapterVersion`)
      if (chainId !== storedCampaign.chainId || campaignId !== storedCampaign.id || adapterVersion !== storedCampaign.adapterVersion) {
        invalid(path, 'kunci catatan tidak cocok dengan campaign')
      }
      const key = formatScanRecordKey({ addressScope, chainId, campaignId, adapterVersion })
      if ((!legacy || r.key !== undefined) && text(r.key, `${path}.key`, true) !== key) {
        // v1 used identityKey including the active chain in its scope; rebuilding it
        // preserves records under the current address-based account key.
        const oldScope = legacy ? r.addressScope ?? r.identityKey : undefined
        const oldKey = typeof oldScope === 'string' ? formatScanRecordKey({ addressScope: oldScope, chainId, campaignId, adapterVersion }) : null
        if (!legacy || r.key !== oldKey) invalid(`${path}.key`, 'tidak cocok dengan isi catatan')
      }
      const restoredEligibility = legacy && (r.eligibility === undefined || r.eligibility === null)
        ? { status: 'unknown' as const, reason: 'Dipulihkan dari cadangan lokal.', rule: null, source: 'Cadangan lokal', checkedAt: null }
        : eligibility(r.eligibility, `${path}.eligibility`)
      // Backup contents are user supplied; even a fresh official-looking result
      // must be checked again before it can describe a real account.
      const importedEligibility: EligibilityResult = storedCampaign.origin !== 'demo' || addressScope !== 'demo'
        ? {
          status: 'unknown',
          reason: 'Hasil dari cadangan lokal harus diperiksa ulang melalui sumber resmi untuk alamat aktif.',
          rule: null,
          source: 'Cadangan lokal · perlu verifikasi ulang',
          checkedAt: null,
        }
        : restoredEligibility
      return {
        key, addressScope, chainId, campaignId, adapterVersion,
        campaign: storedCampaign,
        eligibility: importedEligibility,
        tx: nullable(oldDefault(r.tx, null), `${path}.tx`, transaction),
        savedAt: timestamp(oldDefault(r.savedAt, now), `${path}.savedAt`),
      }
    }), 'scanRecords', (item) => item.key)

    const sourceCheckpoints = unique(array(oldDefault(raw.sourceCheckpoints, []), 'sourceCheckpoints', (item, path): StoredSourceCheckpoint => {
      const c = object(item, path, ['sourceId', 'lastSuccessAt', 'campaigns', 'updatedAt', 'adapterVersion'])
      return {
        sourceId: identifier(c.sourceId, `${path}.sourceId`),
        lastSuccessAt: nullable(oldDefault(c.lastSuccessAt, null), `${path}.lastSuccessAt`, timestamp),
        campaigns: array(c.campaigns, `${path}.campaigns`, (entry, entryPath) => campaign(entry, entryPath, legacy)),
        updatedAt: timestamp(oldDefault(c.updatedAt, now), `${path}.updatedAt`),
        ...(c.adapterVersion === undefined ? {} : {
          adapterVersion: identifier(c.adapterVersion, `${path}.adapterVersion`),
        }),
      }
    }), 'sourceCheckpoints', (item) => item.sourceId)

    return {
      ok: true,
      migratedFromVersion: version,
      bundle: {
        app: 'airdrop-hunter', schemaVersion: STORAGE_SCHEMA_VERSION,
        exportedAt: timestamp(oldDefault(raw.exportedAt, now), 'backup.exportedAt'),
        settings, watchlists, scanRecords, sourceCheckpoints,
      },
    }
  } catch (error) {
    if (error instanceof BackupValidationError) return { ok: false, message: error.message }
    return { ok: false, message: 'Cadangan tidak dapat divalidasi.' }
  }
}
