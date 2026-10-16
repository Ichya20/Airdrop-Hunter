import { useId, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react'
import { useMediaQuery } from '../../app/hooks'
import { AddressText } from '../../components/AddressText'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { checkAddressInput, looksLikeSecret } from '../../domain/address'
import { getNetwork, isKnownChain, KNOWN_NETWORKS } from '../../domain/networks'
import type { HexAddress, Identity } from '../../domain/types'
import type { ImportBackupResult, StorageStats } from '../../storage/types'
import { identityModeText, identityName } from './identity'
import type { MetaMaskPresence } from './useMetaMaskDetection'
import type { MetaMaskWalletController } from './useMetaMaskWallet'

interface AccountDialogProps {
  open: boolean
  identity: Identity
  wallet: MetaMaskWalletController
  storageStats: StorageStats | null
  allowDemo?: boolean
  onClose: () => void
  onSelectDemo: () => void
  onWatch: (address: HexAddress) => void
  onClear: () => void
  onExportBackup: () => Promise<string>
  onImportBackup: (rawJson: string) => Promise<ImportBackupResult>
  onClearStorage: () => Promise<void>
}

export function AccountDialog(props: AccountDialogProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      labelledBy="account-title"
      variant="modal"
      initialFocusRef={titleRef}
    >
      <AccountContent {...props} titleRef={titleRef} />
    </Dialog>
  )
}

const PRESENCE_TEXT: Record<MetaMaskPresence, string> = {
  checking: 'Memeriksa pengumuman provider EIP-6963…',
  detected: 'MetaMask terdeteksi di browser ini.',
  not_detected: 'MetaMask tidak terdeteksi di browser ini.',
}

function AccountContent({
  identity,
  wallet,
  storageStats,
  allowDemo = false,
  onClose,
  onSelectDemo,
  onWatch,
  onClear,
  onExportBackup,
  onImportBackup,
  onClearStorage,
  titleRef,
}: AccountDialogProps & { titleRef: RefObject<HTMLHeadingElement | null> }) {
  const { presence, phase, error: walletError } = wallet
  const coarsePointer = useMediaQuery('(pointer: coarse)')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [storageNotice, setStorageNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ids = useId()
  const inputId = `${ids}-address`
  const hintId = `${ids}-hint`
  const errorId = `${ids}-error`
  const netSelectId = `${ids}-net-select`

  const handleChange = (next: string) => {
    // Rahasia wallet tidak disimpan: kolom langsung dikosongkan.
    if (looksLikeSecret(next) !== null) {
      setValue('')
      const check = checkAddressInput(next)
      setError(check.ok ? null : check.message)
      return
    }
    setValue(next)
    if (error !== null) setError(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const check = checkAddressInput(value)
    if (!check.ok) {
      if (check.kind === 'secret') setValue('')
      setError(check.message)
      inputRef.current?.focus()
      return
    }
    setError(null)
    onWatch(check.address)
  }

  const handleExport = async () => {
    try {
      const json = await onExportBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `airdrop-hunter-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      setStorageNotice({
        tone: 'info',
        text: 'File cadangan (.json) berhasil diunduh.',
      })
    } catch {
      setStorageNotice({
        tone: 'danger',
        text: 'Gagal mengekspor cadangan data lokal.',
      })
    }
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const rawText = await file.text()
      const result = await onImportBackup(rawText)
      if (!result.ok) {
        setStorageNotice({ tone: 'danger', text: result.message })
        return
      }
      setStorageNotice({
        tone: 'info',
        text: `Cadangan berhasil dipulihkan (${result.importedWatchlists} watchlist, ${result.importedScanRecords} catatan scan, skema v${result.migratedFromVersion}).`,
      })
    } catch {
      setStorageNotice({
        tone: 'danger',
        text: 'Gagal membaca file cadangan yang dipilih.',
      })
    }
  }

  const handleClearStorage = async () => {
    try {
      await onClearStorage()
      setStorageNotice({ tone: 'info', text: 'Seluruh data IndexedDB lokal telah dibersihkan.' })
    } catch (cause: unknown) {
      setStorageNotice({
        tone: 'danger',
        text: cause instanceof Error ? cause.message : 'Data lokal belum dapat dibersihkan. Coba lagi.',
      })
    }
  }

  const isConnecting = phase === 'connecting'
  const isSwitching = phase === 'switching_network'
  const unsupportedChain = identity.kind === 'metamask' && !isKnownChain(identity.chainId)

  return (
    <div className="account">
      <header className="dialog__head">
        <div>
          <p className="eyebrow">Akun lokal</p>
          <h2 id="account-title" className="dialog__title" ref={titleRef} tabIndex={-1}>
            Akun, jaringan, dan data lokal
          </h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup dialog akun">
          <Icon name="close" />
        </button>
      </header>

      <div className="dialog__body account__body">
        <div className="account__current">
          <span className="account__current-label">Saat ini</span>
          <strong>{identityName(identity)}</strong>
          <span className="muted">{identityModeText(identity)}</span>
          {identity.kind === 'watch' || identity.kind === 'metamask' ? (
            <AddressText address={identity.address} />
          ) : null}
        </div>

        <section className="account__section" aria-labelledby={`${ids}-mm`}>
          <h3 id={`${ids}-mm`} className="account__heading">
            <Icon name="wallet" />
            MetaMask Chrome extension · laptop
          </h3>
          <p className="muted">
            Satu-satunya wallet yang didukung. Koneksi hanya membaca alamat publik dan chain ID tanpa meminta tanda
            tangan. Tidak ada WalletConnect atau wallet mobile.
          </p>
          <p className={`detect detect--${presence}`}>
            <Icon name={presence === 'detected' ? 'checkCircle' : presence === 'checking' ? 'clock' : 'info'} size={16} />
            <span>
              {PRESENCE_TEXT[presence]}{' '}
              <span className="muted">Deteksi melalui pengumuman EIP-6963.</span>
            </span>
          </p>

          {identity.kind === 'metamask' ? (
            <div className="field">
              <label htmlFor={netSelectId} className="field__label">
                Jaringan wallet aktif
              </label>
              <div className="button-row">
                <select
                  id={netSelectId}
                  className="select select--sm"
                  value={isKnownChain(identity.chainId) ? identity.chainId : ''}
                  disabled={isSwitching}
                  onChange={(event) => {
                    const nextChainId = Number(event.target.value)
                    if (Number.isInteger(nextChainId) && nextChainId > 0) {
                      void wallet.switchNetwork(nextChainId)
                    }
                  }}
                >
                  {!isKnownChain(identity.chainId) ? (
                    <option value="" disabled>
                      Tidak didukung (chain ID {identity.chainId})
                    </option>
                  ) : null}
                  {KNOWN_NETWORKS.map((net) => (
                    <option key={net.chainId} value={net.chainId}>
                      {net.name} (chain ID {net.chainId}){net.testnet ? ' · Testnet' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => void wallet.disconnect()}
                >
                  <Icon name="logout" />
                  Putuskan MetaMask
                </button>
              </div>
              {unsupportedChain ? (
                <div className="notice notice--danger" role="alert">
                  <Icon name="alert" size={16} />
                  <div>
                    <p>
                      <strong>Jaringan belum didukung ({getNetwork(identity.chainId).name}).</strong> Pilih salah satu
                      jaringan yang didukung di atas untuk memindahkan jaringan di MetaMask.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="button-row">
              <button
                type="button"
                className="btn btn--primary"
                aria-disabled={isConnecting}
                onClick={() => {
                  if (!isConnecting) void wallet.connect()
                }}
              >
                {isConnecting ? <span className="spinner spinner--ink" aria-hidden="true" /> : <Icon name="wallet" />}
                <span>{isConnecting ? 'Menghubungkan…' : 'Hubungkan MetaMask'}</span>
              </button>
              {allowDemo ? <button
                type="button"
                className="btn btn--ghost"
                aria-pressed={identity.kind === 'demo'}
                onClick={onSelectDemo}
              >
                <Icon name="flask" />
                {identity.kind === 'demo' ? 'Akun DEMO aktif' : 'Gunakan Akun DEMO'}
              </button> : null}
            </div>
          )}

          {walletError !== null ? (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" size={16} />
              <div>
                <p>{walletError.message}</p>
                {walletError.recoverable ? (
                  <div className="button-row" style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn--secondary btn--xs"
                      onClick={() => void wallet.connect()}
                    >
                      <Icon name="refresh" size={14} />
                      Coba lagi
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--xs"
                      onClick={wallet.clearError}
                    >
                      Tutup pesan
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="account__section" aria-labelledby={`${ids}-watch`}>
          <h3 id={`${ids}-watch`} className="account__heading">
            <Icon name="eye" />
            Mode pantau · HP & alamat publik
          </h3>
          <p className="muted">
            Masukkan alamat publik untuk dibaca saja. Tidak ada koneksi wallet, tanda tangan, atau transaksi.
          </p>
          {coarsePointer ? (
            <p className="notice notice--info">
              <Icon name="info" size={16} />
              <span>Perangkat sentuh terdeteksi. Gunakan mode pantau di sini; klaim tetap melalui Chrome laptop.</span>
            </p>
          ) : null}
          <form className="field" onSubmit={handleSubmit} noValidate>
            <label htmlFor={inputId} className="field__label">
              Alamat publik EVM
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className="input mono"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="0x…"
              value={value}
              onChange={(event) => handleChange(event.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? `${hintId} ${errorId}` : hintId}
            />
            <p id={hintId} className="field__hint">
              Format 0x + 40 karakter heksadesimal (checksum EIP-55). Jangan pernah memasukkan seed phrase atau private key.
            </p>
            {error !== null ? (
              <p id={errorId} className="field__error" role="alert">
                <Icon name="alert" size={16} />
                <span>{error}</span>
              </p>
            ) : null}
            <div className="button-row">
              <button type="submit" className="btn btn--secondary">
                <Icon name="eye" />
                Pantau alamat
              </button>
              {allowDemo && identity.kind !== 'demo' ? (
                <button type="button" className="btn btn--ghost" onClick={onSelectDemo}>
                  <Icon name="flask" />
                  Gunakan Akun DEMO
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <details className="account__section">
          <summary id={`${ids}-storage`} className="account__heading">
            <Icon name="archive" />
            Data lokal & cadangan
          </summary>
          <p className="muted">
            Pengaturan, watchlist, dan hasil scan disimpan di browser ini. Gunakan cadangan untuk memindahkannya.
          </p>
          {storageStats ? (
            <p className="muted small mono">
               Penyimpanan: {storageStats.backend === 'indexeddb' ? 'IndexedDB' : 'Memori tab (fallback)'} · skema v
              {storageStats.schemaVersion} · {storageStats.watchlistCount} watchlist · {storageStats.scanRecordCount}{' '}
              catatan scan · {storageStats.checkpointCount} checkpoint sumber
            </p>
          ) : null}
          <div className="button-row">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void handleExport()}>
              Ekspor cadangan (.json)
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Impor cadangan (.json)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Pilih file cadangan JSON untuk diimpor"
              onChange={(event) => void handleImportFile(event)}
            />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleClearStorage()}>
              Bersihkan cache lokal
            </button>
          </div>
          {storageNotice ? (
            <p className={`notice ${storageNotice.tone === 'danger' ? 'notice--danger' : 'notice--info'}`} role="status">
              <Icon name={storageNotice.tone === 'danger' ? 'alert' : 'info'} size={16} />
              <span>{storageNotice.text}</span>
            </p>
          ) : null}
        </details>

        {identity.kind !== 'none' ? (
          <div className="account__footer">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                if (identity.kind === 'metamask') {
                  void wallet.disconnect()
                } else {
                  onClear()
                }
              }}
            >
              <Icon name="logout" />
              Lepas akun
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
