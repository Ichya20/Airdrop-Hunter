# AirdropHunter — optimasi sebelum Tahap 5

Paket ini adalah proyek lengkap yang diperbarui dari `AirdropHunter-main.rar`, bukan patch yang harus dipasang berurutan. Catatan `PATCH-NOTES.md` dan dokumen tahap terdahulu tetap disertakan sebagai riwayat; panduan ini berlaku untuk paket terbaru.

## Menjalankan proyek

1. Ekstrak ZIP ini ke folder baru, lalu buka folder `AirdropHunter-Optimasi` yang berisi `package.json`.
2. Gunakan Node.js `^20.19.0` atau `>=22.12.0`.
3. Jalankan:

```sh
npm ci
npm run dev
```

Buka `http://localhost:5173`. Akses API live memerlukan internet. Folder `node_modules` tidak disertakan; `npm ci` menginstal dependency dari lockfile yang sama.

## Menjalankan hasil produksi

Folder `dist/` berisi build produksi yang sudah diuji. Setelah dependency tersedia, gunakan:

```sh
npm run preview -- --host 127.0.0.1 --port 4173
```

Buka `http://127.0.0.1:4173`. Untuk hosting statis, unggah seluruh isi `dist/`, termasuk folder `assets/`, ke satu lokasi. Sajikan lewat HTTP/HTTPS, bukan membuka `index.html` langsung dengan `file://`. Setelah mengubah kode, jalankan `npm run build` untuk memperbarui `dist/`.

Penyimpanan lokal mengikuti origin browser (protokol, host, dan port). Sebelum berpindah ke origin baru, ekspor cadangan melalui Akun → Data lokal & cadangan; impor di origin tujuan jika diperlukan.

## Penggunaan harian

- Sumber live menjadi default. Pilih MetaMask atau alamat publik untuk melihat reward dan menyimpan watchlist.
- Cari/filter campaign seperti biasa. Setiap halaman menampilkan maksimal 30 campaign; semua hasil tetap tersedia lewat tombol Berikutnya/Sebelumnya.
- Rincian sumber dan cadangan disimpan dalam panel yang dapat dibuka saat diperlukan.
- Entri reward baru dirender saat panelnya dibuka; seluruh entri dapat diakses lewat pagination.
- Opsi simulasi hanya tersedia saat membuka URL eksplisit seperti `http://localhost:5173/?skenario=normal`. Mode ini untuk pengujian fixture DEMO.
- Klaim kontrak dan pengiriman transaksi Tahap 5 belum diaktifkan.

## Memeriksa hasil

```sh
npm test
npm run lint
npm run build
```

164 skenario lulus pada paket ini. Hasil pengukuran dan batas pengujian tercatat di [docs/optimasi-sebelum-tahap5.md](docs/optimasi-sebelum-tahap5.md).
