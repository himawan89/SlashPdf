/**
 * textEditOverlay.ts
 * Interactive word-level and block-level text editor overlay for SlashPDF.
 * Allows selecting, moving, formatting (MS Office & Google fonts, size, color),
 * editing, adding, and deleting text blocks across PDF pages.
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
  pdfFont: string;
  color: string;
  isModified: boolean;
  isNew: boolean;
  isDeleted: boolean;
  transform: number[];
  element?: HTMLElement;
}

export interface FontOption {
  label: string;
  cssFamily: string;
  pdfFont: string;
  group: string;
}

export const FONT_OPTIONS: FontOption[] = [
  // Google Fonts
  { label: 'Roboto', cssFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif", pdfFont: 'Helvetica', group: 'Google Fonts' },
  { label: 'Roboto Bold', cssFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif", pdfFont: 'HelveticaBold', group: 'Google Fonts' },
  { label: 'Open Sans', cssFamily: "'Open Sans', Arial, sans-serif", pdfFont: 'Helvetica', group: 'Google Fonts' },
  { label: 'Lato', cssFamily: "'Lato', Arial, sans-serif", pdfFont: 'Helvetica', group: 'Google Fonts' },
  { label: 'Montserrat', cssFamily: "'Montserrat', Arial, sans-serif", pdfFont: 'Helvetica', group: 'Google Fonts' },
  { label: 'Poppins', cssFamily: "'Poppins', Arial, sans-serif", pdfFont: 'Helvetica', group: 'Google Fonts' },
  { label: 'Merriweather', cssFamily: "'Merriweather', Georgia, serif", pdfFont: 'TimesRoman', group: 'Google Fonts' },
  { label: 'Roboto Mono', cssFamily: "'Roboto Mono', Courier, monospace", pdfFont: 'Courier', group: 'Google Fonts' },

  // MS Office - Sans-Serif
  { label: 'Aptos (MS Office)', cssFamily: "'Aptos', 'Segoe UI', Arial, sans-serif", pdfFont: 'Helvetica', group: 'MS Office' },
  { label: 'Calibri (MS Office)', cssFamily: "Calibri, 'Gill Sans', 'Segoe UI', sans-serif", pdfFont: 'Helvetica', group: 'MS Office' },
  { label: 'Calibri Bold', cssFamily: "Calibri, 'Gill Sans', 'Segoe UI', sans-serif", pdfFont: 'HelveticaBold', group: 'MS Office' },
  { label: 'Arial', cssFamily: "Arial, Helvetica, sans-serif", pdfFont: 'Helvetica', group: 'MS Office' },
  { label: 'Arial Bold', cssFamily: "Arial, Helvetica, sans-serif", pdfFont: 'HelveticaBold', group: 'MS Office' },
  { label: 'Arial Italic', cssFamily: "Arial, Helvetica, sans-serif", pdfFont: 'HelveticaOblique', group: 'MS Office' },
  { label: 'Segoe UI', cssFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", pdfFont: 'Helvetica', group: 'MS Office' },
  { label: 'Verdana', cssFamily: "Verdana, Geneva, Tahoma, sans-serif", pdfFont: 'Helvetica', group: 'MS Office' },
  { label: 'Tahoma', cssFamily: "Tahoma, Geneva, sans-serif", pdfFont: 'Helvetica', group: 'MS Office' },
  { label: 'Trebuchet MS', cssFamily: "'Trebuchet MS', Helvetica, sans-serif", pdfFont: 'Helvetica', group: 'MS Office' },
  { label: 'Century Gothic', cssFamily: "'Century Gothic', AppleGothic, sans-serif", pdfFont: 'Helvetica', group: 'MS Office' },

  // MS Office - Serif
  { label: 'Times New Roman', cssFamily: "'Times New Roman', Times, serif", pdfFont: 'TimesRoman', group: 'Serif' },
  { label: 'Times New Roman Bold', cssFamily: "'Times New Roman', Times, serif", pdfFont: 'TimesRomanBold', group: 'Serif' },
  { label: 'Times New Roman Italic', cssFamily: "'Times New Roman', Times, serif", pdfFont: 'TimesRomanItalic', group: 'Serif' },
  { label: 'Georgia', cssFamily: "Georgia, 'Times New Roman', serif", pdfFont: 'TimesRoman', group: 'Serif' },
  { label: 'Cambria', cssFamily: "Cambria, 'Hoefler Text', Georgia, serif", pdfFont: 'TimesRoman', group: 'Serif' },
  { label: 'Garamond', cssFamily: "Garamond, Baskerville, serif", pdfFont: 'TimesRoman', group: 'Serif' },
  { label: 'Palatino', cssFamily: "'Palatino Linotype', Palatino, serif", pdfFont: 'TimesRoman', group: 'Serif' },

  // Monospace
  { label: 'Consolas (MS Office)', cssFamily: "Consolas, 'Courier New', monospace", pdfFont: 'Courier', group: 'Monospace' },
  { label: 'Courier New', cssFamily: "'Courier New', Courier, monospace", pdfFont: 'Courier', group: 'Monospace' },
  { label: 'Courier New Bold', cssFamily: "'Courier New', Courier, monospace", pdfFont: 'CourierBold', group: 'Monospace' },
  { label: 'Lucida Console', cssFamily: "'Lucida Console', Monaco, monospace", pdfFont: 'Courier', group: 'Monospace' },
];

export const FONT_SIZES = [7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96];

export const MAX_EDIT_PAGES = 10;

export class TextEditOverlay {
  private allBlocks: Map<number, TextBlockData[]> = new Map();
  private overlayLayers: Map<number, HTMLElement> = new Map();
  private pageHeights: Map<number, number> = new Map();
  private pageScales: Map<number, number> = new Map();
  private selectedBlock: TextBlockData | null = null;
  private selectedElement: HTMLElement | null = null;
  private onSelectionChange: ((block: TextBlockData | null, el: HTMLElement | null) => void) | null = null;
  private onModifiedChange: ((count: number) => void) | null = null;

  setOnSelectionChange(fn: (block: TextBlockData | null, el: HTMLElement | null) => void) {
    this.onSelectionChange = fn;
  }

  setOnModifiedChange(fn: (count: number) => void) {
    this.onModifiedChange = fn;
  }

  /**
   * Extract words and lines from PDF page text content.
   * Splits text into individual words so each word acts as an interactive text block.
   */
  async extractPageBlocks(pdfDocProxy: any, pageIndex: number): Promise<TextBlockData[]> {
    const page = await pdfDocProxy.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    void pageHeight;

    const blocks: TextBlockData[] = [];

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const [a, b, , , e, f] = item.transform as number[];
      const fontSize = Math.max(4, Math.round(Math.sqrt(a * a + b * b)));
      const itemWidth = item.width != null && item.width > 0 ? item.width : fontSize * item.str.length * 0.55;
      const str = item.str;

      // Split into word tokens
      const wordRegex = /\S+/g;
      let match: RegExpExecArray | null;
      let hasWords = false;

      while ((match = wordRegex.exec(str)) !== null) {
        hasWords = true;
        const word = match[0];
        const charIdx = match.index;
        const charWidth = str.length > 0 ? itemWidth / str.length : fontSize * 0.55;
        const wordX = e + charIdx * charWidth;
        const wordW = Math.max(8, word.length * charWidth);
        const wordH = fontSize * 1.3;

        blocks.push({
          id: `tb_${pageIndex}_${blocks.length}_${Math.random().toString(36).slice(2, 7)}`,
          pageIndex,
          str: word,
          originalStr: word,
          origX: wordX,
          origY: f,
          origWidth: wordW,
          origHeight: wordH,
          pdfX: wordX,
          pdfY: f,
          pdfWidth: wordW,
          pdfHeight: wordH,
          fontSize,
          fontFamily: 'Arial, Helvetica, sans-serif',
          pdfFont: 'Helvetica',
          color: '#000000',
          isModified: false,
          isNew: false,
          isDeleted: false,
          transform: [fontSize, 0, 0, fontSize, wordX, f],
        });
      }

      if (!hasWords && str.trim()) {
        const wordW = Math.max(8, itemWidth);
        const wordH = fontSize * 1.3;
        blocks.push({
          id: `tb_${pageIndex}_${blocks.length}_${Math.random().toString(36).slice(2, 7)}`,
          pageIndex,
          str: str,
          originalStr: str,
          origX: e,
          origY: f,
          origWidth: wordW,
          origHeight: wordH,
          pdfX: e,
          pdfY: f,
          pdfWidth: wordW,
          pdfHeight: wordH,
          fontSize,
          fontFamily: 'Arial, Helvetica, sans-serif',
          pdfFont: 'Helvetica',
          color: '#000000',
          isModified: false,
          isNew: false,
          isDeleted: false,
          transform: item.transform as number[],
        });
      }
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

    for (const block of blocks) {
      if (!block.isDeleted) {
        overlay.appendChild(this.createBlockEl(block, scale, pageHeightPt));
      }
    }

    // Deselect if clicking on empty background of overlay
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        this.deselect();
      }
    });

    // Double-click on empty area to add a new text block
    overlay.addEventListener('dblclick', (e) => {
      if (e.target === overlay) {
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
    el.style.cssText = `position:absolute;left:${sx}px;top:${sy}px;font-size:${sf}px;font-family:${block.fontFamily};color:${block.color};white-space:pre;line-height:1.2;padding:0 2px;border:1px dashed transparent;border-radius:2px;cursor:pointer;pointer-events:all;user-select:none;box-sizing:border-box;min-width:6px;`;
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
      el.style.zIndex = '30';
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
    el.style.cursor = 'text';
    el.style.userSelect = 'text';
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
    el.style.cursor = 'pointer';
    el.style.userSelect = 'none';
    el.onblur = null;
    el.onkeydown = null;

    const newStr = el.textContent ?? '';
    if (newStr !== block.str) {
      block.str = newStr;
      block.isModified = true;
      this.notifyModified();
    }
  }

  applyFont(opt: FontOption) {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.fontFamily = opt.cssFamily;
    this.selectedBlock.pdfFont = opt.pdfFont;
    this.selectedElement.style.fontFamily = opt.cssFamily;
    this.selectedBlock.isModified = true;
    this.notifyModified();
  }

  applyFontSize(size: number) {
    if (!this.selectedBlock || !this.selectedElement) return;
    const pi = this.selectedBlock.pageIndex;
    const scale = this.pageScales.get(pi) ?? 1;
    const pageH = this.pageHeights.get(pi) ?? 841;

    this.selectedBlock.fontSize = size;
    this.selectedBlock.pdfHeight = size * 1.3;
    this.selectedElement.style.fontSize = `${size * scale}px`;

    const nt = (pageH - this.selectedBlock.pdfY - this.selectedBlock.pdfHeight) * scale;
    this.selectedElement.style.top = `${nt}px`;
    this.selectedBlock.isModified = true;
    this.notifyModified();
  }

  applyColor(color: string) {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.color = color;
    this.selectedElement.style.color = color;
    this.selectedBlock.isModified = true;
    this.notifyModified();
  }

  deleteSelected() {
    if (!this.selectedBlock || !this.selectedElement) return;
    this.selectedBlock.isDeleted = true;
    this.selectedBlock.isModified = true;
    this.selectedElement.remove();
    this.selectedBlock.element = undefined;
    this.selectedBlock = null;
    this.selectedElement = null;
    this.onSelectionChange?.(null, null);
    this.notifyModified();
  }

  addNewBlock(pageIndex: number, pdfX: number, pdfY: number): TextBlockData {
    const scale = this.pageScales.get(pageIndex) ?? 1;
    const pageHeightPt = this.pageHeights.get(pageIndex) ?? 841;
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
      pdfFont: 'Helvetica',
      color: '#000000',
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
      this.pageScales.delete(pageIndex);
    }
  }

  destroy() {
    this.deselect();
    for (const pi of [...this.overlayLayers.keys()]) {
      this.removePageOverlay(pi);
    }
  }
}
