# Kriteria free bernilai — sebelum Tahap 5

Definisi terbaru pengguna: **airdrop dibagikan gratis, tersedia untuk diklaim ke wallet, dan mempunyai nilai mata uang nyata**. Gas jaringan boleh diperlukan. Target lama “Rp0 termasuk gas” tidak lagi menjadi syarat kelulusan. Cakupan penemuan berasal dari [sumber yang terintegrasi](pencarian-luas.md), tanpa pilihan koin tertentu atau top-N lokal.

## Apa yang diperiksa

Distribusi gratis dipisahkan dari gas. Sumber terverifikasi harus menunjukkan bahwa token reward tidak dibeli saat klaim; kata “free”, “gasless”, atau flag verifikasi dalam feed saja tidak cukup. Program tetap dapat memerlukan aset, deposit, atau aktivitas sebelumnya, yang harus diperiksa pada syarat program.

Untuk reward Merkl per alamat, aplikasi memakai jumlah kumulatif dikurangi jumlah yang dilaporkan sudah diklaim. `pending` tidak dimasukkan. Token mainnet dengan jumlah belum diklaim positif kemudian diperiksa melalui [API publik DEX Screener](https://docs.dexscreener.com/api/reference):

```text
GET https://api.dexscreener.com/token-pairs/v1/{chainSlug}/{tokenAddress}
```

Harga USD hanya diterima jika jaringan cocok dan `baseToken.address` sama dengan alamat token reward. Kecocokan simbol atau posisi sebagai quote token tidak membuktikan harga reward tersebut. Harga dan likuiditas USD harus finite dan positif; pasangan dengan likuiditas tertinggi yang memenuhi kecocokan dipakai. Tidak ada minimum nilai USD buatan atau daftar simbol pilihan.

Hasil yang sesuai disebut **kandidat** berdasarkan laporan reward dan bukti pasar. Itu belum membuktikan eligibility on-chain, transfer ke wallet, atau transaksi berhasil. Harga dan likuiditas juga tidak menjamin token dapat dijual, bebas pembatasan kontrak, atau menghasilkan uang sebesar angka tampilan. Aplikasi tidak menjamin nilai masa depan.

## Jaringan harga dan kesegaran data

Pemetaan penyedia harga saat ini mencakup Ethereum (1), Optimism (10), BSC (56), Unichain (130), Polygon (137), zkSync Era (324), Base (8453), Arbitrum One (42161), Celo (42220), Avalanche (43114), Linea (59144), dan Scroll (534352). Daftar ini adalah pemetaan jaringan ke API harga, bukan pilihan koin. Reward jaringan lain tetap ditemukan dan ditampilkan dengan nilai belum diketahui.

Semua token mainnet yang memiliki jumlah belum diklaim positif masuk antrean pemeriksaan otomatis, dengan maksimal dua permintaan aktif dan jarak mulai permintaan setidaknya 300 ms. Tidak ada batas total token. Poin, PRETGE, dan token/jaringan testnet tidak dinilai sebagai token bernilai nyata.

Bukti pasar berlaku lima menit sejak waktu pembacaan. API tidak menyediakan timestamp harga yang dipakai di sini; waktu yang ditampilkan adalah waktu aplikasi menerima data. Hasil usang, tidak cocok, tanpa pool yang memenuhi syarat, timeout, atau kegagalan jaringan menghasilkan **belum diketahui**, bukan harga nol atau status positif. Link pasar dibentuk untuk domain DEX Screener dari jaringan dan alamat pair yang divalidasi; URL bebas dari payload tidak dipakai.

Pergantian identitas, sumber, atau scan membatalkan hasil sesi lama. Pemeriksaan baru tidak boleh menempelkan harga wallet sebelumnya ke wallet aktif. Tidak ada bukti pasar positif yang diimpor dari cadangan sebagai hasil pemeriksaan baru.

## Batas tahap ini

Patch ini menambahkan pemeriksaan dan label; transaksi klaim Tahap 5 tetap belum diaktifkan. Aplikasi tidak mengirim klaim, meminta approval, atau menyatakan token telah masuk wallet tanpa bukti transaksi. Arsip UNI/ARB tetap arsip dengan status aslinya. Adapter eligibility UNI yang sudah ada tidak diperluas menjadi dukungan transaksi.

Schema API dan pemetaan jaringan diperiksa dari dokumentasi resmi. Akses endpoint JSON serta CORS pada hosting nyata belum berhasil diuji dalam sesi ini; respons tiruan dalam tes hanya memvalidasi logika aplikasi. Tidak ada jaminan seluruh campaign dari seluruh internet terindeks.
