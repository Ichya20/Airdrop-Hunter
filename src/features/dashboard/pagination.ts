/** Membatasi DOM yang dirender, tanpa membatasi data discovery atau hasil filter. */
export const RESULTS_PAGE_SIZE = 30

export function paginateRows<T>(rows: readonly T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / RESULTS_PAGE_SIZE))
  const index = Math.max(0, Math.min(Math.trunc(requestedPage) || 0, pageCount - 1))
  const start = index * RESULTS_PAGE_SIZE
  return {
    index,
    pageCount,
    start: rows.length === 0 ? 0 : start + 1,
    end: Math.min(start + RESULTS_PAGE_SIZE, rows.length),
    rows: rows.slice(start, start + RESULTS_PAGE_SIZE),
  }
}
