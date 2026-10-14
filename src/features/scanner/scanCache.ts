import type { SourceAdapter } from '../../adapters/sources/types'

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
