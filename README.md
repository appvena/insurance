# Kalkulator Asuransi Kendaraan — v1.1

Aplikasi web + PWA (bisa dipasang di Android, iPhone/iPad, dan PC) untuk menghitung premi asuransi kendaraan, membuat PDF penawaran, dan mengirimnya via WhatsApp. Data rate & kendaraan di Firebase Firestore, login admin dengan Firebase Authentication, hosting di GitHub Pages.

Copyright © SRISP 2026 · v1.1

## Struktur file
```
index.html          Tampilan (HTML)
css/style.css       Gaya tampilan web & HP
js/config.js        Konfigurasi Firebase & nomor versi
js/data.js          Rate bawaan, teks polis bawaan, daftar kendaraan bawaan
js/app.js           Logika aplikasi (perhitungan, PDF, WA, admin, riwayat)
manifest.json       Identitas aplikasi untuk dipasang (nama, ikon, warna)
sw.js               Service worker: offline & pembaruan versi
icons/              Ikon aplikasi (setir)
firestore.rules     Aturan keamanan Firestore (ditempel di Firebase Console)
```
Upload semua isi folder ke **root** repository GitHub dengan struktur yang sama. `firestore.rules` dan `README.md` boleh ikut di-upload, tidak berpengaruh ke aplikasi.

## Menu
| Menu | Siapa yang melihat |
|---|---|
| **Beranda** — informasi asuransi kendaraan | Pengunjung, jika Hitung Cepat dimatikan |
| **Hitung Cepat** — hitung tanpa nama tertanggung, tidak disimpan | Pengunjung (jika diaktifkan di Admin) dan semua yang login |
| **Penawaran** — formulir lengkap, PDF, kirim WA, simpan | Hanya setelah login |
| **Riwayat** — perhitungan yang disimpan | Hanya setelah login |
| **Masuk / Admin** | Semua |

Pengaturan di **Admin → Tampilan**: Hitung Cepat untuk pengunjung, menu Riwayat, simpan otomatis, pilihan perhitungan yang tampil (TLO, perluasan, TJH, PA), serta rincian rumus di halaman dan PDF.

## Perilaku aplikasi
- Menu terakhir dan semua isian tersimpan di perangkat. Refresh atau buka ulang tidak menghapus hitungan.
- Tombol kembali menampilkan dialog "Keluar dari aplikasi?". Menutup tab menampilkan konfirmasi bawaan browser.
- Pada aplikasi yang terpasang, tarik-ke-bawah untuk refresh dimatikan.
- Setelah dibuka sekali dengan internet, aplikasi bisa dibuka dan menghitung saat offline (memakai rate terakhir). Login dan sinkron riwayat butuh internet.

## Langkah pemasangan
### 1. Firebase Authentication
1. https://console.firebase.google.com → proyek **alex-insurance**.
2. **Authentication → Sign-in method** → aktifkan **Email/Password**.
3. **Users → Add user**: `alex@insurance.com` + password pilihan Anda. Salin **User UID**.
4. **Settings → User actions** → matikan **Enable create (sign-up)**.
5. **Settings → Authorized domains** → tambahkan `NAMA-USER-GITHUB.github.io`.

### 2. Firestore
1. **Firestore Database → Create database** (lokasi `asia-southeast2 (Jakarta)`, mode production).
2. Tab **Rules** → tempel `firestore.rules`, ganti `GANTI_DENGAN_UID_ADMIN` dengan UID, **Publish**.
3. Setelah UID terpasang, hapus baris pengecekan email di rules.

### 3. GitHub Pages
1. Upload semua file ke repository (mis. `kalkulator-asuransi`).
2. **Settings → Pages → Deploy from a branch → main / root → Save**.
3. Buka `https://NAMA-USER-GITHUB.github.io/kalkulator-asuransi/`.

### 4. Pertama kali
**Masuk** → login → periksa pengaturan → **Simpan Pengaturan**.

## Memasang aplikasi
- **Android / PC (Chrome, Edge)**: tombol **⤓ Pasang** di atas, atau menu browser → *Instal aplikasi*.
- **iPhone / iPad (Safari)**: **Bagikan → Tambah ke Layar Utama** (tombol ⤓ Pasang menampilkan panduan).

## Memperbarui aplikasi
Setiap mengubah file apa pun:
1. Naikkan `VERSION` di `sw.js` (mis. `ai-v1.1.0` → `ai-v1.1.1`).
2. Ubah `APP_VERSION` di `js/config.js` dan teks versi di footer `index.html` bila versinya berubah.
3. Upload. Pengguna akan melihat "Versi baru aplikasi tersedia — Muat ulang".

## Rumus perhitungan
- Harga Pertanggungan (HP) = harga kendaraan + perlengkapan
- Kasko = HP × rate kelompok harga (Comprehensive: ≤125 jt 3,82% · ≤200 jt 2,67% · ≤400 jt 2,18% · ≤800 jt 1,20% · >800 jt 1,05%), + loading usia bila aktif
- Perluasan = HP × rate (Banjir 0,075% · Gempa 0,12% · Huru-hara 0,05% · Terorisme 0,05% · Bengkel resmi 0,15%)
- TJH Pihak III = limit × 1% · PA = limit × 0,5%
- Periode bukan 1 tahun → pro-rata hari/365
- Total = premi − diskon (bila aktif) + biaya polis + materai

Semua angka bisa diubah di Admin.
