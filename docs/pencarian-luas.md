# Pencarian luas — sebelum Tahap 5

Cakupan penemuan tidak dibatasi pilihan koin, minimum TVL, kategori, atau top-N. Definisi free mengikuti permintaan terbaru: **distribusi token gratis, dapat diklaim ke wallet, dan memiliki nilai pasar; gas jaringan boleh diperlukan**. Ketentuan ini menggantikan target sebelumnya yang mensyaratkan Rp0 termasuk gas. Rincian pemeriksaan tersedia di [free bernilai](free-bernilai.md). Transaksi Tahap 5 belum diaktifkan.

## Cakupan sumber

1. `https://api.llama.fi/protocols`: seluruh metadata protokol dengan jaringan EVM yang dikenali dari definisi viem yang sudah terpasang. Tidak menyaring simbol, TVL, kategori, atau mengambil hanya delapan kandidat. Nama protokol sama tidak menggabungkan ID sumber berbeda. Versi `defillama-live-2.1.0` memperbarui checkpoint yang masih memakai kriteria sebelumnya.
2. `https://api.merkl.xyz/v4/opportunities?page=0&items=100`: seluruh halaman katalog resmi Merkl sampai respons pendek/kosong, tanpa parameter penyaring token/chain, minimum TVL/APR, atau batas total hasil. ID sumber stabil dan terpisah dari nama tampilan. Versi `merkl-catalog-1.1.0` memperbarui checkpoint dengan keterangan kriteria lama.
3. `https://api.merkl.xyz/v4/users/{address}/rewards/summary`: seluruh reward yang dilaporkan untuk alamat aktif, tanpa filter token/jaringan. Endpoint `/rewards` memerlukan `chainId` menurut schema yang diperiksa; `/summary` menyediakan filter opsional sehingga dipilih untuk cakupan lintas jaringan.

DefiLlama adalah indeks metadata protokol, bukan daftar hak klaim. Katalog Merkl juga memuat insentif yang membutuhkan aset, deposit, pinjaman, atau aktivitas sebelumnya. Keberadaan program tidak otomatis membuktikan wallet berhak klaim, token memiliki nilai pasar, atau transfer berhasil. Poin, PRETGE, dan data testnet dibedakan dari token mainnet.

Ukuran halaman API 100 dan halaman tampilan 100 tidak membatasi total hasil. Pencarian/filter tampilan bekerja pada seluruh hasil yang sudah dimuat, lalu menampilkan halaman yang dipilih. Kontrol pencarian, jaringan, dan status tetap tersedia untuk menavigasi data; collector tidak menerapkan pilihan koin tersembunyi.

Tidak ada sumber tunggal yang mengindeks seluruh koin/campaign internet. Patch ini memakai penyedia di atas, dalam cakupan EVM dan identitas MetaMask/mode pantau yang sudah tersedia. Nama jaringan DefiLlama yang tidak dapat dipetakan tidak ditebak sebagai Ethereum. Reward summary Merkl dapat memuat chain ID di luar jaringan yang dapat diganti oleh aplikasi; pembacaan data tersebut tidak menambahkan dukungan transaksi baru. Sumber lain memerlukan adapter dan verifikasi yang sesuai; URL atau klaim “free” dari feed tidak dapat langsung menjadi bukti.

## Reward per alamat dan nilai pasar

- `amount` adalah alokasi kumulatif menurut API; `claimed` adalah bagian yang dilaporkan sudah diklaim. Nilai belum diklaim dihitung dengan `BigInt(amount) - BigInt(claimed)`.
- `pending` belum dapat diklaim dan ditampilkan terpisah. Data tidak konsisten, jumlah di luar uint256, token/jaringan tidak cocok, atau entri duplikat ditolak, bukan dijumlahkan atau diubah menjadi nol.
- Semua reward `TOKEN` mainnet dengan jumlah belum diklaim positif diperiksa otomatis untuk harga dan likuiditas. Tidak ada pilihan simbol, minimum USD, atau batas total token. Jaringan yang belum didukung penyedia harga tetap tampil dengan nilai belum diketahui.
- Poin, PRETGE, token uji, dan jumlah nol tidak dinyatakan sebagai kandidat free bernilai. Flag verifikasi token Merkl tidak membuktikan nilai pasar atau eligibility on-chain.
- Hasil adalah laporan API yang dapat terlambat. Bukti pasar adalah indikasi harga dan likuiditas saat dibaca, bukan jaminan token dapat dijual atau jumlah uang yang pasti diterima. Keberhasilan transfer memerlukan bukti transaksi/distribusi; receipt klaim belum ditambahkan.
- Hanya alamat publik dikirim ke endpoint reward. Seed/private key tidak diminta. Proof dan URL dari payload tidak diteruskan ke transaksi.
- Hasil wallet dan harga berada di memori sesi, terpisah dari checkpoint katalog publik. Pergantian identitas/mode/scan dan pembersihan data membatalkan pemeriksaan lama. Saat pemeriksaan gagal, nilai ditampilkan belum diketahui.

Klaim standar Merkl dan UNI dapat memerlukan gas jaringan. Gas bukan harga pembelian token reward dan tidak menggugurkan kriteria free terbaru. Kebutuhan aktivitas/modal sebelumnya tetap ditampilkan; aplikasi tidak menyebut seluruh program sebagai partisipasi tanpa modal.

## Kegagalan dan waktu tunggu

Katalog Merkl memakai limiter per halaman, menghormati HTTP 429/Retry-After, dan mendeteksi halaman berulang. Jika halaman lanjut gagal, respons cacat, scan dibatalkan, atau anggaran waktu 120 detik habis, hasil parsial tidak disimpan sebagai scan lengkap. Checkpoint sukses sebelumnya mengikuti aturan scanner dan ditandai usang bila sumber gagal. Anggaran waktu dan rate limit adalah kendali operasi, bukan batas jumlah koin.

Pemeriksaan reward dan setiap permintaan pasar memiliki timeout delapan detik. Tidak memakai backend, proxy cloud, API key, login, atau dependency baru. Endpoint JSON dan CORS dari hosting nyata belum berhasil diverifikasi di lingkungan sesi ini; schema dan panduan integrasi diperiksa dari sumber primer. Fixture pengujian tidak membuktikan hak klaim wallet nyata.

Sumber teknis: [portal pengembang Merkl](https://app.merkl.fr/developers), [OpenAPI saat diperiksa](https://app.merkl.fr/openapi.json), [panduan integrasi resmi](https://github.com/AngleProtocol/merkl-docs/blob/main/integrate-merkl/app.md), [definisi jaringan viem](https://github.com/wevm/viem/tree/main/src/chains), dan [API DEX Screener](https://docs.dexscreener.com/api/reference). Portal Merkl menuliskan pagination 1-indexed di satu bagian, sedangkan schema `/v4/opportunities/` menetapkan default/minimum 0. Adapter dan fixture mengikuti schema 0-indexed; perilaku live tetap perlu diuji saat akses tersedia.

## Pemeriksaan dan pemasangan

`npm run test:discovery` memeriksa perluasan sumber dan regresi terkait. `npm run test:value` memeriksa kriteria free bernilai dan bukti pasar. Keduanya menjalankan modul tes tanpa entry aplikasi atau `dist`. Patch free bernilai dipasang setelah patch Tahap 4 dan patch pencarian luas. Paket patch hanya memuat file yang berubah/baru; perintah pengujian di dokumentasi bukan pernyataan bahwa pengujian telah lulus di setiap mesin.
