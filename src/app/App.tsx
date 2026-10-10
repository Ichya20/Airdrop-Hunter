import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shortenAddress } from '../domain/address'
import type { HexAddress, Identity } from '../domain/types'
import {
  createDemoAdapters,
  createScenarioStore,
  readScenarioParam,
  type DemoScenario,
} from '../demo/demoSources'
import { CampaignDrawer } from '../features/dashboard/CampaignDrawer'
import { DashboardView } from '../features/dashboard/DashboardView'
import type { DetailRequest, OpenIntent } from '../features/dashboard/intent'
import { buildRows } from '../features/dashboard/rows'
import { WatchlistView } from '../features/dashboard/WatchlistView'
import { useScanner } from '../features/scanner/useScanner'
import { AccountDialog } from '../features/wallet/AccountDialog'
import { identityKey } from '../features/wallet/identity'
import { AppHeader } from './AppHeader'
import { DemoBanner } from './DemoBanner'
import { useHashRoute, useMediaQuery, useNow } from './hooks'
import { BottomBar, Sidebar } from './Navigation'

const TITLES = { dashboard: 'Dashboard', watchlist: 'Watchlist' } as const

export function App() {
  const route = useHashRoute()
  const isDesktop = useMediaQuery('(min-width: 64rem)')
  // Tabel butuh ±900 px; di bawah 1200 px daftar kartu lebih mudah dibaca.
  const tableLayout = useMediaQuery('(min-width: 75rem)')
  const [now, refreshNow] = useNow(30_000)

  // Adapter dibuat sekali; skenario dibaca saat fetch sehingga perubahan berlaku di scan berikutnya.
  const [demo] = useState(() => {
    const store = createScenarioStore(readScenarioParam())
    return { store, adapters: createDemoAdapters(store.get) }
  })
  const [scenario, setScenario] = useState<DemoScenario>(() => demo.store.get())
  const { adapters } = demo
  const scanner = useScanner(adapters)
  const sourceNames = useMemo(() => new Map(adapters.map((adapter) => [adapter.id, adapter.name])), [adapters])

  const [identity, setIdentity] = useState<Identity>({ kind: 'demo' })
  const [watchlists, setWatchlists] = useState<Record<string, string[]>>({})
  const [detail, setDetail] = useState<DetailRequest | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  const announce = useCallback((message: string) => {
    // Kosongkan dulu agar pesan yang sama tetap dibacakan, dan tunda sampai dialog tertutup.
    setAnnouncement('')
    window.setTimeout(() => setAnnouncement(message), 80)
  }, [])

  const key = identityKey(identity)
  const watchedIds = useMemo(() => watchlists[key] ?? [], [watchlists, key])
  const watched = useMemo(() => new Set(watchedIds), [watchedIds])
  const rows = useMemo(
    () => buildRows(scanner.campaigns, identity, now, scanner.staleSourceIds, watched),
    [scanner.campaigns, identity, now, scanner.staleSourceIds, watched],
  )
  const detailRow = detail ? (rows.find((row) => row.campaign.id === detail.campaignId) ?? null) : null

  // Perbarui "sekarang" saat scan selesai agar waktu relatif langsung akurat.
  useEffect(() => {
    if (scanner.state.finishedAt !== null) refreshNow()
  }, [scanner.state.finishedAt, refreshNow])

  useEffect(() => {
    document.title = `${TITLES[route]} · AirdropHunter DEMO`
  }, [route])

  // Pindahkan fokus ke judul halaman setelah navigasi (bukan saat pertama dibuka).
  const previousRoute = useRef(route)
  useEffect(() => {
    if (previousRoute.current === route) return
    previousRoute.current = route
    headingRef.current?.focus()
  }, [route])

  const startScan = useCallback(() => {
    if (scanner.isRunning) {
      announce('Scan sedang berjalan. Tunggu sampai selesai atau tekan Batalkan.')
      return
    }
    scanner.start('manual')
  }, [scanner, announce])

  const toggleWatch = useCallback(
    (campaignId: string) => {
      setWatchlists((previous) => {
        const list = previous[key] ?? []
        const next = list.includes(campaignId) ? list.filter((id) => id !== campaignId) : [...list, campaignId]
        return { ...previous, [key]: next }
      })
    },
    [key],
  )

  const openDetail = useCallback((campaignId: string, intent: OpenIntent) => {
    setDetail({ campaignId, ...intent })
  }, [])

  const changeIdentity = (next: Identity, message: string) => {
    setIdentity(next)
    setDetail(null)
    setAccountOpen(false)
    announce(message)
  }

  const handleScenarioChange = (next: DemoScenario) => {
    demo.store.set(next)
    setScenario(next)
  }

  const counts = { dashboard: rows.length, watchlist: rows.filter((row) => row.watched).length }

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus()
        }}
      >
        Lewati ke konten utama
      </a>
      <div className="app" data-scanning={scanner.isRunning ? 'true' : undefined}>
        <AppHeader
          identity={identity}
          scanner={scanner}
          isDesktop={isDesktop}
          onScan={startScan}
          onOpenAccount={() => setAccountOpen(true)}
        />
        <div className="app__body">
          {isDesktop ? <Sidebar route={route} counts={counts} /> : null}
          <main id="main" className="main" ref={mainRef} tabIndex={-1}>
            <DemoBanner scenario={scenario} compact={!isDesktop} onScenarioChange={handleScenarioChange} />
            {route === 'dashboard' ? (
              <DashboardView
                rows={rows}
                scanner={scanner}
                identity={identity}
                now={now}
                tableLayout={tableLayout}
                compactScan={!isDesktop}
                headingRef={headingRef}
                onOpen={openDetail}
                onToggleWatch={toggleWatch}
                onScan={startScan}
                onOpenAccount={() => setAccountOpen(true)}
                announce={announce}
              />
            ) : (
              <WatchlistView
                rows={rows}
                watchedIds={watchedIds}
                identity={identity}
                now={now}
                tableLayout={tableLayout}
                loading={scanner.isRunning}
                headingRef={headingRef}
                onOpen={openDetail}
                onToggleWatch={toggleWatch}
              />
            )}
          </main>
        </div>
        {isDesktop ? null : <BottomBar route={route} counts={counts} scanner={scanner} onScan={startScan} />}
      </div>

      <CampaignDrawer
        request={detail}
        row={detailRow}
        identity={identity}
        now={now}
        sourceNames={sourceNames}
        onClose={() => setDetail(null)}
        onToggleWatch={toggleWatch}
      />

      <AccountDialog
        open={accountOpen}
        identity={identity}
        onClose={() => setAccountOpen(false)}
        onSelectDemo={() => changeIdentity({ kind: 'demo' }, 'Akun DEMO aktif. Status dihitung ulang dari fixture.')}
        onWatch={(address: HexAddress) =>
          changeIdentity(
            { kind: 'watch', address },
            `Mode pantau aktif untuk ${shortenAddress(address)}. Kelayakan belum diketahui di tahap 1.`,
          )
        }
        onClear={() => changeIdentity({ kind: 'none' }, 'Akun dilepas. Semua kelayakan menjadi belum diketahui.')}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}
