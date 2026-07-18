# Power Grid Monitor — Redesign Cyber/Futuristik (React)

Redesign total tampilan dashboard monitoring energi dari HTML+vanilla JS
menjadi React (via CDN, tanpa build step) dengan tema cyber/futuristik.
**Semua fungsi asli tetap dipertahankan 100%** — hanya lapisan tampilan &
interaksi yang dirombak, backend (`server.py`) tidak diubah sama sekali.

## Cara menjalankan
1. Jalankan backend seperti biasa: `python server.py`
2. Buka `index.html` langsung di browser (tidak perlu build tool).

## Apa yang berubah

**Struktur file** — `main.js` digantikan oleh `app.jsx` (React) + `effects.js`
(logika non-React: background canvas animasi sirkuit) + `simulate.js`
(generator data mode demo). `style.css` ditulis ulang total dengan token
desain cyber.

**Tema visual** — palet violet–cyan–magenta di atas dasar hampir-hitam
bernuansa biru-ungu (bukan navy+cyan generik), font Orbitron (judul) +
Chakra Petch (body) + Share Tech Mono (data numerik), background canvas
animasi node & pulsa listrik yang saling terhubung (metafora arus mengalir
antar node — cocok untuk dashboard energi), efek glitch pada judul, overlay
scanline ala layar CRT, dan bingkai HUD di sudut setiap panel.

**Interaktivitas baru**:
- Kartu metrik dengan angka animasi count-up + flash glow tiap ada data baru
- Kartu "Daya" memakai gauge ring melingkar menunjukkan rasio terhadap batas maksimum
- Kontrol aktuator diubah dari tombol ON/OFF terpisah menjadi toggle switch
  gaya sci-fi dengan update optimistic + revert otomatis bila API gagal
- Sistem notifikasi toast untuk setiap aksi (sukses/gagal)
- Radar ping pada indikator status koneksi

## Halaman Login (baru)

Sebelumnya endpoint `/api/auth/login` sudah ada di `server.py` tapi tidak
pernah dipanggil dari frontend mana pun. Sekarang dashboard diberi gerbang
autentikasi: saat pertama dibuka, pengguna diminta login (username/password
dikirim ke `/api/auth/login`). Kredensial default sesuai `server.py` adalah
**kelompok2 / kelompok2**. Sesi login disimpan di `localStorage` sehingga
tidak perlu login ulang setiap refresh; ada tombol logout di header.

## Mode Demo (baru)

Karena sistem asli butuh Flask + MySQL + broker MQTT HiveMQ yang belum tentu
sedang aktif, halaman login menyediakan tombol **"Coba Mode Demo (Tanpa
Backend)"**. Saat dipilih:
- Tidak ada satu pun request ke `server.py` — seluruh data dihasilkan oleh
  `simulate.js`, sebuah simulator ringan yang menghasilkan nilai suhu,
  tegangan, arus, daya, energi kumulatif, dan estimasi biaya yang berfluktuasi
  secara realistis (gelombang sinus + noise acak).
- Toggle relay lampu & buzzer tetap berfungsi dan **memengaruhi simulasi**:
  menyalakan relay lampu benar-benar menaikkan beban daya yang disimulasikan,
  supaya demo terasa hidup dan konsisten secara logika, bukan sekadar angka acak.
- Panel konfigurasi batas daya tetap bisa disimpan (disimulasikan).
- Riwayat tetap disimpan ke IndexedDB terpisah (`PowerDB_Demo`) supaya tidak
  bercampur dengan cache data asli.
- Badge kuning "Mode Demo · Data Simulasi" selalu tampil di header supaya
  tidak tertukar dengan data sungguhan.

Cocok dipakai untuk keperluan presentasi/demo ke dosen atau klien tanpa perlu
menyiapkan seluruh infrastruktur IoT terlebih dahulu.

**Bug yang diperbaiki dari versi lama**:
- Tabel riwayat (`#log-body`) sebelumnya tidak punya elemen tujuan di HTML
  sehingga data di IndexedDB tidak pernah tampil — sekarang benar-benar
  tersambung dan me-render otomatis lewat state React.
- Field `biaya` yang sudah dihitung & dikirim backend (`monitoring_data.biaya`)
  sebelumnya tidak pernah dipakai frontend — sekarang ditampilkan sebagai
  kartu "Estimasi Biaya" berformat Rupiah.
- Endpoint `/api/device/config` (batas daya maksimum) sebelumnya tidak
  punya UI sama sekali — sekarang ada panel "Konfigurasi Batas Daya" yang
  langsung memengaruhi skala gauge pada kartu Daya.

## Catatan
- Status ON/OFF toggle relay & buzzer bersifat *optimistic* di sisi frontend
  (backend hanya mem-publish perintah satu arah via MQTT, tidak ada readback
  status fisik aktual). Jika diperlukan status yang benar-benar akurat,
  tambahkan topic MQTT terpisah untuk ESP32 melaporkan balik status relay.
- `CORS(app)` di backend masih terbuka penuh dan kredensial MQTT/MySQL masih
  hardcoded di `server.py` — di luar cakupan perubahan desain ini, tapi
  layak dirapikan sebelum dipakai di luar lingkungan development.
