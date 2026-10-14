import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveEligibility } from '../adapters/eligibility'
import { createSourceAdapters, type SourceMode } from '../adapters/sources'
import { shortenAddress } from '../domain/address'
import type { HexAddress, Identity } from '../domain/types'
import {
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
  const tableLayout = useMediaQuery('(min-width: 75rem)')
  const [now, refreshNow] = useNow(30_000)

  const storage = useMemo(() => createBrowserStorage(), [])

  const [sourceRegistry] = useState(() => {
    const store = createScenarioStore(readScenarioParam())
    return { store, ...createSourceAdapters(store.get) }
  })
  const [scenario, setScenario] = useState<DemoScenario>(() => sourceRegistry.store.get())
  const [sourceMode, setSourceMode] = useState<SourceMode>('all')
  const [hydrated, setHydrated] = useState(false)

  const enabledSourceIds = useMemo(() => {
    const selected = sourceRegistry.selectByMode(sourceMode)
    return new Set(selected.map((adapter) => adapter.id))
  }, [sourceRegistry, sourceMode])

  const scanner = useScanner(sourceRegistry.allAdapters, enabledSourceIds, undefined, SCAN_TTL_MS, hydrated)
  const { hydrateCheckpoints } = scanner
  const sourceNames = useMemo(
    () => new Map(sourceRegistry.allAdapters.map((adapter) => [adapter.id, adapter.name])),
    [sourceRegistry.allAdapters],
  )

  const [identity, setIdentity] = useState<Identity>({ kind: 'demo' })
  const [watchlists, setWatchlists] = useState<Record<string, string[]>>({})
  const [cachedRecords, setCachedRecords] = useState<ReadonlyMap<string, StoredScanRecord>>(() => new Map())
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [detail, setDetail] = useState<DetailRequest | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  const announce = useCallback((message: string) => {
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

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [savedSettings, allWatchlists, checkpoints] = await Promise.all([
          storage.loadSettings(),
          storage.loadAllWatchlists(),
          storage.loadSourceCheckpoints(),
        ])
        if (!active) return
        if (savedSettings) {
          setIdentity(savedSettings.identity)
          if (savedSettings.sourceMode) setSourceMode(savedSettings.sourceMode)
          const urlHasScenario = new URLSearchParams(window.location.search).has('skenario')
          if (!urlHasScenario) {
            sourceRegistry.store.set(savedSettings.scenario)
            setScenario(savedSettings.scenario)
          }
        }
        setWatchlists(allWatchlists)
        hydrateCheckpoints(checkpoints)
      } catch {
        if (active) announce('Data lokal belum dapat dipulihkan. Aplikasi akan memulai scan baru.')
      } finally {
        if (active) {
          setHydrated(true)
          await refreshStorageStats()
        }
      }
    })()
    return () => {
      active = false
    }
  }, [storage, sourceRegistry.store, hydrateCheckpoints, refreshStorageStats, announce])

  useEffect(() => {
    if (!hydrated) return
    void storage
      .saveSettings({
        identity,
        scenario,
        sourceMode,
        scanTtlMs: SCAN_TTL_MS,
      })
      .then(() => refreshStorageStats())
  }, [hydrated, identity, scenario, sourceMode, storage, refreshStorageStats])

  useEffect(() => {
    if (!hydrated || scanner.state.finishedAt === null) return
    const checkpoints = scanner.state.sources
      .filter((s) => s.lastSuccessAt !== null)
      .map((s) => ({
        sourceId: s.id,
        adapterVersion: s.adapterVersion,
        lastSuccessAt: s.lastSuccessAt,
        campaigns: s.campaigns,
        updatedAt: scanner.state.finishedAt ?? new Date().toISOString(),
      }))
    if (checkpoints.length > 0) {
      void storage.saveSourceCheckpoints(checkpoints).then(() => refreshStorageStats())
    }
  }, [hydrated, scanner.state.finishedAt, scanner.state.sources, storage, refreshStorageStats])

  useEffect(() => {
    let active = true
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

  useEffect(() => {
    if (scanner.state.finishedAt !== null) refreshNow()
  }, [scanner.state.finishedAt, refreshNow])

  useEffect(() => {
    document.title = `${TITLES[route]} · AirdropHunter`
  }, [route])

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
    sourceRegistry.store.set(next)
    setScenario(next)
  }

  const handleSourceModeChange = (next: SourceMode) => {
    setSourceMode(next)
    setDetail(null)
  }

  const handleExportBackup = useCallback(async (): Promise<string> => {
    const bundle = await storage.exportBackup()
    return JSON.stringify(bundle, null, 2)
  }, [storage])

  const handleImportBackup = useCallback(
    async (rawJson: string): Promise<ImportBackupResult> => {
      if (scanner.isRunning) {
        return { ok: false, message: 'Batalkan atau tunggu scan selesai sebelum mengimpor cadangan.' }
      }
      const result = await storage.importBackup(rawJson)
      if (result.ok) {
        setCachedRecords(new Map())
        setDetail(null)
        const [savedSettings, allWatchlists, checkpoints] = await Promise.all([
          storage.loadSettings(),
          storage.loadAllWatchlists(),
          storage.loadSourceCheckpoints(),
        ])
        if (savedSettings) {
          setIdentity(savedSettings.identity)
          if (savedSettings.sourceMode) setSourceMode(savedSettings.sourceMode)
          sourceRegistry.store.set(savedSettings.scenario)
          setScenario(savedSettings.scenario)
        } else {
          setIdentity({ kind: 'demo' })
          setSourceMode('all')
          sourceRegistry.store.set('normal')
          setScenario('normal')
        }
        setWatchlists(allWatchlists)
        scanner.hydrateCheckpoints(checkpoints, true)
        await refreshStorageStats()
        announce('Cadangan data lokal berhasil diimpor.')
      }
      return result
    },
    [storage, sourceRegistry.store, scanner, refreshStorageStats, announce],
  )

  const handleClearStorage = useCallback(async () => {
    if (scanner.isRunning) throw new Error('Batalkan atau tunggu scan selesai sebelum membersihkan cache.')
    await storage.clearAll()
    scanner.hydrateCheckpoints([], true)
    setWatchlists({})
    setCachedRecords(new Map())
    setDetail(null)
    await refreshStorageStats()
    announce('Cache IndexedDB lokal telah dibersihkan.')
  }, [storage, scanner, refreshStorageStats, announce])

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
          sourceMode={sourceMode}
          onScan={startScan}
          onOpenAccount={() => setAccountOpen(true)}
        />
        <div className="app__body">
          {isDesktop ? <Sidebar route={route} counts={counts} /> : null}
          <main id="main" className="main" ref={mainRef} tabIndex={-1}>
            <DemoBanner
              sourceMode={sourceMode}
              scenario={scenario}
              compact={!isDesktop}
              onSourceModeChange={handleSourceModeChange}
              onScenarioChange={handleScenarioChange}
            />
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
