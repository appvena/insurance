# Vehicle Protection — v1.5.1

Copyright © SRISP 2026 · v1.5.1

## Isi zip
```
upload-ke-github/     ← upload ISI folder ini ke root repository GitHub
  index.html
  css/style.css
  js/config.js        koneksi data & nomor versi
  js/data.js          rate bawaan, teks polis bawaan, daftar kendaraan
  js/app.js           logika aplikasi
  manifest.json
  sw.js
  icons/
panduan/              ← JANGAN di-upload ke GitHub (supaya tidak bisa dibuka publik)
  README.md
  firestore.rules     tempel di Firebase Console → Firestore → Rules
```

## Yang baru di v1.5.1
- **Kop PDF baru (model B)**: kop putih berisi logo dengan warna aslinya, nama brand, nama penanggung, dan alamat; di bawahnya pita biru tipis bertuliskan "Penawaran Asuransi Kendaraan Bermotor" dan kontak Hubungi Saya. Logo lebar (seperti logo Mega) mendapat ruang lebih lebar.
- **Watermark logo** tipis di tengah setiap halaman PDF, baik saat diunduh maupun dikirim via WA. Bisa dimatikan di Admin → Perusahaan → Logo. Tanpa logo upload, watermark tidak ditampilkan.

## Yang baru di v1.5
- **Mode gelap**: otomatis mengikuti setelan HP/PC. Tombol bulan/matahari di kanan atas untuk mengganti manual (tersimpan per perangkat).
- **Status penawaran** di Riwayat: Baru, Dikirim, Deal, Batal. Status otomatis menjadi *Dikirim* setelah dikirim via WA. Penawaran Baru/Dikirim yang lewat masa berlaku ditandai *Kedaluwarsa*. Ada filter status.
- **Pengingat perpanjangan** di atas Riwayat: polis berstatus *Deal* yang berakhir dalam 60 hari (bisa diubah di Admin → Tampilan) atau lewat sampai 30 hari. Tombol *Ingatkan via WA*, *Buat perpanjangan* (periode otomatis tahun berikutnya), dan *Sudah selesai*. Angka merah di menu Riwayat = polis yang berakhir ≤ 30 hari.
- **Cadangan** (Admin → Cadangan):
  - *Unduh file cadangan* (.json): semua pengaturan, kendaraan, logo, foto header, dan opsional riwayat & Inbox.
  - *Pulihkan dari file*: dimuat ke formulir, berlaku setelah klik Simpan. Riwayat & Inbox digabung tanpa menghapus data yang ada.
  - *Cadangan otomatis*: setiap klik Simpan, 20 salinan terakhir disimpan dan bisa dipulihkan.

## Setelah upload v1.5 — wajib
- Tempel ulang `panduan/firestore.rules` di Firebase Console → Firestore → Rules → **Publish** (ada aturan baru untuk Cadangan). Isi kembali UID admin.

## Membatasi API key Firebase ke domain Anda (disarankan)
API key di `js/config.js` memang terlihat oleh siapa pun. Pembatasan ini membuat key hanya mau dipakai dari situs Anda, sehingga orang lain tidak bisa memakainya dari situs lain.
1. Buka https://console.cloud.google.com dan login dengan akun Google yang sama dengan Firebase.
2. Di bagian atas, pilih proyek **alex-insurance**.
3. Menu ☰ → **APIs & Services** → **Credentials**.
4. Di bagian **API Keys**, klik key bernama **Browser key (auto created by Firebase)** — nilainya diawali `AIzaSyDQPi…`.
5. Di **Application restrictions**, pilih **Websites**, lalu **Add** satu per satu:
   - `https://NAMA-USER-GITHUB.github.io/*`
   - `https://alex-insurance.firebaseapp.com/*`
   - `http://localhost/*` (hanya jika Anda mencoba di komputer sendiri)
6. Klik **Save**. Perubahan berlaku dalam beberapa menit.
7. Buka aplikasi Anda dan coba login admin. Jika muncul gagal terhubung, periksa ejaan alamat di langkah 5 (harus sama persis dengan alamat situs, termasuk `https://` dan `/*`).

## Yang baru di v1.4.1
- Ikon aplikasi baru (setir neon) untuk Android, iPhone, PC, favicon, dan header aplikasi.

## Yang baru di v1.4
- **Halaman Admin baru**: di HP berupa menu daftar → halaman isi dengan tombol kembali; di PC menu di kiri, isi di kanan. Tombol **Simpan** selalu di bawah layar dengan tanda "Ada perubahan yang belum disimpan". Tombol kembali HP menutup halaman isi dulu.
- **Warna lebih lembut** dan aplikasi lebih ringan: library PDF dimuat belakangan, font lebih sedikit.
- **Pembaruan aplikasi**: aplikasi memeriksa versi baru setiap dibuka. Jika ada, muncul kartu **Versi baru tersedia → Perbarui**. Di Admin → Akun ada **Periksa pembaruan** dan nomor versi.
- **Logo upload** (Admin → Perusahaan → Logo): tampil di header aplikasi dan PDF.
- Nama di ikon aplikasi terpasang: **Vpro**. Di dalam aplikasi tetap Vehicle Protection.
- Hitung Cepat dan Penawaran tidak berubah, kecuali warna.

## Yang baru di v1.3
- **Perluasan Tambahan** (Admin → Perluasan & Biaya → + Tambah perluasan): isi nama, rate (× Harga Pertanggungan), keterangan untuk halaman depan, klausula untuk PDF, centang fungsi yang berlaku (Pribadi / Dinas / Komersial), dan Aktif.
  - Muncul sebagai pilihan centang di Hitung Cepat dan Penawaran, hanya untuk fungsi yang dicentang.
  - Tidak ikut diskon dan tidak kena loading usia.
  - Klausulanya tercetak di PDF hanya jika perluasan itu dipilih.
  - Contoh: Baterai Kendaraan Hybrid / Listrik, rate 0,02%.

## Yang baru di v1.2
- **Fungsi kendaraan** (Pribadi, Dinas, Komersial): tabel rate kasko sendiri per fungsi (Admin → Rate Kasko), teks risiko sendiri, klausula, dan subjectivity sendiri per fungsi (Admin → Teks Polis). Komersial hanya Comprehensive. Pilihan fungsi ada di Hitung Cepat dan Penawaran.
- **Hubungi Saya** (Admin → Halaman Depan): nama & nomor WA tampil di halaman web, PDF, dan teks bagikan WA.
- **Halaman depan profesional**: header warna & pola, atau foto upload sendiri (Admin → Halaman Depan). Judul & subjudul bisa diubah.
- **Tanya Admin**: pengunjung mengirim nama, nomor HP, dan pertanyaan. Masuk ke **Admin → Inbox**, dengan tombol **Balas via WA** dan penanda jumlah pesan belum dibalas.
- Nama aplikasi **Vehicle Protection**. Tulisan teknis, "kalkulator", dan "agen" dihapus dari halaman.

## Setelah upload v1.2 — wajib
1. **Firestore Rules**: tempel ulang `panduan/firestore.rules` (ada aturan baru untuk Inbox), isi UID admin, **Publish**. Tanpa ini, Tanya Admin tidak bisa mengirim pesan.
2. **Firestore Index**: saat pertama membuka Inbox, jika pesan tidak muncul, buka Firebase Console → Firestore → Indexes. Biasanya tidak perlu karena urutan memakai satu kolom.
3. **Isi pengaturan baru** lalu **Simpan Pengaturan**:
   - Rate Kasko → pilih Dinas dan Komersial, isi tabelnya (tombol "Salin tabel dari Pribadi" untuk mulai cepat).
   - Teks Polis → sesuaikan per fungsi.
   - Halaman Depan → nama & nomor WA Hubungi Saya, foto header bila ingin.
   Pengaturan lama (rate & teks) otomatis dipindahkan ke ketiga fungsi.

## Pemasangan awal (jika belum)
### Firebase Authentication
1. https://console.firebase.google.com → proyek **alex-insurance** → Authentication → Sign-in method → aktifkan **Email/Password**.
2. Users → Add user `alex@insurance.com` + password. Salin **User UID**.
3. Settings → User actions → matikan **Enable create (sign-up)**.
4. Settings → Authorized domains → tambahkan `NAMA-USER-GITHUB.github.io`.

### Firestore
Firestore Database → Create database (lokasi `asia-southeast2 (Jakarta)`, mode production) → Rules → tempel `firestore.rules`, isi UID → Publish.

### GitHub Pages
Upload isi `upload-ke-github/` ke repository → Settings → Pages → Deploy from a branch → main / root → Save.

## Memperbarui di kemudian hari
Setiap ada file yang diubah, naikkan `VERSION` di `sw.js` (mis. `ai-v1.5.1` → `ai-v1.5.2`) supaya aplikasi yang sudah terpasang mendapat versi baru.

## Catatan
- Tulisan teknis sudah tidak tampil di halaman. Kode sumber (View Source) tetap bisa dibaca siapa pun, seperti semua situs web; keamanan data dijaga oleh Firestore Rules.
- Tanya Admin dibatasi: isian divalidasi di Rules, satu kiriman per menit per perangkat, dan ada jebakan anti-bot. Untuk perlindungan spam yang lebih kuat, aktifkan Firebase App Check.
