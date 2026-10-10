# Cek hasil — Tahap 1 (dashboard DEMO)

Diperiksa 10 Oktober 2026 di sandbox Linux, Node 22.23.3, npm 11.4.2, Chromium headless (Playwright). Tanda: ✅ diperiksa dan lulus · ⏳ belum diuji · — di luar cakupan tahap 1.

## Perintah teknis

| Perintah | Hasil |
| --- | --- |
| `npm ci` (dari isi ZIP yang diekstrak) | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, 0 warning, 0 error |
| `npm run build` | exit 0; JS 318 kB (gzip 97 kB), CSS 38 kB (gzip 8 kB) |
| Skrip Playwright (dev server + build produksi) | 48/48 cek lulus, juga dijalankan pada salinan hasil ekstrak ZIP |

## Dashboard

- ✅ Render desktop 1280×800, laptop 1024/1100/1200/1440 px, HP 390×844, 320 px, dan tablet 820 px; tanpa scroll horizontal. Tabel muat penuh mulai 1200 px; di bawahnya tampil kartu.
- ✅ Pencarian (tidak peka huruf besar/kecil), filter status, filter jaringan, kombinasi filter, urutan, Reset filter.
- ✅ Jumlah per status dihitung dari data (11 campaign unik setelah deduplikasi).
- ✅ Label DEMO di banner, header, setiap baris/kartu, dan detail; domain fixture memakai `.example` dan tidak dibuka.
- ✅ Loading (skeleton), kosong (skenario Kosong), semua sumber gagal (`?skenario=all_fail`), sebagian gagal + Coba lagi per sumber, batal sebelum dan sesudah ada hasil.
- ✅ Scan awal berjalan sekali di StrictMode; klik ganda **Cari airdrop** tidak memulai scan kedua.
- ✅ Detail: fokus ke judul, Tab tetap di dalam dialog, Escape dan klik latar menutup, fokus kembali ke pemicu.
- ✅ Preview klaim tidak mengirim transaksi; tombol **Kirim lewat MetaMask** menjelaskan alasannya. Campaign berakhir tanpa tombol klaim.
- ✅ Urutan Tab awal: skip link → merek → akun → Cari airdrop → navigasi; skip link memindahkan fokus ke konten.
- ✅ `prefers-reduced-motion` mematikan animasi.
- ✅ Target sentuh HP ≥ 44 px (diukur pada emulasi sentuh).
- ✅ Tidak ada error/warning console pada skenario yang diuji (dev dan build produksi).
- ✅ Kontras 27 pasangan warna aktual ≥ 4,5:1 untuk teks (terendah 5,48:1, badge Berakhir); cincin fokus 11:1.
- ⏳ Pembaca layar nyata (NVDA/VoiceOver) dan zoom teks 200% belum dicoba.
- ⏳ Safari iOS dan Android Chrome di perangkat fisik belum dicoba; HP diuji lewat emulasi Chromium.

## Wallet dan storage

- ✅ **Hubungkan MetaMask** hanya menampilkan penjelasan DEMO; bundle tidak memuat `eth_requestAccounts`.
- ✅ Mode pantau: alamat pendek, checksum EIP-55 salah, private key, dan seed phrase ditolak dengan pesan spesifik; rahasia langsung dikosongkan.
- ✅ Pergantian identitas (DEMO → pantau → DEMO) tidak membawa eligibility, transaksi, atau watchlist identitas lain.
- ⏳ Deteksi EIP-6963 saat MetaMask benar-benar terpasang (headless tanpa extension hanya menguji "tidak terdeteksi").
- — Koneksi/disconnect MetaMask, penolakan koneksi, jaringan salah, IndexedDB (Tahap 2).

## Sumber dan scan

- ✅ Concurrency 2, timeout per percobaan, retry terbatas + backoff, batal, checkpoint per sumber berlabel "Data lama".
- ✅ Waktu scan terakhir per sumber dan total tampil; label usang muncul setelah 60 menit (logika TTL, tidak ditunggu 60 menit nyata).
- ⏳ Auto-refresh saat tab aktif kembali setelah TTL belum diuji dengan waktu nyata.
- — Endpoint nyata, CORS, rate limit, pembanding resmi (Tahap 3).

## Klaim testnet dan HP di LAN

- — Simulasi, biaya, konfirmasi wallet, receipt (Tahap 5).
- ⏳ Akses dari HP melalui `npm run dev -- --host` di jaringan lokal belum dicoba pada perangkat nyata.
