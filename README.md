# Vehicle Protection — v1.2

Copyright © SRISP 2026 · v1.2

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
Setiap ada file yang diubah, naikkan `VERSION` di `sw.js` (mis. `ai-v1.2.0` → `ai-v1.2.1`) supaya aplikasi yang sudah terpasang mendapat versi baru.

## Catatan
- Tulisan teknis sudah tidak tampil di halaman. Kode sumber (View Source) tetap bisa dibaca siapa pun, seperti semua situs web; keamanan data dijaga oleh Firestore Rules.
- Tanya Admin dibatasi: isian divalidasi di Rules, satu kiriman per menit per perangkat, dan ada jebakan anti-bot. Untuk perlindungan spam yang lebih kuat, aktifkan Firebase App Check.
