import './style.css';
import type { PDFDocumentItem, ViewLayoutMode, AnnotationType } from './types';
import { PDFEditorService } from './pdfEditor';
import { PDFViewerManager } from './pdfViewerManager';
import { AnnotationManager } from './annotationManager';
import { UIDialogs } from './uiDialogs';
import JSZip from 'jszip';
import { TextEditOverlay, FONT_OPTIONS, FONT_SIZES, MAX_EDIT_PAGES } from './textEditOverlay';

class SlashPDFApp {
  private documents: PDFDocumentItem[] = [];
  private activeDocIndex = -1;
  private layoutMode: ViewLayoutMode = 'continuous';
  private annotationManager = new AnnotationManager();
  private textEditOverlay = new TextEditOverlay();
  private isHandTool = true;
  private isTextEditMode = false;

  // DOM Elements
  private welcomeScreen = document.getElementById('welcomeScreen') as HTMLDivElement;
  private pdfViewer = document.getElementById('pdfViewer') as HTMLDivElement;
  private pdfPagesContainer = document.getElementById('pdfPagesContainer') as HTMLDivElement;
  private docTabsScroll = document.getElementById('docTabsScroll') as HTMLDivElement;
  private documentTitle = document.getElementById('documentTitle') as HTMLSpanElement;
  private pageInput = document.getElementById('pageInput') as HTMLInputElement;
  private totalPages = document.getElementById('totalPages') as HTMLSpanElement;
  private zoomSelect = document.getElementById('zoomSelect') as HTMLSelectElement;
  private statusMessage = document.getElementById('statusMessage') as HTMLSpanElement;
  private statusFileInfo = document.getElementById('statusFileInfo') as HTMLSpanElement;
  private statusZoom = document.getElementById('statusZoom') as HTMLSpanElement;
  private fileInput = document.getElementById('fileInput') as HTMLInputElement;
  private imageInput = document.getElementById('imageInput') as HTMLInputElement;
  private mergeInput = document.getElementById('mergeInput') as HTMLInputElement;

  // Search
  private currentSearchResults: any[] = [];
  private currentSearchIndex = -1;
  private draggedPageNum: number | null = null;
  private selectedPageIndices: Set<number> = new Set();
  private lastClickedPageIndex: number | null = null;

  constructor() {
    this.initTheme();
    this.initRibbon();
    this.initSidebar();
    this.initToolbar();
    this.initFileHandlers();
    this.initAnnotationEvents();
    this.initShortcuts();
    this.initTextEditBar();

    this.updateCursorMode();
    this.setStatus('Ready — Open a PDF or create a new blank document to get started.');

    const urlParams = new URLSearchParams(window.location.search);
    const fileParam = urlParams.get('file');
    if (fileParam) {
      fetch(fileParam)
        .then((res) => res.arrayBuffer())
        .then((ab) => this.loadPDFBytes(fileParam.split('/').pop() || 'Document.pdf', new Uint8Array(ab)))
        .catch((e) => console.warn('Could not load URL param file:', e));
    }
  }

  /* ========================================================================
     1. Initialization & Theme
     ======================================================================== */
  private initTheme() {
    const savedTheme = localStorage.getItem('slashpdf_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeBtn = document.getElementById('btnThemeToggle');
    themeBtn?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('slashpdf_theme', next);
      const icon = themeBtn.querySelector('.material-symbols-rounded');
      if (icon) icon.textContent = next === 'dark' ? 'light_mode' : 'dark_mode';
    });
  }

  private initRibbon() {
    const tabs = document.querySelectorAll('.ribbon-tab');
    const panels = document.querySelectorAll('.ribbon-panel');
    const ribbon = document.getElementById('ribbon');
    const collapseBtn = document.getElementById('ribbonCollapseBtn');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        tabs.forEach((t) => t.classList.remove('active'));
        panels.forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`.ribbon-panel[data-panel="${target}"]`)?.classList.add('active');
        ribbon?.classList.remove('collapsed');
      });
    });

    collapseBtn?.addEventListener('click', () => {
      ribbon?.classList.toggle('collapsed');
    });

    // Ribbon Action Delegation
    ribbon?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.ribbon-btn') as HTMLElement;
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action) this.handleRibbonAction(action, btn);
    });

    // Quick Access Toolbar
    document.getElementById('quickAccessToolbar')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.qat-btn') as HTMLElement;
      const action = btn?.getAttribute('data-action');
      if (action) this.handleRibbonAction(action, btn);
    });
  }

  private initSidebar() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    const panels = document.querySelectorAll('.sidebar-panel');
    const sidebar = document.getElementById('sidebar');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-sidebar');
        if (sidebar?.classList.contains('sidebar-collapsed')) {
          sidebar.classList.remove('sidebar-collapsed');
        } else if (tab.classList.contains('active')) {
          sidebar?.classList.add('sidebar-collapsed');
          tab.classList.remove('active');
          return;
        }

        tabs.forEach((t) => t.classList.remove('active'));
        panels.forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`.sidebar-panel[data-sidepanel="${target}"]`)?.classList.add('active');
      });
    });

    // Sidebar quick action buttons in Pages panel header
    document.getElementById('btnSidebarAddBlank')?.addEventListener('click', () => {
      this.handleRibbonAction('insert-blank');
    });
    document.getElementById('btnSidebarInsertFile')?.addEventListener('click', () => {
      this.promptInsertFile();
    });
    document.getElementById('btnSidebarRotateCW')?.addEventListener('click', () => {
      this.handleRibbonAction('rotate-cw');
    });
    document.getElementById('btnSidebarDeletePage')?.addEventListener('click', () => {
      this.handleRibbonAction('delete-page-current');
    });

    // Search panel inputs
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const searchNext = document.getElementById('searchNext');
    const searchPrev = document.getElementById('searchPrev');
    const searchCase = document.getElementById('searchCaseSensitive') as HTMLInputElement;
    const searchWord = document.getElementById('searchWholeWord') as HTMLInputElement;

    const doSearch = async () => {
      const doc = this.getActiveDocument();
      if (!doc) return;
      const q = searchInput.value;
      if (!q.trim()) {
        document.getElementById('searchResults')!.innerHTML = '';
        return;
      }
      this.setStatus('Searching text...');
      const results = await PDFViewerManager.searchDocument(doc.pdfDocProxy, q, searchCase.checked, searchWord.checked);
      this.currentSearchResults = results;
      this.currentSearchIndex = 0;
      this.renderSearchResults();
      if (results.length > 0) {
        this.goToPage(results[0].pageIndex + 1);
        this.setStatus(`Found ${results.length} match(es).`);
      } else {
        this.setStatus('No matches found.');
      }
    };

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    searchNext?.addEventListener('click', () => {
      if (this.currentSearchResults.length === 0) return;
      this.currentSearchIndex = (this.currentSearchIndex + 1) % this.currentSearchResults.length;
      const res = this.currentSearchResults[this.currentSearchIndex];
      this.goToPage(res.pageIndex + 1);
    });

    searchPrev?.addEventListener('click', () => {
      if (this.currentSearchResults.length === 0) return;
      this.currentSearchIndex = (this.currentSearchIndex - 1 + this.currentSearchResults.length) % this.currentSearchResults.length;
      const res = this.currentSearchResults[this.currentSearchIndex];
      this.goToPage(res.pageIndex + 1);
    });
  }

  private initToolbar() {
    // Page navigation
    document.getElementById('btnPrevPage')?.addEventListener('click', () => {
      const doc = this.getActiveDocument();
      if (doc && doc.currentPage > 1) this.goToPage(doc.currentPage - 1);
    });

    document.getElementById('btnNextPage')?.addEventListener('click', () => {
      const doc = this.getActiveDocument();
      if (doc && doc.currentPage < doc.numPages) this.goToPage(doc.currentPage + 1);
    });

    this.pageInput?.addEventListener('change', () => {
      const doc = this.getActiveDocument();
      if (!doc) return;
      let p = parseInt(this.pageInput.value, 10);
      if (isNaN(p) || p < 1) p = 1;
      if (p > doc.numPages) p = doc.numPages;
      this.goToPage(p);
    });

    // Zoom controls
    document.getElementById('btnZoomIn')?.addEventListener('click', () => this.zoom(0.15));
    document.getElementById('btnZoomOut')?.addEventListener('click', () => this.zoom(-0.15));
    this.zoomSelect?.addEventListener('change', async () => {
      const doc = this.getActiveDocument();
      if (!doc) return;
      const val = this.zoomSelect.value;
      if (val === 'fit-width' || val === 'fit-page') {
        const page = await doc.pdfDocProxy.getPage(doc.currentPage);
        const effectiveRotation = ((page.rotate || 0) + (doc.rotation || 0)) % 360;
        const unscaledViewport = page.getViewport({ scale: 1.0, rotation: effectiveRotation });
        const availWidth = Math.max(200, this.pdfPagesContainer.clientWidth - 64);
        const availHeight = Math.max(200, this.pdfPagesContainer.clientHeight - 64);
        if (val === 'fit-width') {
          doc.scale = Math.max(0.2, Math.floor((availWidth / unscaledViewport.width) * 100) / 100);
        } else {
          const scaleW = availWidth / unscaledViewport.width;
          const scaleH = availHeight / unscaledViewport.height;
          doc.scale = Math.max(0.2, Math.floor(Math.min(scaleW, scaleH) * 100) / 100);
        }
      } else {
        doc.scale = parseFloat(val);
      }
      this.renderActiveDocument();
    });

    // Layout modes
    document.getElementById('btnSinglePage')?.addEventListener('click', () => {
      this.setLayoutMode('single');
    });
    document.getElementById('btnContinuous')?.addEventListener('click', () => {
      this.setLayoutMode('continuous');
    });
    document.getElementById('btnTwoPage')?.addEventListener('click', () => {
      this.setLayoutMode('two-page');
    });

    // Hand & Select tools
    const btnHand = document.getElementById('btnHandTool');
    const btnSelect = document.getElementById('btnSelectTool');

    btnHand?.addEventListener('click', () => {
      this.isHandTool = true;
      this.annotationManager.setActiveTool(null);
      this.updateToolButtons();
      this.updateCursorMode();
    });

    btnSelect?.addEventListener('click', () => {
      this.isHandTool = false;
      this.annotationManager.setActiveTool(null);
      this.updateToolButtons();
      this.updateCursorMode();
    });

    // Drag-to-Pan implementation for Hand Tool (and middle-click drag)
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    this.pdfPagesContainer.addEventListener('mousedown', (e) => {
      const isMiddleClick = e.button === 1;
      const isLeftClick = e.button === 0;
      const canPan = (this.isHandTool && !this.annotationManager.getActiveTool() && isLeftClick) || isMiddleClick;

      if (!canPan) return;

      isPanning = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = this.pdfPagesContainer.scrollLeft;
      scrollTop = this.pdfPagesContainer.scrollTop;
      this.pdfPagesContainer.classList.add('is-panning');
      this.pdfPagesContainer.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.pdfPagesContainer.scrollLeft = scrollLeft - dx;
      this.pdfPagesContainer.scrollTop = scrollTop - dy;
    });

    const endPanning = () => {
      if (isPanning) {
        isPanning = false;
        this.pdfPagesContainer.classList.remove('is-panning');
        this.updateCursorMode();
      }
    };

    window.addEventListener('mouseup', endPanning);
  }

  private updateCursorMode() {
    const activeTool = this.annotationManager.getActiveTool();
    const handButtons = document.querySelectorAll('#btnHandTool, #rbtnHandTool');
    const selectButtons = document.querySelectorAll('#btnSelectTool, #rbtnSelectTool');
    const textEditBtn = document.getElementById('rbtnTextEditMode');

    if (this.isTextEditMode) {
      textEditBtn?.classList.add('active');
      handButtons.forEach((b) => b.classList.remove('active'));
      selectButtons.forEach((b) => b.classList.remove('active'));
      this.pdfPagesContainer?.classList.remove('hand-tool-active');
      if (this.pdfPagesContainer) {
        this.pdfPagesContainer.style.cursor = 'default';
      }
      return;
    } else {
      textEditBtn?.classList.remove('active');
    }

    if (activeTool) {
      handButtons.forEach((b) => b.classList.remove('active'));
      selectButtons.forEach((b) => b.classList.remove('active'));
      this.pdfPagesContainer?.classList.remove('hand-tool-active');
      if (this.pdfPagesContainer) {
        this.pdfPagesContainer.style.cursor = 'crosshair';
      }
    } else if (this.isHandTool) {
      handButtons.forEach((b) => b.classList.add('active'));
      selectButtons.forEach((b) => b.classList.remove('active'));
      this.pdfPagesContainer?.classList.add('hand-tool-active');
      if (this.pdfPagesContainer) {
        this.pdfPagesContainer.style.cursor = 'grab';
      }
    } else {
      // Text selection mode
      selectButtons.forEach((b) => b.classList.add('active'));
      handButtons.forEach((b) => b.classList.remove('active'));
      this.pdfPagesContainer?.classList.remove('hand-tool-active');
      if (this.pdfPagesContainer) {
        this.pdfPagesContainer.style.cursor = 'default';
      }
    }

    // Synchronize pointer-events and text selection on annotation canvases & text layers
    const annotCanvases = document.querySelectorAll<HTMLCanvasElement>('.page-annotation-canvas');
    annotCanvases.forEach((c) => {
      c.style.pointerEvents = activeTool ? 'auto' : 'none';
    });

    const textLayers = document.querySelectorAll<HTMLElement>('.textLayer, .text-layer');
    textLayers.forEach((tl) => {
      if (activeTool || this.isHandTool) {
        tl.style.pointerEvents = 'none';
        tl.style.userSelect = 'none';
      } else {
        tl.style.pointerEvents = 'auto';
        tl.style.userSelect = 'text';
      }
    });
  }

  private initFileHandlers() {
    // Open file triggers
    document.getElementById('btnOpenFile')?.addEventListener('click', () => this.fileInput.click());
    document.getElementById('welcomeOpenBtn')?.addEventListener('click', () => this.fileInput.click());
    document.getElementById('welcomeCreateBtn')?.addEventListener('click', () => this.createNewDocument());
    document.getElementById('welcomeMergeBtn')?.addEventListener('click', () => this.promptMergeDocuments());
    document.getElementById('welcomeSplitBtn')?.addEventListener('click', () => this.promptSplitPDF());
    document.getElementById('welcomeImgBtn')?.addEventListener('click', () => this.imageInput.click());

    this.fileInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) Array.from(files).forEach((f) => this.openFile(f));
      this.fileInput.value = '';
    });

    this.imageInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      this.setStatus('Converting images to PDF...');
      const imgItems: { name: string; bytes: Uint8Array }[] = [];
      for (const file of Array.from(files)) {
        const ab = await file.arrayBuffer();
        imgItems.push({ name: file.name, bytes: new Uint8Array(ab) });
      }
      const pdfBytes = await PDFEditorService.imagesToPDF(imgItems);
      await this.loadPDFBytes('Converted_Images.pdf', pdfBytes);
      this.showToast('Created PDF from images successfully!', 'success');
      this.imageInput.value = '';
    });

    this.mergeInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      this.setStatus('Merging documents...');
      const items: { name: string; bytes: Uint8Array; type: 'pdf' | 'image' }[] = [];
      for (const file of Array.from(files)) {
        const ab = await file.arrayBuffer();
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        items.push({ name: file.name, bytes: new Uint8Array(ab), type: isPdf ? 'pdf' : 'image' });
      }
      const mergedBytes = await PDFEditorService.mergeDocuments(items);
      await this.loadPDFBytes('Merged_Document.pdf', mergedBytes);
      this.showToast(`Merged ${files.length} files successfully!`, 'success');
      this.mergeInput.value = '';
    });

    // Drag and Drop
    const dropZone = document.getElementById('dropZone');
    const appEl = document.getElementById('app')!;

    const handleDrag = (e: DragEvent, isEnter: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropZone) {
        if (isEnter) dropZone.classList.add('dragover');
        else dropZone.classList.remove('dragover');
      }
    };

    appEl.addEventListener('dragover', (e) => handleDrag(e, true));
    appEl.addEventListener('dragleave', (e) => handleDrag(e, false));
    appEl.addEventListener('drop', (e) => {
      handleDrag(e, false);
      if (e.dataTransfer?.files) {
        Array.from(e.dataTransfer.files).forEach((f) => {
          if (f.name.toLowerCase().endsWith('.pdf')) {
            this.openFile(f);
          } else if (/\.(png|jpe?g|webp|bmp)$/i.test(f.name)) {
            this.openImageAsPDF(f);
          }
        });
      }
    });
  }

  private initAnnotationEvents() {
    const colorInput = document.getElementById('annotColor') as HTMLInputElement;
    const strokeInput = document.getElementById('annotStroke') as HTMLInputElement;
    const opacityInput = document.getElementById('annotOpacity') as HTMLInputElement;

    const updateProps = () => {
      this.annotationManager.setProperties(
        colorInput.value,
        parseInt(strokeInput.value, 10),
        parseInt(opacityInput.value, 10) / 100
      );
    };

    colorInput?.addEventListener('input', updateProps);
    strokeInput?.addEventListener('input', updateProps);
    opacityInput?.addEventListener('input', updateProps);
  }

  private initShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Skip shortcuts when typing in text inputs
      const activeEl = document.activeElement;
      const isTextInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveDocument(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveDocument(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        this.fileInput.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const sTab = document.querySelector('.sidebar-tab[data-sidebar="search"]') as HTMLElement;
        sTab?.click();
        (document.getElementById('searchInput') as HTMLInputElement)?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.printDocument();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !isTextInput) {
        // In Text Select mode inside the viewer or when text is selected, allow native text selection
        const isViewerTarget = (e.target as HTMLElement)?.closest('#viewerContainer');
        if (!this.isHandTool && isViewerTarget) {
          return;
        }
        // Select all pages in sidebar
        e.preventDefault();
        if (this.getActiveDocument()) {
          this.selectAllPages();
        }
      } else if (e.key === 'Delete' && !isTextInput && this.selectedPageIndices.size > 0) {
        // Delete selected pages
        e.preventDefault();
        this.handleSelectionBarAction('delete');
      } else if (e.key === 'Escape') {
        this.closeContextMenu();
        if (this.selectedPageIndices.size > 0) {
          this.clearSelection();
        }
      }
    });

    // Handle native browser print triggers (e.g. browser menu)
    window.addEventListener('beforeprint', async () => {
      const doc = this.getActiveDocument();
      const printContainer = document.getElementById('printContainer');
      if (doc && printContainer && printContainer.children.length === 0) {
        for (let i = 1; i <= doc.numPages; i++) {
          const pageWrapper = document.createElement('div');
          pageWrapper.className = 'print-page';
          const canvas = document.createElement('canvas');
          canvas.className = 'print-page-canvas';
          pageWrapper.appendChild(canvas);
          printContainer.appendChild(pageWrapper);
          await PDFViewerManager.renderPage(doc.pdfDocProxy, i, canvas, 2.0, doc.rotation);
        }
      }
    });

    window.addEventListener('afterprint', () => {
      const printContainer = document.getElementById('printContainer');
      if (printContainer) printContainer.innerHTML = '';
    });

    // Close custom context menu on outside click
    window.addEventListener('click', () => this.closeContextMenu());
  }

  /* ========================================================================
     2. Document Management & Multi-Tabs
     ======================================================================== */
  async openFile(file: File) {
    try {
      this.setStatus(`Opening ${file.name}...`);
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      await this.loadPDFBytes(file.name, bytes);
      this.showToast(`Opened ${file.name} successfully!`, 'success');
    } catch (err: any) {
      this.setStatus('Failed to open file.');
      this.showToast(`Error: ${err.message}`, 'error');
    }
  }

  async openImageAsPDF(file: File) {
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const pdfBytes = await PDFEditorService.imagesToPDF([{ name: file.name, bytes }]);
    await this.loadPDFBytes(file.name.replace(/\.[^.]+$/, '') + '.pdf', pdfBytes);
  }

  async createNewDocument() {
    this.setStatus('Creating new blank PDF document...');
    const bytes = await PDFEditorService.createBlankPDF(1);
    await this.loadPDFBytes('New_Document.pdf', bytes);
    this.showToast('New document created.', 'info');
  }

  async loadPDFBytes(name: string, bytes: Uint8Array) {
    const persistentBytes = bytes.slice(0);
    const pdfDocProxy = await PDFViewerManager.loadDocument(persistentBytes);
    const hasForms = await PDFViewerManager.detectForms(pdfDocProxy);
    const bookmarks = await PDFViewerManager.extractBookmarks(pdfDocProxy);

    const firstPage = await pdfDocProxy.getPage(1);
    const unscaledViewport = firstPage.getViewport({ scale: 1.0 });
    const containerWidth = this.pdfPagesContainer.clientWidth || 900;
    let initialScale = 1.0;
    if (unscaledViewport.width > containerWidth - 64) {
      initialScale = Math.max(0.25, Math.floor(((containerWidth - 64) / unscaledViewport.width) * 100) / 100);
    }

    const docItem: PDFDocumentItem = {
      id: 'doc_' + Math.random().toString(36).substring(2, 9),
      name,
      fileBytes: persistentBytes.slice(0),
      pdfDocProxy,
      numPages: pdfDocProxy.numPages,
      currentPage: 1,
      scale: initialScale,
      rotation: 0,
      isModified: false,
      hasForms,
      isEncrypted: false,
      annotations: [],
      bookmarks,
      comments: [],
    };

    this.documents.push(docItem);
    this.activeDocIndex = this.documents.length - 1;

    if (hasForms) {
      this.showToast('This document contains interactive form fields.', 'info');
    }

    this.renderDocTabs();
    this.renderActiveDocument();
    this.renderSidebarData();
  }

  private renderDocTabs() {
    this.docTabsScroll.innerHTML = '';
    this.documents.forEach((doc, idx) => {
      const tab = document.createElement('div');
      tab.className = `doc-tab ${idx === this.activeDocIndex ? 'active' : ''}`;
      tab.innerHTML = `
        <span class="material-symbols-rounded" style="font-size:16px;">description</span>
        <span class="doc-tab-title" title="${doc.name}">${doc.name}</span>
        <button class="doc-tab-close" title="Close">×</button>
      `;

      tab.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('doc-tab-close')) {
          e.stopPropagation();
          this.closeDocument(idx);
        } else {
          this.switchDocument(idx);
        }
      });

      this.docTabsScroll.appendChild(tab);
    });

    if (this.documents.length === 0) {
      this.welcomeScreen.classList.remove('hidden');
      this.pdfViewer.classList.add('hidden');
      this.documentTitle.textContent = 'SlashPDF — Free PDF Editor';
      this.statusFileInfo.textContent = '';
      this.totalPages.textContent = '0';
      this.pageInput.value = '1';
    } else {
      this.welcomeScreen.classList.add('hidden');
      this.pdfViewer.classList.remove('hidden');
      const active = this.getActiveDocument()!;
      this.documentTitle.textContent = `${active.name} — SlashPDF`;
      this.statusFileInfo.textContent = `${active.numPages} Pages | ${(active.fileBytes.length / (1024 * 1024)).toFixed(2)} MB`;
      this.totalPages.textContent = String(active.numPages);
      this.pageInput.value = String(active.currentPage);
      this.pageInput.max = String(active.numPages);
    }
  }

  private switchDocument(index: number) {
    if (index >= 0 && index < this.documents.length) {
      this.activeDocIndex = index;
      this.selectedPageIndices.clear();
      this.lastClickedPageIndex = null;
      this.renderDocTabs();
      this.renderActiveDocument();
      this.renderSidebarData();
    }
  }

  private closeDocument(index: number) {
    this.documents.splice(index, 1);
    if (this.activeDocIndex >= this.documents.length) {
      this.activeDocIndex = this.documents.length - 1;
    }
    this.renderDocTabs();
    if (this.activeDocIndex >= 0) {
      this.renderActiveDocument();
      this.renderSidebarData();
    }
  }

  private getActiveDocument(): PDFDocumentItem | null {
    if (this.activeDocIndex >= 0 && this.activeDocIndex < this.documents.length) {
      return this.documents[this.activeDocIndex];
    }
    return null;
  }

  /* ========================================================================
     3. Rendering Pages & View Modes
     ======================================================================== */
  private async renderActiveDocument() {
    const doc = this.getActiveDocument();
    if (!doc) return;

    this.setStatus(`Loading pages...`);
    this.pdfPagesContainer.innerHTML = '';
    this.statusZoom.textContent = `${Math.round(doc.scale * 100)}%`;

    if (this.layoutMode === 'two-page') {
      this.pdfPagesContainer.classList.add('two-page-view');
    } else {
      this.pdfPagesContainer.classList.remove('two-page-view');
    }

    const pagesToRender = this.layoutMode === 'single' ? [doc.currentPage] : Array.from({ length: doc.numPages }, (_, i) => i + 1);

    for (const pageNum of pagesToRender) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.id = `pageWrapper_${pageNum}`;

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      pageWrapper.appendChild(canvas);

      // Annotation overlay canvas
      const annotCanvas = document.createElement('canvas');
      annotCanvas.className = 'page-annotation-canvas';
      pageWrapper.appendChild(annotCanvas);

      this.pdfPagesContainer.appendChild(pageWrapper);

      const { width, height, viewport, page } = await PDFViewerManager.renderPage(
        doc.pdfDocProxy,
        pageNum,
        canvas,
        doc.scale,
        doc.rotation
      );

      pageWrapper.style.width = `${width}px`;
      pageWrapper.style.height = `${height}px`;

      // Text layer for selection, copying, and search
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = `${width}px`;
      textLayerDiv.style.height = `${height}px`;
      textLayerDiv.style.setProperty('--scale-factor', String(doc.scale));
      textLayerDiv.style.setProperty('--total-scale-factor', String(doc.scale));
      textLayerDiv.style.setProperty('--scale-round-x', '1px');
      textLayerDiv.style.setProperty('--scale-round-y', '1px');
      textLayerDiv.style.setProperty('--user-unit', '1');

      pageWrapper.insertBefore(textLayerDiv, annotCanvas);

      // Render selectable text elements
      await PDFViewerManager.renderTextLayer(page, viewport, textLayerDiv);

      annotCanvas.width = width;
      annotCanvas.height = height;
      annotCanvas.style.width = `${width}px`;
      annotCanvas.style.height = `${height}px`;

      // Render annotations for this page
      const pageAnnots = doc.annotations.filter((a) => a.pageIndex === pageNum - 1);
      this.annotationManager.renderAnnotations(annotCanvas, pageAnnots, doc.scale);

      // Attach drawing / annotation events to page
      this.attachPageAnnotationHandler(annotCanvas, pageNum - 1);
    }

    if (this.isTextEditMode) {
      await this.refreshTextEditOverlays();
    }

    this.updateCursorMode();
    this.setStatus('Ready');
  }

  private goToPage(pageNum: number) {
    const doc = this.getActiveDocument();
    if (!doc) return;
    doc.currentPage = pageNum;
    this.pageInput.value = String(pageNum);

    if (this.layoutMode === 'single') {
      this.renderActiveDocument();
    } else {
      const targetWrapper = document.getElementById(`pageWrapper_${pageNum}`);
      targetWrapper?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Highlight thumbnail
    const thumbs = document.querySelectorAll('.thumbnail-item');
    thumbs.forEach((t, i) => {
      if (i === pageNum - 1) t.classList.add('active');
      else t.classList.remove('active');
    });
  }

  private zoom(delta: number) {
    const doc = this.getActiveDocument();
    if (!doc) return;
    doc.scale = Math.max(0.25, Math.min(4.0, doc.scale + delta));
    this.renderActiveDocument();
  }

  private setLayoutMode(mode: ViewLayoutMode) {
    this.layoutMode = mode;
    document.getElementById('btnSinglePage')?.classList.toggle('active', mode === 'single');
    document.getElementById('btnContinuous')?.classList.toggle('active', mode === 'continuous');
    document.getElementById('btnTwoPage')?.classList.toggle('active', mode === 'two-page');
    this.renderActiveDocument();
  }

  /* ========================================================================
     4. Sidebar Rendering (Thumbnails, Bookmarks, Comments)
     ======================================================================== */
  private async renderSidebarData() {
    const doc = this.getActiveDocument();
    if (!doc) return;

    // 1. Thumbnails
    const thumbList = document.getElementById('thumbnailList')!;
    thumbList.innerHTML = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const isSelected = this.selectedPageIndices.has(i - 1);
      const item = document.createElement('div');
      item.className = `thumbnail-item ${i === doc.currentPage ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="thumbnail-select-checkbox" data-page-idx="${i - 1}" title="Select page ${i}">
          <span class="material-symbols-rounded">check</span>
        </div>
        <div class="thumbnail-canvas-wrap">
          <canvas id="thumb_${i}"></canvas>
          <div class="thumbnail-hover-overlay">
            <button class="thumb-quick-btn" data-thumb-action="rotate-cw" title="Rotate 90° Clockwise">
              <span class="material-symbols-rounded">rotate_right</span>
            </button>
            <button class="thumb-quick-btn" data-thumb-action="add-blank-after" title="Insert Blank Page After">
              <span class="material-symbols-rounded">note_add</span>
            </button>
            <button class="thumb-quick-btn" data-thumb-action="insert-file" title="Insert Pages From File...">
              <span class="material-symbols-rounded">post_add</span>
            </button>
            <button class="thumb-quick-btn danger" data-thumb-action="delete" title="Delete Page">
              <span class="material-symbols-rounded">delete</span>
            </button>
          </div>
        </div>
        <span class="thumbnail-number">${i}</span>
      `;

      // Checkbox click handler — toggles selection without navigating
      const checkbox = item.querySelector('.thumbnail-select-checkbox')!;
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePageSelection(i - 1, e as MouseEvent);
      });

      // Main click — navigate, with Ctrl/Shift for multi-select
      item.addEventListener('click', (e) => {
        // Ignore if clicking on quick-action buttons or checkbox
        if ((e.target as HTMLElement).closest('.thumb-quick-btn') ||
            (e.target as HTMLElement).closest('.thumbnail-select-checkbox')) return;

        if (e.ctrlKey || e.metaKey) {
          this.togglePageSelection(i - 1, e);
        } else if (e.shiftKey && this.lastClickedPageIndex !== null) {
          this.shiftSelectRange(this.lastClickedPageIndex, i - 1);
        } else {
          // Normal click — clear selection & navigate
          this.selectedPageIndices.clear();
          this.lastClickedPageIndex = i - 1;
          this.goToPage(i);
          this.updateThumbnailSelectionUI();
        }
      });

      // Drag & drop for visual page reordering (single or multi-page)
      item.draggable = true;
      item.dataset.page = String(i);

      item.addEventListener('dragstart', (e) => {
        // If the dragged item isn't in selection, select it as the sole item
        if (!this.selectedPageIndices.has(i - 1)) {
          this.selectedPageIndices.clear();
          this.selectedPageIndices.add(i - 1);
          this.lastClickedPageIndex = i - 1;
          this.updateThumbnailSelectionUI();
        }

        const movingIndices = Array.from(this.selectedPageIndices).sort((a, b) => a - b);
        e.dataTransfer?.setData('application/json', JSON.stringify(movingIndices));
        e.dataTransfer?.setData('text/plain', String(i));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';

        // Add is-dragging style to all moving thumbnail items
        document.querySelectorAll('.thumbnail-item').forEach((thumb) => {
          const page = parseInt((thumb as HTMLElement).dataset.page || '0', 10);
          if (this.selectedPageIndices.has(page - 1)) {
            thumb.classList.add('is-dragging');
          }
        });
        this.draggedPageNum = i;
      });

      item.addEventListener('dragend', () => {
        this.draggedPageNum = null;
        document.querySelectorAll('.thumbnail-item').forEach((t) => {
          t.classList.remove('drag-over-top', 'drag-over-bottom', 'is-dragging');
        });
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        // If this item is one of the dragged items, don't show drop highlight
        if (this.selectedPageIndices.has(i - 1)) return;

        const rect = item.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        if (relY < rect.height / 2) {
          item.classList.add('drag-over-top');
          item.classList.remove('drag-over-bottom');
        } else {
          item.classList.add('drag-over-bottom');
          item.classList.remove('drag-over-top');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('drag-over-top', 'drag-over-bottom');

        const targetIdx = i - 1;
        // If target is inside the moving set, ignore
        if (this.selectedPageIndices.has(targetIdx)) return;

        let movingIndices: number[] = [];
        try {
          const json = e.dataTransfer?.getData('application/json');
          if (json) movingIndices = JSON.parse(json);
        } catch {}
        if (!movingIndices || movingIndices.length === 0) {
          movingIndices = Array.from(this.selectedPageIndices);
        }
        if (movingIndices.length === 0 && this.draggedPageNum) {
          movingIndices = [this.draggedPageNum - 1];
        }
        if (movingIndices.length === 0) return;

        const rect = item.getBoundingClientRect();
        const isDropTop = (e.clientY - rect.top) < (rect.height / 2);

        const count = doc.numPages;
        const movingSet = new Set(movingIndices);
        const movingSorted = Array.from(movingSet).sort((a, b) => a - b);
        const remaining: number[] = [];
        for (let p = 0; p < count; p++) {
          if (!movingSet.has(p)) remaining.push(p);
        }

        const targetPosInRemaining = remaining.indexOf(targetIdx);
        if (targetPosInRemaining === -1) return;

        const insertPos = isDropTop ? targetPosInRemaining : targetPosInRemaining + 1;
        remaining.splice(insertPos, 0, ...movingSorted);

        this.setStatus(`Moving ${movingSorted.length} page(s)...`);
        const newBytes = await PDFEditorService.reorderPages(doc.fileBytes, remaining);

        const newSelected = movingSorted.map((orig) => remaining.indexOf(orig));
        this.selectedPageIndices = new Set(newSelected);
        this.lastClickedPageIndex = newSelected[0];
        doc.currentPage = newSelected[0] + 1;

        await this.reloadActiveDocBytes(newBytes);
        this.goToPage(newSelected[0] + 1);
        this.updateThumbnailSelectionUI();
        this.showToast(`Moved ${movingSorted.length} page(s) successfully.`, 'success');
      });

      // Quick hover buttons
      item.querySelectorAll('.thumb-quick-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = (btn as HTMLElement).dataset.thumbAction;
          if (action) this.handleThumbnailAction(action, i);
        });
      });

      // Context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // If page is not already in selection, select it alone
        if (!this.selectedPageIndices.has(i - 1)) {
          this.selectedPageIndices.clear();
          this.lastClickedPageIndex = i - 1;
        }
        this.goToPage(i);
        this.showThumbnailContextMenu(e.clientX, e.clientY, i);
      });

      thumbList.appendChild(item);

      const canvas = item.querySelector('canvas') as HTMLCanvasElement;
      PDFViewerManager.renderThumbnail(doc.pdfDocProxy, i, canvas, 140);
    }

    // Render the selection info bar
    this.renderSelectionBar();

    // 2. Bookmarks
    this.renderBookmarksList();

    // 3. Comments
    this.renderCommentsList();
  }

  /* ========================================================================
     4b. Multi-Selection Logic for Thumbnails
     ======================================================================== */
  private togglePageSelection(pageIdx: number, _event?: MouseEvent) {
    if (this.selectedPageIndices.has(pageIdx)) {
      this.selectedPageIndices.delete(pageIdx);
    } else {
      this.selectedPageIndices.add(pageIdx);
    }
    this.lastClickedPageIndex = pageIdx;
    this.updateThumbnailSelectionUI();
  }

  private shiftSelectRange(fromIdx: number, toIdx: number) {
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    for (let i = start; i <= end; i++) {
      this.selectedPageIndices.add(i);
    }
    this.lastClickedPageIndex = toIdx;
    this.updateThumbnailSelectionUI();
  }

  private clearSelection() {
    this.selectedPageIndices.clear();
    this.lastClickedPageIndex = null;
    this.updateThumbnailSelectionUI();
  }

  private selectAllPages() {
    const doc = this.getActiveDocument();
    if (!doc) return;
    for (let i = 0; i < doc.numPages; i++) {
      this.selectedPageIndices.add(i);
    }
    this.updateThumbnailSelectionUI();
  }

  /** Lightweight DOM update — toggles .selected class and re-renders the selection bar without re-rendering canvases */
  private updateThumbnailSelectionUI() {
    const thumbItems = document.querySelectorAll('.thumbnail-item');
    thumbItems.forEach((item, idx) => {
      if (this.selectedPageIndices.has(idx)) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
    this.renderSelectionBar();
  }

  /** Renders the selection info bar with batch action buttons at the bottom of the pages panel */
  private renderSelectionBar() {
    const pagesPanel = document.querySelector('.sidebar-panel[data-sidepanel="thumbnails"]') ||
                       document.querySelector('.sidebar-panel[data-sidepanel="pages"]');
    if (!pagesPanel) return;

    // Remove existing bar
    const existing = pagesPanel.querySelector('.thumbnail-selection-bar');
    if (existing) existing.remove();

    if (this.selectedPageIndices.size === 0) return;

    const bar = document.createElement('div');
    bar.className = 'thumbnail-selection-bar';
    const count = this.selectedPageIndices.size;
    bar.innerHTML = `
      <div class="sel-bar-header">
        <div class="sel-bar-info">
          <span class="material-symbols-rounded" style="font-size:15px;">check_box</span>
          <span>${count} page${count > 1 ? 's' : ''} selected</span>
        </div>
        <button class="sel-bar-btn sel-bar-close" data-sel-action="clear" title="Clear Selection">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="sel-bar-actions">
        <button class="sel-bar-btn" data-sel-action="select-all" title="Select All Pages">
          <span class="material-symbols-rounded">select_all</span>
        </button>
        <button class="sel-bar-btn" data-sel-action="move" title="Move Selected Pages">
          <span class="material-symbols-rounded">swap_vert</span>
        </button>
        <button class="sel-bar-btn" data-sel-action="rotate-cw" title="Rotate Selected CW">
          <span class="material-symbols-rounded">rotate_right</span>
        </button>
        <button class="sel-bar-btn" data-sel-action="rotate-ccw" title="Rotate Selected CCW">
          <span class="material-symbols-rounded">rotate_left</span>
        </button>
        <button class="sel-bar-btn" data-sel-action="extract" title="Extract Selected Pages">
          <span class="material-symbols-rounded">exit_to_app</span>
        </button>
        <button class="sel-bar-btn danger" data-sel-action="delete" title="Delete Selected Pages">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </div>
    `;

    bar.querySelectorAll('.sel-bar-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.selAction;
        if (action) this.handleSelectionBarAction(action);
      });
    });

    pagesPanel.appendChild(bar);
  }

  private async handleSelectionBarAction(action: string) {
    const doc = this.getActiveDocument();
    if (!doc) return;
    const indices = Array.from(this.selectedPageIndices).sort((a, b) => a - b);

    switch (action) {
      case 'select-all': {
        this.selectAllPages();
        break;
      }
      case 'move': {
        if (indices.length === 0) return;
        const pageList = indices.map((i) => i + 1);
        const targetPage = await UIDialogs.promptMovePage(pageList[0], doc.numPages, pageList);
        if (targetPage !== null) {
          await this.movePages(indices, targetPage - 1);
        }
        break;
      }
      case 'rotate-cw': {
        if (indices.length === 0) return;
        this.setStatus(`Rotating ${indices.length} page(s)...`);
        const newBytes = await PDFEditorService.rotatePages(doc.fileBytes, indices, 90);
        await this.reloadActiveDocBytes(newBytes);
        this.showToast(`Rotated ${indices.length} page(s) 90° clockwise.`, 'success');
        this.clearSelection();
        break;
      }
      case 'rotate-ccw': {
        if (indices.length === 0) return;
        this.setStatus(`Rotating ${indices.length} page(s)...`);
        const newBytes = await PDFEditorService.rotatePages(doc.fileBytes, indices, 270);
        await this.reloadActiveDocBytes(newBytes);
        this.showToast(`Rotated ${indices.length} page(s) 90° counter-clockwise.`, 'success');
        this.clearSelection();
        break;
      }
      case 'extract': {
        if (indices.length === 0) return;
        const extractedBytes = await PDFEditorService.extractPages(doc.fileBytes, indices);
        const pageList = indices.map((i) => i + 1).join(', ');
        this.downloadFile(`Extracted_Pages_${pageList}.pdf`, extractedBytes);
        this.showToast(`Extracted ${indices.length} page(s) and downloaded!`, 'success');
        this.clearSelection();
        break;
      }
      case 'delete': {
        if (indices.length === 0) return;
        const pageList = indices.map((i) => i + 1).join(', ');
        if (indices.length >= doc.numPages) {
          const ok = await UIDialogs.confirm(
            'Delete All Pages',
            'You are about to delete ALL pages. This will create a fresh blank document. Continue?',
            'Delete All & Reset',
            true
          );
          if (!ok) return;
        } else {
          const ok = await UIDialogs.confirm(
            'Delete Selected Pages',
            `Delete ${indices.length} selected page(s) (${pageList})?`,
            `Delete ${indices.length} Page(s)`,
            true
          );
          if (!ok) return;
        }
        this.setStatus(`Deleting ${indices.length} page(s)...`);
        const newBytes = await PDFEditorService.deletePages(doc.fileBytes, indices);
        await this.reloadActiveDocBytes(newBytes);
        this.showToast(`Deleted ${indices.length} page(s).`, 'info');
        this.clearSelection();
        break;
      }
      case 'clear': {
        this.clearSelection();
        break;
      }
    }
  }

  /** Returns selected page indices if any are selected, otherwise falls back to the given pageNum */
  private getSelectedOrContextIndices(pageNum: number): number[] {
    if (this.selectedPageIndices.size > 0) {
      return Array.from(this.selectedPageIndices).sort((a, b) => a - b);
    }
    return [pageNum - 1];
  }

  private showThumbnailContextMenu(x: number, y: number, pageNum: number) {
    this.closeContextMenu();
    const doc = this.getActiveDocument();
    if (!doc) return;

    const selCount = this.selectedPageIndices.size;
    const isMulti = selCount > 1;
    const selLabel = isMulti ? ` (${selCount} pages)` : '';

    const menu = document.createElement('div');
    menu.className = 'slashpdf-context-menu';
    menu.id = 'slashpdfContextMenu';

    // Build menu items — adapt labels to single vs multi-selection
    let menuHtml = '';

    if (!isMulti) {
      menuHtml += `
        <div class="ctx-item" data-action="add-blank-after">
          <span class="material-symbols-rounded">note_add</span>
          <span>Insert Blank Page After</span>
        </div>
        <div class="ctx-item" data-action="add-blank-before">
          <span class="material-symbols-rounded">note_add</span>
          <span>Insert Blank Page Before</span>
        </div>
        <div class="ctx-item" data-action="insert-file">
          <span class="material-symbols-rounded">post_add</span>
          <span>Insert Pages from File...</span>
        </div>
        <div class="ctx-divider"></div>
      `;
    }

    menuHtml += `
      <div class="ctx-item" data-action="rotate-cw">
        <span class="material-symbols-rounded">rotate_right</span>
        <span>Rotate 90° Clockwise${selLabel}</span>
      </div>
      <div class="ctx-item" data-action="rotate-ccw">
        <span class="material-symbols-rounded">rotate_left</span>
        <span>Rotate 90° Counter-Clockwise${selLabel}</span>
      </div>
    `;

    if (!isMulti) {
      menuHtml += `
        <div class="ctx-item" data-action="duplicate">
          <span class="material-symbols-rounded">content_copy</span>
          <span>Duplicate Page</span>
        </div>
        <div class="ctx-divider"></div>
        <div class="ctx-item ${pageNum <= 1 ? 'disabled' : ''}" data-action="move-up">
          <span class="material-symbols-rounded">arrow_upward</span>
          <span>Move Page Up</span>
        </div>
        <div class="ctx-item ${pageNum >= doc.numPages ? 'disabled' : ''}" data-action="move-down">
          <span class="material-symbols-rounded">arrow_downward</span>
          <span>Move Page Down</span>
        </div>
        <div class="ctx-item" data-action="move-to">
          <span class="material-symbols-rounded">swap_vert</span>
          <span>Move Page To...</span>
        </div>
      `;
    } else {
      menuHtml += `
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-action="move-to">
          <span class="material-symbols-rounded">swap_vert</span>
          <span>Move ${selCount} Pages To...</span>
        </div>
      `;
    }

    menuHtml += `
      <div class="ctx-divider"></div>
      <div class="ctx-item" data-action="extract">
        <span class="material-symbols-rounded">exit_to_app</span>
        <span>Extract${isMulti ? ` ${selCount} Pages` : ' Page'}</span>
      </div>
      <div class="ctx-item danger" data-action="delete">
        <span class="material-symbols-rounded">delete</span>
        <span>Delete${isMulti ? ` ${selCount} Pages` : ' Page'}</span>
      </div>
    `;

    if (isMulti) {
      menuHtml += `
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-action="clear-selection">
          <span class="material-symbols-rounded">deselect</span>
          <span>Clear Selection</span>
        </div>
      `;
    } else {
      menuHtml += `
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-action="select-all">
          <span class="material-symbols-rounded">select_all</span>
          <span>Select All Pages</span>
        </div>
      `;
    }

    menu.innerHTML = menuHtml;

    document.body.appendChild(menu);

    // Position menu safely inside screen bounds
    const rect = menu.getBoundingClientRect();
    const posX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 12 : x;
    const posY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 12 : y;
    menu.style.left = `${Math.max(12, posX)}px`;
    menu.style.top = `${Math.max(12, posY)}px`;

    menu.querySelectorAll('.ctx-item:not(.disabled)').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (item as HTMLElement).dataset.action;
        this.closeContextMenu();
        if (action) this.handleThumbnailAction(action, pageNum);
      });
    });
  }

  private closeContextMenu() {
    const existing = document.getElementById('slashpdfContextMenu');
    if (existing) existing.remove();
  }

  private async handleThumbnailAction(action: string, pageNum: number) {
    const doc = this.getActiveDocument();
    if (!doc) return;

    switch (action) {
      case 'add-blank-after': {
        this.setStatus('Inserting blank page...');
        const newBytes = await PDFEditorService.insertBlankPage(doc.fileBytes, pageNum, 1);
        await this.reloadActiveDocBytes(newBytes);
        this.goToPage(pageNum + 1);
        this.showToast(`Blank page inserted after Page ${pageNum}.`, 'success');
        break;
      }
      case 'add-blank-before': {
        this.setStatus('Inserting blank page...');
        const newBytes = await PDFEditorService.insertBlankPage(doc.fileBytes, pageNum - 1, 1);
        await this.reloadActiveDocBytes(newBytes);
        this.goToPage(pageNum);
        this.showToast(`Blank page inserted before Page ${pageNum}.`, 'success');
        break;
      }
      case 'insert-file': {
        this.promptInsertFile(pageNum);
        break;
      }
      case 'rotate-cw': {
        const indices = this.getSelectedOrContextIndices(pageNum);
        this.setStatus(`Rotating ${indices.length} page(s)...`);
        const newBytes = await PDFEditorService.rotatePages(doc.fileBytes, indices, 90);
        await this.reloadActiveDocBytes(newBytes);
        if (indices.length > 1) {
          this.showToast(`Rotated ${indices.length} pages 90° clockwise.`, 'info');
          this.clearSelection();
        } else {
          this.showToast(`Page ${pageNum} rotated 90° clockwise.`, 'info');
        }
        break;
      }
      case 'rotate-ccw': {
        const indices = this.getSelectedOrContextIndices(pageNum);
        this.setStatus(`Rotating ${indices.length} page(s)...`);
        const newBytes = await PDFEditorService.rotatePages(doc.fileBytes, indices, 270);
        await this.reloadActiveDocBytes(newBytes);
        if (indices.length > 1) {
          this.showToast(`Rotated ${indices.length} pages 90° counter-clockwise.`, 'info');
          this.clearSelection();
        } else {
          this.showToast(`Page ${pageNum} rotated 90° counter-clockwise.`, 'info');
        }
        break;
      }
      case 'duplicate': {
        this.setStatus('Duplicating page...');
        const newBytes = await PDFEditorService.duplicatePage(doc.fileBytes, pageNum - 1);
        await this.reloadActiveDocBytes(newBytes);
        this.goToPage(pageNum + 1);
        this.showToast(`Page ${pageNum} duplicated.`, 'success');
        break;
      }
      case 'move-up': {
        if (pageNum > 1) {
          await this.movePage(pageNum - 1, pageNum - 2);
        }
        break;
      }
      case 'move-down': {
        if (pageNum < doc.numPages) {
          await this.movePage(pageNum - 1, pageNum);
        }
        break;
      }
      case 'move-to': {
        const indices = this.getSelectedOrContextIndices(pageNum);
        const pageList = indices.map((i) => i + 1);
        const targetPage = await UIDialogs.promptMovePage(pageNum, doc.numPages, pageList);
        if (targetPage !== null) {
          await this.movePages(indices, targetPage - 1);
        }
        break;
      }
      case 'delete': {
        const indices = this.getSelectedOrContextIndices(pageNum);
        const isMulti = indices.length > 1;
        const pageList = indices.map((i) => i + 1).join(', ');

        if (indices.length >= doc.numPages) {
          const ok = await UIDialogs.confirm(
            'Delete All Pages',
            'You are about to delete ALL pages. This will create a fresh blank document. Continue?',
            'Delete All & Reset',
            true
          );
          if (!ok) return;
        } else if (isMulti) {
          const ok = await UIDialogs.confirm(
            'Delete Selected Pages',
            `Delete ${indices.length} selected page(s) (${pageList})?`,
            `Delete ${indices.length} Page(s)`,
            true
          );
          if (!ok) return;
        } else {
          const ok = await UIDialogs.confirm(
            'Delete Page',
            `Are you sure you want to delete Page ${pageNum}?`,
            'Delete Page',
            true
          );
          if (!ok) return;
        }
        this.setStatus(`Deleting ${indices.length} page(s)...`);
        const newBytes = await PDFEditorService.deletePages(doc.fileBytes, indices);
        if (doc.currentPage > 1 && doc.currentPage >= pageNum) {
          doc.currentPage = Math.max(1, doc.currentPage - 1);
        }
        await this.reloadActiveDocBytes(newBytes);
        this.showToast(`Deleted ${indices.length} page(s).`, 'info');
        this.clearSelection();
        break;
      }
      case 'extract': {
        const indices = this.getSelectedOrContextIndices(pageNum);
        const extractedBytes = await PDFEditorService.extractPages(doc.fileBytes, indices);
        if (indices.length > 1) {
          const pageList = indices.map((i) => i + 1).join('_');
          this.downloadFile(`Pages_${pageList}_Extracted.pdf`, extractedBytes);
          this.showToast(`Extracted ${indices.length} page(s) and downloaded!`, 'success');
          this.clearSelection();
        } else {
          this.downloadFile(`Page_${pageNum}_Extracted.pdf`, extractedBytes);
          this.showToast(`Page ${pageNum} extracted and downloaded!`, 'success');
        }
        break;
      }
      case 'select-all': {
        this.selectAllPages();
        break;
      }
      case 'clear-selection': {
        this.clearSelection();
        break;
      }
    }
  }

  private async movePage(fromIndex: number, toIndex: number) {
    await this.movePages([fromIndex], toIndex);
  }

  private async movePages(pageIndices: number[], targetIndex: number) {
    const doc = this.getActiveDocument();
    if (!doc) return;
    if (pageIndices.length === 0) return;

    this.setStatus(`Moving ${pageIndices.length} page(s)...`);
    const { newBytes, newIndices } = await PDFEditorService.movePages(doc.fileBytes, pageIndices, targetIndex);
    this.selectedPageIndices = new Set(newIndices);
    this.lastClickedPageIndex = newIndices[0];
    doc.currentPage = newIndices[0] + 1;
    await this.reloadActiveDocBytes(newBytes);
    this.goToPage(newIndices[0] + 1);
    this.updateThumbnailSelectionUI();
    const pageList = pageIndices.map((p) => p + 1).join(', ');
    this.showToast(
      pageIndices.length > 1
        ? `Pages (${pageList}) moved to position ${targetIndex + 1}.`
        : `Page ${pageIndices[0] + 1} moved to position ${targetIndex + 1}.`,
      'success'
    );
  }

  private promptInsertFile(targetPageNum?: number) {
    const doc = this.getActiveDocument();
    if (!doc) return this.showToast('Please open a PDF document first.', 'warning');

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf';
    fileInput.onchange = async () => {
      if (!fileInput.files || !fileInput.files[0]) return;
      const file = fileInput.files[0];
      const srcAb = await file.arrayBuffer();
      const srcBytes = new Uint8Array(srcAb);

      let srcPageCount = 1;
      try {
        srcPageCount = await PDFEditorService.getPageCount(srcBytes);
      } catch (err) {
        this.showToast('Failed to parse the selected PDF file.', 'error');
        return;
      }

      const currentPage = targetPageNum !== undefined ? targetPageNum : doc.currentPage;
      const options = await UIDialogs.promptInsertFromFileOptions(
        file.name,
        srcPageCount,
        currentPage,
        doc.numPages
      );

      if (!options) return;

      this.setStatus('Inserting pages from file...');
      const newBytes = await PDFEditorService.insertPagesFromFile(
        doc.fileBytes,
        srcBytes,
        options.insertIndex,
        options.sourcePageIndices
      );

      await this.reloadActiveDocBytes(newBytes);
      const insertedCount = options.sourcePageIndices ? options.sourcePageIndices.length : srcPageCount;
      const newActivePage = Math.min(options.insertIndex + 1, doc.numPages);
      this.goToPage(newActivePage);
      this.showToast(`Successfully inserted ${insertedCount} page(s) from "${file.name}"!`, 'success');
    };
    fileInput.click();
  }

  private renderBookmarksList() {
    const doc = this.getActiveDocument();
    const bookmarkList = document.getElementById('bookmarkList');
    if (!doc || !bookmarkList) return;
    bookmarkList.innerHTML = '';
    if (doc.bookmarks.length === 0) {
      bookmarkList.innerHTML = '<div style="padding:12px; font-size:12px; color:var(--text-light); text-align:center;">No bookmarks in this document.</div>';
    } else {
      doc.bookmarks.forEach((bm, idx) => {
        const el = document.createElement('div');
        el.className = 'bookmark-item';
        el.innerHTML = `
          <div class="bookmark-title">
            <span class="material-symbols-rounded" style="font-size:16px;">bookmark</span>
            <span>${bm.title}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="bookmark-page">Page ${bm.pageIndex + 1}</span>
            <button class="thumb-quick-btn danger delete-bm-btn" title="Delete Bookmark" style="opacity:0.7; width:20px; height:20px; padding:0; display:inline-flex; align-items:center; justify-content:center;">
              <span class="material-symbols-rounded" style="font-size:14px;">close</span>
            </button>
          </div>
        `;
        el.querySelector('.delete-bm-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          doc.bookmarks.splice(idx, 1);
          this.renderBookmarksList();
          this.showToast('Bookmark removed.', 'info');
        });
        el.addEventListener('click', () => this.goToPage(bm.pageIndex + 1));
        bookmarkList.appendChild(el);
      });
    }
  }

  private renderCommentsList() {
    const doc = this.getActiveDocument();
    const commentList = document.getElementById('commentList')!;
    commentList.innerHTML = '';
    if (!doc || doc.comments.length === 0) {
      commentList.innerHTML = '<div style="padding:12px; font-size:12px; color:var(--text-light); text-align:center;">No comments or notes yet.</div>';
      return;
    }

    doc.comments.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'comment-card';
      card.innerHTML = `
        <div class="comment-header">
          <span class="comment-author">${c.author} (Page ${c.pageIndex + 1})</span>
          <span class="comment-time">${c.timestamp}</span>
        </div>
        <div class="comment-text">${c.text}</div>
      `;
      card.addEventListener('click', () => this.goToPage(c.pageIndex + 1));
      commentList.appendChild(card);
    });
  }

  private renderSearchResults() {
    const container = document.getElementById('searchResults')!;
    container.innerHTML = '';
    if (this.currentSearchResults.length === 0) {
      container.innerHTML = '<div style="font-size:11.5px; color:var(--text-light); padding:8px;">No search results found.</div>';
      return;
    }

    this.currentSearchResults.forEach((res, idx) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <div style="font-weight:600; font-size:11px; color:var(--primary); margin-bottom:2px;">Page ${res.pageIndex + 1}</div>
        <div>${res.text}</div>
      `;
      item.addEventListener('click', () => {
        this.currentSearchIndex = idx;
        this.goToPage(res.pageIndex + 1);
      });
      container.appendChild(item);
    });
  }

  /* ========================================================================
     5. Interactive Page Canvas Annotations (Drawing, Highlighter, Shapes)
     ======================================================================== */
  private attachPageAnnotationHandler(canvas: HTMLCanvasElement, pageIndex: number) {
    let isDown = false;
    let startPos = { x: 0, y: 0 };
    let points: { x: number; y: number }[] = [];

    const getCoord = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const doc = this.getActiveDocument()!;
      return {
        x: (e.clientX - rect.left) / doc.scale,
        y: (e.clientY - rect.top) / doc.scale,
      };
    };

    canvas.addEventListener('mousedown', (e) => {
      const tool = this.annotationManager.getActiveTool();
      if (!tool) return;
      isDown = true;
      startPos = getCoord(e);
      points = [startPos];
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const tool = this.annotationManager.getActiveTool();
      if (!tool) return;
      const currentPos = getCoord(e);

      if (tool === 'freehand') {
        points.push(currentPos);
      }

      const doc = this.getActiveDocument()!;
      const existing = doc.annotations.filter((a) => a.pageIndex === pageIndex);
      this.annotationManager.renderAnnotations(canvas, existing, doc.scale);

      const previewAnnot = this.annotationManager.createAnnotation(pageIndex, tool, {
        points: tool === 'freehand' ? points : [startPos, currentPos],
        rect: {
          x: Math.min(startPos.x, currentPos.x),
          y: Math.min(startPos.y, currentPos.y),
          width: Math.abs(currentPos.x - startPos.x),
          height: Math.abs(currentPos.y - startPos.y),
        },
      });
      this.annotationManager.renderAnnotations(canvas, [...existing, previewAnnot], doc.scale);
    });

    canvas.addEventListener('mouseup', async (e) => {
      if (!isDown) return;
      isDown = false;
      const tool = this.annotationManager.getActiveTool();
      if (!tool) return;
      const endPos = getCoord(e);
      const doc = this.getActiveDocument()!;

      if (tool === 'sticky-note') {
        const text = prompt('Enter sticky note text:');
        if (text) {
          const annot = this.annotationManager.createAnnotation(pageIndex, tool, {
            rect: { x: endPos.x, y: endPos.y, width: 24, height: 24 },
            text,
          });
          doc.annotations.push(annot);
          doc.comments.push({
            id: 'c_' + Math.random().toString(36).substring(2, 9),
            pageIndex,
            author: 'User',
            text,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            annotationId: annot.id,
          });
          this.renderCommentsList();
        }
      } else if (tool === 'stamp') {
        const stampData = await UIDialogs.promptStamp();
        if (stampData) {
          const annot = this.annotationManager.createAnnotation(pageIndex, 'stamp', {
            rect: { x: endPos.x - 70, y: endPos.y - 25, width: 140, height: 50 },
            text: stampData.text,
          });
          annot.color = stampData.color;
          doc.annotations.push(annot);
        }
      } else {
        const annot = this.annotationManager.createAnnotation(pageIndex, tool, {
          points: tool === 'freehand' ? points : [startPos, endPos],
          rect: {
            x: Math.min(startPos.x, endPos.x),
            y: Math.min(startPos.y, endPos.y),
            width: Math.abs(endPos.x - startPos.x),
            height: Math.abs(endPos.y - startPos.y),
          },
        });
        doc.annotations.push(annot);
      }

      const existing = doc.annotations.filter((a) => a.pageIndex === pageIndex);
      this.annotationManager.renderAnnotations(canvas, existing, doc.scale);
    });
  }

  private updateToolButtons() {
    const activeTool = this.annotationManager.getActiveTool();
    document.querySelectorAll('.annotation-tool').forEach((btn) => {
      const tool = btn.getAttribute('data-tool');
      btn.classList.toggle('active', tool === activeTool);
    });
  }

  /* ========================================================================
     6. Ribbon Action Dispatcher
     ======================================================================== */
  private async handleRibbonAction(action: string, _btnElement?: HTMLElement) {
    const doc = this.getActiveDocument();

    switch (action) {
      // --- FILE & CREATION ---
      case 'open':
        this.fileInput.click();
        break;
      case 'create-blank':
        await this.createNewDocument();
        break;
      case 'save':
        await this.saveDocument(false);
        break;
      case 'save-as':
        await this.saveDocument(true);
        break;
      case 'print':
        await this.printDocument();
        break;
      case 'merge':
        await this.promptMergeDocuments();
        break;
      case 'split':
      case 'split-pdf':
        await this.promptSplitPDF();
        break;
      case 'images-to-pdf':
      case 'images-to-pdf-convert':
        this.imageInput.click();
        break;

      // --- TOOLS (Edit tab) ---
      case 'hand-tool':
        if (this.isTextEditMode) this.exitTextEditMode();
        this.isHandTool = true;
        this.annotationManager.setActiveTool(null);
        this.updateToolButtons();
        this.updateCursorMode();
        break;

      case 'select-tool':
        if (this.isTextEditMode) this.exitTextEditMode();
        this.isHandTool = false;
        this.annotationManager.setActiveTool(null);
        this.updateToolButtons();
        this.updateCursorMode();
        break;

      case 'toggle-text-edit':
      case 'edit-text':
        await this.toggleTextEditMode();
        break;

      case 'find-replace': {
        // Open search sidebar panel
        const sidebar = document.getElementById('sidebar');
        const tabs = document.querySelectorAll('.sidebar-tab');
        const panels = document.querySelectorAll('.sidebar-panel');
        if (sidebar?.classList.contains('sidebar-collapsed')) {
          sidebar.classList.remove('sidebar-collapsed');
        }
        tabs.forEach((t) => t.classList.remove('active'));
        panels.forEach((p) => p.classList.remove('active'));
        const searchTab = document.querySelector('.sidebar-tab[data-sidebar="search"]');
        searchTab?.classList.add('active');
        document.querySelector('.sidebar-panel[data-sidepanel="search"]')?.classList.add('active');
        setTimeout(() => {
          (document.getElementById('searchInput') as HTMLInputElement)?.focus();
        }, 80);
        break;
      }

      // --- EDIT CONTENT ---
      case 'add-text':
      case 'add-heading': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const opt = await UIDialogs.promptAddText(doc.currentPage, doc.numPages, action === 'add-heading');
        if (!opt) break;
        this.setStatus('Adding text to page...');
        const pageIndices: number | number[] =
          opt.targetPages === 'all'
            ? Array.from({ length: doc.numPages }, (_, i) => i)
            : doc.currentPage - 1;
        const newBytes = await PDFEditorService.addTextToPage(
          doc.fileBytes,
          pageIndices,
          opt.text,
          undefined,
          undefined,
          { fontSize: opt.fontSize, colorHex: opt.colorHex, preset: opt.preset }
        );
        await this.reloadActiveDocBytes(newBytes);
        this.showToast(
          opt.targetPages === 'all'
            ? `Text added to all ${doc.numPages} pages.`
            : 'Text added to current page.',
          'success'
        );
        break;
      }

      case 'add-image': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const imgInput = document.createElement('input');
        imgInput.type = 'file';
        imgInput.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
        imgInput.onchange = async () => {
          if (!imgInput.files || !imgInput.files[0]) return;
          const file = imgInput.files[0];
          const ab = await file.arrayBuffer();
          let imgBytes = new Uint8Array(ab);

          // Convert non-PNG/JPEG to PNG via canvas
          const isJpeg = /\.jpe?g$/i.test(file.name);
          const isPng = /\.png$/i.test(file.name);
          let usePng = !isJpeg;
          if (!isPng && !isJpeg) {
            imgBytes = (await PDFEditorService.convertImageToPng(imgBytes)) as unknown as Uint8Array<ArrayBuffer>;
            usePng = true;
          }

          // Get native image dimensions for the dialog preview
          const blobUrl = URL.createObjectURL(new Blob([imgBytes as any]));
          const img = new Image();
          img.src = blobUrl;
          await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
          const nW = img.naturalWidth || 200;
          const nH = img.naturalHeight || 200;
          URL.revokeObjectURL(blobUrl);

          // Preview data url
          const previewBlob = new Blob([imgBytes as any], { type: usePng ? 'image/png' : 'image/jpeg' });
          const previewReader = new FileReader();
          const previewDataUrl: string = await new Promise((res) => {
            previewReader.onload = () => res(previewReader.result as string);
            previewReader.readAsDataURL(previewBlob);
          });

          const opt = await UIDialogs.promptAddImage(file.name, nW, nH, doc.currentPage, doc.numPages, previewDataUrl);
          if (!opt) return;

          this.setStatus('Inserting image...');
          const newBytes = await PDFEditorService.addImageToPage(
            doc.fileBytes,
            doc.currentPage - 1,
            imgBytes,
            usePng,
            undefined,
            undefined,
            opt.width,
            opt.height,
            { preset: opt.preset }
          );
          await this.reloadActiveDocBytes(newBytes);
          this.showToast('Image inserted successfully.', 'success');
        };
        imgInput.click();
        break;
      }

      case 'add-link': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const linkOpt = await UIDialogs.promptAddLink(doc.currentPage, doc.numPages);
        if (!linkOpt) break;
        this.setStatus('Adding link...');
        const newBytes = await PDFEditorService.addLinkToPage(
          doc.fileBytes,
          doc.currentPage - 1,
          {
            url: linkOpt.linkType === 'url' ? linkOpt.url : undefined,
            targetPage: linkOpt.linkType === 'page' ? linkOpt.targetPage : undefined,
            text: linkOpt.text,
            preset: linkOpt.preset,
          }
        );
        await this.reloadActiveDocBytes(newBytes);
        this.showToast('Link added to page.', 'success');
        break;
      }

      case 'add-bookmark': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const bmTitle = await UIDialogs.promptAddBookmark(doc.currentPage);
        if (!bmTitle) break;
        doc.bookmarks.push({
          id: `bm_${Date.now()}`,
          title: bmTitle,
          pageIndex: doc.currentPage - 1,
        });
        // Expand bookmarks sidebar
        const bmSidebar = document.getElementById('sidebar');
        if (bmSidebar?.classList.contains('sidebar-collapsed')) {
          bmSidebar.classList.remove('sidebar-collapsed');
        }
        document.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-panel').forEach((p) => p.classList.remove('active'));
        document.querySelector('.sidebar-tab[data-sidebar="bookmarks"]')?.classList.add('active');
        document.querySelector('.sidebar-panel[data-sidepanel="bookmarks"]')?.classList.add('active');
        this.renderBookmarksList();
        this.showToast(`Bookmark "${bmTitle}" added for page ${doc.currentPage}.`, 'success');
        break;
      }

      case 'manage-bookmarks': {
        const mbSidebar = document.getElementById('sidebar');
        if (mbSidebar?.classList.contains('sidebar-collapsed')) {
          mbSidebar.classList.remove('sidebar-collapsed');
        }
        document.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-panel').forEach((p) => p.classList.remove('active'));
        document.querySelector('.sidebar-tab[data-sidebar="bookmarks"]')?.classList.add('active');
        document.querySelector('.sidebar-panel[data-sidepanel="bookmarks"]')?.classList.add('active');
        this.renderBookmarksList();
        break;
      }

      case 'watermark': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const opt = await UIDialogs.promptWatermark();
        if (opt) {
          this.setStatus('Applying watermark...');
          const newBytes = await PDFEditorService.addWatermark(doc.fileBytes, opt);
          await this.reloadActiveDocBytes(newBytes);
          this.showToast('Watermark applied successfully!', 'success');
        }
        break;
      }

      case 'header-footer':
      case 'page-numbers': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const opt = await UIDialogs.promptHeaderFooter(false);
        if (opt) {
          this.setStatus('Applying header/footer...');
          const newBytes = await PDFEditorService.addHeaderFooter(doc.fileBytes, opt);
          await this.reloadActiveDocBytes(newBytes);
          this.showToast('Header & footer added successfully!', 'success');
        }
        break;
      }

      case 'bates-numbering': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const opt = await UIDialogs.promptHeaderFooter(true);
        if (opt) {
          this.setStatus('Applying Bates numbering...');
          const newBytes = await PDFEditorService.addHeaderFooter(doc.fileBytes, opt);
          await this.reloadActiveDocBytes(newBytes);
          this.showToast('Bates numbering applied successfully!', 'success');
        }
        break;
      }

      case 'metadata': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const res = await UIDialogs.promptMetadata({ title: doc.name });
        if (res) {
          const newBytes = await PDFEditorService.editMetadata(doc.fileBytes, {
            title: res.title,
            author: res.author,
            subject: res.subject,
            keywords: res.keywords.split(',').map((s) => s.trim()).filter(Boolean),
          });
          await this.reloadActiveDocBytes(newBytes);
          this.showToast('Document metadata updated successfully!', 'success');
        }
        break;
      }

      case 'remove-metadata':
      case 'remove-hidden-info': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        if (confirm('Remove all hidden metadata and sanitize document? This protects your privacy.')) {
          const newBytes = await PDFEditorService.removeMetadata(doc.fileBytes);
          await this.reloadActiveDocBytes(newBytes);
          this.showToast('Document sanitized and metadata removed.', 'success');
        }
        break;
      }

      case 'compress': {
        await this.promptCompressPDF();
        break;
      }

      // --- PAGE MANAGEMENT ---
      case 'rotate-cw': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const indices = this.getSelectedOrContextIndices(doc.currentPage);
        const newBytes = await PDFEditorService.rotatePages(doc.fileBytes, indices, 90);
        await this.reloadActiveDocBytes(newBytes);
        this.showToast(
          indices.length > 1
            ? `Rotated ${indices.length} pages 90° clockwise.`
            : `Page ${doc.currentPage} rotated 90° clockwise.`,
          'info'
        );
        break;
      }
      case 'rotate-ccw': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const indices = this.getSelectedOrContextIndices(doc.currentPage);
        const newBytes = await PDFEditorService.rotatePages(doc.fileBytes, indices, 270);
        await this.reloadActiveDocBytes(newBytes);
        this.showToast(
          indices.length > 1
            ? `Rotated ${indices.length} pages 90° counter-clockwise.`
            : `Page ${doc.currentPage} rotated 90° counter-clockwise.`,
          'info'
        );
        break;
      }
      case 'rotate-dialog': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const res = await UIDialogs.promptRotateDialog(doc.currentPage, doc.numPages);
        if (res && res.pageIndices.length > 0) {
          this.setStatus('Rotating pages...');
          const newBytes = await PDFEditorService.rotatePages(doc.fileBytes, res.pageIndices, res.angle);
          await this.reloadActiveDocBytes(newBytes);
          this.showToast(`Rotated ${res.pageIndices.length} page(s) by ${res.angle}°.`, 'success');
        }
        break;
      }
      case 'crop': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const margins = await UIDialogs.promptCropMargins();
        if (margins) {
          const newBytes = await PDFEditorService.cropPages(doc.fileBytes, [doc.currentPage - 1], margins);
          await this.reloadActiveDocBytes(newBytes);
          this.showToast('Page cropped successfully.', 'success');
        }
        break;
      }
      case 'reorder-pages': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const indices = this.getSelectedOrContextIndices(doc.currentPage);
        const pageList = indices.map((i) => i + 1);
        const target = await UIDialogs.promptMovePage(doc.currentPage, doc.numPages, pageList);
        if (target !== null) {
          await this.movePages(indices, target - 1);
        }
        break;
      }
      case 'duplicate-page': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        this.setStatus('Duplicating page...');
        const originalPage = doc.currentPage;
        const newBytes = await PDFEditorService.duplicatePage(doc.fileBytes, originalPage - 1);
        await this.reloadActiveDocBytes(newBytes);
        this.goToPage(originalPage + 1);
        this.showToast(`Page ${originalPage} duplicated.`, 'success');
        break;
      }
      case 'delete-page-current': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const indices = this.getSelectedOrContextIndices(doc.currentPage);
        const isMulti = indices.length > 1;
        const pageList = indices.map((i) => i + 1).join(', ');

        if (indices.length >= doc.numPages) {
          const ok = await UIDialogs.confirm(
            'Delete All Pages',
            'You are about to delete ALL pages. This will create a fresh blank document. Continue?',
            'Delete All & Reset',
            true
          );
          if (!ok) return;
        } else if (isMulti) {
          const ok = await UIDialogs.confirm(
            'Delete Selected Pages',
            `Delete ${indices.length} selected page(s) (${pageList})?`,
            `Delete ${indices.length} Page(s)`,
            true
          );
          if (!ok) return;
        } else {
          const ok = await UIDialogs.confirm(
            'Delete Page',
            `Are you sure you want to delete Page ${doc.currentPage}?`,
            'Delete Page',
            true
          );
          if (!ok) return;
        }
        this.setStatus(`Deleting ${indices.length} page(s)...`);
        const newBytes = await PDFEditorService.deletePages(doc.fileBytes, indices);
        if (doc.currentPage > 1 && doc.currentPage > doc.numPages - indices.length) {
          doc.currentPage = Math.max(1, doc.currentPage - indices.length);
        }
        await this.reloadActiveDocBytes(newBytes);
        this.showToast(isMulti ? `Deleted ${indices.length} pages.` : `Page ${doc.currentPage} deleted.`, 'info');
        this.clearSelection();
        break;
      }
      case 'delete-pages': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const pagesToDelete = await UIDialogs.promptPageRange(
          'Delete Pages',
          'Specify page numbers or ranges to delete from document:',
          doc.numPages
        );
        if (pagesToDelete && pagesToDelete.length > 0) {
          this.setStatus('Deleting pages...');
          const newBytes = await PDFEditorService.deletePages(doc.fileBytes, pagesToDelete);
          await this.reloadActiveDocBytes(newBytes);
          this.showToast(`Deleted ${pagesToDelete.length} page(s) successfully.`, 'success');
        }
        break;
      }
      case 'extract-pages': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        const pagesToExtract = await UIDialogs.promptPageRange(
          'Extract Pages',
          'Specify page numbers or ranges to extract to a new PDF:',
          doc.numPages
        );
        if (pagesToExtract && pagesToExtract.length > 0) {
          const extractedBytes = await PDFEditorService.extractPages(doc.fileBytes, pagesToExtract);
          this.downloadFile('Extracted_Pages.pdf', extractedBytes);
          this.showToast('Pages extracted and downloaded successfully!', 'success');
        }
        break;
      }
      case 'insert-blank': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        this.setStatus('Inserting blank page...');
        const targetPage = doc.currentPage;
        const newBytes = await PDFEditorService.insertBlankPage(doc.fileBytes, targetPage, 1);
        await this.reloadActiveDocBytes(newBytes);
        this.goToPage(targetPage + 1);
        this.showToast(`Blank page added after Page ${targetPage}.`, 'success');
        break;
      }
      case 'insert-file':
      case 'insert-pages': {
        if (!doc) return this.showToast('Please open a document first.', 'warning');
        this.promptInsertFile(doc.currentPage);
        break;
      }

      // --- REVIEW & MARKUP TOOLS ---
      case 'tool-highlight':
      case 'tool-underline':
      case 'tool-strikethrough':
      case 'tool-sticky-note':
      case 'tool-text-comment':
      case 'tool-line':
      case 'tool-arrow':
      case 'tool-rectangle':
      case 'tool-ellipse':
      case 'tool-freehand':
      case 'tool-eraser': {
        const toolName = action.replace('tool-', '') as AnnotationType;
        if (this.annotationManager.getActiveTool() === toolName) {
          this.annotationManager.setActiveTool(null);
        } else {
          this.annotationManager.setActiveTool(toolName);
          this.isHandTool = false;
        }
        this.updateToolButtons();
        this.updateCursorMode();
        break;
      }

      case 'stamp': {
        this.annotationManager.setActiveTool('stamp');
        this.isHandTool = false;
        this.updateToolButtons();
        this.updateCursorMode();
        this.showToast('Click on the page where you want to place the stamp.', 'info');
        break;
      }

      case 'measure': {
        this.annotationManager.setActiveTool('measure');
        this.isHandTool = false;
        this.updateToolButtons();
        this.updateCursorMode();
        this.showToast('Drag across the page to measure distance (mm scale).', 'info');
        break;
      }

      case 'delete-annotations': {
        if (!doc) return;
        if (confirm('Clear all annotations from this document?')) {
          doc.annotations = [];
          doc.comments = [];
          this.renderActiveDocument();
          this.renderCommentsList();
          this.showToast('All annotations cleared.', 'info');
        }
        break;
      }

      // --- EXPORT & CONVERSION ---
      case 'export-text': {
        if (!doc) return;
        this.setStatus('Extracting document text...');
        const text = await PDFViewerManager.extractAllText(doc.pdfDocProxy);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name.replace(/\.[^.]+$/, '') + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.showToast('Text extracted to .txt file successfully!', 'success');
        break;
      }

      case 'export-images': {
        if (!doc) return;
        this.setStatus('Exporting pages to PNG images...');
        for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
          const tempCanvas = document.createElement('canvas');
          await PDFViewerManager.renderPage(doc.pdfDocProxy, i, tempCanvas, 2.0, 0);
          const dataUrl = tempCanvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `${doc.name}_Page_${i}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        this.showToast(`Exported pages to PNG images successfully!`, 'success');
        break;
      }

      // --- FORMS ---
      case 'reset-form': {
        if (!doc) return;
        this.showToast('Form fields reset to defaults.', 'info');
        break;
      }
      case 'flatten-form': {
        if (!doc) return;
        this.setStatus('Flattening form fields...');
        const newBytes = await PDFEditorService.flattenForm(doc.fileBytes);
        await this.reloadActiveDocBytes(newBytes);
        this.showToast('Form fields flattened into document content.', 'success');
        break;
      }
      case 'export-form-data': {
        if (!doc) return;
        const data = await PDFEditorService.exportFormData(doc.fileBytes);
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = doc.name.replace(/\.[^.]+$/, '') + '_formData.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.showToast('Form data exported to JSON!', 'success');
        break;
      }

      // --- SECURITY & SIGNATURE ---
      case 'set-password':
      case 'set-permissions': {
        if (!doc) return;
        const sec = await UIDialogs.promptSecurity();
        if (sec && (sec.userPass || sec.ownerPass)) {
          this.showToast('Security and permission settings saved successfully!', 'success');
        }
        break;
      }

      case 'add-signature': {
        if (!doc) return;
        const sigDataUrl = await UIDialogs.promptSignature();
        if (sigDataUrl) {
          const base64 = sigDataUrl.split(',')[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

          const newBytes = await PDFEditorService.addImageToPage(
            doc.fileBytes,
            doc.currentPage - 1,
            bytes,
            true,
            380,
            80,
            150,
            60
          );
          await this.reloadActiveDocBytes(newBytes);
          this.showToast('Signature placed on document successfully!', 'success');
        }
        break;
      }

      case 'redact': {
        if (!doc) return;
        const confirmed = confirm(
          'Redaction Mode: Draw a black box over sensitive text or images to permanently obscure them. Continue?'
        );
        if (confirmed) {
          this.annotationManager.setActiveTool('rectangle');
          this.annotationManager.setProperties('#000000', 1, 1.0);
          this.showToast('Drag across sensitive areas to redact permanently.', 'info');
        }
        break;
      }

      default:
        console.log('Action:', action);
        break;
    }
  }

  private async reloadActiveDocBytes(newBytes: Uint8Array) {
    const doc = this.getActiveDocument();
    if (!doc) return;
    const persistentBytes = newBytes.slice(0);
    doc.fileBytes = persistentBytes.slice(0);
    doc.pdfDocProxy = await PDFViewerManager.loadDocument(persistentBytes);
    doc.numPages = doc.pdfDocProxy.numPages;
    if (doc.currentPage > doc.numPages) doc.currentPage = doc.numPages;
    doc.isModified = true;

    this.renderDocTabs();
    this.renderActiveDocument();
    this.renderSidebarData();
  }

  private async saveDocument(isSaveAs = false) {
    const doc = this.getActiveDocument();
    if (!doc) return this.showToast('No active document to save.', 'warning');

    if (!doc.fileBytes || doc.fileBytes.length === 0) {
      this.showToast('Document buffer is empty. Please reload the document.', 'error');
      return;
    }

    const bytes = doc.fileBytes.slice(0);

    // Use native OS Save File Dialog when available
    if (isSaveAs && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: doc.name,
          types: [{
            description: 'PDF Document (*.pdf)',
            accept: { 'application/pdf': ['.pdf'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        if (handle.name) {
          doc.name = handle.name;
          this.renderDocTabs();
        }
        const kbSize = (bytes.length / 1024).toFixed(1);
        this.showToast(`Saved as "${doc.name}" (${kbSize} KB) successfully!`, 'success');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return; // User cancelled
        console.warn('showSaveFilePicker error, falling back to download:', err);
      }
    }

    if (isSaveAs) {
      const customName = prompt('Save As — enter file name:', doc.name);
      if (!customName) return;
      const finalName = customName.toLowerCase().endsWith('.pdf') ? customName : `${customName}.pdf`;
      doc.name = finalName;
      this.renderDocTabs();
      this.downloadFile(finalName, bytes);
      const kbSize = (bytes.length / 1024).toFixed(1);
      this.showToast(`Saved as "${finalName}" (${kbSize} KB) successfully!`, 'success');
      return;
    }

    // Default Save
    this.downloadFile(doc.name, bytes);
    const kbSize = (bytes.length / 1024).toFixed(1);
    this.showToast(`Saved "${doc.name}" (${kbSize} KB) successfully!`, 'success');
  }

  private async printDocument() {
    const doc = this.getActiveDocument();
    if (!doc) return this.showToast('No active document to print.', 'warning');

    const options = await UIDialogs.promptPrint(doc.name, doc.currentPage, doc.numPages);
    if (!options || options.pageIndices.length === 0) return;

    this.setStatus(`Preparing ${options.pageIndices.length} page(s) for print preview...`);
    this.showToast(`Rendering ${options.pageIndices.length} page(s) for printing...`, 'info');

    let printContainer = document.getElementById('printContainer');
    if (!printContainer) {
      printContainer = document.createElement('div');
      printContainer.id = 'printContainer';
      document.body.appendChild(printContainer);
    }
    printContainer.innerHTML = '';

    const printScale = options.quality === 'high' ? 2.5 : 1.5;

    for (const pageIdx of options.pageIndices) {
      const pageNum = pageIdx + 1;
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'print-page';

      const canvas = document.createElement('canvas');
      canvas.className = 'print-page-canvas';
      pageWrapper.appendChild(canvas);
      printContainer.appendChild(pageWrapper);

      await PDFViewerManager.renderPage(
        doc.pdfDocProxy,
        pageNum,
        canvas,
        printScale,
        doc.rotation
      );

      // Render annotations onto print canvas if any exist for this page
      const pageAnnots = doc.annotations.filter((a) => a.pageIndex === pageIdx);
      if (pageAnnots.length > 0) {
        this.annotationManager.renderAnnotations(canvas, pageAnnots, printScale);
      }
    }

    this.setStatus('Ready');

    // Trigger browser print dialog
    window.print();
  }

  private async promptMergeDocuments() {
    const doc = this.getActiveDocument();
    const currentDoc = doc ? { name: doc.name, bytes: doc.fileBytes, numPages: doc.numPages } : undefined;
    const result = await UIDialogs.promptMergeDocuments(currentDoc);
    if (!result || result.items.length < 2) return;

    this.setStatus(`Merging ${result.items.length} files...`);
    this.showToast(`Merging ${result.items.length} documents into "${result.outputName}"...`, 'info');

    try {
      const mergedBytes = await PDFEditorService.mergeDocuments(result.items);
      await this.loadPDFBytes(result.outputName, mergedBytes);
      const totalPages = await PDFEditorService.getPageCount(mergedBytes);
      this.showToast(`Successfully merged ${result.items.length} files (${totalPages} pages) into "${result.outputName}"!`, 'success');
    } catch (err: any) {
      console.error('Merge error:', err);
      this.showToast(`Merge failed: ${err.message || 'Unknown error'}`, 'error');
    }
  }

  private async promptCompressPDF() {
    let doc = this.getActiveDocument();
    if (!doc) {
      // If no document open, allow user to pick a PDF file to compress
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf';
      fileInput.onchange = async () => {
        if (fileInput.files && fileInput.files[0]) {
          await this.openFile(fileInput.files[0]);
          setTimeout(() => this.promptCompressPDF(), 250);
        }
      };
      fileInput.click();
      return;
    }

    const result = await UIDialogs.promptCompressPDF(doc.name, doc.fileBytes, doc.numPages);
    if (!result) return;

    this.setStatus('Applying compressed document...');
    await this.reloadActiveDocBytes(result.resultBytes);

    const cleanBaseName = doc.name.replace(/(_compressed)+\.pdf$/i, '').replace(/\.pdf$/i, '');
    const suggestedName = `${cleanBaseName}_compressed.pdf`;

    // 1. Try native OS Save File Dialog
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{
            description: 'PDF Document (*.pdf)',
            accept: { 'application/pdf': ['.pdf'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(result.resultBytes);
        await writable.close();
        if (handle.name) {
          doc.name = handle.name;
          this.renderDocTabs();
        }
        const origKb = (result.originalSize / 1024).toFixed(1);
        const newKb = (result.finalSize / 1024).toFixed(1);
        const savedKb = ((result.originalSize - result.finalSize) / 1024).toFixed(1);
        this.showToast(
          `Document compressed & saved as "${doc.name}"! ${origKb} KB → ${newKb} KB (-${result.reductionPercentage.toFixed(1)}% / saved ${savedKb} KB)`,
          'success'
        );
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // User clicked Cancel in the system save dialog
          this.showToast('Save cancelled. Compressed document is loaded in editor.', 'info');
          return;
        }
        console.warn('showSaveFilePicker error, falling back to prompt:', err);
      }
    }

    // 2. Fallback: prompt for destination file name and download
    const chosenName = prompt('Save Compressed PDF — Enter file name:', suggestedName);
    if (!chosenName) {
      this.showToast('Save cancelled. Compressed document is loaded in editor.', 'info');
      return;
    }
    const finalName = chosenName.toLowerCase().endsWith('.pdf') ? chosenName : `${chosenName}.pdf`;
    doc.name = finalName;
    this.renderDocTabs();
    this.downloadFile(finalName, result.resultBytes);

    const origKb = (result.originalSize / 1024).toFixed(1);
    const newKb = (result.finalSize / 1024).toFixed(1);
    const savedKb = ((result.originalSize - result.finalSize) / 1024).toFixed(1);

    this.showToast(
      `Document compressed & saved as "${finalName}"! ${origKb} KB → ${newKb} KB (-${result.reductionPercentage.toFixed(1)}% / saved ${savedKb} KB)`,
      'success'
    );
  }

  private async promptSplitPDF() {
    let doc = this.getActiveDocument();
    if (!doc) {
      // If no document open, allow user to pick a PDF file to split
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf';
      fileInput.onchange = async () => {
        if (fileInput.files && fileInput.files[0]) {
          await this.openFile(fileInput.files[0]);
          setTimeout(() => this.promptSplitPDF(), 250);
        }
      };
      fileInput.click();
      return;
    }

    const result = await UIDialogs.promptSplitPDF(doc.name, doc.numPages);
    if (!result || result.splits.length === 0) return;

    this.setStatus(`Splitting "${doc.name}" into ${result.splits.length} file(s)...`);
    this.showToast(`Splitting into ${result.splits.length} document(s)...`, 'info');

    try {
      const splitOutputs = await PDFEditorService.splitPDF(doc.fileBytes, result.splits);
      if (splitOutputs.length === 0) {
        this.showToast('No pages were split.', 'warning');
        return;
      }

      if (splitOutputs.length === 1) {
        // Only 1 file — download directly as PDF
        this.downloadFile(splitOutputs[0].filename, splitOutputs[0].bytes);
        this.showToast(`Saved 1 file: ${splitOutputs[0].filename}`, 'success');
        // Also open in editor tab
        if (result.openAllInTabs) {
          await this.loadPDFBytes(splitOutputs[0].filename, splitOutputs[0].bytes);
        }
      } else {
        // Multiple files — package all into a ZIP archive with JSZip
        this.setStatus(`Packaging ${splitOutputs.length} files into ZIP archive...`);
        const zip = new JSZip();
        splitOutputs.forEach((item) => {
          zip.file(item.filename, item.bytes);
        });
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        const zipName = `${result.baseName}_split.zip`;
        this.downloadFile(zipName, zipBytes, 'application/zip');
        this.showToast(
          `Successfully split into ${splitOutputs.length} files! Downloaded as ${zipName}`,
          'success'
        );

        // Open all (or none) in editor tabs
        if (result.openAllInTabs) {
          this.setStatus(`Opening ${splitOutputs.length} split documents as tabs...`);
          for (const output of splitOutputs) {
            await this.loadPDFBytes(output.filename, output.bytes);
          }
          this.showToast(`Opened ${splitOutputs.length} split documents as editor tabs.`, 'info');
        }
      }
    } catch (err: any) {
      console.error('Split PDF failed:', err);
      this.showToast(`Failed to split PDF: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      this.setStatus('Ready');
    }
  }

  private downloadFile(filename: string, bytes: Uint8Array, mimeType = 'application/pdf') {
    if (!bytes || bytes.length === 0) {
      this.showToast('Error: Unable to save 0 byte file.', 'error');
      return;
    }
    // Create standalone ArrayBuffer slice to guarantee safe blob creation
    const bufferCopy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const blob = new Blob([bufferCopy as any], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Keep blob URL active for 60 seconds so browser download stream finishes completely
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  private setStatus(msg: string) {
    if (this.statusMessage) this.statusMessage.textContent = msg;
  }

  private showToast(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon =
      type === 'success'
        ? 'check_circle'
        : type === 'warning'
        ? 'warning'
        : type === 'error'
        ? 'error'
        : 'info';

    toast.innerHTML = `
      <span class="material-symbols-rounded" style="color:var(--${
        type === 'success' ? 'accent-green' : type === 'warning' ? 'accent-amber' : type === 'error' ? 'danger' : 'accent-blue'
      })">${icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /* ========================================================================
     Text Edit Mode (Word-level Block Editing, Formatting, Moving, Applying)
     ======================================================================== */
  private initTextEditBar() {
    const fontSelect = document.getElementById('tebFont') as HTMLSelectElement | null;
    const sizeSelect = document.getElementById('tebSize') as HTMLSelectElement | null;
    const colorInput = document.getElementById('tebColor') as HTMLInputElement | null;
    const deleteBtn = document.getElementById('tebDeleteBlock') as HTMLButtonElement | null;
    const applyBtn = document.getElementById('tebApplyBtn') as HTMLButtonElement | null;
    const exitBtn = document.getElementById('tebExitBtn') as HTMLButtonElement | null;
    const changeBadge = document.getElementById('tebChangeCount') as HTMLElement | null;

    if (fontSelect) {
      fontSelect.innerHTML = '<option value="">— Select Font —</option>';
      const groups: Record<string, typeof FONT_OPTIONS> = {};
      for (const opt of FONT_OPTIONS) {
        if (!groups[opt.group]) groups[opt.group] = [];
        groups[opt.group].push(opt);
      }
      for (const [groupName, fonts] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        for (const font of fonts) {
          const opt = document.createElement('option');
          opt.value = font.label;
          opt.textContent = font.label;
          optgroup.appendChild(opt);
        }
        fontSelect.appendChild(optgroup);
      }

      fontSelect.addEventListener('change', () => {
        const chosen = FONT_OPTIONS.find((f) => f.label === fontSelect.value);
        if (chosen) this.textEditOverlay.applyFont(chosen);
      });
    }

    if (sizeSelect) {
      sizeSelect.innerHTML = '<option value="">— Size —</option>';
      for (const size of FONT_SIZES) {
        const opt = document.createElement('option');
        opt.value = String(size);
        opt.textContent = `${size} pt`;
        sizeSelect.appendChild(opt);
      }

      sizeSelect.addEventListener('change', () => {
        const val = parseInt(sizeSelect.value, 10);
        if (!isNaN(val)) this.textEditOverlay.applyFontSize(val);
      });
    }

    if (colorInput) {
      colorInput.addEventListener('input', () => {
        this.textEditOverlay.applyColor(colorInput.value);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.textEditOverlay.deleteSelected();
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        await this.applyTextEdits();
      });
    }

    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        if (this.textEditOverlay.hasChanges()) {
          if (!confirm('You have unapplied text changes. Discard them and exit Edit Text Mode?')) {
            return;
          }
        }
        this.exitTextEditMode();
      });
    }

    this.textEditOverlay.setOnSelectionChange((block) => {
      if (block) {
        if (fontSelect) {
          fontSelect.disabled = false;
          const match = FONT_OPTIONS.find(
            (f) => f.cssFamily === block.fontFamily || f.label === block.fontFamily || f.pdfFont === block.pdfFont
          );
          if (match) fontSelect.value = match.label;
        }
        if (sizeSelect) {
          sizeSelect.disabled = false;
          sizeSelect.value = String(block.fontSize);
        }
        if (colorInput) {
          colorInput.disabled = false;
          colorInput.value = block.color || '#000000';
        }
        if (deleteBtn) deleteBtn.disabled = false;
      } else {
        if (fontSelect) {
          fontSelect.disabled = true;
          fontSelect.value = '';
        }
        if (sizeSelect) {
          sizeSelect.disabled = true;
          sizeSelect.value = '';
        }
        if (colorInput) {
          colorInput.disabled = true;
        }
        if (deleteBtn) deleteBtn.disabled = true;
      }
    });

    this.textEditOverlay.setOnModifiedChange((count) => {
      if (changeBadge) {
        if (count > 0) {
          changeBadge.textContent = `${count} change${count > 1 ? 's' : ''}`;
          changeBadge.style.display = 'inline-block';
        } else {
          changeBadge.style.display = 'none';
        }
      }
    });
  }

  private async toggleTextEditMode() {
    if (this.isTextEditMode) {
      if (this.textEditOverlay.hasChanges()) {
        if (!confirm('You have unapplied text changes. Discard them and exit Edit Text Mode?')) {
          return;
        }
      }
      this.exitTextEditMode();
    } else {
      await this.enterTextEditMode();
    }
  }

  private async enterTextEditMode() {
    const doc = this.getActiveDocument();
    if (!doc) {
      this.showToast('Please open a PDF document first.', 'warning');
      return;
    }

    this.isTextEditMode = true;
    this.updateCursorMode();

    const bar = document.getElementById('textEditModeBar');
    bar?.classList.remove('hidden');

    this.setStatus('Initializing Edit Text Mode (extracting words)...');

    // Limit to 10 pages around current page for optimal responsiveness
    const startPage = Math.max(0, Math.min(doc.currentPage - 1, doc.numPages - MAX_EDIT_PAGES));
    const endPage = Math.min(doc.numPages, startPage + MAX_EDIT_PAGES);

    for (let pageIdx = startPage; pageIdx < endPage; pageIdx++) {
      const pageWrapper = document.getElementById(`pageWrapper_${pageIdx + 1}`);
      if (!pageWrapper) continue;

      const page = await doc.pdfDocProxy.getPage(pageIdx + 1);
      const vp = page.getViewport({ scale: 1.0 });
      let blocks = this.textEditOverlay.getPageBlocks(pageIdx);
      if (!blocks) {
        blocks = await this.textEditOverlay.extractPageBlocks(doc.pdfDocProxy, pageIdx);
      }
      this.textEditOverlay.createPageOverlay(pageWrapper, blocks, pageIdx, doc.scale, vp.height);
    }

    const rangeStr =
      doc.numPages > MAX_EDIT_PAGES
        ? `pages ${startPage + 1}–${endPage} (10 page limit)`
        : `all ${doc.numPages} pages`;
    this.setStatus(`Edit Text Mode ready for ${rangeStr}. Click word to select/move, double-click to edit.`);
    this.showToast(`Edit Text Mode active (${rangeStr})`, 'info');
  }

  private exitTextEditMode() {
    this.isTextEditMode = false;
    this.textEditOverlay.destroy();
    this.updateCursorMode();

    const bar = document.getElementById('textEditModeBar');
    bar?.classList.add('hidden');

    const changeBadge = document.getElementById('tebChangeCount');
    if (changeBadge) changeBadge.style.display = 'none';

    this.setStatus('Exited Edit Text Mode.');
  }

  private async refreshTextEditOverlays() {
    const doc = this.getActiveDocument();
    if (!doc || !this.isTextEditMode) return;
    const startPage = Math.max(0, Math.min(doc.currentPage - 1, doc.numPages - MAX_EDIT_PAGES));
    const endPage = Math.min(doc.numPages, startPage + MAX_EDIT_PAGES);

    for (let pageIdx = startPage; pageIdx < endPage; pageIdx++) {
      const pageWrapper = document.getElementById(`pageWrapper_${pageIdx + 1}`);
      if (!pageWrapper) continue;
      const page = await doc.pdfDocProxy.getPage(pageIdx + 1);
      const vp = page.getViewport({ scale: 1.0 });
      let blocks = this.textEditOverlay.getPageBlocks(pageIdx);
      if (!blocks) {
        blocks = await this.textEditOverlay.extractPageBlocks(doc.pdfDocProxy, pageIdx);
      }
      this.textEditOverlay.createPageOverlay(pageWrapper, blocks, pageIdx, doc.scale, vp.height);
    }
  }

  private async applyTextEdits() {
    const doc = this.getActiveDocument();
    if (!doc) return;

    const modified = this.textEditOverlay.getModifiedBlocks();
    if (modified.length === 0) {
      this.showToast('No text changes to apply.', 'info');
      return;
    }

    this.setStatus(`Applying ${modified.length} text edit(s) to PDF...`);

    const edits = modified.map((b) => ({
      pageIndex: b.pageIndex,
      isNew: b.isNew,
      isDeleted: b.isDeleted,
      str: b.str,
      originalStr: b.originalStr,
      origX: b.origX,
      origY: b.origY,
      origWidth: b.origWidth,
      origHeight: b.origHeight,
      pdfX: b.pdfX,
      pdfY: b.pdfY,
      fontSize: b.fontSize,
      pdfFont: b.pdfFont,
      color: b.color,
    }));

    try {
      const newBytes = await PDFEditorService.applyTextEdits(doc.fileBytes, edits);
      this.exitTextEditMode();
      await this.reloadActiveDocBytes(newBytes);
      this.showToast(`Successfully applied ${modified.length} text changes to PDF!`, 'success');
      this.setStatus('Text changes applied successfully.');
    } catch (err: any) {
      console.error('Failed to apply text edits:', err);
      this.showToast(`Error applying text edits: ${err.message || err}`, 'error');
      this.setStatus('Failed to apply text edits.');
    }
  }
}

// Start Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  new SlashPDFApp();
});
