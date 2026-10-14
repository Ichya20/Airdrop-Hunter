import { shortenAddress } from '../../domain/address'
import { getNetwork, isKnownChain } from '../../domain/networks'
import type { HexAddress, Identity } from '../../domain/types'

/**
 * Kunci identitas lengkap (termasuk chainId untuk MetaMask).
 * Dipakai untuk memisahkan cache tampilan saat akun atau jaringan berganti.
 */
export function identityKey(identity: Identity): string {
  switch (identity.kind) {
    case 'none':
      return 'none'
    case 'demo':
      return 'demo'
    case 'watch':
      return `watch:${identity.address.toLowerCase()}`
    case 'metamask':
      return `metamask:${identity.address.toLowerCase()}:${identity.chainId}`
  }
}

/**
 * Kunci akun untuk watchlist dan pemisahan antar-wallet.
 * Memastikan watchlist wallet A, wallet B, mode pantau, dan akun DEMO tidak pernah bercampur,
 * namun tetap tersimpan untuk alamat wallet yang sama saat berpindah jaringan.
 */
export function walletAccountKey(identity: Identity): string {
  switch (identity.kind) {
    case 'none':
      return 'none'
    case 'demo':
      return 'demo'
    case 'watch':
      return `watch:${identity.address.toLowerCase()}`
    case 'metamask':
      return `metamask:${identity.address.toLowerCase()}`
  }
}

/** Alamat publik dari identitas aktif bila tersedia (`watch` atau `metamask`). */
export function identityAddress(identity: Identity): HexAddress | null {
  if (identity.kind === 'watch' || identity.kind === 'metamask') {
    return identity.address
  }
  return null
}

export function identityName(identity: Identity): string {
  switch (identity.kind) {
    case 'none':
      return 'Tanpa akun'
    case 'demo':
      return 'Akun DEMO'
    case 'watch':
      return shortenAddress(identity.address)
    case 'metamask':
      return shortenAddress(identity.address)
  }
}

export function identityModeText(identity: Identity): string {
  switch (identity.kind) {
    case 'none':
      return 'Belum memilih akun'
    case 'demo':
      return 'Fixture · bukan wallet nyata'
    case 'watch':
      return 'Mode pantau · baca saja'
    case 'metamask': {
      const net = getNetwork(identity.chainId)
      return isKnownChain(identity.chainId)
        ? `MetaMask · ${net.name}`
        : `MetaMask · Jaringan tidak didukung (${identity.chainId})`
    }
  }
}

/** Jaringan wallet yang tampil di header. */
export function walletNetworkText(identity: Identity): string {
  switch (identity.kind) {
    case 'demo':
      return 'DEMO · tanpa RPC'
    case 'watch':
      return 'Semua EVM · baca saja'
    case 'none':
      return 'Belum ada akun'
    case 'metamask': {
      const net = getNetwork(identity.chainId)
      return isKnownChain(identity.chainId)
        ? `${net.name} (${identity.chainId})`
        : `Tidak didukung (${identity.chainId})`
    }
  }
}

/** Apakah wallet MetaMask sedang berada di jaringan yang belum didukung aplikasi. */
export function isUnsupportedWalletChain(identity: Identity): boolean {
  return identity.kind === 'metamask' && !isKnownChain(identity.chainId)
}
