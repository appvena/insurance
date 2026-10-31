# Kalkulator Asuransi Kendaraan — v1.0

Aplikasi web satu halaman (`index.html`) untuk menghitung premi asuransi kendaraan, membuat PDF penawaran (Quotation Slip), dan mengirimnya via WhatsApp. Data rate & kendaraan disimpan di Firebase Firestore; login admin memakai Firebase Authentication. Hosting di GitHub Pages.

Copyright © SRISP 2026 · v1.0

## Isi
| File | Fungsi |
|---|---|
| `index.html` | Seluruh aplikasi (kalkulator + panel admin) |
| `firestore.rules` | Aturan keamanan Firestore |
| `README.md` | Panduan ini |

## Langkah pemasangan

### 1. Firebase Authentication
1. Buka https://console.firebase.google.com → proyek **alex-insurance**.
2. **Build → Authentication → Get started → Sign-in method** → aktifkan **Email/Password**.
3. Tab **Users → Add user**: email `alex@insurance.com`, isi password pilihan Anda.
4. Salin **User UID** akun tersebut.
5. **Settings → User actions** → matikan **Enable create (sign-up)** supaya orang lain tidak bisa membuat akun.
6. **Settings → Authorized domains** → tambahkan `NAMA-USER-GITHUB.github.io`.

### 2. Firestore
1. **Build → Firestore Database → Create database** (lokasi `asia-southeast2 (Jakarta)`, mode production).
2. Tab **Rules** → tempel isi `firestore.rules`, ganti `GANTI_DENGAN_UID_ADMIN` dengan UID dari langkah 1.4, lalu **Publish**.
3. Setelah UID terpasang, hapus baris pengecekan email di rules (lihat komentar di file).

### 3. GitHub Pages
1. Buat repository baru (mis. `kalkulator-asuransi`), upload `index.html`.
2. **Settings → Pages → Source: Deploy from a branch → main / root → Save**.
3. Aplikasi aktif di `https://NAMA-USER-GITHUB.github.io/kalkulator-asuransi/`.

### 4. Pertama kali
Buka tab **Admin** → login → periksa pengaturan → klik **Simpan Pengaturan**. Ini membuat dokumen `config/settings` dan `config/vehicles` di Firestore. Sebelum itu, aplikasi memakai rate bawaan.

## Rumus perhitungan
- **Harga Pertanggungan (HP)** = harga kendaraan + perlengkapan tambahan
- **Kasko** = HP × rate sesuai kelompok harga (tabel rate Comprehensive / TLO)
  - Comprehensive bawaan: ≤125 jt 3,82% · ≤200 jt 2,67% · ≤400 jt 2,18% · ≤800 jt 1,20% · >800 jt 1,05%
  - Loading usia (opsional): + X% dari rate per tahun di atas batas usia
- **Perluasan** = HP × rate: Banjir 0,075% · Gempa 0,12% · Huru-hara 0,05% · Terorisme 0,05% · Bengkel resmi 0,15%
- **TJH Pihak III** = limit × 1% (limit: 5/10/15/20/25 juta)
- **PA Pengemudi / Penumpang** = limit × 0,5%
- Periode bukan 1 tahun → pro-rata hari/365
- **Total** = premi − diskon (jika diaktifkan) + biaya polis + materai

Semua angka di atas bisa diubah di panel Admin.

## Kirim via WhatsApp
- **HP (Android/iOS)**: tombol *Kirim PDF via WA* membuka menu bagikan; pilih WhatsApp → PDF langsung terlampir.
- **Komputer**: PDF terunduh dan WhatsApp Web terbuka dengan ringkasan teks ke nomor tertanggung; lampirkan PDF secara manual. (WhatsApp tidak mengizinkan situs web melampirkan file otomatis lewat link.)

## Akun admin
Di tab **Admin → Akun**: ganti password (perlu password lama) dan ganti email (Firebase mengirim link verifikasi ke email baru). Ada juga *Lupa password?* di halaman login.

## Catatan keamanan
API key Firebase memang publik untuk aplikasi web — keamanan data dijamin oleh `firestore.rules`, jadi pastikan rules sudah dipasang dengan UID admin.
