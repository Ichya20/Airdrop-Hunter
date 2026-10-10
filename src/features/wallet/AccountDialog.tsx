import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useMediaQuery } from '../../app/hooks'
import { AddressText } from '../../components/AddressText'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { checkAddressInput, looksLikeSecret } from '../../domain/address'
import type { HexAddress, Identity } from '../../domain/types'
import { identityModeText, identityName } from './identity'
import { useMetaMaskDetection, type MetaMaskPresence } from './useMetaMaskDetection'

interface AccountDialogProps {
  open: boolean
  identity: Identity
  onClose: () => void
  onSelectDemo: () => void
  onWatch: (address: HexAddress) => void
  onClear: () => void
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
  onClose,
  onSelectDemo,
  onWatch,
  onClear,
  titleRef,
}: AccountDialogProps & { titleRef: RefObject<HTMLHeadingElement | null> }) {
  const presence = useMetaMaskDetection()
  const coarsePointer = useMediaQuery('(pointer: coarse)')
  const [connectNotice, setConnectNotice] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ids = useId()
  const inputId = `${ids}-address`
  const hintId = `${ids}-hint`
  const errorId = `${ids}-error`

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

  return (
    <div className="account">
      <header className="dialog__head">
        <div>
          <p className="eyebrow">Identitas lokal</p>
          <h2 id="account-title" className="dialog__title" ref={titleRef} tabIndex={-1}>
            Akun dan mode
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
          {identity.kind === 'watch' ? <AddressText address={identity.address} /> : null}
        </div>

        <section className="account__section" aria-labelledby={`${ids}-mm`}>
          <h3 id={`${ids}-mm`} className="account__heading">
            <Icon name="wallet" />
            MetaMask Chrome extension · laptop
          </h3>
          <p className="muted">
            Satu-satunya wallet yang didukung. Koneksi, tanda tangan, dan klaim hanya dilakukan di Chrome
            laptop yang memasang MetaMask. Tidak ada WalletConnect atau wallet mobile.
          </p>
          <p className={`detect detect--${presence}`}>
            <Icon name={presence === 'detected' ? 'checkCircle' : presence === 'checking' ? 'clock' : 'info'} size={16} />
            <span>
              {PRESENCE_TEXT[presence]}{' '}
              <span className="muted">Deteksi hanya membaca pengumuman provider, bukan meminta akun.</span>
            </span>
          </p>
          <div className="button-row">
            <button type="button" className="btn btn--secondary" onClick={() => setConnectNotice(true)}>
              <Icon name="wallet" />
              Hubungkan MetaMask
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              aria-pressed={identity.kind === 'demo'}
              onClick={onSelectDemo}
            >
              <Icon name="flask" />
              {identity.kind === 'demo' ? 'Akun DEMO aktif' : 'Gunakan Akun DEMO'}
            </button>
          </div>
          {connectNotice ? (
            <p className="notice notice--demo" role="status">
              <Icon name="info" size={16} />
              <span>
                DEMO tahap 1: koneksi MetaMask belum diaktifkan, jadi tidak ada permintaan akun, tanda tangan,
                atau transaksi yang dikirim ke wallet. Tahap 2 menambah koneksi resmi melalui wagmi dan
                konektor MetaMask.
              </span>
            </p>
          ) : null}
        </section>

        <section className="account__section" aria-labelledby={`${ids}-watch`}>
          <h3 id={`${ids}-watch`} className="account__heading">
            <Icon name="eye" />
            Mode pantau · HP
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
              Format 0x + 40 karakter heksadesimal. Jangan pernah memasukkan seed phrase atau private key.
            </p>
            {error !== null ? (
              <p id={errorId} className="field__error" role="alert">
                <Icon name="alert" size={16} />
                <span>{error}</span>
              </p>
            ) : null}
            <div className="button-row">
              <button type="submit" className="btn btn--primary">
                <Icon name="eye" />
                Pantau alamat
              </button>
            </div>
          </form>
          <p className="muted small">
            Tahap 1 menyimpan pilihan hanya di tab ini. Data HP dan laptop tidak tersinkron otomatis.
          </p>
        </section>

        {identity.kind !== 'none' ? (
          <div className="account__footer">
            <button type="button" className="btn btn--ghost" onClick={onClear}>
              <Icon name="logout" />
              Lepas akun
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
