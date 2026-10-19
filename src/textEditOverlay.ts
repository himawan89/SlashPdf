/**
 * textEditOverlay.ts
 * Professional interactive line-level & block-level text editor overlay for SlashPDF.
 * Features:
 *  - Coherent line & heading grouping (no word-fragmentation or awkward overlapping)
 *  - Native font style detection (Bold, Italic, Serif, Sans, Monospace)
 *  - High-fidelity WYSIWYG editing without ghosting or double-rendering
 *  - Background color sampling to eliminate leftover text artifacts
 *  - Full format bar: Font Family, Size, Bold (B), Italic (I), Center Align, Color, Background Mask
 *  - Arrow key nudging for pixel-perfect alignment
 */

export interface TextBlockData {
  id: string;
  pageIndex: number;
  str: string;
  originalStr: string;
  origX: number;
  origY: number;
  origWidth: number;
  origHeight: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  fontSize: number;
  fontFamily: string;
  baseFont: 'Helvetica' | 'Times-Roman' | 'Courier';
  pdfFont: string;
  isBold: boolean;
  isItalic: boolean;
  color: string;
  bgColor: string;
  isModified: boolean;
  isNew: boolean;
  isDeleted: boolean;
  transform: number[];
  element?: HTMLElement;
  eraseEl?: HTMLElement;
}

export interface FontOption {
  label: string;
  cssFamily: string;
  baseFont: 'Helvetica' | 'Times-Roman' | 'Courier';
  pdfFont: string;
  group: string;
}

export function resolveStandardPdfFont(
  baseFont: 'Helvetica' | 'Times-Roman' | 'Courier',
  isBold: boolean,
  isItalic: boolean
): string {
  if (baseFont === 'Times-Roman') {
    if (isBold && isItalic) return 'Times-BoldItalic';
    if (isBold) return 'Times-Bold';
    if (isItalic) return 'Times-Italic';
    return 'Times-Roman';
  }
  if (baseFont === 'Courier') {
    if (isBold && isItalic) return 'Courier-BoldOblique';
    if (isBold) return 'Courier-Bold';
    if (isItalic) return 'Courier-Oblique';
    return 'Courier';
  }
  // Helvetica (Sans-Serif)
  if (isBold && isItalic) return 'Helvetica-BoldOblique';
  if (isBold) return 'Helvetica-Bold';
  if (isItalic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

export const FONT_OPTIONS: FontOption[] = [
  // Sans-Serif
  { label: 'Arial / Helvetica', cssFamily: "Arial, Helvetica, sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica', group: 'Sans-Serif' },
  { label: 'Arial Bold', cssFamily: "Arial, Helvetica, sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica-Bold', group: 'Sans-Serif' },
  { label: 'Segoe UI', cssFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica', group: 'Sans-Serif' },
  { label: 'Roboto', cssFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica', group: 'Sans-Serif' },
  { label: 'Poppins', cssFamily: "'Poppins', Arial, sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica', group: 'Sans-Serif' },
  { label: 'Montserrat', cssFamily: "'Montserrat', Arial, sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica', group: 'Sans-Serif' },
  { label: 'Calibri', cssFamily: "Calibri, 'Segoe UI', sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica', group: 'Sans-Serif' },
  { label: 'Verdana', cssFamily: "Verdana, Geneva, sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica', group: 'Sans-Serif' },
  { label: 'Trebuchet MS', cssFamily: "'Trebuchet MS', Helvetica, sans-serif", baseFont: 'Helvetica', pdfFont: 'Helvetica', group: 'Sans-Serif' },

  // Serif
  { label: 'Times New Roman', cssFamily: "'Times New Roman', Times, serif", baseFont: 'Times-Roman', pdfFont: 'Times-Roman', group: 'Serif' },
  { label: 'Times New Roman Bold', cssFamily: "'Times New Roman', Times, serif", baseFont: 'Times-Roman', pdfFont: 'Times-Bold', group: 'Serif' },
  { label: 'Georgia', cssFamily: "Georgia, 'Times New Roman', serif", baseFont: 'Times-Roman', pdfFont: 'Times-Roman', group: 'Serif' },
  { label: 'Garamond', cssFamily: "Garamond, Baskerville, serif", baseFont: 'Times-Roman', pdfFont: 'Times-Roman', group: 'Serif' },
  { label: 'Cambria', cssFamily: "Cambria, Georgia, serif", baseFont: 'Times-Roman', pdfFont: 'Times-Roman', group: 'Serif' },

  // Monospace
  { label: 'Courier New', cssFamily: "'Courier New', Courier, monospace", baseFont: 'Courier', pdfFont: 'Courier', group: 'Monospace' },
  { label: 'Consolas', cssFamily: "Consolas, 'Courier New', monospace", baseFont: 'Courier', pdfFont: 'Courier', group: 'Monospace' },
  { label: 'Roboto Mono', cssFamily: "'Roboto Mono', Courier, monospace", baseFont: 'Courier', pdfFont: 'Courier', group: 'Monospace' },
];

export const FONT_SIZES = [7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96];

export const MAX_EDIT_PAGES = 10;

/**
 * Sample background color from rendered PDF canvas
 */
export function sampleCanvasBgColor(
  canvas: HTMLCanvasElement | null,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): string {
  if (!canvas) return '#ffffff';
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '#ffffff';
    const rect = canvas.getBoundingClientRect();
    const pixelRatioX = canvas.width / (rect.width || canvas.width || 1);
    const pixelRatioY = canvas.height / (rect.height || canvas.height || 1);

    const points = [
      { x: sx + sw / 2, y: Math.max(0, sy - 4) },
      { x: Math.max(0, sx - 4), y: sy + sh / 2 },
      { x: sx + sw / 2, y: sy + sh + 4 },
      { x: sx + sw + 4, y: sy + sh / 2 },
    ];

    for (const pt of points) {
      const px = Math.round(pt.x * pixelRatioX);
      const py = Math.round(pt.y * pixelRatioY);
      if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
        const p = ctx.getImageData(px, py, 1, 1).data;
        if (p[3] > 100) {
          const hex = `#${((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1)}`;
          return hex;
        }
      }
    }
  } catch {
    // Cross-origin fallback
  }
  return '#ffffff';
}

export class TextEditOverlay {
  private allBlocks: Map<number, TextBlockData[]> = new Map();
  private overlayLayers: Map<number, HTMLElement> = new Map();
  private pageHeights: Map<number, number> = new Map();
  private pageWidths: Map<number, number> = new Map();
  private pageScales: Map<number, number> = new Map();
  private selectedBlock: TextBlockData | null = null;
  private selectedElement: HTMLElement | null = null;
  private onSelectionChange: ((block: TextBlockData | null, el: HTMLElement | null) => void) | null = null;
  private onModifiedChange: ((count: number) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.initGlobalKeyEvents();
  }

  private initGlobalKeyEvents() {
    this.keydownHandler = (e: KeyboardEvent) => {
      if (!this.selectedBlock || !this.selectedElement) return;

      // Do not intercept if actively typing in contentEditable
      if ((this.selectedElement as any).contentEditable === 'true') return;

      const scale = this.pageScales.get(this.selectedBlock.pageIndex) ?? 1;
      const step = e.shiftKey ? 10 / scale : 1 / scale;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.nudgeSelected(-step, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.nudgeSelected(step, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.nudgeSelected(0, step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.nudgeSelected(0, -step);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelected();
      } else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.toggleBold();
      } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.toggleItalic();
      } else if (e.key === 'Escape') {
        this.deselect();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  setOnSelectionChange(fn: (block: TextBlockData | null, el: HTMLElement | null) => void) {
    this.onSelectionChange = fn;
  }

  setOnModifiedChange(fn: (count: number) => void) {
    this.onModifiedChange = fn;
  }

  /**
   * Extract words and lines from PDF page text content.
   * Groups adjacent words on the same baseline into natural, continuous text lines.
   */
  async extractPageBlocks(
    pdfDocProxy: any,
    pageIndex: number,
    canvasEl?: HTMLCanvasElement | null
  ): Promise<TextBlockData[]> {
    const page = await pdfDocProxy.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    const pageWidth = viewport.width;

    this.pageHeights.set(pageIndex, pageHeight);
    this.pageWidths.set(pageIndex, pageWidth);

    interface IntermediateItem {
      str: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
      fontName: string;
      baseFont: 'Helvetica' | 'Times-Roman' | 'Courier';
      fontFamily: string;
      isBold: boolean;
      isItalic: boolean;
      transform: number[];
    }

    const rawItems: IntermediateItem[] = [];

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const [a, b, , , e, f] = item.transform as number[];
      const fontSize = Math.max(4, Math.round(Math.sqrt(a * a + b * b)));
      const itemWidth = item.width != null && item.width > 0 ? item.width : fontSize * item.str.length * 0.55;
      const str = item.str;

      // Style & Font detection from fontName and styles dictionary
      const fontName = (item.fontName || '').toLowerCase();
      const styleFamily = (textContent.styles?.[item.fontName]?.fontFamily || '').toLowerCase();
      const combinedFontId = `${fontName} ${styleFamily}`;

      const isBold = /bold|black|heavy|w[6-9]|medium|semibold/i.test(combinedFontId);
      const isItalic = /italic|oblique|slanted/i.test(combinedFontId);

      let baseFont: 'Helvetica' | 'Times-Roman' | 'Courier' = 'Helvetica';
      let fontFamily = "'Segoe UI', Arial, Helvetica, sans-serif";

      if (/times|serif|roman|georgia|garamond|cambria|palatino|minion/i.test(combinedFontId)) {
        baseFont = 'Times-Roman';
        fontFamily = "'Times New Roman', Georgia, serif";
      } else if (/courier|mono|consolas|menlo/i.test(combinedFontId)) {
        baseFont = 'Courier';
        fontFamily = "Consolas, 'Courier New', monospace";
      }

      rawItems.push({
        str,
        x: e,
        y: f,
        width: itemWidth,
        height: fontSize * 1.3,
        fontSize,
        fontName: item.fontName,
        baseFont,
        fontFamily,
        isBold,
        isItalic,
        transform: item.transform as number[],
      });
    }

    // Sort items: Top to Bottom (descending Y in PDF), then Left to Right (ascending X)
    rawItems.sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.x - b.x;
    });

    // Group adjacent items on the same baseline into natural text blocks
    const groupedItems: IntermediateItem[] = [];
    for (const item of rawItems) {
      if (groupedItems.length === 0) {
        groupedItems.push({ ...item });
        continue;
      }

      const prev = groupedItems[groupedItems.length - 1];
      const isSameBaseline = Math.abs(prev.y - item.y) <= 3;
      const isSimilarSize = Math.abs(prev.fontSize - item.fontSize) <= 3;
      const gap = item.x - (prev.x + prev.width);
      const isAdjacent = gap >= -3 && gap <= prev.fontSize * 1.8;

      if (isSameBaseline && isSimilarSize && isAdjacent) {
        // Merge into current line
        const needsSpace = gap > prev.fontSize * 0.15 && !prev.str.endsWith(' ') && !item.str.startsWith(' ');
        prev.str = prev.str + (needsSpace ? ' ' : '') + item.str;
        prev.width = Math.max(prev.width + item.width, (item.x + item.width) - prev.x);
        prev.isBold = prev.isBold || item.isBold;
        prev.isItalic = prev.isItalic || item.isItalic;
      } else {
        groupedItems.push({ ...item });
      }
    }

    // Convert grouped items to TextBlockData
    const blocks: TextBlockData[] = [];
    for (const item of groupedItems) {
      const pdfFont = resolveStandardPdfFont(item.baseFont, item.isBold, item.isItalic);

      // Sample background color around text position if canvas is provided
      const scale = this.pageScales.get(pageIndex) || 1.0;
      const sx = item.x * scale;
      const sy = (pageHeight - item.y - item.height) * scale;
      const sw = item.width * scale;
      const sh = item.height * scale;
      const bgColor = sampleCanvasBgColor(canvasEl || null, sx, sy, sw, sh);

      blocks.push({
        id: `tb_${pageIndex}_${blocks.length}_${Math.random().toString(36).slice(2, 7)}`,
        pageIndex,
        str: item.str,
        originalStr: item.str,
        origX: item.x,
        origY: item.y,
        origWidth: item.width,
        origHeight: item.height,
        pdfX: item.x,
        pdfY: item.y,
        pdfWidth: item.width,
        pdfHeight: item.height,
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        baseFont: item.baseFont,
        pdfFont,
        isBold: item.isBold,
        isItalic: item.isItalic,
        color: '#000000',
        bgColor,
        isModified: false,
        isNew: false,
        isDeleted: false,
        transform: item.transform,
      });
    }

    return blocks;
  }

  /**
   * Create interactive overlay for a single page
   */
  createPageOverlay(
    pageWrapper: HTMLElement,
    blocks: TextBlockData[],
    pageIndex: number,
    scale: number,
    pageHeightPt: number
  ): HTMLElement {
    this.removePageOverlay(pageIndex);
    this.pageHeights.set(pageIndex, pageHeightPt);
    this.pageScales.set(pageIndex, scale);

    const overlay = document.createElement('div');
    overlay.className = 'text-edit-overlay';
    overlay.dataset.pageIndex = String(pageIndex);
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:all;z-index:15;';

    this.allBlocks.set(pageIndex, blocks);

    // Layer for erase patches
    const eraseLayer = document.createElement('div');
    eraseLayer.className = 'text-edit-erase-layer';
    eraseLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    overlay.appendChild(eraseLayer);

    for (const block of blocks) {
      if (!block.isDeleted) {
        const el = this.createBlockEl(block, scale, pageHeightPt);
        overlay.appendChild(el);
        this.updateErasePatch(block, scale, pageHeightPt);
      }
    }

    // Deselect if clicking on empty background of overlay
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay || e.target === eraseLayer) {
        this.deselect();
      }
    });

    // Double-click on empty area to add a new text block
    overlay.addEventListener('dblclick', (e) => {
      if (e.target === overlay || e.target === eraseLayer) {
        const rect = overlay.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const pdfX = clickX / scale;
        const pdfY = pageHeightPt - clickY / scale - 14;
        this.addNewBlock(pageIndex, Math.max(10, pdfX), Math.max(10, pdfY));
      }
    });

    pageWrapper.style.position = 'relative';
    pageWrapper.appendChild(overlay);
    this.overlayLayers.set(pageIndex, overlay);
    return overlay;
  }

  private createBlockEl(block: TextBlockData, scale: number, pageHeightPt: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'text-block';
    if (block.isModified) el.classList.add('text-block-modified');
    el.dataset.blockId = block.id;
    (el as any).contentEditable = 'false';
    el.textContent = block.str;

    this.applyBlockStyle(el, block, scale, pageHeightPt);

    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.select(block, el);
    });

    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.startEditing(block, el);
    });

    this.makeDraggable(el, block, scale, pageHeightPt);
    block.element = el;
    return el;
  }

  private applyBlockStyle(el: HTMLElement, block: TextBlockData, scale: number, pageHeightPt: number) {
    const sx = block.pdfX * scale;
    const sy = (pageHeightPt - block.pdfY - block.pdfHeight) * scale;
    const sf = block.fontSize * scale;
    const minW = Math.max(8, (block.origWidth || block.pdfWidth) * scale);

    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.fontSize = `${sf}px`;
    el.style.fontFamily = block.fontFamily;
    el.style.fontWeight = block.isBold ? 'bold' : 'normal';
    el.style.fontStyle = block.isItalic ? 'italic' : 'normal';
    el.style.minWidth = `${minW}px`;
    el.style.setProperty('--block-color', block.color || '#000000');
    el.style.setProperty('--block-bg', block.bgColor || '#ffffff');
  }

  /**
   * Maintain an erase patch at original coordinates to hide old canvas text seamlessly
   */
  updateErasePatch(block: TextBlockData, scale?: number, pageHeightPt?: number) {
    const pi = block.pageIndex;
    const s = scale ?? (this.pageScales.get(pi) || 1.0);
    const ph = pageHeightPt ?? (this.pageHeights.get(pi) || 841.89);

    if (block.isNew || !block.isModified || block.isDeleted) {
      if (block.eraseEl) {
        block.eraseEl.remove();
        block.eraseEl = undefined;
      }
      return;
    }

    const descentPad = Math.max(4, block.fontSize * 0.38);
    const ascentPad = Math.max(4, block.fontSize * 0.28);
    const hPad = Math.max(3, block.fontSize * 0.15);

    const rX = Math.max(0, block.origX - hPad);
    const rY = Math.max(0, block.origY - descentPad);
    const rW = block.origWidth + hPad * 2;
    const rH = block.origHeight + descentPad + ascentPad;

    const sx = rX * s;
    const sy = (ph - (rY + rH)) * s;
    const sw = rW * s;
    const sh = rH * s;

    const overlay = this.overlayLayers.get(pi);
    if (!overlay) return;

    let eraseLayer = overlay.querySelector('.text-edit-erase-layer');
    if (!eraseLayer) {
      eraseLayer = document.createElement('div');
      eraseLayer.className = 'text-edit-erase-layer';
      (eraseLayer as HTMLElement).style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
      overlay.prepend(eraseLayer);
    }

    if (!block.eraseEl) {
      block.eraseEl = document.createElement('div');
      block.eraseEl.className = 'text-edit-erase-patch';
      eraseLayer.appendChild(block.eraseEl);
    }

    block.eraseEl.style.cssText = `position:absolute;left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px;background-color:${block.bgColor || '#ffffff'};pointer-events:none;z-index:6;border-radius:2px;`;
  }

  private makeDraggable(el: HTMLElement, block: TextBlockData, scale: number, pageHeightPt: number) {
    let dragging = false;
    let mx0 = 0, my0 = 0, sl0 = 0, st0 = 0;

    const onDown = (e: MouseEvent) => {
      if ((el as any).contentEditable === 'true' || e.button !== 0) return;
      dragging = true;
      mx0 = e.clientX;
      my0 = e.clientY;
      sl0 = parseFloat(el.style.left) || 0;
      st0 = parseFloat(el.style.top) || 0;
      el.style.cursor = 'grabbing';
      el.style.zIndex = '40';
      e.preventDefault();
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const nl = sl0 + (e.clientX - mx0);
      const nt = st0 + (e.clientY - my0);
      el.style.left = `${nl}px`;
      el.style.top = `${nt}px`;
      block.pdfX = nl / scale;
      block.pdfY = pageHeightPt - nt / scale - block.pdfHeight;
      block.isModified = true;
      el.classList.add('text-block-modified');
      this.updateErasePatch(block, scale, pageHeightPt);
      this.notifyModified();
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = 'pointer';
      el.style.zIndex = '';
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    (el as any)._cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }

  private select(block: TextBlockData, el: HTMLElement) {
    if (this.selectedElement && this.selectedElement !== el) {
      this.selectedElement.classList.remove('text-block-selected');
      if ((this.selectedElement as any).contentEditable === 'true') {
        this.finishEditing(this.selectedBlock!, this.selectedElement);
      }
    }
    this.selectedBlock = block;
    this.selectedElement = el;
    el.classList.add('text-block-selected');
    this.onSelectionChange?.(block, el);
  }

  deselect() {
    if (this.selectedElement) {
      this.selectedElement.classList.remove('text-block-selected');
      if ((this.selectedElement as any).contentEditable === 'true') {
        this.finishEditing(this.selectedBlock!, this.selectedElement);
      }
    }
    this.selectedBlock = null;
    this.selectedElement = null;
    this.onSelectionChange?.(null, null);
  }

  private startEditing(block: TextBlockData, el: HTMLElement) {
    (el as any).contentEditable = 'true';
    el.classList.add('text-block-editing');
    el.focus();

    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    el.onblur = () => this.finishEditing(block, el);
    el.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        el.textContent = block.str;
        el.blur();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        el.blur();
      }
    };
  }

  private finishEditing(block: TextBlockData, el: HTMLElement) {
    (el as any).contentEditable = 'false';
    el.classList.remove('text-block-editing');
    el.onblur = null;
    el.onkeydown = null;

    const newStr = el.textContent ?? '';
    if (newStr !== block.str) {
      block.str = newStr;
      block.isModified = true;
      el.classList.add('text-block-modified');

      const pi = block.pageIndex;
      const scale = this.pageScales.get(pi) || 1.0;
      const ph = this.pageHeights.get(pi) || 841.89;

      // Update calculated dimensions
      block.pdfWidth = Math.max(block.origWidth, (el.offsetWidth || 40) / scale);
      this.updateErasePatch(block, scale, ph);
      this.notifyModified();
    }
  }

  applyFont(opt: FontOption) {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.fontFamily = opt.cssFamily;
    this.selectedBlock.baseFont = opt.baseFont;
    this.selectedBlock.pdfFont = resolveStandardPdfFont(
      opt.baseFont,
      this.selectedBlock.isBold,
      this.selectedBlock.isItalic
    );
    this.selectedElement.style.fontFamily = opt.cssFamily;
    this.selectedBlock.isModified = true;
    this.selectedElement.classList.add('text-block-modified');
    this.updateErasePatch(this.selectedBlock);
    this.notifyModified();
    this.onSelectionChange?.(this.selectedBlock, this.selectedElement);
  }

  toggleBold() {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.isBold = !this.selectedBlock.isBold;
    this.selectedBlock.pdfFont = resolveStandardPdfFont(
      this.selectedBlock.baseFont,
      this.selectedBlock.isBold,
      this.selectedBlock.isItalic
    );
    this.selectedElement.style.fontWeight = this.selectedBlock.isBold ? 'bold' : 'normal';
    this.selectedBlock.isModified = true;
    this.selectedElement.classList.add('text-block-modified');
    this.updateErasePatch(this.selectedBlock);
    this.notifyModified();
    this.onSelectionChange?.(this.selectedBlock, this.selectedElement);
  }

  toggleItalic() {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.isItalic = !this.selectedBlock.isItalic;
    this.selectedBlock.pdfFont = resolveStandardPdfFont(
      this.selectedBlock.baseFont,
      this.selectedBlock.isBold,
      this.selectedBlock.isItalic
    );
    this.selectedElement.style.fontStyle = this.selectedBlock.isItalic ? 'italic' : 'normal';
    this.selectedBlock.isModified = true;
    this.selectedElement.classList.add('text-block-modified');
    this.updateErasePatch(this.selectedBlock);
    this.notifyModified();
    this.onSelectionChange?.(this.selectedBlock, this.selectedElement);
  }

  applyFontSize(size: number) {
    if (!this.selectedBlock || !this.selectedElement) return;
    const pi = this.selectedBlock.pageIndex;
    const scale = this.pageScales.get(pi) ?? 1;
    const pageH = this.pageHeights.get(pi) ?? 841.89;

    this.selectedBlock.fontSize = size;
    this.selectedBlock.pdfHeight = size * 1.3;
    this.selectedElement.style.fontSize = `${size * scale}px`;

    const nt = (pageH - this.selectedBlock.pdfY - this.selectedBlock.pdfHeight) * scale;
    this.selectedElement.style.top = `${nt}px`;
    this.selectedBlock.isModified = true;
    this.selectedElement.classList.add('text-block-modified');
    this.updateErasePatch(this.selectedBlock, scale, pageH);
    this.notifyModified();
  }

  applyColor(color: string) {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.color = color;
    this.selectedElement.style.setProperty('--block-color', color);
    this.selectedBlock.isModified = true;
    this.selectedElement.classList.add('text-block-modified');
    this.notifyModified();
  }

  applyBgColor(color: string) {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.bgColor = color;
    this.selectedElement.style.setProperty('--block-bg', color);
    this.selectedBlock.isModified = true;
    this.selectedElement.classList.add('text-block-modified');
    this.updateErasePatch(this.selectedBlock);
    this.notifyModified();
  }

  alignCenter(pageWidthPt?: number) {
    if (!this.selectedBlock || !this.selectedElement) return;
    const pi = this.selectedBlock.pageIndex;
    const scale = this.pageScales.get(pi) ?? 1;
    const pw = pageWidthPt ?? (this.pageWidths.get(pi) || 595.28);

    const blockWidth = this.selectedElement.offsetWidth / scale || this.selectedBlock.origWidth;
    const centeredX = Math.max(10, (pw - blockWidth) / 2);

    this.selectedBlock.pdfX = centeredX;
    this.selectedElement.style.left = `${centeredX * scale}px`;
    this.selectedBlock.isModified = true;
    this.selectedElement.classList.add('text-block-modified');
    this.updateErasePatch(this.selectedBlock);
    this.notifyModified();
  }

  nudgeSelected(dxPt: number, dyPt: number) {
    if (!this.selectedBlock || !this.selectedElement) return;
    const pi = this.selectedBlock.pageIndex;
    const scale = this.pageScales.get(pi) ?? 1;
    const pageH = this.pageHeights.get(pi) ?? 841.89;

    this.selectedBlock.pdfX += dxPt;
    this.selectedBlock.pdfY += dyPt;

    const sx = this.selectedBlock.pdfX * scale;
    const sy = (pageH - this.selectedBlock.pdfY - this.selectedBlock.pdfHeight) * scale;

    this.selectedElement.style.left = `${sx}px`;
    this.selectedElement.style.top = `${sy}px`;
    this.selectedBlock.isModified = true;
    this.selectedElement.classList.add('text-block-modified');
    this.updateErasePatch(this.selectedBlock, scale, pageH);
    this.notifyModified();
  }

  duplicateSelected(): TextBlockData | null {
    if (!this.selectedBlock) return null;
    const b = this.selectedBlock;
    const scale = this.pageScales.get(b.pageIndex) ?? 1;
    const pageHeightPt = this.pageHeights.get(b.pageIndex) ?? 841.89;

    const newBlock: TextBlockData = {
      ...b,
      id: `tb_dup_${b.pageIndex}_${Date.now()}`,
      origX: b.pdfX + 15,
      origY: b.pdfY - 15,
      pdfX: b.pdfX + 15,
      pdfY: b.pdfY - 15,
      isModified: true,
      isNew: true,
      isDeleted: false,
      element: undefined,
      eraseEl: undefined,
    };

    const overlay = this.overlayLayers.get(b.pageIndex);
    if (overlay) {
      const el = this.createBlockEl(newBlock, scale, pageHeightPt);
      overlay.appendChild(el);
      const blocks = this.allBlocks.get(b.pageIndex) ?? [];
      blocks.push(newBlock);
      this.allBlocks.set(b.pageIndex, blocks);
      this.select(newBlock, el);
    }
    this.notifyModified();
    return newBlock;
  }

  deleteSelected() {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.isDeleted = true;
    this.selectedBlock.isModified = true;
    this.selectedElement.style.display = 'none';

    // Maintain erase patch if it was an existing block so the original canvas text stays erased!
    this.updateErasePatch(this.selectedBlock);

    this.selectedBlock = null;
    this.selectedElement = null;
    this.onSelectionChange?.(null, null);
    this.notifyModified();
  }

  addNewBlock(pageIndex: number, pdfX: number, pdfY: number): TextBlockData {
    const scale = this.pageScales.get(pageIndex) ?? 1;
    const pageHeightPt = this.pageHeights.get(pageIndex) ?? 841.89;
    const block: TextBlockData = {
      id: `tb_new_${pageIndex}_${Date.now()}`,
      pageIndex,
      str: 'New Text',
      originalStr: '',
      origX: pdfX,
      origY: pdfY,
      origWidth: 80,
      origHeight: 14 * 1.3,
      pdfX,
      pdfY,
      pdfWidth: 80,
      pdfHeight: 14 * 1.3,
      fontSize: 14,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      baseFont: 'Helvetica',
      pdfFont: 'Helvetica',
      isBold: false,
      isItalic: false,
      color: '#000000',
      bgColor: '#ffffff',
      isModified: true,
      isNew: true,
      isDeleted: false,
      transform: [14, 0, 0, 14, pdfX, pdfY],
    };

    const overlay = this.overlayLayers.get(pageIndex);
    if (overlay) {
      const el = this.createBlockEl(block, scale, pageHeightPt);
      overlay.appendChild(el);
      const blocks = this.allBlocks.get(pageIndex) ?? [];
      blocks.push(block);
      this.allBlocks.set(pageIndex, blocks);
      this.select(block, el);
      setTimeout(() => this.startEditing(block, el), 40);
    }
    this.notifyModified();
    return block;
  }

  getSelectedBlock(): TextBlockData | null {
    return this.selectedBlock;
  }

  getPageBlocks(pageIndex: number): TextBlockData[] | undefined {
    return this.allBlocks.get(pageIndex);
  }

  getModifiedBlocks(): TextBlockData[] {
    return [...this.allBlocks.values()].flat().filter((b) => b.isModified);
  }

  hasChanges(): boolean {
    return this.getModifiedBlocks().length > 0;
  }

  private notifyModified() {
    const count = this.getModifiedBlocks().length;
    this.onModifiedChange?.(count);
  }

  removePageOverlay(pageIndex: number) {
    const el = this.overlayLayers.get(pageIndex);
    if (el) {
      el.querySelectorAll('.text-block').forEach((b) => (b as any)._cleanup?.());
      el.remove();
      this.overlayLayers.delete(pageIndex);
      this.allBlocks.delete(pageIndex);
      this.pageHeights.delete(pageIndex);
      this.pageWidths.delete(pageIndex);
      this.pageScales.delete(pageIndex);
    }
  }

  destroy() {
    this.deselect();
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    for (const pi of [...this.overlayLayers.keys()]) {
      this.removePageOverlay(pi);
    }
  }
}
