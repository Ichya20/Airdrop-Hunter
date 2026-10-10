import { useEffect, useState } from 'react'

export type MetaMaskPresence = 'checking' | 'detected' | 'not_detected'

interface AnnounceDetail {
  info?: { rdns?: unknown; name?: unknown }
}

function isMetaMaskRdns(value: unknown): boolean {
  return typeof value === 'string' && (value === 'io.metamask' || value.startsWith('io.metamask.'))
}

/**
 * Deteksi MetaMask Chrome extension melalui EIP-6963 (pengumuman provider).
 * Hanya membaca event pengumuman; tidak memanggil `eth_requestAccounts` atau metode wallet lain.
 */
export function useMetaMaskDetection(): MetaMaskPresence {
  const [presence, setPresence] = useState<MetaMaskPresence>('checking')

  useEffect(() => {
    let found = false
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<AnnounceDetail>).detail
      if (isMetaMaskRdns(detail?.info?.rdns)) {
        found = true
        setPresence('detected')
      }
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    const timer = window.setTimeout(() => {
      if (!found) setPresence('not_detected')
    }, 800)
    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      window.clearTimeout(timer)
    }
  }, [])

  return presence
}
