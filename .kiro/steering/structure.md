---
inclusion: always
---

# Struktur kode

| Lokasi | Tanggung jawab |
| --- | --- |
| `src/app/` | App shell, header, navigasi, routing hash, ErrorBoundary |
| `src/components/` | Komponen umum dan aksesibilitas (ikon, badge, dialog native, alamat) |
| `src/features/dashboard/` | Daftar campaign, filter, detail, watchlist |
| `src/features/wallet/` | Identitas lokal, dialog akun, deteksi MetaMask (Tahap 2: koneksi) |
| `src/features/scanner/` | Orkestrasi scan, state per sumber, panel scan |
| `src/features/claims/` | Preview, pengiriman, receipt |
| `src/adapters/sources/` | Kontrak dan collector per sumber resmi |
| `src/adapters/eligibility/` | Pemeriksaan kelayakan per campaign |
| `src/adapters/claims/` | Integrasi kontrak klaim terpilih |
| `src/domain/` | Tipe, jaringan, normalisasi, turunan status, validasi, format |
| `src/storage/` | IndexedDB, migrasi, backup/import (Tahap 2) |
| `src/styles/` | Token warna, tipografi, layout, komponen |
| `src/demo/` | Fixture berlabel DEMO dan adapter simulasi |
| `docs/` | Bukti sumber, keputusan, hasil pemeriksaan |
| `.kiro/specs/airdrop-hunter-mvp/` | Requirements, design, tasks |

- UI tidak memanggil endpoint langsung. Adapter mengembalikan hasil terstruktur: source, checkedAt, status, error.
- Tidak mengeksekusi kode/script/HTML dari konten campaign eksternal.
- Data demo terpisah dari adapter live; fixture demo tidak punya jalur klaim. Alamat kontrak selalu disimpan bersama chain ID.
