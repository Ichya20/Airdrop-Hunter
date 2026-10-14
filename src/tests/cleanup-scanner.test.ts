import assert from 'node:assert/strict'
import type { SourceAdapter } from '../adapters/sources/types'
import { sourcesNeedingRefresh } from '../features/scanner/scanCache'

const NOW = Date.parse('2026-10-14T12:00:00.000Z')
const TTL_MS = 60 * 60_000

function makeAdapter(id: string): SourceAdapter {
  return {
    id,
    name: id,
    origin: 'live',
    version: 'test-1.0.0',
    description: 'Fixture pengujian keputusan cache tanpa koneksi jaringan.',
    async fetchCampaigns() { return [] },
  }
}

function isoAt(ageMs: number): string {
  return new Date(NOW - ageMs).toISOString()
}

export async function runCleanupScannerTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0
  const step = (name: string, fn: () => void) => {
    fn()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  step('TTL diperiksa per sumber: sumber segar tidak menutupi sumber usang', () => {
    const fresh = makeAdapter('fresh')
    const stale = makeAdapter('stale')
    assert.deepEqual(sourcesNeedingRefresh([fresh, stale], [
      { id: fresh.id, lastSuccessAt: isoAt(500) },
      { id: stale.id, lastSuccessAt: isoAt(TTL_MS + 500) },
    ], TTL_MS, NOW), [stale])
  })

  step('Sumber tanpa checkpoint atau tanpa waktu sukses perlu dipindai', () => {
    const missing = makeAdapter('missing')
    const emptyTimestamp = makeAdapter('empty-timestamp')
    const neverSucceeded = makeAdapter('never-succeeded')
    assert.deepEqual(sourcesNeedingRefresh([missing, emptyTimestamp, neverSucceeded], [
      { id: emptyTimestamp.id, lastSuccessAt: '' },
      { id: neverSucceeded.id, lastSuccessAt: null },
    ], TTL_MS, NOW), [missing, emptyTimestamp, neverSucceeded])
  })

  step('Waktu checkpoint tidak valid perlu dipindai ulang', () => {
    const adapter = makeAdapter('invalid')
    assert.deepEqual(sourcesNeedingRefresh([adapter], [
      { id: adapter.id, lastSuccessAt: 'bukan-tanggal' },
    ], TTL_MS, NOW), [adapter])
  })

  step('Hasil sukses yang kosong tetap cache valid selama waktu suksesnya segar', () => {
    const adapter = makeAdapter('successful-empty')
    const checkpoint = { id: adapter.id, lastSuccessAt: isoAt(500), campaigns: [] }
    assert.deepEqual(sourcesNeedingRefresh([adapter], [checkpoint], TTL_MS, NOW), [])
  })

  step('Waktu checkpoint dari masa depan tidak memperpanjang cache', () => {
    const adapter = makeAdapter('future')
    assert.deepEqual(sourcesNeedingRefresh([adapter], [
      { id: adapter.id, lastSuccessAt: isoAt(-1) },
    ], TTL_MS, NOW), [adapter])
  })

  step('Tepat pada TTL perlu refresh; satu milidetik sebelumnya masih segar', () => {
    const boundary = makeAdapter('boundary')
    const almost = makeAdapter('almost')
    assert.deepEqual(sourcesNeedingRefresh([boundary, almost], [
      { id: boundary.id, lastSuccessAt: isoAt(TTL_MS) },
      { id: almost.id, lastSuccessAt: isoAt(TTL_MS - 1) },
    ], TTL_MS, NOW), [boundary])
  })

  return { passed, details }
}
