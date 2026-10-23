# SlashPDF 📑⚡

> **Free, full-featured, and privacy-first PDF editor running 100% client-side in your browser.**

[![Cloudflare Workers](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Built with Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Privacy: 100% Client-Side](https://img.shields.io/badge/Privacy-100%25%20Client--Side-10B981)](#-privacy--client-side-architecture)

---

## 🔒 Privacy & Client-Side Architecture

SlashPDF was built around one non-negotiable principle: **Your documents belong to you and stay on your device.**

- **Zero Server Uploads:** All document reading, parsing, rendering, text editing, merging, splitting, compressing, and encryption take place directly in your browser using JavaScript and WebAssembly powered by [pdf-lib](https://pdf-lib.js.org/) and [pdf.js](https://mozilla.github.io/pdf.js/).
- **No Backend Server:** There is no remote API or backend server that ever receives, processes, or caches your PDF files.
- **Offline Capable:** Once the application assets are loaded in your browser, you can disconnect from the internet and continue using all features without interruption.
- **No Tracking or Telemetry:** No invasive analytics or tracking pixels monitoring your files or workflow.

> **⚠️ Current Limitation:** The app currently loads fonts (Inter, Material Symbols) from Google Fonts and PDF character maps from jsdelivr CDN. This means your IP address is visible to those third parties on first load. A future update will bundle all assets locally to eliminate these external requests entirely. See [PATCH_ROADMAP.md](PATCH_ROADMAP.md) Patch 2.1 for progress.

---

## ☕ Project Status & Maintainer Note

> This project is developed and maintained independently as a **solo hobby project in my spare time**.  
> Because of this, responses to issues, discussions, and pull requests may be slower than usual (*slow response time*).  
> Thank you very much for your patience, understanding, and support! Constructive feedback, bug reports, and pull requests are always welcome.

---

## ✨ Features

SlashPDF provides a comprehensive set of features comparable to desktop PDF suites:

### 1. 📂 Document Management & Navigation
- **Multi-Document Tabs:** Open and switch between multiple PDF files seamlessly.
- **Create Blank PDF:** Generate fresh blank PDF pages on demand.
- **Quick Save & Save As:** Save edits directly or download a new version.
- **Print Support:** Print documents directly with browser print preview.
- **Interactive Navigation Sidebar:**
  - Page thumbnail previews for rapid navigation.
  - Interactive Bookmarks / Document Outline tree.
  - Comments and annotations inspector panel.
- **View Modes:** Continuous scroll, Single page view, and Two-page spread.
- **Zoom Controls:** Zoom In, Zoom Out, Fit Width, and Fit Page.
- **Undo / Redo:** Full document history snapshot stack.
- **Dark & Light Mode:** Polished, theme-aware modern interface.

### 2. 📄 Page Organization & Manipulation
- **Insert Blank Page:** Add a blank page at any position in the document.
- **Insert From File:** Import pages from another PDF file into the current document.
- **Duplicate Page:** Clone the active page with one click.
- **Extract Pages:** Extract specific page ranges into a separate, new PDF file.
- **Rotate Pages:** Rotate 90° Clockwise (CW), 90° Counter-Clockwise (CCW), or apply custom rotations to a page range.
- **Delete Pages:** Remove the active page or batch-delete a custom page range.
- **Reorder Pages:** Drag and rearrange page sequences.
- **Crop Pages:** Adjust and crop page boundaries.
- **Split PDF:** Divide a large document into multiple individual files.

### 3. ✏️ Direct Content & Text Editing
- **Direct Text Edit Mode:**
  - Detect and select existing text blocks rendered on the PDF.
  - Move text blocks (*drag & drop*).
  - Edit text content inline.
  - Customize font family, font size, text color, and alignment.
  - Add new text blocks anywhere on the page.
- **Add Text:** Place custom text labels and paragraphs onto any page.
- **Insert Images:** Embed PNG, JPG, WebP, GIF, or BMP images onto pages.
- **Add Links:** Insert clickable hyperlinks (external web URLs or internal page jumps).
- **Find Text (`Ctrl+F`):** Document-wide search with keyword highlights and match jumping.

### 4. 🎨 Annotations & Review Markup
- **Text Markup Tools:** Highlight, Underline, and Strikethrough text.
- **Sticky Notes & Comments:** Pin contextual notes anywhere on a page.
- **Freehand Drawing / Ink:** Draw and sketch freely with pen tools.
- **Geometric Shapes:** Lines, Arrows, Rectangles, and Ellipses.
- **Measurement Tool:** Measure distances and dimensions directly on the document.
- **Stamps:** Standard rubber stamps (*Approved*, *Confidential*, *Draft*, etc.).
- **Eraser Tool:** Remove specific strokes and annotations or clear all in one click.
- **Styling Controls:** Full control over color palette, stroke width, and opacity.

### 5. 📋 Interactive Forms
- **Fill Form Fields:** Interact with and fill standard PDF form fields directly in the browser.
- **Reset Form:** Revert all form fields back to their default values.
- **Flatten Form:** Permanently bake form inputs into page contents to prevent further alteration.
- **Form Builder (Create New Fields):**
  - Text Fields
  - Checkboxes
  - Radio Button Groups
  - Dropdown Lists
  - Signature Fields
- **Export & Import Data:** Export filled form data to JSON and import it back anytime.

### 6. 🛡️ Security, Signatures & Redaction
- **Password & Permissions:** Protect documents with user passwords and restrict printing/copying permissions.
- **Digital / Drawn Signature:** Draw signatures with mouse or touchscreen and apply them onto pages.
- **True Redaction (Rasterization-Based):** Mark sensitive text or regions with the Redact tool, then click **Apply Redact** to permanently destroy the underlying content. Affected pages are rasterized (rendered to a high-resolution image), so all vector text streams, fonts, OCR layers, and objects beneath the blackout boxes are irreversibly destroyed and cannot be extracted, searched, or copied by any PDF viewer. Pages without redactions remain in their original crisp vector format.
- **Sanitize Metadata:** Strip standard metadata fields (Title, Author, Subject, Keywords, Creator) to protect privacy before sharing. *(Note: XMP metadata streams and date fields may still be present — see [PATCH_ROADMAP.md](PATCH_ROADMAP.md) Patch 1.3 for planned deep sanitization.)*

### 7. ⚡ Conversion & Quick Utilities
- **Merge PDFs:** Combine multiple PDF documents and images into a single file.
- **Images to PDF:** Convert collections of images into a cleanly formatted PDF document.
- **PDF to Images:** Export PDF pages as high-resolution PNG images bundled in a ZIP archive.
- **PDF to Text:** Extract all plain text from the document into a `.txt` file.
- **PDF Compression:**
  - Presets: *Light*, *Balanced*, *Strong*, or a custom *Target Size (KB)*.
  - Recompresses embedded images and supports page rasterization.
- **Watermark:** Add diagonal or horizontal watermarks with customizable opacity and text.
- **Page Numbers & Bates Numbering:** Add automated page numbering or legal Bates stamps.
- **Header & Footer:** Insert customized headers and footers across page ranges.

---

## 🚀 Cloudflare Workers (Static Assets) Deployment Guide

SlashPDF is a static Single-Page Application (SPA) with zero backend requirements, deployed as a **Cloudflare Worker with Static Assets**.

The repository includes pre-configured Cloudflare deployment files:
- `public/_headers`: Security headers (`X-Frame-Options`, `X-Content-Type-Options`) and caching rules (`/assets/*`).
- `wrangler.toml`: Cloudflare Workers Static Assets configuration (`[assets]` with `directory = "./dist"` and `not_found_handling = "single-page-application"`).
- `.node-version`: Sets the build environment to Node 20+.

### Method 1: Direct Deploy via Wrangler CLI
```bash
# 1. Build the production bundle
npm run build

# 2. Deploy to Cloudflare Workers
npm run deploy
# This runs: wrangler deploy
```

### Method 2: Git Integration (CI/CD)
1. Push your repository to **GitHub** or **GitLab**.
2. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Import a repository**.
3. Select your SlashPDF repository and use the following build configuration:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Click **Save and Deploy**. Cloudflare will automatically build and distribute your app worldwide via its global CDN on every push!

---

## 💻 Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or v20+
- npm (bundled with Node.js)

### Getting Started
```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Open the displayed local URL in your browser (usually http://localhost:5173)

# 4. Build for production
npm run build

# 5. Preview production build locally
npm run preview
```

---

## 🛠️ Tech Stack

- **Build Tool:** [Vite](https://vitejs.dev/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **PDF Manipulation Engine:** [pdf-lib](https://pdf-lib.js.org/)
- **PDF Rendering & Parsing Engine:** [pdfjs-dist](https://mozilla.github.io/pdf.js/) (with isolated Web Worker)
- **Archive Utilities:** [JSZip](https://stuk.github.io/jszip/)
- **UI & Icons:** Modern CSS with responsive design & Google Material Symbols

---

## 📄 License

This project is open-source. Feel free to use, explore, and build upon it while respecting user privacy.
