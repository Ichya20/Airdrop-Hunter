# Dokumentasi Sumber Data Live — Tahap 3 (`docs/sumber-data.md`)

Dokumen ini mencatat hasil evaluasi kandidat sumber data live untuk **AirdropHunter Tahap 3**, mencakup endpoint publik nyata, struktur respons, perilaku CORS di browser, autentikasi, pembatasan laju (*rate limit*), serta pembandingan data dengan dokumentasi resmi proyek (R3 & R5).

## 1. Evaluasi Kandidat Sumber Data

Sesuai batasan arsitektur AirdropHunter (`.kiro/steering/tech.md` & `sources-and-claims.md`):
- Aplikasi berjalan murni di browser (**tanpa backend, tanpa proxy cloud, dan tanpa menyimpan API key/secret di bundle `VITE_`**).
- Endpoint wajib mendukung permintaan `GET` lintas-asal (**CORS**) langsung dari browser (`http://localhost:5173` maupun domain statis).

| Kandidat Sumber | Endpoint | CORS di Browser | Autentikasi | Keputusan |
| :--- | :--- | :--- | :--- | :--- |
| **DefiLlama Public API (`defillama-live`)** | `GET https://api.llama.fi/protocols` | ✅ Didukung (`Access-Control-Allow-Origin: *`) | Tidak ada (Publik) | **Dipilih sebagai sumber penemuan & verifikasi protokol live Tahap 3** |
| **Registri Bukti Resmi Proyek (`verified-official-registry`)** | Data terverifikasi dari dokumentasi governance resmi (Arbitrum Foundation & Uniswap Labs) yang dicocokkan dengan metadata protokol live | ✅ Lokal + pencocokan metadata live | Tidak ada | **Dipilih sebagai pembanding resmi & arsip campaign historis (`Berakhir`)** |
| **DeBank Open API** | `https://pro-openapi.debank.com/v1/...` | ❌ Memerlukan header `AccessKey` berbayar | API Key (Rahasia) | **Ditolak** (`unsupported` — melanggar aturan tanpa secret di bundle) |
| **Dune Analytics API** | `https://api.dune.com/api/v1/...` | ❌ Memerlukan `X-Dune-API-Key` | API Key (Rahasia) | **Ditolak** (`unsupported` — memerlukan kredensial server) |
| **CoinGecko Demo/Pro API** | `https://api.coingecko.com/api/v3/...` | ⚠️ Sering membatasi CORS/429 ketat tanpa key | API Key opsional/wajib | **Ditolak** (tidak stabil tanpa API key di sisi klien) |

## 2. Spesifikasi Endpoint Live Terpilih (`https://api.llama.fi/protocols`)

- **URL Endpoint**: `https://api.llama.fi/protocols` ([Dokumentasi Resmi DefiLlama API](https://api-docs.defillama.com/))
- **Metode HTTP**: `GET`
- **Header Permintaan**: `Accept: application/json` (tanpa custom header yang memicu preflight CORS kompleks)
- **Perilaku CORS**: Mengembalikan `Access-Control-Allow-Origin: *` sehingga dapat dipanggil langsung oleh `window.fetch` di Chrome desktop maupun browser HP.
- **Autentikasi**: Tanpa autentikasi (`none`).
- **Rate Limit & TTL**:
  - **Server**: DefiLlama menerapkan batas wajar publik dan mengembalikan status `HTTP 429 Too Many Requests` (sering kali disertai header `Retry-After`) apabila klien mengirim permintaan beruntun terlalu cepat.
  - **Klien (`src/adapters/sources/rateLimit.ts`)**:
    - Jeda minimum antar-permintaan ke sumber yang sama: **15 detik** (`minIntervalMs: 15_000`) untuk scan otomatis/manual biasa, dan menghormati nilai `Retry-After` dari server bila menerima `HTTP 429`.
    - **TTL Data (`SCAN_TTL_MS`)**: **60 menit** (`3.600.000 ms`). Data live yang belum melewati TTL disajikan dari checkpoint IndexedDB; saat tab kembali aktif setelah > 60 menit, scanner memperbarui data secara otomatis.

### Contoh Struktur Respons JSON (`https://api.llama.fi/protocols`)

```json
[
  {
    "id": "2269",
    "name": "Arbitrum",
    "slug": "arbitrum",
    "symbol": "ARB",
    "url": "https://arbitrum.foundation",
    "description": "Arbitrum is a suite of Ethereum scaling solutions.",
    "chain": "Arbitrum",
    "chains": ["Arbitrum"],
    "category": "Chain",
    "tvl": 2450000000,
    "listedAt": 1679529600
  },
  {
    "id": "1",
    "name": "Uniswap",
    "slug": "uniswap",
    "symbol": "UNI",
    "url": "https://uniswap.org",
    "description": "Decentralized trading protocol.",
    "chain": "Ethereum",
    "chains": ["Ethereum", "Arbitrum", "Optimism", "Base", "Polygon"],
    "category": "Dexes",
    "tvl": 4800000000,
    "listedAt": 1600300800
  }
]
```

## 3. Aturan Normalisasi, Keamanan, & Penanganan Kegagalan

1. **Pemetaan Protokol Live ke Kontrak `Campaign` (`src/adapters/sources/liveDefiLlamaAdapter.ts`)**:
   - **Protokol dengan Bukti Distribusi Resmi Terverifikasi (`VERIFIED_OFFICIAL_CAMPAIGNS`)**:
     - Dicocokkan berdasarkan `slug` / `name` dari respons `api.llama.fi/protocols`.
     - Memakai URL resmi proyek, alamat kontrak yang telah diverifikasi bersama `chainId`, tenggat resmi (`deadline`), dan `sourceVerified: true`.
   - **Protokol Aktif Tanpa Token (`symbol === "-"` atau kosong) pada Jaringan EVM yang Didukung**:
     - Sesuai prinsip *Sources and Claims* ("Agregator hanya petunjuk penemuan. Jangan menjanjikan semua airdrop ditemukan, reward diterima, atau token bernilai"), protokol dengan TVL signifikan di jaringan yang didukung (`Ethereum`, `OP Mainnet`, `Polygon PoS`, `Base`, `Arbitrum One`) dipetakan sebagai:
       - `status: 'opportunity'`
       - `origin: 'live'`
       - `sourceVerified: false` (karena baru berupa indikasi protokol belum memiliki token di agregator DefiLlama, belum ada pengumuman klaim resmi) → menghasilkan label dashboard **Belum terverifikasi** (`unverified`) dengan aksi **Periksa sumber**.
       - `deadline: null` (ditampilkan sebagai `"Belum diketahui"`, tidak pernah dianggap terbuka selamanya).
       - `claimMethod: 'unknown'`, `contract: null`.
2. **Penanganan CORS, Rate Limit, & Kegagalan Jaringan**:
   - Jika `fetch` gagal karena pemblokiran CORS / ekstensi browser (`TypeError` saat `navigator.onLine === true`), adapter melempar `SourceError('cors', ...)` yang menjelaskan bahwa browser/ekstensi memblokir akses lintas-asal dan mengarahkan pengguna ke situs/checker resmi tanpa memakai proxy cloud.
   - Jika sumber merespons `HTTP 401/403`, adapter melempar `SourceError('unsupported', ...)`.
   - Jika sumber merespons `HTTP 429` atau masih dalam masa jeda *rate limit*, adapter melempar `SourceError('http', ...)` dan mempertahankan checkpoint terakhir di IndexedDB dengan penanda **Data lama**.

## 4. Pembandingan Campaign Live dengan Sumber Resmi (Task 3.3)

Minimal satu campaign (dalam implementasi ini **dua campaign utama**) dibandingkan langsung dengan dokumentasi resmi proyek dan ditandai sebagai **Berakhir** (`ended`):

| Atribut | Campaign 1: Arbitrum (`$ARB`) Initial Airdrop | Campaign 2: Uniswap (`$UNI`) Governance Distribution |
| :--- | :--- | :--- |
| **ID Ternormalisasi** | `42161:arbitrum-foundation:arbitrum-initial-token-airdrop` | `1:uniswap:uniswap-uni-merkle-distribution` |
| **Asal Data (`origin`)** | `live` (diverifikasi silang dengan entri `slug: "arbitrum"` dari `api.llama.fi/protocols`) | `live` (diverifikasi silang dengan entri `slug: "uniswap"` dari `api.llama.fi/protocols`) |
| **Jaringan & `chainId`** | Arbitrum One (`42161`) | Ethereum (`1`) |
| **Alamat Kontrak Resmi** | `0x67a24CE4321aB3aF51c2D0a4801c3E111D88C9d9` (`TokenDistributor`) | `0x090D4613473dEE047c3f2706764f49E0821D256e` (`MerkleDistributor`) |
| **Bukti Sumber Resmi** | [Arbitrum DAO Deployment Addresses](https://docs.arbitrum.foundation/deployment-addresses) & [Arbiscan](https://arbiscan.io/tx/0x1a953ea33b25d80f26db8a11a8161d51c295f36a3f8275913718f910274bd7e9) | [Uniswap Technical Reference](https://developers.uniswap.org/docs/ecosystem/governance/technical-reference) & [Etherscan](https://etherscan.io/address/0x090d4613473dee047c3f2706764f49e0821d256e) |
| **Status Campaign & Tenggat** | `ended` · Tenggat berakhir `2023-09-24T00:00:00.000Z` (Blok L1 18208000 / L2 19426812) | `ended` · Distribusi historis September 2020 |
| **Label Turunan di Dashboard** | **Berakhir** (`ended`) — tombol klaim dinonaktifkan, aksi utama **Lihat arsip** | **Berakhir** (`ended`) — tombol klaim dinonaktifkan, aksi utama **Lihat arsip** |
