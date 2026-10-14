import { getAddress, isAddress } from 'viem'
import { getNetwork } from '../../domain/networks'
import type { HexAddress } from '../../domain/types'

/** Antarmuka provider EIP-1193 dari ekstensi MetaMask Chrome. */
export interface Eip1193Provider {
  request: (args: { method: string; params?: readonly unknown[] | object }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
  isMetaMask?: boolean
}

export interface Eip6963ProviderInfo {
  uuid?: string
  name?: string
  icon?: string
  rdns?: string
}

export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo
  provider: Eip1193Provider
}

export type WalletErrorKind =
  | 'user_rejected'
  | 'pending_request'
  | 'chain_not_added'
  | 'not_detected'
  | 'invalid_response'
  | 'unknown'

export interface WalletErrorInfo {
  kind: WalletErrorKind
  code: number | null
  message: string
  recoverable: boolean
}

export interface MetaMaskSession {
  address: HexAddress
  chainId: number
}

export function isMetaMaskRdns(value: unknown): boolean {
  return typeof value === 'string' && (value === 'io.metamask' || value.startsWith('io.metamask.'))
}

/** Konversi chainId dari respons RPC (heksadesimal `0x...` atau angka) menjadi integer positif. */
export function parseChainId(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw > 0 ? raw : null
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const parsed = trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

/** Format chainId integer menjadi string heksadesimal EIP-1193 (`0x1`, `0x2105`, dst.). */
export function toHexChainId(chainId: number): `0x${string}` {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Chain ID tidak valid: ${chainId}`)
  }
  return `0x${chainId.toString(16)}`
}

/** Validasi daftar alamat dari `eth_accounts` atau `eth_requestAccounts` ke format checksum EIP-55. */
export function normalizeAccounts(raw: unknown): HexAddress[] {
  if (!Array.isArray(raw)) return []
  const result: HexAddress[] = []
  for (const item of raw) {
    if (typeof item === 'string' && isAddress(item, { strict: false })) {
      result.push(getAddress(item))
    }
  }
  return result
}

/** Terjemahkan error RPC / ekstensi MetaMask ke pesan Bahasa Indonesia yang jelas dan aman. */
export function classifyWalletError(error: unknown, targetChainId?: number): WalletErrorInfo {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'number'
      ? (error as { code: number }).code
      : null

  if (code === 4001) {
    return {
      kind: 'user_rejected',
      code,
      message: 'Permintaan ditolak di MetaMask. Tidak ada perubahan yang dilakukan; tekan Coba lagi bila siap.',
      recoverable: true,
    }
  }

  if (code === -32002) {
    return {
      kind: 'pending_request',
      code,
      message:
        'Permintaan ke MetaMask masih menunggu persetujuan. Buka popup ekstensi MetaMask di toolbar Chrome Anda.',
      recoverable: true,
    }
  }

  if (code === 4902) {
    const netName = targetChainId ? getNetwork(targetChainId).name : 'Jaringan tujuan'
    return {
      kind: 'chain_not_added',
      code,
      message: `${netName} belum terdaftar di ekstensi MetaMask Anda. Tambahkan jaringan tersebut di MetaMask lalu coba lagi.`,
      recoverable: true,
    }
  }

  return {
    kind: 'unknown',
    code,
    message: 'Gagal berkomunikasi dengan ekstensi MetaMask. Pastikan MetaMask terbuka dan tidak terkunci, lalu coba lagi.',
    recoverable: true,
  }
}

/**
 * Minta koneksi akun ke MetaMask (`eth_requestAccounts`) + baca `eth_chainId`.
 * Tidak pernah meminta tanda tangan (`personal_sign` / `eth_signTypedData`) untuk membaca data publik.
 */
export async function connectMetaMaskProvider(provider: Eip1193Provider): Promise<MetaMaskSession> {
  const rawAccounts = await provider.request({ method: 'eth_requestAccounts' })
  const accounts = normalizeAccounts(rawAccounts)
  if (accounts.length === 0) {
    throw {
      code: -1,
      kind: 'invalid_response',
      message: 'MetaMask tidak mengembalikan alamat akun yang valid.',
    }
  }
  const rawChainId = await provider.request({ method: 'eth_chainId' })
  const chainId = parseChainId(rawChainId) ?? 1
  return {
    address: accounts[0],
    chainId,
  }
}

/**
 * Baca sesi MetaMask secara pasif (`eth_accounts`) tanpa membuka popup.
 * Dipakai saat memulihkan sesi yang sebelumnya sudah disetujui pengguna.
 */
export async function readPassiveMetaMaskSession(provider: Eip1193Provider): Promise<MetaMaskSession | null> {
  try {
    const rawAccounts = await provider.request({ method: 'eth_accounts' })
    const accounts = normalizeAccounts(rawAccounts)
    if (accounts.length === 0) return null
    const rawChainId = await provider.request({ method: 'eth_chainId' })
    const chainId = parseChainId(rawChainId) ?? 1
    return {
      address: accounts[0],
      chainId,
    }
  } catch {
    return null
  }
}

/** Pindahkan jaringan aktif di MetaMask menggunakan `wallet_switchEthereumChain`. */
export async function switchMetaMaskChain(provider: Eip1193Provider, targetChainId: number): Promise<number> {
  const hexChainId = toHexChainId(targetChainId)
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: hexChainId }],
  })
  const rawChainId = await provider.request({ method: 'eth_chainId' })
  return parseChainId(rawChainId) ?? targetChainId
}

/**
 * Cabut izin `eth_accounts` dari MetaMask bila didukung oleh versi ekstensi (EIP-2255).
 * Bila tidak didukung, fungsi tetap selesai dengan aman agar state lokal tetap dibersihkan.
 */
export async function revokeMetaMaskPermissions(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    })
  } catch {
    // Beberapa versi provider hanya mendukung pemutusan dari sisi aplikasi.
  }
}
