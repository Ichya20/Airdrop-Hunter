# Patch free bernilai — sebelum Tahap 5

Definisi terbaru: token airdrop dibagikan gratis, tersedia untuk diklaim ke wallet, dan mempunyai nilai pasar nyata. Gas jaringan boleh diperlukan. Ini menggantikan aturan Rp0 termasuk gas pada patch sebelumnya.

Paket hanya memuat file sumber yang berubah/baru, bukan proyek lengkap atau build. Tidak mengaktifkan transaksi Tahap 5.

## Prasyarat dan pemasangan

1. Gunakan proyek dari Airdrop-Hunter-main (2).zip yang SUDAH diberi AirdropHunter-update-tahap4.zip, kemudian AirdropHunter-patch-pencarian-luas.zip, sesuai urutan tersebut.
2. Buat salinan folder proyek saat ini. Ekstrak ZIP update ini ke akar proyek yang berisi package.json dan src/.kiro; gabungkan folder dan timpa hanya berkas bernama sama. Jangan mengganti seluruh proyek dengan ZIP patch ini.
3. Jika ada perubahan lokal sesudah patch sebelumnya, bandingkan diff sebelum menimpa. Paket tidak dapat mengetahui perubahan lokal di folder lain.
4. Tidak ada dependency baru. Pengujian opsional: npm run test:value; script hanya membundel modul tes, bukan seluruh aplikasi.

Alternatif Git: gunakan AirdropHunter-patch-free-bernilai.patch dengan baseline yang sama. Jalankan git -c core.autocrlf=false apply --check <lokasi-patch>, kemudian perintah yang sama tanpa --check. Pilih ZIP ATAU diff, jangan keduanya.

## Perubahan yang diminta

- Gas tidak lagi menggagalkan distribusi gratis. Aturan biaya distribusi, eligibility, bukti harga/likuiditas, dan transaksi diperiksa terpisah.
- Seluruh token mainnet dengan reward belum diklaim positif dari API Merkl masuk antrean harga, tanpa daftar simbol atau batas total lokal. Dua permintaan pasar serentak, jarak mulai setidaknya 300 ms. Poin, pre-TGE, testnet, dan pending tidak menjadi kandidat token bernilai.
- Harga USD/likuiditas positif harus cocok dengan alamat base token dan jaringan. Bukti lima menit; data gagal, tidak cocok, kosong atau usang tetap belum terverifikasi. Tidak ada minimum USD buatan.
- Pencarian DefiLlama/Merkl tetap luas. Provider harga saat ini memetakan 12 jaringan EVM; token di jaringan lain tetap ditemukan dengan nilai belum diketahui. Sumber lain memerlukan adapter. Tidak ada klaim mencakup seluruh internet atau semua jaringan.
- Panel menampilkan progres, harga, likuiditas, bukti pasar dan gas terpisah. Pergantian wallet/jaringan/sumber/scan menghapus hasil lama; bukti pasar tidak diimpor dari backup.
- Requirement asli R1–R10 tetap utuh; hanya R11 ditambahkan untuk arahan terbaru. Steering, arsitektur wallet, claim adapter, lockfile, dan dependency tetap sama. Arsip UNI/ARB tidak dibuka untuk klaim.

## Verifikasi dan batas

79 skenario logika lulus. TypeScript terarah tanpa emit serta lint kode perubahan lulus. Komponen asli diuji dengan API/wallet tiruan pada desktop 1280 px dan HP 390 px: seluruh 245 campaign dan 123 reward dapat diakses, kandidat hanya muncul untuk pasar cocok, data usang tidak lolos, dan respons wallet lama diabaikan. Tidak ada galat JavaScript atau overflow dokumen.

Schema API dan sumber aturan diperiksa dari dokumentasi resmi. Endpoint JSON dan CORS hosting nyata belum terverifikasi. Harga/likuiditas tidak menjamin token dapat dijual atau pencairan sejumlah tertentu. Laporan claimable adalah kandidat, belum bukti transaksi atau token sudah masuk wallet. Tidak ada tanda tangan/transaksi/receipt atau build aplikasi penuh.

Rincian: docs/free-bernilai.md dan docs/cek-free-bernilai.md. Diff lulus git apply --check dan rekonstruksi sumber byte-per-byte terhadap baseline prasyarat.

## Daftar file sumber

- `.kiro/specs/airdrop-hunter-mvp/requirements.md`
- `README.md`
- `docs/cek-free-bernilai.md`
- `docs/cek-pencarian-luas.md`
- `docs/free-bernilai.md`
- `docs/pencarian-luas.md`
- `package.json`
- `scripts/test.mjs`
- `src/adapters/market/index.ts`
- `src/adapters/sources/index.ts`
- `src/adapters/sources/liveDefiLlamaAdapter.ts`
- `src/adapters/sources/merklCatalogAdapter.ts`
- `src/app/App.tsx`
- `src/app/DemoBanner.tsx`
- `src/components/MarketEvidence.tsx`
- `src/domain/claimCost.ts`
- `src/domain/freeAirdrop.ts`
- `src/features/claims/ClaimPreview.tsx`
- `src/features/claims/preClaimChecks.ts`
- `src/features/dashboard/CampaignDrawer.tsx`
- `src/features/dashboard/ClaimCostNotice.tsx`
- `src/features/dashboard/DashboardView.tsx`
- `src/features/dashboard/campaignMarket.ts`
- `src/features/dashboard/rows.ts`
- `src/features/dashboard/useCampaignMarket.ts`
- `src/features/rewards/WalletRewardsPanel.tsx`
- `src/features/rewards/controller.ts`
- `src/styles/components.css`
- `src/tests/cleanup-source.test.ts`
- `src/tests/discovery-cost.test.ts`
- `src/tests/discovery-integration.test.ts`
- `src/tests/discovery-rewards.test.ts`
- `src/tests/discovery-sources.test.ts`
- `src/tests/runAll.ts`
- `src/tests/runValue.ts`
- `src/tests/value-market.test.ts`
- `src/tests/value-policy.test.ts`
- `src/tests/value-rewards.test.ts`

Jumlah file sumber: 38. ZIP hanya berisi daftar ini dan PATCH-NOTES.md.

SHA-256 patch prasyarat:

- AirdropHunter-update-tahap4.zip: `ad0bee4ecfed5364700f677baf20a3824a56dcb300d78c783a3cb65b4b9873b3`
- AirdropHunter-patch-pencarian-luas.zip: `784533279eaffec0c8493f33b213690c77683731af2cf87f0506311fe39bcf67`
