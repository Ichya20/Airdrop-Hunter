import { useEffect, useState } from 'react'
import { isMetaMaskRdns, type Eip1193Provider } from './metamask'

export type MetaMaskPresence = 'checking' | 'detected' | 'not_detected'

interface AnnounceDetail {
  info?: { rdns?: unknown; name?: unknown }
  provider?: Eip1193Provider
}

export interface MetaMaskDiscovery {
  presence: MetaMaskPresence
  provider: Eip1193Provider | null
}

/**
 * Deteksi MetaMask Chrome extension melalui EIP-6963 (pengumuman provider).
 * Hanya membaca event pengumuman; tidak memanggil `eth_requestAccounts` saat deteksi.
 */
export function useMetaMaskDiscovery(): MetaMaskDiscovery {
  const [presence, setPresence] = useState<MetaMaskPresence>('checking')
  const [provider, setProvider] = useState<Eip1193Provider | null>(null)

  useEffect(() => {
    let found = false
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<AnnounceDetail>).detail
      if (isMetaMaskRdns(detail?.info?.rdns) && detail?.provider) {
        found = true
        setProvider(detail.provider)
        setPresence('detected')
      }
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    const timer = window.setTimeout(() => {
      if (!found) {
        // Fallback ke window.ethereum.isMetaMask bila lingkungan pengujian menyuntikkan provider langsung
        const fallback = (window as Window & { ethereum?: Eip1193Provider }).ethereum
        if (fallback && fallback.isMetaMask === true && typeof fallback.request === 'function') {
          setProvider(fallback)
          setPresence('detected')
          return
        }
        setPresence('not_detected')
      }
    }, 500)
    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      window.clearTimeout(timer)
    }
  }, [])

  return { presence, provider }
}

/** Kompatibilitas hook deteksi status sederhana. */
export function useMetaMaskDetection(): MetaMaskPresence {
  return useMetaMaskDiscovery().presence
}
