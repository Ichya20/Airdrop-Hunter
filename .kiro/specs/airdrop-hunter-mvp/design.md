# Design — airdrop-hunter-mvp (Tahap 1–3, versi 0.3.1)

## Ringkasan

SPA statis React 19 + TypeScript 6 + Vite 8, dengan penyimpanan lokal dan koneksi MetaMask. Versi 0.3.1 merapikan Tahap 3; eligibility resmi dan pengiriman transaksi belum diimplementasikan.

- **Tahap 1**: Dashboard responsif, scanner multi-sumber dengan timeout/retry/batal, filter, detail, mode pantau alamat publik, watchlist, dan preview klaim fixture DEMO.
- **Tahap 2**: Koneksi MetaMask Chrome extension melalui EIP-6963 (`io.metamask`) + EIP-1193 + `viem`, penanganan penolakan, perpindahan jaringan, sinkronisasi akun/jaringan, serta IndexedDB dengan migrasi v1→v2 dan backup JSON.
- **Tahap 3**: Metadata protokol publik DefiLlama sebagai petunjuk penemuan, pembatasan permintaan, retry dengan penundaan sumber, cache per sumber, dan referensi lokal ARB/UNI. Label LIVE, ARSIP LOKAL, dan DEMO dibedakan.

## Keputusan

| Topik | Keputusan | Tujuan |
| --- | --- | --- |
| Routing | Hash `#/` dan `#/watchlist` | Mendukung hosting statis tanpa rewrite |
| State | `useReducer`/`useState` | Memisahkan sumber, identitas, status campaign, eligibility, dan transaksi |
| Storage | IndexedDB `airdrop-hunter-db` v2, fallback memori | Pengaturan, watchlist per akun, checkpoint per sumber, catatan per `addressScope::chainId::campaignId::adapterVersion` |
| Wallet | EIP-6963 + EIP-1193 + `viem` | Koneksi MetaMask tanpa meminta tanda tangan pada proses connect |
| Sumber | `GET https://api.llama.fi/protocols` langsung dari browser | Mendapat metadata tanpa memasukkan secret atau memakai proxy cloud |
| Provenance | `Campaign.sourceKind?: api / local-archive` | Menampilkan asal lokal secara jelas meski adapter berada dalam kelompok live |
| Cache | Tunggu hidrasi; TTL 60 menit per sumber, termasuk hasil kosong | Menghindari fetch otomatis ketika cache masih segar |
| Versi adapter | `defillama-live-1.1.0`; checkpoint versi berbeda tidak dipulihkan | Menghindari label/evidence lama yang sudah tidak sesuai aturan adapter |
| Retry | Maksimum backoff, hint error, dan jeda limiter; dapat dibatalkan | Retry benar-benar menunggu sebelum menggunakan percobaan tambahan |
| Backup | Validasi skema penuh sebelum penggantian; migrasi v1→v2 | Menerima hash transaksi publik di tempat yang benar dan menolak data tidak valid |

## Batas data dan klaim

Metadata tanpa simbol token menghasilkan kandidat `opportunity` dengan `sourceVerified: false`, eligibility `unknown`, dan tanpa kontrak klaim. Tidak ada janji airdrop dari metadata tersebut.

Referensi ARB/UNI berasal dari kode lokal. Kecocokan metadata API tidak memeriksa proof, eligibility, atau kontrak. Arsip memakai `status: ended` untuk menjaga aksi klaim nonaktif di aplikasi dan `sourceVerified: false`. UNI memiliki `deadline: null`; status klaim aktual tidak disimpulkan dari tanggal peluncuran. Timestamp arsip menunjukkan pemuatan referensi pada scan. URL terkurasi arsip tidak diganti oleh respons API.

## Alur cache dan scanner

1. Muat penyimpanan, pengaturan, dan checkpoint; tahan scan otomatis selama hidrasi.
2. Tolak checkpoint yang versi adapter-nya berbeda atau memuat campaign dari versi berbeda.
3. Pilih sumber sesuai mode, lalu hitung kesegaran setiap sumber dari `lastSuccessAt`. Hasil sukses kosong tetap segar.
4. Saat pembukaan halaman atau tab kembali terlihat, fetch hanya sumber yang perlu diperbarui. Scan manual tetap dapat memperbarui semua sumber terpilih.
5. Pertahankan hasil sukses sebelumnya ketika fetch baru gagal/dibatalkan. Batal juga menghentikan jeda retry.

## Struktur

```text
src/app/                 Shell, navigasi, hash route, hidrasi storage
src/components/          Ikon, badge status/asal/jaringan, dialog, alamat, empty state
src/features/dashboard/  Filter, urutan, tabel/kartu, detail, watchlist
src/features/scanner/    runScan, useScanner, scanCache, panel scan
src/features/wallet/     Identitas, EIP-6963/EIP-1193, hook MetaMask
src/features/claims/     Preview DEMO, resolver riwayat transaksi lokal
src/adapters/sources/    Adapter, error, limiter, registry dan provenance sumber
src/adapters/eligibility Resolver DEMO/unknown dan cache lokal; belum adapter resmi
src/adapters/claims/     Registry; pengiriman klaim testnet masih Tahap 5
src/domain/              Tipe, jaringan, normalisasi, label/aksi, validasi alamat
src/storage/             IndexedDB/memori, kunci, backupValidation, migrasi
src/tests/               Tahap 2/3 dan regresi cache, retry, sumber, backup
src/demo/                Fixture dan skenario simulasi
src/styles/              Token, base, layout, komponen
docs/                    Batas verifikasi, perilaku sumber, aset README
```

Perilaku dan batas sumber dijelaskan di `docs/sumber-data.md`. Hasil pengujian versi ini, termasuk hal yang belum diuji pada perangkat nyata, dicatat di `docs/cek-hasil.md`.
