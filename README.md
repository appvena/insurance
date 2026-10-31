# Kalkulator Asuransi Kendaraan — v1.0 (PWA)

Aplikasi web untuk menghitung premi asuransi kendaraan, membuat PDF penawaran (Quotation Slip), dan mengirimnya via WhatsApp. Bisa dipasang seperti aplikasi biasa di **Android, iPhone/iPad, dan PC** (Progressive Web App) dan tetap bisa menghitung saat offline. Data rate & kendaraan disimpan di Firebase Firestore; login admin memakai Firebase Authentication. Hosting di GitHub Pages.

Copyright © SRISP 2026 · v1.0

## Isi
| File / folder | Fungsi |
|---|---|
| `index.html` | Seluruh aplikasi |
| `manifest.json` | Identitas aplikasi untuk dipasang (nama, ikon, warna) |
| `sw.js` | Service worker: cache offline & pembaruan |
| `icons/` | Ikon aplikasi (Android, iOS, PC, favicon) |
| `firestore.rules` | Aturan keamanan Firestore |

Upload **semua** file dan folder `icons` ke root repository, dengan struktur yang sama.

## Menu aplikasi
- **Hitung Cepat** — cukup isi harga, tahun, dan perluasan; total langsung muncul. Tidak perlu nama tertanggung dan tidak disimpan. Bisa *Salin hasil*, *Bagikan teks*, atau *Lanjut ke Penawaran* (angka ikut terbawa).
- **Penawaran** — formulir lengkap untuk tertanggung tertentu, buat PDF, kirim via WA, dan **Simpan** ke riwayat.
- **Riwayat** — daftar perhitungan yang disimpan: cari, buka kembali, buat ulang PDF (nomor referensi tetap sama), atau hapus.
- **Admin** — rate, biaya, teks polis, kendaraan, perusahaan, akun, dan **Tampilan**.

## Pengaturan Tampilan (Admin → Tampilan)
- Tampilkan/sembunyikan menu Hitung Cepat dan Riwayat.
- Simpan otomatis ke riwayat saat membuat PDF/kirim WA.
- Tampilkan/sembunyikan pilihan perhitungan di halaman: TLO, tiap perluasan, TJH, PA Pengemudi, PA Penumpang. Pilihan yang disembunyikan tidak ikut dihitung.
- Tampilkan/sembunyikan rincian rate & harga dasar di halaman, dan rumus perhitungan di PDF.

## Di mana riwayat disimpan?
- **Tanpa login**: di perangkat itu saja (penyimpanan browser/aplikasi).
- **Login admin**: juga disinkron ke Firestore (koleksi `quotes`), sehingga sama di HP dan PC. Riwayat lokal yang sudah ada ikut diunggah saat login.

## Langkah pemasangan

### 1. Firebase Authentication
1. Buka https://console.firebase.google.com → proyek **alex-insurance**.
2. **Build → Authentication → Get started → Sign-in method** → aktifkan **Email/Password**.
3. Tab **Users → Add user**: email `alex@insurance.com`, isi password pilihan Anda.
4. Salin **User UID** akun tersebut.
5. **Settings → User actions** → matikan **Enable create (sign-up)**.
6. **Settings → Authorized domains** → tambahkan `NAMA-USER-GITHUB.github.io`.

### 2. Firestore
1. **Build → Firestore Database → Create database** (lokasi `asia-southeast2 (Jakarta)`, mode production).
2. Tab **Rules** → tempel isi `firestore.rules`, ganti `GANTI_DENGAN_UID_ADMIN` dengan UID, lalu **Publish**.
3. Setelah UID terpasang, hapus baris pengecekan email di rules (lihat komentar di file).

### 3. GitHub Pages
1. Buat repository (mis. `kalkulator-asuransi`), upload semua file + folder `icons`.
2. **Settings → Pages → Deploy from a branch → main / root → Save**.
3. Aplikasi aktif di `https://NAMA-USER-GITHUB.github.io/kalkulator-asuransi/`. GitHub Pages memakai HTTPS, yang wajib untuk PWA.

### 4. Pertama kali
Buka **Admin** → login → periksa pengaturan → **Simpan Pengaturan**.

## Memasang aplikasi (PWA)
- **Android (Chrome)**: buka situsnya → tombol **⤓ Pasang** di atas, atau menu ⋮ → *Instal aplikasi*.
- **iPhone/iPad (Safari)**: tombol **Bagikan** → *Tambah ke Layar Utama*. Tombol **⤓ Pasang** di aplikasi menampilkan panduannya.
- **PC (Chrome/Edge)**: tombol **⤓ Pasang** atau ikon pasang di kolom alamat.

Setelah dibuka sekali dengan internet, aplikasi tetap bisa menghitung dan membuat PDF saat offline (memakai rate terakhir yang tersimpan). Login admin dan sinkron riwayat butuh internet.

## Memperbarui aplikasi
Setiap kali `index.html` diubah, **naikkan `VERSION` di `sw.js`** (mis. `ai-v1.0.0` → `ai-v1.0.1`). Pengguna akan melihat pesan *"Versi baru aplikasi tersedia — Muat ulang"*.

## Rumus perhitungan
- **Harga Pertanggungan (HP)** = harga kendaraan + perlengkapan tambahan
- **Kasko** = HP × rate sesuai kelompok harga (Comprehensive: ≤125 jt 3,82% · ≤200 jt 2,67% · ≤400 jt 2,18% · ≤800 jt 1,20% · >800 jt 1,05%)
  - Loading usia (opsional): + X% dari rate per tahun di atas batas usia
- **Perluasan** = HP × rate: Banjir 0,075% · Gempa 0,12% · Huru-hara 0,05% · Terorisme 0,05% · Bengkel resmi 0,15%
- **TJH Pihak III** = limit × 1% (limit 5/10/15/20/25 juta) · **PA** = limit × 0,5%
- Periode bukan 1 tahun → pro-rata hari/365 (Hitung Cepat selalu 1 tahun)
- **Total** = premi − diskon (jika diaktifkan) + biaya polis + materai

## Kirim via WhatsApp
- **HP**: menu bagikan terbuka → pilih WhatsApp → PDF langsung terlampir.
- **PC**: PDF terunduh dan WhatsApp Web terbuka; lampirkan PDF secara manual.

## Catatan keamanan
API key Firebase memang publik untuk aplikasi web; keamanan data dijamin oleh `firestore.rules`.
