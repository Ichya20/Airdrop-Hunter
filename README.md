<div align="center">

<img src="docs/assets/banner.svg" alt="AirdropHunter: cari, saring, dan pantau campaign airdrop dari satu panel kerja, langsung di browser" width="100%" />

<p>
  <img alt="Tahap 2 · Wallet & IndexedDB" src="https://img.shields.io/badge/tahap_2-Wallet_%26_IndexedDB-91D962?style=flat-square&labelColor=171E27" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-91D962?style=flat-square&logo=react&logoColor=61DAFB&labelColor=171E27" />
  <img alt="TypeScript 6" src="https://img.shields.io/badge/TypeScript-6-91D962?style=flat-square&logo=typescript&logoColor=3178C6&labelColor=171E27" />
  <img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-91D962?style=flat-square&logo=vite&logoColor=646CFF&labelColor=171E27" />
  <img alt="Node.js 20.19+ atau 22.12+" src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.12%2B-91D962?style=flat-square&logo=nodedotjs&logoColor=5FA04E&labelColor=171E27" />
  <img alt="Wallet: MetaMask Chrome extension" src="https://img.shields.io/badge/wallet-MetaMask_Chrome-F6851B?style=flat-square&labelColor=171E27" />
  <img alt="Tanpa backend" src="https://img.shields.io/badge/backend-tidak_ada-91D962?style=flat-square&labelColor=171E27" />
</p>

<h3>Satu panel kerja untuk berburu airdrop dengan tenang.</h3>

<p>
Cari campaign dari sumber yang didukung, lihat statusnya untuk alamatmu, lalu siapkan klaim lewat konfirmasi wallet.<br />
Laptop memakai <b>MetaMask Chrome extension</b>, HP cukup <b>memantau alamat publik</b>, dan semuanya berjalan di browser dengan penyimpanan lokal <b>IndexedDB</b>.
</p>

<p>
  <a href="#mulai-cepat"><b>Mulai cepat</b></a> ·
  <a href="#fitur"><b>Fitur</b></a> ·
  <a href="#tampilan"><b>Tampilan</b></a> ·
  <a href="#cara-kerja"><b>Cara kerja</b></a> ·
  <a href="#roadmap"><b>Roadmap</b></a>
</p>

</div>

> [!IMPORTANT]
> **Status Tahap 2 (Wallet & Data Lokal):** Koneksi **MetaMask Chrome extension** (EIP-6963/EIP-1193), perpindahan jaringan, pemisahan data antar-wallet, serta penyimpanan lokal **IndexedDB** (beserta ekspor/impor cadangan JSON) sudah aktif. Sumber daftar campaign masih menggunakan fixture berlabel `DEMO` hingga adapter live dipasang pada Tahap 3.

<p align="center">
  <img src="docs/screenshots/showcase.png" alt="Dashboard AirdropHunter di laptop (tabel campaign) dan HP (daftar kartu dengan tombol Cari airdrop)" width="100%" />
</p>

## Fitur

<table>
  <tr>
    <td width="33%" valign="top">
      <b>🦊 Koneksi MetaMask (Tahap 2)</b><br />
      Terhubung lewat EIP-6963/EIP-1193 tanpa meminta tanda tangan. Menangani penolakan koneksi, ganti jaringan, dan pergantian akun secara reaktif.
    </td>
    <td width="33%" valign="top">
      <b>🗄️ IndexedDB & Cadangan (Tahap 2)</b><br />
      Pengaturan, watchlist, dan hasil scan tersimpan per <code>alamat + chain ID + campaign ID + versi adapter</code>, lengkap dengan ekspor/impor JSON.
    </td>
    <td width="33%" valign="top">
      <b>🧭 Status yang jujur</b><br />
      Status campaign, kelayakan wallet, dan transaksi disimpan terpisah. Data gagal atau kosong menjadi <i>belum diketahui</i>, bukan “memenuhi syarat”.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <b>🛰️ Scan per sumber</b><br />
      Progres langsung, <b>Batalkan</b>, dan <b>Coba lagi</b> per sumber. Ada timeout, retry dengan backoff, dan checkpoint sumber tersimpan di IndexedDB.
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
| `npm run lint` | Oxlint |
| `npm run build` | Typecheck + build produksi ke `dist/` |
| `npm run preview` | Menyajikan hasil build |

## Roadmap

- [x] **Tahap 1** · Dashboard DEMO: scan, filter, detail, watchlist, mode pantau, preview klaim
- [x] **Tahap 2** · Koneksi MetaMask (EIP-6963/EIP-1193), deteksi jaringan salah, penyimpanan IndexedDB per alamat + chain ID + campaign + versi adapter, migrasi & ekspor/impor cadangan
- [ ] **Tahap 3** · Satu sumber live tervalidasi dengan pembaruan berbasis TTL
- [ ] **Tahap 4** · Eligibility dari aturan, proof, atau snapshot resmi
- [ ] **Tahap 5** · Klaim testnet: simulasi, estimasi biaya, konfirmasi wallet, dan receipt

Rinciannya ada di [`tasks.md`](.kiro/specs/airdrop-hunter-mvp/tasks.md), dengan kebutuhan di [`requirements.md`](.kiro/specs/airdrop-hunter-mvp/requirements.md), rancangan di [`design.md`](.kiro/specs/airdrop-hunter-mvp/design.md), dan hasil verifikasi di [`docs/cek-hasil.md`](docs/cek-hasil.md).

## Struktur proyek

```text
src/
├── app/              App shell, header, navigasi, routing hash
├── components/       Ikon, badge, dialog native, tampilan alamat
├── features/
│   ├── dashboard/    Daftar, filter, detail, watchlist
│   ├── scanner/      Orkestrasi scan, hidrasi checkpoint, dan panel status
│   ├── wallet/       Identitas, deteksi EIP-6963, konektor MetaMask EIP-1193, mode pantau
│   └── claims/       Preview klaim (cek akun & jaringan MetaMask) dan riwayat transaksi
├── storage/          IndexedDB v2 (`index.ts`, `keys.ts`, `types.ts`), migrasi, ekspor/impor JSON
├── adapters/         sources · eligibility · claims
├── domain/           Tipe, normalisasi, label status, validasi alamat EIP-55
├── demo/             Fixture berlabel DEMO
├── tests/            Pengujian otomatis Tahap 2 (`tahap2.test.ts`)
└── styles/           Token warna, layout, komponen
.kiro/                Spec (requirements, design, tasks) dan steering
docs/                 Hasil pemeriksaan dan aset README
```
