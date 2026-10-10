import { getAddress, isAddress } from 'viem'
import type { HexAddress } from './types'

export type AddressCheck =
  | { ok: true; address: HexAddress }
  | {
      ok: false
      kind: 'empty' | 'format' | 'checksum' | 'ens' | 'secret'
      message: string
    }

const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/
const WORD_PATTERN = /^[a-zA-Z]+$/

/** Deteksi isian yang tampak seperti rahasia wallet. Isian ini tidak boleh disimpan. */
export function looksLikeSecret(raw: string): 'private_key' | 'seed_phrase' | null {
  const value = raw.trim()
  if (PRIVATE_KEY_PATTERN.test(value)) return 'private_key'
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length >= 12 && words.every((word) => WORD_PATTERN.test(word))) return 'seed_phrase'
  return null
}

/** Validasi alamat publik EVM untuk mode pantau, termasuk checksum EIP-55. */
export function checkAddressInput(raw: string): AddressCheck {
  const value = raw.trim()
  if (value === '') {
    return { ok: false, kind: 'empty', message: 'Masukkan alamat publik EVM yang diawali 0x.' }
  }

  const secret = looksLikeSecret(value)
  if (secret === 'private_key') {
    return {
      ok: false,
      kind: 'secret',
      message:
        'Isian tampak seperti private key, bukan alamat publik. Kolom dikosongkan dan isian tidak disimpan. Jangan bagikan private key ke situs mana pun.',
    }
  }
  if (secret === 'seed_phrase') {
    return {
      ok: false,
      kind: 'secret',
      message:
        'Isian tampak seperti seed phrase. Kolom dikosongkan dan isian tidak disimpan. Jangan pernah mengetik seed phrase di situs mana pun.',
    }
  }

  if (/\.eth$/i.test(value)) {
    return {
      ok: false,
      kind: 'ens',
      message: 'Nama ENS belum didukung. Masukkan alamat 0x yang lengkap.',
    }
  }
  if (!value.startsWith('0x')) {
    return { ok: false, kind: 'format', message: 'Alamat harus diawali 0x (huruf x kecil).' }
  }
  if (value.length !== 42) {
    return {
      ok: false,
      kind: 'format',
      message: `Alamat EVM berisi 42 karakter (0x + 40 heksadesimal). Isian sekarang ${value.length} karakter.`,
    }
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return {
      ok: false,
      kind: 'format',
      message: 'Setelah 0x, alamat hanya boleh berisi angka 0–9 dan huruf a–f.',
    }
  }
  if (!isAddress(value, { strict: true })) {
    return {
      ok: false,
      kind: 'checksum',
      message:
        'Checksum huruf besar/kecil (EIP-55) tidak cocok. Periksa kembali alamat atau tempel versi huruf kecil semua.',
    }
  }
  return { ok: true, address: getAddress(value) }
}

export function shortenAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
