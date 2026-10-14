---
inclusion: always
---

# Produk AirdropHunter

- Tujuan: pengguna menghubungkan MetaMask Chrome extension di laptop, mencari campaign dari sumber yang didukung, melihat status untuk alamatnya, lalu klaim yang didukung melalui konfirmasi wallet. HP hanya memantau alamat publik.
- MVP: dashboard responsif berbahasa Indonesia; tombol Cari airdrop dan Batalkan; pencarian/filter nama, jaringan, status; detail (sumber resmi, jaringan, tenggat, syarat, waktu cek, ketersediaan klaim); watchlist, pengaturan, hasil terakhir di browser; satu sumber live tervalidasi; klaim testnet sebelum klaim nyata.
- Batasan: tanpa pemindai 24/7, backend/database cloud, login server, atau sinkronisasi antarperangkat. Scan hanya saat aplikasi aktif dan boleh berhenti saat browser tidur.
- Status disimpan terpisah: campaign (peluang, klaim terbuka, berakhir), eligibility per alamat (belum diketahui, memenuhi syarat, tidak memenuhi syarat, perlu tugas), transaksi (belum dikirim, menunggu, terkonfirmasi, gagal), asal data (demo/testnet/live) + bukti sumber.
- Label dashboard: Peluang, Siap diklaim, Belum terverifikasi, Tidak memenuhi syarat, Sudah diklaim, Berakhir. Klaim terbuka tidak berarti wallet memenuhi syarat.
- Aksi: Klaim hanya bila eligibility terkonfirmasi, tenggat berlaku, sumber diperiksa, dan adapter mendukung; tanpa adapter → situs klaim resmi; peluang/perlu tugas → lihat syarat tanpa menjanjikan hadiah; belum diketahui → periksa/checker resmi; berakhir → arsip, klaim nonaktif.
- Prioritas: alur dan data benar → tampilan desktop/HP → koneksi wallet konsisten → satu integrasi live terbukti → klaim testnet → sumber/adapter tambahan.
