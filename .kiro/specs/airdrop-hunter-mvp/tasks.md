# Tasks — airdrop-hunter-mvp

## Tahap 1 — Dashboard DEMO (selesai)

- [x] 1.1 Scaffold dari `create-vite` react-ts (Vite 8, React 19, TS 6); tambah script `typecheck`, `engines`, lockfile npm. _R1_
- [x] 1.2 Domain: tipe status terpisah, jaringan, normalisasi, turunan label dan aksi, validasi alamat (EIP-55, deteksi private key/seed phrase), format waktu id-ID. _R3, R7_
- [x] 1.3 Kontrak `SourceAdapter` + `SourceError`; fixture dan adapter sumber DEMO dengan skenario normal, sebagian gagal, semua gagal, kosong, lambat. _R5_
- [x] 1.4 Scanner: concurrency, timeout, retry/backoff, batal, dedupe scan, checkpoint per sumber, auto-scan saat dibuka, TTL saat tab aktif kembali. _R5_
- [x] 1.5 App shell: header, sidebar desktop, bar bawah HP, hash routing, banner DEMO, skip link, ErrorBoundary, live announcer. _R1, R10_
- [x] 1.6 Dashboard: panel scan, pencarian, filter jaringan, chip status dengan jumlah, urutan, tabel desktop, daftar kartu, keadaan loading/kosong/error/sebagian. _R1, R2, R5_
- [x] 1.7 Detail campaign (dialog native) dan preview klaim DEMO tanpa transaksi. _R4, R8_
- [x] 1.8 Dialog akun: penjelasan MetaMask demo + deteksi EIP-6963, mode pantau alamat publik, salin/lihat alamat penuh. _R6, R7_
- [x] 1.9 Watchlist per identitas (memori tab). _R1, R7_
- [x] 1.10 README, `docs/cek-hasil.md`, `.kiro/steering`.
- [x] 1.11 Typecheck, lint, build; render dan interaksi desktop/HP; kontras; catat yang belum diuji di `docs/cek-hasil.md`.

## Tahap 2 — Wallet dan data lokal (selesai)

- [x] 2.1 Konektor MetaMask Chrome extension resmi via EIP-6963 + EIP-1193 + `viem` (`src/features/wallet/metamask.ts`, `useMetaMaskWallet.ts`), tanpa WalletConnect/SDK mobile. _R6_
- [x] 2.2 Connect, disconnect, penolakan → coba lagi, jaringan salah (`wallet_switchEthereumChain`), pergantian akun/jaringan (`accountsChanged`, `chainChanged`) membersihkan cache tampilan. _R6, R7_
- [x] 2.3 `src/storage`: IndexedDB untuk pengaturan, watchlist, hasil scan per alamat + chain ID + campaign + versi adapter; migrasi v1→v2 dan backup/import JSON. _R9_
- [x] 2.4 Tes bermakna (`src/tests/tahap2.test.ts`): turunan label, pemisahan wallet, persistensi setelah refresh, dan migrasi/impor cadangan. _R3, R7, R9_

## Tahap 3 — Satu sumber live (selesai)

- [x] 3.1 `docs/sumber-data.md`: kandidat, endpoint nyata (`https://api.llama.fi/protocols`), format respons, CORS di browser target, autentikasi, rate limit, bukti sumber resmi (Arbitrum & Uniswap). _R5_
- [x] 3.2 Adapter live di `src/adapters/sources` (`liveDefiLlamaAdapter.ts`, `rateLimit.ts`, `index.ts`); rate limit per sumber + penghormatan `Retry-After` HTTP 429; fallback "sumber belum didukung"/checker resmi bila CORS atau secret menghalangi. Tanpa proxy cloud. _R5_
- [x] 3.3 Bandingkan minimal satu campaign (Arbitrum `$ARB` `0x67a24CE4321aB3aF51c2D0a4801c3E111D88C9d9` di chain 42161 & Uniswap `$UNI` `0x090D4613473dEE047c3f2706764f49E0821D256e` di chain 1) dengan sumber resmi; campaign historis berlabel Berakhir (`ended`). _R3_

## Tahap 4 — Eligibility

- [ ] 4.1 Adapter eligibility resmi (API, proof/snapshot, atau pembacaan kontrak); gagal/timeout tetap `unknown`; simpan alasan, sumber, waktu, aturan. _R3_
- [ ] 4.2 Status usang + cek ulang saat membuka detail atau memulai klaim; uji wallet berbeda, sumber gagal, campaign berakhir, sudah diklaim. _R3, R4_

## Tahap 5 — Klaim testnet

- [ ] 5.1 Satu claim adapter testnet terdokumentasi; konfigurasi testnet terpisah dari mainnet. _R8_
- [ ] 5.2 `simulateContract`, estimasi biaya, preview, konfirmasi wallet, cegah kirim ganda, receipt + bukti event. _R8_
- [ ] 5.3 Tangani pending, rejected, reverted, wrong network, timeout, insufficient gas; timeout tidak langsung gagal permanen. _R8_

## Audit

- [ ] A.1 Audit Cari airdrop, detail, koneksi wallet, klaim testnet: keyboard, fokus dialog, kontras, target sentuh, layar kecil, pengurangan animasi, pembaca layar nyata. PWA hanya jika diminta. _R10_
