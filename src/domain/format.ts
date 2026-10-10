const LOCALE = 'id-ID'

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
})

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const clockFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
})

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function toTime(iso: string): number | null {
  const time = Date.parse(iso)
  return Number.isFinite(time) ? time : null
}

export function formatDate(iso: string): string {
  const time = toTime(iso)
  return time === null ? 'Tanggal tidak valid' : dateFormat.format(time)
}

export function formatDateTime(iso: string): string {
  const time = toTime(iso)
  return time === null ? 'Waktu tidak valid' : dateTimeFormat.format(time)
}

export function formatTime(iso: string): string {
  const time = toTime(iso)
  return time === null ? '—' : timeFormat.format(time)
}

/** Jam dan zona waktu, misalnya "08.47 WIB". */
export function formatClock(iso: string): string {
  const time = toTime(iso)
  return time === null ? '—' : clockFormat.format(time)
}

/** Waktu relatif seperti "3 menit yang lalu" atau "dalam 14 hari". */
export function formatRelative(iso: string, now: number): string {
  const time = toTime(iso)
  if (time === null) return ''
  const diff = time - now
  const abs = Math.abs(diff)
  if (abs < 45_000) return diff <= 0 ? 'baru saja' : 'sebentar lagi'
  if (abs < HOUR) return relativeFormat.format(Math.round(diff / MINUTE), 'minute')
  if (abs < DAY) return relativeFormat.format(Math.round(diff / HOUR), 'hour')
  if (abs < 45 * DAY) return relativeFormat.format(Math.round(diff / DAY), 'day')
  return relativeFormat.format(Math.round(diff / (30 * DAY)), 'month')
}

export interface DeadlineView {
  /** Teks utama, misalnya "24 Okt 2026" atau "Belum diketahui". */
  text: string
  /** Teks pendukung, misalnya "dalam 3 hari". */
  hint: string
  urgent: boolean
  known: boolean
}

export function describeDeadline(deadline: string | null, now: number): DeadlineView {
  if (deadline === null) {
    return { text: 'Belum diketahui', hint: 'belum diumumkan sumber', urgent: false, known: false }
  }
  const time = toTime(deadline)
  if (time === null) {
    return { text: 'Belum diketahui', hint: 'Format tenggat tidak valid', urgent: false, known: false }
  }
  const diff = time - now
  return {
    text: formatDate(deadline),
    hint: diff <= 0 ? `berakhir ${formatRelative(deadline, now)}` : formatRelative(deadline, now),
    urgent: diff > 0 && diff <= 3 * DAY,
    known: true,
  }
}
