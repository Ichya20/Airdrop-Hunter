# Design — airdrop-hunter-mvp (Tahap 1 – Tahap 3)

## Ringkasan

SPA statis React 19 + TypeScript 6 + Vite 8, dibuat dari template resmi `create-vite` (react-ts).
- **Tahap 1**: Dashboard responsif, scanner multi-sumber dengan timeout/retry/batal, filter & urutan, detail drawer, mode pantau alamat publik, dan fixture berlabel DEMO.
- **Tahap 2**: Koneksi **MetaMask Chrome extension** melalui EIP-6963 (`io.metamask`) + EIP-1193 + `viem`, penanganan penolakan koneksi (`4001`), perpindahan jaringan (`wallet_switchEthereumChain`), sinkronisasi `accountsChanged`/`chainChanged`, serta penyimpanan lokal **IndexedDB** (`src/storage`) per alamat + chain ID + campaign ID + versi adapter lengkap dengan migrasi skema (v1 → v2) dan ekspor/impor cadangan JSON.
- **Tahap 3**: Integrasi **sumber data live publik** (`https://api.llama.fi/protocols`) yang mendukung CORS langsung dari browser tanpa API key atau proxy cloud, dilengkapi pembatasan laju (*rate limit*) per sumber + penanganan `Retry-After` HTTP 429 (`src/adapters/sources/rateLimit.ts`), pembandingan silang terhadap dokumentasi kontrak resmi proyek (Arbitrum `$ARB` & Uniswap `$UNI` yang ditandai `ended` / **Berakhir**), serta pemisahan tegas label asal data (`LIVE` vs `DEMO`).

## Keputusan

| Topik | Keputusan | Alasan |
| --- | --- | --- |
| Routing | Hash: `#/` dan `#/watchlist` | Back/Forward berfungsi di hosting statis atau server LAN tanpa konfigurasi rewrite. |
| State & Storage | `useReducer`/`useState` + `src/storage` (IndexedDB `airdrop-hunter-db` v2 dengan fallback memori) | Menyimpan pengaturan (termasuk `sourceMode`), watchlist per identitas, checkpoint sumber, dan hasil scan per `addressScope::chainId::campaignId::adapterVersion`. |
| Wallet | EIP-6963 (`rdns` `io.metamask`) + EIP-1193 + `viem` | Mematuhi batasan "konektor MetaMask saja, tanpa WalletConnect/SDK mobile" serta menjaga sinkronisasi `package-lock.json` untuk `npm ci`. |
| Sumber Live (Tahap 3) | `GET https://api.llama.fi/protocols` + verifikasi silang registri kontrak resmi proyek (`liveDefiLlamaAdapter.ts`) | Mendukung `Access-Control-Allow-Origin: *` di browser tanpa API key rahasia atau proxy cloud. |
| Rate Limit & TTL | `createSourceRateLimiter` (jeda 15 detik antar-scan otomatis, maks 6 req/menit, hormati `Retry-After` HTTP 429) + TTL 60 menit | Mencegah pemanggilan berlebih ke API publik dan mempertahankan checkpoint terakhir bila sumber sedang dibatasi. |

## Struktur

```
src/app/                 App shell, header, navigasi, hash route, ErrorBoundary, live announcer
src/components/          Ikon, badge status/asal/jaringan, dialog native, alamat, empty state
src/features/dashboard/  Filter + urutan (fungsi murni), tabel, daftar HP, detail, watchlist
src/features/scanner/    runScan (orkestrasi), useScanner (state, TTL, visibilitas, hidrasi, filter sumber), panel scan
src/features/wallet/     Identitas, dialog akun, deteksi EIP-6963, konektor EIP-1193 & hook useMetaMaskWallet
src/features/claims/     Preview klaim (cek akun & jaringan MetaMask), resolver riwayat transaksi
src/adapters/sources/    Kontrak SourceAdapter, SourceError, rateLimit.ts, liveDefiLlamaAdapter.ts, registry index.ts
src/adapters/eligibility Router eligibility per identitas & validasi cache lokal
src/adapters/claims/     Registry claim adapter (klaim testnet di Tahap 5)
src/domain/              Tipe, jaringan, normalisasi, turunan label/aksi, validasi alamat, format waktu
src/storage/             IndexedDB v2 (`index.ts`, `keys.ts`, `types.ts`), migrasi skema, ekspor/impor JSON
src/tests/               Suite pengujian otomatis Tahap 2 (`tahap2.test.ts`) & Tahap 3 (`tahap3.test.ts`)
src/demo/                Fixture + adapter sumber DEMO dengan skenario
src/styles/              Token, base, layout, komponen
docs/                    Laporan pemeriksaan (`cek-hasil.md`), dokumentasi sumber live (`sumber-data.md`), dan aset README
```
