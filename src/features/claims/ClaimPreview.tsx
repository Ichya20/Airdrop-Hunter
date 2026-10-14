import type { RefObject } from 'react'
import { Icon, type IconName } from '../../components/Icon'
import type { Identity } from '../../domain/types'
import type { CampaignRow } from '../dashboard/rows'

import { buildChecks, type CheckState } from './preClaimChecks'

const CHECK_ICON: Record<CheckState, IconName> = {
  ok: 'checkCircle',
  warn: 'alert',
  fail: 'xCircle',
}

const CHECK_TEXT: Record<CheckState, string> = {
  ok: 'Lolos',
  warn: 'Perlu perhatian',
  fail: 'Tidak lolos',
}


interface ClaimPreviewProps {
  row: CampaignRow
  identity: Identity
  now: number
  headingRef: RefObject<HTMLHeadingElement | null>
  onSwitchNetwork?: (targetChainId: number) => Promise<boolean>
}

/** Preview klaim. Tidak membuat payload transaksi untuk fixture DEMO. */
export function ClaimPreview({ row, identity, now, headingRef, onSwitchNetwork }: ClaimPreviewProps) {
  const { campaign, network } = row
  const checks = buildChecks(row, identity, now)
  const blocking = checks.filter((check) => check.state === 'fail').length
  const wrongNetwork = identity.kind === 'metamask' && identity.chainId !== network.chainId

  return (
    <div className="claim">
      <h3 className="section-title section-title--lg" ref={headingRef} tabIndex={-1}>
        Preview klaim
      </h3>
      <p className="notice notice--demo">
        <Icon name="flask" size={16} />
        <span>
          Data campaign masih berasal dari fixture DEMO: tidak ada transaksi yang dikirim ke jaringan. Preview ini
          memeriksa kesiapan akun, jaringan MetaMask, dan syarat pra-klaim.
        </span>
      </p>

      {wrongNetwork && onSwitchNetwork ? (
        <div className="notice notice--danger" role="alert">
          <Icon name="alert" size={16} />
          <div>
            <p>
              <strong>Jaringan MetaMask tidak cocok.</strong> Pindahkan jaringan wallet ke {network.name} (chain ID{' '}
              {network.chainId}) sebelum melanjutkan.
            </p>
            <div className="button-row" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn--secondary btn--xs"
                onClick={() => void onSwitchNetwork(network.chainId)}
              >
                <Icon name="globe" size={14} />
                Pindahkan MetaMask ke {network.name}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="claim-checks-title">
        <h4 id="claim-checks-title" className="section-title">
          Pemeriksaan sebelum klaim
          <span className="section-title__meta">{blocking} menghambat</span>
        </h4>
        <ul className="checks">
          {checks.map((check) => (
            <li key={check.label} className={`check check--${check.state}`}>
              <Icon name={CHECK_ICON[check.state]} size={18} />
              <div>
                <p className="check__label">
                  {check.label} <span className="check__state">· {CHECK_TEXT[check.state]}</span>
                </p>
                <p className="check__text">{check.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="claim-tx-title">
        <h4 id="claim-tx-title" className="section-title">
          Detail transaksi
        </h4>
        <dl className="kv">
          <div>
            <dt>Jaringan</dt>
            <dd>
              {network.name} · <span className="mono">chain ID {network.chainId}</span>
            </dd>
          </div>
          <div>
            <dt>Kontrak</dt>
            <dd>
              {campaign.contract ? (
                <span className="mono">{campaign.contract.address}</span>
              ) : (
                'Tidak ada. Fixture DEMO tidak memiliki alamat kontrak.'
              )}
            </dd>
          </div>
          <div>
            <dt>Fungsi dan argumen</dt>
            <dd>Belum ada ABI terverifikasi; payload tidak dibuat.</dd>
          </div>
          <div>
            <dt>Penerima</dt>
            <dd>
              {identity.kind === 'watch' || identity.kind === 'metamask' ? (
                <span className="mono">{identity.address}</span>
              ) : identity.kind === 'demo' ? (
                'Akun DEMO (bukan alamat nyata)'
              ) : (
                'Belum ada akun'
              )}
            </dd>
          </div>
          <div>
            <dt>Token / jumlah</dt>
            <dd>{campaign.allocation ?? 'Tidak dapat diverifikasi dari data DEMO.'}</dd>
          </div>
          <div>
            <dt>Estimasi biaya</dt>
            <dd>Tidak tersedia: simulasi kontrak dan estimasi gas diaktifkan di tahap 5.</dd>
          </div>
          <div>
            <dt>Izin token</dt>
            <dd>Tidak ada approval, Permit, atau transfer aset lain yang diminta.</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
