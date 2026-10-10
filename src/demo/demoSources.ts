import { delay, SourceError, type SourceAdapter } from '../adapters/sources/types'
import { normalizeCampaign } from '../domain/normalize'
import type { Campaign } from '../domain/types'
import { DEMO_ADAPTER_VERSION, DEMO_CAMPAIGNS, DEMO_SOURCE_META } from './fixtures'

export type DemoScenario = 'normal' | 'partial' | 'all_fail' | 'empty' | 'slow'

/** Penyimpan skenario yang dibaca adapter saat fetch; perubahan berlaku di scan berikutnya. */
export interface ScenarioStore {
  get: () => DemoScenario
  set: (scenario: DemoScenario) => void
}

/** Skenario awal dapat dipilih lewat URL, misalnya `?skenario=all_fail`, untuk menguji keadaan pertama kali dibuka. */
export function readScenarioParam(search: string = window.location.search): DemoScenario {
  const value = new URLSearchParams(search).get('skenario')
  const match = DEMO_SCENARIOS.find((option) => option.value === value)
  return match ? match.value : 'normal'
}

export function createScenarioStore(initial: DemoScenario): ScenarioStore {
  let current = initial
  return {
    get: () => current,
    set: (scenario) => {
      current = scenario
    },
  }
}

export interface DemoScenarioOption {
  value: DemoScenario
  label: string
  hint: string
}

export const DEMO_SCENARIOS: readonly DemoScenarioOption[] = [
  { value: 'normal', label: 'Normal', hint: 'Semua sumber DEMO berhasil.' },
  {
    value: 'partial',
    label: 'Sebagian gagal',
    hint: 'Checker DEMO Gamma gagal saat scan dan pulih ketika tombol Coba lagi dipakai.',
  },
  { value: 'all_fail', label: 'Semua gagal', hint: 'Semua sumber gagal, termasuk saat dicoba lagi.' },
  { value: 'empty', label: 'Kosong', hint: 'Sumber merespons tanpa campaign.' },
  { value: 'slow', label: 'Lambat', hint: 'Respons sekitar 3–6 detik untuk mencoba progres dan Batalkan.' },
]

function failIfScenario(sourceId: string, scenario: DemoScenario, manualRetry: boolean): void {
  if (scenario === 'partial' && sourceId === 'demo-checker-gamma' && !manualRetry) {
    throw new SourceError('http', 'Sumber membalas HTTP 503 (simulasi DEMO).')
  }
  if (scenario === 'all_fail') {
    if (sourceId === 'demo-feed-alpha') {
      throw new SourceError('network', 'Tidak dapat terhubung ke sumber (simulasi DEMO).')
    }
    if (sourceId === 'demo-feed-beta') {
      throw new SourceError('timeout', 'Sumber tidak merespons dalam batas waktu (simulasi DEMO).')
    }
    throw new SourceError('invalid', 'Format respons tidak dikenali (simulasi DEMO).')
  }
}

/**
 * Adapter sumber DEMO. Tidak ada request jaringan: latensi dan kegagalan disimulasikan
 * menurut skenario yang dipilih pengguna.
 */
export function createDemoAdapters(getScenario: () => DemoScenario): SourceAdapter[] {
  return DEMO_SOURCE_META.map((meta): SourceAdapter => ({
    id: meta.id,
    name: meta.name,
    origin: 'demo',
    version: DEMO_ADAPTER_VERSION,
    description: meta.description,
    async fetchCampaigns({ signal, manualRetry }): Promise<Campaign[]> {
      const scenario = getScenario()
      await delay(scenario === 'slow' ? meta.baseLatencyMs * 4 : meta.baseLatencyMs, signal)
      failIfScenario(meta.id, scenario, manualRetry)
      if (scenario === 'empty') return []

      const now = Date.now()
      const checkedAt = new Date(now).toISOString()
      const campaigns: Campaign[] = []
      for (const fixture of DEMO_CAMPAIGNS) {
        if (fixture.sourceId !== meta.id) continue
        const campaign = normalizeCampaign(fixture.build(now), {
          sourceId: meta.id,
          origin: 'demo',
          checkedAt,
          adapterVersion: DEMO_ADAPTER_VERSION,
        })
        if (campaign) campaigns.push(campaign)
      }
      return campaigns
    },
  }))
}
