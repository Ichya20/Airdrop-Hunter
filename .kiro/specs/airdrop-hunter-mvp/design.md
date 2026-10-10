# Design — airdrop-hunter-mvp (fokus Tahap 1)

## Ringkasan

SPA statis React 19 + TypeScript 6 + Vite 8, dibuat dari template resmi `create-vite` (react-ts). Tahap 1 tidak memakai jaringan: sumber, eligibility, dan riwayat transaksi berasal dari fixture `src/demo` berlabel DEMO. Antarmuka adapter sudah dipisah sehingga sumber live (Tahap 3), eligibility (Tahap 4), dan klaim testnet (Tahap 5) dapat dipasang tanpa mengubah komponen UI.

## Keputusan

| Topik | Keputusan | Alasan |
| --- | --- | --- |
| Routing | Hash: `#/` dan `#/watchlist` | Back/Forward berfungsi di hosting statis atau server LAN tanpa konfigurasi rewrite. |
| State | `useReducer`/`useState` + hook `useScanner`; memori tab | Cukup untuk Tahap 1. IndexedDB (`src/storage`) dibuat di Tahap 2. |
| Wallet | Tidak memanggil `eth_requestAccounts`. Deteksi MetaMask via EIP-6963 (`rdns` `io.metamask`) hanya sebagai info | Sesuai prompt Tahap 1: tombol wallet menjelaskan demo. wagmi + TanStack Query ditunda ke Tahap 2. |
| Validasi alamat | `viem` (`isAddress` strict, `getAddress`) | Checksum EIP-55 memerlukan keccak; viem memang bagian stack Tahap 2. |
| Identitas awal | Akun DEMO (fixture); pilihan lain: mode pantau alamat atau tanpa akun | Menampilkan seluruh variasi label sejak awal; mode pantau menunjukkan pemisahan identitas. |
| Styling | CSS variables + CSS biasa (Grid/Flexbox) | Proyek kecil; Tailwind tidak memberi manfaat yang jelas. |
| Font | Font system; angka tabular; alamat dan chain ID monospace | Sesuai brief, tanpa unduhan font. |
| Build | `base: './'` | Folder `dist` dapat disajikan dari subpath atau server statis LAN. |

## Struktur

```
src/app/                 App shell, header, navigasi, hash route, ErrorBoundary, live announcer
src/components/          Ikon, badge status/asal/jaringan, dialog native, alamat, empty state
src/features/dashboard/  Filter + urutan (fungsi murni), tabel, daftar HP, detail, watchlist
src/features/scanner/    runScan (orkestrasi), useScanner (state, TTL, visibilitas), panel scan
src/features/wallet/     Identitas, dialog akun, deteksi EIP-6963
src/features/claims/     Preview klaim DEMO, resolver riwayat transaksi
src/adapters/sources/    Kontrak SourceAdapter, SourceError, hasil terstruktur
src/adapters/eligibility Router eligibility per identitas
src/adapters/claims/     Registry claim adapter (Tahap 1: selalu kosong)
src/domain/              Tipe, jaringan, normalisasi, turunan label/aksi, validasi alamat, format waktu
src/demo/                Fixture + adapter sumber DEMO dengan skenario
src/styles/              Token, base, layout
```

## Model data (`src/domain/types.ts`)

- `Campaign`: `id` ternormalisasi `chainId:slug-proyek:slug-nama`, `status`, `origin`, `foundIn[]`, `officialUrl`/`checkerUrl` (https saja), `sourceVerified` + `sourceEvidence`, `deadline` (ISO atau `null`), `requirements[]`, `allocation` (atau `null`), `claimMethod`, `contract {chainId, address}` (atau `null`), `checkedAt`, `adapterVersion`.
- `EligibilityResult`: `status`, `reason`, `rule`, `source`, `checkedAt`.
- `TxRecord`: `status`, `hash`, `proof`, `updatedAt`, `note`. Terkonfirmasi tanpa `proof` diperlakukan sebagai menunggu.
- `Identity`: `none` | `demo` | `watch {address}`. Kunci identitas dipakai untuk eligibility, transaksi, dan watchlist; tidak ada cache lintas identitas.

Normalisasi (`normalizeCampaign`) memangkas teks, memvalidasi chain ID, URL https, tenggat, dan alamat kontrak (harus satu chain dengan campaign). Entri tidak valid dibuang. Teks eksternal hanya dirender sebagai teks React; tidak ada HTML/script yang dieksekusi.

## Turunan label (`src/domain/status.ts`)

Urutan aturan, berhenti pada yang pertama cocok:

1. Transaksi terkonfirmasi + bukti → **Sudah diklaim**
2. Status berakhir atau tenggat lewat → **Berakhir**
3. Eligibility tidak memenuhi syarat → **Tidak memenuhi syarat**
4. Sumber belum diverifikasi → **Belum terverifikasi**
5. Klaim terbuka: eligible → **Siap diklaim**; perlu tugas → **Peluang**; unknown → **Belum terverifikasi**
6. Peluang → **Peluang**

| Label | Aksi utama |
| --- | --- |
| Siap diklaim | Klaim (metode kontrak) / Situs klaim (situs resmi) / Lihat transaksi (jika tx menunggu) |
| Peluang | Lihat syarat |
| Belum terverifikasi | Periksa (checker resmi bila ada) |
| Tidak memenuhi syarat | Lihat alasan |
| Sudah diklaim | Lihat transaksi |
| Berakhir | Lihat arsip; klaim nonaktif |

## Scanner

- `runScan(adapters, {concurrency: 2, timeoutMs: 8000, retries: 1, backoffMs: 600}, signal, onEvent)`. Tiap percobaan memakai `AbortController` sendiri yang terhubung ke sinyal batal pengguna dan timer timeout. Hanya error `network`, `timeout`, `http` yang di-retry.
- `useScanner` menyimpan state per sumber: `phase`, `attempt`, `error`, `lastSuccessAt`, dan checkpoint campaign terakhir yang berhasil. Sumber gagal/dibatalkan mempertahankan checkpoint berlabel data lama.
- Dedupe: `start()` diabaikan bila `AbortController` aktif masih ada. Event dari run lama diabaikan melalui `runId`.
- Pemicu: manual, `open` (tanpa data, dijadwalkan `setTimeout` agar aman di StrictMode), `visible` (Page Visibility API + TTL 60 menit), dan `retry` per sumber.
- Hasil digabung dan dideduplikasi menurut `id`; `foundIn` menjadi gabungan sumber; data dari sumber terverifikasi diutamakan.
- Skenario DEMO: normal, sebagian gagal (pulih saat Coba lagi), semua gagal, kosong, lambat. Skenario awal dapat dipilih lewat URL (`?skenario=all_fail`) untuk menguji keadaan pertama kali dibuka.

## Eligibility, transaksi, klaim (Tahap 1)

- Akun DEMO + campaign demo → fixture eligibility/transaksi. Mode pantau dan tanpa akun → `unknown` dengan alasan yang menjelaskan; riwayat transaksi kosong.
- `getClaimAdapter()` selalu `null`. Preview klaim menampilkan cek pra-klaim dan menyatakan adapter tidak tersedia; tombol kirim hanya menjelaskan bahwa tidak ada permintaan wallet atau transaksi.

## UI

- Desktop ≥ 1024 px: header penuh (merek, jaringan, akun, Cari airdrop), sidebar, area utama: banner DEMO + skenario, panel scan, filter, chip status dengan jumlah, lalu tabel (≥ 1200 px) atau grid kartu (1024–1199 px, karena tabel butuh ±900 px).
- < 1024 px: header ringkas, bar bawah (Dashboard, Cari airdrop, Watchlist) dengan safe area, daftar kartu (1–2 kolom), pemilih skenario dan status per sumber diringkas dalam `<details>` (terbuka otomatis bila ada sumber gagal). Detail tampil layar penuh dengan header dan aksi tetap terlihat; dialog akun tampil sebagai bottom sheet.
- Token: latar `#0E1218`, permukaan `#171E27`/`#1D2631`, garis `#2B3543`, teks `#E6EDF5`/`#A8B5C7`, aksen `#91D962`, amber `#F2B84B` untuk peluang, ungu `#C3A6FF` khusus label DEMO. Elevasi melalui permukaan yang lebih terang; bayangan ringan hanya untuk dialog.
- Identitas visual: logo reticle + tetesan, radar sweep saat scan, garis scan di header, pola arsir pada banner DEMO. Animasi dimatikan oleh `prefers-reduced-motion`.
- Aksesibilitas: `<dialog>` native (fokus awal ke judul, Escape, klik latar, fokus kembali), chip status sebagai radio group native, `aria-disabled` untuk tombol yang sedang tidak bisa dipakai agar tetap bisa difokus dan menjelaskan alasannya, live region untuk scan dan pergantian identitas, skip link, target 44 px pada pointer kasar/layar kecil.

## Penanganan error

- `ErrorBoundary` di root menampilkan pesan dan tombol pulih, bukan layar kosong.
- `SourceError` (`network`, `timeout`, `http`, `invalid`, `cors`, `unsupported`, `aborted`) menghasilkan pesan per sumber.
- Salin alamat memakai Clipboard API dengan fallback seleksi teks bila konteks tidak aman (misalnya HTTP LAN).

## Verifikasi

`npm run typecheck`, `npm run lint`, `npm run build`; render desktop 1280×800, HP 390×844, 320 px, dan tablet 820 px dengan Chromium headless; uji interaksi pencarian, filter, detail, Escape/fokus, preview klaim, mode pantau, skenario gagal/kosong/batal; skrip kontras token. Hasil dicatat di `docs/cek-hasil.md`. Unit test ditunda ke Tahap 2/4 (lihat tasks).
