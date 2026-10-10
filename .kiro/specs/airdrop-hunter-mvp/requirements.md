# Requirements — airdrop-hunter-mvp

Acuan: `AirdropHunter_Brief_Kiro.pdf` (10 Okt 2026). Tahap 1 = dashboard DEMO tanpa koneksi wallet nyata, data live, RPC, atau transaksi. Tiap requirement mencantumkan tahap pengerjaannya.

## Batasan tetap

- Wallet hanya MetaMask Chrome extension di laptop. HP memakai mode pantau alamat publik. Tidak ada WalletConnect, wallet mobile, backend/database cloud, login server, atau pemindai 24/7.
- Aplikasi tidak pernah meminta, mencatat, mengirim, atau menyimpan seed phrase/private key. Tidak ada rahasia di bundle atau variabel `VITE_`.
- Asal data demo, testnet, dan live selalu berlabel terpisah. Fixture demo tidak memiliki jalur klaim dan tidak boleh mengirim transaksi.
- Teks berbahasa Indonesia, singkat, tanpa janji hadiah atau nilai token.

## R1 Dashboard responsif — Tahap 1

Sebagai pemburu airdrop, saya ingin satu panel kerja untuk melihat campaign dan statusnya untuk akun saya.

1. Header SHALL memuat nama aplikasi, jaringan, akun, dan tombol **Cari airdrop**.
2. WHEN lebar layar ≥ 1024 px THEN navigasi tampil sebagai sidebar; WHEN ≥ 1200 px THEN campaign tampil sebagai tabel dengan kolom proyek, jaringan, status untuk wallet, tenggat, dan aksi.
3. WHEN lebar layar < 1200 px THEN campaign tampil sebagai daftar kartu ringkas; WHEN < 1024 px THEN navigasi dan **Cari airdrop** berada di bar bawah yang memperhitungkan safe area.
4. Navigasi SHALL menampilkan fitur yang benar-benar tersedia saja (Tahap 1: Dashboard dan Watchlist).
5. Angka ringkasan SHALL dihitung dari daftar yang sedang tersedia; tidak ada estimasi reward atau grafik dekoratif.

## R2 Pencarian, filter, dan urutan — Tahap 1

1. WHEN pengguna mengetik di kolom pencarian THEN daftar tersaring menurut nama campaign/proyek tanpa membedakan huruf besar/kecil dan diakritik.
2. Filter status (label dashboard) dan jaringan SHALL dapat digabung dengan pencarian; jumlah per status mengikuti filter lain.
3. Pengguna SHALL dapat mengurutkan menurut prioritas status, tenggat terdekat, atau nama.
4. IF tidak ada hasil THEN keadaan kosong menjelaskan penyebab dan menyediakan **Reset filter**.

## R3 Model status — Tahap 1, diperluas Tahap 4–5

1. Sistem SHALL menyimpan terpisah: status campaign (peluang, klaim terbuka, berakhir), eligibility per alamat (belum diketahui, memenuhi syarat, tidak memenuhi syarat, perlu tugas), status transaksi (belum dikirim, menunggu, terkonfirmasi, gagal), serta asal data dan verifikasi sumber.
2. Label dashboard SHALL diturunkan dari kombinasi tersebut: Siap diklaim, Peluang, Belum terverifikasi, Tidak memenuhi syarat, Sudah diklaim, Berakhir. Klaim terbuka tidak berarti wallet memenuhi syarat.
3. IF data eligibility tidak tersedia, gagal, atau mekanismenya belum didukung THEN statusnya `unknown` beserta alasan; error tidak pernah diubah menjadi eligible/ineligible.
4. Tenggat yang tidak diketahui SHALL tetap `null`, tampil "Belum diketahui", dan tidak dianggap terbuka selamanya.
5. Sudah diklaim SHALL mensyaratkan transaksi terkonfirmasi beserta bukti; hash saja berarti menunggu.

## R4 Detail campaign — Tahap 1

1. WHEN pengguna membuka campaign THEN panel detail menampilkan sumber resmi, bukti sumber, jaringan + chain ID, tenggat, persyaratan, alokasi bila diketahui, waktu pemeriksaan, tiga status terpisah, dan ketersediaan klaim.
2. Panel SHALL dapat ditutup dengan tombol Tutup, Escape, atau klik latar, lalu fokus kembali ke pemicunya.
3. Aksi SHALL mengikuti label: Klaim atau situs klaim (siap), Lihat syarat (peluang), Periksa (belum terverifikasi), Lihat alasan (tidak memenuhi syarat), Lihat transaksi (sudah diklaim/menunggu), Lihat arsip (berakhir, klaim nonaktif).
4. Tautan pada data demo SHALL tidak membuka situs; tombolnya menjelaskan alasannya.

## R5 Scan — Tahap 1 (sumber DEMO), Tahap 3 (sumber live)

1. WHEN pengguna menekan **Cari airdrop** THEN scan berjalan per sumber dengan progres, concurrency terbatas, timeout, dan retry terbatas dengan backoff.
2. Scan yang sedang berjalan SHALL tidak digandakan; **Batalkan** menghentikan sumber yang belum selesai dan hasil yang sudah selesai tetap dipakai.
3. IF sebagian sumber gagal THEN hasil sumber lain tetap tampil, setiap sumber gagal dapat **Coba lagi**, dan checkpoint terakhirnya dipertahankan dengan label data lama.
4. WHEN dashboard dibuka tanpa data, atau tab aktif kembali dan data melewati TTL 60 menit, THEN scan otomatis berjalan satu kali; render ulang tidak memicu scan.
5. Waktu scan terakhir dan status usang SHALL tampil akurat.

## R6 MetaMask Chrome extension — Tahap 1 (penjelasan demo), Tahap 2 (koneksi)

1. Tahap 1: **Hubungkan MetaMask** menjelaskan status demo dan tidak membuka permintaan wallet. Deteksi extension hanya membaca pengumuman provider EIP-6963.
2. Tahap 2: koneksi melalui wagmi + konektor MetaMask resmi, disconnect, penolakan dapat dicoba lagi, jaringan salah ditangani, dan cache tampilan dibersihkan saat akun/jaringan berganti. Tidak meminta tanda tangan untuk membaca data publik.

## R7 Mode pantau HP — Tahap 1

1. Pengguna SHALL dapat memasukkan alamat publik EVM untuk dibaca saja, tanpa permintaan wallet, tanda tangan, atau transaksi.
2. Input SHALL divalidasi (format dan checksum EIP-55) dengan pesan spesifik. IF isian tampak seperti private key atau seed phrase THEN kolom dikosongkan, isian tidak disimpan, dan pengguna diperingatkan.
3. WHEN identitas berganti THEN status eligibility, transaksi, dan watchlist identitas sebelumnya tidak ditampilkan untuk identitas baru.
4. Alamat SHALL dipersingkat untuk tampilan dan dapat disalin atau dilihat penuh.

## R8 Klaim — Tahap 1 (preview DEMO), Tahap 5 (testnet)

1. Tahap 1: **Klaim** membuka preview (akun, jaringan, kontrak, penerima, token/jumlah, estimasi biaya, cek pra-klaim) dan tidak mengirim transaksi.
2. Tahap 5: cek ulang akun, jaringan, tenggat, dan eligibility; simulasi dengan akun pengirim; estimasi biaya; konfirmasi wallet; cegah kirim ganda; pantau receipt + bukti. Tangani rejected, reverted, wrong network, timeout, insufficient gas. Tanpa unlimited approval/Permit tersembunyi.

## R9 Penyimpanan lokal — Tahap 2

Pengaturan, watchlist, dan hasil scan SHALL disimpan di IndexedDB dengan kunci alamat + chain ID + campaign ID + versi adapter. Tahap 1 hanya menyimpan di memori tab.

## R10 Aksesibilitas dan kenyamanan — Tahap 1

1. Memakai elemen native, label input, fokus terlihat, urutan fokus logis, dan semua aksi dapat dijalankan dengan keyboard.
2. Status tidak dibedakan hanya dengan warna (ikon + teks). Kontras teks ≥ 4,5:1 diukur pada pasangan warna aktual.
3. Progres scan, hasil, dan error diumumkan melalui live region.
4. Target sentuh sekitar 44 px di HP, zoom tidak dinonaktifkan, `prefers-reduced-motion` dihormati.
