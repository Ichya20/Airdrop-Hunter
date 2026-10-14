import assert from 'node:assert/strict'
import { createLiveDefiLlamaAdapter } from '../adapters/sources/liveDefiLlamaAdapter'
import { createSourceRateLimiter, parseRetryAfterMs } from '../adapters/sources/rateLimit'
import { delay, SourceError } from '../adapters/sources/types'
import { runScan, type ScanEvent, type ScanOptions } from '../features/scanner/runScan'

const SHORT_SCAN_OPTIONS: ScanOptions = {
  concurrency: 1,
  timeoutMs: 500,
  retries: 1,
  backoffMs: 1,
}

function scanResult(events: readonly ScanEvent[]) {
  const event = events.find((item) => item.type === 'result')
  assert.ok(event && event.type === 'result', 'Scan harus mengeluarkan hasil akhir')
  return event.result
}

export async function runCleanupRetryTests(): Promise<{ passed: number; details: string[] }> {
  const details: string[] = []
  let passed = 0
  const step = async (name: string, fn: () => void | Promise<void>) => {
    await fn()
    passed += 1
    details.push(`PASS: ${name}`)
  }

  await step('Retry HTTP 500 menunggu interval sumber dan benar-benar mencoba fetch kedua', async () => {
    const requestTimes: number[] = []
    const adapter = createLiveDefiLlamaAdapter({
      rateLimiter: createSourceRateLimiter({
        minIntervalMs: 45,
        maxRequestsPerWindow: 5,
        windowMs: 200,
      }),
      fetchFn: async () => {
        requestTimes.push(Date.now())
        return new Response('[]', { status: requestTimes.length === 1 ? 500 : 200 })
      },
    })
    const events: ScanEvent[] = []
    await runScan([adapter], SHORT_SCAN_OPTIONS, new AbortController().signal, (event) => events.push(event))
    const result = scanResult(events)
    assert.equal(result.status, 'ok')
    assert.equal(result.attempts, 2)
    assert.equal(requestTimes.length, 2)
    assert.ok(requestTimes[1] - requestTimes[0] >= 45, 'Fetch kedua tidak boleh mendahului limiter')
  })

  await step('Retry HTTP 429 menunggu Retry-After sebelum fetch berikutnya', async () => {
    const requestTimes: number[] = []
    const adapter = createLiveDefiLlamaAdapter({
      rateLimiter: createSourceRateLimiter({
        minIntervalMs: 1,
        maxRequestsPerWindow: 5,
        windowMs: 200,
      }),
      fetchFn: async () => {
        requestTimes.push(Date.now())
        return new Response('[]', requestTimes.length === 1
          ? { status: 429, headers: { 'Retry-After': '0.05' } }
          : { status: 200 })
      },
    })
    const events: ScanEvent[] = []
    await runScan([adapter], SHORT_SCAN_OPTIONS, new AbortController().signal, (event) => events.push(event), true)
    assert.equal(scanResult(events).status, 'ok')
    assert.equal(requestTimes.length, 2)
    assert.ok(requestTimes[1] - requestTimes[0] >= 50, 'Retry manual tetap menghormati blokir server')
  })

  await step('Batal selama menunggu retry menghentikan scan tanpa fetch tambahan', async () => {
    let calls = 0
    const controller = new AbortController()
    const adapter = createLiveDefiLlamaAdapter({
      rateLimiter: createSourceRateLimiter(),
      fetchFn: async () => {
        calls += 1
        return new Response('[]', { status: 429, headers: { 'Retry-After': '1' } })
      },
    })
    const events: ScanEvent[] = []
    await runScan([adapter], SHORT_SCAN_OPTIONS, controller.signal, (event) => {
      events.push(event)
      if (event.type === 'retry_wait') setTimeout(() => controller.abort(), 5)
    })
    assert.equal(calls, 1)
    assert.equal(events.filter((event) => event.type === 'cancelled').length, 1)
    assert.equal(events.some((event) => event.type === 'result'), false)
  })

  await step('Limiter memberi jeda gabungan dan retry manual tidak melewati jendela atau blokir server', () => {
    const limiter = createSourceRateLimiter({
      minIntervalMs: 15,
      maxRequestsPerWindow: 2,
      windowMs: 60,
    })
    limiter.acquire('source', 1_000)
    assert.equal(limiter.getRetryDelayMs('source', 1_005), 10)
    assert.equal(limiter.getRetryDelayMs('source', 1_005, true), 0)
    limiter.acquire('source', 1_005, true)
    assert.equal(limiter.getRetryDelayMs('source', 1_006, true), 54)
    assert.throws(() => limiter.acquire('source', 1_006, true), (error: unknown) =>
      error instanceof SourceError && error.retryAfterMs === 54)
    limiter.recordRetryAfter('source', '0.1', 1_006)
    assert.equal(limiter.getRetryDelayMs('source', 1_006, true), 100)
    assert.throws(() => limiter.acquire('source', 1_070, true), (error: unknown) =>
      error instanceof SourceError && error.retryAfterMs === 36)
    limiter.acquire('source', 1_106, true)
  })

  await step('Retry tetap dibatasi meski setiap respons HTTP 500 terus gagal', async () => {
    let calls = 0
    const adapter = createLiveDefiLlamaAdapter({
      rateLimiter: createSourceRateLimiter({
        minIntervalMs: 5,
        maxRequestsPerWindow: 5,
        windowMs: 100,
      }),
      fetchFn: async () => {
        calls += 1
        return new Response('[]', { status: 500 })
      },
    })
    const events: ScanEvent[] = []
    await runScan([adapter], { ...SHORT_SCAN_OPTIONS, retries: 2 }, new AbortController().signal,
      (event) => events.push(event))
    assert.equal(calls, 3)
    const result = scanResult(events)
    assert.equal(result.status, 'error')
    assert.equal(result.attempts, 3)
    assert.equal(events.filter((event) => event.type === 'retry_wait').length, 2)
  })

  await step('Retry-After panjang tidak dipotong dan timer panjang tetap dapat dibatalkan', async () => {
    assert.equal(parseRetryAfterMs('1200', 1_000), 1_200_000)
    assert.equal(parseRetryAfterMs('0', 1_000), 0)
    const controller = new AbortController()
    let resolved = false
    const pending = delay(3_000_000_000, controller.signal).then(() => { resolved = true })
    const rejected = assert.rejects(pending, (error: unknown) =>
      error instanceof DOMException && error.name === 'AbortError')
    await delay(15, new AbortController().signal)
    assert.equal(resolved, false)
    controller.abort()
    await rejected
  })

  return { passed, details }
}
