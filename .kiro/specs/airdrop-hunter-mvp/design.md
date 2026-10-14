# Design — airdrop-hunter-mvp (Tahap 1 & Tahap 2)

## Ringkasan

SPA statis React 19 + TypeScript 6 + Vite 8, dibuat dari template resmi `create-vite` (react-ts).
- **Tahap 1**: Dashboard responsif, scanner multi-sumber dengan timeout/retry/batal, filter & urutan, detail drawer, mode pantau alamat publik, dan fixture berlabel DEMO.
- **Tahap 2**: Koneksi **MetaMask Chrome extension** melalui EIP-6963 (`io.metamask`) + EIP-1193 + `viem` (tanpa WalletConnect atau SDK mobile), penanganan penolakan koneksi (`4001`), perpindahan jaringan (`wallet_switchEthereumChain`), sinkronisasi `accountsChanged`/`chainChanged`, serta penyimpanan lokal **IndexedDB** (`src/storage`) per alamat + chain ID + campaign ID + versi adapter lengkap dengan migrasi skema (v1 → v2) dan fitur ekspor/impor cadangan JSON.

## Keputusan

| Topik | Keputusan | Alasan |
| --- | --- | --- |
| Routing | Hash: `#/` dan `#/watchlist` | Back/Forward berfungsi di hosting statis atau server LAN tanpa konfigurasi rewrite. |
| State & Storage | `useReducer`/`useState` + `src/storage` (IndexedDB `airdrop-hunter-db` v2 dengan fallback memori) | Menyimpan pengaturan, watchlist per identitas, checkpoint sumber, dan hasil scan per `addressScope::chainId::campaignId::adapterVersion`. |
| Wallet | EIP-6963 (`rdns` `io.metamask`) + EIP-1193 (`eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `wallet_switchEthereumChain`, `wallet_revokePermissions`) + `viem` | Mematuhi batasan "konektor MetaMask saja, tanpa WalletConnect/SDK mobile" tanpa membebani bundle dengan dependensi mobile SDK, serta menjaga sinkronisasi `package-lock.json` untuk `npm ci`. |
| Validasi alamat | `viem` (`isAddress` strict, `getAddress`) | Checksum EIP-55 memerlukan keccak; deteksi private key & seed phrase langsung mengosongkan input dan menolak penyimpanan/impor. |
| Identitas | `none` \| `demo` \| `watch {address}` \| `metamask {address, chainId}` | Pergantian akun atau jaringan langsung membersihkan cache tampilan agar data satu wallet tidak pernah bocor ke wallet lain. |
| Styling | CSS variables + CSS biasa (Grid/Flexbox) | Proyek kecil dan terukur; tanpa dependensi CSS tambahan. |

## Struktur

```
src/app/                 App shell, header, navigasi, hash route, ErrorBoundary, live announcer
src/components/          Ikon, badge status/asal/jaringan, dialog native, alamat, empty state
src/features/dashboard/  Filter + urutan (fungsi murni), tabel, daftar HP, detail, watchlist
src/features/scanner/    runScan (orkestrasi), useScanner (state, TTL, visibilitas, hidrasi), panel scan
src/features/wallet/     Identitas, dialog akun, deteksi EIP-6963, konektor EIP-1193 & hook useMetaMaskWallet
src/features/claims/     Preview klaim (cek akun & jaringan MetaMask), resolver riwayat transaksi
src/adapters/sources/    Kontrak SourceAdapter, SourceError, hasil terstruktur
src/adapters/eligibility Router eligibility per identitas & validasi cache lokal
src/adapters/claims/     Registry claim adapter (Tahap 1–2: kosong; klaim testnet di Tahap 5)
src/domain/              Tipe, jaringan, normalisasi, turunan label/aksi, validasi alamat, format waktu
src/storage/             IndexedDB v2 (`index.ts`, `keys.ts`, `types.ts`), migrasi skema, ekspor/impor JSON
src/tests/               Suite pengujian otomatis Tahap 2 (`tahap2.test.ts`)
src/demo/                Fixture + adapter sumber DEMO dengan skenario
src/styles/              Token, base, layout, komponen
```

## Model data (`src/domain/types.ts` & `src/storage/types.ts`)

- `Campaign`: `id` ternormalisasi `chainId:slug-proyek:slug-nama`, `status`, `origin`, `foundIn[]`, `officialUrl`/`checkerUrl` (https saja), `sourceVerified` + `sourceEvidence`, `deadline` (ISO atau `null`), `requirements[]`, `allocation` (atau `null`), `claimMethod`, `contract {chainId, address}` (atau `null`), `checkedAt`, `adapterVersion`.
- `EligibilityResult`: `status`, `reason`, `rule`, `source`, `checkedAt`.
- `TxRecord`: `status`, `hash`, `proof`, `updatedAt`, `note`. Terkonfirmasi tanpa `proof` diperlakukan sebagai menunggu.
- `Identity`: `none` | `demo` | `watch {address}` | `metamask {address, chainId}`.
- `StoredScanRecord`: disimpan di object store `scan_records` dengan kunci gabungan `${addressScope}::${chainId}::${campaignId}::${adapterVersion}`. Saat membaca dari storage, `isRecordMatchingIdentity` memastikan kesesuaian alamat, chain ID, campaign ID, dan versi adapter.

## Koneksi MetaMask & Penanganan Jaringan (`src/features/wallet/`)

- **Deteksi (`useMetaMaskDiscovery`)**: membaca event `eip6963:announceProvider` untuk `io.metamask` (dengan fallback `window.ethereum?.isMetaMask` untuk lingkungan pengujian) tanpa memanggil `eth_requestAccounts` secara otomatis.
- **Koneksi (`connectMetaMaskProvider`)**: memanggil `eth_requestAccounts` dan `eth_chainId` saat pengguna menekan **Hubungkan MetaMask**. Tidak pernah meminta tanda tangan (`personal_sign` / `eth_signTypedData`) untuk membaca data publik.
- **Pemulihan sesi pasif (`readPassiveMetaMaskSession`)**: bila pengaturan di IndexedDB mencatat identitas `metamask`, aplikasi memeriksa `eth_accounts` secara pasif saat dimuat ulang tanpa memunculkan popup.
- **Penanganan error (`classifyWalletError`)**: menerjemahkan kode EIP-1193 `4001` (ditolak pengguna), `-32002` (permintaan masih menggantung di popup), dan `4902` (jaringan belum ditambahkan di MetaMask) menjadi pesan Bahasa Indonesia yang jelas disertai tombol **Coba lagi**.
- **Pindah jaringan (`switchMetaMaskChain`)**: memanggil `wallet_switchEthereumChain` baik dari dialog akun, banner peringatan jaringan tidak dikenal, maupun langsung dari **Preview klaim** apabila jaringan MetaMask berbeda dari jaringan campaign.
- **Reaktivitas (`accountsChanged`, `chainChanged`, `disconnect`)**: memperbarui identitas secara langsung, menutup drawer detail yang sedang terbuka, dan mengosongkan cache tampilan wallet sebelumnya.
