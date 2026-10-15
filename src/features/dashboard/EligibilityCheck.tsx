import { useState } from 'react'
import { getEligibilityAdapter } from '../../adapters/eligibility'
import { Icon } from '../../components/Icon'
import { looksLikeSecret } from '../../domain/address'
import type { Campaign, EligibilityResult, Identity } from '../../domain/types'
import { identityAddress } from '../wallet/identity'

interface EligibilityCheckProps {
  campaign: Campaign
  identity: Identity
  result: EligibilityResult
  busy: boolean
  stale: boolean
  onRecheck: (proofJson?: string) => Promise<void>
}

export function EligibilityCheck({ campaign, identity, result, busy, stale, onRecheck }: EligibilityCheckProps) {
  const [proofJson, setProofJson] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const adapter = getEligibilityAdapter(campaign)
  if (!adapter) return null
  const address = identityAddress(identity)

  return (
    <section className="eligibility-check" aria-labelledby="eligibility-check-title" aria-busy={busy}>
      <h3 id="eligibility-check-title" className="section-title">Pemeriksaan eligibility resmi</h3>
      <p className="muted small">
        Proof publik UNI dicocokkan dengan root dan status klaim kontrak resmi di Ethereum.
        Pemeriksaan ini hanya membaca; arsip tetap tidak dapat diklaim di aplikasi.
      </p>
      {address ? (
        <form className="field" onSubmit={(event) => {
          event.preventDefault()
          if (!busy && !inputError) void onRecheck(proofJson.trim() || undefined)
        }}>
          <label htmlFor="eligibility-proof" className="field__label">Proof publik UNI (JSON)</label>
          <textarea
            id="eligibility-proof"
            className="input mono eligibility-proof"
            rows={6}
            maxLength={32_768}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={proofJson}
            disabled={busy}
            aria-invalid={inputError !== null}
            aria-describedby={`eligibility-proof-hint${inputError ? ' eligibility-proof-error' : ''}`}
            onChange={(event) => {
              const value = event.target.value
              if (looksLikeSecret(value)) {
                setProofJson('')
                setInputError('Isian menyerupai rahasia wallet telah dikosongkan. Gunakan hanya proof JSON publik.')
              } else {
                setProofJson(value)
                setInputError(null)
              }
            }}
          />
          <p id="eligibility-proof-hint" className="field__hint">
            Field: address, index, amount (string satuan dasar token), proof (daftar hash).
            Gunakan entri untuk alamat aktif dari{' '}
            <a href="https://github.com/Uniswap/retroactive-query" target="_blank" rel="noopener noreferrer">dataset resmi Uniswap</a>.
            {' '}Proof hanya diingat di tab ini; setelah reload masukkan ulang. Jangan masukkan seed phrase atau private key.
          </p>
          {inputError ? <p id="eligibility-proof-error" className="field__error" role="alert">{inputError}</p> : null}
          <div className="button-row">
            <button type="submit" className="btn btn--secondary" disabled={busy || inputError !== null}>
              <Icon name="refresh" />
              {busy ? 'Memeriksa…' : 'Periksa ulang'}
            </button>
            {stale ? <span className="warn-text small">Hasil eligibility usang</span> : null}
          </div>
        </form>
      ) : <p className="muted">Pilih alamat pantau atau hubungkan MetaMask untuk memeriksa alamat publik.</p>}
      <p className="small break" role="status" aria-live="polite">
        {busy ? 'Pemeriksaan berlangsung. Hasil sebelumnya belum dipakai sebagai bukti eligibility.' : result.reason}
      </p>
    </section>
  )
}
