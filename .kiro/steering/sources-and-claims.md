---
inclusion: always
---

# Sumber, wallet, dan klaim

- Jangan pernah meminta, mencatat, mengirim, atau menyimpan seed phrase/private key. Membaca alamat publik tidak memerlukan izin transfer; jangan meminta tanda tangan hanya untuk membaca data publik.
- Sumber resmi dan alamat kontrak diperiksa dari bukti proyek. Agregator hanya petunjuk penemuan. Jangan menjanjikan semua airdrop ditemukan, reward diterima, atau token bernilai.
- Campaign tersedia ≠ wallet eligible. Eligibility memerlukan aturan dan data resmi (API, proof/snapshot, kontrak). Data tidak tersedia, mekanisme belum didukung, respons gagal, atau hasil tidak cukup → `unknown` dengan alasan, sumber, timestamp, aturan. Jangan membuat proof atau reward dari demo untuk campaign nyata.
- Sebelum klaim: cek ulang akun, jaringan, tenggat, eligibility; verifikasi kontrak, ABI, fungsi, argumen, penerima, jumlah; tolak payload arbitrer dari feed; simulasi dengan akun pengirim; estimasi biaya; preview; konfirmasi wallet; pantau receipt + event reward.
- Klaim standar tidak boleh diam-diam meminta unlimited approval, Permit, atau transfer aset lain.
- Hash saja = menunggu. Terkonfirmasi butuh receipt sukses + bukti adapter. Tangani ditolak, revert, diganti, dibatalkan, timeout (timeout ≠ gagal permanen; simpan hash dan cek lagi).
- Pisahkan konfigurasi dan label testnet/demo/live. Fixture tidak boleh mengirim transaksi mainnet; tidak semua campaign mendukung tombol Klaim.
