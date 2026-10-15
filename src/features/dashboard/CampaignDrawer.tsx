import { useEffect, useRef, useState, type RefObject } from 'react'
import { Monogram, NetworkTag, OriginBadge, StatusBadge } from '../../components/Badges'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { describeDeadline, formatDateTime } from '../../domain/format'
import {
  CAMPAIGN_STATUS_TEXT,
  ELIGIBILITY_TEXT,
  explainLabel,
  KIND_TEXT,
  TX_TEXT,
} from '../../domain/status'
import type { Campaign, Identity } from '../../domain/types'
import { ClaimPreview } from '../claims/ClaimPreview'
import { identityName } from '../wallet/identity'
import { EligibilityCheck } from './EligibilityCheck'
import type { DetailRequest, DetailView } from './intent'
import type { CampaignRow } from './rows'

interface CampaignDrawerProps {
  request: DetailRequest | null
  row: CampaignRow | null
  identity: Identity
  now: number
  sourceNames: ReadonlyMap<string, string>
  onClose: () => void
  onToggleWatch: (campaignId: string) => void
  onSwitchNetwork?: (targetChainId: number) => Promise<boolean>
  eligibilityBusy: boolean
  onRecheckEligibility: (campaign: Campaign, proofJson?: string) => Promise<void>
}

export function CampaignDrawer({
  request,
  row,
  identity,
  now,
  sourceNames,
  onClose,
  onToggleWatch,
  onSwitchNetwork,
  eligibilityBusy,
  onRecheckEligibility,
}: CampaignDrawerProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const requirementsRef = useRef<HTMLHeadingElement>(null)
  const txRef = useRef<HTMLHeadingElement>(null)
  const claimRef = useRef<HTMLHeadingElement>(null)

  let initialFocusRef: RefObject<HTMLHeadingElement | null> = titleRef
  if (request && row) {
    if (request.view === 'claim') initialFocusRef = claimRef
    else if (request.focus === 'requirements') initialFocusRef = requirementsRef
    else if (request.focus === 'tx') initialFocusRef = txRef
  }

  return (
    <Dialog
      open={request !== null}
      onClose={onClose}
      labelledBy="detail-title"
      variant="drawer"
      initialFocusRef={initialFocusRef}
    >
      {request && row ? (
        <DetailContent
          key={row.campaign.id}
          row={row}
          identity={identity}
          now={now}
          initialView={request.view}
          sourceNames={sourceNames}
          titleRef={titleRef}
          requirementsRef={requirementsRef}
          txRef={txRef}
          claimRef={claimRef}
          onClose={onClose}
          onToggleWatch={onToggleWatch}
          onSwitchNetwork={onSwitchNetwork}
          eligibilityBusy={eligibilityBusy}
          onRecheckEligibility={onRecheckEligibility}
        />
      ) : (
        <MissingContent titleRef={titleRef} onClose={onClose} />
      )}
    </Dialog>
  )
}

function MissingContent({
  titleRef,
  onClose,
}: {
  titleRef: RefObject<HTMLHeadingElement | null>
  onClose: () => void
}) {
  return (
    <div className="detail">
      <header className="dialog__head">
        <h2 id="detail-title" className="dialog__title" ref={titleRef} tabIndex={-1}>
          Campaign tidak tersedia
        </h2>
        <button type="button" className="icon-btn" aria-label="Tutup detail" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="dialog__body">
        <p>Campaign ini tidak ada di hasil scan terbaru. Tutup panel lalu jalankan Cari airdrop untuk memuat ulang.</p>
      </div>
    </div>
  )
}

interface DetailContentProps {
  row: CampaignRow
  identity: Identity
  now: number
  initialView: DetailView
  sourceNames: ReadonlyMap<string, string>
  titleRef: RefObject<HTMLHeadingElement | null>
  requirementsRef: RefObject<HTMLHeadingElement | null>
  txRef: RefObject<HTMLHeadingElement | null>
  claimRef: RefObject<HTMLHeadingElement | null>
  onClose: () => void
  onToggleWatch: (campaignId: string) => void
  onSwitchNetwork?: (targetChainId: number) => Promise<boolean>
  eligibilityBusy: boolean
  onRecheckEligibility: (campaign: Campaign, proofJson?: string) => Promise<void>
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function DetailContent({
  row,
  identity,
  now,
  initialView,
  sourceNames,
  titleRef,
  requirementsRef,
  txRef,
  claimRef,
  onClose,
  onToggleWatch,
  onSwitchNetwork,
  eligibilityBusy,
  onRecheckEligibility,
}: DetailContentProps) {
  const { campaign, eligibility, tx, label, action, network } = row
  const [view, setView] = useState<DetailView>(initialView)
  const [notice, setNotice] = useState<string | null>(null)
  const name = identityName(identity)
  const deadline = describeDeadline(campaign.deadline, now)
  const isDemo = campaign.origin === 'demo'

  const previousView = useRef(view)
  useEffect(() => {
    if (previousView.current === view) return
    previousView.current = view
    const target = view === 'claim' ? claimRef.current : titleRef.current
    target?.focus()
  }, [view, claimRef, titleRef])

  const openOrExplainLink = (kind: 'situs resmi' | 'checker resmi' | 'situs klaim resmi', url: string | null) => {
    if (url === null) {
      setNotice(`Sumber belum menyediakan ${kind} yang terverifikasi. Jangan memakai tautan dari agregator untuk menghubungkan wallet.`)
      return
    }
    if (isDemo || hostOf(url).endsWith('.example')) {
      setNotice(
        `Tautan DEMO (${hostOf(url)}) tidak dibuka karena bukan situs nyata. Pada campaign LIVE, tombol ini membuka ${kind} di tab baru.`,
      )
      return
    }
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    setNotice(
      `Membuka ${kind} (${hostOf(url)}) di tab baru. Selalu periksa kembali domain resmi sebelum menghubungkan wallet.`,
    )
  }

  const focusTx = () => {
    txRef.current?.focus()
    setNotice(
      tx?.hash
        ? null
        : 'Fixture DEMO tidak memiliki hash atau tautan explorer. Status klaim nyata diperiksa dari receipt dan state on-chain (tahap 5).',
    )
  }

  const renderPrimary = () => {
    switch (action.kind) {
      case 'claim':
        return (
          <button type="button" className="btn btn--primary" onClick={() => {
            void onRecheckEligibility(campaign)
            setView('claim')
          }}>
            <Icon name="send" />
            Klaim
          </button>
        )
      case 'claim_site':
        return (
          <button type="button" className="btn btn--primary" onClick={() => {
            void onRecheckEligibility(campaign)
            openOrExplainLink('situs klaim resmi', campaign.officialUrl)
          }}>
            <Icon name="external" />
            Buka situs klaim resmi
          </button>
        )
      case 'requirements':
        return (
          <button type="button" className="btn btn--secondary" onClick={() => openOrExplainLink('situs resmi', campaign.officialUrl)}>
            <Icon name="external" />
            Buka situs resmi
          </button>
        )
      case 'check':
        if (!campaign.sourceVerified) {
          return (
            <button type="button" className="btn btn--secondary" onClick={() => openOrExplainLink('situs resmi', campaign.officialUrl)}>
              <Icon name="shield" />
              Periksa sumber
            </button>
          )
        }
        if (campaign.checkerUrl !== null) {
          return (
            <button type="button" className="btn btn--secondary" onClick={() => openOrExplainLink('checker resmi', campaign.checkerUrl)}>
              <Icon name="external" />
              Buka checker resmi
            </button>
          )
        }
        return (
          <button
            type="button"
            className="btn btn--secondary"
            disabled={eligibilityBusy}
            onClick={() => void onRecheckEligibility(campaign)}
          >
            <Icon name="help" />
            Periksa kelayakan
          </button>
        )
      case 'tx':
        return (
          <button type="button" className="btn btn--secondary" onClick={focusTx}>
            <Icon name="list" />
            Lihat transaksi
          </button>
        )
      case 'reason':
        return (
          <button type="button" className="btn btn--secondary" onClick={() => openOrExplainLink('situs resmi', campaign.officialUrl)}>
            <Icon name="external" />
            Buka situs resmi
          </button>
        )
      case 'archive':
        return (
          <>
            <span className="foot-note">
              <Icon name="archive" size={16} />
              Klaim dinonaktifkan
            </span>
            {campaign.checkerUrl ? (
              <button type="button" className="btn btn--secondary" onClick={() => openOrExplainLink('checker resmi', campaign.checkerUrl)}>
                <Icon name="external" />
                Bukti dokumentasi
              </button>
            ) : (
              <button type="button" className="btn btn--secondary" onClick={() => openOrExplainLink('situs resmi', campaign.officialUrl)}>
                <Icon name="external" />
                Buka situs resmi
              </button>
            )}
          </>
        )
    }
  }

  return (
    <div className="detail" data-label={label}>
      <header className="dialog__head detail__head">
        <Monogram name={campaign.project} size="lg" />
        <div className="detail__heading">
          <p className="eyebrow">
            {campaign.project} · {KIND_TEXT[campaign.kind]}
          </p>
          <h2 id="detail-title" className="dialog__title" ref={titleRef} tabIndex={-1}>
            {campaign.name}
          </h2>
          <div className="detail__badges">
            <OriginBadge origin={campaign.origin} sourceKind={campaign.sourceKind} />
            <NetworkTag network={network} />
            {row.stale ? <span className="tag tag--warning">Data lama</span> : null}
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label="Tutup detail" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      <div className="dialog__body">
        {view === 'claim' ? (
          <ClaimPreview
            row={row}
            identity={identity}
            now={now}
            headingRef={claimRef}
            onSwitchNetwork={onSwitchNetwork}
          />
        ) : (
          <div className="detail__sections">
            <section className="detail__summary" aria-label="Ringkasan status">
              <StatusBadge label={label} size="lg" />
              <p>{explainLabel(label, campaign, eligibility, name)}</p>
              {campaign.summary ? <p className="muted">{campaign.summary}</p> : null}
              {isDemo ? (
                <p className="notice notice--demo">
                  <Icon name="flask" size={16} />
                  <span>Data fixture DEMO: bukan bukti campaign, alokasi, atau kontrak nyata.</span>
                </p>
              ) : (
                <p className="notice notice--info">
                  <Icon name="globe" size={16} />
                  <span>
                    {campaign.sourceKind === 'local-archive'
                      ? 'Arsip referensi lokal. Label Berakhir berarti entri diarsipkan dalam aplikasi dan klaim dinonaktifkan. Hasil eligibility untuk alamat aktif ditampilkan terpisah di bawah.'
                      : `Metadata LIVE dari ${campaign.foundIn.map((id) => sourceNames.get(id) ?? id).join(', ')}. Belum menjadi bukti eligibility atau hak klaim wallet.`}
                  </span>
                </p>
              )}
            </section>

            <section aria-labelledby="detail-status-title">
              <h3 id="detail-status-title" className="section-title">
                Status terpisah
              </h3>
              <dl className="status-grid">
                <div>
                  <dt>Campaign</dt>
                  <dd className="status-grid__value">{CAMPAIGN_STATUS_TEXT[campaign.status]}</dd>
                  <dd className="status-grid__sub">{campaign.sourceKind === 'local-archive' ? 'Arsip lokal aplikasi · klaim dinonaktifkan' : 'Menurut sumber'}</dd>
                </div>
                <div>
                  <dt>Eligibility · {name}</dt>
                  <dd className="status-grid__value">{ELIGIBILITY_TEXT[eligibility.status]}</dd>
                  <dd className="status-grid__sub">{eligibility.reason}</dd>
                </div>
                <div>
                  <dt>Transaksi</dt>
                  <dd className="status-grid__value">{tx ? TX_TEXT[tx.status] : TX_TEXT.not_sent}</dd>
                  <dd className="status-grid__sub">{tx ? 'Tercatat' : 'Belum ada transaksi klaim'}</dd>
                </div>
              </dl>
              <p className="meta-line">
                <Icon name="clock" size={14} />
                Eligibility: {eligibility.source}
                {eligibility.rule ? ` · aturan ${eligibility.rule}` : ''}
                {eligibility.checkedAt ? ` · diperiksa ${formatDateTime(eligibility.checkedAt)}` : ' · belum diperiksa'}
              </p>
              {row.eligibilityStale ? <p className="warn-text small">Hasil eligibility usang; periksa ulang sebelum mengandalkannya.</p> : null}
            </section>

            <EligibilityCheck
              campaign={campaign}
              identity={identity}
              result={eligibility}
              busy={eligibilityBusy}
              stale={row.eligibilityStale}
              onRecheck={(proofJson) => onRecheckEligibility(campaign, proofJson)}
            />

            <section aria-labelledby="detail-source-title">
              <h3 id="detail-source-title" className="section-title">
                Sumber dan jaringan
              </h3>
              <dl className="kv">
                <div>
                  <dt>Sumber resmi</dt>
                  <dd>
                    {campaign.officialUrl ? (
                      isDemo ? (
                        <span className="mono break">{hostOf(campaign.officialUrl)}</span>
                      ) : (
                        <a
                          href={campaign.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono break"
                        >
                          {hostOf(campaign.officialUrl)}
                        </a>
                      )
                    ) : (
                      'Belum ditemukan'
                    )}
                    {isDemo && campaign.officialUrl ? <span className="muted"> · domain fixture, tidak dibuka</span> : null}
                  </dd>
                </div>
                {campaign.checkerUrl ? (
                  <div>
                    <dt>Checker / Dokumen resmi</dt>
                    <dd>
                      {isDemo ? (
                        <span className="mono break">{hostOf(campaign.checkerUrl)}</span>
                      ) : (
                        <a
                          href={campaign.checkerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono break"
                        >
                          {campaign.checkerUrl}
                        </a>
                      )}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Bukti sumber</dt>
                  <dd>
                    <span className={campaign.sourceVerified ? 'ok-text' : 'warn-text'}>
                      {campaign.sourceVerified ? 'Diperiksa' : 'Belum terverifikasi'}
                    </span>{' '}
                    · {campaign.sourceEvidence}
                  </dd>
                </div>
                <div>
                  <dt>Asal informasi</dt>
                  <dd>{campaign.sourceKind === 'local-archive' ? 'Katalog arsip lokal' : campaign.foundIn.map((id) => sourceNames.get(id) ?? id).join(', ')}</dd>
                </div>
                <div>
                  <dt>Jaringan</dt>
                  <dd>
                    {network.name}
                    {network.testnet ? ' (testnet)' : ''} · <span className="mono">chain ID {network.chainId}</span>
                  </dd>
                </div>
                <div>
                  <dt>Kontrak</dt>
                  <dd>
                    {campaign.contract ? (
                      <span className="mono break">{campaign.contract.address}</span>
                    ) : isDemo ? (
                      'Tidak ada (fixture DEMO)'
                    ) : (
                      'Belum ada kontrak klaim terverifikasi'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{campaign.sourceKind === 'local-archive' ? 'Waktu arsip dimuat' : 'Waktu cek sumber'}</dt>
                  <dd>
                    <time dateTime={campaign.checkedAt}>{formatDateTime(campaign.checkedAt)}</time> · adapter{' '}
                    <span className="mono">{campaign.adapterVersion}</span>
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="detail-deadline-title">
              <h3 id="detail-deadline-title" className="section-title">
                Tenggat dan alokasi
              </h3>
              <dl className="kv">
                <div>
                  <dt>Tenggat</dt>
                  <dd>
                    {deadline.known && campaign.deadline ? formatDateTime(campaign.deadline) : 'Belum diketahui'}
                    <span className={deadline.urgent ? 'warn-text' : 'muted'}> · {deadline.hint}</span>
                    {!deadline.known ? (
                      <span className="muted block">Jangan menganggap klaim terbuka selamanya.</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Alokasi</dt>
                  <dd>{campaign.allocation ?? 'Tidak diketahui'}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="detail-req-title">
              <h3 id="detail-req-title" className="section-title" ref={requirementsRef} tabIndex={-1}>
                Persyaratan
              </h3>
              {campaign.requirements.length > 0 ? (
                <ul className="reqs">
                  {campaign.requirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Sumber tidak mencantumkan persyaratan.</p>
              )}
              <p className="muted small">Persyaratan tidak menjamin hadiah. Ikuti hanya instruksi dari sumber resmi.</p>
            </section>

            <section aria-labelledby="detail-tx-title">
              <h3 id="detail-tx-title" className="section-title" ref={txRef} tabIndex={-1}>
                Transaksi
              </h3>
              {tx ? (
                <dl className="kv">
                  <div>
                    <dt>Status</dt>
                    <dd>{TX_TEXT[tx.status]}</dd>
                  </div>
                  <div>
                    <dt>Hash</dt>
                    <dd>{tx.hash ? <span className="mono break">{tx.hash}</span> : 'Tidak ada (fixture DEMO)'}</dd>
                  </div>
                  <div>
                    <dt>Bukti</dt>
                    <dd>{tx.proof ?? 'Belum ada bukti klaim atau receipt.'}</dd>
                  </div>
                  {tx.updatedAt ? (
                    <div>
                      <dt>Diperbarui</dt>
                      <dd>{formatDateTime(tx.updatedAt)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Catatan</dt>
                    <dd>{tx.note}</dd>
                  </div>
                </dl>
              ) : (
                <p className="muted">Belum ada transaksi klaim untuk {name}.</p>
              )}
            </section>
          </div>
        )}
      </div>

      <footer className="dialog__foot">
        <div className="dialog__notice" role="status">
          {notice !== null ? (
            <p className="notice notice--info">
              <Icon name="info" size={16} />
              <span>{notice}</span>
            </p>
          ) : null}
        </div>
        {view === 'claim' ? (
          <div className="button-row">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setNotice(null)
                setView('info')
              }}
            >
              <Icon name="chevronLeft" />
              Kembali ke detail
            </button>
            <button
              type="button"
              className="btn btn--primary btn--blocked"
              aria-disabled="true"
              aria-describedby="claim-blocked-reason"
              onClick={() =>
                setNotice(
                  'Tidak ada yang dikirim. Klaim testnet dengan simulasi kontrak dan receipt diaktifkan di tahap 5.',
                )
              }
            >
              <Icon name="send" />
              Kirim lewat MetaMask
            </button>
            <span id="claim-blocked-reason" className="sr-only">
              Klaim kontrak diaktifkan di tahap 5.
            </span>
          </div>
        ) : (
          <div className="button-row">
            {renderPrimary()}
            <button
              type="button"
              className={`btn btn--ghost watch-toggle${row.watched ? ' watch--on' : ''}`}
              aria-pressed={row.watched}
              onClick={() => onToggleWatch(campaign.id)}
            >
              <Icon name={row.watched ? 'starFilled' : 'star'} />
              {row.watched ? 'Di watchlist' : 'Simpan di watchlist'}
            </button>
          </div>
        )}
      </footer>
    </div>
  )
}
