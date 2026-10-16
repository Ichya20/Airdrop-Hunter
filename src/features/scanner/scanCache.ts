import type { SourceAdapter } from '../../adapters/sources/types'
import { mergeCampaigns } from '../../domain/normalize'
import type { Campaign } from '../../domain/types'

/** Pembaruan progres tidak mengubah daftar campaign yang telah dinormalisasi. */
export function createCampaignSelector() {
  let previous: readonly (readonly Campaign[])[] = []
  let merged: Campaign[] = []
  return (sources: readonly { campaigns: readonly Campaign[] }[]): Campaign[] => {
    const inputs = sources.map((source) => source.campaigns)
    if (inputs.length === previous.length && inputs.every((input, index) => input === previous[index])) return merged
    previous = inputs
    merged = mergeCampaigns(inputs.flat())
    return merged
  }
}

interface SourceFreshness {
  id: string
  lastSuccessAt: string | null
}

/** Keputusan per sumber: hasil kosong yang sukses juga merupakan cache yang valid. */
export function sourcesNeedingRefresh(
  adapters: readonly SourceAdapter[],
  sources: readonly SourceFreshness[],
  ttlMs: number,
  now = Date.now(),
): SourceAdapter[] {
  const byId = new Map(sources.map((source) => [source.id, source]))
  return adapters.filter((adapter) => {
    const checkedAt = byId.get(adapter.id)?.lastSuccessAt
    if (!checkedAt) return true
    const checkedTime = Date.parse(checkedAt)
    return !Number.isFinite(checkedTime) || checkedTime > now || now - checkedTime >= ttlMs
  })
}
