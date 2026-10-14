# Cek hasil — perapihan Tahap 3, v0.3.1

Diperiksa 14 Oktober 2026 pada Windows, Node.js 24.15.0. Perubahan ini tidak menambahkan eligibility resmi (Tahap 4) atau transaksi klaim (Tahap 5).

## Pemeriksaan yang dijalankan ulang

| Pemeriksaan | Hasil |
| --- | --- |
| npm test | 43/43 skenario lulus |
| npm run lint | Exit 0, tanpa error atau warning |
| npm run build | TypeScript dan build produksi lulus |
| Pengujian Chromium headless | 14/14 pemeriksaan lulus; tanpa error JavaScript halaman |
| Lebar desktop 1280 px dan HP 390 px | Tanpa scroll horizontal setelah layout selesai |

Suite otomatis berisi 14 skenario Tahap 2, 6 Tahap 3, 7 validasi backup, 6 retry/limiter, 4 provenance sumber, dan 6 keputusan cache/TTL. Beberapa skenario backup menguji banyak variasi input rusak.

`npm test` memakai bundler Vite yang sudah menjadi dependency proyek untuk menjalankan suite TypeScript pada Node. Tidak perlu menginstal test runner baru.

## Pemeriksaan browser

Pengujian memakai bundle development dari entry aplikasi yang sama (`src/main.tsx`), termasuk React StrictMode, CSS aplikasi dan IndexedDB browser nyata. Fixture dibuka sebagai file lokal; API dan provider wallet memakai respons tiruan. Ini menguji aplikasi dan persistensi browser, bukan akses endpoint live, CORS hosting, atau extension MetaMask fisik.

1. StrictMode menghasilkan satu fetch awal; arsip berlabel ARSIP LOKAL.
2. Refresh memakai checkpoint IndexedDB segar tanpa fetch tambahan.
3. Progres refresh selektif menghitung satu target aktif, bukan sumber dari cache.
4. TTL dihitung per sumber: live usang diperbarui, DEMO segar dipertahankan.
5. Hasil sukses kosong dipulihkan tanpa scan berulang; pesan kosong benar.
6. Checkpoint versi adapter lama diabaikan dan sumber diperbarui.
7. Ringkasan mengikuti mode DEMO setelah mode semua gagal sebagian.
8. Layout desktop dan HP tanpa scroll horizontal.
9. Sesi tersimpan disinkronkan lewat pembacaan pasif ke provider tiruan.
10. Connect terlambat tidak mengganti pilihan mode pantau yang lebih baru.
11. Impor backup kosong menghapus hasil lama; tidak menyimpan ulang checkpoint lama atau menyisakan skeleton loading.
12. Bersihkan cache saat scan berjalan menampilkan pesan dan mempertahankan data.
13. Bersihkan cache saat idle menghapus checkpoint serta hasil layar; scan manual tetap tersedia.
14. MetaMask tersimpan tanpa extension dipulihkan sebagai alamat pantau.

Screenshot [desktop](screenshots/tahap3-maintenance-desktop.png) dan [HP](screenshots/tahap3-maintenance-mobile.png) memakai data API tiruan. Test Protocol adalah fixture, bukan rekomendasi atau bukti campaign airdrop.

## Batas verifikasi

- Extension MetaMask fisik, popup approval nyata, CORS hosting, dan API DefiLlama live belum diuji pada sesi perapihan ini.
- Audit aksesibilitas lengkap dengan pembaca layar dan perangkat fisik masih belum selesai.
- Eligibility resmi, simulasi kontrak, gas, pengiriman transaksi, dan receipt belum tersedia.
- Laporan ZIP awal mencatat pemeriksaan versi sebelumnya di Linux; itu bukan bukti pengujian ulang versi ini.

## Perubahan yang diverifikasi

Cache menunggu hidrasi storage dan menghitung TTL per sumber, termasuk hasil kosong. Checkpoint menyimpan versi adapter; cache lama tidak dianggap data versi baru. Retry menunggu backoff, petunjuk server, dan limiter, serta bisa dibatalkan. Arsip lokal tidak mengaku diperiksa melalui API; URL terkurasi tetap dipertahankan. Import memvalidasi schema sebelum mengganti storage dan menerima hash transaksi publik pada field yang sesuai. Reset/import/clear menjaga tampilan dan data lokal tetap konsisten.

## Koreksi kesesuaian terhadap ZIP asli

`requirements.md`, `tasks.md`, dan `.kiro/steering/tech.md` dipulihkan identik dengan ZIP asli. Ketentuan tidak diubah untuk menyesuaikan implementasi. Ketidaksesuaian wagmi/TanStack Query pada kode awal tetap menjadi catatan: perapihan ini tidak mengganti arsitektur wallet.

Regresi screening seed phrase pada backup telah diperbaiki. Parser menolak kandidat BIP39 dengan jumlah kata standar dan kecocokan wordlist dalam 10 bahasa yang sudah tersedia melalui viem, tanpa menurunkan private key. Tes penolakan pada note, sourceEvidence, summary, requirements, proof, dan checkpoint juga memeriksa bahwa data lama tidak terhapus. Hash publik dan kalimat biasa tetap lolos. Gabungan tes tetap 43/43 dan pengujian browser diulang 14/14.

Build revisi lulus, tetapi Vite memberi warning ukuran chunk JavaScript: 540,35 kB sebelum gzip (183,49 kB gzip), setelah penambahan screening multilingual. Lint tetap tanpa error/warning. Pemisahan chunk tidak diubah pada revisi ini.
