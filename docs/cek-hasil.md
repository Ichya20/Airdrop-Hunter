# Cek hasil — Tahap 1, Tahap 2, & Tahap 3

Diperiksa 14 Oktober 2026 di sandbox Linux. Tanda: ✅ diperiksa dan lulus · ⏳ belum diuji di perangkat fisik · — di luar cakupan tahap 1–3.

## Pemeriksaan Tahap 3 (Satu Sumber Live Tervalidasi)

| Pemeriksaan | Hasil |
| --- | --- |
| Kompilasi seluruh 56 file TypeScript/TSX (`src/`) | ✅ Lulus tanpa error sintaks atau tipe |
| Suite pengujian otomatis `src/tests/tahap3.test.ts` (6 skenario) + `tahap2.test.ts` (14 skenario) | ✅ 20/20 lulus |
| Dokumentasi `docs/sumber-data.md` (evaluasi kandidat, endpoint `https://api.llama.fi/protocols`, CORS, rate limit, bukti kontrak resmi) | ✅ Lengkap |
| R5: Adapter live `src/adapters/sources/liveDefiLlamaAdapter.ts` memetakan data live dengan label `origin: 'live'` terpisah dari `origin: 'demo'` | ✅ Lulus |
| R5: Pembatasan laju per sumber (`src/adapters/sources/rateLimit.ts`) & penghormatan header `Retry-After` pada HTTP 429 | ✅ Lulus |
| R5: Penanganan kegagalan CORS (`SourceError('cors')`), sumber ber-API key (`SourceError('unsupported')`), dan fallback ke checker resmi tanpa proxy cloud | ✅ Lulus |
| R3: Pembandingan dengan sumber resmi — Arbitrum (`$ARB`, kontrak `0x67a24CE4321aB3aF51c2D0a4801c3E111D88C9d9` di chain `42161`) dan Uniswap (`$UNI`, kontrak `0x090D4613473dEE047c3f2706764f49E0821D256e` di chain `1`) ditandai `ended` (**Berakhir**) dengan klaim nonaktif | ✅ Lulus |
| R3: Protokol tanpa token (`symbol: "-"`) dari DefiLlama dipetakan jujur sebagai `status: 'opportunity'` dan `sourceVerified: false` (**Belum terverifikasi**), bukan "Siap diklaim" | ✅ Lulus |

## Pemeriksaan Tahap 2 (Wallet MetaMask & IndexedDB Lokal)

| Pemeriksaan | Hasil |
| --- | --- |
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
| Pencarian, filter status & jaringan, urutan, Reset filter, deduplikasi campaign | ✅ Lulus |
| Aksesibilitas dialog native (fokus awal, Tab trap, Escape, klik latar), skip link, live region, kontras ≥ 5,48:1 | ✅ Lulus |
| Mode pantau: validasi checksum EIP-55 serta pengosongan otomatis untuk private key / seed phrase | ✅ Lulus |

## Cakupan Tahap Berikutnya

- — **Tahap 4**: Adapter pemeriksaan eligibility resmi (API, snapshot/proof, atau pembacaan kontrak) dengan cek ulang saat membuka detail atau memulai klaim.
- — **Tahap 5**: Simulasi kontrak (`simulateContract`), estimasi biaya gas, konfirmasi klaim testnet di MetaMask, dan pemantauan receipt + bukti event.
