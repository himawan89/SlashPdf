import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PDFBookmark, SearchResult } from './types';

// Configure pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export class PDFViewerManager {
  /**
   * Load a PDF document from bytes
   */
  static async loadDocument(bytes: Uint8Array): Promise<any> {
    // Clone bytes before passing to PDF.js worker so the original ArrayBuffer is not detached
    const bytesClone = bytes.slice(0);
    const loadingTask = pdfjsLib.getDocument({
      data: bytesClone,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + pdfjsLib.version + '/cmaps/',
      cMapPacked: true,
    });
    return await loadingTask.promise;
  }

  /**
   * Render a single page onto an HTML5 Canvas
   */
  static async renderPage(
    pdfDoc: any,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale = 1.0,
    rotation = 0
  ): Promise<{ width: number; height: number; viewport: any; page: any }> {
    const page = await pdfDoc.getPage(pageNumber);
    const pixelRatio = window.devicePixelRatio || 1;
    // Combine page's intrinsic rotation in the PDF with viewer rotation
    const effectiveRotation = ((page.rotate || 0) + (rotation || 0)) % 360;
    const viewport = page.getViewport({ scale, rotation: effectiveRotation });

    const cssWidth = Math.floor(viewport.width);
    const cssHeight = Math.floor(viewport.height);

    // Canvas internal buffer dimensions scaled by pixelRatio for maximum sharpness
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);

    // Canvas visual dimensions strictly match CSS pixels
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pass transform for PDF.js to scale drawing and clipping together cleanly
    const transform = pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null;

    const renderContext: any = {
      canvasContext: ctx,
      viewport: viewport,
    };
    if (transform) {
      renderContext.transform = transform;
    }

    await page.render(renderContext).promise;

    return { width: cssWidth, height: cssHeight, viewport, page };
  }

  /**
   * Render text layer onto an HTML container for text selection and copying
   */
  static async renderTextLayer(
    page: any,
    viewport: any,
    container: HTMLElement
  ): Promise<any> {
    try {
      const textContent = await page.getTextContent();
      container.innerHTML = '';

      const TextLayerClass = (pdfjsLib as any).TextLayer;
      if (TextLayerClass) {
        const textLayer = new TextLayerClass({
          textContentSource: textContent,
          container,
          viewport,
        });
        await textLayer.render();
        return textLayer;
      }
    } catch (err) {
      console.warn('Failed to render text layer for page:', err);
    }
  }

  /**
   * Render interactive link annotations (external URLs and internal page jumps)
   */
  static async renderAnnotationLinks(
    page: any,
    viewport: any,
    container: HTMLElement,
    pdfDocProxy: any,
    onNavigate: (targetPageNum: number) => void
  ): Promise<HTMLElement | null> {
    try {
      const annotations = await page.getAnnotations();
      const linkAnnots = annotations.filter((a: any) => a.subtype === 'Link');
      if (linkAnnots.length === 0) return null;

      let linkLayer = container.querySelector('.annotation-link-layer') as HTMLElement | null;
      if (!linkLayer) {
        linkLayer = document.createElement('div');
        linkLayer.className = 'annotation-link-layer';
        container.appendChild(linkLayer);
      }
      linkLayer.innerHTML = '';

      for (const a of linkAnnots) {
        if (!a.rect || a.rect.length < 4) continue;

        // Convert PDF rect [x1,y1,x2,y2] to viewport coordinates robustly
        let left: number, top: number, width: number, height: number;
        if (typeof viewport.convertToViewportRectangle === 'function') {
          const rect = viewport.convertToViewportRectangle(a.rect);
          left = Math.min(rect[0], rect[2]);
          top = Math.min(rect[1], rect[3]);
          width = Math.max(8, Math.abs(rect[2] - rect[0]));
          height = Math.max(8, Math.abs(rect[3] - rect[1]));
        } else if (typeof viewport.convertToViewportPoint === 'function') {
          const p1 = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
          const p2 = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
          left = Math.min(p1[0], p2[0]);
          top = Math.min(p1[1], p2[1]);
          width = Math.max(8, Math.abs(p2[0] - p1[0]));
          height = Math.max(8, Math.abs(p2[1] - p1[1]));
        } else {
          // Manual fallback using viewport transform matrix
          const tx = viewport.transform;
          if (tx) {
            const x1 = tx[0] * a.rect[0] + tx[2] * a.rect[1] + tx[4];
            const y1 = tx[1] * a.rect[0] + tx[3] * a.rect[1] + tx[5];
            const x2 = tx[0] * a.rect[2] + tx[2] * a.rect[3] + tx[4];
            const y2 = tx[1] * a.rect[2] + tx[3] * a.rect[3] + tx[5];
            left = Math.min(x1, x2);
            top = Math.min(y1, y2);
            width = Math.max(8, Math.abs(x2 - x1));
            height = Math.max(8, Math.abs(y2 - y1));
          } else {
            // Last resort: use raw scale
            const s = viewport.scale || 1;
            const ph = viewport.height || 0;
            left = a.rect[0] * s;
            top = ph - a.rect[3] * s;
            width = Math.max(8, (a.rect[2] - a.rect[0]) * s);
            height = Math.max(8, (a.rect[3] - a.rect[1]) * s);
          }
        }

        const linkEl = document.createElement('a');
        linkEl.className = 'pdf-interactive-link';
        linkEl.style.left = `${left}px`;
        linkEl.style.top = `${top}px`;
        linkEl.style.width = `${width}px`;
        linkEl.style.height = `${height}px`;

        // Prevent container panning / text selection from intercepting link interaction
        linkEl.addEventListener('mousedown', (e) => e.stopPropagation());
        linkEl.addEventListener('pointerdown', (e) => e.stopPropagation());

        const rawUrl = a.url || a.unsafeUrl;
        if (rawUrl) {
          const href = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('mailto:')
            ? rawUrl
            : `https://${rawUrl}`;
          linkEl.href = href;
          linkEl.target = '_blank';
          linkEl.rel = 'noopener noreferrer';
          linkEl.title = `Buka tautan: ${rawUrl}`;
          linkEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(href, '_blank', 'noopener,noreferrer');
          });
        } else {
          // Resolve page jump destination from multiple possible sources
          let targetPageIndex: number | null = null;

          // Helper to resolve a destination array to page index
          const resolveDestArray = async (destArr: any[]): Promise<number | null> => {
            if (!destArr || destArr.length === 0) return null;
            const first = destArr[0];
            if (typeof first === 'number') return first;
            if (first && typeof first === 'object') {
              try {
                return await pdfDocProxy.getPageIndex(first);
              } catch {
                // Brute-force: compare ref num/gen if available
                if (first.num !== undefined || first.gen !== undefined) {
                  const numPages = pdfDocProxy.numPages;
                  for (let pi = 0; pi < numPages; pi++) {
                    try {
                      const pg = await pdfDocProxy.getPage(pi + 1);
                      if (pg.ref && pg.ref.num === first.num && pg.ref.gen === first.gen) {
                        return pi;
                      }
                    } catch { /* skip */ }
                  }
                }
                return null;
              }
            }
            return null;
          };

          // Try a.dest (standard Dest field)
          if (a.dest) {
            try {
              let destVal = a.dest;
              if (typeof destVal === 'string') {
                destVal = await pdfDocProxy.getDestination(destVal);
              }
              if (Array.isArray(destVal)) {
                targetPageIndex = await resolveDestArray(destVal);
              }
            } catch { /* fallback below */ }
          }

          // Try GoTo action destination (pdf-lib generates A: { S: 'GoTo', D: [...] })
          if (targetPageIndex === null && a.action === 'GoTo' && a.dest) {
            try {
              let destVal = a.dest;
              if (typeof destVal === 'string') {
                destVal = await pdfDocProxy.getDestination(destVal);
              }
              if (Array.isArray(destVal)) {
                targetPageIndex = await resolveDestArray(destVal);
              }
            } catch { /* fallback below */ }
          }

          // Try raw annotation data for GoTo actions parsed differently by pdf.js
          if (targetPageIndex === null && a.newWindow === false && a.dest) {
            try {
              if (Array.isArray(a.dest)) {
                targetPageIndex = await resolveDestArray(a.dest);
              }
            } catch { /* ignore */ }
          }

          if (targetPageIndex !== null && !isNaN(targetPageIndex) && targetPageIndex >= 0) {
            const pageNum = targetPageIndex + 1;
            linkEl.title = `Go to Page ${pageNum}`;
            linkEl.href = `#page=${pageNum}`;
            linkEl.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate(pageNum);
            });
          } else if (a.action === 'NextPage') {
            linkEl.title = 'Next Page';
            linkEl.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate(page.pageNumber + 1);
            });
          } else if (a.action === 'PrevPage') {
            linkEl.title = 'Previous Page';
            linkEl.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate(Math.max(1, page.pageNumber - 1));
            });
          }
        }

        linkLayer.appendChild(linkEl);
      }
      return linkLayer;
    } catch (err) {
      console.warn('Failed to render annotation links:', err);
      return null;
    }
  }

  /**
   * Render thumbnail for a page
   */
  static async renderThumbnail(
    pdfDoc: any,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    maxWidth = 160
  ): Promise<void> {
    const page = await pdfDoc.getPage(pageNumber);
    const effectiveRotation = (page.rotate || 0) % 360;
    const unscaledViewport = page.getViewport({ scale: 1.0, rotation: effectiveRotation });
    const scale = maxWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale, rotation: effectiveRotation });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;
  }

  /**
   * Extract outline/bookmarks from document
   */
  static async extractBookmarks(pdfDoc: any): Promise<PDFBookmark[]> {
    try {
      const outline = await pdfDoc.getOutline();
      if (!outline || outline.length === 0) return [];

      const parseItems = async (items: any[]): Promise<PDFBookmark[]> => {
        const result: PDFBookmark[] = [];
        for (const item of items) {
          let pageIndex = 0;
          if (item.dest) {
            try {
              let explicitDest = item.dest;
              if (typeof explicitDest === 'string') {
                explicitDest = await pdfDoc.getDestination(item.dest);
              }
              if (Array.isArray(explicitDest)) {
                const ref = explicitDest[0];
                pageIndex = await pdfDoc.getPageIndex(ref);
              }
            } catch {
              pageIndex = 0;
            }
          }

          const b: PDFBookmark = {
            id: 'bm_' + Math.random().toString(36).substring(2, 9),
            title: item.title,
            pageIndex,
          };
          if (item.items && item.items.length) {
            b.children = await parseItems(item.items);
          }
          result.push(b);
        }
        return result;
      };

      return await parseItems(outline);
    } catch {
      return [];
    }
  }

  /**
   * Check if document has interactive form fields
   */
  static async detectForms(pdfDoc: any): Promise<boolean> {
    try {
      for (let i = 1; i <= Math.min(pdfDoc.numPages, 10); i++) {
        const page = await pdfDoc.getPage(i);
        const annotations = await page.getAnnotations();
        const hasWidget = annotations.some((a: any) => a.subtype === 'Widget');
        if (hasWidget) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Extract all plain text from document
   */
  static async extractAllText(pdfDoc: any): Promise<string> {
    const textParts: string[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str || '');
      textParts.push(`--- Page ${i} ---\n` + strings.join(' '));
    }
    return textParts.join('\n\n');
  }

  /**
   * Extract HTML representation of PDF
   */
  static async extractHtml(pdfDoc: any): Promise<string> {
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Converted PDF Document</title><style>body{font-family:sans-serif;margin:40px;line-height:1.6;}.page{margin-bottom:40px;padding:20px;border-bottom:1px solid #ccc;}</style></head><body>`;
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str || '').filter(Boolean);
      html += `<div class="page"><h2>Page ${i}</h2><p>${strings.join(' ')}</p></div>`;
    }
    html += `</body></html>`;
    return html;
  }

  /**
   * Search text across all pages and calculate bounding box rectangles for on-page highlights
   */
  static async searchDocument(
    pdfDoc: any,
    query: string,
    caseSensitive = false,
    wholeWord = false
  ): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];
    const results: SearchResult[] = [];
    const q = caseSensitive ? query.trim() : query.trim().toLowerCase();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const items = (content.items as any[]).filter((it) => it.str);

      let fullText = '';
      const itemOffsets: { start: number; end: number; item: any; fontSize: number }[] = [];

      for (const it of items) {
        const [a, b] = it.transform;
        const fontSize = Math.max(4, Math.round(Math.sqrt(a * a + b * b)));
        const start = fullText.length;
        fullText += it.str + ' ';
        itemOffsets.push({ start, end: start + it.str.length, item: it, fontSize });
      }

      const textToSearch = caseSensitive ? fullText : fullText.toLowerCase();
      let matchIndex = 0;
      let startPos = 0;

      while ((startPos = textToSearch.indexOf(q, startPos)) !== -1) {
        const matchEnd = startPos + q.length;

        if (wholeWord) {
          const before = startPos === 0 ? ' ' : textToSearch[startPos - 1];
          const after = matchEnd >= textToSearch.length ? ' ' : textToSearch[matchEnd];
          const isWordBoundary = /\W/.test(before) && /\W/.test(after);
          if (!isWordBoundary) {
            startPos += q.length;
            continue;
          }
        }

        const snippetStart = Math.max(0, startPos - 35);
        const snippetEnd = Math.min(fullText.length, matchEnd + 35);
        const rawSnippet = fullText.substring(snippetStart, snippetEnd).trim();
        const snippet = (snippetStart > 0 ? '...' : '') + rawSnippet + (snippetEnd < fullText.length ? '...' : '');

        // Calculate bounding boxes for this match across overlapping text items
        const rects: { x: number; y: number; width: number; height: number }[] = [];
        for (const io of itemOffsets) {
          if (io.end > startPos && io.start < matchEnd) {
            const subStart = Math.max(0, startPos - io.start);
            const subEnd = Math.min(io.item.str.length, matchEnd - io.start);
            if (subEnd > subStart) {
              const itW = io.item.width > 0 ? io.item.width : io.fontSize * io.item.str.length * 0.55;
              const charW = io.item.str.length > 0 ? itW / io.item.str.length : io.fontSize * 0.55;
              const rx = io.item.transform[4] + subStart * charW;
              const ry = io.item.transform[5] - io.fontSize * 0.22;
              const rw = Math.max(4, (subEnd - subStart) * charW);
              const rh = io.fontSize * 1.35;
              rects.push({ x: rx, y: ry, width: rw, height: rh });
            }
          }
        }

        results.push({
          pageIndex: i - 1,
          matchIndex,
          text: snippet,
          rects,
        });

        matchIndex++;
        startPos += q.length;
      }
    }

    return results;
  }
}

