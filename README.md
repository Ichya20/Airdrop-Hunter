<div align="center">

<img src="docs/assets/banner.svg" alt="AirdropHunter: cari, saring, dan pantau campaign airdrop dari satu panel kerja, langsung di browser" width="100%" />

<p>
  <img alt="Tahap 3 · Sumber Live" src="https://img.shields.io/badge/tahap_3-Sumber_Live-91D962?style=flat-square&labelColor=171E27" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-91D962?style=flat-square&logo=react&logoColor=61DAFB&labelColor=171E27" />
  <img alt="TypeScript 6" src="https://img.shields.io/badge/TypeScript-6-91D962?style=flat-square&logo=typescript&logoColor=3178C6&labelColor=171E27" />
  <img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-91D962?style=flat-square&logo=vite&logoColor=646CFF&labelColor=171E27" />
  <img alt="Node.js 20.19+ atau 22.12+" src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.12%2B-91D962?style=flat-square&logo=nodedotjs&logoColor=5FA04E&labelColor=171E27" />
  <img alt="Wallet: MetaMask Chrome extension" src="https://img.shields.io/badge/wallet-MetaMask_Chrome-F6851B?style=flat-square&labelColor=171E27" />
  <img alt="Tanpa backend" src="https://img.shields.io/badge/backend-tidak_ada-91D962?style=flat-square&labelColor=171E27" />
</p>

<h3>Satu panel kerja untuk berburu airdrop dengan tenang.</h3>

<p>
Cari kandidat protokol dari sumber yang didukung, pantau alamat publik, dan lihat preview klaim DEMO.<br />
Laptop memakai <b>MetaMask Chrome extension</b>, HP cukup <b>memantau alamat publik</b>, dan semuanya berjalan di browser dengan penyimpanan lokal <b>IndexedDB</b>.
</p>

<p>
  <a href="#mulai-cepat"><b>Mulai cepat</b></a> ·
  <a href="#fitur"><b>Fitur</b></a> ·
  <a href="#roadmap"><b>Roadmap</b></a>
</p>

</div>

> [!IMPORTANT]
> **Versi 0.3.1 — perapihan Tahap 3:** Aplikasi mengambil metadata protokol dari `https://api.llama.fi/protocols` dan menampilkan kandidat berlabel **LIVE**. Referensi Arbitrum `$ARB` dan Uniswap `$UNI` tersimpan dalam kode dengan label **ARSIP LOKAL**; metadata API tidak membuktikan eligibility, proof, atau keadaan kontrak klaim. Cache segar per sumber digunakan setelah penyimpanan selesai dimuat, retry menghormati pembatasan sumber, dan impor cadangan memvalidasi skema. **Tahap 4 belum dimulai; aplikasi belum mengecek eligibility resmi atau mengirim transaksi klaim.**

<p align="center">
  <img src="docs/screenshots/showcase.png" alt="Contoh antarmuka versi awal AirdropHunter di laptop dan HP" width="100%" />
</p>

Gambar showcase berasal dari versi awal. Screenshot pengujian perapihan 0.3.1 dengan data tiruan tersedia di [`docs/cek-hasil.md`](docs/cek-hasil.md).

## Fitur

<table>
  <tr>
    <td width="33%" valign="top">
      <b>🌐 Sumber Live & Rate Limit (Tahap 3)</b><br />
      Mengambil metadata API DefiLlama langsung dari browser tanpa proxy cloud, dengan pembatasan per sumber, <code>Retry-After</code> HTTP 429, retry yang bisa dibatalkan, dan referensi <b>ARSIP LOKAL</b>.
    </td>
    <td width="33%" valign="top">
      <b>🦊 Koneksi MetaMask (Tahap 2)</b><br />
      Terhubung lewat EIP-6963/EIP-1193 tanpa meminta tanda tangan. Menangani penolakan koneksi, ganti jaringan, dan pergantian akun secara reaktif.
    </td>
    <td width="33%" valign="top">
      <b>🗄️ IndexedDB & Cadangan (Tahap 2)</b><br />
      Pengaturan, watchlist, dan hasil scan tersimpan lokal. Cache segar per sumber, termasuk hasil kosong, mencegah fetch otomatis berulang; ekspor/impor JSON memvalidasi skema dan menerima hash transaksi publik.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <b>🧭 Status yang jujur</b><br />
      Status campaign, kelayakan wallet, dan transaksi disimpan terpisah. Indikasi agregator tanpa bukti klaim resmi diberi label <i>Belum terverifikasi</i>, bukan “Siap diklaim”.
    </td>
    <td valign="top">
      <b>📱 Mode pantau HP</b><br />
      Masukkan alamat publik untuk dibaca saja. Checksum EIP-55 divalidasi; isian yang mirip private key atau seed phrase langsung dikosongkan.
    </td>
    <td valign="top">
      <b>♿ Nyaman dipakai</b><br />
      Dialog native dengan fokus terkunci, keyboard penuh, pengumuman untuk pembaca layar, target sentuh 44 px, dan dukungan <code>prefers-reduced-motion</code>.
    </td>
  </tr>
</table>

## Mulai cepat

```bash
npm ci
npm run dev
```

Buka `http://localhost:5173`. Butuh Node.js `^20.19.0` atau `>=22.12.0`.

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan Vite |
| `npm run typecheck` | Pemeriksaan TypeScript (`tsc -b`) |
| `npm test` | Tes Tahap 2, Tahap 3, dan regresi perapihan |
| `npm run lint` | Oxlint |
| `npm run build` | Typecheck + build produksi ke `dist/` |
| `npm run preview` | Menyajikan hasil build |

## Roadmap

- [x] **Tahap 1** · Dashboard DEMO: scan, filter, detail, watchlist, mode pantau, preview klaim
- [x] **Tahap 2** · Koneksi MetaMask (EIP-6963/EIP-1193), deteksi jaringan salah, penyimpanan IndexedDB per alamat + chain ID + campaign + versi adapter, migrasi & ekspor/impor cadangan
- [x] **Tahap 3** · Metadata protokol live DefiLlama, kandidat belum terverifikasi, arsip referensi lokal, cache per sumber, dan retry dengan rate limit
- [x] **Perapihan 0.3.1** · Hidrasi cache sebelum scan otomatis, invalidasi checkpoint versi adapter lama, validasi backup, dan pemisahan label LIVE/ARSIP LOKAL
- [ ] **Tahap 4** · Eligibility dari aturan, proof, atau snapshot resmi
- [ ] **Tahap 5** · Klaim testnet: simulasi, estimasi biaya, konfirmasi wallet, dan receipt

Arsip lokal memakai `status: ended` agar aksi klaim tetap nonaktif di aplikasi. Untuk UNI, `deadline: null`: tanggal peluncuran historis tidak digunakan sebagai tenggat klaim, dan status klaim aktual belum diperiksa. Timestamp arsip menunjukkan kapan referensi dimuat pada scan, bukan kapan klaim diverifikasi.

Rinciannya ada di [`tasks.md`](.kiro/specs/airdrop-hunter-mvp/tasks.md), dengan perilaku sumber data di [`docs/sumber-data.md`](docs/sumber-data.md), kebutuhan di [`requirements.md`](.kiro/specs/airdrop-hunter-mvp/requirements.md), rancangan di [`design.md`](.kiro/specs/airdrop-hunter-mvp/design.md), dan hasil serta batas verifikasi di [`docs/cek-hasil.md`](docs/cek-hasil.md).
