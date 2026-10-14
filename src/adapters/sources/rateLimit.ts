import { SourceError } from './types'

export interface RateLimitConfig {
  /** Jeda minimum antar-permintaan otomatis ke sumber yang sama (ms). */
  minIntervalMs: number
  /** Batas maksimum permintaan dalam satu jendela waktu. */
  maxRequestsPerWindow: number
  /** Durasi jendela waktu (ms). */
  windowMs: number
}

export const DEFAULT_SOURCE_RATE_LIMIT: RateLimitConfig = {
  minIntervalMs: 15_000,
  maxRequestsPerWindow: 6,
  windowMs: 60_000,
}

export interface SourceRateLimiter {
  /**
   * Periksa apakah sumber boleh dipanggil pada waktu `now`.
   * Melempar `SourceError('http', ...)` bila masih dalam masa tunggu rate limit atau `Retry-After`.
   */
  acquire(sourceId: string, now?: number, manualRetry?: boolean): void
  /** Baca waktu tunggu tanpa mencatat permintaan baru atau melewati pembatasan. */
  getRetryDelayMs(sourceId: string, now?: number, manualRetry?: boolean): number
  /** Catat header `Retry-After` (detik) atau penalti HTTP 429 dari server. */
  recordRetryAfter(sourceId: string, retryAfterHeader: string | null, now?: number): number
  /** Reset state limiter untuk satu atau semua sumber (berguna saat pengujian). */
  reset(sourceId?: string): void
}

interface SourceWindowState {
  timestamps: number[]
  blockedUntil: number
}

/** Parse nilai header `Retry-After` (detik atau tanggal HTTP) menjadi milidetik tunggu. */
export function parseRetryAfterMs(headerValue: string | null, now = Date.now(), fallbackMs = 30_000): number {
  if (!headerValue || headerValue.trim() === '') return fallbackMs
  const trimmed = headerValue.trim()
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds * 1000), Number.MAX_SAFE_INTEGER)
  }
  const parsedDate = Date.parse(trimmed)
  if (Number.isFinite(parsedDate) && parsedDate > now) {
    return parsedDate - now
  }
  return fallbackMs
}

export function createSourceRateLimiter(
  config: RateLimitConfig = DEFAULT_SOURCE_RATE_LIMIT,
): SourceRateLimiter {
  const states = new Map<string, SourceWindowState>()

  const getState = (sourceId: string): SourceWindowState => {
    let existing = states.get(sourceId)
    if (!existing) {
      existing = { timestamps: [], blockedUntil: 0 }
      states.set(sourceId, existing)
    }
    return existing
  }

  const getRetryDelayMs = (sourceId: string, now = Date.now(), manualRetry = false): number => {
    const state = states.get(sourceId)
    if (!state) return 0
    const timestamps = state.timestamps.filter((ts) => now - ts < config.windowMs)
    let readyAt = state.blockedUntil
    if (timestamps.length >= config.maxRequestsPerWindow) {
      // Sesudah timestamp ini kedaluwarsa, jumlah permintaan kembali di bawah batas.
      const releaseIndex = timestamps.length - config.maxRequestsPerWindow
      readyAt = Math.max(readyAt, timestamps[releaseIndex] + config.windowMs)
    }
    const lastTs = timestamps[timestamps.length - 1]
    if (!manualRetry && lastTs !== undefined) {
      readyAt = Math.max(readyAt, lastTs + config.minIntervalMs)
    }
    return Math.max(0, readyAt - now)
  }

  return {
    getRetryDelayMs,
    acquire(sourceId: string, now = Date.now(), manualRetry = false): void {
      const state = getState(sourceId)

      if (state.blockedUntil > now) {
        const waitSec = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000))
        throw new SourceError(
          'http',
          `Batas laju sumber aktif. Tunggu ${waitSec} detik sebelum mencoba lagi.`,
          getRetryDelayMs(sourceId, now, manualRetry),
        )
      }

      // Bersihkan timestamp di luar jendela waktu
      state.timestamps = state.timestamps.filter((ts) => now - ts < config.windowMs)

      if (state.timestamps.length >= config.maxRequestsPerWindow) {
        const oldest = state.timestamps[0]
        const waitSec = Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000))
        throw new SourceError(
          'http',
          `Terlalu banyak permintaan ke sumber ini (${config.maxRequestsPerWindow}x per menit). Coba lagi dalam ${waitSec} detik.`,
          getRetryDelayMs(sourceId, now, manualRetry),
        )
      }

      const lastTs = state.timestamps[state.timestamps.length - 1]
      // Jika bukan klik "Coba lagi" spesifik per sumber, terapkan jeda minimum antar-scan
      if (!manualRetry && lastTs !== undefined && now - lastTs < config.minIntervalMs) {
        const waitSec = Math.max(1, Math.ceil((lastTs + config.minIntervalMs - now) / 1000))
        throw new SourceError(
          'http',
          `Permintaan terlalu berdekatan. Tunggu ${waitSec} detik sebelum memindai ulang sumber ini.`,
          getRetryDelayMs(sourceId, now, manualRetry),
        )
      }

      state.timestamps.push(now)
    },

    recordRetryAfter(sourceId: string, retryAfterHeader: string | null, now = Date.now()): number {
      const state = getState(sourceId)
      const waitMs = parseRetryAfterMs(retryAfterHeader, now)
      state.blockedUntil = Math.max(state.blockedUntil, now + waitMs)
      return Math.max(0, state.blockedUntil - now)
    },

    reset(sourceId?: string): void {
      if (sourceId) {
        states.delete(sourceId)
      } else {
        states.clear()
      }
    },
  }
}
