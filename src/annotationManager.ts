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
   * Render all annotations for a specific page onto an overlay canvas
   */
  renderAnnotations(
    canvas: HTMLCanvasElement,
    annotations: PageAnnotation[],
    scale = 1.0
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
            ctx.beginPath();
            const y = (annot.rect.y + annot.rect.height) * scale;
            ctx.moveTo(annot.rect.x * scale, y);
            ctx.lineTo((annot.rect.x + annot.rect.width) * scale, y);
            ctx.stroke();
          }
          break;

        case 'strikethrough':
          if (annot.rect) {
            ctx.beginPath();
            const y = (annot.rect.y + annot.rect.height / 2) * scale;
            ctx.moveTo(annot.rect.x * scale, y);
            ctx.lineTo((annot.rect.x + annot.rect.width) * scale, y);
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

        case 'stamp':
          if (annot.rect && annot.text) {
            ctx.save();
            ctx.translate((annot.rect.x + annot.rect.width / 2) * scale, (annot.rect.y + annot.rect.height / 2) * scale);
            ctx.rotate(-0.15); // subtle angle
            ctx.fillStyle = annot.color;
            ctx.strokeStyle = annot.color;
            ctx.lineWidth = 3 * scale;
            
            const w = annot.rect.width * scale;
            const h = annot.rect.height * scale;
            ctx.strokeRect(-w / 2, -h / 2, w, h);

            ctx.font = `bold ${Math.floor(18 * scale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(annot.text, 0, -4 * scale);

            if (annot.timestamp) {
              ctx.font = `${Math.floor(9 * scale)}px sans-serif`;
              ctx.fillText(annot.timestamp, 0, 14 * scale);
            }
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

        case 'text-comment':
          if (annot.rect && annot.text) {
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(annot.rect.x * scale, annot.rect.y * scale, annot.rect.width * scale, annot.rect.height * scale);
            ctx.strokeStyle = '#ca8a04';
            ctx.strokeRect(annot.rect.x * scale, annot.rect.y * scale, annot.rect.width * scale, annot.rect.height * scale);

            ctx.fillStyle = '#713f12';
            ctx.font = `${Math.floor(11 * scale)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(annot.text, (annot.rect.x + 4) * scale, (annot.rect.y + 4) * scale, (annot.rect.width - 8) * scale);
          }
          break;

        default:
          break;
      }

      ctx.restore();
    });
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
    }
  ): PageAnnotation {
    return {
      id: 'annot_' + Math.random().toString(36).substring(2, 9),
      pageIndex,
      type,
      color: this.currentColor,
      strokeWidth: this.currentStrokeWidth,
      opacity: this.currentOpacity,
      points: params.points,
      rect: params.rect,
      text: params.text,
      author: params.author || 'User',
      timestamp: new Date().toLocaleDateString('en-US', { hour: '2-digit', minute: '2-digit' }),
      extra: params.extra,
    };
  }
}
