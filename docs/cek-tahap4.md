# Cek patch Tahap 4

Diperiksa 15 Oktober 2026 di Windows, Node.js 24.15.0. Baseline: `Airdrop-Hunter-main (2).zip` milik pengguna. Hanya patch sumber yang diserahkan; tidak ada build aplikasi penuh atau paket proyek lengkap.

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run test:stage4` | 51/51 skenario lulus |
| Oxlint pada file kode yang diubah/ditambahkan | Exit 0, tanpa diagnostic |
| TypeScript `--noEmit` dengan entry panel detail, hook eligibility, dan suite Tahap 4 | Exit 0; tanpa emit, tidak menjalankan `tsc -b` |
| Chromium headless, fixture komponen detail + hook asli | 10/10 pemeriksaan lulus; tanpa error JavaScript halaman |
| Desktop 1280 px dan HP 390 px | Tidak ada overflow horizontal pada halaman/panel |

Suite terarah terdiri dari 14 regresi Tahap 2, 17 adapter proof/RPC, 5 impor cadangan, 11 alur asinkron, dan 4 dashboard/cek pra-klaim. Respons RPC/proof adalah vektor uji, bukan bukti bahwa alamat fixture memiliki alokasi UNI nyata. Pengujian transport memakai implementasi viem produksi dengan fetch tiruan dan memeriksa jaringan, alamat distributor, nomor blok, serta lima pemanggilan baca saja. Tes timeout memakai dependensi yang tidak pernah selesai untuk memeriksa batas total delapan detik.

Skenario mencakup proof valid dan salah, alamat berbeda, indeks sudah diklaim, campaign diarsipkan, jaringan salah, sumber gagal, abort, timestamp usang/invalid/masa depan, versi aturan lama, deduplikasi, hasil terlambat setelah ganti akun/jaringan/sumber, penulisan yang masih berjalan saat reset, impor palsu yang tampak terverifikasi, dan preservasi transaksi. Klaim arsip tetap diblokir; hasil eligibility tidak menciptakan transaksi terkonfirmasi.

Fixture browser hanya membundel panel detail, hook eligibility, serta dependensi komponen dan CSS. Tidak memakai entry `App.tsx`/`main.tsx`, tidak menghasilkan `dist`, dan tidak membangun seluruh aplikasi. Pemeriksaan mencakup detail tanpa proof, busy/kirim ganda, proof sah, arsip tetap nonaktif, pemakaian ulang proof dalam tab, kegagalan RPC → unknown, pengosongan isian mirip private key, JSON invalid, layout desktop/HP, Escape/fokus kembali, serta pemeriksaan ulang pada transisi internal ke preview. Skenario preview memakai metadata tiruan untuk menguji transisi; status arsip produksi tidak diubah.

## Batas verifikasi

- Koneksi ke sumber publik gagal pada lingkungan sesi ini. Root distributor, CORS RPC dari hosting nyata, serta proof wallet nyata belum diverifikasi melalui jaringan; jangan membaca hasil fixture sebagai keberhasilan mainnet.
- Sumber primer kontrak dan format proof diperiksa dari repositori resmi Uniswap. Ketersediaan endpoint dataset historis/per alamat belum terkonfirmasi; aplikasi meminta proof publik alih-alih memakai API yang ditebak.
- Tidak menjalankan `npm run build`, `tsc -b`, suite seluruh proyek, atau alur aplikasi penuh. TypeScript dan lint dibatasi pada perubahan serta dependensi pemeriksaannya.
- Extension MetaMask fisik, pembaca layar nyata, serta transaksi/simulasi/receipt tidak diuji. Tahap 5 dan audit lengkap tetap terbuka.
- Fixture browser memunculkan peringatan bundler mengenai `node:worker_threads` dalam dependensi transitive `ox`; pengujian browser selesai tanpa error halaman. Itu bukan hasil build produksi.

`requirements.md`, seluruh steering, dan `design.md` tidak diubah. Pada `tasks.md`, hanya kotak 4.1 dan 4.2 ditandai; rumusan tugas tetap sama. Perbedaan arsitektur wallet bawaan dengan ketentuan wagmi/TanStack Query tidak diperbaiki atau disamarkan dalam patch ini.
