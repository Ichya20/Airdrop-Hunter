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
  const [session, setSession] = useState<MetaMaskSession | null>(null)

  const identityRef = useRef(identity)
  useEffect(() => {
    identityRef.current = identity
  }, [identity])

  const onSessionChangeRef = useRef(onSessionChange)
  useEffect(() => {
    onSessionChangeRef.current = onSessionChange
  }, [onSessionChange])

  // Sinkronkan state sesi internal jika identitas awalnya dipulihkan dari storage
  useEffect(() => {
    if (identity.kind === 'metamask') {
      setSession({ address: identity.address, chainId: identity.chainId })
      setPhase((prev) => (prev === 'connecting' || prev === 'switching_network' ? prev : 'connected'))
    } else {
      setSession(null)
      setPhase((prev) => (prev === 'error' ? prev : 'idle'))
    }
  }, [identity])

  // Ketika identitas dari storage adalah 'metamask' dan provider sudah ditemukan,
  // verifikasi sesi secara pasif lewat `eth_accounts` (tanpa membuka popup).
  const passiveCheckedRef = useRef(false)
  useEffect(() => {
    if (!provider || passiveCheckedRef.current) return
    if (identityRef.current.kind !== 'metamask') return
    passiveCheckedRef.current = true
    void readPassiveMetaMaskSession(provider).then((liveSession) => {
      if (identityRef.current.kind !== 'metamask') return
      if (!liveSession) {
        setSession(null)
        setPhase('idle')
        onSessionChangeRef.current(
          { kind: 'none' },
          'Sesi MetaMask sebelumnya sudah tidak aktif. Silakan hubungkan kembali MetaMask.',
        )
        return
      }
      const prev = identityRef.current
      if (
        prev.address.toLowerCase() !== liveSession.address.toLowerCase() ||
        prev.chainId !== liveSession.chainId
      ) {
        setSession(liveSession)
        setPhase('connected')
        onSessionChangeRef.current(
          { kind: 'metamask', address: liveSession.address, chainId: liveSession.chainId },
          `Sesi MetaMask disinkronkan ke ${shortenAddress(liveSession.address)} di ${getNetwork(liveSession.chainId).name}.`,
        )
      }
    })
  }, [provider])

  // Dengarkan event EIP-1193 `accountsChanged`, `chainChanged`, dan `disconnect`
  useEffect(() => {
    if (!provider || typeof provider.on !== 'function') return

    const handleAccountsChanged = (rawAccounts: unknown) => {
      if (identityRef.current.kind !== 'metamask') return
      const accounts = normalizeAccounts(rawAccounts)
      if (accounts.length === 0) {
        setSession(null)
        setPhase('idle')
        setError(null)
        onSessionChangeRef.current(
          { kind: 'none' },
          'MetaMask terputus atau dikunci. Cache tampilan untuk wallet sebelumnya telah dibersihkan.',
        )
        return
      }
      const nextAddress = accounts[0]
      const currentChainId =
        identityRef.current.kind === 'metamask' ? identityRef.current.chainId : (session?.chainId ?? 1)
      if (
        identityRef.current.kind === 'metamask' &&
        identityRef.current.address.toLowerCase() === nextAddress.toLowerCase()
      ) {
        return
      }
      const nextSession = { address: nextAddress, chainId: currentChainId }
      setSession(nextSession)
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
      const address = identityRef.current.address
      const nextSession = { address, chainId: nextChainId }
      setSession(nextSession)
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
      setSession(null)
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
  }, [provider, session?.chainId])

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

    setPhase('connecting')
    setError(null)
    try {
      const connected = await connectMetaMaskProvider(provider)
      setSession(connected)
      setPhase('connected')
      setError(null)
      const net = getNetwork(connected.chainId)
      onSessionChangeRef.current(
        { kind: 'metamask', address: connected.address, chainId: connected.chainId },
        `MetaMask terhubung: ${shortenAddress(connected.address)} di jaringan ${net.name}.`,
      )
      return connected
    } catch (rawError: unknown) {
      const classified = classifyWalletError(rawError)
      setError(classified)
      setPhase('error')
      return null
    }
  }, [provider])

  const disconnect = useCallback(async (): Promise<void> => {
    if (provider) {
      await revokeMetaMaskPermissions(provider)
    }
    setSession(null)
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
      setPhase('switching_network')
      setError(null)
      try {
        const updatedChainId = await switchMetaMaskChain(provider, targetChainId)
        const nextSession = { address: currentAddress, chainId: updatedChainId }
        setSession(nextSession)
        setPhase('connected')
        const net = getNetwork(updatedChainId)
        onSessionChangeRef.current(
          { kind: 'metamask', address: currentAddress, chainId: updatedChainId },
          `Jaringan MetaMask berpindah ke ${net.name} (chain ID ${updatedChainId}).`,
        )
        return true
      } catch (rawError: unknown) {
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
    setPhase((prev) => (prev === 'error' ? (session ? 'connected' : 'idle') : prev))
  }, [session])

  return {
    presence,
    phase,
    error,
    session,
    connect,
    disconnect,
    switchNetwork,
    clearError,
  }
}
