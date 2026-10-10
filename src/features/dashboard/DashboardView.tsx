import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import type { Identity } from '../../domain/types'
import { ScanPanel } from '../scanner/ScanPanel'
import type { Scanner } from '../scanner/useScanner'
import { identityName } from '../wallet/identity'
import { CampaignResults, SkeletonResults } from './CampaignResults'
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
  announce: (message: string) => void
}

export function DashboardView({
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
  announce,
}: DashboardViewProps) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const visible = useMemo(() => applyFilters(rows, filters, now), [rows, filters, now])
  const counts = useMemo(() => countByLabel(rows, filters), [rows, filters])
  const networks = useMemo(() => networkOptions(rows, filters), [rows, filters])
  const name = identityName(identity)
  const sortText = SORT_OPTIONS.find((option) => option.value === filters.sort)?.caption ?? ''

  // Umumkan jumlah hasil setelah filter berubah (bukan setiap scan atau render).
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
      announce(`${visibleCountRef.current} campaign ditampilkan.`)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [filters, announce])

  const resetFilters = () => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })
  const { state, hasData, isRunning } = scanner

  let content
  if (!hasData && (isRunning || state.status === 'idle')) {
    content = <SkeletonResults tableLayout={tableLayout} />
  } else if (!hasData && state.status === 'failed') {
    content = (
      <EmptyState
        icon="alert"
        tone="error"
        title="Semua sumber DEMO gagal dihubungi"
        actions={
          <button type="button" className="btn btn--primary" onClick={onScan}>
            <Icon name="refresh" />
            Coba lagi
          </button>
        }
      >
        <p>Belum ada hasil yang bisa ditampilkan. Detail error tiap sumber ada di panel scan di atas.</p>
        <p className="muted">Skenario DEMO “Semua gagal” sengaja membuat setiap sumber gagal. Pilih “Normal” untuk memulihkan.</p>
      </EmptyState>
    )
  } else if (!hasData) {
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
        <p>Belum ada sumber yang selesai. Jalankan scan lagi untuk memuat campaign DEMO.</p>
      </EmptyState>
    )
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        icon="radar"
        title="Belum ada campaign dari sumber DEMO"
        actions={
          <button type="button" className="btn btn--primary" onClick={onScan}>
            <Icon name="radar" />
            Cari airdrop
          </button>
        }
      >
        <p>Sumber merespons tanpa campaign. Ini bukan berarti tidak ada airdrop di luar sumber yang didukung.</p>
        <p className="muted">Pada skenario DEMO “Kosong”, ganti ke “Normal” lalu jalankan Cari airdrop.</p>
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
            Campaign dari sumber DEMO, dilihat sebagai <strong>{name}</strong>.
          </p>
        </div>
      </div>

      <IdentityNotice identity={identity} onOpenAccount={onOpenAccount} />

      <ScanPanel scanner={scanner} now={now} compact={compactScan} onScan={onScan} />

      <section className="panel" aria-labelledby="campaigns-title">
        <div className="panel__head">
          <h2 id="campaigns-title" className="panel__title">
            Campaign
          </h2>
          {hasData ? (
            <span className="panel__count">
              {visible.length} dari {rows.length} ditampilkan
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
        <div className="panel__content" aria-busy={isRunning && !hasData}>
          {content}
        </div>
      </section>
    </div>
  )
}

function IdentityNotice({ identity, onOpenAccount }: { identity: Identity; onOpenAccount: () => void }) {
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
  return (
    <div className="notice notice--watch notice--block">
      <Icon name="eye" size={18} />
      <div>
        <p>
          <strong>Mode pantau · baca saja.</strong> Data DEMO hanya punya contoh kelayakan untuk Akun DEMO, jadi
          kelayakan alamat ini tampil “Belum diketahui”. Tidak ada koneksi wallet atau transaksi.
        </p>
      </div>
      <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenAccount}>
        Ganti akun
      </button>
    </div>
  )
}
