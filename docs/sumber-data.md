# Sumber Data — Tahap 3, pemeliharaan 0.3.1

Dokumen ini menjelaskan implementasi lokal. Ia tidak mencatat pemeriksaan ulang dokumentasi proyek, CORS di perangkat nyata, eligibility wallet, atau keadaan kontrak klaim. Hasil verifikasi versi ini dicatat terpisah di `docs/cek-hasil.md`.

## Metadata API dan arsip lokal

Adapter `src/adapters/sources/liveDefiLlamaAdapter.ts` mengirim `GET https://api.llama.fi/protocols` dengan `Accept: application/json`, tanpa API key atau proxy cloud. Respons yang diharapkan adalah daftar objek metadata protokol, dengan nama, slug, simbol, URL, jaringan, kategori, dan TVL.

| Jenis entri | Provenance | Perilaku aplikasi |
| --- | --- | --- |
| Kandidat dari respons DefiLlama | `origin: live`, `sourceKind: api` | Label LIVE, `status: opportunity`, `sourceVerified: false`, eligibility tetap belum diperiksa |
| Referensi Arbitrum/Uniswap dalam kode | `origin: live`, `sourceKind: local-archive` | Label ARSIP LOKAL, `status: ended`, `sourceVerified: false`, aksi Lihat arsip |
| Fixture simulasi | `origin: demo` | Label DEMO, status dan preview simulasi |

`origin: live` pada referensi lokal menandai kelompok adapter yang memuatnya. UI menggunakan `sourceKind` untuk membedakan referensi lokal dari hasil API. Array API kosong tetap menghasilkan dua referensi lokal; keberadaan arsip tidak membuktikan API menemukan campaign tersebut.

Kandidat API dipilih dari metadata dengan simbol kosong/`-`, jaringan EVM yang didukung, URL HTTPS, dan TVL minimal 5 juta USD. Kategori CEX, Chain, dan Bridge dikecualikan. Maksimal delapan kandidat diurutkan menurut TVL. Simbol kosong hanya petunjuk penemuan; aplikasi tidak menyimpulkan bahwa proyek pasti belum memiliki token atau akan mengadakan airdrop. Kandidat memiliki `deadline: null`, `claimMethod: unknown`, dan `contract: null`.

## Referensi historis

`LOCAL_ARCHIVE_CAMPAIGNS` menyimpan referensi ARB di chain 42161 dan UNI di chain 1 beserta tautan dokumentasi dan alamat kontrak sebagai informasi lokal. Adapter tidak memanggil kontrak, mengambil proof, atau memeriksa wallet. Kecocokan slug/nama dari DefiLlama hanya menambahkan catatan bahwa metadata protokol tersedia; tidak mengubah `sourceVerified`.

URL terkurasi `https://arbitrum.foundation` dan `https://uniswap.org` tidak diganti oleh URL dari agregator. Arsip tetap nonaktif di aplikasi. `ended` pada arsip adalah klasifikasi aplikasi untuk menonaktifkan klaim, bukan hasil pemeriksaan keadaan kontrak saat ini. Tenggat UNI adalah `null`; tanggal peluncuran 2020 tidak dipakai sebagai deadline. Tenggat ARB yang tersimpan adalah data referensi lokal, bukan pemeriksaan ulang pada setiap scan.

`checkedAt` pada kandidat API menunjukkan waktu metadata berhasil diproses. Pada arsip, timestamp dan caption **Waktu arsip dimuat** menunjukkan pemuatan referensi lokal pada scan, bukan waktu verifikasi klaim. Versi adapter adalah `defillama-live-1.1.0`.

## Cache dan pembaruan

Scanner menunggu pengaturan dan checkpoint dari penyimpanan selesai dimuat sebelum scan otomatis. Kesegaran dihitung per sumber dengan TTL awal 60 menit. Hasil sukses kosong juga merupakan cache yang sah. Saat halaman dibuka atau tab kembali terlihat, hanya sumber terpilih yang cache-nya hilang/usang yang diperbarui. Tombol scan manual tetap dapat meminta pembaruan.

Checkpoint yang menyatakan versi adapter lama, atau memuat campaign dengan versi adapter berbeda, tidak digunakan untuk menghidrasi tampilan. Hasil terakhir tetap tersedia bila permintaan berikutnya gagal atau dibatalkan, dengan penanda data lama bila ada campaign yang ditampilkan.

## Pembatasan dan kegagalan

- Limiter lokal menerapkan jeda otomatis 15 detik, maksimal enam permintaan per jendela 60 detik, dan blokir server `Retry-After` setelah HTTP 429.
- Retry otomatis menunggu nilai terbesar antara backoff, `SourceError.retryAfterMs`, dan waktu tunggu limiter. Scanner memeriksa ulang limiter setelah jeda. Menunggu retry dapat dibatalkan.
- Tombol Coba lagi dapat melewati jeda minimum lokal, tetapi tidak melewati batas jendela permintaan atau blokir server.
- HTTP 401/403 menjadi `unsupported`; JSON/struktur tidak valid menjadi `invalid`. HTTP dan error sementara dapat di-retry secara terbatas.
- `TypeError` saat browser dianggap online diklasifikasikan sebagai kemungkinan CORS, ekstensi, atau jaringan lokal. Klasifikasi ini tidak membuktikan penyebabnya. Dukungan CORS di perangkat nyata perlu diuji tersendiri.

## Cadangan lokal

Ekspor/impor tetap memakai skema penyimpanan v2, dengan migrasi v1 yang didukung. Impor memvalidasi seluruh payload sebelum mengganti data: tipe/enum, identitas, timestamp, URL, keterkaitan chain/campaign/versi, serta kunci unik. Field yang tidak didukung ditolak. Hash transaksi publik `0x` dengan 64 digit heksadesimal diterima pada field hash yang sesuai; ia tidak ditolak hanya karena panjangnya sama dengan private key.

Cadangan lokal tidak merupakan bukti eligibility atau transaksi on-chain. Tahap 4 (eligibility resmi) dan Tahap 5 (klaim testnet) belum dimulai dalam pemeliharaan ini.
