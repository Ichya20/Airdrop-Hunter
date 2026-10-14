# Cek hasil — Tahap 1 & Tahap 2

Diperiksa 14 Oktober 2026 di sandbox Linux. Tanda: ✅ diperiksa dan lulus · ⏳ belum diuji di perangkat fisik · — di luar cakupan tahap 1–2.

## Pemeriksaan Tahap 2 (Wallet MetaMask & IndexedDB Lokal)

| Pemeriksaan | Hasil |
| --- | --- |
| Kompilasi seluruh 52 file TypeScript/TSX (`src/`) | ✅ Lulus tanpa error sintaks atau tipe |
| Suite pengujian otomatis `src/tests/tahap2.test.ts` (14 skenario) | ✅ 14/14 lulus |
| R3: Turunan label (`deriveLabel`) & aksi (`resolveAction`), termasuk syarat `proof` pada transaksi `confirmed` dan tenggat lewat | ✅ Lulus |
| R6: Konektor MetaMask EIP-6963/EIP-1193 (`eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `wallet_switchEthereumChain`, `wallet_revokePermissions`) | ✅ Lulus |
| R6: Penanganan error RPC `4001` (ditolak pengguna → Coba lagi), `-32002` (popup menunggu), `4902` (chain belum ada), serta deteksi jaringan tidak dikenal | ✅ Lulus |
| R6 & R8: Deteksi jaringan salah pada `ClaimPreview` & tombol pindah jaringan ke chain campaign | ✅ Lulus |
| R7: Isolasi identitas (`demo`, `watch`, `metamask` akun A vs akun B vs jaringan berbeda) & pembersihan cache tampilan saat berganti akun/jaringan | ✅ Lulus |
| R9: Penyimpanan `src/storage` (IndexedDB `airdrop-hunter-db` v2 + fallback memori) dengan kunci `${addressScope}::${chainId}::${campaignId}::${adapterVersion}` | ✅ Lulus |
| R9: Invalidate otomatis saat `adapterVersion` berubah, migrasi cadangan skema v1 → v2, ekspor/impor JSON, dan penolakan file cadangan yang memuat private key/seed phrase | ✅ Lulus |

## Ringkasan Pemeriksaan Tahap 1 (Dashboard DEMO)

| Perintah / Area | Hasil |
| --- | --- |
| `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build` | ✅ exit 0 |
| Render responsif desktop (1280×800, 1024–1440 px), tablet (820 px), HP (390×844, 320 px) | ✅ Tanpa scroll horizontal |
| Pencarian, filter status & jaringan, urutan, Reset filter, deduplikasi 11 campaign DEMO | ✅ Lulus |
| Aksesibilitas dialog native (fokus awal, Tab trap, Escape, klik latar), skip link, live region, kontras ≥ 5,48:1 | ✅ Lulus |
| Mode pantau: validasi checksum EIP-55 serta pengosongan otomatis untuk private key / seed phrase | ✅ Lulus |

## Cakupan Tahap Berikutnya

- — **Tahap 3**: Dokumentasi sumber live (`docs/sumber-data.md`) dan implementasi satu source adapter live dengan TTL & penanganan CORS/rate limit.
- — **Tahap 4**: Adapter pemeriksaan eligibility resmi (API, snapshot/proof, atau kontrak).
- — **Tahap 5**: Simulasi kontrak (`simulateContract`), estimasi biaya gas, konfirmasi klaim testnet di MetaMask, dan pemantauan receipt + bukti event.
