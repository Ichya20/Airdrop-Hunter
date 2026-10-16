# Cek patch pencarian luas

Catatan ini merekam pengujian patch sebelumnya. Syarat Rp0 termasuk gas di bawah telah diganti oleh [kriteria free bernilai](free-bernilai.md); hasil pengujian pembaruannya ada di [cek patch free bernilai](cek-free-bernilai.md).

Baseline: hasil patch Tahap 4 yang diserahkan sebelumnya. Diperiksa 15 Oktober 2026 pada Windows/Node.js 24.15.0. Paket hanya berisi sumber yang berubah/baru; tanpa build aplikasi penuh.

## Pengujian logika

`npm run test:discovery`: **57/57 skenario lulus**. Suite hanya membundel modul tes dan dependensinya untuk Node, tanpa entry aplikasi.

| Kelompok | Skenario |
| --- | ---: |
| Collector luas/paginasi Merkl/identitas campaign | 15 |
| Reward API dan isolasi wallet | 10 |
| Penilaian biaya klaim Rp0 | 7 |
| Timeout/batal scanner dan pengamanan label/cek biaya | 5 |
| Regresi Tahap 3 | 6 |
| Provenance sumber | 4 |
| Retry/limiter | 6 |
| Dashboard/freshness Tahap 4 | 4 |

Kasus mencakup lebih dari delapan kandidat, simbol token yang sudah ada, TVL nol, seluruh kategori, multi-chain, dua protokol bernama sama, testnet, beberapa halaman hingga akhir, halaman berulang/gagal/cacat, pembatalan, HTTP 429/Retry-After, bigint uint256, pending terpisah, poin/PRETGE, akun berubah, hasil terlambat, impor/clear, dan pencegahan label Siap diklaim saat sponsor gas belum terbukti.

Oxlint pada seluruh file kode perubahan: exit 0. TypeScript `--noEmit` dengan entry komponen dashboard/detail, modul reward, dan suite perubahan: tanpa diagnostic. Tidak menjalankan `tsc -b` atau `npm run build`.

## Pemeriksaan komponen browser

Fixture terisolasi memakai komponen asli dashboard, filter, pagination, panel reward, dan hook reward. Respons API, campaign, saldo, serta wallet adalah data tiruan. Entry `App.tsx`/`main.tsx` tidak dibundel, tidak ada `dist`, dan tidak menjalankan koneksi wallet nyata.

- Desktop 1280 px dan HP 390 px: seluruh 245 campaign dapat diakses melalui halaman 100/100/45; seluruh 123 reward melalui 100/23.
- Pencarian menemukan entri terakhir dari seluruh hasil. Penghapusan pencarian kembali ke halaman pertama, bukan memulihkan halaman lama yang sudah tidak sesuai.
- Loading, HTTP 429, hasil gagal, serta balapan pergantian wallet tidak menampilkan nol palsu atau saldo akun sebelumnya.
- Biaya gas pengguna, POINT, PRETGE, dan token uji terlihat terpisah; tidak menjadi klaim Rp0 nyata.
- Tidak ada galat JavaScript halaman atau overflow horizontal dokumen. Tabel reward HP memakai scroll internal.
- Daftar reward dapat dibuka lewat summary native; daftar panjang tidak mendorong pencarian campaign ribuan piksel ke bawah saat pertama dibuka.

Screenshot desktop/HP diperiksa dalam sesi kerja, menggunakan fixture. Gambar tidak disertakan dalam patch sumber.

## Batas verifikasi

- Endpoint dan field diperiksa dari dokumentasi/schema resmi Merkl. Akses JSON langsung dan CORS hosting nyata belum terverifikasi: URL API tidak dapat dibaca lewat alat web sesi ini dan probe jaringan gagal. Ini bukan bukti endpoint global sedang mati.
- Perbedaan keterangan pagination portal dengan schema dicatat di `pencarian-luas.md`; adapter mengikuti schema page 0. Fixture bukan bukti perilaku live.
- Belum ada sponsor gas resmi yang bisa diverifikasi untuk wallet aktif; tidak ada janji semua koin dunia tersedia atau token akan masuk wallet tanpa biaya.
- Tidak ada transaksi, simulasi, konfirmasi MetaMask nyata, receipt, atau pembaca layar/perangkat fisik. Tahap 5 dan audit lengkap tetap belum dikerjakan.
- Build keseluruhan dan suite seluruh proyek tidak dijalankan sesuai permintaan patch saja.

Seluruh `.kiro` dibandingkan dengan baseline Tahap 4 dan tetap identik byte-per-byte. `package-lock.json` serta dependency tidak berubah. Penambahan sumber sebelum Tahap 5 berasal dari permintaan terbaru pengguna, bukan perubahan diam-diam terhadap ketentuan asli.
