import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { getNetwork, isKnownChain } from '../../domain/networks'
import type { Identity } from '../../domain/types'
import { ScanPanel } from '../scanner/ScanPanel'
import type { Scanner } from '../scanner/useScanner'
import { identityKey, identityName } from '../wallet/identity'
import { CampaignResults, SkeletonResults } from './CampaignResults'
import { ClaimCostNotice } from './ClaimCostNotice'
import { FilterBar } from './FilterBar'
import {
  applyFilters,
  countByLabel,
  DEFAULT_FILTERS,
  hasActiveFilters,
  networkOptions,
  SORT_OPTIONS,
  type Filters,
} from './filtering'
import type { CampaignRow } from './rows'
import type { OpenHandler } from './RowParts'

interface DashboardViewProps {
  walletRewardsPanel?: ReactNode
  rows: readonly CampaignRow[]
  scanner: Scanner
  identity: Identity
  now: number
  tableLayout: boolean
  compactScan: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
  onOpen: OpenHandler
  onToggleWatch: (campaignId: string) => void
  onScan: () => void
  onOpenAccount: () => void
  onSwitchNetwork?: (targetChainId: number) => Promise<boolean>
  announce: (message: string) => void
}

export function DashboardView({
  walletRewardsPanel,
  rows,
  scanner,
  identity,
  now,
  tableLayout,
  compactScan,
  headingRef,
  onOpen,
  onToggleWatch,
  onScan,
  onOpenAccount,
  onSwitchNetwork,
  announce,
}: DashboardViewProps) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const query = useDeferredValue(filters.query)
  const activeFilters = useMemo(
    () => ({ query, label: filters.label, chainId: filters.chainId, sort: filters.sort }),
    [query, filters.label, filters.chainId, filters.sort],
  )
  const visible = useMemo(() => applyFilters(rows, activeFilters, now), [rows, activeFilters, now])
  const counts = useMemo(() => countByLabel(rows, activeFilters), [rows, activeFilters])
  const networks = useMemo(() => networkOptions(rows, activeFilters), [rows, activeFilters])
  const name = identityName(identity)
  const sortText = SORT_OPTIONS.find((option) => option.value === filters.sort)?.caption ?? ''

  const visibleCountRef = useRef(visible.length)
  useEffect(() => {
    visibleCountRef.current = visible.length
  }, [visible.length])
  const firstFilterRun = useRef(true)
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false
      return
    }
    const timer = window.setTimeout(() => {
      announce(`${visibleCountRef.current} campaign cocok.`)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [activeFilters, announce])

  const resetFilters = () => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })
  const { state, hasData, isRunning } = scanner

  let content
  if (!hasData && (isRunning || !scanner.isReady)) {
    content = <SkeletonResults tableLayout={tableLayout} />
  } else if (!hasData && state.status === 'failed') {
    content = (
      <EmptyState
        icon="alert"
        tone="error"
        title="Semua sumber aktif gagal dihubungi"
        actions={
          <button type="button" className="btn btn--primary" onClick={onScan}>
            <Icon name="refresh" />
            Coba lagi
          </button>
        }
      >
        <p>Belum ada hasil yang bisa ditampilkan. Detail error tiap sumber (termasuk bila ada pemblokiran CORS atau jaringan) ada di panel scan di atas.</p>
      </EmptyState>
    )
  } else if (!hasData && state.status === 'cancelled') {
    content = (
      <EmptyState
        icon="stop"
        title="Scan dibatalkan sebelum ada hasil"
        actions={
          <button type="button" className="btn btn--primary" onClick={onScan}>
            <Icon name="radar" />
            Cari airdrop
          </button>
        }
      >
        <p>Belum ada sumber yang selesai. Jalankan scan lagi untuk memuat campaign.</p>
      </EmptyState>
    )
  } else if (!hasData && state.status === 'idle') {
    content = (
      <EmptyState
        icon="radar"
        title="Belum ada hasil scan"
        actions={
          <button type="button" className="btn btn--primary" onClick={onScan}>
            <Icon name="radar" />
            Cari airdrop
          </button>
        }
      >
        <p>Jalankan Cari airdrop untuk memuat campaign dari sumber yang dipilih.</p>
      </EmptyState>
    )
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        icon="radar"
        title="Belum ada campaign dari sumber aktif"
        actions={
          <button type="button" className="btn btn--primary" onClick={onScan}>
            <Icon name="radar" />
            Cari airdrop
          </button>
        }
      >
        <p>Sumber merespons tanpa campaign. Ini bukan berarti tidak ada airdrop di luar sumber yang didukung.</p>
      </EmptyState>
    )
  } else if (visible.length === 0) {
    content = (
      <EmptyState
        icon="search"
        title="Tidak ada campaign yang cocok"
        actions={
          <button type="button" className="btn btn--secondary" onClick={resetFilters}>
            <Icon name="refresh" />
            Reset filter
          </button>
        }
      >
        <p>
          {filters.query.trim() !== '' ? `Pencarian “${filters.query.trim()}”` : 'Kombinasi filter ini'} tidak
          menghasilkan campaign untuk {name}.
        </p>
      </EmptyState>
    )
  } else {
    content = (
      <CampaignResults
        key={`${identityKey(identity)}:${JSON.stringify(activeFilters)}`}
        rows={visible}
        tableLayout={tableLayout}
        identityLabel={name}
        sortText={sortText}
        now={now}
        onOpen={onOpen}
        onToggleWatch={onToggleWatch}
      />
    )
  }

  return (
    <div className="view">
      <div className="view__head">
        <div>
          <h1 className="view__title" ref={headingRef} tabIndex={-1}>
            Dashboard
          </h1>
          <p className="view__sub">
            Campaign dari sumber yang didukung, dilihat sebagai <strong>{name}</strong>.
          </p>
        </div>
      </div>

      <IdentityNotice
        identity={identity}
        onOpenAccount={onOpenAccount}
        onSwitchNetwork={onSwitchNetwork}
      />

      <ScanPanel scanner={scanner} now={now} compact={compactScan} onScan={onScan} />
      <ClaimCostNotice rows={rows} />
      {walletRewardsPanel}

      <section className="panel" aria-labelledby="campaigns-title">
        <div className="panel__head">
          <h2 id="campaigns-title" className="panel__title">
            Campaign
          </h2>
          {hasData ? (
            <span className="panel__count">
              {visible.length} dari {rows.length} campaign
            </span>
          ) : null}
          {hasActiveFilters(filters) && visible.length > 0 ? (
            <button type="button" className="btn btn--ghost btn--xs panel__reset" onClick={resetFilters}>
              Reset filter
            </button>
          ) : null}
        </div>
        {hasData && rows.length > 0 ? (
          <FilterBar filters={filters} onChange={setFilters} counts={counts} networks={networks} />
        ) : null}
        <div className="panel__content" aria-busy={(isRunning && !hasData) || query !== filters.query}>
          {content}
        </div>
      </section>
    </div>
  )
}

function IdentityNotice({
  identity,
  onOpenAccount,
  onSwitchNetwork,
}: {
  identity: Identity
  onOpenAccount: () => void
  onSwitchNetwork?: (targetChainId: number) => Promise<boolean>
}) {
  if (identity.kind === 'demo') return null
  if (identity.kind === 'none') {
    return (
      <div className="notice notice--info notice--block">
        <Icon name="info" size={18} />
        <div>
          <p>
            <strong>Belum ada akun.</strong> Semua kelayakan tampil “Belum diketahui” sampai akun dipilih.
          </p>
        </div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenAccount}>
          Pilih akun
        </button>
      </div>
    )
  }
  if (identity.kind === 'metamask') {
    const net = getNetwork(identity.chainId)
    if (!isKnownChain(identity.chainId)) {
      return (
        <div className="notice notice--danger notice--block" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <p>
              <strong>Jaringan wallet tidak didukung (chain ID {identity.chainId}).</strong> Pindahkan MetaMask ke
              jaringan yang didukung seperti Ethereum, Base, Arbitrum, atau Sepolia.
            </p>
          </div>
          <div className="button-row">
            {onSwitchNetwork ? (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => void onSwitchNetwork(1)}
              >
                Pindah ke Ethereum
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenAccount}>
              Pengaturan akun
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="notice notice--info notice--block">
        <Icon name="wallet" size={18} />
        <div>
          <p>
            <strong>MetaMask terhubung ({net.name} · chain ID {identity.chainId}).</strong> Data DEMO dipisahkan dari
            wallet nyata. Distribusi gratis, eligibility, dan nilai pasar diperiksa terpisah; koneksi wallet belum menjamin reward dapat diklaim.
          </p>
        </div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenAccount}>
          Kelola akun
        </button>
      </div>
    )
  }
  return (
    <div className="notice notice--watch notice--block">
      <Icon name="eye" size={18} />
      <div>
        <p>
          <strong>Mode pantau · baca saja.</strong> Watchlist dan hasil scan alamat ini disimpan secara terpisah di
          IndexedDB lokal.
        </p>
      </div>
      <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenAccount}>
        Ganti akun
      </button>
    </div>
  )
}
