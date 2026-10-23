// Types and interfaces for SlashPDF

export interface PDFDocumentItem {
  id: string;
  name: string;
  fileBytes: Uint8Array;
  pdfDocProxy: any | null; // pdfjs-dist PDFDocumentProxy
  numPages: number;
  currentPage: number;
  scale: number;
  rotation: number;
  isModified: boolean;
  hasForms: boolean;
  isEncrypted: boolean;
  annotations: PageAnnotation[];
  bookmarks: PDFBookmark[];
  comments: PDFComment[];
  history?: DocumentHistorySnapshot[];
  historyIndex?: number;
}

export interface DocumentHistorySnapshot {
  fileBytes: Uint8Array;
  annotations: PageAnnotation[];
  bookmarks: PDFBookmark[];
  comments: PDFComment[];
  currentPage: number;
  description?: string;
}

export type AnnotationType = 
  | 'highlight' 
  | 'underline' 
  | 'strikethrough' 
  | 'sticky-note' 
  | 'text-comment' 
  | 'line' 
  | 'arrow' 
  | 'rectangle' 
  | 'ellipse' 
  | 'freehand' 
  | 'stamp'
  | 'measure'
  | 'eraser'
  | 'redact';

export interface PageAnnotation {
  id: string;
  pageIndex: number;
  type: AnnotationType;
  color: string;
  strokeWidth: number;
  opacity: number;
  points?: { x: number; y: number }[]; // For freehand, line, arrow
  rect?: { x: number; y: number; width: number; height: number }; // For shapes, highlight, stamp
  text?: string;
  author?: string;
  timestamp: string;
  extra?: any;
}

export interface PDFBookmark {
  id: string;
  title: string;
  pageIndex: number;
  children?: PDFBookmark[];
}

export interface PDFComment {
  id: string;
  pageIndex: number;
  author: string;
  text: string;
  timestamp: string;
  annotationId?: string;
}

export interface SearchResult {
  pageIndex: number;
  matchIndex: number;
  text: string;
  rects?: { x: number; y: number; width: number; height: number }[];
}

export type ViewLayoutMode = 'continuous' | 'single' | 'two-page';

export type CompressionPreset = 'light' | 'balanced' | 'strong' | 'target';

export interface PDFCompressOptions {
  preset: CompressionPreset;
  targetSizeKB?: number;
  removeMetadata?: boolean;
  compressImages?: boolean;
  rasterizePages?: boolean;
  onProgress?: (progressText: string) => void;
}

export interface PDFCompressResult {
  bytes: Uint8Array;
  originalSize: number;
  newSize: number;
  reductionPercentage: number;
  imagesCompressed: number;
  isTargetMet: boolean;
  message?: string;
  isRasterized?: boolean;
  isVectorHeavy?: boolean;
}

export interface PDFDocumentProfile {
  totalPages: number;
  imageCount: number;
  totalImageBytes: number;
  imageRatio: number;
  isVectorHeavy: boolean;
}

