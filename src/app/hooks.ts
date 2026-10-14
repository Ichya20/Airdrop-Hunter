import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export type Route = 'dashboard' | 'watchlist'

function parseRoute(hash: string): Route {
  return hash === '#/watchlist' ? 'watchlist' : 'dashboard'
}

function subscribeHash(callback: () => void): () => void {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

/** Routing hash sederhana agar Back/Forward bekerja di hosting statis atau server LAN. */
export function useHashRoute(): Route {
  return useSyncExternalStore(
    subscribeHash,
    () => parseRoute(window.location.hash),
    () => 'dashboard',
  )
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Waktu sekarang yang diperbarui berkala dan saat tab aktif kembali. */
export function useNow(intervalMs: number): [number, () => void] {
  const [now, setNow] = useState(() => Date.now())
  const refresh = useCallback(() => setNow(Date.now()), [])

  useEffect(() => {
    const timer = window.setInterval(refresh, intervalMs)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, refresh])

  return [now, refresh]
}
