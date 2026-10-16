import { createDemoAdapters, type DemoScenario } from '../../demo/demoSources'
import {
  createLiveDefiLlamaAdapter,
  type LiveDefiLlamaAdapterOptions,
} from './liveDefiLlamaAdapter'
import { createMerklCatalogAdapter, type MerklCatalogAdapterOptions } from './merklCatalogAdapter'
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
    hint: 'Katalog publik DefiLlama dan Merkl tanpa filter koin/TVL atau batas hasil lokal, ARSIP LOKAL, dan 3 fixture DEMO.',
  },
  {
    value: 'live',
    label: 'Hanya Sumber Live',
    hint: 'Seluruh metadata EVM DefiLlama dan katalog Merkl beserta ARSIP LOKAL; token gratis, nilai pasar, dan hak klaim wallet diperiksa terpisah. Gas dapat diperlukan.',
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
  merklOptions?: MerklCatalogAdapterOptions,
): {
  liveAdapter: SourceAdapter
  merklAdapter: SourceAdapter
  liveAdapters: SourceAdapter[]
  demoAdapters: SourceAdapter[]
  allAdapters: SourceAdapter[]
  selectByMode: (mode: SourceMode) => SourceAdapter[]
} {
  const liveAdapter = createLiveDefiLlamaAdapter(liveOptions)
  const merklAdapter = createMerklCatalogAdapter(merklOptions)
  const liveAdapters = [liveAdapter, merklAdapter]
  const demoAdapters = createDemoAdapters(getScenario)
  const allAdapters = [...liveAdapters, ...demoAdapters]

  return {
    liveAdapter,
    merklAdapter,
    liveAdapters,
    demoAdapters,
    allAdapters,
    selectByMode(mode: SourceMode): SourceAdapter[] {
      if (mode === 'live') return liveAdapters
      if (mode === 'demo') return demoAdapters
      return allAdapters
    },
  }
}

export * from './liveDefiLlamaAdapter'
export * from './merklCatalogAdapter'
export * from './rateLimit'
export * from './types'
