# Cek patch free bernilai

Baseline: proyek dari ZIP pengguna `(2)` yang telah diberi patch Tahap 4 dan patch pencarian luas. Diperiksa 16 Oktober 2026 pada Windows/Node.js 24.15.0. Paket berisi sumber yang berubah/baru; tidak ada build aplikasi keseluruhan.

## Pengujian logika

`npm run test:value`: **79/79 skenario lulus**, menggunakan transport dan wallet tiruan. Script hanya membundel modul tes beserta dependensinya untuk Node; bukan entry aplikasi atau build produksi.

| Kelompok | Skenario |
| --- | ---: |
| Harga, likuiditas, kecocokan token/jaringan, timeout, TTL | 13 |
| Kriteria free bernilai, gas terpisah, testnet dan sumber | 10 |
| Antrean pasar, seluruh token, progres dan isolasi wallet | 9 |
| Regresi katalog dan paginasi sumber | 15 |
| Regresi API reward dan identitas wallet | 10 |
| Aturan biaya distribusi gratis | 7 |
| Integrasi label, cek pra-klaim, scanner dan detail pasar | 7 |
| Regresi eligibility dashboard Tahap 4 | 4 |
| Provenance sumber | 4 |

Kasus mencakup 325 token reward tanpa batas total; harga pada base token yang benar; penolakan quote-token saja; pemilihan likuiditas tertinggi tanpa ambang USD buatan; harga sangat kecil; data nol/cacat; sumber gagal; timeout meski transport mengabaikan signal; abort; hasil usang; dan wallet/jaringan/sumber berubah. Eligibility sah tanpa harga pasar tidak menjadi siap klaim. Gas pengguna tidak menggagalkan distribusi gratis. Kontrak distributor tidak dipakai sebagai alamat token reward. Tidak ada bukti transaksi yang dibuat dari laporan API.

TypeScript terarah `--noEmit` dengan entry App dan runner tes (termasuk pemeriksaan kompatibilitas runner lama) lulus. Oxlint pada kode yang berubah bersih. Pemeriksaan tersebut tidak mengompilasi atau menghasilkan aplikasi penuh.

## Pemeriksaan komponen browser

Fixture terisolasi menggunakan komponen dashboard, panel reward, hook dan adapter pasar asli, dengan respons API dan alamat wallet tiruan. Entry App/main tidak dibundel. Desktop 1280 px dan HP 390 px diperiksa:

- Seluruh 245 campaign tersedia melalui halaman 100/100/45; 123 reward melalui halaman 100/23. Pencarian menemukan entri terakhir dan mengembalikan halaman pertama saat dihapus.
- Daftar reward tertutup saat awal; summary native dapat dibuka dengan Enter. Daftar panjang tidak menutupi pencarian campaign sebelum dibuka.
- Progres pasar terlihat. Dari empat token positif fixture, hanya satu memiliki harga/likuiditas valid; ketiga lainnya tetap belum terverifikasi karena alamat base salah, likuiditas nol, atau HTTP 429.
- Harga USD, likuiditas pool dan tautan DEX Screener yang dipatok terlihat. Data kedaluwarsa mengubah jumlah kandidat menjadi nol; pembacaan segar memulihkannya.
- Gas pengguna tidak membatalkan kandidat. Respons wallet lama yang terlambat tidak muncul pada wallet baru. Kegagalan API tidak ditampilkan sebagai saldo nol.
- Tidak ada galat JavaScript atau overflow horizontal dokumen; tabel lebar memakai scroll internal pada HP. Kolom gas diberi lebar cukup agar tetap terbaca.

Screenshot diperiksa dalam sesi kerja; berkas fixture, hasil browser dan gambar berada di scratch dan tidak disertakan dalam patch sumber. Pemeriksaan ini tidak menjalankan App, koneksi MetaMask nyata, atau transaksi.

## Batas verifikasi

Schema dan aturan biaya dibaca dari sumber resmi: [DEX Screener API](https://docs.dexscreener.com/api/reference), [Merkl About / Fees](https://app.merkl.fr/about), serta schema Merkl yang dijelaskan pada dokumentasi patch sebelumnya. Pembacaan endpoint JSON dan CORS pada hosting nyata belum terverifikasi. Respons tiruan tidak membuktikan adanya reward mainnet untuk wallet pengguna.

Harga dan likuiditas merupakan observasi pasar; bukan jaminan transfer, tidak adanya pembatasan jual, atau hasil pencairan tertentu. Tidak ada tanda tangan, transaksi, simulasi kontrak, receipt, atau pengujian MetaMask nyata. Tahap 5 tetap belum aktif.

Requirement asli R1–R10 dipertahankan byte-per-byte; hanya R11 ditambahkan untuk merekam arahan pengguna terbaru. File steering, arsitektur wallet, claim adapter, package-lock dan dependency tetap sama. Keberhasilan penerapan diff diperiksa terpisah melalui `git apply --check` dan rekonstruksi sumber byte-per-byte.
