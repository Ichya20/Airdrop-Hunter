import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveEligibility } from '../adapters/eligibility'
import { shortenAddress } from '../domain/address'
import type { HexAddress, Identity } from '../domain/types'
import {
  createDemoAdapters,
  createScenarioStore,
  readScenarioParam,
  type DemoScenario,
} from '../demo/demoSources'
import { resolveTransaction } from '../features/claims/resolveTransaction'
import { CampaignDrawer } from '../features/dashboard/CampaignDrawer'
import { DashboardView } from '../features/dashboard/DashboardView'
import type { DetailRequest, OpenIntent } from '../features/dashboard/intent'
import { buildRows } from '../features/dashboard/rows'
import { WatchlistView } from '../features/dashboard/WatchlistView'
import { SCAN_TTL_MS, useScanner } from '../features/scanner/useScanner'
import { AccountDialog } from '../features/wallet/AccountDialog'
import { walletAccountKey } from '../features/wallet/identity'
import { useMetaMaskWallet } from '../features/wallet/useMetaMaskWallet'
import { createBrowserStorage } from '../storage'
import type { ImportBackupResult, StorageStats, StoredScanRecord } from '../storage/types'
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

  const storage = useMemo(() => createBrowserStorage(), [])

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
  const [cachedRecords, setCachedRecords] = useState<ReadonlyMap<string, StoredScanRecord>>(() => new Map())
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [hydrated, setHydrated] = useState(false)
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

  const refreshStorageStats = useCallback(async () => {
    try {
      const stats = await storage.getStats()
      setStorageStats(stats)
    } catch {
      // Abaikan bila gagal membaca statistik storage.
    }
  }, [storage])

  // Pulihkan pengaturan, watchlist, dan checkpoint scan dari IndexedDB saat aplikasi dibuka.
  useEffect(() => {
    let active = true
    void (async () => {
      const [savedSettings, allWatchlists, checkpoints] = await Promise.all([
        storage.loadSettings(),
        storage.loadAllWatchlists(),
        storage.loadSourceCheckpoints(),
      ])
      if (!active) return
      if (savedSettings) {
        setIdentity(savedSettings.identity)
        // Gunakan skenario dari URL bila eksplisit, jika tidak pakai skenario tersimpan
        const urlHasScenario = new URLSearchParams(window.location.search).has('skenario')
        if (!urlHasScenario) {
          demo.store.set(savedSettings.scenario)
          setScenario(savedSettings.scenario)
        }
      }
      setWatchlists(allWatchlists)
      if (checkpoints.length > 0) {
        scanner.hydrateCheckpoints(checkpoints)
      }
      setHydrated(true)
      await refreshStorageStats()
    })()
    return () => {
      active = false
    }
  }, [storage, demo.store, scanner.hydrateCheckpoints, refreshStorageStats])

  // Simpan pengaturan setiap kali identitas atau skenario berubah setelah hidrasi.
  useEffect(() => {
    if (!hydrated) return
    void storage
      .saveSettings({
        identity,
        scenario,
        scanTtlMs: SCAN_TTL_MS,
      })
      .then(() => refreshStorageStats())
  }, [hydrated, identity, scenario, storage, refreshStorageStats])

  // Simpan checkpoint sumber ke IndexedDB setiap kali scan selesai.
  useEffect(() => {
    if (!hydrated || scanner.state.finishedAt === null) return
    const checkpoints = scanner.state.sources
      .filter((s) => s.lastSuccessAt !== null && s.campaigns.length > 0)
      .map((s) => ({
        sourceId: s.id,
        lastSuccessAt: s.lastSuccessAt,
        campaigns: s.campaigns,
        updatedAt: scanner.state.finishedAt ?? new Date().toISOString(),
      }))
    if (checkpoints.length > 0) {
      void storage.saveSourceCheckpoints(checkpoints).then(() => refreshStorageStats())
    }
  }, [hydrated, scanner.state.finishedAt, scanner.state.sources, storage, refreshStorageStats])

  // Muat dan simpan hasil scan per alamat + chain ID + campaign ID + versi adapter;
  // bersihkan cache tampilan setiap kali identitas atau jaringan berganti.
  useEffect(() => {
    let active = true
    setCachedRecords(new Map())
    if (!hydrated || scanner.campaigns.length === 0 || identity.kind === 'none') {
      return () => {
        active = false
      }
    }
    void (async () => {
      const existing = await storage.loadScanRecordsForIdentity(identity, scanner.campaigns)
      if (!active) return
      setCachedRecords(existing)
      const entries = scanner.campaigns.map((campaign) => {
        const cached = existing.get(campaign.id) ?? null
        return {
          campaign,
          eligibility: resolveEligibility(campaign, identity, cached),
          tx: resolveTransaction(campaign, identity, cached),
        }
      })
      await storage.saveScanRecordsForIdentity(identity, entries)
      if (!active) return
      const updated = await storage.loadScanRecordsForIdentity(identity, scanner.campaigns)
      if (!active) return
      setCachedRecords(updated)
      await refreshStorageStats()
    })()
    return () => {
      active = false
    }
  }, [hydrated, identity, scanner.campaigns, storage, refreshStorageStats])

  const changeIdentity = useCallback(
    (next: Identity, message: string) => {
      // Bersihkan cache tampilan dan tutup drawer detail saat identitas/jaringan berganti (R6.2, R7.3).
      setCachedRecords(new Map())
      setIdentity(next)
      setDetail(null)
      setAccountOpen(false)
      announce(message)
    },
    [announce],
  )

  const wallet = useMetaMaskWallet({
    identity,
    onSessionChange: (next, message) => {
      setCachedRecords(new Map())
      setIdentity(next)
      setDetail(null)
      announce(message)
    },
  })

  const accountKey = walletAccountKey(identity)
  const watchedIds = useMemo(() => watchlists[accountKey] ?? [], [watchlists, accountKey])
  const watched = useMemo(() => new Set(watchedIds), [watchedIds])
  const rows = useMemo(
    () => buildRows(scanner.campaigns, identity, now, scanner.staleSourceIds, watched, cachedRecords),
    [scanner.campaigns, identity, now, scanner.staleSourceIds, watched, cachedRecords],
  )
  const detailRow = detail ? (rows.find((row) => row.campaign.id === detail.campaignId) ?? null) : null

  // Perbarui "sekarang" saat scan selesai agar waktu relatif langsung akurat.
  useEffect(() => {
    if (scanner.state.finishedAt !== null) refreshNow()
  }, [scanner.state.finishedAt, refreshNow])

  useEffect(() => {
    document.title = `${TITLES[route]} · AirdropHunter`
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
      if (accountKey === 'none') return
      setWatchlists((previous) => {
        const list = previous[accountKey] ?? []
        const next = list.includes(campaignId) ? list.filter((id) => id !== campaignId) : [...list, campaignId]
        void storage.saveWatchlist(identity, next).then(() => refreshStorageStats())
        return { ...previous, [accountKey]: next }
      })
    },
    [accountKey, identity, storage, refreshStorageStats],
  )

  const openDetail = useCallback((campaignId: string, intent: OpenIntent) => {
    setDetail({ campaignId, ...intent })
  }, [])

  const handleScenarioChange = (next: DemoScenario) => {
    demo.store.set(next)
    setScenario(next)
  }

  const handleExportBackup = useCallback(async (): Promise<string> => {
    const bundle = await storage.exportBackup()
    return JSON.stringify(bundle, null, 2)
  }, [storage])

  const handleImportBackup = useCallback(
    async (rawJson: string): Promise<ImportBackupResult> => {
      const result = await storage.importBackup(rawJson)
      if (result.ok) {
        const [savedSettings, allWatchlists, checkpoints] = await Promise.all([
          storage.loadSettings(),
          storage.loadAllWatchlists(),
          storage.loadSourceCheckpoints(),
        ])
        if (savedSettings) {
          setIdentity(savedSettings.identity)
          demo.store.set(savedSettings.scenario)
          setScenario(savedSettings.scenario)
        }
        setWatchlists(allWatchlists)
        if (checkpoints.length > 0) {
          scanner.hydrateCheckpoints(checkpoints)
        }
        await refreshStorageStats()
        announce('Cadangan data lokal berhasil diimpor.')
      }
      return result
    },
    [storage, demo.store, scanner, refreshStorageStats, announce],
  )

  const handleClearStorage = useCallback(async () => {
    await storage.clearAll()
    setWatchlists({})
    setCachedRecords(new Map())
    await refreshStorageStats()
    announce('Cache IndexedDB lokal telah dibersihkan.')
  }, [storage, refreshStorageStats, announce])

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
                onSwitchNetwork={wallet.switchNetwork}
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
        onSwitchNetwork={wallet.switchNetwork}
      />

      <AccountDialog
        open={accountOpen}
        identity={identity}
        wallet={wallet}
        storageStats={storageStats}
        onClose={() => setAccountOpen(false)}
        onSelectDemo={() => changeIdentity({ kind: 'demo' }, 'Akun DEMO aktif. Status dihitung ulang dari fixture.')}
        onWatch={(address: HexAddress) =>
          changeIdentity(
            { kind: 'watch', address },
            `Mode pantau aktif untuk ${shortenAddress(address)}. Cache tampilan akun sebelumnya dibersihkan.`,
          )
        }
        onClear={() => changeIdentity({ kind: 'none' }, 'Akun dilepas. Semua kelayakan menjadi belum diketahui.')}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onClearStorage={handleClearStorage}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}
