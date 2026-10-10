import { useEffect, useRef, useState } from 'react'
import { shortenAddress } from '../domain/address'
import { copyText } from './clipboard'
import { Icon } from './Icon'

type CopyState = 'idle' | 'copied' | 'failed'

/** Alamat dipersingkat untuk tampilan, dapat dilihat penuh dan disalin. */
export function AddressText({ address }: { address: string }) {
  const [expanded, setExpanded] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const containerRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (copyState !== 'copied') return
    const timer = window.setTimeout(() => setCopyState('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [copyState])

  const handleCopy = async () => {
    const container = containerRef.current
    if (!container) return
    const ok = await copyText(address, container)
    setCopyState(ok ? 'copied' : 'failed')
    if (!ok) {
      setExpanded(true)
      // Pilih teks agar pengguna dapat menyalin manual.
      window.requestAnimationFrame(() => {
        const node = valueRef.current
        const selection = window.getSelection()
        if (!node || !selection) return
        const range = document.createRange()
        range.selectNodeContents(node)
        selection.removeAllRanges()
        selection.addRange(range)
      })
    }
  }

  return (
    <div className="address" ref={containerRef}>
      <code ref={valueRef} className="address__value mono" translate="no">
        {expanded ? address : shortenAddress(address)}
      </code>
      <div className="address__actions">
        <button
          type="button"
          className="btn btn--ghost btn--xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Persingkat' : 'Lihat penuh'}
        </button>
        <button type="button" className="btn btn--ghost btn--xs" onClick={handleCopy}>
          <Icon name={copyState === 'copied' ? 'check' : 'copy'} size={14} />
          {copyState === 'copied' ? 'Tersalin' : 'Salin'}
        </button>
      </div>
      <p className="address__status" role="status">
        {copyState === 'copied' ? <span className="sr-only">Alamat disalin.</span> : null}
        {copyState === 'failed'
          ? 'Tidak dapat menyalin otomatis di halaman ini. Alamat sudah dipilih; salin secara manual.'
          : null}
      </p>
    </div>
  )
}
