---
inclusion: always
---

# Teknologi

- Stack: React 19 + TypeScript 6 + Vite 8 (template resmi create-vite), CSS variables + Grid/Flexbox, npm + package-lock. Node.js `^20.19.0 || >=22.12.0`.
- Perintah: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run lint` (oxlint), `npm run build`, `npm run preview`.
- Tahap 2: wagmi + viem + TanStack Query, konektor MetaMask saja (periksa dokumentasi resmi saat mulai). Tidak ada WalletConnect atau SDK wallet mobile. viem sudah dipakai untuk validasi alamat EIP-55.
- Penyimpanan: IndexedDB (Tahap 2) per alamat + chain ID + campaign ID + versi adapter. Jangan menaruh data satu wallet di cache wallet lain.
- Jangan menambah backend, ORM, PostgreSQL, cron, atau kredensial server. Rahasia tidak boleh masuk bundle atau variabel `VITE_`.
- Akses data hanya lewat adapter; jangan mengarang endpoint. Bila CORS/izin menghalangi, tampilkan sumber belum didukung atau checker resmi.
- Normalisasi nama, chain ID, alamat kontrak, sumber, tenggat, dan ID campaign. Tenggat tidak diketahui tetap `null`.
- Scan: dedupe, concurrency terbatas, timeout, batal, retry terbatas + backoff, rate limit, checkpoint per sumber, TTL saat tab aktif kembali (awal 60 menit). Error data menjadi `unknown`.
- PWA opsional setelah dasar jalan; service worker tidak boleh menyajikan data lama sebagai status live.
- Uji bermakna untuk turunan status, pemisahan wallet, dan transaksi; jangan menulis tes yang menyalin implementasi.
