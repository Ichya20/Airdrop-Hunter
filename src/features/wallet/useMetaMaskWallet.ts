import { useCallback, useEffect, useRef, useState } from 'react'
import { shortenAddress } from '../../domain/address'
import { getNetwork } from '../../domain/networks'
import type { Identity } from '../../domain/types'
import {
  classifyWalletError,
  connectMetaMaskProvider,
  normalizeAccounts,
  parseChainId,
  readPassiveMetaMaskSession,
  revokeMetaMaskPermissions,
  switchMetaMaskChain,
  type MetaMaskSession,
  type WalletErrorInfo,
} from './metamask'
import { useMetaMaskDiscovery, type MetaMaskPresence } from './useMetaMaskDetection'

export type WalletConnectionPhase = 'idle' | 'connecting' | 'switching_network' | 'connected' | 'error'

export interface MetaMaskWalletController {
  presence: MetaMaskPresence
  phase: WalletConnectionPhase
  error: WalletErrorInfo | null
  session: MetaMaskSession | null
  connect: () => Promise<MetaMaskSession | null>
  disconnect: () => Promise<void>
  switchNetwork: (targetChainId: number) => Promise<boolean>
  clearError: () => void
}

interface UseMetaMaskWalletOptions {
  identity: Identity
  onSessionChange: (next: Identity, announcement: string) => void
}

/**
 * Hook manajemen koneksi MetaMask Chrome extension (Tahap 2).
 * Menangani connect, disconnect, penolakan (coba lagi), pindah jaringan,
 * serta perubahan akun (`accountsChanged`) dan jaringan (`chainChanged`) secara reaktif.
 */
export function useMetaMaskWallet({
  identity,
  onSessionChange,
}: UseMetaMaskWalletOptions): MetaMaskWalletController {
  const { presence, provider } = useMetaMaskDiscovery()
  const [phase, setPhase] = useState<WalletConnectionPhase>('idle')
  const [error, setError] = useState<WalletErrorInfo | null>(null)
  const session = identity.kind === 'metamask' ? { address: identity.address, chainId: identity.chainId } : null
  const passiveRequestRef = useRef(0)
  const [operationIdentity, setOperationIdentity] = useState<Identity | null>(null)

  const identityRef = useRef(identity)
  useEffect(() => {
    identityRef.current = identity
    passiveRequestRef.current += 1
  }, [identity])

  const onSessionChangeRef = useRef(onSessionChange)
  useEffect(() => {
    onSessionChangeRef.current = onSessionChange
  }, [onSessionChange])

  // Verifikasi ulang saat provider atau identitas hasil hydrate/import berubah.
  const address = identity.kind === 'metamask' ? identity.address : null
  const chainId = identity.kind === 'metamask' ? identity.chainId : null
  useEffect(() => {
    if (presence !== 'not_detected' || address === null) return
    let active = true
    void Promise.resolve().then(() => {
      if (active && identityRef.current.kind === 'metamask' && identityRef.current.address === address) {
        onSessionChangeRef.current(
          { kind: 'watch', address },
          'MetaMask belum terdeteksi. Alamat tersimpan dipulihkan dalam mode pantau.',
        )
      }
    })
    return () => { active = false }
  }, [presence, address])
  useEffect(() => {
    if (!provider || address === null || chainId === null) return
    let active = true
    const requestId = ++passiveRequestRef.current
    void readPassiveMetaMaskSession(provider).then((liveSession) => {
      const current = identityRef.current
      if (!active || requestId !== passiveRequestRef.current || current.kind !== 'metamask') return
      if (current.address !== address || current.chainId !== chainId) return
      if (!liveSession) {
        setPhase('idle')
        onSessionChangeRef.current(
          { kind: 'none' },
          'Sesi MetaMask sebelumnya sudah tidak aktif. Silakan hubungkan kembali MetaMask.',
        )
        return
      }
      setPhase((previous) => previous === 'connecting' || previous === 'switching_network' ? previous : 'connected')
      if (current.address.toLowerCase() !== liveSession.address.toLowerCase() || current.chainId !== liveSession.chainId) {
        onSessionChangeRef.current(
          { kind: 'metamask', address: liveSession.address, chainId: liveSession.chainId },
          `Sesi MetaMask disinkronkan ke ${shortenAddress(liveSession.address)} di ${getNetwork(liveSession.chainId).name}.`,
        )
      }
    })
    return () => { active = false }
  }, [provider, address, chainId])

  // Dengarkan event EIP-1193 `accountsChanged`, `chainChanged`, dan `disconnect`
  useEffect(() => {
    if (!provider || typeof provider.on !== 'function') return

    const handleAccountsChanged = (rawAccounts: unknown) => {
      if (identityRef.current.kind !== 'metamask') return
      passiveRequestRef.current += 1
      const accounts = normalizeAccounts(rawAccounts)
      if (accounts.length === 0) {
        setPhase('idle')
        setError(null)
        onSessionChangeRef.current(
          { kind: 'none' },
          'MetaMask terputus atau dikunci. Cache tampilan untuk wallet sebelumnya telah dibersihkan.',
        )
        return
      }
      const nextAddress = accounts[0]
      const currentChainId = identityRef.current.chainId
      if (
        identityRef.current.kind === 'metamask' &&
        identityRef.current.address.toLowerCase() === nextAddress.toLowerCase()
      ) {
        return
      }
      setPhase('connected')
      setError(null)
      onSessionChangeRef.current(
        { kind: 'metamask', address: nextAddress, chainId: currentChainId },
        `Akun MetaMask berganti ke ${shortenAddress(nextAddress)}. Cache tampilan akun sebelumnya dibersihkan.`,
      )
    }

    const handleChainChanged = (rawChainId: unknown) => {
      const nextChainId = parseChainId(rawChainId)
      if (nextChainId === null) return
      if (identityRef.current.kind !== 'metamask') return
      if (identityRef.current.chainId === nextChainId) return
      passiveRequestRef.current += 1
      const address = identityRef.current.address
      setPhase('connected')
      setError(null)
      const net = getNetwork(nextChainId)
      onSessionChangeRef.current(
        { kind: 'metamask', address, chainId: nextChainId },
        `Jaringan MetaMask berganti ke ${net.name} (chain ID ${nextChainId}). Status tampilan diperbarui.`,
      )
    }

    const handleDisconnect = () => {
      if (identityRef.current.kind !== 'metamask') return
      passiveRequestRef.current += 1
      setPhase('idle')
      onSessionChangeRef.current(
        { kind: 'none' },
        'Koneksi MetaMask terputus. Cache tampilan wallet telah dibersihkan.',
      )
    }

    provider.on('accountsChanged', handleAccountsChanged)
    provider.on('chainChanged', handleChainChanged)
    provider.on('disconnect', handleDisconnect)

    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged)
      provider.removeListener?.('chainChanged', handleChainChanged)
      provider.removeListener?.('disconnect', handleDisconnect)
    }
  }, [provider])

  const connect = useCallback(async (): Promise<MetaMaskSession | null> => {
    if (!provider) {
      const err: WalletErrorInfo = {
        kind: 'not_detected',
        code: null,
        message:
          'Ekstensi MetaMask Chrome tidak terdeteksi di browser ini. Pasang atau aktifkan MetaMask di Chrome laptop, atau gunakan Mode pantau.',
        recoverable: true,
      }
      setError(err)
      setPhase('error')
      return null
    }

    const requestId = ++passiveRequestRef.current
    setOperationIdentity(identityRef.current)
    setPhase('connecting')
    setError(null)
    try {
      const connected = await connectMetaMaskProvider(provider)
      if (requestId !== passiveRequestRef.current) return null
      setPhase('connected')
      setError(null)
      const net = getNetwork(connected.chainId)
      onSessionChangeRef.current(
        { kind: 'metamask', address: connected.address, chainId: connected.chainId },
        `MetaMask terhubung: ${shortenAddress(connected.address)} di jaringan ${net.name}.`,
      )
      return connected
    } catch (rawError: unknown) {
      if (requestId !== passiveRequestRef.current) return null
      const classified = classifyWalletError(rawError)
      setError(classified)
      setPhase('error')
      return null
    }
  }, [provider])

  const disconnect = useCallback(async (): Promise<void> => {
    const requestId = ++passiveRequestRef.current
    if (provider) {
      await revokeMetaMaskPermissions(provider)
    }
    if (requestId !== passiveRequestRef.current) return
    setPhase('idle')
    setError(null)
    onSessionChangeRef.current(
      { kind: 'none' },
      'Koneksi MetaMask diputus. Cache tampilan wallet telah dibersihkan.',
    )
  }, [provider])

  const switchNetwork = useCallback(
    async (targetChainId: number): Promise<boolean> => {
      if (!provider || identityRef.current.kind !== 'metamask') {
        setError({
          kind: 'not_detected',
          code: null,
          message: 'Hubungkan MetaMask terlebih dahulu sebelum mengganti jaringan.',
          recoverable: true,
        })
        return false
      }
      const currentAddress = identityRef.current.address
      const requestId = ++passiveRequestRef.current
      setOperationIdentity(identityRef.current)
      setPhase('switching_network')
      setError(null)
      try {
        const updatedChainId = await switchMetaMaskChain(provider, targetChainId)
        if (requestId !== passiveRequestRef.current) return false
        setPhase('connected')
        const net = getNetwork(updatedChainId)
        onSessionChangeRef.current(
          { kind: 'metamask', address: currentAddress, chainId: updatedChainId },
          `Jaringan MetaMask berpindah ke ${net.name} (chain ID ${updatedChainId}).`,
        )
        return true
      } catch (rawError: unknown) {
        if (requestId !== passiveRequestRef.current) return false
        const classified = classifyWalletError(rawError, targetChainId)
        setError(classified)
        setPhase('connected')
        return false
      }
    },
    [provider],
  )

  const clearError = useCallback(() => {
    setError(null)
    setPhase((prev) => (prev === 'error' ? (identity.kind === 'metamask' ? 'connected' : 'idle') : prev))
  }, [identity.kind])

  return {
    presence,
    phase: (phase === 'connecting' || phase === 'switching_network') && operationIdentity !== identity
      ? session ? 'connected' : 'idle'
      : phase === 'idle' && session ? 'connected' : phase === 'connected' && !session ? 'idle' : phase,
    error,
    session,
    connect,
    disconnect,
    switchNetwork,
    clearError,
  }
}
