import type { PageAnnotation, AnnotationType } from './types';

export class AnnotationManager {
  private activeTool: AnnotationType | null = null;
  private currentColor = '#FBBF24';
  private currentStrokeWidth = 3;
  private currentOpacity = 0.6;
  private measurementScale = 1.0; // 1 px = 1 mm by default

  constructor() {}

  setActiveTool(tool: AnnotationType | null) {
    this.activeTool = tool;
  }

  getActiveTool(): AnnotationType | null {
    return this.activeTool;
  }

  getCurrentColor(): string {
    return this.currentColor;
  }

  getCurrentStrokeWidth(): number {
    return this.currentStrokeWidth;
  }

  getCurrentOpacity(): number {
    return this.currentOpacity;
  }

  setProperties(color: string, strokeWidth: number, opacity: number) {
    this.currentColor = color;
    this.currentStrokeWidth = strokeWidth;
    this.currentOpacity = opacity;
  }

  setMeasurementScale(scale: number) {
    this.measurementScale = scale;
  }

  getMeasurementScale(): number {
    return this.measurementScale;
  }

  /**
   * Hit-test: find which annotation (if any) contains the given point (in PDF coordinates).
   * Returns the topmost matching annotation (last in array = drawn last = on top).
   */
  hitTest(
    annotations: PageAnnotation[],
    px: number,
    py: number,
    tolerance = 8
  ): PageAnnotation | null {
    // Iterate in reverse so topmost (last drawn) is tested first
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      if (this.annotationContainsPoint(a, px, py, tolerance)) return a;
    }
    return null;
  }

  private annotationContainsPoint(
    a: PageAnnotation,
    px: number,
    py: number,
    tolerance: number
  ): boolean {
    // Rect-based annotations
    if (a.rect) {
      if (a.type === 'sticky-note' || a.type === 'text-comment') {
        const baseW = Math.max(140, a.rect.width);
        const baseH = Math.max(90, a.rect.height);
        // Note can expand up to 1.3x centered on annot.rect; allow full expanded bounds plus tolerance
        const expW = baseW * 1.35;
        const expH = baseH * 1.35;
        const expX = a.rect.x - (expW - baseW) / 2;
        const expY = a.rect.y - (expH - baseH) / 2;
        return (
          px >= expX - tolerance &&
          px <= expX + expW + tolerance &&
          py >= expY - tolerance &&
          py <= expY + expH + tolerance
        );
      }

      const { x, y, width, height } = a.rect;
      const minW = Math.max(width, tolerance * 2);
      const minH = Math.max(height, tolerance * 2);
      const cx = x + width / 2;
      const cy = y + height / 2;
      if (
        px >= cx - minW / 2 - tolerance &&
        px <= cx + minW / 2 + tolerance &&
        py >= cy - minH / 2 - tolerance &&
        py <= cy + minH / 2 + tolerance
      ) {
        return true;
      }
    }

    // Points-based annotations (line, arrow, freehand)
    if (a.points && a.points.length >= 2) {
      if (a.type === 'freehand') {
        for (let i = 1; i < a.points.length; i++) {
          if (this.distToSegment(px, py, a.points[i - 1], a.points[i]) <= tolerance + a.strokeWidth) {
            return true;
          }
        }
      } else {
        // line, arrow, measure
        if (this.distToSegment(px, py, a.points[0], a.points[1]) <= tolerance + a.strokeWidth) {
          return true;
        }
      }
    }

    return false;
  }

  private distToSegment(
    px: number,
    py: number,
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return Math.hypot(px - p1.x, py - p1.y);
    }
    let t = ((px - p1.x) * dx + (py - p1.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (p1.x + t * dx), py - (p1.y + t * dy));
  }

  /**
   * Render all annotations for a specific page onto an overlay canvas
   */
  renderAnnotations(
    canvas: HTMLCanvasElement,
    annotations: PageAnnotation[],
    scale = 1.0,
    selectedId?: string | null,
    hoveredId?: string | null
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    annotations.forEach((annot) => {
      ctx.save();
      ctx.globalAlpha = annot.opacity;
      ctx.strokeStyle = annot.color;
      ctx.fillStyle = annot.color;
      ctx.lineWidth = annot.strokeWidth * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      switch (annot.type) {
        case 'freehand':
          if (annot.points && annot.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(annot.points[0].x * scale, annot.points[0].y * scale);
            for (let i = 1; i < annot.points.length; i++) {
              ctx.lineTo(annot.points[i].x * scale, annot.points[i].y * scale);
            }
            ctx.stroke();
          }
          break;

        case 'highlight':
          if (annot.rect) {
            ctx.fillStyle = annot.color;
            ctx.fillRect(
              annot.rect.x * scale,
              annot.rect.y * scale,
              annot.rect.width * scale,
              annot.rect.height * scale
            );
          }
          break;

        case 'underline':
          if (annot.rect) {
            ctx.lineWidth = Math.max(2, (annot.strokeWidth || 2)) * scale;
            ctx.strokeStyle = annot.color || '#2563EB';
            ctx.globalAlpha = annot.opacity || 1.0;
            ctx.beginPath();
            const uy = (annot.rect.y + annot.rect.height) * scale;
            ctx.moveTo(annot.rect.x * scale, uy);
            ctx.lineTo((annot.rect.x + annot.rect.width) * scale, uy);
            ctx.stroke();
          }
          break;

        case 'strikethrough':
          if (annot.rect) {
            ctx.lineWidth = Math.max(2, (annot.strokeWidth || 2)) * scale;
            ctx.strokeStyle = annot.color || '#DC2626';
            ctx.globalAlpha = annot.opacity || 1.0;
            ctx.beginPath();
            const sy = (annot.rect.y + annot.rect.height * 0.52) * scale;
            ctx.moveTo(annot.rect.x * scale, sy);
            ctx.lineTo((annot.rect.x + annot.rect.width) * scale, sy);
            ctx.stroke();
          }
          break;

        case 'rectangle':
          if (annot.rect) {
            ctx.strokeRect(
              annot.rect.x * scale,
              annot.rect.y * scale,
              annot.rect.width * scale,
              annot.rect.height * scale
            );
          }
          break;

        case 'redact':
          if (annot.rect) {
            const rx = annot.rect.x * scale;
            const ry = annot.rect.y * scale;
            const rw = annot.rect.width * scale;
            const rh = annot.rect.height * scale;

            // Solid blackout fill
            ctx.fillStyle = '#000000';
            ctx.fillRect(rx, ry, rw, rh);

            // Red dashed indicator border showing pending redaction
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = Math.max(1, 1.5 * scale);
            ctx.setLineDash([4 * scale, 3 * scale]);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);

            // Text label if large enough
            if (rw > 45 * scale && rh > 16 * scale) {
              const fontSize = Math.max(9, Math.min(13, rh * 0.42));
              ctx.font = `bold ${fontSize}px sans-serif`;
              ctx.fillStyle = '#ef4444';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('REDACT', rx + rw / 2, ry + rh / 2);
            }
          }
          break;

        case 'ellipse':
          if (annot.rect) {
            ctx.beginPath();
            const cx = (annot.rect.x + annot.rect.width / 2) * scale;
            const cy = (annot.rect.y + annot.rect.height / 2) * scale;
            const rx = Math.abs((annot.rect.width / 2) * scale);
            const ry = Math.abs((annot.rect.height / 2) * scale);
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;

        case 'line':
          if (annot.points && annot.points.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(annot.points[0].x * scale, annot.points[0].y * scale);
            ctx.lineTo(annot.points[1].x * scale, annot.points[1].y * scale);
            ctx.stroke();
          }
          break;

        case 'arrow':
          if (annot.points && annot.points.length >= 2) {
            const p1 = { x: annot.points[0].x * scale, y: annot.points[0].y * scale };
            const p2 = { x: annot.points[1].x * scale, y: annot.points[1].y * scale };
            
            // Draw shaft
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Draw arrowhead
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const headlen = 12 * scale;
            ctx.beginPath();
            ctx.moveTo(p2.x, p2.y);
            ctx.lineTo(p2.x - headlen * Math.cos(angle - Math.PI / 6), p2.y - headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(p2.x - headlen * Math.cos(angle + Math.PI / 6), p2.y - headlen * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
          }
          break;

        case 'sticky-note':
        case 'text-comment':
          if (annot.rect) {
            const isHovered = hoveredId === annot.id;
            const isSelected = selectedId === annot.id;
            const isExpanded = isHovered || isSelected;

            // Expand when hovered or selected
            const expandScale = isExpanded ? 1.3 : 1.0;
            const baseW = Math.max(140, annot.rect.width);
            const baseH = Math.max(90, annot.rect.height);
            const sw = baseW * scale * expandScale;
            const sh = baseH * scale * expandScale;
            const sx = (annot.rect.x * scale) - (sw - baseW * scale) / 2;
            const sy = (annot.rect.y * scale) - (sh - baseH * scale) / 2;

            ctx.save();

            // Rich Drop Shadow
            ctx.shadowColor = isExpanded ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.16)';
            ctx.shadowBlur = isExpanded ? 16 * scale : 6 * scale;
            ctx.shadowOffsetX = isExpanded ? 3 * scale : 1 * scale;
            ctx.shadowOffsetY = isExpanded ? 8 * scale : 3 * scale;

            // Note Background Gradient (Warm Post-it Yellow)
            const bgGrad = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
            bgGrad.addColorStop(0, '#FEFCE8');
            bgGrad.addColorStop(1, '#FEF08A');
            ctx.fillStyle = bgGrad;
            ctx.globalAlpha = 1.0;

            // Rounded rectangle path with folded top-right corner
            const r = 5 * scale;
            const fold = (isExpanded ? 14 : 10) * scale;

            ctx.beginPath();
            ctx.moveTo(sx + r, sy);
            ctx.lineTo(sx + sw - fold, sy);
            ctx.lineTo(sx + sw, sy + fold);
            ctx.lineTo(sx + sw, sy + sh - r);
            ctx.arcTo(sx + sw, sy + sh, sx + sw - r, sy + sh, r);
            ctx.lineTo(sx + r, sy + sh);
            ctx.arcTo(sx, sy + sh, sx, sy + sh - r, r);
            ctx.lineTo(sx, sy + r);
            ctx.arcTo(sx, sy, sx + r, sy, r);
            ctx.closePath();
            ctx.fill();

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Fold corner flap
            ctx.fillStyle = '#EAB308';
            ctx.beginPath();
            ctx.moveTo(sx + sw - fold, sy);
            ctx.lineTo(sx + sw, sy + fold);
            ctx.lineTo(sx + sw - fold, sy + fold);
            ctx.closePath();
            ctx.fill();

            // Border
            ctx.strokeStyle = isSelected ? '#3B82F6' : isHovered ? '#EAB308' : '#CA8A04';
            ctx.lineWidth = (isSelected ? 2 : 1) * scale;
            ctx.stroke();

            // Header banner (Pin + Author + Date)
            const headerH = (isExpanded ? 22 : 18) * scale;
            ctx.fillStyle = '#FDE047';
            ctx.fillRect(sx + 1, sy + 1, sw - fold - 2, headerH);

            // Red/Orange Pin icon dot
            ctx.fillStyle = '#DC2626';
            ctx.beginPath();
            ctx.arc(sx + 10 * scale, sy + headerH / 2, (isExpanded ? 3.5 : 2.5) * scale, 0, Math.PI * 2);
            ctx.fill();

            // Author & Time header text
            ctx.fillStyle = '#713F12';
            ctx.font = `600 ${Math.max(9, Math.floor((isExpanded ? 11 : 9.5) * scale))}px system-ui, -apple-system, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const author = annot.author || 'Note';
            const timeStr = annot.timestamp || '';
            const headerText = timeStr ? `${author} • ${timeStr}` : author;
            ctx.fillText(headerText, sx + 18 * scale, sy + headerH / 2, sw - fold - 24 * scale);

            // Note Body Text
            if (annot.text) {
              ctx.fillStyle = '#1E293B';
              const fontSize = Math.max(10, Math.floor((isExpanded ? 13 : 11) * scale));
              ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'top';

              const padX = 8 * scale;
              const padY = headerH + 6 * scale;
              const maxTextW = sw - padX * 2;
              const lineH = Math.floor(fontSize * 1.35);

              // Multiline word wrap
              const paragraphs = annot.text.split('\n');
              let curY = sy + padY;
              const maxLines = isExpanded ? 10 : 3;
              let lineCount = 0;

              for (const paragraph of paragraphs) {
                const words = paragraph.split(' ');
                let curLine = '';
                for (const w of words) {
                  const testLine = curLine ? curLine + ' ' + w : w;
                  if (ctx.measureText(testLine).width > maxTextW && curLine) {
                    ctx.fillText(curLine, sx + padX, curY);
                    curLine = w;
                    curY += lineH;
                    lineCount++;
                    if (lineCount >= maxLines) break;
                  } else {
                    curLine = testLine;
                  }
                }
                if (lineCount >= maxLines) break;
                if (curLine) {
                  ctx.fillText(curLine, sx + padX, curY);
                  curY += lineH;
                  lineCount++;
                }
                if (lineCount >= maxLines) break;
              }

              // Hint when collapsed
              if (!isExpanded && annot.text.length > 40) {
                ctx.fillStyle = '#94A3B8';
                ctx.font = `italic ${Math.floor(7.5 * scale)}px sans-serif`;
                ctx.fillText('Hover to expand...', sx + padX, sy + sh - 12 * scale);
              }
            }

            ctx.restore();
          }
          break;

        case 'stamp':
          if (annot.rect) {
            ctx.save();
            const sw = annot.rect.width * scale;
            const sh = annot.rect.height * scale;
            const centerX = (annot.rect.x + annot.rect.width / 2) * scale;
            const centerY = (annot.rect.y + annot.rect.height / 2) * scale;

            ctx.translate(centerX, centerY);
            ctx.rotate(-0.15); // subtle angle

            ctx.fillStyle = annot.color;
            ctx.strokeStyle = annot.color;
            ctx.lineWidth = 2.5 * scale;
            ctx.globalAlpha = annot.opacity;

            // Outer border (double-line stamp effect)
            ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
            ctx.strokeRect(-sw / 2 + 3 * scale, -sh / 2 + 3 * scale, sw - 6 * scale, sh - 6 * scale);

            // Parse multi-line text from extra.lines or fallback to text
            const lines: string[] = annot.extra?.lines
              ? annot.extra.lines.filter((l: string) => l && l.trim())
              : annot.text
              ? annot.text.split('\n').filter((l) => l.trim())
              : [];

            if (lines.length === 0) {
              ctx.restore();
              break;
            }

            // Auto-fit font sizes
            const padding = 10 * scale;
            const availW = sw - padding * 2;
            const availH = sh - padding * 2;

            // First line is the main status text — largest
            const mainLine = lines[0];
            const subLines = lines.slice(1);

            // Calculate main font size
            let mainFontSize = Math.floor(Math.min(22, availH * 0.4) * scale);
            ctx.font = `900 ${mainFontSize}px sans-serif`;
            let mainW = ctx.measureText(mainLine).width;
            if (mainW > availW) {
              mainFontSize = Math.floor(mainFontSize * (availW / mainW));
              ctx.font = `900 ${mainFontSize}px sans-serif`;
            }

            // Sub lines smaller
            const subFontSize = Math.max(
              Math.floor(7 * scale),
              Math.floor(Math.min(11, (availH * 0.18)) * scale)
            );

            const totalH = mainFontSize + subLines.length * (subFontSize + 2 * scale) + 4 * scale;
            let startY = -totalH / 2 + mainFontSize / 2;

            // Draw main line
            ctx.globalAlpha = annot.opacity;
            ctx.fillStyle = annot.color;
            ctx.font = `900 ${mainFontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(mainLine, 0, startY, availW);
            startY += mainFontSize / 2 + 4 * scale;

            // Draw sub lines
            ctx.font = `600 ${subFontSize}px sans-serif`;
            subLines.forEach((line) => {
              startY += subFontSize / 2;
              ctx.fillText(line, 0, startY, availW);
              startY += subFontSize / 2 + 2 * scale;
            });

            ctx.restore();
          }
          break;

        case 'measure':
          if (annot.points && annot.points.length >= 2) {
            const p1 = { x: annot.points[0].x * scale, y: annot.points[0].y * scale };
            const p2 = { x: annot.points[1].x * scale, y: annot.points[1].y * scale };

            ctx.beginPath();
            ctx.setLineDash([4 * scale, 2 * scale]);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw measure label
            const dx = (annot.points[1].x - annot.points[0].x);
            const dy = (annot.points[1].y - annot.points[0].y);
            const distPx = Math.sqrt(dx * dx + dy * dy);
            const distMm = (distPx * (annot.extra?.scale || 0.352778)).toFixed(1); // mm

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(midX - 28 * scale, midY - 10 * scale, 56 * scale, 20 * scale);
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.floor(10 * scale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${distMm} mm`, midX, midY);
          }
          break;



        default:
          break;
      }

      ctx.restore();
    });

    // Draw selection handles for the selected annotation
    if (selectedId) {
      const sel = annotations.find((a) => a.id === selectedId);
      if (sel) {
        this.drawSelectionHandles(ctx, sel, scale);
      }
    }
  }

  private drawSelectionHandles(ctx: CanvasRenderingContext2D, annot: PageAnnotation, scale: number) {
    ctx.save();
    ctx.globalAlpha = 1;

    let bounds: { x: number; y: number; width: number; height: number } | null = null;

    if (annot.type === 'freehand' || annot.type === 'line' || annot.type === 'arrow') {
      if (annot.points && annot.points.length >= 2) {
        const xs = annot.points.map((p) => p.x * scale);
        const ys = annot.points.map((p) => p.y * scale);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        bounds = { x: minX, y: minY, width: Math.max(10 * scale, maxX - minX), height: Math.max(10 * scale, maxY - minY) };
      }
    } else if (annot.rect) {
      if (annot.type === 'sticky-note' || annot.type === 'text-comment') {
        const baseW = Math.max(140, annot.rect.width);
        const baseH = Math.max(90, annot.rect.height);
        const expandScale = 1.3;
        const sw = baseW * scale * expandScale;
        const sh = baseH * scale * expandScale;
        const sx = (annot.rect.x * scale) - (sw - baseW * scale) / 2;
        const sy = (annot.rect.y * scale) - (sh - baseH * scale) / 2;
        bounds = { x: sx, y: sy, width: sw, height: sh };
      } else {
        bounds = {
          x: annot.rect.x * scale,
          y: annot.rect.y * scale,
          width: annot.rect.width * scale,
          height: annot.rect.height * scale,
        };
      }
    } else if (annot.points && annot.points.length >= 2) {
      const xs = annot.points.map((p) => p.x * scale);
      const ys = annot.points.map((p) => p.y * scale);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      bounds = { x: minX, y: minY, width: Math.max(10 * scale, maxX - minX), height: Math.max(10 * scale, maxY - minY) };
    }

    if (!bounds) { ctx.restore(); return; }

    const pad = 5 * scale;
    const bx = bounds.x - pad;
    const by = bounds.y - pad;
    const bw = bounds.width + pad * 2;
    const bh = bounds.height + pad * 2;

    // Dashed selection border
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);

    // Corner handles
    const hSize = 7;
    const corners = [
      [bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh],
      [bx + bw / 2, by], [bx + bw / 2, by + bh], [bx, by + bh / 2], [bx + bw, by + bh / 2],
    ];
    corners.forEach(([cx, cy]) => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(cx - hSize / 2, cy - hSize / 2, hSize, hSize);
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
  }

  /**
   * Create annotation object from user interaction
   */
  createAnnotation(
    pageIndex: number,
    type: AnnotationType,
    params: {
      points?: { x: number; y: number }[];
      rect?: { x: number; y: number; width: number; height: number };
      text?: string;
      author?: string;
      extra?: any;
      color?: string;
      strokeWidth?: number;
      opacity?: number;
    }
  ): PageAnnotation {
    return {
      id: 'annot_' + Math.random().toString(36).substring(2, 9),
      pageIndex,
      type,
      color: params.color || this.currentColor,
      strokeWidth: params.strokeWidth !== undefined ? params.strokeWidth : this.currentStrokeWidth,
      opacity: params.opacity !== undefined ? params.opacity : this.currentOpacity,
      points: params.points,
      rect: params.rect,
      text: params.text,
      author: params.author || 'User',
      timestamp: new Date().toLocaleDateString('en-US', { hour: '2-digit', minute: '2-digit' }),
      extra: params.extra,
    };
  }
}
