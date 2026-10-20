import { PDFDocument, rgb, degrees, StandardFonts, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFHexString } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFCompressOptions, PDFCompressResult } from './types';

export class PDFEditorService {
  /**
   * Create a blank PDF document
   */
  static async createBlankPDF(numPages = 1, pageSize: [number, number] = [595.28, 841.89]): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < numPages; i++) {
      const page = pdfDoc.addPage(pageSize);
      // Add subtle header for user clarity
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      page.drawText('New Blank Document', {
        x: 50,
        y: pageSize[1] - 50,
        size: 16,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
    return await pdfDoc.save();
  }

  /**
   * Get total page count of a PDF
   */
  static async getPageCount(pdfBytes: Uint8Array): Promise<number> {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    return doc.getPageCount();
  }

  /**
   * Convert any image format (WebP, BMP, GIF, PNG, JPG) to PNG bytes via Canvas
   */
  static async convertImageToPng(imageBytes: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([imageBytes as any]);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => {
          if (!b) return reject(new Error('Canvas toBlob failed'));
          b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab))).catch(reject);
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode image data'));
      };
      img.src = url;
    });
  }

  /**
   * Merge multiple PDF files and images into a single PDF
   */
  static async mergeDocuments(items: { name: string; bytes: Uint8Array; type: 'pdf' | 'image' }[]): Promise<Uint8Array> {
    const mergedPdf = await PDFDocument.create();

    for (const item of items) {
      if (item.type === 'pdf') {
        try {
          const srcDoc = await PDFDocument.load(item.bytes.slice(0), { ignoreEncryption: true });
          const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        } catch (err: any) {
          throw new Error(`Failed to read "${item.name}": ${err.message || 'Corrupted or protected PDF'}`);
        }
      } else {
        // Embed image with magic bytes detection
        let img;
        const b = item.bytes;
        const isPngHeader = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
        const isJpgHeader = b[0] === 0xff && b[1] === 0xd8;

        try {
          if (isPngHeader) {
            img = await mergedPdf.embedPng(item.bytes.slice(0));
          } else if (isJpgHeader) {
            img = await mergedPdf.embedJpg(item.bytes.slice(0));
          } else {
            const pngBytes = await this.convertImageToPng(item.bytes);
            img = await mergedPdf.embedPng(pngBytes);
          }
        } catch {
          const pngBytes = await this.convertImageToPng(item.bytes);
          img = await mergedPdf.embedPng(pngBytes);
        }

        const imgDims = img.scale(1);
        const page = mergedPdf.addPage([imgDims.width, imgDims.height]);
        page.drawImage(img, {
          x: 0,
          y: 0,
          width: imgDims.width,
          height: imgDims.height,
        });
      }
    }

    return await mergedPdf.save();
  }

  /**
   * Convert multiple images to a single PDF
   */
  static async imagesToPDF(images: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
    return await this.mergeDocuments(images.map(img => ({ ...img, type: 'image' })));
  }

  /**
   * Rotate pages in a PDF
   */
  static async rotatePages(pdfBytes: Uint8Array, pageIndices: number[], angleDeg: number): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    pageIndices.forEach((idx) => {
      if (pages[idx]) {
        const currentRot = pages[idx].getRotation().angle;
        pages[idx].setRotation(degrees((currentRot + angleDeg) % 360));
      }
    });

    return await pdfDoc.save();
  }

  /**
   * Delete specific pages
   */
  static async deletePages(pdfBytes: Uint8Array, pageIndicesToDelete: number[]): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    // Sort descending so removal indices remain valid
    const sorted = [...pageIndicesToDelete].sort((a, b) => b - a);
    sorted.forEach((idx) => {
      if (idx >= 0 && idx < pdfDoc.getPageCount()) {
        pdfDoc.removePage(idx);
      }
    });
    if (pdfDoc.getPageCount() === 0) {
      pdfDoc.addPage([595.28, 841.89]);
    }
    return await pdfDoc.save();
  }

  /**
   * Extract pages to a new PDF
   */
  static async extractPages(pdfBytes: Uint8Array, pageIndicesToExtract: number[]): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.load(pdfBytes);
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndicesToExtract);
    copiedPages.forEach(p => newDoc.addPage(p));
    return await newDoc.save();
  }

  /**
   * Insert blank page(s) matching dimensions and orientation of the document
   */
  static async insertBlankPage(
    targetPdfBytes: Uint8Array,
    atIndex: number,
    blankCount = 1
  ): Promise<Uint8Array> {
    const targetDoc = await PDFDocument.load(targetPdfBytes);
    const count = targetDoc.getPageCount();
    const insertIdx = Math.max(0, Math.min(atIndex, count));

    let width = 595.28;
    let height = 841.89;
    if (count > 0) {
      const refIdx = Math.min(Math.max(0, insertIdx > 0 ? insertIdx - 1 : 0), count - 1);
      const refPage = targetDoc.getPage(refIdx);
      const size = refPage.getSize();
      width = size.width;
      height = size.height;
    }

    for (let i = 0; i < blankCount; i++) {
      targetDoc.insertPage(insertIdx + i, [width, height]);
    }

    return await targetDoc.save();
  }

  /**
   * Insert pages from another PDF file (with optional specific page indices)
   */
  static async insertPagesFromFile(
    targetPdfBytes: Uint8Array,
    sourcePdfBytes: Uint8Array,
    atIndex: number,
    sourcePageIndices?: number[]
  ): Promise<Uint8Array> {
    const targetDoc = await PDFDocument.load(targetPdfBytes);
    const srcDoc = await PDFDocument.load(sourcePdfBytes);
    const insertIdx = Math.max(0, Math.min(atIndex, targetDoc.getPageCount()));

    const indicesToCopy = sourcePageIndices && sourcePageIndices.length > 0
      ? sourcePageIndices.filter(idx => idx >= 0 && idx < srcDoc.getPageCount())
      : srcDoc.getPageIndices();

    const copiedPages = await targetDoc.copyPages(srcDoc, indicesToCopy);
    for (let i = 0; i < copiedPages.length; i++) {
      targetDoc.insertPage(insertIdx + i, copiedPages[i]);
    }

    return await targetDoc.save();
  }

  /**
   * Duplicate a specific page
   */
  static async duplicatePage(pdfBytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
    const doc = await PDFDocument.load(pdfBytes);
    const count = doc.getPageCount();
    if (pageIndex < 0 || pageIndex >= count) return pdfBytes;
    const [copiedPage] = await doc.copyPages(doc, [pageIndex]);
    doc.insertPage(pageIndex + 1, copiedPage);
    return await doc.save();
  }

  /**
   * Insert pages (blank or from another PDF) - legacy helper
   */
  static async insertPages(
    targetPdfBytes: Uint8Array,
    atIndex: number,
    sourcePdfBytes?: Uint8Array,
    blankCount = 1
  ): Promise<Uint8Array> {
    if (sourcePdfBytes) {
      return await this.insertPagesFromFile(targetPdfBytes, sourcePdfBytes, atIndex);
    }
    return await this.insertBlankPage(targetPdfBytes, atIndex, blankCount);
  }

  /**
   * Move a page from one index to another (0-indexed)
   */
  static async movePage(pdfBytes: Uint8Array, fromIndex: number, toIndex: number): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.load(pdfBytes);
    const count = srcDoc.getPageCount();
    const clampedFrom = Math.max(0, Math.min(fromIndex, count - 1));
    const clampedTo = Math.max(0, Math.min(toIndex, count - 1));
    if (clampedFrom === clampedTo) return pdfBytes;

    const order = Array.from({ length: count }, (_, i) => i);
    const [moved] = order.splice(clampedFrom, 1);
    order.splice(clampedTo, 0, moved);

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, order);
    copiedPages.forEach(p => newDoc.addPage(p));
    return await newDoc.save();
  }

  /**
   * Move multiple pages to a new target destination position (0-indexed)
   */
  static async movePages(
    pdfBytes: Uint8Array,
    pageIndicesToMove: number[],
    targetDestIndex: number
  ): Promise<{ newBytes: Uint8Array; newIndices: number[] }> {
    const srcDoc = await PDFDocument.load(pdfBytes);
    const count = srcDoc.getPageCount();
    if (count <= 1 || pageIndicesToMove.length === 0) {
      return { newBytes: pdfBytes, newIndices: pageIndicesToMove };
    }

    const movingSet = new Set(pageIndicesToMove.filter(idx => idx >= 0 && idx < count));
    if (movingSet.size === 0) {
      return { newBytes: pdfBytes, newIndices: pageIndicesToMove };
    }
    const movingSorted = Array.from(movingSet).sort((a, b) => a - b);

    // Remaining pages that are not moving
    const remaining: number[] = [];
    for (let i = 0; i < count; i++) {
      if (!movingSet.has(i)) {
        remaining.push(i);
      }
    }

    // targetDestIndex is the desired 0-indexed position in the resulting document
    const insertPos = Math.max(0, Math.min(targetDestIndex, remaining.length));
    remaining.splice(insertPos, 0, ...movingSorted);

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, remaining);
    copiedPages.forEach(p => newDoc.addPage(p));

    const newIndices = movingSorted.map((_, i) => insertPos + i);

    return {
      newBytes: await newDoc.save(),
      newIndices,
    };
  }

  /**
   * Reorder pages in a PDF
   */
  static async reorderPages(pdfBytes: Uint8Array, newOrder: number[]): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.load(pdfBytes);
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, newOrder);
    copiedPages.forEach(p => newDoc.addPage(p));
    return await newDoc.save();
  }

  /**
   * Split a PDF into multiple documents based on specified page ranges
   */
  static async splitPDF(
    pdfBytes: Uint8Array,
    splits: { name: string; pageIndices: number[] }[]
  ): Promise<{ filename: string; bytes: Uint8Array; pageCount: number }[]> {
    const srcDoc = await PDFDocument.load(pdfBytes);
    const totalCount = srcDoc.getPageCount();
    const results: { filename: string; bytes: Uint8Array; pageCount: number }[] = [];

    for (const split of splits) {
      const validIndices = split.pageIndices.filter(idx => idx >= 0 && idx < totalCount);
      if (validIndices.length === 0) continue;

      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(srcDoc, validIndices);
      copied.forEach(page => newDoc.addPage(page));
      const bytes = await newDoc.save();

      results.push({
        filename: split.name,
        bytes,
        pageCount: validIndices.length,
      });
    }

    return results;
  }

  /**
   * Crop pages margins
   */
  static async cropPages(
    pdfBytes: Uint8Array,
    pageIndices: number[],
    margins: { top: number; right: number; bottom: number; left: number }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    pageIndices.forEach((idx) => {
      const page = pages[idx];
      if (page) {
        const { x, y, width, height } = page.getCropBox();
        const newX = x + margins.left;
        const newY = y + margins.bottom;
        const newWidth = Math.max(50, width - margins.left - margins.right);
        const newHeight = Math.max(50, height - margins.top - margins.bottom);
        page.setCropBox(newX, newY, newWidth, newHeight);
      }
    });

    return await pdfDoc.save();
  }

  /**
   * Add text watermark
   */
  static async addWatermark(
    pdfBytes: Uint8Array,
    options: {
      text: string;
      colorHex?: string;
      opacity?: number;
      fontSize?: number;
      angle?: number;
      pages?: 'all' | 'odd' | 'even';
    }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    const { text, colorHex = '#dc2626', opacity = 0.25, fontSize = 54, angle = -45 } = options;
    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

    pages.forEach((page, i) => {
      if (options.pages === 'odd' && (i + 1) % 2 === 0) return;
      if (options.pages === 'even' && (i + 1) % 2 !== 0) return;

      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      page.drawText(text, {
        x: width / 2 - textWidth / 2,
        y: height / 2 - textHeight / 2,
        size: fontSize,
        font,
        color: rgb(r, g, b),
        opacity,
        rotate: degrees(angle),
      });
    });

    return await pdfDoc.save();
  }

  /**
   * Add Header & Footer & Page Numbers / Bates Numbering
   */
  static async addHeaderFooter(
    pdfBytes: Uint8Array,
    options: {
      headerLeft?: string;
      headerCenter?: string;
      headerRight?: string;
      footerLeft?: string;
      footerCenter?: string;
      footerRight?: string;
      startPage?: number;
      prefix?: string;
      isBates?: boolean;
      batesDigits?: number;
      fontSize?: number;
    }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const fontSize = options.fontSize || 9;
    const total = pages.length;

    pages.forEach((page, i) => {
      const pageNum = (options.startPage || 1) + i;
      const { width, height } = page.getSize();

      const formatText = (template?: string) => {
        if (!template) return '';
        let numStr = String(pageNum);
        if (options.isBates) {
          numStr = String(pageNum).padStart(options.batesDigits || 6, '0');
        }
        return template
          .replace(/\{page\}/g, numStr)
          .replace(/\{total\}/g, String(total))
          .replace(/\{prefix\}/g, options.prefix || '');
      };

      const topY = height - 25;
      const bottomY = 20;

      // Header
      if (options.headerLeft) {
        page.drawText(formatText(options.headerLeft), { x: 36, y: topY, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
      }
      if (options.headerCenter) {
        const txt = formatText(options.headerCenter);
        const w = font.widthOfTextAtSize(txt, fontSize);
        page.drawText(txt, { x: width / 2 - w / 2, y: topY, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
      }
      if (options.headerRight) {
        const txt = formatText(options.headerRight);
        const w = font.widthOfTextAtSize(txt, fontSize);
        page.drawText(txt, { x: width - 36 - w, y: topY, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
      }

      // Footer
      if (options.footerLeft) {
        page.drawText(formatText(options.footerLeft), { x: 36, y: bottomY, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
      }
      if (options.footerCenter) {
        const txt = formatText(options.footerCenter);
        const w = font.widthOfTextAtSize(txt, fontSize);
        page.drawText(txt, { x: width / 2 - w / 2, y: bottomY, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
      }
      if (options.footerRight) {
        const txt = formatText(options.footerRight);
        const w = font.widthOfTextAtSize(txt, fontSize);
        page.drawText(txt, { x: width - 36 - w, y: bottomY, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
      }
    });

    return await pdfDoc.save();
  }

  /**
   * Add text directly onto a page or pages
   */
  static async addTextToPage(
    pdfBytes: Uint8Array,
    pageIndexOrIndices: number | number[],
    text: string,
    x?: number,
    y?: number,
    options: {
      fontSize?: number;
      colorHex?: string;
      preset?: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-center' | 'bottom-left' | 'bottom-right' | 'custom';
    } = {}
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const indices = Array.isArray(pageIndexOrIndices) ? pageIndexOrIndices : [pageIndexOrIndices];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const size = options.fontSize || 12;
    const colorHex = options.colorHex || '#000000';
    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
    const b = parseInt(colorHex.slice(5, 7), 16) / 255;
    const textWidth = font.widthOfTextAtSize(text, size);

    indices.forEach((idx) => {
      const page = pages[idx];
      if (!page) return;
      const { width, height } = page.getSize();
      let drawX = x ?? 50;
      let drawY = y ?? (height - 50 - size);

      if (options.preset) {
        switch (options.preset) {
          case 'top-left':
            drawX = 50;
            drawY = height - 50 - size;
            break;
          case 'top-center':
            drawX = Math.max(20, (width - textWidth) / 2);
            drawY = height - 50 - size;
            break;
          case 'top-right':
            drawX = Math.max(20, width - 50 - textWidth);
            drawY = height - 50 - size;
            break;
          case 'center':
            drawX = Math.max(20, (width - textWidth) / 2);
            drawY = (height - size) / 2;
            break;
          case 'bottom-center':
            drawX = Math.max(20, (width - textWidth) / 2);
            drawY = 50;
            break;
          case 'bottom-left':
            drawX = 50;
            drawY = 50;
            break;
          case 'bottom-right':
            drawX = Math.max(20, width - 50 - textWidth);
            drawY = 50;
            break;
          case 'custom':
            drawX = x ?? 50;
            drawY = y ?? (height - 50 - size);
            break;
        }
      }

      page.drawText(text, {
        x: drawX,
        y: drawY,
        size,
        font,
        color: rgb(r, g, b),
      });
    });

    return await pdfDoc.save();
  }

  /**
   * Add image (or signature) onto a page
   */
  static async addImageToPage(
    pdfBytes: Uint8Array,
    pageIndex: number,
    imageBytes: Uint8Array,
    isPng: boolean,
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    options: {
      preset?: 'center' | 'top-center' | 'bottom-center' | 'custom';
      rotation?: number;
    } = {}
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const page = pages[pageIndex];
    if (!page) return pdfBytes;

    const img = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
    const dims = img.scale(1);
    const imgWidth = width || dims.width;
    const imgHeight = height || dims.height;

    const { width: pWidth, height: pHeight } = page.getSize();
    let drawX = x ?? (pWidth - imgWidth) / 2;
    let drawY = y ?? (pHeight - imgHeight) / 2;

    if (options.preset) {
      switch (options.preset) {
        case 'top-center':
          drawX = (pWidth - imgWidth) / 2;
          drawY = pHeight - 50 - imgHeight;
          break;
        case 'bottom-center':
          drawX = (pWidth - imgWidth) / 2;
          drawY = 50;
          break;
        case 'center':
          drawX = (pWidth - imgWidth) / 2;
          drawY = (pHeight - imgHeight) / 2;
          break;
        case 'custom':
          drawX = x ?? 50;
          drawY = y ?? 50;
          break;
      }
    }

    const rotDeg = options.rotation ? ((options.rotation % 360) + 360) % 360 : 0;
    if (rotDeg !== 0) {
      // Rotate around the center of the image
      const thetaPdf = (360 - (rotDeg % 360)) % 360;
      const thetaRad = (thetaPdf * Math.PI) / 180;
      const cx = drawX + imgWidth / 2;
      const cy = drawY + imgHeight / 2;
      const rotatedDrawX = cx - (imgWidth / 2) * Math.cos(thetaRad) + (imgHeight / 2) * Math.sin(thetaRad);
      const rotatedDrawY = cy - (imgWidth / 2) * Math.sin(thetaRad) - (imgHeight / 2) * Math.cos(thetaRad);

      page.drawImage(img, {
        x: rotatedDrawX,
        y: rotatedDrawY,
        width: imgWidth,
        height: imgHeight,
        rotate: degrees(thetaPdf),
      });
    } else {
      page.drawImage(img, { x: drawX, y: drawY, width: imgWidth, height: imgHeight });
    }

    return await pdfDoc.save();
  }

  /**
   * Add clickable hyperlink annotation onto a page
   */
  static async addLinkToPage(
    pdfBytes: Uint8Array,
    pageIndex: number,
    options: {
      url?: string;
      targetPage?: number;
      text?: string;
      x?: number;
      y?: number;
      fontSize?: number;
      preset?: 'top-center' | 'center' | 'bottom-center' | 'custom';
    }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const page = pages[pageIndex];
    if (!page) return pdfBytes;

    const { width: pWidth, height: pHeight } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const size = options.fontSize || 12;

    const text = options.text || (options.url ? options.url : `Go to Page ${options.targetPage}`);
    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = size + 2;

    let drawX = (pWidth - textWidth) / 2;
    let drawY = (pHeight - textHeight) / 2;

    switch (options.preset) {
      case 'top-center':
        drawX = (pWidth - textWidth) / 2;
        drawY = pHeight - 60;
        break;
      case 'bottom-center':
        drawX = (pWidth - textWidth) / 2;
        drawY = 60;
        break;
      case 'custom':
        drawX = options.x ?? (pWidth - textWidth) / 2;
        drawY = options.y ?? (pHeight - textHeight) / 2;
        break;
      case 'center':
      default:
        drawX = (pWidth - textWidth) / 2;
        drawY = (pHeight - textHeight) / 2;
        break;
    }

    // Draw visible styled link text
    page.drawText(text, {
      x: drawX,
      y: drawY,
      size,
      font,
      color: rgb(0.14, 0.38, 0.92),
    });

    // Draw underline
    page.drawLine({
      start: { x: drawX, y: drawY - 2 },
      end: { x: drawX + textWidth, y: drawY - 2 },
      thickness: 1,
      color: rgb(0.14, 0.38, 0.92),
    });

    // Helper: ensure page has a direct Annots array and push a new annotation ref
    const pushAnnotation = (annotRef: PDFRef) => {
      const annotsRaw = page.node.lookup(PDFName.of('Annots'));
      if (annotsRaw && typeof (annotsRaw as any).push === 'function') {
        (annotsRaw as any).push(annotRef);
      } else {
        const arr = pdfDoc.context.obj([annotRef]);
        page.node.set(PDFName.of('Annots'), arr);
      }
    };

    // Register PDF link annotation
    if (options.url) {
      const formattedUrl = options.url.startsWith('http://') || options.url.startsWith('https://') || options.url.startsWith('mailto:')
        ? options.url
        : `https://${options.url}`;
      const linkAnnot = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [drawX, drawY - 2, drawX + textWidth, drawY + textHeight],
        Border: [0, 0, 0],
        C: [0.14, 0.38, 0.92],
        A: {
          Type: 'Action',
          S: 'URI',
          URI: formattedUrl,
        },
      });
      const linkAnnotRef = pdfDoc.context.register(linkAnnot);
      pushAnnotation(linkAnnotRef);
    } else if (options.targetPage && pages[options.targetPage - 1]) {
      const targetPageObj = pages[options.targetPage - 1];
      const linkAnnot = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [drawX, drawY - 2, drawX + textWidth, drawY + textHeight],
        Border: [0, 0, 0],
        C: [0.14, 0.38, 0.92],
        Dest: [targetPageObj.ref, PDFName.of('Fit')],
      });
      const linkAnnotRef = pdfDoc.context.register(linkAnnot);
      pushAnnotation(linkAnnotRef);
    }

    return await pdfDoc.save();
  }

  /**
   * Apply interactive text edits (move, edit, delete, add) back into the PDF.
   * For each modified block:
   *  - A white rectangle covers the original text position (to visually erase it)
   *  - The new text is drawn at the updated position with the chosen font
   */
  static async applyTextEdits(
    pdfBytes: Uint8Array,
    edits: Array<{
      pageIndex: number;
      isNew: boolean;
      isDeleted: boolean;
      str: string;
      originalStr: string;
      origX: number;
      origY: number;
      origWidth: number;
      origHeight: number;
      pdfX: number;
      pdfY: number;
      fontSize: number;
      pdfFont: string;
      color: string;
      bgColor?: string;
    }>
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // Map common font aliases to exact StandardFonts identifiers
    const fontNameMap: Record<string, string> = {
      helvetica: StandardFonts.Helvetica,
      'helvetica-bold': StandardFonts.HelveticaBold,
      helveticabold: StandardFonts.HelveticaBold,
      'helvetica-oblique': StandardFonts.HelveticaOblique,
      helveticaoblique: StandardFonts.HelveticaOblique,
      'helvetica-boldoblique': StandardFonts.HelveticaBoldOblique,
      helveticaboldoblique: StandardFonts.HelveticaBoldOblique,
      'times-roman': StandardFonts.TimesRoman,
      timesroman: StandardFonts.TimesRoman,
      'times-bold': StandardFonts.TimesRomanBold,
      timesromanbold: StandardFonts.TimesRomanBold,
      timesbold: StandardFonts.TimesRomanBold,
      'times-italic': StandardFonts.TimesRomanItalic,
      timesromanitalic: StandardFonts.TimesRomanItalic,
      timesitalic: StandardFonts.TimesRomanItalic,
      'times-bolditalic': StandardFonts.TimesRomanBoldItalic,
      timesromanbolditalic: StandardFonts.TimesRomanBoldItalic,
      courier: StandardFonts.Courier,
      'courier-bold': StandardFonts.CourierBold,
      courierbold: StandardFonts.CourierBold,
      'courier-oblique': StandardFonts.CourierOblique,
      courieroblique: StandardFonts.CourierOblique,
      'courier-boldoblique': StandardFonts.CourierBoldOblique,
      courierboldoblique: StandardFonts.CourierBoldOblique,
    };

    // Cache embedded fonts to avoid re-embedding the same font multiple times
    const fontCache = new Map<string, any>();
    const getFont = async (fontName: string) => {
      const cleanKey = (fontName || '').toLowerCase().trim();
      const standardName = fontNameMap[cleanKey] || fontNameMap[cleanKey.replace(/\s+/g, '-')] || fontName || StandardFonts.Helvetica;

      if (!fontCache.has(standardName)) {
        try {
          fontCache.set(standardName, await pdfDoc.embedFont(standardName as any));
        } catch (e) {
          console.warn(`Could not embed font "${standardName}", falling back to Helvetica:`, e);
          if (!fontCache.has(StandardFonts.Helvetica)) {
            fontCache.set(StandardFonts.Helvetica, await pdfDoc.embedFont(StandardFonts.Helvetica));
          }
          fontCache.set(standardName, fontCache.get(StandardFonts.Helvetica));
        }
      }
      return fontCache.get(standardName)!;
    };

    // Group edits by page
    const byPage = new Map<number, typeof edits>();
    for (const edit of edits) {
      if (!byPage.has(edit.pageIndex)) byPage.set(edit.pageIndex, []);
      byPage.get(edit.pageIndex)!.push(edit);
    }

    for (const [pageIndex, pageEdits] of byPage) {
      const page = pages[pageIndex];
      if (!page) continue;

      for (const edit of pageEdits) {
        // White-out original position (skip for brand-new blocks)
        if (!edit.isNew) {
          // Generous margins: covers baseline descent (p, g, y, q, j), ascent, and horizontal overhangs
          const descentPad = Math.max(4, edit.fontSize * 0.38);
          const ascentPad = Math.max(4, edit.fontSize * 0.28);
          const hPad = Math.max(3, edit.fontSize * 0.15);

          const rX = Math.max(0, edit.origX - hPad);
          const rY = Math.max(0, edit.origY - descentPad);
          const rW = edit.origWidth + hPad * 2;
          const rH = edit.origHeight + descentPad + ascentPad;

          let rBg = 1, gBg = 1, bBg = 1;
          if (edit.bgColor && edit.bgColor.startsWith('#') && edit.bgColor.length === 7) {
            rBg = parseInt(edit.bgColor.slice(1, 3), 16) / 255;
            gBg = parseInt(edit.bgColor.slice(3, 5), 16) / 255;
            bBg = parseInt(edit.bgColor.slice(5, 7), 16) / 255;
          }

          page.drawRectangle({
            x: rX,
            y: rY,
            width: rW,
            height: rH,
            color: rgb(
              Math.min(1, Math.max(0, isNaN(rBg) ? 1 : rBg)),
              Math.min(1, Math.max(0, isNaN(gBg) ? 1 : gBg)),
              Math.min(1, Math.max(0, isNaN(bBg) ? 1 : bBg))
            ),
            opacity: 1,
          });
        }

        // Draw new text (skip if deleted or empty)
        if (!edit.isDeleted && edit.str && edit.str.trim()) {
          const font = await getFont(edit.pdfFont);
          const hexColor = edit.color || '#000000';
          const r = parseInt(hexColor.slice(1, 3), 16) / 255;
          const g = parseInt(hexColor.slice(3, 5), 16) / 255;
          const b = parseInt(hexColor.slice(5, 7), 16) / 255;

          page.drawText(edit.str, {
            x: Math.max(0, edit.pdfX),
            y: Math.max(0, edit.pdfY),
            size: Math.max(4, edit.fontSize),
            font,
            color: rgb(
              Math.min(1, Math.max(0, isNaN(r) ? 0 : r)),
              Math.min(1, Math.max(0, isNaN(g) ? 0 : g)),
              Math.min(1, Math.max(0, isNaN(b) ? 0 : b))
            ),
          });
        }
      }
    }

    return await pdfDoc.save();
  }



  /**
   * Redaction: True blackout rectangle that covers text/images
   */
  static async applyRedaction(
    pdfBytes: Uint8Array,
    pageIndex: number,
    rects: { x: number; y: number; width: number; height: number }[]
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const page = pages[pageIndex];
    if (!page) return pdfBytes;

    rects.forEach((rect) => {
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rgb(0, 0, 0),
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
    });

    return await pdfDoc.save();
  }

  /**
   * Edit document metadata
   */
  static async editMetadata(
    pdfBytes: Uint8Array,
    meta: {
      title?: string;
      author?: string;
      subject?: string;
      keywords?: string[];
      creator?: string;
      producer?: string;
    }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    if (meta.title !== undefined) pdfDoc.setTitle(meta.title);
    if (meta.author !== undefined) pdfDoc.setAuthor(meta.author);
    if (meta.subject !== undefined) pdfDoc.setSubject(meta.subject);
    if (meta.keywords !== undefined) pdfDoc.setKeywords(meta.keywords);
    if (meta.creator !== undefined) pdfDoc.setCreator(meta.creator);
    if (meta.producer !== undefined) pdfDoc.setProducer(meta.producer);
    return await pdfDoc.save();
  }

  /**
   * Remove hidden metadata / sanitize document
   */
  static async removeMetadata(pdfBytes: Uint8Array): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setCreator('SlashPDF');
    pdfDoc.setProducer('SlashPDF Sanitize Engine');
    return await pdfDoc.save();
  }

  /**
   * Form fields management: create interactive form fields
   */
  static async addFormField(
    pdfBytes: Uint8Array,
    pageIndex: number,
    field: {
      type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'signature';
      name: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      positionPreset?: 'center' | 'top' | 'bottom' | 'custom';
      options?: string[];
      defaultValue?: string;
      multiline?: boolean;
    }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const pages = pdfDoc.getPages();
    const page = pages[Math.max(0, Math.min(pageIndex, pages.length - 1))];
    const { width: pWidth, height: pHeight } = page.getSize();

    // Default sizes per field type
    const width = field.width ?? (
      field.type === 'checkbox' ? 20 :
      field.type === 'radio' ? 18 :
      field.type === 'signature' ? 220 : 200
    );
    const height = field.height ?? (
      field.type === 'checkbox' ? 20 :
      field.type === 'radio' ? 18 :
      field.type === 'signature' ? 50 : 28
    );

    // Calculate (x, y) based on presets or provided coordinates
    let x = field.x;
    let y = field.y;

    if (x === undefined || y === undefined || field.positionPreset === 'center') {
      x = Math.max(20, Math.round((pWidth - width) / 2));
      y = Math.max(20, Math.round((pHeight - height) / 2));
    } else if (field.positionPreset === 'top') {
      x = Math.max(20, Math.round((pWidth - width) / 2));
      y = Math.max(20, pHeight - height - 60);
    } else if (field.positionPreset === 'bottom') {
      x = Math.max(20, Math.round((pWidth - width) / 2));
      y = 60;
    }

    // Ensure within page bounds
    x = Math.max(0, Math.min(x, pWidth - width));
    y = Math.max(0, Math.min(y, pHeight - height));

    if (field.type === 'text') {
      const tf: PDFTextField = form.createTextField(field.name);
      if (field.multiline) {
        tf.enableMultiline();
      }
      tf.setText(field.defaultValue || '');
      tf.addToPage(page, { x, y, width, height });
    } else if (field.type === 'checkbox') {
      const cb: PDFCheckBox = form.createCheckBox(field.name);
      if (field.defaultValue === 'true') cb.check();
      cb.addToPage(page, { x, y, width, height });
    } else if (field.type === 'dropdown') {
      const dd: PDFDropdown = form.createDropdown(field.name);
      const opts = field.options && field.options.length ? field.options : ['Option 1', 'Option 2', 'Option 3'];
      dd.setOptions(opts);
      if (field.defaultValue && opts.includes(field.defaultValue)) {
        dd.select(field.defaultValue);
      } else if (opts.length > 0) {
        dd.select(opts[0]);
      }
      dd.addToPage(page, { x, y, width, height });
    } else if (field.type === 'radio') {
      const group = form.createRadioGroup(field.name);
      const radioOptions = field.options && field.options.length ? field.options : ['Option 1', 'Option 2', 'Option 3'];
      radioOptions.forEach((optLabel, idx) => {
        const optY = y - idx * (height + 8);
        if (optY >= 10) {
          group.addOptionToPage(optLabel, page, {
            x,
            y: optY,
            width,
            height,
          });
        }
      });
      if (field.defaultValue && radioOptions.includes(field.defaultValue)) {
        group.select(field.defaultValue);
      } else if (radioOptions.length > 0) {
        group.select(radioOptions[0]);
      }
    } else if (field.type === 'signature') {
      const tf: PDFTextField = form.createTextField(field.name);
      tf.setText(field.defaultValue || '');
      tf.addToPage(page, { x, y, width, height });

      try {
        page.drawLine({
          start: { x: x + 8, y: y + 14 },
          end: { x: x + width - 8, y: y + 14 },
          thickness: 1,
          color: rgb(0.5, 0.5, 0.5),
        });
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        page.drawText('✕ Signature', {
          x: x + 10,
          y: y + 4,
          size: 8,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
      } catch {
        // Continue even if font or decorative line fails
      }
    }

    return await pdfDoc.save();
  }

  /**
   * Flatten form fields into document content
   */
  static async flattenForm(pdfBytes: Uint8Array): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    try {
      form.flatten();
    } catch {
      // If no form present, ignore
    }
    return await pdfDoc.save();
  }

  /**
   * Export form values as JSON
   */
  static async exportFormData(pdfBytes: Uint8Array): Promise<Record<string, any>> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const data: Record<string, any> = {};

    fields.forEach((f) => {
      const name = f.getName();
      try {
        if (f instanceof PDFTextField) {
          data[name] = f.getText();
        } else if (f instanceof PDFCheckBox) {
          data[name] = f.isChecked();
        } else if (f instanceof PDFDropdown) {
          data[name] = f.getSelected();
        }
      } catch {
        // Skip unhandled field types
      }
    });

    return data;
  }

  /**
   * Import form data from JSON
   */
  static async importFormData(pdfBytes: Uint8Array, data: Record<string, any>): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    Object.entries(data).forEach(([fieldName, value]) => {
      try {
        const field = form.getField(fieldName);
        if (field instanceof PDFTextField && typeof value === 'string') {
          field.setText(value);
        } else if (field instanceof PDFCheckBox && typeof value === 'boolean') {
          if (value) field.check();
          else field.uncheck();
        } else if (field instanceof PDFDropdown && typeof value === 'string') {
          field.select(value);
        }
      } catch {
        // Field might not exist
      }
    });

    return await pdfDoc.save();
  }

  /**
   * Reset all form field values to empty/unchecked defaults
   */
  static async resetForm(pdfBytes: Uint8Array): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    fields.forEach((f) => {
      try {
        if (f instanceof PDFTextField) {
          f.setText('');
        } else if (f instanceof PDFCheckBox) {
          f.uncheck();
        } else if (f instanceof PDFDropdown) {
          // Reset dropdown to first option or clear
          const options = f.getOptions();
          if (options.length > 0) {
            f.select(options[0]);
          }
        } else if (f instanceof PDFRadioGroup) {
          // Clear radio selection if possible
          try { f.clear(); } catch { /* some radio groups may not support clear */ }
        }
      } catch {
        // Skip fields that can't be reset
      }
    });

    return await pdfDoc.save();
  }

  /**
   * Get summary of form fields in the document (for Fill Form dialog)
   */
  static async getFormFieldsSummary(pdfBytes: Uint8Array): Promise<Array<{
    name: string;
    type: string;
    value: string;
    options?: string[];
  }>> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const result: Array<{ name: string; type: string; value: string; options?: string[] }> = [];

    fields.forEach((f) => {
      try {
        const name = f.getName();
        if (f instanceof PDFTextField) {
          result.push({ name, type: 'text', value: f.getText() || '' });
        } else if (f instanceof PDFCheckBox) {
          result.push({ name, type: 'checkbox', value: f.isChecked() ? 'true' : 'false' });
        } else if (f instanceof PDFDropdown) {
          const options = f.getOptions();
          const selected = f.getSelected();
          result.push({ name, type: 'dropdown', value: selected.length > 0 ? selected[0] : '', options });
        } else if (f instanceof PDFRadioGroup) {
          const options = f.getOptions();
          const selected = f.getSelected();
          result.push({ name, type: 'radio', value: selected || '', options });
        }
      } catch {
        // Skip unreadable fields
      }
    });

    return result;
  }

  /**
   * Fill form fields with provided data
   */
  static async fillForm(pdfBytes: Uint8Array, data: Record<string, any>): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    Object.entries(data).forEach(([fieldName, value]) => {
      try {
        const field = form.getField(fieldName);
        if (field instanceof PDFTextField && typeof value === 'string') {
          field.setText(value);
        } else if (field instanceof PDFCheckBox) {
          if (value === true || value === 'true') field.check();
          else field.uncheck();
        } else if (field instanceof PDFDropdown && typeof value === 'string') {
          field.select(value);
        } else if (field instanceof PDFRadioGroup && typeof value === 'string') {
          field.select(value);
        }
      } catch {
        // Field might not exist or can't be set
      }
    });

    return await pdfDoc.save();
  }

  /**
   * Recompress image bytes to lower-size JPEG with max dimension and quality
   */
  private static async recompressImageBytes(
    rawBytes: Uint8Array,
    filterName: string,
    quality: number,
    maxDimension: number
  ): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
    try {
      let blob: Blob | null = null;
      if (filterName === 'DCTDecode' || (rawBytes[0] === 0xff && rawBytes[1] === 0xd8)) {
        blob = new Blob([rawBytes.buffer as ArrayBuffer], { type: 'image/jpeg' });
      } else if (rawBytes[0] === 0x89 && rawBytes[1] === 0x50 && rawBytes[2] === 0x4e && rawBytes[3] === 0x47) {
        blob = new Blob([rawBytes.buffer as ArrayBuffer], { type: 'image/png' });
      } else if (typeof DecompressionStream !== 'undefined') {
        try {
          const ds = new DecompressionStream('deflate');
          const writer = ds.writable.getWriter();
          writer.write(rawBytes.buffer as ArrayBuffer);
          writer.close();
          const res = new Response(ds.readable);
          const decompressed = new Uint8Array(await res.arrayBuffer());
          if (decompressed[0] === 0xff && decompressed[1] === 0xd8) {
            blob = new Blob([decompressed.buffer as ArrayBuffer], { type: 'image/jpeg' });
          } else if (decompressed[0] === 0x89 && decompressed[1] === 0x50) {
            blob = new Blob([decompressed.buffer as ArrayBuffer], { type: 'image/png' });
          }
        } catch {}
      }

      if (!blob) return null;

      const bitmap = await createImageBitmap(blob);
      let w = bitmap.width;
      let h = bitmap.height;
      if (w <= 0 || h <= 0) {
        bitmap.close();
        return null;
      }

      if (w > maxDimension || h > maxDimension) {
        if (w >= h) {
          h = Math.max(1, Math.round((h * maxDimension) / w));
          w = maxDimension;
        } else {
          w = Math.max(1, Math.round((w * maxDimension) / h));
          h = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return null;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();

      const compressedBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      );
      if (!compressedBlob) return null;

      const compressedAb = await compressedBlob.arrayBuffer();
      const compressedBytes = new Uint8Array(compressedAb);
      return { bytes: compressedBytes, width: w, height: h };
    } catch {
      return null;
    }
  }

  /**
   * Rasterize document pages into compressed JPEG pages (scanned doc mode / extreme target size)
   */
  private static async rasterizeAndCompressPages(
    pdfBytes: Uint8Array,
    quality: number,
    scale: number
  ): Promise<Uint8Array> {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
    const srcDoc = await loadingTask.promise;
    const newPdf = await PDFDocument.create();

    for (let p = 1; p <= srcDoc.numPages; p++) {
      const page = await srcDoc.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await (page.render({ canvasContext: ctx, viewport, canvas } as any)).promise;

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality)
      );
      const ab = await blob.arrayBuffer();
      const jpgImg = await newPdf.embedJpg(new Uint8Array(ab));
      const origVp = page.getViewport({ scale: 1.0 });
      const newPage = newPdf.addPage([origVp.width, origVp.height]);
      newPage.drawImage(jpgImg, {
        x: 0,
        y: 0,
        width: origVp.width,
        height: origVp.height,
      });
    }

    return await newPdf.save({ useObjectStreams: true });
  }

  /**
   * Optimize and Compress PDF with flexible presets and target size
   */
  static async compressPDF(
    pdfBytes: Uint8Array,
    options: PDFCompressOptions = { preset: 'balanced', removeMetadata: true, compressImages: true }
  ): Promise<PDFCompressResult> {
    const originalSize = pdfBytes.length;

    // Check if rasterize mode requested
    if (options.rasterizePages) {
      let q = 0.70;
      let s = 1.25;
      if (options.preset === 'light') {
        q = 0.85;
        s = 1.5;
      } else if (options.preset === 'strong') {
        q = 0.45;
        s = 1.0;
      } else if (options.preset === 'target' && options.targetSizeKB) {
        const ratio = (options.targetSizeKB * 1024) / originalSize;
        if (ratio < 0.25) {
          q = 0.35;
          s = 0.9;
        } else if (ratio < 0.5) {
          q = 0.55;
          s = 1.1;
        } else {
          q = 0.75;
          s = 1.3;
        }
      }
      const rasterBytes = await this.rasterizeAndCompressPages(pdfBytes, q, s);
      const newSize = rasterBytes.length;
      const reduction = Math.max(0, originalSize - newSize);
      const reductionPercentage = (reduction / originalSize) * 100;
      const isTargetMet = options.preset === 'target' && options.targetSizeKB
        ? newSize <= options.targetSizeKB * 1024
        : true;

      return {
        bytes: rasterBytes,
        originalSize,
        newSize,
        reductionPercentage,
        imagesCompressed: 0,
        isTargetMet,
        message: 'Pages rasterized and compressed successfully.'
      };
    }

    // Vector-preserving compression
    const pdfDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });

    // 1. Metadata sanitization
    if (options.removeMetadata !== false) {
      try {
        const metaRef = pdfDoc.catalog.get(PDFName.of('Metadata'));
        if (metaRef && metaRef instanceof PDFRef) {
          pdfDoc.context.delete(metaRef);
          pdfDoc.catalog.delete(PDFName.of('Metadata'));
        }
      } catch {}
      try {
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('SlashPDF');
        pdfDoc.setCreator('SlashPDF');
      } catch {}
      // Remove page thumbnails
      for (const page of pdfDoc.getPages()) {
        try {
          page.node.delete(PDFName.of('Thumb'));
        } catch {}
      }
    }

    // 2. Determine quality & dimensions
    let quality = 0.70;
    let maxDim = 1280;

    if (options.preset === 'light') {
      quality = 0.85;
      maxDim = 1920;
    } else if (options.preset === 'strong') {
      quality = 0.48;
      maxDim = 960;
    } else if (options.preset === 'target' && options.targetSizeKB) {
      const targetBytes = options.targetSizeKB * 1024;
      const ratio = targetBytes / originalSize;
      if (ratio >= 0.75) {
        quality = 0.82;
        maxDim = 1600;
      } else if (ratio >= 0.5) {
        quality = 0.65;
        maxDim = 1280;
      } else if (ratio >= 0.3) {
        quality = 0.45;
        maxDim = 960;
      } else {
        quality = 0.32;
        maxDim = 720;
      }
    }

    let imagesCompressed = 0;

    // 3. Image optimization
    if (options.compressImages !== false) {
      for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
        if (!obj || !(obj as any).dict) continue;
        const dict = (obj as any).dict;
        if (dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
          const filter = dict.get(PDFName.of('Filter'));
          const filterStr = filter ? filter.toString().replace(/^\//, '') : '';
          const contents = (obj as any).getContents ? (obj as any).getContents() : null;
          if (!contents || contents.length < 1024) continue; // Skip tiny icons < 1KB

          const recompressed = await this.recompressImageBytes(contents, filterStr, quality, maxDim);
          if (recompressed && recompressed.bytes.length < contents.length) {
            const newDict = dict.clone();
            newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
            newDict.set(PDFName.of('Length'), PDFNumber.of(recompressed.bytes.length));
            newDict.set(PDFName.of('Width'), PDFNumber.of(recompressed.width));
            newDict.set(PDFName.of('Height'), PDFNumber.of(recompressed.height));
            newDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
            newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
            newDict.delete(PDFName.of('DecodeParms'));
            const replacementStream = PDFRawStream.of(newDict, recompressed.bytes);
            pdfDoc.context.assign(ref, replacementStream);
            imagesCompressed++;
          }
        }
      }
    }

    // 4. Save with object streams
    let newBytes = await pdfDoc.save({ useObjectStreams: true });
    let newSize = newBytes.length;

    // If newSize is somehow larger than original, revert to original bytes
    if (newSize > originalSize) {
      newBytes = pdfBytes.slice(0);
      newSize = originalSize;
    }

    const reduction = Math.max(0, originalSize - newSize);
    const reductionPercentage = (reduction / originalSize) * 100;
    const isTargetMet = options.preset === 'target' && options.targetSizeKB
      ? newSize <= options.targetSizeKB * 1024
      : true;

    return {
      bytes: newBytes,
      originalSize,
      newSize,
      reductionPercentage,
      imagesCompressed,
      isTargetMet,
    };
  }

  /**
   * Embed or update outlines / bookmarks directly in the PDF document bytes
   */
  static async embedBookmarks(
    pdfBytes: Uint8Array,
    bookmarks: Array<{ title: string; pageIndex: number }>
  ): Promise<Uint8Array> {
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      const pageCount = pages.length;

      // Filter valid bookmarks
      const validBookmarks = bookmarks.filter(
        (b) => typeof b.pageIndex === 'number' && b.pageIndex >= 0 && b.pageIndex < pageCount && b.title?.trim()
      );

      if (validBookmarks.length === 0) {
        pdfDoc.catalog.delete(PDFName.of('Outlines'));
        return await pdfDoc.save();
      }

      // Create indirect references for all items and root
      const outlineRootRef = pdfDoc.context.nextRef();
      const itemRefs: PDFRef[] = validBookmarks.map(() => pdfDoc.context.nextRef());

      validBookmarks.forEach((bm, i) => {
        const itemRef = itemRefs[i];
        const page = pages[bm.pageIndex];
        const itemDict: Record<string, any> = {
          Title: PDFHexString.fromText(bm.title.trim()),
          Parent: outlineRootRef,
          Dest: [page.ref, PDFName.of('Fit')],
        };
        if (i > 0) {
          itemDict.Prev = itemRefs[i - 1];
        }
        if (i < validBookmarks.length - 1) {
          itemDict.Next = itemRefs[i + 1];
        }
        pdfDoc.context.assign(itemRef, pdfDoc.context.obj(itemDict));
      });

      const rootDict = pdfDoc.context.obj({
        Type: PDFName.of('Outlines'),
        First: itemRefs[0],
        Last: itemRefs[itemRefs.length - 1],
        Count: PDFNumber.of(validBookmarks.length),
      });

      pdfDoc.context.assign(outlineRootRef, rootDict);
      pdfDoc.catalog.set(PDFName.of('Outlines'), outlineRootRef);

      return await pdfDoc.save();
    } catch (err) {
      console.warn('Failed to embed bookmarks into PDF bytes:', err);
      return pdfBytes;
    }
  }
}
