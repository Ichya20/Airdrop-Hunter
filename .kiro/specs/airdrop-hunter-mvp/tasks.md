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

## Tahap 2 — Wallet dan data lokal

- [ ] 2.1 Pasang wagmi + viem + TanStack Query sesuai dokumentasi resmi terbaru; konektor MetaMask saja, tanpa WalletConnect/SDK mobile. _R6_
- [ ] 2.2 Connect, disconnect, penolakan → coba lagi, jaringan salah, pergantian akun/jaringan membersihkan cache tampilan. _R6, R7_
- [ ] 2.3 `src/storage`: IndexedDB untuk pengaturan, watchlist, hasil scan per alamat + chain ID + campaign + versi adapter; migrasi dan backup/import. _R9_
- [ ] 2.4 Tes bermakna: turunan label, pemisahan wallet, persistensi setelah refresh. _R3, R7, R9_

## Tahap 3 — Satu sumber live

- [ ] 3.1 `docs/sumber-data.md`: kandidat, endpoint nyata, format respons, CORS di browser target, autentikasi, rate limit, bukti sumber. _R5_
- [ ] 3.2 Adapter live di `src/adapters/sources`; rate limit per sumber; fallback "sumber belum didukung"/checker resmi bila CORS atau secret menghalangi. Tanpa proxy cloud. _R5_
- [ ] 3.3 Bandingkan minimal satu campaign dengan sumber resmi; campaign historis berlabel Berakhir. _R3_

## Tahap 4 — Eligibility

- [ ] 4.1 Adapter eligibility resmi (API, proof/snapshot, atau pembacaan kontrak); gagal/timeout tetap `unknown`; simpan alasan, sumber, waktu, aturan. _R3_
- [ ] 4.2 Status usang + cek ulang saat membuka detail atau memulai klaim; uji wallet berbeda, sumber gagal, campaign berakhir, sudah diklaim. _R3, R4_

## Tahap 5 — Klaim testnet

- [ ] 5.1 Satu claim adapter testnet terdokumentasi; konfigurasi testnet terpisah dari mainnet. _R8_
- [ ] 5.2 `simulateContract`, estimasi biaya, preview, konfirmasi wallet, cegah kirim ganda, receipt + bukti event. _R8_
- [ ] 5.3 Tangani pending, rejected, reverted, wrong network, timeout, insufficient gas; timeout tidak langsung gagal permanen. _R8_

## Audit

- [ ] A.1 Audit Cari airdrop, detail, koneksi wallet, klaim testnet: keyboard, fokus dialog, kontras, target sentuh, layar kecil, pengurangan animasi, pembaca layar nyata. PWA hanya jika diminta. _R10_
