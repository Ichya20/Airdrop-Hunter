import type { SourceMode } from '../adapters/sources'
import { Icon } from '../components/Icon'
import { LogoMark } from '../components/Logo'
import type { Identity } from '../domain/types'
import type { Scanner } from '../features/scanner/useScanner'
import {
  identityModeText,
  identityName,
  isUnsupportedWalletChain,
  walletNetworkText,
} from '../features/wallet/identity'

interface AppHeaderProps {
  identity: Identity
  scanner: Scanner
  isDesktop: boolean
  sourceMode?: SourceMode
  onScan: () => void
  onOpenAccount: () => void
}

export function ScanButton({ scanner, onScan, className }: { scanner: Scanner; onScan: () => void; className?: string }) {
  const { isRunning, state } = scanner
  const active = state.sources.filter((source) => state.activeIds.includes(source.id))
  const finished = active.filter(
    (source) => source.phase === 'done' || source.phase === 'error' || source.phase === 'cancelled',
  ).length
  return (
    <button
      type="button"
      className={`btn btn--primary btn--cta${className ? ` ${className}` : ''}`}
      aria-disabled={isRunning}
      onClick={onScan}
    >
      {isRunning ? <span className="spinner spinner--ink" aria-hidden="true" /> : <Icon name="radar" />}
      <span>{isRunning ? `Memindai ${finished}/${active.length}` : 'Cari airdrop'}</span>
    </button>
  )
}

export function AppHeader({
  identity,
  scanner,
  isDesktop,
  sourceMode = 'all',
  onScan,
  onOpenAccount,
}: AppHeaderProps) {
  const unsupportedNet = isUnsupportedWalletChain(identity)

  return (
    <header className="appbar">
      <a className="brand" href="#/">
        <LogoMark />
        <span className="brand__name">AirdropHunter</span>
        {sourceMode !== 'demo' ? <span className="origin origin--live brand__demo">LIVE</span> : null}
        {sourceMode !== 'live' ? <span className="origin origin--demo brand__demo">DEMO</span> : null}
      </a>

      <div className="appbar__actions">
        {isDesktop ? (
          <div
            className={`netchip${unsupportedNet ? ' netchip--warn' : ''}`}
            role="group"
            aria-label="Jaringan wallet"
          >
            <Icon name={unsupportedNet ? 'alert' : 'globe'} size={16} />
            <span className="netchip__label">Jaringan</span>
            <span className="netchip__value">{walletNetworkText(identity)}</span>
          </div>
        ) : null}
        <button
          type="button"
          className={`account-btn account-btn--${identity.kind}`}
          aria-haspopup="dialog"
          onClick={onOpenAccount}
        >
          <Icon name={identity.kind === 'watch' ? 'eye' : 'wallet'} />
          <span className="account-btn__text">
            <span className="account-btn__name">{identityName(identity)}</span>
            {isDesktop ? <span className="account-btn__mode">{identityModeText(identity)}</span> : null}
          </span>
          <Icon name="chevronDown" size={16} />
        </button>
        {isDesktop ? <ScanButton scanner={scanner} onScan={onScan} /> : null}
      </div>
    </header>
  )
}
