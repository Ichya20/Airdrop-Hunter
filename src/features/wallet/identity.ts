import { shortenAddress } from '../../domain/address'
import type { Identity } from '../../domain/types'

/** Kunci identitas lokal. Dipakai untuk memisahkan eligibility, transaksi, dan watchlist. */
export function identityKey(identity: Identity): string {
  switch (identity.kind) {
    case 'none':
      return 'none'
    case 'demo':
      return 'demo'
    case 'watch':
      return `watch:${identity.address.toLowerCase()}`
  }
}

export function identityName(identity: Identity): string {
  switch (identity.kind) {
    case 'none':
      return 'Tanpa akun'
    case 'demo':
      return 'Akun DEMO'
    case 'watch':
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
  }
}

/** Jaringan wallet yang tampil di header. Tahap 1 tidak membaca jaringan dari MetaMask. */
export function walletNetworkText(identity: Identity): string {
  switch (identity.kind) {
    case 'demo':
      return 'DEMO · tanpa RPC'
    case 'watch':
      return 'Semua EVM · baca saja'
    case 'none':
      return 'Belum ada akun'
  }
}
