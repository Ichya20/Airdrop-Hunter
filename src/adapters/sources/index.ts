import { createDemoAdapters, type DemoScenario } from '../../demo/demoSources'
import {
  createLiveDefiLlamaAdapter,
  type LiveDefiLlamaAdapterOptions,
} from './liveDefiLlamaAdapter'
import type { SourceAdapter } from './types'

export type SourceMode = 'all' | 'live' | 'demo'

export interface SourceModeOption {
  value: SourceMode
  label: string
  hint: string
}

export const SOURCE_MODE_OPTIONS: readonly SourceModeOption[] = [
  {
    value: 'all',
    label: 'Sumber Live + DEMO',
    hint: 'Memindai endpoint live DefiLlama beserta 3 sumber fixture DEMO (masing-masing berlabel LIVE dan DEMO).',
  },
  {
    value: 'live',
    label: 'Hanya Sumber Live',
    hint: 'Memindai endpoint publik DefiLlama (https://api.llama.fi/protocols) dan arsip resmi proyek.',
  },
  {
    value: 'demo',
    label: 'Hanya Fixture DEMO',
    hint: 'Memindai 3 sumber simulasi lokal tanpa koneksi internet.',
  },
]

export function createSourceAdapters(
  getScenario: () => DemoScenario,
  liveOptions?: LiveDefiLlamaAdapterOptions,
): {
  liveAdapter: SourceAdapter
  demoAdapters: SourceAdapter[]
  allAdapters: SourceAdapter[]
  selectByMode: (mode: SourceMode) => SourceAdapter[]
} {
  const liveAdapter = createLiveDefiLlamaAdapter(liveOptions)
  const demoAdapters = createDemoAdapters(getScenario)
  const allAdapters = [liveAdapter, ...demoAdapters]

  return {
    liveAdapter,
    demoAdapters,
    allAdapters,
    selectByMode(mode: SourceMode): SourceAdapter[] {
      if (mode === 'live') return [liveAdapter]
      if (mode === 'demo') return demoAdapters
      return allAdapters
    },
  }
}

export * from './liveDefiLlamaAdapter'
export * from './rateLimit'
export * from './types'
