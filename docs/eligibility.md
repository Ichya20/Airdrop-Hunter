# Eligibility — patch Tahap 4

Patch ini menambahkan satu mekanisme resmi: proof distribusi UNI historis di Ethereum, diverifikasi melalui kontrak MerkleDistributor yang dipatok di kode. Bukan pemindai eligibility untuk semua campaign. DefiLlama tetap menyediakan metadata penemuan, bukan keputusan kelayakan.

## Sumber dan aturan

- Distributor Ethereum (chain ID 1): `0x090D4613473dEE047c3f2706764f49E0821D256e`, dari [referensi teknis Uniswap](https://developers.uniswap.org/docs/ecosystem/governance/technical-reference).
- Token yang diharapkan: UNI `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984`.
- [Kontrak resmi](https://github.com/Uniswap/merkle-distributor/blob/master/contracts/MerkleDistributor.sol) menetapkan leaf `keccak256(abi.encodePacked(index, account, amount))`, `merkleRoot()`, dan `isClaimed(index)`.
- [Implementasi proof resmi](https://github.com/Uniswap/merkle-distributor/blob/master/src/balance-tree.ts) menggabungkan pasangan hash terurut.
- [Dataset resmi](https://github.com/Uniswap/retroactive-query) menautkan blob proof publik `mrkl.uniswap.org`. Endpoint historis itu belum dipastikan masih tersedia. Aplikasi tidak mengunduh seluruh snapshot dan tidak mengarang endpoint per alamat.

Adapter hanya menerima campaign UNI yang cocok dengan identitas campaign, jaringan, asal LIVE, dan kontrak yang dipatok. URL, ABI, fungsi, dan calldata dari feed tidak dijalankan. Pembacaan memakai RPC publik Ethereum bawaan konfigurasi mainnet viem, tanpa kunci API, proxy, atau tanda tangan wallet. Root, token, dan status klaim dibaca pada nomor blok yang sama. Nomor blok dicatat dalam alasan hasil.

## Cara pemeriksaan

1. Pilih alamat publik dalam mode pantau, atau gunakan MetaMask pada Ethereum Mainnet.
2. Pilih sumber LIVE/semua, lalu buka arsip Uniswap Governance Token Distribution ($UNI).
3. Dari salinan dataset resmi, ambil `index`, `amount`, dan `proof` milik alamat tersebut. Tambahkan field `address` yang sama dengan alamat aktif.
4. Tempel satu objek JSON dengan tepat empat field: `address` (alamat EVM), `index` (bilangan bulat aman atau string desimal), `amount` (string desimal atau heksadesimal jumlah satuan dasar token), dan `proof` (daftar hash 32 byte). Tekan **Periksa ulang**.

Ukuran maksimum 32 KiB; proof maksimum 64 hash. Nilai numerik harus muat uint256. Jangan mengubah nilai amount menjadi tampilan desimal token. Input bukan seed phrase, private key, URL, atau isi seluruh snapshot. Input mentah tidak dicatat pada error, disimpan dalam backup, atau dikirim ke RPC; RPC membaca root, token, dan status indeks klaim.

Proof yang diterima hanya diingat selama sesi tab untuk pemeriksaan ulang; setelah reload perlu dimasukkan lagi. Jika dataset/proof tidak dapat diperoleh, status tetap belum diketahui. Tidak ada proof bawaan untuk mengaku eligible pada alamat nyata.

## Hasil dan penyimpanan

- Proof sah + token/jaringan benar + indeks belum diklaim → `eligible` untuk alokasi historis. Ini tidak membuka aksi klaim arsip.
- Proof sah + indeks sudah diklaim → `ineligible` untuk klaim ulang, dengan alasan sudah dipakai. Tidak membuat receipt, hash, atau transaksi `confirmed`.
- Proof salah, alamat berbeda, jaringan salah, data tidak lengkap, RPC gagal, timeout, atau mekanisme tidak didukung → `unknown` dengan alasan. Ketiadaan proof bukan bukti tidak eligible.
- Hasil menyimpan alasan, sumber, versi aturan, dan `checkedAt` per akun + jaringan campaign + campaign ID + versi adapter sumber. Versi aturan eligibility diperiksa terpisah. `savedAt` tidak memperpanjang masa berlaku.
- Masa berlaku lima menit dari `checkedAt`; timestamp invalid/di masa depan atau versi aturan lama tidak dipercaya. Hasil usang menjadi `unknown` dan ditandai di dashboard/detail serta cek pra-klaim.
- Membuka detail atau beralih ke preview klaim menjalankan pengecekan ulang. Selama pemeriksaan, hasil lama tidak dianggap bukti eligible. Pergantian akun/jaringan/mode sumber membatalkan hasil yang masih berjalan.
- Impor cadangan memvalidasi seluruh struktur, lalu mewajibkan verifikasi ulang hasil non-demo. Selesainya permintaan lama tidak boleh mengisi ulang data setelah impor/pembersihan cache.

Campaign, eligibility, dan transaksi tetap terpisah. Status arsip `ended`, tenggat UNI `null`, metadata `sourceVerified`, serta arsitektur wallet tidak diubah oleh hasil proof. Distributor ARB historis yang sudah dihancurkan tidak dipakai sebagai checker aktif.

## Verifikasi patch

Jalankan `npm run test:stage4` untuk suite terarah. Runner hanya membundel modul tes dan dependensinya untuk Node; tidak membangun entry aplikasi atau menghasilkan `dist`. Daftar pemeriksaan dan batas pengujian dicatat di `cek-tahap4.md`. Tahap 5 dan audit aksesibilitas menyeluruh tetap belum dikerjakan.
