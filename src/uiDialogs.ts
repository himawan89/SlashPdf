/**
 * Modal dialogs and prompt controllers for SlashPDF (English)
 */

import { PDFEditorService } from './pdfEditor';
import type { PDFCompressOptions, PDFCompressResult } from './types';

export interface ParsedPageRange {
  indices: number[];
  invalidTokens: string[];
  outOfRange: number[];
}

/**
 * Robust page range parser supporting commas, semicolons, dashes, and spaces.
 * Returns 0-based page indices in the order specified (without duplicates).
 */
export function parsePageRange(rangeStr: string, maxPages: number): ParsedPageRange {
  const result: number[] = [];
  const seen = new Set<number>();
  const invalidTokens: string[] = [];
  const outOfRange: number[] = [];

  if (!rangeStr || !rangeStr.trim()) {
    return { indices: [], invalidTokens: [], outOfRange: [] };
  }

  // Normalize semicolons, colons, and multiple spaces
  const normalized = rangeStr.replace(/[;:]/g, ',').trim();
  const parts = normalized.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Handle space-separated numbers if user typed e.g. "1 3 6"
    const subTokens = trimmed.includes('-') ? [trimmed] : trimmed.split(/\s+/).filter(Boolean);

    for (const token of subTokens) {
      if (token.includes('-')) {
        const sides = token.split('-').map((s) => s.trim());
        if (sides.length === 2 && sides[0] && sides[1]) {
          const start = parseInt(sides[0], 10);
          const end = parseInt(sides[1], 10);
          if (!isNaN(start) && !isNaN(end)) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            for (let p = min; p <= max; p++) {
              if (p < 1 || p > maxPages) {
                outOfRange.push(p);
              } else if (!seen.has(p - 1)) {
                seen.add(p - 1);
                result.push(p - 1);
              }
            }
            continue;
          }
        }
        invalidTokens.push(token);
      } else {
        const num = parseInt(token, 10);
        if (isNaN(num)) {
          invalidTokens.push(token);
        } else if (num < 1 || num > maxPages) {
          outOfRange.push(num);
        } else if (!seen.has(num - 1)) {
          seen.add(num - 1);
          result.push(num - 1);
        }
      }
    }
  }

  return { indices: result, invalidTokens, outOfRange };
}

export class UIDialogs {
  private static overlay = document.getElementById('dialogOverlay') as HTMLDivElement;
  private static container = document.getElementById('dialogContainer') as HTMLDivElement;

  static close() {
    this.overlay.classList.add('hidden');
    this.container.innerHTML = '';
  }

  static show(contentHtml: string, beforeConfirm?: () => boolean | Promise<boolean>): Promise<boolean> {
    return new Promise((resolve) => {
      this.container.innerHTML = contentHtml;
      this.overlay.classList.remove('hidden');

      const closeBtn = this.container.querySelector('.dialog-close-btn');
      const cancelBtn = this.container.querySelector('[data-dialog-action="cancel"]');
      const confirmBtn = this.container.querySelector('[data-dialog-action="confirm"]');

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        }
      };
      window.addEventListener('keydown', onKeyDown);

      const cleanup = (result: boolean) => {
        window.removeEventListener('keydown', onKeyDown);
        this.overlay.classList.add('hidden');
        resolve(result);
        // Delay clearing container so callers can read form inputs synchronously
        setTimeout(() => {
          if (this.overlay.classList.contains('hidden')) {
            this.container.innerHTML = '';
          }
        }, 150);
      };

      closeBtn?.addEventListener('click', () => cleanup(false));
      cancelBtn?.addEventListener('click', () => cleanup(false));
      confirmBtn?.addEventListener('click', async (e) => {
        if (beforeConfirm) {
          try {
            const ok = await beforeConfirm();
            if (!ok) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          } catch {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        cleanup(true);
      });
      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) cleanup(false);
      };
      this.container.onclick = (e) => {
        if (e.target === this.container) cleanup(false);
      };
    });
  }

  /**
   * Confirmation Dialog
   */
  static async confirm(title: string, message: string, confirmLabel = 'Confirm', isDanger = false): Promise<boolean> {
    const html = `
      <div class="dialog-modal" style="max-width: 420px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded" style="color: ${isDanger ? 'var(--danger)' : 'var(--primary)'}">${isDanger ? 'warning' : 'help'}</span> ${title}</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <p style="font-size: 13px; color: var(--text-main); line-height: 1.5; margin: 0;">${message}</p>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn ${isDanger ? 'danger' : 'primary'}" data-dialog-action="confirm">${confirmLabel}</button>
        </div>
      </div>
    `;
    return await this.show(html);
  }

  /**
   * Professional confirmation dialog for Clear All
   */
  static async promptConfirmClearReview(stats: {
    annotationsCount: number;
    commentsCount: number;
    hasHistory: boolean;
  }): Promise<{ action: 'clear-annotations' | 'revert-original' } | null> {
    const totalItems = stats.annotationsCount + stats.commentsCount;
    const html = `
      <div class="dialog-modal" style="max-width: 480px;">
        <div class="dialog-header">
          <h3>
            <span class="material-symbols-rounded" style="color: var(--danger, #ef4444); font-size: 22px;">delete_sweep</span>
            Clear All Review Edits
          </h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body" style="display:flex; flex-direction:column; gap:14px;">
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 12px; display: flex; gap: 10px; align-items: flex-start;">
            <span class="material-symbols-rounded" style="color: var(--danger, #ef4444); font-size: 22px; flex-shrink:0; margin-top:1px;">warning</span>
            <div style="font-size: 13px; line-height: 1.45; color: var(--text-main, #1e293b);">
              <strong>Are you sure you want to clear these edits?</strong>
              <div style="margin-top: 4px; color: var(--text-secondary, #64748b);">
                This operation will remove <strong>${totalItems} item${totalItems === 1 ? '' : 's'}</strong> (${stats.annotationsCount} markup${stats.annotationsCount === 1 ? '' : 's'}/shape${stats.annotationsCount === 1 ? '' : 's'} and ${stats.commentsCount} note${stats.commentsCount === 1 ? '' : 's'}) across all pages.
              </div>
            </div>
          </div>

          <div class="form-group" style="margin:0;">
            <label style="font-weight:600; margin-bottom:8px; display:block; font-size:12.5px;">Choose Action Scope:</label>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-size:13px; padding:10px 12px; border:1px solid var(--border-color, #e2e8f0); border-radius:8px; background:var(--bg-main, #ffffff);">
                <input type="radio" name="clearScope" value="clear-annotations" checked style="margin-top:3px;" />
                <div>
                  <strong>Clear Review Markups & Notes</strong>
                  <div style="font-size:11.5px; color:var(--text-secondary, #64748b); margin-top:2px;">
                    Removes all drawings, notes, shapes, highlights, stamps, and comments. Original PDF text and pages remain intact.
                  </div>
                </div>
              </label>

              ${stats.hasHistory ? `
              <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-size:13px; padding:10px 12px; border:1px solid var(--border-color, #e2e8f0); border-radius:8px; background:var(--bg-main, #ffffff);">
                <input type="radio" name="clearScope" value="revert-original" style="margin-top:3px;" />
                <div>
                  <strong>Revert Entire Document to Original</strong>
                  <div style="font-size:11.5px; color:var(--text-secondary, #64748b); margin-top:2px;">
                    Discards all unsaved edits, added content, and annotations, restoring the document to its original opened state.
                  </div>
                </div>
              </label>
              ` : ''}
            </div>
          </div>

          <div style="font-size: 11.5px; color: var(--text-secondary, #64748b); display: flex; align-items: center; gap: 6px; padding: 4px 2px;">
            <span class="material-symbols-rounded" style="font-size: 16px; color: var(--primary, #3b82f6);">info</span>
            <span>You can easily undo this action at any time using <strong>Ctrl+Z</strong>.</span>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn danger" data-dialog-action="confirm">
            <span class="material-symbols-rounded" style="font-size: 18px;">delete_sweep</span> Clear All
          </button>
        </div>
      </div>
    `;

    let chosenAction: 'clear-annotations' | 'revert-original' = 'clear-annotations';

    const ok = await this.show(html, () => {
      const checked = (document.querySelector('input[name="clearScope"]:checked') as HTMLInputElement)?.value;
      if (checked === 'revert-original' || checked === 'clear-annotations') {
        chosenAction = checked;
      }
      return true;
    });

    if (ok) {
      return { action: chosenAction };
    }
    return null;
  }

  /**
   * Watermark Dialog
   */
  static async promptWatermark(): Promise<{
    text: string;
    fontSize: number;
    angle: number;
    opacity: number;
    colorHex: string;
    pages: 'all' | 'odd' | 'even';
  } | null> {
    const html = `
      <div class="dialog-modal">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">branding_watermark</span> Add Watermark</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>Watermark Text</label>
            <input type="text" id="wmText" value="CONFIDENTIAL" />
          </div>
          <div style="display:flex; gap:12px;">
            <div class="form-group" style="flex:1;">
              <label>Font Size</label>
              <input type="number" id="wmSize" value="48" min="12" max="120" />
            </div>
            <div class="form-group" style="flex:1;">
              <label>Rotation Angle (°)</label>
              <input type="number" id="wmAngle" value="-45" min="-180" max="180" />
            </div>
          </div>
          <div style="display:flex; gap:12px;">
            <div class="form-group" style="flex:1;">
              <label>Opacity (%)</label>
              <input type="range" id="wmOpacity" min="5" max="100" value="25" />
            </div>
            <div class="form-group" style="flex:1;">
              <label>Color</label>
              <input type="color" id="wmColor" value="#dc2626" style="width:100%; height:36px; border:none; border-radius:4px;" />
            </div>
          </div>
          <div class="form-group">
            <label>Apply to Pages</label>
            <select id="wmPages">
              <option value="all">All Pages</option>
              <option value="odd">Odd Pages Only</option>
              <option value="even">Even Pages Only</option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Apply Watermark</button>
        </div>
      </div>
    `;

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    const text = (document.getElementById('wmText') as HTMLInputElement).value;
    const fontSize = parseInt((document.getElementById('wmSize') as HTMLInputElement).value, 10) || 48;
    const angle = parseInt((document.getElementById('wmAngle') as HTMLInputElement).value, 10) || -45;
    const opacity = (parseInt((document.getElementById('wmOpacity') as HTMLInputElement).value, 10) || 25) / 100;
    const colorHex = (document.getElementById('wmColor') as HTMLInputElement).value || '#dc2626';
    const pages = (document.getElementById('wmPages') as HTMLSelectElement).value as any;

    return { text, fontSize, angle, opacity, colorHex, pages };
  }

  /**
   * Header & Footer / Page Numbers / Bates Numbering Dialog
   * Provides preset dropdowns for Page Numbers and Bates Numbering,
   * position selection, and dynamic live page preview.
   */
  static async promptHeaderFooter(isBates = false, totalPages = 1): Promise<{
    headerLeft: string;
    headerCenter: string;
    headerRight: string;
    footerLeft: string;
    footerCenter: string;
    footerRight: string;
    startPage: number;
    prefix: string;
    isBates: boolean;
    batesDigits: number;
    fontSize?: number;
  } | null> {
    const totalCount = Math.max(1, totalPages);
    let activeMode: string = isBates ? 'bates' : 'page';

    const modalHtml = `
      <div class="dialog-modal" style="max-width: 580px; width: 95%;">
        <div class="dialog-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="material-symbols-rounded" style="color:var(--primary); font-size:22px;">format_list_numbered</span>
            <div>
              <h3 style="margin:0; font-size:14px; font-weight:600;" id="hfDialogTitle">
                ${isBates ? 'Bates Numbering (Legal / Audit)' : 'Page Numbers & Header / Footer'}
              </h3>
              <p style="margin:2px 0 0; font-size:11px; color:var(--text-muted); font-weight:normal;">
                Configure page numbering or legal Bates indexing with instant presets
              </p>
            </div>
          </div>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>

        <div class="dialog-body" style="padding: 14px 18px; max-height: 80vh; overflow-y: auto; display:flex; flex-direction:column; gap:12px;">
          <!-- Mode Tabs -->
          <div class="hf-mode-tabs">
            <button type="button" class="hf-mode-tab ${activeMode === 'page' ? 'active' : ''}" data-hf-tab="page">
              <span class="material-symbols-rounded" style="font-size:16px;">format_list_numbered</span>
              <span>Page Numbers</span>
            </button>
            <button type="button" class="hf-mode-tab ${activeMode === 'bates' ? 'active' : ''}" data-hf-tab="bates">
              <span class="material-symbols-rounded" style="font-size:16px;">pin</span>
              <span>Bates Numbering</span>
            </button>
            <button type="button" class="hf-mode-tab ${(activeMode as string) === 'custom' ? 'active' : ''}" data-hf-tab="custom">
              <span class="material-symbols-rounded" style="font-size:16px;">view_quilt</span>
              <span>Custom Header & Footer</span>
            </button>
          </div>

          <!-- PANEL 1: Page Numbers -->
          <div id="hfPanelPage" style="display:${activeMode === 'page' ? 'flex' : 'none'}; flex-direction:column; gap:10px;">
            <div class="form-group">
              <label style="display:flex; justify-content:space-between; align-items:center;">
                <span>Page Number Format</span>
                <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">Choose preset format</span>
              </label>
              <select id="hfPageFormatSelect">
                <option value="Page {page} of {total}" selected>Page 1 of ${totalCount} (Standard)</option>
                <option value="{page} of {total}">1 of ${totalCount} (Compact)</option>
                <option value="{page} / {total}">1 / ${totalCount} (Slash)</option>
                <option value="Page {page}">Page 1</option>
                <option value="{page}">1 (Number only)</option>
                <option value="custom">-- Custom Format... --</option>
              </select>
            </div>
            <div class="form-group" id="hfPageCustomWrap" style="display:none;">
              <label>Custom Template (Use {page} and {total} tags)</label>
              <input type="text" id="hfPageCustomInput" value="Page {page} of {total}" placeholder="e.g. Document - Page {page} of {total}" />
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="form-group">
                <label>Position</label>
                <select id="hfPagePositionSelect">
                  <option value="bottom-center" selected>Bottom — Center (Footer Center)</option>
                  <option value="bottom-right">Bottom — Right (Footer Right)</option>
                  <option value="bottom-left">Bottom — Left (Footer Left)</option>
                  <option value="top-center">Top — Center (Header Center)</option>
                  <option value="top-right">Top — Right (Header Right)</option>
                  <option value="top-left">Top — Left (Header Left)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Start at Page</label>
                <input type="number" id="hfPageStartInput" value="1" min="1" />
              </div>
            </div>

            <div class="form-group">
              <label>Font Size</label>
              <select id="hfPageFontSize">
                <option value="8">8 pt (Small)</option>
                <option value="9" selected>9 pt (Standard)</option>
                <option value="10">10 pt (Medium)</option>
                <option value="11">11 pt (Large)</option>
                <option value="12">12 pt (Extra Large)</option>
              </select>
            </div>
          </div>

          <!-- PANEL 2: Bates Numbering -->
          <div id="hfPanelBates" style="display:${activeMode === 'bates' ? 'flex' : 'none'}; flex-direction:column; gap:10px;">
            <div style="background:var(--primary-light, rgba(255,107,74,0.1)); border:1px solid var(--border-subtle); padding:8px 12px; border-radius:6px; font-size:11.5px; line-height:1.4; color:var(--text-main);">
              <strong>Bates Numbering:</strong> Standard sequential indexing used for legal discovery, audit trails, and court evidence with a prefix and fixed zero-padded digits.
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="form-group">
                <label>Bates Prefix (Case / Document Code)</label>
                <input type="text" id="batesPrefixInput" value="DOC-" placeholder="e.g. DOC-, EXHIBIT-, CONF-" />
              </div>
              <div class="form-group">
                <label>Number of Digits (Zero Padding)</label>
                <select id="batesDigitsSelect">
                  <option value="6" selected>6 Digits (DOC-000001)</option>
                  <option value="5">5 Digits (DOC-00001)</option>
                  <option value="4">4 Digits (DOC-0001)</option>
                  <option value="7">7 Digits (DOC-0000001)</option>
                  <option value="8">8 Digits (DOC-00000001)</option>
                  <option value="3">3 Digits (DOC-001)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label style="display:flex; justify-content:space-between; align-items:center;">
                <span>Bates Format</span>
                <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">Choose legal format preset</span>
              </label>
              <select id="batesFormatSelect">
                <option value="{prefix}{page}" selected>{prefix}000001 (Standard Legal Bates)</option>
                <option value="{prefix}{page} of {total}">{prefix}000001 of ${totalCount} (With Page Count)</option>
                <option value="CONFIDENTIAL — {prefix}{page}">CONFIDENTIAL — {prefix}000001</option>
                <option value="EXHIBIT {prefix}{page}">EXHIBIT {prefix}000001</option>
                <option value="AUDIT-{prefix}{page}">AUDIT-{prefix}000001</option>
                <option value="custom">-- Custom Format... --</option>
              </select>
            </div>
            <div class="form-group" id="batesCustomWrap" style="display:none;">
              <label>Custom Bates Template ({prefix}, {page}, {total})</label>
              <input type="text" id="batesCustomInput" value="{prefix}{page}" placeholder="e.g. CASE-{prefix}{page}" />
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="form-group">
                <label>Bates Position</label>
                <select id="batesPositionSelect">
                  <option value="bottom-right" selected>Bottom — Right (Bates Standard)</option>
                  <option value="bottom-center">Bottom — Center (Footer Center)</option>
                  <option value="bottom-left">Bottom — Left (Footer Left)</option>
                  <option value="top-right">Top — Right (Header Right)</option>
                  <option value="top-center">Top — Center (Header Center)</option>
                  <option value="top-left">Top — Left (Header Left)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Start Number</label>
                <input type="number" id="batesStartInput" value="1" min="1" />
              </div>
            </div>

            <div class="form-group">
              <label>Font Size</label>
              <select id="batesFontSize">
                <option value="8">8 pt (Small)</option>
                <option value="9">9 pt (Standard)</option>
                <option value="10" selected>10 pt (Medium)</option>
                <option value="11">11 pt (Large)</option>
                <option value="12">12 pt (Extra Large)</option>
              </select>
            </div>
          </div>

          <!-- PANEL 3: Custom Header & Footer (6 Manual Positions) -->
          <div id="hfPanelCustom" style="display:${(activeMode as string) === 'custom' ? 'flex' : 'none'}; flex-direction:column; gap:10px;">
            <p style="font-size:11.5px; color:var(--text-muted); margin:0;">
              Enter text directly into the desired positions. Use the quick tags below to insert variables.
            </p>

            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              <button type="button" class="dialog-btn hf-tag-btn" data-insert="{page}" style="padding:3px 8px; font-size:11px;">+ {page} Page Number</button>
              <button type="button" class="dialog-btn hf-tag-btn" data-insert="{total}" style="padding:3px 8px; font-size:11px;">+ {total} Total Pages</button>
              <button type="button" class="dialog-btn hf-tag-btn" data-insert="{prefix}" style="padding:3px 8px; font-size:11px;">+ {prefix} Prefix</button>
            </div>

            <div style="font-weight:600; font-size:12px; margin-top:2px;">Header (Top)</div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="hfHL" placeholder="Left" style="flex:1; padding:6px; font-size:12px;" />
              <input type="text" id="hfHC" placeholder="Center" style="flex:1; padding:6px; font-size:12px;" />
              <input type="text" id="hfHR" placeholder="Right" style="flex:1; padding:6px; font-size:12px;" />
            </div>

            <div style="font-weight:600; font-size:12px; margin-top:4px;">Footer (Bottom)</div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="hfFL" placeholder="Left" style="flex:1; padding:6px; font-size:12px;" />
              <input type="text" id="hfFC" placeholder="Center" value="Page {page} of {total}" style="flex:1; padding:6px; font-size:12px;" />
              <input type="text" id="hfFR" placeholder="Right" style="flex:1; padding:6px; font-size:12px;" />
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:4px;">
              <div class="form-group">
                <label>Start at Page</label>
                <input type="number" id="hfStart" value="1" min="1" />
              </div>
              <div class="form-group">
                <label>Font Size</label>
                <select id="hfCustomFontSize">
                  <option value="8">8 pt</option>
                  <option value="9" selected>9 pt (Standard)</option>
                  <option value="10">10 pt</option>
                  <option value="11">11 pt</option>
                  <option value="12">12 pt</option>
                </select>
              </div>
            </div>
          </div>

          <!-- LIVE VISUAL PREVIEW -->
          <div class="hf-preview-box">
            <div class="hf-preview-box-header">
              <span>PAGE PREVIEW</span>
              <span id="hfPreviewModeTag" class="hf-badge-info">Page Numbers</span>
            </div>
            <div class="hf-mini-page">
              <div class="hf-mini-page-header">
                <div class="hf-mini-slot left" id="hfPrevTL"></div>
                <div class="hf-mini-slot center" id="hfPrevTC"></div>
                <div class="hf-mini-slot right" id="hfPrevTR"></div>
              </div>

              <div class="hf-mini-page-content">
                <div class="hf-skeleton-line" style="width: 80%;"></div>
                <div class="hf-skeleton-line" style="width: 95%;"></div>
                <div class="hf-skeleton-line" style="width: 65%;"></div>
              </div>

              <div class="hf-mini-page-footer">
                <div class="hf-mini-slot left" id="hfPrevBL"></div>
                <div class="hf-mini-slot center" id="hfPrevBC"></div>
                <div class="hf-mini-slot right" id="hfPrevBR"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm" style="display:inline-flex; align-items:center; gap:6px;">
            <span class="material-symbols-rounded" style="font-size:16px;">check</span> Apply Numbers
          </button>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      this.container.innerHTML = modalHtml;
      this.overlay.classList.remove('hidden');

      // Elements
      const tabBtns = this.container.querySelectorAll<HTMLButtonElement>('.hf-mode-tab');
      const panelPage = document.getElementById('hfPanelPage')!;
      const panelBates = document.getElementById('hfPanelBates')!;
      const panelCustom = document.getElementById('hfPanelCustom')!;
      const modeTag = document.getElementById('hfPreviewModeTag')!;
      const dialogTitle = document.getElementById('hfDialogTitle')!;

      // Slots
      const slotTL = document.getElementById('hfPrevTL')!;
      const slotTC = document.getElementById('hfPrevTC')!;
      const slotTR = document.getElementById('hfPrevTR')!;
      const slotBL = document.getElementById('hfPrevBL')!;
      const slotBC = document.getElementById('hfPrevBC')!;
      const slotBR = document.getElementById('hfPrevBR')!;
      const allSlots = [slotTL, slotTC, slotTR, slotBL, slotBC, slotBR];

      const clearSlots = () => {
        allSlots.forEach((s) => {
          s.textContent = '';
          s.classList.remove('highlight');
        });
      };

      const updatePreview = () => {
        clearSlots();

        if (activeMode === 'page') {
          modeTag.textContent = 'Page Numbers';
          const formatSelect = document.getElementById('hfPageFormatSelect') as HTMLSelectElement;
          const customWrap = document.getElementById('hfPageCustomWrap') as HTMLDivElement;
          const customInput = document.getElementById('hfPageCustomInput') as HTMLInputElement;
          const isCustom = formatSelect.value === 'custom';
          customWrap.style.display = isCustom ? 'flex' : 'none';

          const template = isCustom ? customInput.value : formatSelect.value;
          const startNum = parseInt((document.getElementById('hfPageStartInput') as HTMLInputElement).value, 10) || 1;
          const text = template
            .replace(/\{page\}/g, String(startNum))
            .replace(/\{total\}/g, String(totalCount));

          const pos = (document.getElementById('hfPagePositionSelect') as HTMLSelectElement).value;
          let targetSlot = slotBC;
          if (pos === 'bottom-center') targetSlot = slotBC;
          else if (pos === 'bottom-right') targetSlot = slotBR;
          else if (pos === 'bottom-left') targetSlot = slotBL;
          else if (pos === 'top-center') targetSlot = slotTC;
          else if (pos === 'top-right') targetSlot = slotTR;
          else if (pos === 'top-left') targetSlot = slotTL;

          targetSlot.textContent = text;
          targetSlot.classList.add('highlight');

        } else if (activeMode === 'bates') {
          modeTag.textContent = 'Bates Numbering';
          const formatSelect = document.getElementById('batesFormatSelect') as HTMLSelectElement;
          const customWrap = document.getElementById('batesCustomWrap') as HTMLDivElement;
          const customInput = document.getElementById('batesCustomInput') as HTMLInputElement;
          const isCustom = formatSelect.value === 'custom';
          customWrap.style.display = isCustom ? 'flex' : 'none';

          const template = isCustom ? customInput.value : formatSelect.value;
          const prefix = (document.getElementById('batesPrefixInput') as HTMLInputElement).value || '';
          const digits = parseInt((document.getElementById('batesDigitsSelect') as HTMLSelectElement).value, 10) || 6;
          const startNum = parseInt((document.getElementById('batesStartInput') as HTMLInputElement).value, 10) || 1;
          const numStr = String(startNum).padStart(digits, '0');

          const text = template
            .replace(/\{prefix\}/g, prefix)
            .replace(/\{page\}/g, numStr)
            .replace(/\{total\}/g, String(totalCount));

          const pos = (document.getElementById('batesPositionSelect') as HTMLSelectElement).value;
          let targetSlot = slotBR;
          if (pos === 'bottom-right') targetSlot = slotBR;
          else if (pos === 'bottom-center') targetSlot = slotBC;
          else if (pos === 'bottom-left') targetSlot = slotBL;
          else if (pos === 'top-right') targetSlot = slotTR;
          else if (pos === 'top-center') targetSlot = slotTC;
          else if (pos === 'top-left') targetSlot = slotTL;

          targetSlot.textContent = text;
          targetSlot.classList.add('highlight');

        } else if (activeMode === 'custom') {
          modeTag.textContent = 'Custom Header/Footer';
          const startNum = parseInt((document.getElementById('hfStart') as HTMLInputElement).value, 10) || 1;
          const formatCustom = (val: string) =>
            val.replace(/\{page\}/g, String(startNum)).replace(/\{total\}/g, String(totalCount)).replace(/\{prefix\}/g, 'DOC-');

          const hl = (document.getElementById('hfHL') as HTMLInputElement).value;
          const hc = (document.getElementById('hfHC') as HTMLInputElement).value;
          const hr = (document.getElementById('hfHR') as HTMLInputElement).value;
          const fl = (document.getElementById('hfFL') as HTMLInputElement).value;
          const fc = (document.getElementById('hfFC') as HTMLInputElement).value;
          const fr = (document.getElementById('hfFR') as HTMLInputElement).value;

          if (hl) { slotTL.textContent = formatCustom(hl); slotTL.classList.add('highlight'); }
          if (hc) { slotTC.textContent = formatCustom(hc); slotTC.classList.add('highlight'); }
          if (hr) { slotTR.textContent = formatCustom(hr); slotTR.classList.add('highlight'); }
          if (fl) { slotBL.textContent = formatCustom(fl); slotBL.classList.add('highlight'); }
          if (fc) { slotBC.textContent = formatCustom(fc); slotBC.classList.add('highlight'); }
          if (fr) { slotBR.textContent = formatCustom(fr); slotBR.classList.add('highlight'); }
        }
      };

      // Tab switching
      tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          tabBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          activeMode = btn.dataset.hfTab as any;

          panelPage.style.display = activeMode === 'page' ? 'flex' : 'none';
          panelBates.style.display = activeMode === 'bates' ? 'flex' : 'none';
          panelCustom.style.display = activeMode === 'custom' ? 'flex' : 'none';

          if (activeMode === 'page') dialogTitle.textContent = 'Page Numbers & Header / Footer';
          else if (activeMode === 'bates') dialogTitle.textContent = 'Bates Numbering (Legal / Audit)';
          else dialogTitle.textContent = 'Custom Header & Footer';

          updatePreview();
        });
      });

      // Listen to inputs
      this.container.querySelectorAll('input, select').forEach((el) => {
        el.addEventListener('input', updatePreview);
        el.addEventListener('change', updatePreview);
      });

      // Quick tags insert for custom mode
      let lastFocusedInput: HTMLInputElement | null = null;
      ['hfHL', 'hfHC', 'hfHR', 'hfFL', 'hfFC', 'hfFR'].forEach((id) => {
        const inp = document.getElementById(id) as HTMLInputElement | null;
        inp?.addEventListener('focus', () => { lastFocusedInput = inp; });
      });

      this.container.querySelectorAll('.hf-tag-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const tag = (btn as HTMLElement).dataset.insert || '';
          const target = lastFocusedInput || (document.getElementById('hfFC') as HTMLInputElement);
          if (target) {
            target.value = (target.value ? target.value + ' ' : '') + tag;
            updatePreview();
            target.focus();
          }
        });
      });

      updatePreview();

      const closeBtn = this.container.querySelector('.dialog-close-btn');
      const cancelBtn = this.container.querySelector('[data-dialog-action="cancel"]');
      const confirmBtn = this.container.querySelector('[data-dialog-action="confirm"]');

      const cleanup = (result: boolean) => {
        this.overlay.classList.add('hidden');
        if (!result) {
          resolve(null);
        } else {
          // Read result according to activeMode
          if (activeMode === 'page') {
            const formatSelect = document.getElementById('hfPageFormatSelect') as HTMLSelectElement;
            const customInput = document.getElementById('hfPageCustomInput') as HTMLInputElement;
            const template = formatSelect.value === 'custom' ? (customInput.value.trim() || '{page}') : formatSelect.value;
            const pos = (document.getElementById('hfPagePositionSelect') as HTMLSelectElement).value;
            const startPage = parseInt((document.getElementById('hfPageStartInput') as HTMLInputElement).value, 10) || 1;
            const fontSize = parseInt((document.getElementById('hfPageFontSize') as HTMLSelectElement).value, 10) || 9;

            let hl = '', hc = '', hr = '', fl = '', fc = '', fr = '';
            if (pos === 'bottom-center') fc = template;
            else if (pos === 'bottom-right') fr = template;
            else if (pos === 'bottom-left') fl = template;
            else if (pos === 'top-center') hc = template;
            else if (pos === 'top-right') hr = template;
            else if (pos === 'top-left') hl = template;

            resolve({
              headerLeft: hl,
              headerCenter: hc,
              headerRight: hr,
              footerLeft: fl,
              footerCenter: fc,
              footerRight: fr,
              startPage,
              prefix: '',
              isBates: false,
              batesDigits: 6,
              fontSize,
            });
          } else if (activeMode === 'bates') {
            const formatSelect = document.getElementById('batesFormatSelect') as HTMLSelectElement;
            const customInput = document.getElementById('batesCustomInput') as HTMLInputElement;
            const template = formatSelect.value === 'custom' ? (customInput.value.trim() || '{prefix}{page}') : formatSelect.value;
            const prefix = (document.getElementById('batesPrefixInput') as HTMLInputElement).value || '';
            const digits = parseInt((document.getElementById('batesDigitsSelect') as HTMLSelectElement).value, 10) || 6;
            const pos = (document.getElementById('batesPositionSelect') as HTMLSelectElement).value;
            const startPage = parseInt((document.getElementById('batesStartInput') as HTMLInputElement).value, 10) || 1;
            const fontSize = parseInt((document.getElementById('batesFontSize') as HTMLSelectElement).value, 10) || 10;

            let hl = '', hc = '', hr = '', fl = '', fc = '', fr = '';
            if (pos === 'bottom-right') fr = template;
            else if (pos === 'bottom-center') fc = template;
            else if (pos === 'bottom-left') fl = template;
            else if (pos === 'top-right') hr = template;
            else if (pos === 'top-center') hc = template;
            else if (pos === 'top-left') hl = template;

            resolve({
              headerLeft: hl,
              headerCenter: hc,
              headerRight: hr,
              footerLeft: fl,
              footerCenter: fc,
              footerRight: fr,
              startPage,
              prefix,
              isBates: true,
              batesDigits: digits,
              fontSize,
            });
          } else {
            // custom mode
            const fontSize = parseInt((document.getElementById('hfCustomFontSize') as HTMLSelectElement).value, 10) || 9;
            resolve({
              headerLeft: (document.getElementById('hfHL') as HTMLInputElement).value,
              headerCenter: (document.getElementById('hfHC') as HTMLInputElement).value,
              headerRight: (document.getElementById('hfHR') as HTMLInputElement).value,
              footerLeft: (document.getElementById('hfFL') as HTMLInputElement).value,
              footerCenter: (document.getElementById('hfFC') as HTMLInputElement).value,
              footerRight: (document.getElementById('hfFR') as HTMLInputElement).value,
              startPage: parseInt((document.getElementById('hfStart') as HTMLInputElement).value, 10) || 1,
              prefix: 'DOC-',
              isBates: false,
              batesDigits: 6,
              fontSize,
            });
          }
        }

        setTimeout(() => {
          if (this.overlay.classList.contains('hidden')) {
            this.container.innerHTML = '';
          }
        }, 150);
      };

      closeBtn?.addEventListener('click', () => cleanup(false));
      cancelBtn?.addEventListener('click', () => cleanup(false));
      confirmBtn?.addEventListener('click', () => cleanup(true));
    });
  }

  /**
   * Delete / Extract Pages Range Dialog
   */
  static async promptPageRange(title: string, promptText: string, totalPages: number): Promise<number[] | null> {
    const html = `
      <div class="dialog-modal">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">filter_none</span> ${title}</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <p style="font-size:12px; color:var(--text-muted);">${promptText}</p>
          <div class="form-group">
            <label>Page Range (e.g. 1, 3-5, 8)</label>
            <input type="text" id="pageRangeInput" placeholder="e.g. 1, 2-4" value="1" />
          </div>
          <div style="font-size:11px; color:var(--text-light);">Total pages in document: ${totalPages}</div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Proceed</button>
        </div>
      </div>
    `;

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    const val = (document.getElementById('pageRangeInput') as HTMLInputElement).value;
    const pages: Set<number> = new Set();
    const parts = val.split(',');

    parts.forEach((p) => {
      const trimmed = p.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map((s) => parseInt(s.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            if (i >= 1 && i <= totalPages) pages.add(i - 1);
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
          pages.add(num - 1);
        }
      }
    });

    return Array.from(pages);
  }

  /**
   * Crop Margins Dialog
   */
  static async promptCropMargins(): Promise<{ top: number; right: number; bottom: number; left: number } | null> {
    const html = `
      <div class="dialog-modal">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">crop</span> Crop Page Margins</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <p style="font-size:12px; color:var(--text-muted);">Enter margins to crop (in points, 1 inch = 72 pt):</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group">
              <label>Top</label>
              <input type="number" id="cropTop" value="36" min="0" />
            </div>
            <div class="form-group">
              <label>Bottom</label>
              <input type="number" id="cropBottom" value="36" min="0" />
            </div>
            <div class="form-group">
              <label>Left</label>
              <input type="number" id="cropLeft" value="36" min="0" />
            </div>
            <div class="form-group">
              <label>Right</label>
              <input type="number" id="cropRight" value="36" min="0" />
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Apply Crop</button>
        </div>
      </div>
    `;

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    return {
      top: parseInt((document.getElementById('cropTop') as HTMLInputElement).value, 10) || 0,
      right: parseInt((document.getElementById('cropRight') as HTMLInputElement).value, 10) || 0,
      bottom: parseInt((document.getElementById('cropBottom') as HTMLInputElement).value, 10) || 0,
      left: parseInt((document.getElementById('cropLeft') as HTMLInputElement).value, 10) || 0,
    };
  }

  /**
   * Password & Permissions Dialog
   */
  static async promptSecurity(): Promise<{
    userPass: string;
    ownerPass: string;
    allowPrinting: boolean;
    allowCopying: boolean;
    allowModifying: boolean;
  } | null> {
    const html = `
      <div class="dialog-modal">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">lock</span> Password Protection & Permissions</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>Document Open Password (User Password)</label>
            <input type="password" id="secUserPass" placeholder="Enter password to open document..." />
          </div>
          <div class="form-group">
            <label>Permissions Password (Owner Password)</label>
            <input type="password" id="secOwnerPass" placeholder="Required to change security permissions..." />
          </div>
          <div style="font-weight:600; font-size:12px; margin-top:8px;">Document Permissions:</div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="display:flex; align-items:center; gap:8px; font-size:12px;">
              <input type="checkbox" id="secPrint" checked /> Allow Printing
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:12px;">
              <input type="checkbox" id="secCopy" checked /> Allow Copying Text & Images
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:12px;">
              <input type="checkbox" id="secModify" checked /> Allow Modifying Document
            </label>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Apply Security</button>
        </div>
      </div>
    `;

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    return {
      userPass: (document.getElementById('secUserPass') as HTMLInputElement).value,
      ownerPass: (document.getElementById('secOwnerPass') as HTMLInputElement).value,
      allowPrinting: (document.getElementById('secPrint') as HTMLInputElement).checked,
      allowCopying: (document.getElementById('secCopy') as HTMLInputElement).checked,
      allowModifying: (document.getElementById('secModify') as HTMLInputElement).checked,
    };
  }

  /**
   * Metadata Dialog
   */
  static async promptMetadata(meta: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
  }): Promise<{ title: string; author: string; subject: string; keywords: string } | null> {
    const html = `
      <div class="dialog-modal">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">info</span> Edit Document Metadata</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>Title</label>
            <input type="text" id="metaTitle" value="${meta.title || ''}" />
          </div>
          <div class="form-group">
            <label>Author</label>
            <input type="text" id="metaAuthor" value="${meta.author || ''}" />
          </div>
          <div class="form-group">
            <label>Subject</label>
            <input type="text" id="metaSubject" value="${meta.subject || ''}" />
          </div>
          <div class="form-group">
            <label>Keywords (comma separated)</label>
            <input type="text" id="metaKeywords" value="${(meta.keywords || []).join(', ')}" />
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Save Metadata</button>
        </div>
      </div>
    `;

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    return {
      title: (document.getElementById('metaTitle') as HTMLInputElement).value,
      author: (document.getElementById('metaAuthor') as HTMLInputElement).value,
      subject: (document.getElementById('metaSubject') as HTMLInputElement).value,
      keywords: (document.getElementById('metaKeywords') as HTMLInputElement).value,
    };
  }

  /**
   * Stamp Selector Dialog
   */
  static promptStamp(): Promise<{
    text: string;
    color: string;
    lines: string[];
  } | null> {
    const stampPresets = [
      { label: 'APPROVED', color: '#16a34a' },
      { label: 'CONFIDENTIAL', color: '#dc2626' },
      { label: 'DRAFT', color: '#d97706' },
      { label: 'FINAL', color: '#2563eb' },
      { label: 'REJECTED', color: '#dc2626' },
      { label: 'REVIEWED', color: '#9333ea' },
    ];

    const presetBtns = stampPresets
      .map(
        (s) => `
        <button type="button" class="stamp-preset-btn" data-label="${s.label}" data-color="${s.color}"
          style="font-weight:800; color:${s.color}; border:2px solid ${s.color}; background:transparent;
                 border-radius:6px; padding:6px 14px; cursor:pointer; font-size:12px; letter-spacing:1px;">
          ${s.label}
        </button>
      `
      )
      .join('');

    const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `
      <div class="dialog-modal" style="max-width:480px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">approval</span> Stamp Editor</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body" style="display:flex; flex-direction:column; gap:14px;">
          <div>
            <label style="font-size:11px; color:var(--text-light); margin-bottom:6px; display:block;">Quick Presets</label>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${presetBtns}
            </div>
          </div>
          <div style="border-top:1px solid var(--border-subtle); padding-top:14px;">
            <label style="font-size:11px; color:var(--text-light); margin-bottom:8px; display:block;">
              Stamp Lines — <span style="font-style:italic;">customize each row</span>
            </label>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div class="form-group" style="margin:0;">
                <label>Line 1 — Status / Header</label>
                <input type="text" id="stampLine1" value="APPROVED" placeholder="e.g. APPROVED" style="font-weight:700; letter-spacing:1px;" />
              </div>
              <div class="form-group" style="margin:0;">
                <label>Line 2 — Name</label>
                <input type="text" id="stampLine2" placeholder="e.g. Budi Santoso" />
              </div>
              <div class="form-group" style="margin:0;">
                <label>Line 3 — Title / Position</label>
                <input type="text" id="stampLine3" placeholder="e.g. Manager Keuangan" />
              </div>
              <div class="form-group" style="margin:0;">
                <label>Line 4 — Date</label>
                <input type="text" id="stampLine4" value="${today}" placeholder="e.g. 20 Oktober 2026" />
              </div>
            </div>
          </div>
          <div style="display:flex; gap:16px; align-items:flex-end; border-top:1px solid var(--border-subtle); padding-top:14px;">
            <div class="form-group" style="margin:0; flex:1;">
              <label>Stamp Color</label>
              <input type="color" id="stampColor" value="#dc2626" style="height:36px; padding:2px 4px; cursor:pointer;" />
            </div>
            <div style="flex:2;">
              <label style="font-size:11px; color:var(--text-light); display:block; margin-bottom:4px;">Preview</label>
              <div id="stampPreview" style="border:2.5px solid #dc2626; border-radius:4px; padding:8px 16px;
                   font-family:sans-serif; text-align:center; background:transparent; min-height:64px;
                   display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;">
                <span id="pvLine1" style="font-weight:900; font-size:18px; color:#dc2626; letter-spacing:2px;">APPROVED</span>
                <span id="pvLine2" style="font-size:11px; color:#dc2626;"></span>
                <span id="pvLine3" style="font-size:11px; color:#dc2626;"></span>
                <span id="pvLine4" style="font-size:11px; color:#dc2626;">${today}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">
            <span class="material-symbols-rounded">add</span> Place Stamp
          </button>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      this.container.innerHTML = html;
      this.overlay.classList.remove('hidden');

      // Wire up live preview
      const colorInput = document.getElementById('stampColor') as HTMLInputElement;
      const inputs = [1, 2, 3, 4].map((n) => document.getElementById(`stampLine${n}`) as HTMLInputElement);
      const pvSpans = [1, 2, 3, 4].map((n) => document.getElementById(`pvLine${n}`));
      const previewEl = document.getElementById('stampPreview');

      const updatePreview = () => {
        const color = colorInput?.value || '#dc2626';
        pvSpans.forEach((sp, i) => {
          if (sp) { sp.textContent = inputs[i]?.value || ''; sp.style.color = color; }
        });
        if (previewEl) previewEl.style.borderColor = color;
      };

      inputs.forEach((inp) => inp?.addEventListener('input', updatePreview));
      colorInput?.addEventListener('input', updatePreview);

      document.querySelectorAll<HTMLButtonElement>('.stamp-preset-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const label = btn.dataset.label || '';
          const color = btn.dataset.color || '#dc2626';
          if (inputs[0]) inputs[0].value = label;
          if (colorInput) colorInput.value = color;
          updatePreview();
        });
      });

      const cleanup = (ok: boolean) => {
        this.overlay.classList.add('hidden');
        if (!ok) {
          setTimeout(() => { if (this.overlay.classList.contains('hidden')) this.container.innerHTML = ''; }, 150);
          resolve(null);
          return;
        }
        const lines = inputs.map((inp) => (inp?.value || '').trim()).filter(Boolean);
        const color = colorInput?.value || '#dc2626';
        setTimeout(() => { if (this.overlay.classList.contains('hidden')) this.container.innerHTML = ''; }, 150);
        resolve({ text: lines.join('\n'), color, lines });
      };

      this.container.querySelector('.dialog-close-btn')?.addEventListener('click', () => cleanup(false));
      this.container.querySelector('[data-dialog-action="cancel"]')?.addEventListener('click', () => cleanup(false));
      this.container.querySelector('[data-dialog-action="confirm"]')?.addEventListener('click', () => cleanup(true));
      this.overlay.onclick = (e) => { if (e.target === this.overlay) cleanup(false); };
    });
  }


  /**
   * Note Text Input Dialog (for sticky notes and comments)
   */
  static promptNoteText(title: string, placeholder = 'Type your note here...', initialValue = ''): Promise<string | null> {
    const html = `
      <div class="dialog-modal" style="max-width:420px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">sticky_note_2</span> ${title}</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div class="form-group" style="margin:0;">
            <label>Note Text</label>
            <textarea id="noteTextInput" rows="4" placeholder="${placeholder}"
              style="resize:vertical; min-height:80px; font-size:13px; line-height:1.5;">${initialValue}</textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">
            <span class="material-symbols-rounded">check</span> ${initialValue ? 'Save Note' : 'Add Note'}
          </button>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      this.container.innerHTML = html;
      this.overlay.classList.remove('hidden');

      const textarea = document.getElementById('noteTextInput') as HTMLTextAreaElement;
      setTimeout(() => {
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      }, 50);

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        }
      };
      window.addEventListener('keydown', onKeyDown);

      // Allow Ctrl+Enter to confirm
      textarea?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          cleanup(true);
        }
      });

      const cleanup = (ok: boolean) => {
        window.removeEventListener('keydown', onKeyDown);
        this.overlay.classList.add('hidden');
        const value = (document.getElementById('noteTextInput') as HTMLTextAreaElement)?.value?.trim() || '';
        setTimeout(() => { if (this.overlay.classList.contains('hidden')) this.container.innerHTML = ''; }, 150);
        resolve(ok && value ? value : null);
      };

      this.container.querySelector('.dialog-close-btn')?.addEventListener('click', () => cleanup(false));
      this.container.querySelector('[data-dialog-action="cancel"]')?.addEventListener('click', () => cleanup(false));
      this.container.querySelector('[data-dialog-action="confirm"]')?.addEventListener('click', () => cleanup(true));
      this.overlay.onclick = (e) => { if (e.target === this.overlay) cleanup(false); };
    });
  }

  /**
   * Signature Drawing & Text Dialog

   */
  static async promptSignature(): Promise<string | null> {
    const html = `
      <div class="dialog-modal" style="max-width:500px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">draw</span> Create Signature</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <button type="button" class="dialog-btn primary" id="sigTabDraw" style="flex:1;">Draw Signature</button>
            <button type="button" class="dialog-btn" id="sigTabType" style="flex:1;">Type Name</button>
          </div>
          <div id="sigDrawArea">
            <div class="sig-pad-wrap">
              <canvas id="sigCanvas" width="460" height="180"></canvas>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
              <span style="font-size:11px; color:var(--text-light);">Sign using mouse, stylus, or touch screen</span>
              <button type="button" class="dialog-btn" id="sigClearBtn" style="padding:4px 8px; font-size:11px;">Clear</button>
            </div>
          </div>
          <div id="sigTypeArea" class="hidden">
            <div class="form-group">
              <label>Type Full Name</label>
              <input type="text" id="sigTextInput" placeholder="Your full name..." />
            </div>
            <div id="sigTypePreview" style="height:80px; display:flex; align-items:center; justify-content:center; font-family:'Brush Script MT', cursive, sans-serif; font-size:36px; color:#1e293b; border:1px solid var(--border-subtle); border-radius:6px; margin-top:8px;">
              Signature
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Apply Signature</button>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      this.container.innerHTML = html;
      this.overlay.classList.remove('hidden');

      const canvas = document.getElementById('sigCanvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0f172a';

      let isDrawing = false;
      let hasDrawn = false;

      const getPos = (e: MouseEvent | TouchEvent) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
          x: (clientX - rect.left) * (canvas.width / rect.width),
          y: (clientY - rect.top) * (canvas.height / rect.height),
        };
      };

      const start = (e: any) => {
        isDrawing = true;
        hasDrawn = true;
        const { x, y } = getPos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
      };

      const move = (e: any) => {
        if (!isDrawing) return;
        const { x, y } = getPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
      };

      const stop = () => {
        isDrawing = false;
      };

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', stop);
      canvas.addEventListener('touchstart', start);
      canvas.addEventListener('touchmove', move);
      window.addEventListener('touchend', stop);

      document.getElementById('sigClearBtn')?.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawn = false;
      });

      // Tabs switch
      let mode: 'draw' | 'type' = 'draw';
      const drawArea = document.getElementById('sigDrawArea')!;
      const typeArea = document.getElementById('sigTypeArea')!;
      const tabDraw = document.getElementById('sigTabDraw')!;
      const tabType = document.getElementById('sigTabType')!;
      const textInput = document.getElementById('sigTextInput') as HTMLInputElement;
      const preview = document.getElementById('sigTypePreview')!;

      tabDraw.onclick = () => {
        mode = 'draw';
        tabDraw.classList.add('primary');
        tabType.classList.remove('primary');
        drawArea.classList.remove('hidden');
        typeArea.classList.add('hidden');
      };

      tabType.onclick = () => {
        mode = 'type';
        tabType.classList.add('primary');
        tabDraw.classList.remove('primary');
        typeArea.classList.remove('hidden');
        drawArea.classList.add('hidden');
      };

      textInput.oninput = () => {
        preview.textContent = textInput.value || 'Signature';
      };

      const closeBtn = this.container.querySelector('.dialog-close-btn');
      const cancelBtn = this.container.querySelector('[data-dialog-action="cancel"]');
      const confirmBtn = this.container.querySelector('[data-dialog-action="confirm"]');

      const cleanup = (dataUrl: string | null) => {
        this.overlay.classList.add('hidden');
        this.container.innerHTML = '';
        window.removeEventListener('mouseup', stop);
        window.removeEventListener('touchend', stop);
        resolve(dataUrl);
      };

      closeBtn?.addEventListener('click', () => cleanup(null));
      cancelBtn?.addEventListener('click', () => cleanup(null));

      confirmBtn?.addEventListener('click', () => {
        if (mode === 'draw') {
          if (!hasDrawn) {
            cleanup(null);
            return;
          }
          cleanup(canvas.toDataURL('image/png'));
        } else {
          const tCanvas = document.createElement('canvas');
          tCanvas.width = 460;
          tCanvas.height = 140;
          const tCtx = tCanvas.getContext('2d')!;
          tCtx.font = "48px 'Brush Script MT', cursive, sans-serif";
          tCtx.fillStyle = '#0f172a';
          tCtx.textAlign = 'center';
          tCtx.textBaseline = 'middle';
          tCtx.fillText(textInput.value || 'Signature', 230, 70);
          cleanup(tCanvas.toDataURL('image/png'));
        }
      });
    });
  }

  /**
   * Insert Pages From File Dialog
   */
  static async promptInsertFromFileOptions(
    fileName: string,
    sourceNumPages: number,
    currentPage: number,
    totalDocPages: number
  ): Promise<{ insertIndex: number; sourcePageIndices?: number[] } | null> {
    const html = `
      <div class="dialog-modal" style="max-width: 480px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">post_add</span> Insert Pages from File</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div style="background:var(--bg-surface-elevated); padding:10px 14px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); display:flex; align-items:center; gap:10px;">
            <span class="material-symbols-rounded" style="color:var(--primary); font-size:24px;">picture_as_pdf</span>
            <div>
              <div style="font-weight:600; font-size:13px; color:var(--text-main); word-break:break-all;">${fileName}</div>
              <div style="font-size:11.5px; color:var(--text-muted);">${sourceNumPages} page${sourceNumPages > 1 ? 's' : ''} available</div>
            </div>
          </div>

          <div class="form-group" style="margin-top:8px;">
            <label style="font-weight:600;">Where to Insert in Document?</label>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="insertPlacement" value="after" checked />
                <span>After current page (Page ${currentPage})</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="insertPlacement" value="before" />
                <span>Before current page (Page ${currentPage})</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="insertPlacement" value="start" />
                <span>At the beginning of document (Before Page 1)</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="insertPlacement" value="end" />
                <span>At the end of document (After Page ${totalDocPages})</span>
              </label>
            </div>
          </div>

          <div class="form-group" style="margin-top:8px;">
            <label style="font-weight:600;">Which Pages to Insert?</label>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="sourcePageMode" id="radioModeAll" value="all" checked />
                <span>All pages (Pages 1 to ${sourceNumPages})</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="sourcePageMode" id="radioModeCustom" value="custom" />
                <span>Specified pages only:</span>
              </label>
              <div style="margin-left:24px;">
                <input type="text" id="sourceRangeInput" placeholder="e.g. 1, 3, 6 or 1-5" style="width:100%; padding:8px 12px; font-size:13px;" />
                <div id="sourceRangeError" style="display:none; color:var(--danger); font-size:11.5px; margin-top:4px; font-weight:500;"></div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">
                  Enter specific page numbers or ranges (e.g. <strong>1, 3, 6</strong> or <strong>1-3, 5</strong>). Available: 1 to ${sourceNumPages}.
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Insert Pages</button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const rangeInput = document.getElementById('sourceRangeInput') as HTMLInputElement;
      const radioCustom = document.getElementById('radioModeCustom') as HTMLInputElement;
      const radioAll = document.getElementById('radioModeAll') as HTMLInputElement;
      const errorDiv = document.getElementById('sourceRangeError') as HTMLDivElement;

      const selectCustom = () => {
        if (radioCustom) radioCustom.checked = true;
        if (errorDiv) errorDiv.style.display = 'none';
      };

      if (rangeInput && radioCustom) {
        rangeInput.addEventListener('focus', selectCustom);
        rangeInput.addEventListener('click', selectCustom);
        rangeInput.addEventListener('input', selectCustom);
        rangeInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (document.querySelector('[data-dialog-action="confirm"]') as HTMLButtonElement)?.click();
          }
        });
      }

      radioCustom?.addEventListener('change', () => {
        if (radioCustom.checked) {
          rangeInput?.focus();
          if (errorDiv) errorDiv.style.display = 'none';
        }
      });

      radioAll?.addEventListener('change', () => {
        if (radioAll.checked && errorDiv) {
          errorDiv.style.display = 'none';
        }
      });
    }, 20);

    let validatedIndices: number[] | undefined = undefined;
    let validatedPlacement = 'after';

    const validator = (): boolean => {
      const radioCustom = document.getElementById('radioModeCustom') as HTMLInputElement;
      const rangeInput = document.getElementById('sourceRangeInput') as HTMLInputElement;
      const errorDiv = document.getElementById('sourceRangeError') as HTMLDivElement;
      const placementRadio = document.querySelector('input[name="insertPlacement"]:checked') as HTMLInputElement;
      validatedPlacement = placementRadio?.value || 'after';

      const rangeVal = rangeInput?.value.trim() || '';
      // If custom radio is checked OR the user entered any text in range input
      const isCustom = radioCustom?.checked || rangeVal.length > 0;

      if (isCustom) {
        if (!rangeVal) {
          if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = `Please specify page numbers (e.g. 1, 3, 6). Available pages: 1 to ${sourceNumPages}.`;
          }
          rangeInput?.focus();
          return false;
        }

        const parsed = parsePageRange(rangeVal, sourceNumPages);
        if (parsed.indices.length === 0) {
          if (errorDiv) {
            errorDiv.style.display = 'block';
            if (parsed.outOfRange.length > 0) {
              errorDiv.textContent = `Page(s) [${parsed.outOfRange.join(', ')}] do not exist. File only has ${sourceNumPages} page${sourceNumPages > 1 ? 's' : ''}.`;
            } else {
              errorDiv.textContent = `Invalid page range format. Please use numbers separated by commas (e.g. 1, 3, 6).`;
            }
          }
          rangeInput?.focus();
          return false;
        }

        validatedIndices = parsed.indices;
      } else {
        validatedIndices = undefined; // all pages
      }

      return true;
    };

    const confirmed = await this.show(html, validator);
    if (!confirmed) return null;

    let targetIdx = currentPage;
    if (validatedPlacement === 'after') {
      targetIdx = currentPage;
    } else if (validatedPlacement === 'before') {
      targetIdx = Math.max(0, currentPage - 1);
    } else if (validatedPlacement === 'start') {
      targetIdx = 0;
    } else if (validatedPlacement === 'end') {
      targetIdx = totalDocPages;
    }

    return { insertIndex: targetIdx, sourcePageIndices: validatedIndices };
  }

  /**
   * Rotate Options Dialog
   */
  static async promptRotateDialog(
    currentPage: number,
    totalPages: number
  ): Promise<{ angle: number; pageIndices: number[] } | null> {
    const html = `
      <div class="dialog-modal" style="max-width: 440px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">rotate_right</span> Rotate Pages</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label style="font-weight:600;">Rotation Angle</label>
            <select id="rotateAngleSelect">
              <option value="90">90° Clockwise</option>
              <option value="180">180° Flip</option>
              <option value="270">90° Counter-Clockwise</option>
            </select>
          </div>
          <div class="form-group" style="margin-top:6px;">
            <label style="font-weight:600;">Pages to Rotate</label>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="rotateScope" value="current" checked />
                <span>Current page only (Page ${currentPage})</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="rotateScope" value="all" />
                <span>All pages (Pages 1 to ${totalPages})</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="rotateScope" value="odd" />
                <span>Odd pages only</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="rotateScope" value="even" />
                <span>Even pages only</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="rotateScope" id="radioRotateCustom" value="custom" />
                <span>Custom page range:</span>
              </label>
              <div style="margin-left:24px;">
                <input type="text" id="rotateCustomRange" placeholder="e.g. 1, 3, 6 or 1-5" style="width:100%; padding:6px 10px;" />
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Rotate</button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const rangeInput = document.getElementById('rotateCustomRange') as HTMLInputElement;
      const customRadio = document.getElementById('radioRotateCustom') as HTMLInputElement;
      if (rangeInput && customRadio) {
        const selectCustom = () => { customRadio.checked = true; };
        rangeInput.addEventListener('focus', selectCustom);
        rangeInput.addEventListener('click', selectCustom);
        rangeInput.addEventListener('input', selectCustom);
        rangeInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (document.querySelector('[data-dialog-action="confirm"]') as HTMLButtonElement)?.click();
          }
        });
      }
    }, 20);

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    const angle = parseInt((document.getElementById('rotateAngleSelect') as HTMLSelectElement)?.value || '90', 10);
    const customInputVal = (document.getElementById('rotateCustomRange') as HTMLInputElement)?.value.trim() || '';
    const customRadio = document.getElementById('radioRotateCustom') as HTMLInputElement;
    const isCustom = customRadio?.checked || customInputVal.length > 0;
    const scope = isCustom ? 'custom' : (document.querySelector('input[name="rotateScope"]:checked') as HTMLInputElement)?.value || 'current';

    let pageIndices: number[] = [];
    if (scope === 'current') {
      pageIndices = [currentPage - 1];
    } else if (scope === 'all') {
      pageIndices = Array.from({ length: totalPages }, (_, i) => i);
    } else if (scope === 'odd') {
      pageIndices = Array.from({ length: totalPages }, (_, i) => i).filter((i) => (i + 1) % 2 !== 0);
    } else if (scope === 'even') {
      pageIndices = Array.from({ length: totalPages }, (_, i) => i).filter((i) => (i + 1) % 2 === 0);
    } else if (scope === 'custom') {
      const parsed = parsePageRange(customInputVal, totalPages);
      pageIndices = parsed.indices;
    }

    if (pageIndices.length === 0) pageIndices = [currentPage - 1];
    return { angle, pageIndices };
  }

  /**
   * Move Page(s) Dialog
   */
  static async promptMovePage(
    currentPage: number,
    totalPages: number,
    pageNumbers?: number[]
  ): Promise<number | null> {
    const isMulti = Boolean(pageNumbers && pageNumbers.length > 1);
    const count = isMulti ? pageNumbers!.length : 1;
    const pageStr = isMulti ? pageNumbers!.join(', ') : String(currentPage);

    const html = `
      <div class="dialog-modal" style="max-width: 440px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">swap_vert</span> Move ${isMulti ? `${count} Pages` : 'Page'}</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin: 0;">
            ${isMulti
              ? `Move <strong>${count} selected pages (${pageStr})</strong> to a new position in this document:`
              : `Move <strong>Page ${currentPage}</strong> to a new position in this document:`}
          </p>
          <div class="form-group" style="margin-top: 10px;">
            <label style="font-weight: 600;">Destination Position (1 to ${totalPages})</label>
            <input type="number" id="moveTargetPageInput" min="1" max="${totalPages}" value="${currentPage}" style="font-size: 15px; font-weight: 600; padding: 8px 12px;" />
          </div>
          <div style="display:flex; gap:8px; margin-top:6px;">
            <button class="dialog-btn" type="button" id="btnMoveToStart" style="flex:1; font-size:11.5px;">To First (Page 1)</button>
            <button class="dialog-btn" type="button" id="btnMoveToEnd" style="flex:1; font-size:11.5px;">To End (Page ${totalPages})</button>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">Move ${isMulti ? `${count} Pages` : 'Page'}</button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const input = document.getElementById('moveTargetPageInput') as HTMLInputElement;
      const btnStart = document.getElementById('btnMoveToStart');
      const btnEnd = document.getElementById('btnMoveToEnd');
      if (input) {
        input.focus();
        input.select();
      }
      btnStart?.addEventListener('click', () => {
        if (input) input.value = '1';
      });
      btnEnd?.addEventListener('click', () => {
        if (input) input.value = String(totalPages);
      });
    }, 20);

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    const val = parseInt((document.getElementById('moveTargetPageInput') as HTMLInputElement)?.value, 10);
    if (isNaN(val) || val < 1 || val > totalPages) return null;
    return val;
  }

  /**
   * Print Document Dialog
   */
  static async promptPrint(
    docName: string,
    currentPage: number,
    totalPages: number
  ): Promise<{ pageIndices: number[]; quality: 'standard' | 'high' } | null> {
    const html = `
      <div class="dialog-modal" style="max-width: 440px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">print</span> Print Document</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div style="background:var(--bg-surface-elevated); padding:10px 14px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); display:flex; align-items:center; gap:10px;">
            <span class="material-symbols-rounded" style="color:var(--primary); font-size:24px;">picture_as_pdf</span>
            <div>
              <div style="font-weight:600; font-size:13px; color:var(--text-main); word-break:break-all;">${docName}</div>
              <div style="font-size:11.5px; color:var(--text-muted);">${totalPages} page${totalPages > 1 ? 's' : ''}</div>
            </div>
          </div>

          <div class="form-group" style="margin-top:10px;">
            <label style="font-weight:600;">Pages to Print</label>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="printPageScope" id="printScopeAll" value="all" checked />
                <span>All pages (Pages 1 to ${totalPages})</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="printPageScope" id="printScopeCurrent" value="current" />
                <span>Current page only (Page ${currentPage})</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer;">
                <input type="radio" name="printPageScope" id="printScopeCustom" value="custom" />
                <span>Specified pages:</span>
              </label>
              <div style="margin-left:24px;">
                <input type="text" id="printRangeInput" placeholder="e.g. 1, 3, 5-8" style="width:100%; padding:8px 12px; font-size:13px;" />
                <div id="printRangeError" style="display:none; color:var(--danger); font-size:11.5px; margin-top:4px; font-weight:500;"></div>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-top:10px;">
            <label style="font-weight:600;">Print Quality</label>
            <select id="printQualitySelect" style="width:100%; padding:8px 12px; font-size:13px;">
              <option value="high" selected>High Quality (Sharp vector-rendered, 300 DPI)</option>
              <option value="standard">Standard Quality (Fast)</option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">
            <span class="material-symbols-rounded" style="font-size:16px; vertical-align:middle; margin-right:4px;">print</span> Print
          </button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const rangeInput = document.getElementById('printRangeInput') as HTMLInputElement;
      const customRadio = document.getElementById('printScopeCustom') as HTMLInputElement;
      const allRadio = document.getElementById('printScopeAll') as HTMLInputElement;
      const currentRadio = document.getElementById('printScopeCurrent') as HTMLInputElement;
      const errorDiv = document.getElementById('printRangeError') as HTMLDivElement;

      const selectCustom = () => {
        if (customRadio) customRadio.checked = true;
        if (errorDiv) errorDiv.style.display = 'none';
      };

      if (rangeInput && customRadio) {
        rangeInput.addEventListener('focus', selectCustom);
        rangeInput.addEventListener('click', selectCustom);
        rangeInput.addEventListener('input', selectCustom);
        rangeInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (document.querySelector('[data-dialog-action="confirm"]') as HTMLButtonElement)?.click();
          }
        });
      }

      customRadio?.addEventListener('change', () => {
        if (customRadio.checked) rangeInput?.focus();
      });
      allRadio?.addEventListener('change', () => {
        if (errorDiv) errorDiv.style.display = 'none';
      });
      currentRadio?.addEventListener('change', () => {
        if (errorDiv) errorDiv.style.display = 'none';
      });
    }, 20);

    let validatedIndices: number[] = [];
    let validatedQuality: 'standard' | 'high' = 'high';

    const validator = (): boolean => {
      const customRadio = document.getElementById('printScopeCustom') as HTMLInputElement;
      const rangeInput = document.getElementById('printRangeInput') as HTMLInputElement;
      const currentRadio = document.getElementById('printScopeCurrent') as HTMLInputElement;
      const errorDiv = document.getElementById('printRangeError') as HTMLDivElement;
      const qualitySelect = document.getElementById('printQualitySelect') as HTMLSelectElement;

      validatedQuality = (qualitySelect?.value as any) || 'high';

      const rangeVal = rangeInput?.value.trim() || '';
      const isCustom = customRadio?.checked || rangeVal.length > 0;

      if (isCustom) {
        if (!rangeVal) {
          if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = `Please enter page numbers to print (e.g. 1, 3, 5-8).`;
          }
          rangeInput?.focus();
          return false;
        }

        const parsed = parsePageRange(rangeVal, totalPages);
        if (parsed.indices.length === 0) {
          if (errorDiv) {
            errorDiv.style.display = 'block';
            if (parsed.outOfRange.length > 0) {
              errorDiv.textContent = `Page(s) [${parsed.outOfRange.join(', ')}] do not exist. Total pages: ${totalPages}.`;
            } else {
              errorDiv.textContent = `Invalid page range format. Please use numbers separated by commas (e.g. 1, 3, 5).`;
            }
          }
          rangeInput?.focus();
          return false;
        }

        validatedIndices = parsed.indices;
      } else if (currentRadio?.checked) {
        validatedIndices = [currentPage - 1];
      } else {
        // All pages
        validatedIndices = Array.from({ length: totalPages }, (_, i) => i);
      }

      return true;
    };

    const confirmed = await this.show(html, validator);
    if (!confirmed) return null;

    return { pageIndices: validatedIndices, quality: validatedQuality };
  }

  /**
   * Merge & Combine Documents Dialog
   */
  static async promptMergeDocuments(
    currentDoc?: { name: string; bytes: Uint8Array; numPages: number }
  ): Promise<{ items: { name: string; bytes: Uint8Array; type: 'pdf' | 'image' }[]; outputName: string } | null> {
    const html = `
      <div class="dialog-modal" style="max-width: 540px; width: 95%;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">merge</span> Merge PDF Files</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 13px; font-weight: 600; color: var(--text-main);">Documents to Combine:</span>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="dialog-btn primary" id="btnMergeAddFiles" style="padding: 6px 14px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px;">
                <span class="material-symbols-rounded" style="font-size: 16px;">add</span> Add Files...
              </button>
              <input type="file" id="mergeModalFileInput" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple hidden />
            </div>
          </div>

          <!-- Scrollable file list -->
          <div id="mergeItemsList" style="max-height: 220px; min-height: 110px; overflow-y: auto; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 6px;">
          </div>

          <div id="mergeDialogError" style="display: none; color: var(--danger); font-size: 12px; margin-top: 8px; font-weight: 500;"></div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12px; color: var(--text-muted);">
            <span id="mergeSummaryText">Total: 0 pages across 0 files</span>
            <button type="button" id="btnClearMergeList" style="background: none; border: none; color: var(--text-muted); cursor: pointer; text-decoration: underline; font-size: 11.5px;">Clear All</button>
          </div>

          <div class="form-group" style="margin-top: 12px;">
            <label style="font-weight: 600;">Output File Name</label>
            <input type="text" id="mergeOutputFilename" value="Merged_Document.pdf" style="width: 100%; padding: 8px 12px; font-size: 13px;" />
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm">
            <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">merge</span> Merge Documents
          </button>
        </div>
      </div>
    `;

    interface MergeQueueItem {
      id: string;
      name: string;
      bytes: Uint8Array;
      type: 'pdf' | 'image';
      pageCount: number;
      isCurrent?: boolean;
    }

    const mergeQueue: MergeQueueItem[] = [];
    if (currentDoc) {
      mergeQueue.push({
        id: 'cur_' + Math.random().toString(36).substring(2, 7),
        name: currentDoc.name,
        bytes: currentDoc.bytes.slice(0),
        type: 'pdf',
        pageCount: currentDoc.numPages,
        isCurrent: true,
      });
    }

    setTimeout(() => {
      const listEl = document.getElementById('mergeItemsList') as HTMLDivElement;
      const summaryText = document.getElementById('mergeSummaryText') as HTMLSpanElement;
      const addBtn = document.getElementById('btnMergeAddFiles') as HTMLButtonElement;
      const fileInput = document.getElementById('mergeModalFileInput') as HTMLInputElement;
      const clearBtn = document.getElementById('btnClearMergeList') as HTMLButtonElement;
      const errorDiv = document.getElementById('mergeDialogError') as HTMLDivElement;

      const render = () => {
        if (!listEl) return;
        listEl.innerHTML = '';

        if (mergeQueue.length === 0) {
          listEl.innerHTML = `
            <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 12.5px;">
              <span class="material-symbols-rounded" style="font-size: 30px; display: block; margin-bottom: 6px; opacity: 0.5;">folder_open</span>
              No documents added yet.<br/>Click <strong>"Add Files..."</strong> to choose PDFs or images to combine.
            </div>
          `;
        } else {
          mergeQueue.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'merge-item-card';
            card.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 10px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); margin-bottom:6px;';
            card.innerHTML = `
              <span style="font-size:12px; font-weight:700; color:var(--text-muted); min-width:18px;">${idx + 1}.</span>
              <span class="material-symbols-rounded" style="color:var(--primary); font-size:20px;">${item.type === 'pdf' ? 'picture_as_pdf' : 'image'}</span>
              <div style="flex:1; min-width:0;">
                <div style="font-size:12.5px; font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${item.name} ${item.isCurrent ? '<span style="font-size:10px; background:var(--primary-light); color:var(--primary); padding:2px 6px; border-radius:4px; margin-left:4px;">Active Document</span>' : ''}
                </div>
                <div style="font-size:11px; color:var(--text-muted);">${item.pageCount} page${item.pageCount > 1 ? 's' : ''}</div>
              </div>
              <div style="display:flex; gap:4px;">
                <button type="button" class="dialog-btn btn-merge-up" title="Move Up" ${idx === 0 ? 'disabled' : ''} style="padding:4px 6px;"><span class="material-symbols-rounded" style="font-size:14px;">arrow_upward</span></button>
                <button type="button" class="dialog-btn btn-merge-down" title="Move Down" ${idx === mergeQueue.length - 1 ? 'disabled' : ''} style="padding:4px 6px;"><span class="material-symbols-rounded" style="font-size:14px;">arrow_downward</span></button>
                <button type="button" class="dialog-btn danger btn-merge-remove" title="Remove" style="padding:4px 6px;"><span class="material-symbols-rounded" style="font-size:14px;">delete</span></button>
              </div>
            `;

            card.querySelector('.btn-merge-up')?.addEventListener('click', () => {
              if (idx > 0) {
                const temp = mergeQueue[idx];
                mergeQueue[idx] = mergeQueue[idx - 1];
                mergeQueue[idx - 1] = temp;
                if (errorDiv) errorDiv.style.display = 'none';
                render();
              }
            });

            card.querySelector('.btn-merge-down')?.addEventListener('click', () => {
              if (idx < mergeQueue.length - 1) {
                const temp = mergeQueue[idx];
                mergeQueue[idx] = mergeQueue[idx + 1];
                mergeQueue[idx + 1] = temp;
                if (errorDiv) errorDiv.style.display = 'none';
                render();
              }
            });

            card.querySelector('.btn-merge-remove')?.addEventListener('click', () => {
              mergeQueue.splice(idx, 1);
              if (errorDiv) errorDiv.style.display = 'none';
              render();
            });

            listEl.appendChild(card);
          });
        }

        const totalP = mergeQueue.reduce((acc, cur) => acc + cur.pageCount, 0);
        if (summaryText) {
          summaryText.textContent = `Total: ${totalP} page${totalP !== 1 ? 's' : ''} across ${mergeQueue.length} file${mergeQueue.length !== 1 ? 's' : ''}`;
        }
      };

      render();

      addBtn?.addEventListener('click', () => {
        fileInput?.click();
      });

      clearBtn?.addEventListener('click', () => {
        mergeQueue.length = 0;
        if (errorDiv) errorDiv.style.display = 'none';
        render();
      });

      fileInput?.addEventListener('change', async () => {
        if (!fileInput.files || fileInput.files.length === 0) return;
        for (const file of Array.from(fileInput.files)) {
          const ab = await file.arrayBuffer();
          const bytes = new Uint8Array(ab);
          const isPdf = file.name.toLowerCase().endsWith('.pdf');
          let count = 1;
          if (isPdf) {
            try {
              count = await PDFEditorService.getPageCount(bytes);
            } catch {
              count = 1;
            }
          }
          mergeQueue.push({
            id: 'item_' + Math.random().toString(36).substring(2, 7),
            name: file.name,
            bytes,
            type: isPdf ? 'pdf' : 'image',
            pageCount: count,
          });
        }
        fileInput.value = '';
        if (errorDiv) errorDiv.style.display = 'none';
        render();
      });
    }, 20);

    const validator = (): boolean => {
      const errorDiv = document.getElementById('mergeDialogError') as HTMLDivElement;
      if (mergeQueue.length < 2) {
        if (errorDiv) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = mergeQueue.length === 0
            ? 'Please add at least 2 files to merge.'
            : 'Please add at least 1 more file to combine with the current document.';
        }
        return false;
      }
      return true;
    };

    const confirmed = await this.show(html, validator);
    if (!confirmed) return null;

    const outNameInput = document.getElementById('mergeOutputFilename') as HTMLInputElement;
    let outputName = outNameInput?.value.trim() || 'Merged_Document.pdf';
    if (!outputName.toLowerCase().endsWith('.pdf')) outputName += '.pdf';

    return {
      items: mergeQueue.map((m) => ({ name: m.name, bytes: m.bytes, type: m.type })),
      outputName,
    };
  }

  /**
   * Split PDF Dialog with Live Mode Calculation & Validation
   */
  static async promptSplitPDF(
    fileName: string,
    totalPages: number
  ): Promise<{ splits: { name: string; pageIndices: number[]; pageCount: number }[]; openAllInTabs: boolean; baseName: string } | null> {
    const baseName = fileName.replace(/\.pdf$/i, '') || 'Document';
    const half = Math.ceil(totalPages / 2);
    const initialRanges = totalPages > 1 ? `1-${half}, ${half + 1}-${totalPages}` : `1`;

    const html = `
      <div class="dialog-modal" style="max-width: 540px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">call_split</span> Split PDF Document</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body">
          <div style="background: var(--bg-hover); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
              <span class="material-symbols-rounded" style="color: var(--accent-red); font-size: 24px;">picture_as_pdf</span>
              <div style="overflow: hidden;">
                <div style="font-size: 13px; font-weight: 600; color: var(--text-main); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${fileName}">${fileName}</div>
                <div style="font-size: 11.5px; color: var(--text-muted);">${totalPages} total pages</div>
              </div>
            </div>
            <span class="badge" style="background: rgba(37,99,235,0.1); color: var(--accent-blue); padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">Pages 1–${totalPages}</span>
          </div>

          <div style="font-size: 12px; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">Select Split Method:</div>
          <div class="split-modes-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;">
            <label class="split-mode-card active" data-mode="ranges" style="display: flex; gap: 10px; padding: 10px 12px; border: 2px solid var(--accent-blue); border-radius: var(--radius-md); background: rgba(37,99,235,0.04); cursor: pointer; transition: all 0.15s ease;">
              <input type="radio" name="splitMode" value="ranges" checked style="margin-top: 2px;" />
              <div>
                <div style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">By Page Ranges</div>
                <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3;">Custom segments (e.g. 1-10, 11-${totalPages})</div>
              </div>
            </label>

            <label class="split-mode-card" data-mode="single" style="display: flex; gap: 10px; padding: 10px 12px; border: 2px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface); cursor: pointer; transition: all 0.15s ease;">
              <input type="radio" name="splitMode" value="single" style="margin-top: 2px;" />
              <div>
                <div style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">Single Pages</div>
                <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3;">1 PDF file for every single page</div>
              </div>
            </label>

            <label class="split-mode-card" data-mode="fixed-chunk" style="display: flex; gap: 10px; padding: 10px 12px; border: 2px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface); cursor: pointer; transition: all 0.15s ease;">
              <input type="radio" name="splitMode" value="fixed-chunk" style="margin-top: 2px;" />
              <div>
                <div style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">Every N Pages</div>
                <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3;">Equal chunks (e.g. every 10 pages)</div>
              </div>
            </label>

            <label class="split-mode-card" data-mode="at-page" style="display: flex; gap: 10px; padding: 10px 12px; border: 2px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface); cursor: pointer; transition: all 0.15s ease;">
              <input type="radio" name="splitMode" value="at-page" style="margin-top: 2px;" />
              <div>
                <div style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">Split at Page</div>
                <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3;">Divide file into Part 1 and Part 2</div>
              </div>
            </label>
          </div>

          <!-- Configuration Panes -->
          <div id="splitConfigRanges" class="split-config-pane">
            <div class="form-group" style="margin-bottom: 6px;">
              <label style="font-weight: 600; font-size: 12px;">Custom Page Ranges (comma separated)</label>
              <input type="text" id="splitRangesInput" placeholder="e.g. 1-10, 11-25, 26-${totalPages}" value="${initialRanges}" style="font-size: 13px; padding: 8px 12px; width: 100%; border-radius: var(--radius-sm); border: 1px solid var(--border-color);" />
            </div>
            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
              <button type="button" class="quick-range-btn" data-range-type="halves" style="font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-hover); cursor: pointer;">Two Halves</button>
              <button type="button" class="quick-range-btn" data-range-type="thirds" style="font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-hover); cursor: pointer;">Three Parts</button>
              <button type="button" class="quick-range-btn" data-range-type="odd-even" style="font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-hover); cursor: pointer;">Odd & Even</button>
            </div>
          </div>

          <div id="splitConfigSingle" class="split-config-pane" style="display: none;">
            <div style="padding: 10px 12px; background: rgba(37,99,235,0.06); border-radius: var(--radius-sm); border: 1px solid rgba(37,99,235,0.2); font-size: 12px; color: var(--text-main);">
              <span class="material-symbols-rounded" style="vertical-align: middle; font-size: 16px; color: var(--accent-blue);">info</span>
              Extracts each page individually. Will generate <strong>${totalPages} separate PDF files</strong>.
            </div>
          </div>

          <div id="splitConfigFixed" class="split-config-pane" style="display: none;">
            <div class="form-group" style="margin-bottom: 6px;">
              <label style="font-weight: 600; font-size: 12px;">Split every how many pages?</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="number" id="splitChunkInput" min="1" max="${totalPages}" value="${Math.min(10, totalPages)}" style="width: 100px; font-size: 13px; padding: 7px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);" />
                <span style="font-size: 12px; color: var(--text-muted);">pages per document</span>
              </div>
            </div>
          </div>

          <div id="splitConfigAtPage" class="split-config-pane" style="display: none;">
            <div class="form-group" style="margin-bottom: 6px;">
              <label style="font-weight: 600; font-size: 12px;">Split into 2 files after page number:</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="number" id="splitAtPageInput" min="1" max="${Math.max(1, totalPages - 1)}" value="${Math.floor(totalPages / 2) || 1}" style="width: 100px; font-size: 13px; padding: 7px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);" />
                <span style="font-size: 12px; color: var(--text-muted);" id="splitAtPagePreview">Part 1: 1–${Math.floor(totalPages / 2) || 1}, Part 2: ${(Math.floor(totalPages / 2) || 1) + 1}–${totalPages}</span>
              </div>
            </div>
          </div>

          <!-- Live Preview Summary -->
          <div id="splitLiveSummary" style="margin-top: 10px; padding: 9px 12px; background: var(--bg-hover); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-blue); font-size: 12px; line-height: 1.4; color: var(--text-main);">
          </div>

          <!-- Output options -->
          <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--text-main);">
              <input type="checkbox" id="splitOpenAll" checked />
              <span>Open <strong>all</strong> split documents as editor tabs after completion</span>
            </label>
            <div style="font-size: 11.5px; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-rounded" style="font-size: 15px;">folder_zip</span>
              <span>All files also downloaded/packaged into <strong>${baseName}_split.zip</strong></span>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm" id="btnConfirmSplit">
            <span class="material-symbols-rounded" style="font-size: 16px;">call_split</span> Split & Download
          </button>
        </div>
      </div>
    `;

    let currentSplits: { name: string; pageIndices: number[]; pageCount: number }[] = [];
    let currentError: string | null = null;

    setTimeout(() => {
      const modeCards = document.querySelectorAll('.split-mode-card');
      const paneRanges = document.getElementById('splitConfigRanges') as HTMLDivElement;
      const paneSingle = document.getElementById('splitConfigSingle') as HTMLDivElement;
      const paneFixed = document.getElementById('splitConfigFixed') as HTMLDivElement;
      const paneAtPage = document.getElementById('splitConfigAtPage') as HTMLDivElement;
      const summaryDiv = document.getElementById('splitLiveSummary') as HTMLDivElement;
      const confirmBtn = document.getElementById('btnConfirmSplit') as HTMLButtonElement;

      const rangesInput = document.getElementById('splitRangesInput') as HTMLInputElement;
      const chunkInput = document.getElementById('splitChunkInput') as HTMLInputElement;
      const atPageInput = document.getElementById('splitAtPageInput') as HTMLInputElement;
      const atPagePreview = document.getElementById('splitAtPagePreview') as HTMLSpanElement;

      const recalculate = () => {
        const selectedMode = (document.querySelector('input[name="splitMode"]:checked') as HTMLInputElement)?.value || 'ranges';
        currentError = null;
        currentSplits = [];

        if (selectedMode === 'single') {
          for (let p = 1; p <= totalPages; p++) {
            currentSplits.push({
              name: `${baseName}_page_${p}.pdf`,
              pageIndices: [p - 1],
              pageCount: 1,
            });
          }
        } else if (selectedMode === 'fixed-chunk') {
          const chunk = parseInt(chunkInput?.value || '1', 10);
          if (isNaN(chunk) || chunk < 1) {
            currentError = 'Please enter a valid page batch size (at least 1).';
          } else {
            const count = Math.ceil(totalPages / chunk);
            for (let c = 0; c < count; c++) {
              const start = c * chunk + 1;
              const end = Math.min((c + 1) * chunk, totalPages);
              const indices: number[] = [];
              for (let p = start; p <= end; p++) indices.push(p - 1);
              currentSplits.push({
                name: `${baseName}_part_${c + 1}_p${start}-${end}.pdf`,
                pageIndices: indices,
                pageCount: indices.length,
              });
            }
          }
        } else if (selectedMode === 'at-page') {
          const splitAt = parseInt(atPageInput?.value || '1', 10);
          if (isNaN(splitAt) || splitAt < 1 || splitAt >= totalPages) {
            currentError = `Please enter a valid page number between 1 and ${totalPages - 1}.`;
          } else {
            if (atPagePreview) {
              atPagePreview.textContent = `Part 1: 1–${splitAt}, Part 2: ${splitAt + 1}–${totalPages}`;
            }
            const part1: number[] = [];
            for (let p = 1; p <= splitAt; p++) part1.push(p - 1);
            const part2: number[] = [];
            for (let p = splitAt + 1; p <= totalPages; p++) part2.push(p - 1);

            currentSplits.push({
              name: `${baseName}_part_1_p1-${splitAt}.pdf`,
              pageIndices: part1,
              pageCount: part1.length,
            });
            currentSplits.push({
              name: `${baseName}_part_2_p${splitAt + 1}-${totalPages}.pdf`,
              pageIndices: part2,
              pageCount: part2.length,
            });
          }
        } else {
          // ranges
          const raw = rangesInput?.value.trim() || '';
          if (!raw) {
            currentError = 'Please specify at least one page range (e.g. 1-5, 6-10).';
          } else {
            const segments = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
            if (segments.length === 0) {
              currentError = 'Please enter valid page ranges.';
            } else {
              segments.forEach((seg, idx) => {
                const parsed = parsePageRange(seg, totalPages);
                if (parsed.indices.length === 0) {
                  currentError = `Invalid range "${seg}". Valid pages are 1 to ${totalPages}.`;
                } else {
                  currentSplits.push({
                    name: `${baseName}_part_${idx + 1}_p${seg.replace(/\s+/g, '')}.pdf`,
                    pageIndices: parsed.indices,
                    pageCount: parsed.indices.length,
                  });
                }
              });
            }
          }
        }

        // Render summary
        if (currentError) {
          if (summaryDiv) {
            summaryDiv.style.borderLeftColor = 'var(--danger)';
            summaryDiv.innerHTML = `<span style="color:var(--danger); font-weight:600;"><span class="material-symbols-rounded" style="vertical-align:middle; font-size:16px;">error</span> ${currentError}</span>`;
          }
          if (confirmBtn) confirmBtn.disabled = true;
        } else {
          if (summaryDiv) {
            summaryDiv.style.borderLeftColor = 'var(--accent-blue)';
            const sample = currentSplits.slice(0, 3).map((s) => `${s.pageCount}p`).join(', ');
            const more = currentSplits.length > 3 ? `, +${currentSplits.length - 3} more` : '';
            summaryDiv.innerHTML = `
              <div style="font-weight:600; color:var(--accent-blue); margin-bottom:2px;">
                <span class="material-symbols-rounded" style="vertical-align:middle; font-size:16px;">task_alt</span>
                Ready to split into ${currentSplits.length} document${currentSplits.length > 1 ? 's' : ''}
              </div>
              <div style="color:var(--text-muted); font-size:11.5px;">
                Breakdown: [${sample}${more}] · Packaged as <strong>${baseName}_split.zip</strong>
              </div>
            `;
          }
          if (confirmBtn) confirmBtn.disabled = false;
        }
      };

      // Radio & Card change
      modeCards.forEach((card) => {
        card.addEventListener('click', () => {
          modeCards.forEach((c) => {
            c.classList.remove('active');
            (c as HTMLElement).style.borderColor = 'var(--border-color)';
            (c as HTMLElement).style.background = 'var(--bg-surface)';
          });
          card.classList.add('active');
          (card as HTMLElement).style.borderColor = 'var(--accent-blue)';
          (card as HTMLElement).style.background = 'rgba(37,99,235,0.04)';

          const radio = card.querySelector('input[type="radio"]') as HTMLInputElement;
          if (radio) radio.checked = true;

          const mode = (card as HTMLElement).dataset.mode;
          if (paneRanges) paneRanges.style.display = mode === 'ranges' ? 'block' : 'none';
          if (paneSingle) paneSingle.style.display = mode === 'single' ? 'block' : 'none';
          if (paneFixed) paneFixed.style.display = mode === 'fixed-chunk' ? 'block' : 'none';
          if (paneAtPage) paneAtPage.style.display = mode === 'at-page' ? 'block' : 'none';

          recalculate();
        });
      });

      rangesInput?.addEventListener('input', recalculate);
      chunkInput?.addEventListener('input', recalculate);
      atPageInput?.addEventListener('input', recalculate);

      // Preset buttons
      document.querySelectorAll('.quick-range-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const type = (btn as HTMLElement).dataset.rangeType;
          if (!rangesInput) return;

          if (type === 'halves') {
            const m = Math.ceil(totalPages / 2);
            rangesInput.value = totalPages > 1 ? `1-${m}, ${m + 1}-${totalPages}` : `1`;
          } else if (type === 'thirds') {
            const t1 = Math.ceil(totalPages / 3);
            const t2 = Math.ceil((totalPages * 2) / 3);
            rangesInput.value = totalPages >= 3 ? `1-${t1}, ${t1 + 1}-${t2}, ${t2 + 1}-${totalPages}` : `1-${totalPages}`;
          } else if (type === 'odd-even') {
            const odd: number[] = [];
            const even: number[] = [];
            for (let p = 1; p <= totalPages; p++) {
              if (p % 2 !== 0) odd.push(p);
              else even.push(p);
            }
            rangesInput.value = `${odd.join(' ')}, ${even.join(' ')}`;
          }
          recalculate();
        });
      });

      recalculate();
    }, 20);

    const validator = (): boolean => {
      return !currentError && currentSplits.length > 0;
    };

    const confirmed = await this.show(html, validator);
    if (!confirmed || currentSplits.length === 0) return null;

    const openAll = (document.getElementById('splitOpenAll') as HTMLInputElement)?.checked ?? true;
    return {
      splits: currentSplits,
      openAllInTabs: openAll,
      baseName,
    };
  }

  /**
   * Compress PDF Dialog with Interactive Presets (Light, Balanced, Strong, Target Size),
   * Live Size Testing & Calculation, and Save Action.
   */
  static async promptCompressPDF(
    fileName: string,
    docBytes: Uint8Array,
    totalPages: number
  ): Promise<{
    resultBytes: Uint8Array;
    options: PDFCompressOptions;
    finalSize: number;
    originalSize: number;
    reductionPercentage: number;
  } | null> {
    const originalSizeBytes = docBytes.length;
    const formatBytes = (bytes: number): string => {
      if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      }
      return `${(bytes / 1024).toFixed(1)} KB`;
    };

    const originalFormatted = formatBytes(originalSizeBytes);
    const defaultTargetKB = Math.max(50, Math.round((originalSizeBytes / 1024) * 0.5));
    const defaultTargetVal = defaultTargetKB >= 1024 ? (defaultTargetKB / 1024).toFixed(1) : defaultTargetKB.toString();
    const defaultTargetUnit = defaultTargetKB >= 1024 ? 'MB' : 'KB';

    const html = `
      <div class="dialog-modal" style="max-width: 560px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">compress</span> Compress PDF Document</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body" style="gap: 12px; padding: 16px 18px;">
          <!-- Current Document Info Header -->
          <div style="background: var(--bg-hover); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
              <span class="material-symbols-rounded" style="color: var(--primary); font-size: 26px;">picture_as_pdf</span>
              <div style="overflow: hidden;">
                <div style="font-size: 13px; font-weight: 600; color: var(--text-main); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${fileName}">${fileName}</div>
                <div style="font-size: 11.5px; color: var(--text-muted);">${totalPages} Pages • Original Size: <strong>${originalFormatted}</strong> (${(originalSizeBytes / 1024).toFixed(1)} KB)</div>
              </div>
            </div>
            <span class="badge" style="background: rgba(249,87,56,0.1); color: var(--primary); padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; white-space: nowrap;">${originalFormatted}</span>
          </div>

          <!-- Mode / Preset Selection -->
          <div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text-main); margin-bottom: 8px;">Select Compression Level:</div>
            <div class="compress-modes-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <!-- Light Compression -->
              <label class="compress-mode-card" data-mode="light" style="display: flex; gap: 10px; padding: 10px 12px; border: 2px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="compressPreset" value="light" style="margin-top: 3px;" />
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">Light Compression</span>
                    <span style="font-size: 10px; background: rgba(37,99,235,0.08); color: var(--accent-blue); padding: 1px 6px; border-radius: 8px;">High Quality (~85%)</span>
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3; margin-top: 2px;">Maximum visual clarity for important documents & print.</div>
                </div>
              </label>

              <!-- Balanced Compression (Default) -->
              <label class="compress-mode-card active" data-mode="balanced" style="display: flex; gap: 10px; padding: 10px 12px; border: 2px solid var(--primary); border-radius: var(--radius-md); background: rgba(249,87,56,0.05); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="compressPreset" value="balanced" checked style="margin-top: 3px;" />
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">Balanced Compression</span>
                    <span style="font-size: 10px; background: rgba(16,185,129,0.1); color: var(--accent-green); padding: 1px 6px; border-radius: 8px; font-weight: 600;">Recommended</span>
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3; margin-top: 2px;">Optimal balance between crisp clarity and file size.</div>
                </div>
              </label>

              <!-- Strong Compression -->
              <label class="compress-mode-card" data-mode="strong" style="display: flex; gap: 10px; padding: 10px 12px; border: 2px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="compressPreset" value="strong" style="margin-top: 3px;" />
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">Strong Compression</span>
                    <span style="font-size: 10px; background: rgba(245,158,11,0.1); color: var(--accent-amber); padding: 1px 6px; border-radius: 8px;">Smallest Size (~48%)</span>
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3; margin-top: 2px;">Maximum size reduction when strict upload limits apply.</div>
                </div>
              </label>

              <!-- Target Size -->
              <label class="compress-mode-card" data-mode="target" style="display: flex; gap: 10px; padding: 10px 12px; border: 2px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="compressPreset" value="target" style="margin-top: 3px;" />
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">Target File Size</span>
                    <span style="font-size: 10px; background: rgba(139,92,246,0.1); color: var(--accent-purple); padding: 1px 6px; border-radius: 8px;">Custom</span>
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); line-height: 1.3; margin-top: 2px;">Specify desired target size (e.g. 500 KB, 1 MB).</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Target Size Configuration Pane -->
          <div id="compressConfigTarget" style="display: none; background: var(--bg-hover); padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="font-size: 12px; font-weight: 600; color: var(--text-main); margin-bottom: 6px;">Specify Target Maximum File Size:</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <input type="number" id="compressTargetInput" min="10" step="50" value="${defaultTargetVal}" style="width: 120px; font-size: 13px; padding: 7px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-main);" />
              <select id="compressTargetUnit" style="width: 80px; font-size: 13px; padding: 7px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-main);">
                <option value="KB" ${defaultTargetUnit === 'KB' ? 'selected' : ''}>KB</option>
                <option value="MB" ${defaultTargetUnit === 'MB' ? 'selected' : ''}>MB</option>
              </select>
              <span id="compressTargetHint" style="font-size: 12px; color: var(--text-muted);">Target: <strong>${defaultTargetKB} KB</strong></span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              <button type="button" class="quick-target-btn" data-kb="500" style="font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-surface); cursor: pointer; color: var(--text-main);">500 KB</button>
              <button type="button" class="quick-target-btn" data-kb="1024" style="font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-surface); cursor: pointer; color: var(--text-main);">1 MB</button>
              <button type="button" class="quick-target-btn" data-kb="2048" style="font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-surface); cursor: pointer; color: var(--text-main);">2 MB</button>
              <button type="button" class="quick-target-btn" data-ratio="0.5" style="font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-surface); cursor: pointer; color: var(--text-main);">50% of Original</button>
              <button type="button" class="quick-target-btn" data-ratio="0.25" style="font-size: 11px; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-surface); cursor: pointer; color: var(--text-main);">25% of Original</button>
            </div>
          </div>

          <!-- Advanced Options -->
          <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;">
            <div style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Additional Options:</div>
            <label style="font-size: 12px; display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-main);">
              <input type="checkbox" id="compressOptStreams" checked />
              <span>Optimize PDF structure & stream objects (Object Streams)</span>
            </label>
            <label style="font-size: 12px; display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-main);">
              <input type="checkbox" id="compressOptMetadata" checked />
              <span>Remove hidden metadata & thumbnails for privacy & compact size</span>
            </label>
            <label style="font-size: 12px; display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-main);">
              <input type="checkbox" id="compressOptImages" checked />
              <span>Recompress high-resolution visual images</span>
            </label>
            <label style="font-size: 12px; display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-main);">
              <input type="checkbox" id="compressOptRaster" />
              <span>Rasterize Page Mode <em>(Recommended for scanned documents or extreme target size)</em></span>
            </label>
          </div>

          <!-- Live Preview & Comparison Box -->
          <div id="compressLiveBox" style="background: var(--bg-hover); border-radius: var(--radius-md); border: 1px solid var(--border-color); border-left: 4px solid var(--primary); padding: 12px 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--text-main);">Estimated & Test Results:</span>
              <span id="compressLiveBadge" style="background: rgba(16,185,129,0.15); color: var(--accent-green); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px;">Est: ~50% Savings</span>
            </div>
            <div style="display: flex; align-items: center; gap: 14px; font-size: 12.5px; color: var(--text-main); margin-bottom: 6px;">
              <div>Original Size: <strong>${originalFormatted}</strong></div>
              <span style="color: var(--text-muted); font-size: 14px;">➔</span>
              <div>New Size: <strong id="compressLiveSizeText" style="color: var(--primary);">~${formatBytes(Math.round(originalSizeBytes * 0.5))}</strong></div>
            </div>
            <div id="compressLiveStatusMessage" style="font-size: 11.5px; color: var(--text-muted); line-height: 1.4;">
              Click <strong>"Calculate / Test Size"</strong> to test compression and preview the exact size, or click <strong>"Save PDF"</strong> to choose where to save the file.
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button type="button" class="dialog-btn" id="btnTestCompress" style="display: flex; align-items: center; gap: 6px;">
            <span class="material-symbols-rounded" style="font-size: 16px;">speed</span>
            <span>Calculate / Test Size</span>
          </button>
          <button class="dialog-btn primary" data-dialog-action="confirm" id="btnSaveCompress" style="display: flex; align-items: center; gap: 6px;">
            <span class="material-symbols-rounded" style="font-size: 16px;">save</span>
            <span>Save PDF</span>
          </button>
        </div>
      </div>
    `;

    let cachedResult: PDFCompressResult | null = null;
    let lastOptionsJson = '';
    let isCompressing = false;

    setTimeout(() => {
      const modeCards = document.querySelectorAll('.compress-mode-card');
      const targetPane = document.getElementById('compressConfigTarget') as HTMLDivElement;
      const targetInput = document.getElementById('compressTargetInput') as HTMLInputElement;
      const targetUnit = document.getElementById('compressTargetUnit') as HTMLSelectElement;
      const targetHint = document.getElementById('compressTargetHint') as HTMLSpanElement;
      const quickBtns = document.querySelectorAll('.quick-target-btn');

      const optStreams = document.getElementById('compressOptStreams') as HTMLInputElement;
      const optMetadata = document.getElementById('compressOptMetadata') as HTMLInputElement;
      const optImages = document.getElementById('compressOptImages') as HTMLInputElement;
      const optRaster = document.getElementById('compressOptRaster') as HTMLInputElement;

      const liveBadge = document.getElementById('compressLiveBadge') as HTMLSpanElement;
      const liveSizeText = document.getElementById('compressLiveSizeText') as HTMLElement;
      const liveStatusMessage = document.getElementById('compressLiveStatusMessage') as HTMLDivElement;
      const btnTest = document.getElementById('btnTestCompress') as HTMLButtonElement;
      const btnSave = document.getElementById('btnSaveCompress') as HTMLButtonElement;

      const getSelectedMode = (): 'light' | 'balanced' | 'strong' | 'target' => {
        return ((document.querySelector('input[name="compressPreset"]:checked') as HTMLInputElement)?.value as any) || 'balanced';
      };

      const getTargetKB = (): number => {
        const val = parseFloat(targetInput?.value || '500') || 500;
        const unit = targetUnit?.value || 'KB';
        return unit === 'MB' ? Math.round(val * 1024) : Math.round(val);
      };

      const collectOptions = (): PDFCompressOptions => {
        const preset = getSelectedMode();
        return {
          preset,
          targetSizeKB: preset === 'target' ? getTargetKB() : undefined,
          removeMetadata: optMetadata?.checked ?? true,
          compressImages: optImages?.checked ?? true,
          rasterizePages: optRaster?.checked ?? false,
        };
      };

      const updateModeCardStyles = () => {
        const currentMode = getSelectedMode();
        modeCards.forEach((card) => {
          const mode = card.getAttribute('data-mode');
          const isSelected = mode === currentMode;
          const htmlCard = card as HTMLElement;
          if (isSelected) {
            htmlCard.style.borderColor = 'var(--primary)';
            htmlCard.style.background = 'rgba(249,87,56,0.05)';
            htmlCard.classList.add('active');
          } else {
            htmlCard.style.borderColor = 'var(--border-color)';
            htmlCard.style.background = 'var(--bg-surface)';
            htmlCard.classList.remove('active');
          }
        });

        if (targetPane) {
          targetPane.style.display = currentMode === 'target' ? 'block' : 'none';
        }

        updateLiveEstimate();
      };

      const updateLiveEstimate = () => {
        const mode = getSelectedMode();
        const currentOptions = collectOptions();
        const currentJson = JSON.stringify(currentOptions);

        if (cachedResult && lastOptionsJson === currentJson) {
          // Display cached exact result
          const newSizeFormatted = formatBytes(cachedResult.newSize);
          liveSizeText.textContent = `${newSizeFormatted} (${(cachedResult.newSize / 1024).toFixed(1)} KB)`;
          liveBadge.textContent = `-${cachedResult.reductionPercentage.toFixed(1)}% Saved`;
          liveBadge.style.background = 'rgba(16,185,129,0.15)';
          liveBadge.style.color = 'var(--accent-green)';

          if (mode === 'target' && currentOptions.targetSizeKB) {
            if (cachedResult.newSize <= currentOptions.targetSizeKB * 1024) {
              liveStatusMessage.innerHTML = `<span style="color: var(--accent-green); font-weight:600;">✓ File size meets your desired target!</span> New size: <strong>${newSizeFormatted}</strong> (Target: ${formatBytes(currentOptions.targetSizeKB * 1024)}). Ready to save!`;
            } else {
              liveStatusMessage.innerHTML = `<span style="color: var(--accent-amber); font-weight:600;">ℹ Size reached: ${newSizeFormatted} (Target: ${formatBytes(currentOptions.targetSizeKB * 1024)}).</span> Document is dominated by vector text with minimal images. You can enable <em>"Rasterize Page Mode"</em> to force a smaller file size, or click <strong>"Save PDF"</strong>.`;
            }
          } else {
            liveStatusMessage.innerHTML = `<span style="color: var(--accent-green); font-weight:600;">✓ Accurate compression test complete!</span> Document reduced by <strong>${cachedResult.reductionPercentage.toFixed(1)}%</strong>. Click <strong>"Save PDF"</strong> to choose where to save.`;
          }
          return;
        }

        // Show estimate before testing
        let estRatio = 0.5;
        let estBadge = '~50% Savings';
        if (mode === 'light') {
          estRatio = 0.8;
          estBadge = 'Est: ~20% Savings';
        } else if (mode === 'balanced') {
          estRatio = 0.5;
          estBadge = 'Est: ~50% Savings';
        } else if (mode === 'strong') {
          estRatio = 0.3;
          estBadge = 'Est: ~70% Savings';
        } else if (mode === 'target') {
          const tKb = getTargetKB();
          estRatio = Math.min(1.0, (tKb * 1024) / originalSizeBytes);
          const pct = Math.max(0, Math.round((1 - estRatio) * 100));
          estBadge = `Target: ~${pct}% Savings`;
        }

        const estBytes = Math.round(originalSizeBytes * estRatio);
        liveSizeText.textContent = `~${formatBytes(estBytes)} (Estimated)`;
        liveBadge.textContent = estBadge;
        liveBadge.style.background = 'rgba(249,87,56,0.12)';
        liveBadge.style.color = 'var(--primary)';
        liveStatusMessage.innerHTML = `Click <strong>"Calculate / Test Size"</strong> to test compression and preview the exact size, or click <strong>"Save PDF"</strong> to choose where to save the file.`;
      };

      const updateTargetDisplay = () => {
        const kb = getTargetKB();
        if (targetHint) {
          targetHint.innerHTML = `Target: <strong>${formatBytes(kb * 1024)}</strong> (${kb} KB)`;
        }
        updateLiveEstimate();
      };

      // Mode card clicks
      modeCards.forEach((card) => {
        card.addEventListener('click', () => {
          const radio = card.querySelector('input[type="radio"]') as HTMLInputElement;
          if (radio) radio.checked = true;
          updateModeCardStyles();
        });
      });

      targetInput?.addEventListener('input', updateTargetDisplay);
      targetUnit?.addEventListener('change', updateTargetDisplay);

      quickBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const kbAttr = btn.getAttribute('data-kb');
          const ratioAttr = btn.getAttribute('data-ratio');
          if (kbAttr) {
            const kbVal = parseInt(kbAttr, 10);
            if (kbVal >= 1024) {
              targetInput.value = (kbVal / 1024).toFixed(kbVal % 1024 === 0 ? 0 : 1);
              targetUnit.value = 'MB';
            } else {
              targetInput.value = kbVal.toString();
              targetUnit.value = 'KB';
            }
          } else if (ratioAttr) {
            const ratio = parseFloat(ratioAttr);
            const targetBytes = Math.round(originalSizeBytes * ratio);
            const targetKb = Math.round(targetBytes / 1024);
            if (targetKb >= 1024) {
              targetInput.value = (targetKb / 1024).toFixed(1);
              targetUnit.value = 'MB';
            } else {
              targetInput.value = targetKb.toString();
              targetUnit.value = 'KB';
            }
          }
          updateTargetDisplay();
        });
      });

      [optStreams, optMetadata, optImages, optRaster].forEach((cb) => {
        cb?.addEventListener('change', () => {
          updateLiveEstimate();
        });
      });

      // Calculate / Test Size Button
      btnTest?.addEventListener('click', async () => {
        if (isCompressing) return;
        isCompressing = true;
        btnTest.disabled = true;
        btnSave.disabled = true;
        const originalBtnHtml = btnTest.innerHTML;
        btnTest.innerHTML = `<span class="material-symbols-rounded" style="font-size: 16px; animation: spin 1s linear infinite;">sync</span> Compressing...`;
        liveStatusMessage.innerHTML = `<span style="color: var(--primary); font-weight:600;">Compressing document and optimizing visual streams...</span> Please wait.`;

        try {
          const opts = collectOptions();
          const result = await PDFEditorService.compressPDF(docBytes, opts);
          cachedResult = result;
          lastOptionsJson = JSON.stringify(opts);
          updateLiveEstimate();
        } catch (err: any) {
          liveStatusMessage.innerHTML = `<span style="color: var(--danger); font-weight:600;">Compression test failed:</span> ${err.message || 'An error occurred.'}`;
        } finally {
          isCompressing = false;
          btnTest.disabled = false;
          btnSave.disabled = false;
          btnTest.innerHTML = originalBtnHtml;
        }
      });

      updateModeCardStyles();
    }, 20);

    const validator = async (): Promise<boolean> => {
      if (isCompressing) return false;
      const saveBtn = document.getElementById('btnSaveCompress') as HTMLButtonElement;
      const targetInput = document.getElementById('compressTargetInput') as HTMLInputElement;
      const targetUnit = document.getElementById('compressTargetUnit') as HTMLSelectElement;
      const optMetadata = document.getElementById('compressOptMetadata') as HTMLInputElement;
      const optImages = document.getElementById('compressOptImages') as HTMLInputElement;
      const optRaster = document.getElementById('compressOptRaster') as HTMLInputElement;

      const getSelectedMode = (): 'light' | 'balanced' | 'strong' | 'target' => {
        return ((document.querySelector('input[name="compressPreset"]:checked') as HTMLInputElement)?.value as any) || 'balanced';
      };

      const preset = getSelectedMode();
      const val = parseFloat(targetInput?.value || '500') || 500;
      const unit = targetUnit?.value || 'KB';
      const targetSizeKB = unit === 'MB' ? Math.round(val * 1024) : Math.round(val);

      const opts: PDFCompressOptions = {
        preset,
        targetSizeKB: preset === 'target' ? targetSizeKB : undefined,
        removeMetadata: optMetadata?.checked ?? true,
        compressImages: optImages?.checked ?? true,
        rasterizePages: optRaster?.checked ?? false,
      };

      const currentJson = JSON.stringify(opts);
      if (!cachedResult || lastOptionsJson !== currentJson) {
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size: 16px; animation: spin 1s linear infinite;">sync</span> Saving...`;
        }
        try {
          cachedResult = await PDFEditorService.compressPDF(docBytes, opts);
          lastOptionsJson = currentJson;
        } catch (err: any) {
          alert('Failed to compress PDF: ' + (err.message || 'Error'));
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size: 16px;">save</span> Save PDF`;
          }
          return false;
        }
      }
      return true;
    };

    const confirmed = await this.show(html, validator);
    if (!confirmed || !cachedResult) return null;

    const optMetadata = document.getElementById('compressOptMetadata') as HTMLInputElement;
    const optImages = document.getElementById('compressOptImages') as HTMLInputElement;
    const optRaster = document.getElementById('compressOptRaster') as HTMLInputElement;
    const targetInput = document.getElementById('compressTargetInput') as HTMLInputElement;
    const targetUnit = document.getElementById('compressTargetUnit') as HTMLSelectElement;
    const selectedPreset = ((document.querySelector('input[name="compressPreset"]:checked') as HTMLInputElement)?.value as any) || 'balanced';
    const val = parseFloat(targetInput?.value || '500') || 500;
    const unit = targetUnit?.value || 'KB';

    const finalOptions: PDFCompressOptions = {
      preset: selectedPreset,
      targetSizeKB: selectedPreset === 'target' ? (unit === 'MB' ? Math.round(val * 1024) : Math.round(val)) : undefined,
      removeMetadata: optMetadata?.checked ?? true,
      compressImages: optImages?.checked ?? true,
      rasterizePages: optRaster?.checked ?? false,
    };

    const finalResult = cachedResult as unknown as PDFCompressResult;
    return {
      resultBytes: finalResult.bytes,
      options: finalOptions,
      finalSize: finalResult.newSize,
      originalSize: finalResult.originalSize,
      reductionPercentage: finalResult.reductionPercentage,
    };
  }

  /**
   * Prompt user to add customized text / heading onto PDF page(s)
   */
  static async promptAddText(
    currentPage: number,
    totalPages: number,
    isHeading = false
  ): Promise<{
    text: string;
    fontSize: number;
    colorHex: string;
    preset: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-center' | 'bottom-left' | 'bottom-right' | 'custom';
    targetPages: 'current' | 'all';
  } | null> {
    const title = isHeading ? 'Add Heading to Document' : 'Add Text to Document';
    const defaultText = isHeading ? 'Document Title / Heading' : 'Type your text here...';
    const defaultFontSize: number = isHeading ? 24 : 14;

    const html = `
      <div class="dialog-modal" style="max-width: 500px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">${isHeading ? 'title' : 'text_fields'}</span> ${title}</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body" style="gap: 14px;">
          <div class="form-group">
            <label style="font-weight: 600;">Text Content</label>
            <textarea id="addTextInput" rows="3" placeholder="Enter text to place on PDF..." style="width: 100%; resize: vertical; font-size: 13px;">${defaultText}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label style="font-weight: 600;">Font Size</label>
              <select id="addTextFontSize">
                <option value="10" ${defaultFontSize === 10 ? 'selected' : ''}>10 pt (Small)</option>
                <option value="12" ${defaultFontSize === 12 ? 'selected' : ''}>12 pt (Body)</option>
                <option value="14" ${defaultFontSize === 14 ? 'selected' : ''}>14 pt (Subheading)</option>
                <option value="18" ${defaultFontSize === 18 ? 'selected' : ''}>18 pt (Heading 3)</option>
                <option value="24" ${defaultFontSize === 24 ? 'selected' : ''}>24 pt (Heading 2)</option>
                <option value="32" ${defaultFontSize === 32 ? 'selected' : ''}>32 pt (Title)</option>
                <option value="48" ${defaultFontSize === 48 ? 'selected' : ''}>48 pt (Banner)</option>
              </select>
            </div>
            <div class="form-group">
              <label style="font-weight: 600;">Text Color</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="color" id="addTextColor" value="#1e293b" style="width: 38px; height: 32px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); cursor: pointer;" />
                <span id="addTextColorCode" style="font-size: 12px; color: var(--text-muted); font-family: monospace;">#1e293b</span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label style="font-weight: 600;">Position on Page</label>
            <select id="addTextPositionPreset">
              <option value="top-center" ${isHeading ? 'selected' : ''}>Top Center (Header area)</option>
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="center" ${!isHeading ? 'selected' : ''}>Center of Page</option>
              <option value="bottom-center">Bottom Center (Footer area)</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
            </select>
          </div>

          <div class="form-group">
            <label style="font-weight: 600;">Apply to Pages</label>
            <div style="display: flex; gap: 16px; font-size: 12.5px;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="addTextTarget" value="current" checked /> Current Page (Page ${currentPage} of ${totalPages})
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="addTextTarget" value="all" /> All ${totalPages} Pages
              </label>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm"><span class="material-symbols-rounded" style="font-size: 16px;">add</span> Add Text</button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const colorInput = document.getElementById('addTextColor') as HTMLInputElement;
      const codeSpan = document.getElementById('addTextColorCode');
      colorInput?.addEventListener('input', () => {
        if (codeSpan) codeSpan.textContent = colorInput.value;
      });
    }, 50);

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    const textInput = (document.getElementById('addTextInput') as HTMLTextAreaElement)?.value.trim();
    if (!textInput) return null;

    const fontSize = parseInt((document.getElementById('addTextFontSize') as HTMLSelectElement)?.value, 10) || defaultFontSize;
    const colorHex = (document.getElementById('addTextColor') as HTMLInputElement)?.value || '#1e293b';
    const preset = ((document.getElementById('addTextPositionPreset') as HTMLSelectElement)?.value as any) || 'center';
    const targetPages = ((document.querySelector('input[name="addTextTarget"]:checked') as HTMLInputElement)?.value as any) || 'current';

    return {
      text: textInput,
      fontSize,
      colorHex,
      preset,
      targetPages,
    };
  }

  /**
   * Prompt user with preview to add an image onto a PDF page
   */
  static async promptAddImage(
    fileName: string,
    imgWidth: number,
    imgHeight: number,
    currentPage: number,
    totalPages: number,
    previewDataUrl: string
  ): Promise<{
    width: number;
    height: number;
    preset: 'center' | 'top-center' | 'bottom-center' | 'custom';
    targetPages: 'current' | 'all';
  } | null> {
    let defaultW = imgWidth;
    let defaultH = imgHeight;
    const maxDim = 320;
    if (defaultW > maxDim || defaultH > maxDim) {
      const ratio = Math.min(maxDim / defaultW, maxDim / defaultH);
      defaultW = Math.round(defaultW * ratio);
      defaultH = Math.round(defaultH * ratio);
    }

    const html = `
      <div class="dialog-modal" style="max-width: 480px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">add_photo_alternate</span> Insert Image</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body" style="gap: 14px;">
          <div style="display: flex; gap: 14px; align-items: center; background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px;">
            <img src="${previewDataUrl}" style="width: 70px; height: 70px; object-fit: contain; background: white; border-radius: 4px; border: 1px solid var(--border-strong);" />
            <div style="flex: 1; overflow: hidden;">
              <div style="font-weight: 600; font-size: 13px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${fileName}</div>
              <div style="color: var(--text-muted); font-size: 11.5px; margin-top: 2px;">Original: ${imgWidth} × ${imgHeight} px</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label style="font-weight: 600;">Display Width (pt)</label>
              <input type="number" id="imgDisplayWidth" value="${defaultW}" min="20" max="1200" />
            </div>
            <div class="form-group">
              <label style="font-weight: 600;">Display Height (pt)</label>
              <input type="number" id="imgDisplayHeight" value="${defaultH}" min="20" max="1600" />
            </div>
          </div>

          <div class="form-group">
            <label style="font-weight: 600;">Placement on Page</label>
            <select id="imgPositionPreset">
              <option value="center" selected>Center of Page</option>
              <option value="top-center">Top Center</option>
              <option value="bottom-center">Bottom Center</option>
            </select>
          </div>

          <div class="form-group">
            <label style="font-weight: 600;">Target Page</label>
            <div style="font-size: 12.5px; color: var(--text-main);">
              Will be placed on <strong>Page ${currentPage}</strong> of ${totalPages}
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm"><span class="material-symbols-rounded" style="font-size: 16px;">add</span> Insert Image</button>
        </div>
      </div>
    `;

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    const width = parseInt((document.getElementById('imgDisplayWidth') as HTMLInputElement)?.value, 10) || defaultW;
    const height = parseInt((document.getElementById('imgDisplayHeight') as HTMLInputElement)?.value, 10) || defaultH;
    const preset = ((document.getElementById('imgPositionPreset') as HTMLSelectElement)?.value as any) || 'center';

    return {
      width,
      height,
      preset,
      targetPages: 'current',
    };
  }

  /**
   * Prompt user to add clickable hyperlink or internal page link
   */
  static async promptAddLink(
    currentPage: number,
    totalPages: number
  ): Promise<{
    linkType: 'url' | 'page';
    url?: string;
    targetPage?: number;
    text: string;
    preset: 'top-center' | 'center' | 'bottom-center';
  } | null> {
    const html = `
      <div class="dialog-modal" style="max-width: 480px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">add_link</span> Add Hyperlink</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body" style="gap: 14px;">
          <div class="form-group">
            <label style="font-weight: 600;">Link Destination Type</label>
            <div style="display: flex; gap: 16px; font-size: 12.5px;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="linkType" value="url" checked /> Web Address (URL)
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="linkType" value="page" /> Page Number (Jump to page)
              </label>
            </div>
          </div>

          <div class="form-group" id="linkUrlGroup">
            <label style="font-weight: 600;">Web Address (URL)</label>
            <input type="text" id="linkUrlInput" placeholder="https://example.com" value="https://" />
          </div>

          <div class="form-group hidden" id="linkPageGroup">
            <label style="font-weight: 600;">Jump to Page</label>
            <input type="number" id="linkPageInput" value="${Math.min(currentPage + 1, totalPages)}" min="1" max="${totalPages}" />
          </div>

          <div class="form-group">
            <label style="font-weight: 600;">Display Text</label>
            <input type="text" id="linkTextInput" placeholder="Clickable text displayed on page..." value="Click Here" />
          </div>

          <div class="form-group">
            <label style="font-weight: 600;">Position on Page</label>
            <select id="linkPositionPreset">
              <option value="center" selected>Center of Page</option>
              <option value="top-center">Top Center</option>
              <option value="bottom-center">Bottom Center</option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm"><span class="material-symbols-rounded" style="font-size: 16px;">link</span> Add Link</button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const typeRadios = document.querySelectorAll('input[name="linkType"]');
      const urlGroup = document.getElementById('linkUrlGroup');
      const pageGroup = document.getElementById('linkPageGroup');
      typeRadios.forEach((r) => {
        r.addEventListener('change', () => {
          const isUrl = (document.querySelector('input[name="linkType"]:checked') as HTMLInputElement)?.value === 'url';
          urlGroup?.classList.toggle('hidden', !isUrl);
          pageGroup?.classList.toggle('hidden', isUrl);
        });
      });
    }, 50);

    const confirmed = await this.show(html);
    if (!confirmed) return null;

    const isUrl = (document.querySelector('input[name="linkType"]:checked') as HTMLInputElement)?.value === 'url';
    const text = (document.getElementById('linkTextInput') as HTMLInputElement)?.value.trim() || 'Click Here';
    const preset = ((document.getElementById('linkPositionPreset') as HTMLSelectElement)?.value as any) || 'center';

    if (isUrl) {
      const url = (document.getElementById('linkUrlInput') as HTMLInputElement)?.value.trim();
      if (!url || url === 'https://') return null;
      return { linkType: 'url', url, text, preset };
    } else {
      const targetPage = parseInt((document.getElementById('linkPageInput') as HTMLInputElement)?.value, 10) || 1;
      return { linkType: 'page', targetPage, text, preset };
    }
  }

  /**
   * Prompt user to add a bookmark for the current page
   */
  static async promptAddBookmark(currentPage: number): Promise<string | null> {
    const html = `
      <div class="dialog-modal" style="max-width: 420px;">
        <div class="dialog-header">
          <h3><span class="material-symbols-rounded">bookmark_add</span> Add Bookmark</h3>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body" style="gap: 12px;">
          <div class="form-group">
            <label style="font-weight: 600;">Bookmark Title</label>
            <input type="text" id="bookmarkTitleInput" value="Page ${currentPage}" placeholder="Enter bookmark title..." autofocus />
          </div>
          <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
            This bookmark will point directly to <strong>Page ${currentPage}</strong> in the document outline sidebar.
          </p>
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
          <button class="dialog-btn primary" data-dialog-action="confirm"><span class="material-symbols-rounded" style="font-size: 16px;">bookmark</span> Add Bookmark</button>
        </div>
      </div>
    `;

    const confirmed = await this.show(html);
    if (!confirmed) return null;
    const title = (document.getElementById('bookmarkTitleInput') as HTMLInputElement)?.value.trim();
    return title || `Page ${currentPage}`;
  }

  /**
   * Prompt user to manage (view, edit, reorder, delete, add) document bookmarks
   */
  static async promptManageBookmarks(
    initialBookmarks: Array<{ id?: string; title: string; pageIndex: number }>,
    currentPage: number,
    totalPages: number,
    onNavigate?: (page: number) => void
  ): Promise<Array<{ id: string; title: string; pageIndex: number }> | null> {
    const list: Array<{ id: string; title: string; pageIndex: number }> = initialBookmarks.map((b, i) => ({
      id: b.id || `bm_${Date.now()}_${i}`,
      title: b.title || `Bookmark ${i + 1}`,
      pageIndex: typeof b.pageIndex === 'number' ? b.pageIndex : 0,
    }));

    const escapeHtml = (str: string) =>
      str.replace(/[&<>'"]/g, (tag) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      }[tag] || tag));

    const modalHtml = `
      <div class="dialog-modal" style="max-width: 580px; width: 95%;">
        <div class="dialog-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="material-symbols-rounded" style="color:var(--primary); font-size:22px;">bookmarks</span>
            <div>
              <h3 style="margin:0; font-size:14px; font-weight:600;">Manage Bookmarks</h3>
              <p style="margin:2px 0 0; font-size:11px; color:var(--text-muted); font-weight:normal;">
                Edit, reorder, jump, or add document outline bookmarks
              </p>
            </div>
          </div>
          <button class="dialog-close-btn" title="Close"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="dialog-body" style="padding: 14px; max-height: 380px; overflow-y: auto;">
          <div id="bmManagerBody"></div>
        </div>
        <div class="dialog-footer" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; gap:6px;">
            <button type="button" class="dialog-btn" id="btnBmAddMore" style="display:flex; align-items:center; gap:4px; font-size:12px;">
              <span class="material-symbols-rounded" style="font-size:16px;">add</span> Add
            </button>
            <button type="button" class="dialog-btn" id="btnBmClearAll" style="display:flex; align-items:center; gap:4px; font-size:12px; color:var(--danger, #ef4444);">
              <span class="material-symbols-rounded" style="font-size:16px;">delete_sweep</span> Clear All
            </button>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
            <button class="dialog-btn primary" data-dialog-action="confirm" style="display:flex; align-items:center; gap:4px;">
              <span class="material-symbols-rounded" style="font-size:16px;">check</span> Save Changes
            </button>
          </div>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      this.container.innerHTML = modalHtml;
      this.overlay.classList.remove('hidden');

      const renderContent = () => {
        const containerBody = document.getElementById('bmManagerBody');
        if (!containerBody) return;

        if (list.length === 0) {
          containerBody.innerHTML = `
            <div style="text-align: center; padding: 28px 16px; border: 2px dashed var(--border-subtle, #e2e8f0); border-radius: 8px;">
              <span class="material-symbols-rounded" style="font-size: 40px; color: var(--text-light, #94a3b8); margin-bottom: 8px; display: block;">bookmarks</span>
              <h4 style="margin: 0 0 6px; font-size: 14px; font-weight: 600; color: var(--text-main);">No Bookmarks in Document</h4>
              <p style="margin: 0 0 16px; font-size: 12px; color: var(--text-muted); max-width: 380px; margin-inline: auto; line-height: 1.4;">
                Bookmarks provide a table of contents outline allowing users to quickly jump between sections of the PDF.
              </p>
              <button type="button" id="btnEmptyAddCurrent" class="dialog-btn primary" style="display: inline-flex; align-items: center; gap: 6px; margin: 0 auto;">
                <span class="material-symbols-rounded" style="font-size: 16px;">bookmark_add</span>
                Add Bookmark for Current Page (Page ${currentPage})
              </button>
            </div>
          `;
          document.getElementById('btnEmptyAddCurrent')?.addEventListener('click', () => {
            list.push({
              id: `bm_${Date.now()}`,
              title: `Page ${currentPage}`,
              pageIndex: currentPage - 1,
            });
            renderContent();
          });
          return;
        }

        let rowsHtml = '';
        list.forEach((bm, idx) => {
          rowsHtml += `
            <div class="bm-manager-row" data-index="${idx}" style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--bg-surface-elevated, #f8fafc); border: 1px solid var(--border-subtle, #e2e8f0); border-radius: 6px; margin-bottom: 6px; transition: background 0.15s ease;">
              <span style="font-size: 11px; color: var(--text-muted); width: 22px; text-align: center; font-weight: 600;">#${idx + 1}</span>
              <div style="flex: 1; display: flex; align-items: center; gap: 6px;">
                <input type="text" class="bm-row-title" value="${escapeHtml(bm.title)}" placeholder="Bookmark title..." style="width: 100%; padding: 6px 10px; font-size: 12.5px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 4px; box-sizing: border-box; background: var(--bg-surface, #fff); color: var(--text-main);" />
              </div>
              <div style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-muted); white-space: nowrap;">
                <span>Page</span>
                <input type="number" class="bm-row-page" value="${bm.pageIndex + 1}" min="1" max="${totalPages}" style="width: 54px; padding: 5px 6px; font-size: 12px; text-align: center; border: 1px solid var(--border-color, #cbd5e1); border-radius: 4px; background: var(--bg-surface, #fff); color: var(--text-main);" />
              </div>
              <div style="display: flex; align-items: center; gap: 2px;">
                <button type="button" class="btn-bm-nav" title="Jump to page" style="border:none; background:transparent; padding:4px; cursor:pointer; border-radius:4px; color:var(--primary); display:flex; align-items:center;">
                  <span class="material-symbols-rounded" style="font-size:18px;">visibility</span>
                </button>
                <button type="button" class="btn-bm-up" title="Move Up" style="border:none; background:transparent; padding:4px; cursor:pointer; border-radius:4px; color:var(--text-muted); display:flex; align-items:center; ${idx === 0 ? 'opacity:0.3; pointer-events:none;' : ''}">
                  <span class="material-symbols-rounded" style="font-size:18px;">arrow_upward</span>
                </button>
                <button type="button" class="btn-bm-down" title="Move Down" style="border:none; background:transparent; padding:4px; cursor:pointer; border-radius:4px; color:var(--text-muted); display:flex; align-items:center; ${idx === list.length - 1 ? 'opacity:0.3; pointer-events:none;' : ''}">
                  <span class="material-symbols-rounded" style="font-size:18px;">arrow_downward</span>
                </button>
                <button type="button" class="btn-bm-del" title="Delete" style="border:none; background:transparent; padding:4px; cursor:pointer; border-radius:4px; color:var(--danger, #ef4444); display:flex; align-items:center;">
                  <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
                </button>
              </div>
            </div>
          `;
        });

        containerBody.innerHTML = rowsHtml;

        const rowEls = containerBody.querySelectorAll('.bm-manager-row');
        rowEls.forEach((rowEl) => {
          const idx = parseInt(rowEl.getAttribute('data-index') || '0', 10);
          const titleInput = rowEl.querySelector('.bm-row-title') as HTMLInputElement;
          const pageInput = rowEl.querySelector('.bm-row-page') as HTMLInputElement;
          const navBtn = rowEl.querySelector('.btn-bm-nav');
          const upBtn = rowEl.querySelector('.btn-bm-up');
          const downBtn = rowEl.querySelector('.btn-bm-down');
          const delBtn = rowEl.querySelector('.btn-bm-del');

          titleInput?.addEventListener('input', () => {
            if (list[idx]) list[idx].title = titleInput.value;
          });

          pageInput?.addEventListener('change', () => {
            const val = parseInt(pageInput.value, 10);
            if (!isNaN(val) && val >= 1 && val <= totalPages) {
              if (list[idx]) list[idx].pageIndex = val - 1;
            } else if (list[idx]) {
              pageInput.value = (list[idx].pageIndex + 1).toString();
            }
          });

          navBtn?.addEventListener('click', () => {
            if (list[idx]) onNavigate?.(list[idx].pageIndex + 1);
          });

          upBtn?.addEventListener('click', () => {
            if (idx > 0) {
              const temp = list[idx];
              list[idx] = list[idx - 1];
              list[idx - 1] = temp;
              renderContent();
            }
          });

          downBtn?.addEventListener('click', () => {
            if (idx < list.length - 1) {
              const temp = list[idx];
              list[idx] = list[idx + 1];
              list[idx + 1] = temp;
              renderContent();
            }
          });

          delBtn?.addEventListener('click', () => {
            list.splice(idx, 1);
            renderContent();
          });
        });
      };

      renderContent();

      document.getElementById('btnBmAddMore')?.addEventListener('click', () => {
        list.push({
          id: `bm_${Date.now()}`,
          title: `Page ${currentPage}`,
          pageIndex: currentPage - 1,
        });
        renderContent();
        const inputs = this.container.querySelectorAll('.bm-row-title');
        if (inputs.length > 0) {
          (inputs[inputs.length - 1] as HTMLInputElement).focus();
          (inputs[inputs.length - 1] as HTMLInputElement).select();
        }
      });

      document.getElementById('btnBmClearAll')?.addEventListener('click', () => {
        if (list.length === 0) return;
        if (confirm('Are you sure you want to remove all bookmarks?')) {
          list.length = 0;
          renderContent();
        }
      });

      const closeBtn = this.container.querySelector('.dialog-close-btn');
      const cancelBtn = this.container.querySelector('[data-dialog-action="cancel"]');
      const confirmBtn = this.container.querySelector('[data-dialog-action="confirm"]');

      const cleanup = (result: Array<{ id: string; title: string; pageIndex: number }> | null) => {
        this.overlay.classList.add('hidden');
        resolve(result);
        setTimeout(() => {
          if (this.overlay.classList.contains('hidden')) {
            this.container.innerHTML = '';
          }
        }, 150);
      };

      closeBtn?.addEventListener('click', () => cleanup(null));
      cancelBtn?.addEventListener('click', () => cleanup(null));
      confirmBtn?.addEventListener('click', () => {
        const rowEls = this.container.querySelectorAll('.bm-manager-row');
        rowEls.forEach((rowEl) => {
          const idx = parseInt(rowEl.getAttribute('data-index') || '0', 10);
          const titleInput = rowEl.querySelector('.bm-row-title') as HTMLInputElement;
          const pageInput = rowEl.querySelector('.bm-row-page') as HTMLInputElement;
          if (list[idx]) {
            if (titleInput && titleInput.value.trim()) {
              list[idx].title = titleInput.value.trim();
            }
            if (pageInput) {
              const val = parseInt(pageInput.value, 10);
              if (!isNaN(val) && val >= 1 && val <= totalPages) {
                list[idx].pageIndex = val - 1;
              }
            }
          }
        });
        cleanup(list);
      });
    });
  }

  /**
   * Prompt user to fill form fields interactively
   */
  static promptFillForm(
    fields: Array<{ name: string; type: string; value: string; options?: string[] }>
  ): Promise<Record<string, any> | null> {
    return new Promise((resolve) => {
      const fieldsHtml = fields.length === 0
        ? '<div style="text-align:center; padding:24px; color:var(--text-muted, #888);"><span class="material-symbols-rounded" style="font-size:40px; display:block; margin-bottom:8px;">info</span>No interactive form fields found in this document.</div>'
        : fields.map((f, i) => {
            if (f.type === 'text') {
              return `<div class="dialog-field">
                <label class="dialog-label" for="ff_${i}">${f.name}</label>
                <input id="ff_${i}" type="text" class="dialog-input ff-input" data-field="${f.name}" data-type="text" value="${(f.value || '').replace(/"/g, '&quot;')}" placeholder="Enter text..." />
              </div>`;
            } else if (f.type === 'checkbox') {
              return `<div class="dialog-field" style="flex-direction:row; align-items:center; gap:8px;">
                <input id="ff_${i}" type="checkbox" class="ff-input" data-field="${f.name}" data-type="checkbox" ${f.value === 'true' ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--primary-color, #2563eb);" />
                <label class="dialog-label" for="ff_${i}" style="margin-bottom:0;">${f.name}</label>
              </div>`;
            } else if (f.type === 'dropdown') {
              const optsHtml = (f.options || []).map(o =>
                `<option value="${o}" ${o === f.value ? 'selected' : ''}>${o}</option>`
              ).join('');
              return `<div class="dialog-field">
                <label class="dialog-label" for="ff_${i}">${f.name}</label>
                <select id="ff_${i}" class="dialog-input ff-input" data-field="${f.name}" data-type="dropdown">${optsHtml}</select>
              </div>`;
            } else if (f.type === 'radio') {
              const radiosHtml = (f.options || []).map((o) =>
                `<label style="display:flex; align-items:center; gap:6px; cursor:pointer; padding:2px 0;">
                  <input type="radio" name="ff_radio_${i}" class="ff-input" data-field="${f.name}" data-type="radio" value="${o}" ${o === f.value ? 'checked' : ''} style="accent-color:var(--primary-color, #2563eb);" />
                  ${o}
                </label>`
              ).join('');
              return `<div class="dialog-field">
                <label class="dialog-label">${f.name}</label>
                <div style="display:flex; flex-direction:column; gap:4px; padding-left:4px;">${radiosHtml}</div>
              </div>`;
            }
            return '';
          }).join('');

      const html = `
        <div class="dialog-card" style="min-width:440px; max-width:560px; max-height:80vh;">
          <div class="dialog-header">
            <h2 class="dialog-title">
              <span class="material-symbols-rounded" style="font-size:22px; color:var(--primary-color, #2563eb);">edit_note</span>
              Fill Form
            </h2>
            <button class="dialog-close-btn"><span class="material-symbols-rounded">close</span></button>
          </div>
          <div class="dialog-body" style="max-height:55vh; overflow-y:auto; padding:16px 20px;">
            <p style="font-size:13px; color:var(--text-muted, #888); margin-bottom:12px;">
              ${fields.length} form field(s) detected. Fill in values below and click Apply.
            </p>
            ${fieldsHtml}
          </div>
          <div class="dialog-footer">
            <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
            <button class="dialog-btn dialog-btn-primary" data-dialog-action="confirm" ${fields.length === 0 ? 'disabled' : ''}>
              <span class="material-symbols-rounded" style="font-size:16px;">check_circle</span>
              Apply
            </button>
          </div>
        </div>`;

      this.container.innerHTML = html;
      this.overlay.classList.remove('hidden');

      const closeBtn = this.container.querySelector('.dialog-close-btn');
      const cancelBtn = this.container.querySelector('[data-dialog-action="cancel"]');
      const confirmBtn = this.container.querySelector('[data-dialog-action="confirm"]');

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); doCleanup(null); }
      };
      window.addEventListener('keydown', onKeyDown);

      const doCleanup = (result: Record<string, any> | null) => {
        window.removeEventListener('keydown', onKeyDown);
        this.overlay.classList.add('hidden');
        setTimeout(() => {
          if (this.overlay.classList.contains('hidden')) this.container.innerHTML = '';
        }, 150);
        resolve(result);
      };

      closeBtn?.addEventListener('click', () => doCleanup(null));
      cancelBtn?.addEventListener('click', () => doCleanup(null));
      confirmBtn?.addEventListener('click', () => {
        const data: Record<string, any> = {};
        this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.ff-input').forEach(el => {
          const fieldName = el.getAttribute('data-field');
          const fieldType = el.getAttribute('data-type');
          if (!fieldName) return;
          if (fieldType === 'checkbox' && el instanceof HTMLInputElement) {
            data[fieldName] = el.checked ? 'true' : 'false';
          } else if (fieldType === 'radio' && el instanceof HTMLInputElement) {
            if (el.checked) data[fieldName] = el.value;
          } else if (fieldType === 'text' || fieldType === 'dropdown') {
            data[fieldName] = (el as HTMLInputElement).value;
          }
        });
        doCleanup(data);
      });

      setTimeout(() => {
        const firstInput = this.container.querySelector<HTMLInputElement>('.ff-input');
        firstInput?.focus();
      }, 100);
    });
  }

  /**
   * Prompt user for form field creation (text / checkbox / radio / dropdown / signature)
   */
  static promptAddFormField(
    fieldType: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature',
    currentPage: number,
    numPages: number
  ): Promise<{
    type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature';
    name: string;
    pageIndex: number;
    positionPreset: 'center' | 'top' | 'bottom' | 'custom' | 'pick';
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    defaultValue?: string;
    options?: string[];
    multiline?: boolean;
  } | null> {
    return new Promise((resolve) => {
      const typeIcons: Record<string, string> = {
        text: 'text_fields',
        checkbox: 'check_box',
        radio: 'radio_button_checked',
        dropdown: 'arrow_drop_down_circle',
        signature: 'draw',
      };

      const typeLabels: Record<string, string> = {
        text: 'Text Field',
        checkbox: 'Checkbox',
        radio: 'Radio Button Group',
        dropdown: 'Dropdown List',
        signature: 'Signature Field',
      };

      const defaultSizes: Record<string, { w: number; h: number }> = {
        text: { w: 200, h: 28 },
        checkbox: { w: 20, h: 20 },
        radio: { w: 18, h: 18 },
        dropdown: { w: 200, h: 28 },
        signature: { w: 240, h: 50 },
      };

      const icon = typeIcons[fieldType] || 'smart_button';
      const label = typeLabels[fieldType] || 'Form Field';
      const size = defaultSizes[fieldType] || { w: 150, h: 28 };
      const defaultName = `${fieldType}_${Date.now().toString().slice(-4)}`;

      // Build page options
      const pageOptionsHtml = Array.from({ length: numPages }, (_, i) => {
        const pNum = i + 1;
        return `<option value="${i}" ${pNum === currentPage ? 'selected' : ''}>Page ${pNum} of ${numPages}</option>`;
      }).join('');

      // Build field-specific HTML
      let specificHtml = '';
      if (fieldType === 'text') {
        specificHtml = `
          <div class="dialog-field">
            <label class="dialog-label" for="ffDefaultVal">Default Value / Placeholder</label>
            <input id="ffDefaultVal" type="text" class="dialog-input" placeholder="Optional placeholder text..." />
          </div>
          <div class="dialog-field" style="flex-direction:row; align-items:center; gap:8px;">
            <input id="ffMultiline" type="checkbox" style="width:16px; height:16px; accent-color:var(--primary-color, #2563eb);" />
            <label class="dialog-label" for="ffMultiline" style="margin-bottom:0; cursor:pointer;">Allow multiple lines (Text Area)</label>
          </div>`;
      } else if (fieldType === 'checkbox') {
        specificHtml = `
          <div class="dialog-field" style="flex-direction:row; align-items:center; gap:8px;">
            <input id="ffDefaultChecked" type="checkbox" style="width:16px; height:16px; accent-color:var(--primary-color, #2563eb);" />
            <label class="dialog-label" for="ffDefaultChecked" style="margin-bottom:0; cursor:pointer;">Checked by default</label>
          </div>`;
      } else if (fieldType === 'dropdown') {
        specificHtml = `
          <div class="dialog-field">
            <label class="dialog-label" for="ffOpts">Options (comma-separated)</label>
            <input id="ffOpts" type="text" class="dialog-input" value="Option 1, Option 2, Option 3" placeholder="Option 1, Option 2, Option 3" />
          </div>
          <div class="dialog-field">
            <label class="dialog-label" for="ffDefaultVal">Default Selected Option</label>
            <input id="ffDefaultVal" type="text" class="dialog-input" placeholder="Option 1 (leave blank for first option)" />
          </div>`;
      } else if (fieldType === 'radio') {
        specificHtml = `
          <div class="dialog-field">
            <label class="dialog-label" for="ffOpts">Choices / Options (comma-separated)</label>
            <input id="ffOpts" type="text" class="dialog-input" value="Option 1, Option 2, Option 3" placeholder="Option 1, Option 2, Option 3" />
            <span style="font-size:11px; color:var(--text-muted, #888); margin-top:4px;">Radio buttons will be placed in a clean vertical stack.</span>
          </div>`;
      } else if (fieldType === 'signature') {
        specificHtml = `
          <div class="dialog-field">
            <label class="dialog-label" for="ffDefaultVal">Signer Placeholder / Hint</label>
            <input id="ffDefaultVal" type="text" class="dialog-input" placeholder="e.g. Authorized Signatory" />
          </div>`;
      }

      const html = `
        <div class="dialog-card" style="min-width:440px; max-width:520px;">
          <div class="dialog-header">
            <h2 class="dialog-title">
              <span class="material-symbols-rounded" style="font-size:22px; color:var(--primary-color, #2563eb);">${icon}</span>
              Add ${label}
            </h2>
            <button class="dialog-close-btn"><span class="material-symbols-rounded">close</span></button>
          </div>
          <div class="dialog-body" style="padding:16px 20px; display:flex; flex-direction:column; gap:14px; max-height:65vh; overflow-y:auto;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="dialog-field">
                <label class="dialog-label" for="ffName">Field Name *</label>
                <input id="ffName" type="text" class="dialog-input" value="${defaultName}" placeholder="e.g. ${defaultName}" required />
              </div>
              <div class="dialog-field">
                <label class="dialog-label" for="ffPage">Target Page</label>
                <select id="ffPage" class="dialog-input">${pageOptionsHtml}</select>
              </div>
            </div>

            ${specificHtml}

            <div style="border-top:1px solid var(--border-color, #e2e8f0); padding-top:12px;">
              <label class="dialog-label" style="font-weight:600; margin-bottom:8px;">Placement & Size</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px;">
                <div class="dialog-field">
                  <label class="dialog-label" for="ffPreset">Position Mode</label>
                  <select id="ffPreset" class="dialog-input">
                    <option value="center" selected>Center of Page</option>
                    <option value="top">Top of Page</option>
                    <option value="bottom">Bottom of Page</option>
                    <option value="custom">Custom (X, Y)</option>
                    <option value="pick">Pick on Document (Click)</option>
                  </select>
                </div>
                <div style="display:flex; gap:8px;">
                  <div class="dialog-field" style="flex:1;">
                    <label class="dialog-label" for="ffWidth">Width (pt)</label>
                    <input id="ffWidth" type="number" class="dialog-input" value="${size.w}" min="10" max="800" />
                  </div>
                  <div class="dialog-field" style="flex:1;">
                    <label class="dialog-label" for="ffHeight">Height (pt)</label>
                    <input id="ffHeight" type="number" class="dialog-input" value="${size.h}" min="10" max="800" />
                  </div>
                </div>
              </div>

              <div id="ffCustomCoordsRow" style="display:none; grid-template-columns:1fr 1fr; gap:12px;">
                <div class="dialog-field">
                  <label class="dialog-label" for="ffX">X Position (pt)</label>
                  <input id="ffX" type="number" class="dialog-input" value="100" min="0" />
                </div>
                <div class="dialog-field">
                  <label class="dialog-label" for="ffY">Y Position (pt)</label>
                  <input id="ffY" type="number" class="dialog-input" value="400" min="0" />
                </div>
              </div>
            </div>
          </div>
          <div class="dialog-footer" style="display:flex; justify-content:space-between; align-items:center;">
            <button class="dialog-btn" data-dialog-action="pick" style="color:var(--primary-color, #2563eb); border-color:currentColor;">
              <span class="material-symbols-rounded" style="font-size:16px;">ads_click</span>
              Click to Place
            </button>
            <div style="display:flex; gap:8px;">
              <button class="dialog-btn" data-dialog-action="cancel">Cancel</button>
              <button class="dialog-btn dialog-btn-primary" data-dialog-action="confirm">
                <span class="material-symbols-rounded" style="font-size:16px;">add</span>
                Add Field
              </button>
            </div>
          </div>
        </div>`;

      this.container.innerHTML = html;
      this.overlay.classList.remove('hidden');

      const closeBtn = this.container.querySelector('.dialog-close-btn');
      const cancelBtn = this.container.querySelector('[data-dialog-action="cancel"]');
      const confirmBtn = this.container.querySelector('[data-dialog-action="confirm"]');
      const pickBtn = this.container.querySelector('[data-dialog-action="pick"]');
      const presetSelect = this.container.querySelector<HTMLSelectElement>('#ffPreset');
      const customRow = this.container.querySelector<HTMLElement>('#ffCustomCoordsRow');

      presetSelect?.addEventListener('change', () => {
        if (customRow) {
          customRow.style.display = presetSelect.value === 'custom' ? 'grid' : 'none';
        }
      });

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          doCleanup(null);
        } else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          submitForm(false);
        }
      };
      window.addEventListener('keydown', onKeyDown);

      const doCleanup = (result: any) => {
        window.removeEventListener('keydown', onKeyDown);
        this.overlay.classList.add('hidden');
        setTimeout(() => {
          if (this.overlay.classList.contains('hidden')) this.container.innerHTML = '';
        }, 150);
        resolve(result);
      };

      const submitForm = (isPick: boolean) => {
        const nameInput = this.container.querySelector<HTMLInputElement>('#ffName');
        const name = nameInput?.value?.trim();
        if (!name) {
          nameInput?.focus();
          return;
        }

        const pageSelect = this.container.querySelector<HTMLSelectElement>('#ffPage');
        const pageIndex = parseInt(pageSelect?.value || '0', 10);

        const presetVal = isPick ? 'pick' : (presetSelect?.value as any || 'center');
        const widthInput = this.container.querySelector<HTMLInputElement>('#ffWidth');
        const heightInput = this.container.querySelector<HTMLInputElement>('#ffHeight');
        const xInput = this.container.querySelector<HTMLInputElement>('#ffX');
        const yInput = this.container.querySelector<HTMLInputElement>('#ffY');

        const width = parseInt(widthInput?.value || String(size.w), 10);
        const height = parseInt(heightInput?.value || String(size.h), 10);
        const x = xInput ? parseInt(xInput.value || '100', 10) : undefined;
        const y = yInput ? parseInt(yInput.value || '400', 10) : undefined;

        let defaultValue: string | undefined;
        let options: string[] | undefined;
        let multiline = false;

        if (fieldType === 'text') {
          defaultValue = this.container.querySelector<HTMLInputElement>('#ffDefaultVal')?.value || '';
          multiline = this.container.querySelector<HTMLInputElement>('#ffMultiline')?.checked || false;
        } else if (fieldType === 'checkbox') {
          defaultValue = this.container.querySelector<HTMLInputElement>('#ffDefaultChecked')?.checked ? 'true' : 'false';
        } else if (fieldType === 'dropdown' || fieldType === 'radio') {
          const rawOpts = this.container.querySelector<HTMLInputElement>('#ffOpts')?.value || '';
          options = rawOpts.split(',').map((s) => s.trim()).filter(Boolean);
          if (fieldType === 'dropdown') {
            defaultValue = this.container.querySelector<HTMLInputElement>('#ffDefaultVal')?.value?.trim();
          }
        } else if (fieldType === 'signature') {
          defaultValue = this.container.querySelector<HTMLInputElement>('#ffDefaultVal')?.value?.trim();
        }

        doCleanup({
          type: fieldType,
          name,
          pageIndex,
          positionPreset: presetVal,
          width,
          height,
          x,
          y,
          defaultValue,
          options,
          multiline,
        });
      };

      closeBtn?.addEventListener('click', () => doCleanup(null));
      cancelBtn?.addEventListener('click', () => doCleanup(null));
      confirmBtn?.addEventListener('click', () => submitForm(false));
      pickBtn?.addEventListener('click', () => submitForm(true));

      setTimeout(() => {
        this.container.querySelector<HTMLInputElement>('#ffName')?.focus();
      }, 100);
    });
  }
}
