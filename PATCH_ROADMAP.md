# SlashPdf - Patch Roadmap & Audit Catatan Perbaikan

Dokumen ini berisi daftar temuan teknis, analisis risiko, serta daftar rencana patch yang disusun berdasarkan prioritas urgensi keamanan dan integritas privasi. Dokumen ini dapat diakses dan diperbarui pada setiap sesi pengembangan.

---

## 1. Ringkasan Status & Evaluasi Awal

- **Kondisi Build:** `npm ci && npm run build` berhasil tanpa error.
- **Fondasi:** Sehat (TypeScript + Vite + pdf-lib + pdfjs-dist).
- **Fokus Perbaikan:** Redaksi aman (true redaction), eliminasi koneksi pihak ketiga (zero external network calls), mode offline sejati, konsistensi deployment, dan refactoring kode monolitik.

---

## 2. Matriks Prioritas Patch

| Tier | Prioritas | Area / Fitur | Masalah Utama | Risiko |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Kritis (P0)** | True Redaction | Kotak hitam hanya visual overlay; teks asli di PDF stream tetap ada dan bisa disalin. | Kebocoran data sensitif |
| **Tier 1** | **Kritis (P0)** | Deep Metadata Sanitizer | XMP metadata stream & tanggal modifikasi masih tersimpan di Catalog. | Kebocoran riwayat dokumen |
| **Tier 2** | **Tinggi (P1)** | Resource Pihak Ketiga | Google Fonts, Material Icons, & cMaps jsdelivr memuat via eksternal CDN. | Kebocoran IP pengguna |
| **Tier 2** | **Tinggi (P1)** | Service Worker / PWA | Tanpa SW, halaman gagal dibuka saat offline setelah reload. | Gagal memenuhi klaim offline |
| **Tier 2** | **Tinggi (P1)** | Content Security Policy | Header `_headers` belum memiliki CSP ketat. | Risiko injection / data exfiltration |
| **Tier 3** | **Sedang (P2)** | Deployment Cloudflare | `wrangler.toml` (Workers Assets) tidak sinkron dengan `package.json` (Pages). | Kebingungan proses rilis/CI |
| **Tier 3** | **Sedang (P2)** | URL Loader (`?file=`) | `fetch()` langsung memuat URL tanpa dialog konfirmasi privasi. | Kebocoran IP ke pihak ketiga |
| **Tier 4** | **Rendah (P3)** | Audit `innerHTML` | Beberapa pesan error menyisipkan `err.message` via `innerHTML`. | Kerentanan XSS (low risk) |
| **Tier 4** | **Rendah (P3)** | Pembersihan Asset Template | Sisa file Vite template dan duplikat file di root. | Kebersihan repositori |
| **Tier 4** | **Rendah (P3)** | Modularisasi Kode | `main.ts` dan `uiDialogs.ts` terlalu besar (>3.5k baris per file). | Sulit dirawat (maintenance) |

---

## 3. Rencana Aksi Detail per Patch

### Tier 1: Kritis (P0) — Keamanan Data & Privasi Inti

#### Patch 1.1: Implementasi True Redaction (Rasterisasi Halaman Ter-redaksi)
- **Konteks:** Fungsi `applyRedaction` di `src/pdfEditor.ts` saat ini hanya menggambar kotak persegi hitam di atas halaman (overlay) dan bahkan belum dipanggil dari alur simpan/ekspor. Teks asli di PDF stream masih utuh dan bisa disalin atau dicari.
- **Langkah Solusi:**
  1. Integrasikan alur redaksi saat dokumen diekspor/disimpan.
  2. Untuk setiap halaman yang memiliki anotasi redaksi:
     - Render halaman tersebut menggunakan `pdfjs-dist` ke dalam `HTMLCanvasElement` dengan resolusi tinggi (scale 2.0x–3.0x).
     - Gambar kotak hitam solid (`ctx.fillRect`) langsung di atas canvas (menghancurkan informasi piksel dan teks asli).
     - Ekspor canvas sebagai image buffer (PNG atau JPEG kualitas tinggi).
     - Di `pdf-lib`, ganti halaman target dengan halaman baru berisi gambar yang telah dirasterisasi (`pdfDoc.embedPng` / `page.drawImage`).
  3. Halaman yang tidak memiliki redaksi tetap dipertahankan dalam bentuk vektor asli agar ukuran file tetap efisien.
- **File:** `src/pdfEditor.ts`, `src/annotationManager.ts`, `src/main.ts`.

#### Patch 1.2: Pemutakhiran Klaim Dokumentasi & Dialog Konfirmasi
- **Konteks:** `README.md` mengklaim teks "completely removed from the underlying PDF stream".
- **Langkah Solusi:**
  1. Perbarui `README.md` agar transparan mengenai metode redaksi (menyebutkan bahwa halaman yang diredaksi dirasterisasi untuk memusnahkan stream teks/objek di bawahnya).
  2. Tambahkan informasi jelas pada modal konfirmasi saat pengguna menerapkan redaksi.
- **File:** `README.md`, `src/uiDialogs.ts`.

#### Patch 1.3: Deep Sanitize Metadata (Pembersihan Stream XMP & Tanggal)
- **Konteks:** Fungsi sanitasi saat ini hanya mengosongkan dictionary standar (`Title`, `Author`, `Subject`, `Keywords`, `Creator`). Stream XMP dan tanggal pembuatan/modifikasi masih tertinggal.
- **Langkah Solusi:**
  1. Hapus metadata stream XMP dari catalog PDF:
     ```ts
     pdfDoc.catalog.delete(PDFName.of('Metadata'));
     ```
  2. Kosongkan nilai tanggal pada info dictionary (`CreationDate`, `ModDate`).
- **File:** `src/pdfEditor.ts`.

---

### Tier 2: Tinggi (P1) — Menepati Janji 100% Offline & Zero Third-Party

#### Patch 2.1: Lokalisasi Font, Ikon, dan cMaps pdf.js
- **Konteks:** `index.html` mengambil Google Fonts (Inter) dan Material Symbols dari Google Fonts CDN. PDF.js cMaps mengambil dari `cdn.jsdelivr.net`. Ini membocorkan IP pengguna dan melanggar klaim "no third parties".
- **Langkah Solusi:**
  1. **Font & Ikon:**
     - Gunakan paket `@fontsource/inter` atau simpan berkas font WOFF2 lokal di `public/fonts/`.
     - Gunakan simbol lokal (SVG sprite `public/icons.svg` atau font simbol lokal).
     - Hapus tag `<link rel="stylesheet">` ke `fonts.googleapis.com` dari `index.html`.
  2. **cMaps PDF.js:**
     - Salin folder `cmaps/` dari `node_modules/pdfjs-dist/cmaps/` ke `public/cmaps/`.
     - Konfigurasikan opsi `cMapUrl: '/cmaps/'` dan `cMapPacked: true` pada inisialisasi `pdfjs-dist`.
- **File:** `index.html`, `package.json`, `src/pdfViewerManager.ts`, `public/`.

#### Patch 2.2: Service Worker / Offline Caching
- **Konteks:** Tanpa service worker, memuat ulang (refresh) halaman saat komputer offline akan menyebabkan error browser / halaman kosong.
- **Langkah Solusi:**
  1. Tambahkan `vite-plugin-pwa` atau service worker kustom ringan di `public/sw.js`.
  2. Konfigurasikan cache-first untuk app shell (HTML, CSS, JS, Fonts, cMaps, Icons, Worker).
  3. Daftarkan service worker pada `src/main.ts`.
- **File:** `vite.config.ts`, `package.json`, `src/main.ts`, `public/sw.js`.

#### Patch 2.3: Penerapan Content Security Policy (CSP) Ketat
- **Konteks:** Header keamanan di `public/_headers` belum memiliki CSP.
- **Langkah Solusi:**
  1. Tambahkan aturan CSP ketat di `public/_headers`:
     ```http
     Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; object-src 'self' blob:; connect-src 'self' blob:; font-src 'self';
     ```
- **File:** `public/_headers`.

---

### Tier 3: Sedang (P2) — Konsistensi Rilis & Proteksi Input URL

#### Patch 3.1: Penyelarasan Konfigurasi Deployment Cloudflare
- **Konteks:** `wrangler.toml` dikonfigurasi untuk Cloudflare Workers Static Assets (`[assets]`), sedangkan `package.json` menggunakan script `wrangler pages deploy dist`, dan `README.md` membahas Cloudflare Pages.
- **Langkah Solusi:**
  1. Standarisasi ke Cloudflare Workers Static Assets:
     - Ubah script di `package.json`: `"deploy": "wrangler deploy"`.
     - Perbarui dokumentasi deployment di `README.md`.
- **File:** `package.json`, `wrangler.toml`, `README.md`.

#### Patch 3.2: Konfirmasi Privasi untuk Parameter `?file=`
- **Konteks:** Query parameter `?file=https://...` langsung memicu `fetch()`, berpotensi membocorkan IP pengguna ke server luar tanpa disadari.
- **Langkah Solusi:**
  1. Tampilkan dialog persetujuan sebelum `fetch()` dijalankan: menginformasikan pengguna bahwa memuat dokumen dari URL eksternal akan mengekspos alamat IP mereka ke server tujuan.
- **File:** `src/main.ts`.

---

### Tier 4: Kerapian & Pemeliharaan Kode (P3)

#### Patch 4.1: Sanitasi Penggunaan `innerHTML`
- **Konteks:** Penggunaan `innerHTML` dengan variabel dinamis (seperti pesan error `err.message`) berpotensi celah XSS jika string memuat karakter HTML.
- **Langkah Solusi:**
  1. Ganti pemakaian yang menyisipkan teks dinamis ke `element.textContent`.
- **File:** `src/main.ts`, `src/uiDialogs.ts`.

#### Patch 4.2: Pembersihan Sisa Template & Duplikat File
- **Langkah Solusi:**
  1. Hapus `src/counter.ts`.
  2. Hapus asset bawaan template di `src/assets/` (`typescript.svg`, `vite.svg`, `hero.png` jika tidak digunakan).
  3. Hapus duplikat `sample_document.pdf` di root project (gunakan yang ada di `public/sample_document.pdf`).
  4. Hapus `@types/jszip` dari `devDependencies` di `package.json`.
- **File:** Root directory, `src/`, `src/assets/`, `package.json`.

#### Patch 4.3: Modularisasi File Monolitik
- **Konteks:** `src/main.ts` (~4.800 baris) dan `src/uiDialogs.ts` (~3.800 baris) terlalu besar.
- **Langkah Solusi:**
  1. Pecah modul menjadi folder fitur (`src/features/`):
     - `src/features/redaction/`
     - `src/features/watermark/`
     - `src/features/metadata/`
     - `src/features/security/` (encrypt/decrypt)
     - `src/features/organize/` (merge/split/rotate)
- **File:** `src/`.

---

## 4. Log Progres Implementasi

| Tanggal | ID Patch | Status | Catatan / Commit |
| :--- | :--- | :--- | :--- |
| 2026-10-21 | - | Disusun | Roadmap awal didokumentasikan |
| 2026-10-21 | Patch 1.1 | ✅ Selesai | True redaction via rasterisasi halaman; tool 'redact' + tombol "Apply Redact" |
| 2026-10-21 | Patch 1.2 | ✅ Selesai | README: redaksi, privasi, metadata, deploy diperbarui; badge & deploy script diperbaiki |
| 2026-10-21 | Patch 1.3 | ✅ Selesai | Deep metadata sanitizer: hapus stream XMP, hapus PieceInfo, hapus thumbnail, serta eliminasi tanggal pembuatan/modifikasi (CreationDate/ModDate) |
| 2026-10-21 | Patch 2.1 | ✅ Selesai | Lokalisasi mandiri font Inter, ikon Material Symbols, pdfjs cMaps & standard_fonts (0 koneksi pihak ketiga) |
| | Patch 2.2 | Menunggu | Service Worker offline |
| | Patch 2.3 | Menunggu | CSP headers |
| 2026-10-21 | Patch 3.1 | ✅ Selesai | Diselesaikan bersama Patch 1.2: badge, README deploy section, package.json script |
| | Patch 3.2 | Menunggu | Konfirmasi URL loader |
| | Patch 4.1 | Menunggu | Audit innerHTML |
| | Patch 4.2 | Menunggu | Cleanup file sampah |
| | Patch 4.3 | Menunggu | Modularisasi monolith |
