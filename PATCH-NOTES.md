# Patch update Tahap 4 — AirdropHunter

Paket ini hanya memuat file yang diubah/ditambahkan, bukan seluruh proyek atau hasil build.
Baseline: Airdrop-Hunter-main (2).zip (v0.3.1).

## Memasang ZIP patch

1. Buat salinan folder proyek Anda.
2. Ekstrak isi ZIP patch ke folder proyek yang berisi package.json, README.md, src, dan .kiro. Gabungkan folder dan timpa hanya file bernama sama.
3. Jika Anda sudah mengubah file tersebut setelah ZIP baseline, bandingkan dahulu dengan daftar file di bawah agar perubahan lokal Anda tetap terjaga.
4. Jalankan npm run test:stage4 jika ingin mengulang tes patch. Dependency tidak berubah; tidak diperlukan paket baru. Perintah ini membundel modul tes untuk Node, tanpa build aplikasi/dist.

Alternatif Git: gunakan file AirdropHunter-update-tahap4.patch dari folder unduhan yang sama; dari akar proyek jalankan git apply --check <lokasi-patch>, lalu git apply <lokasi-patch>. Jangan menerapkan dua cara sekaligus.

## Isi perubahan

- Pemeriksaan proof JSON publik UNI terhadap distributor resmi Ethereum; bukan API otomatis semua airdrop.
- Hasil usang, pemeriksaan ulang pada detail/preview, isolasi wallet/jaringan, dan impor cadangan yang wajib diverifikasi ulang.
- Arsip tetap tidak dapat diklaim; Tahap 5 belum diaktifkan. Ketentuan asli/steering tidak diubah; hanya checkbox tugas 4.1 dan 4.2 ditandai selesai.
- 51 skenario logika + 10 pemeriksaan komponen lulus. Build aplikasi penuh tidak dijalankan. RPC mainnet, CORS hosting, dan proof wallet nyata belum diverifikasi langsung.

Panduan mekanisme: docs/eligibility.md. Rincian pengujian: docs/cek-tahap4.md.

## Daftar file sumber

- `.kiro/specs/airdrop-hunter-mvp/tasks.md`
- `README.md`
- `docs/cek-tahap4.md`
- `docs/eligibility.md`
- `package.json`
- `scripts/test.mjs`
- `src/adapters/eligibility/index.ts`
- `src/adapters/eligibility/types.ts`
- `src/adapters/eligibility/uni.ts`
- `src/app/App.tsx`
- `src/domain/status.ts`
- `src/features/claims/preClaimChecks.ts`
- `src/features/dashboard/CampaignDrawer.tsx`
- `src/features/dashboard/EligibilityCheck.tsx`
- `src/features/dashboard/rows.ts`
- `src/features/eligibility/controller.ts`
- `src/features/eligibility/useEligibility.ts`
- `src/storage/backupValidation.ts`
- `src/styles/components.css`
- `src/tests/runAll.ts`
- `src/tests/runStage4.ts`
- `src/tests/tahap2.test.ts`
- `src/tests/tahap4-adapter.test.ts`
- `src/tests/tahap4-dashboard.test.ts`
- `src/tests/tahap4-flow.test.ts`
- `src/tests/tahap4-storage.test.ts`

SHA-256 ZIP baseline: `f1782d549c3de1f6313050d47d97fa8e24b475566c12e005c9f5be750286f4fb`

Jumlah file sumber: 26. Patch diverifikasi dengan git apply --check dan rekonstruksi byte-per-byte dari baseline.
