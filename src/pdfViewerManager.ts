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
   * Search text across all pages
   */
  static async searchDocument(
    pdfDoc: any,
    query: string,
    caseSensitive = false,
    wholeWord = false
  ): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];
    const results: SearchResult[] = [];
    const q = caseSensitive ? query : query.toLowerCase();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((it: any) => it.str).join(' ');
      const textToSearch = caseSensitive ? pageText : pageText.toLowerCase();

      let matchIndex = 0;
      let startPos = 0;

      while ((startPos = textToSearch.indexOf(q, startPos)) !== -1) {
        if (wholeWord) {
          const before = startPos === 0 ? ' ' : textToSearch[startPos - 1];
          const after = startPos + q.length >= textToSearch.length ? ' ' : textToSearch[startPos + q.length];
          const isWordBoundary = /\W/.test(before) && /\W/.test(after);
          if (!isWordBoundary) {
            startPos += q.length;
            continue;
          }
        }

        const snippetStart = Math.max(0, startPos - 30);
        const snippetEnd = Math.min(pageText.length, startPos + q.length + 30);
        const snippet = '...' + pageText.substring(snippetStart, snippetEnd) + '...';

        results.push({
          pageIndex: i - 1,
          matchIndex,
          text: snippet,
        });

        matchIndex++;
        startPos += q.length;
      }
    }

    return results;
  }
}
