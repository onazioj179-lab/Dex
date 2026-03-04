/**
 * DEX Platform - PRISM Engine
 * Advanced image manipulation engine: selections, filters, transforms, clone/heal, gradient, pen
 * Copyright (c) 2026 DEX. All rights reserved.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SELECTION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export interface SelectionState {
  /** Uint8Array mask: 0 = unselected, 255 = selected, 1-254 = feathered */
  mask: Uint8Array | null;
  /** For lasso: array of points being drawn */
  lassoPoints: { x: number; y: number }[];
  /** For rect/ellipse marquee: dragging bounds */
  marqueeBounds: { x: number; y: number; w: number; h: number } | null;
  /** Selection mode */
  mode: 'new' | 'add' | 'subtract' | 'intersect';
  /** Marching ants animation offset */
  antOffset: number;
  /** Feather radius */
  feather: number;
  /** Magic wand tolerance (0-255) */
  wandTolerance: number;
  /** Whether wand is contiguous */
  wandContiguous: boolean;
}

export function createEmptySelection(): SelectionState {
  return {
    mask: null,
    lassoPoints: [],
    marqueeBounds: null,
    mode: 'new',
    antOffset: 0,
    feather: 0,
    wandTolerance: 32,
    wandContiguous: true,
  };
}

/** Create rectangular selection mask */
export function createRectSelection(
  w: number, h: number,
  rect: { x: number; y: number; w: number; h: number },
  existing: Uint8Array | null,
  mode: SelectionState['mode'],
  feather: number,
): Uint8Array {
  const mask = combineMaskStart(w, h, existing, mode);
  const rx = Math.max(0, Math.round(rect.x));
  const ry = Math.max(0, Math.round(rect.y));
  const rw = Math.min(w - rx, Math.round(rect.w));
  const rh = Math.min(h - ry, Math.round(rect.h));

  const newMask = new Uint8Array(w * h);
  for (let y = ry; y < ry + rh && y < h; y++) {
    for (let x = rx; x < rx + rw && x < w; x++) {
      newMask[y * w + x] = 255;
    }
  }

  if (feather > 0) applyFeather(newMask, w, h, feather);
  return combineMasks(mask, newMask, w * h, mode);
}

/** Create elliptical selection mask */
export function createEllipseSelection(
  w: number, h: number,
  bounds: { x: number; y: number; w: number; h: number },
  existing: Uint8Array | null,
  mode: SelectionState['mode'],
  feather: number,
): Uint8Array {
  const mask = combineMaskStart(w, h, existing, mode);
  const newMask = new Uint8Array(w * h);
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const rx = bounds.w / 2;
  const ry = bounds.h / 2;

  if (rx <= 0 || ry <= 0) return mask;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) {
        newMask[y * w + x] = 255;
      }
    }
  }

  if (feather > 0) applyFeather(newMask, w, h, feather);
  return combineMasks(mask, newMask, w * h, mode);
}

/** Create lasso (freeform) selection mask */
export function createLassoSelection(
  w: number, h: number,
  points: { x: number; y: number }[],
  existing: Uint8Array | null,
  mode: SelectionState['mode'],
  feather: number,
): Uint8Array {
  const mask = combineMaskStart(w, h, existing, mode);
  if (points.length < 3) return mask;

  const newMask = new Uint8Array(w * h);
  // Scanline polygon fill
  const minY = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(...points.map(p => p.y))));

  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const p1 = points[i];
      const p2 = points[j];
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        const t = (y - p1.y) / (p2.y - p1.y);
        intersections.push(p1.x + t * (p2.x - p1.x));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = Math.max(0, Math.round(intersections[i]));
      const x2 = Math.min(w - 1, Math.round(intersections[i + 1]));
      for (let x = x1; x <= x2; x++) {
        newMask[y * w + x] = 255;
      }
    }
  }

  if (feather > 0) applyFeather(newMask, w, h, feather);
  return combineMasks(mask, newMask, w * h, mode);
}

/** Create magic wand selection via flood fill on color similarity */
export function createWandSelection(
  w: number, h: number,
  imageData: ImageData,
  sx: number, sy: number,
  tolerance: number,
  contiguous: boolean,
  existing: Uint8Array | null,
  mode: SelectionState['mode'],
  feather: number,
): Uint8Array {
  const mask = combineMaskStart(w, h, existing, mode);
  const newMask = new Uint8Array(w * h);
  const data = imageData.data;

  const px = Math.round(sx);
  const py = Math.round(sy);
  if (px < 0 || px >= w || py < 0 || py >= h) return mask;

  const idx = (py * w + px) * 4;
  const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];

  const colorMatch = (i: number): boolean => {
    return Math.abs(data[i] - tr) <= tolerance &&
           Math.abs(data[i + 1] - tg) <= tolerance &&
           Math.abs(data[i + 2] - tb) <= tolerance &&
           Math.abs(data[i + 3] - ta) <= tolerance;
  };

  if (contiguous) {
    // Flood fill from click point
    const stack = [px, py];
    const visited = new Uint8Array(w * h);
    while (stack.length > 0) {
      const cy = stack.pop()!;
      const cx = stack.pop()!;
      const pidx = cy * w + cx;
      if (cx < 0 || cx >= w || cy < 0 || cy >= h || visited[pidx]) continue;
      if (!colorMatch(pidx * 4)) continue;
      visited[pidx] = 1;
      newMask[pidx] = 255;
      stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
    }
  } else {
    // Select all similar colors globally
    for (let i = 0; i < w * h; i++) {
      if (colorMatch(i * 4)) newMask[i] = 255;
    }
  }

  if (feather > 0) applyFeather(newMask, w, h, feather);
  return combineMasks(mask, newMask, w * h, mode);
}

/** Select all opaque pixels */
export function selectAll(w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  mask.fill(255);
  return mask;
}

/** Invert selection */
export function invertSelection(mask: Uint8Array): Uint8Array {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = 255 - mask[i];
  return inv;
}

function combineMaskStart(w: number, h: number, existing: Uint8Array | null, mode: SelectionState['mode']): Uint8Array {
  if (!existing || mode === 'new') return new Uint8Array(w * h);
  return new Uint8Array(existing);
}

function combineMasks(base: Uint8Array, added: Uint8Array, len: number, mode: SelectionState['mode']): Uint8Array {
  if (mode === 'new') return added;
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    if (mode === 'add') result[i] = Math.min(255, base[i] + added[i]);
    else if (mode === 'subtract') result[i] = Math.max(0, base[i] - added[i]);
    else if (mode === 'intersect') result[i] = Math.min(base[i], added[i]);
    else result[i] = added[i];
  }
  return result;
}

/** Apply Gaussian-like box blur feather to mask */
function applyFeather(mask: Uint8Array, w: number, h: number, radius: number): void {
  const passes = Math.min(3, Math.ceil(radius / 2));
  const r = Math.max(1, Math.round(radius / passes));
  const tmp = new Uint8Array(w * h);
  for (let pass = 0; pass < passes; pass++) {
    // Horizontal pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        for (let k = -r; k <= r; k++) {
          const nx = x + k;
          if (nx >= 0 && nx < w) { sum += mask[y * w + nx]; count++; }
        }
        tmp[y * w + x] = Math.round(sum / count);
      }
    }
    // Vertical pass
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let sum = 0, count = 0;
        for (let k = -r; k <= r; k++) {
          const ny = y + k;
          if (ny >= 0 && ny < h) { sum += tmp[ny * w + x]; count++; }
        }
        mask[y * w + x] = Math.round(sum / count);
      }
    }
  }
}

/** Draw marching ants on a canvas context from a selection mask */
export function drawMarchingAnts(
  ctx: CanvasRenderingContext2D,
  mask: Uint8Array,
  w: number, h: number,
  offset: number,
): void {
  // Find edge pixels (selected pixel adjacent to non-selected pixel)
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -offset;
  ctx.beginPath();

  // Scan for boundary edges and trace them
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] < 128) continue;
      // Check 4 neighbors
      const top = y > 0 ? mask[(y - 1) * w + x] < 128 : true;
      const bottom = y < h - 1 ? mask[(y + 1) * w + x] < 128 : true;
      const left = x > 0 ? mask[y * w + (x - 1)] < 128 : true;
      const right = x < w - 1 ? mask[y * w + (x + 1)] < 128 : true;

      if (top) { ctx.moveTo(x, y); ctx.lineTo(x + 1, y); }
      if (bottom) { ctx.moveTo(x, y + 1); ctx.lineTo(x + 1, y + 1); }
      if (left) { ctx.moveTo(x, y); ctx.lineTo(x, y + 1); }
      if (right) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + 1); }
    }
  }
  ctx.stroke();

  // Second pass: black dashes offset for contrast
  ctx.strokeStyle = '#000000';
  ctx.lineDashOffset = -(offset + 4);
  ctx.beginPath();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] < 128) continue;
      const top = y > 0 ? mask[(y - 1) * w + x] < 128 : true;
      const bottom = y < h - 1 ? mask[(y + 1) * w + x] < 128 : true;
      const left = x > 0 ? mask[y * w + (x - 1)] < 128 : true;
      const right = x < w - 1 ? mask[y * w + (x + 1)] < 128 : true;

      if (top) { ctx.moveTo(x, y); ctx.lineTo(x + 1, y); }
      if (bottom) { ctx.moveTo(x, y + 1); ctx.lineTo(x + 1, y + 1); }
      if (left) { ctx.moveTo(x, y); ctx.lineTo(x, y + 1); }
      if (right) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + 1); }
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// GRADIENT TOOL
// ═══════════════════════════════════════════════════════════════════════════

export type GradientType = 'linear' | 'radial' | 'angular' | 'diamond' | 'reflected';

export interface GradientStop {
  offset: number; // 0..1
  color: string;
}

export function drawGradient(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  type: GradientType,
  stops: GradientStop[],
  selectionMask: Uint8Array | null,
): void {
  if (stops.length < 2) return;

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const oCtx = offscreen.getContext('2d')!;

  if (type === 'linear' || type === 'reflected') {
    const grad = oCtx.createLinearGradient(from.x, from.y, to.x, to.y);
    if (type === 'reflected') {
      // Mirror stops: 0..0.5..1
      stops.forEach(s => grad.addColorStop(s.offset * 0.5, s.color));
      [...stops].reverse().forEach(s => grad.addColorStop(0.5 + (1 - s.offset) * 0.5, s.color));
    } else {
      stops.forEach(s => grad.addColorStop(s.offset, s.color));
    }
    oCtx.fillStyle = grad;
    oCtx.fillRect(0, 0, w, h);
  } else if (type === 'radial') {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const grad = oCtx.createRadialGradient(from.x, from.y, 0, from.x, from.y, radius);
    stops.forEach(s => grad.addColorStop(s.offset, s.color));
    oCtx.fillStyle = grad;
    oCtx.fillRect(0, 0, w, h);
  } else if (type === 'angular' || type === 'diamond') {
    // Per-pixel computed gradients
    const imageData = oCtx.createImageData(w, h);
    const data = imageData.data;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle0 = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Pre-compute color at 256 steps
    const colorLUT = computeGradientLUT(stops);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t: number;
        if (type === 'angular') {
          const a = Math.atan2(y - from.y, x - from.x) - angle0;
          t = ((a / (2 * Math.PI)) % 1 + 1) % 1;
        } else {
          // Diamond: max(|dx|, |dy|) distance
          const px = Math.abs((x - from.x) * Math.cos(angle0) + (y - from.y) * Math.sin(angle0));
          const py = Math.abs(-(x - from.x) * Math.sin(angle0) + (y - from.y) * Math.cos(angle0));
          t = Math.min(1, Math.max(px, py) / dist);
        }
        const idx = (y * w + x) * 4;
        const li = Math.min(255, Math.max(0, Math.round(t * 255)));
        data[idx] = colorLUT[li * 4];
        data[idx + 1] = colorLUT[li * 4 + 1];
        data[idx + 2] = colorLUT[li * 4 + 2];
        data[idx + 3] = colorLUT[li * 4 + 3];
      }
    }
    oCtx.putImageData(imageData, 0, 0);
  }

  // Apply selection mask
  if (selectionMask) {
    const gradData = oCtx.getImageData(0, 0, w, h);
    const d = gradData.data;
    for (let i = 0; i < w * h; i++) {
      d[i * 4 + 3] = Math.round(d[i * 4 + 3] * (selectionMask[i] / 255));
    }
    oCtx.putImageData(gradData, 0, 0);
  }

  ctx.drawImage(offscreen, 0, 0);
}

function computeGradientLUT(stops: GradientStop[]): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s0 = sorted[0], s1 = sorted[sorted.length - 1];
    for (let j = 0; j < sorted.length - 1; j++) {
      if (t >= sorted[j].offset && t <= sorted[j + 1].offset) {
        s0 = sorted[j];
        s1 = sorted[j + 1];
        break;
      }
    }
    const range = s1.offset - s0.offset || 1;
    const f = (t - s0.offset) / range;
    const c0 = parseColor(s0.color);
    const c1 = parseColor(s1.color);
    lut[i * 4] = Math.round(c0.r + (c1.r - c0.r) * f);
    lut[i * 4 + 1] = Math.round(c0.g + (c1.g - c0.g) * f);
    lut[i * 4 + 2] = Math.round(c0.b + (c1.b - c0.b) * f);
    lut[i * 4 + 3] = Math.round(c0.a + (c1.a - c0.a) * f);
  }
  return lut;
}

// ═══════════════════════════════════════════════════════════════════════════
// PEN / BEZIER TOOL
// ═══════════════════════════════════════════════════════════════════════════

export interface PenPoint {
  x: number;
  y: number;
  cpIn: { x: number; y: number };  // control point approaching this anchor
  cpOut: { x: number; y: number }; // control point leaving this anchor
}

export interface PenPath {
  points: PenPoint[];
  closed: boolean;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string | null;
}

export function createPenPoint(x: number, y: number): PenPoint {
  return { x, y, cpIn: { x, y }, cpOut: { x, y } };
}

/** Render a cubic bezier pen path to canvas */
export function drawPenPath(ctx: CanvasRenderingContext2D, path: PenPath, showHandles: boolean): void {
  if (path.points.length < 2) {
    if (path.points.length === 1 && showHandles) {
      drawAnchorPoint(ctx, path.points[0], true);
    }
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(path.points[0].x, path.points[0].y);

  for (let i = 1; i < path.points.length; i++) {
    const prev = path.points[i - 1];
    const curr = path.points[i];
    ctx.bezierCurveTo(prev.cpOut.x, prev.cpOut.y, curr.cpIn.x, curr.cpIn.y, curr.x, curr.y);
  }

  if (path.closed && path.points.length > 2) {
    const last = path.points[path.points.length - 1];
    const first = path.points[0];
    ctx.bezierCurveTo(last.cpOut.x, last.cpOut.y, first.cpIn.x, first.cpIn.y, first.x, first.y);
    ctx.closePath();
  }

  if (path.fillColor) {
    ctx.fillStyle = path.fillColor;
    ctx.fill();
  }
  ctx.strokeStyle = path.strokeColor;
  ctx.lineWidth = path.strokeWidth;
  ctx.stroke();
  ctx.restore();

  if (showHandles) {
    path.points.forEach((pt, i) => {
      drawAnchorPoint(ctx, pt, i === 0);
      // Draw control handles
      if (pt.cpIn.x !== pt.x || pt.cpIn.y !== pt.y) {
        ctx.save();
        ctx.strokeStyle = 'rgba(236,72,153,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.cpIn.x, pt.cpIn.y);
        ctx.stroke();
        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.arc(pt.cpIn.x, pt.cpIn.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (pt.cpOut.x !== pt.x || pt.cpOut.y !== pt.y) {
        ctx.save();
        ctx.strokeStyle = 'rgba(236,72,153,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.cpOut.x, pt.cpOut.y);
        ctx.stroke();
        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.arc(pt.cpOut.x, pt.cpOut.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }
}

function drawAnchorPoint(ctx: CanvasRenderingContext2D, pt: PenPoint, isFirst: boolean): void {
  ctx.save();
  ctx.fillStyle = isFirst ? '#ec4899' : '#ffffff';
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(pt.x - 3, pt.y - 3, 6, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Hit test: find which pen point (or control handle) is near a coordinate */
export function hitTestPenPath(path: PenPath, x: number, y: number, threshold: number = 8): { type: 'anchor' | 'cpIn' | 'cpOut'; index: number } | null {
  for (let i = 0; i < path.points.length; i++) {
    const pt = path.points[i];
    if (Math.hypot(pt.x - x, pt.y - y) <= threshold) return { type: 'anchor', index: i };
    if (Math.hypot(pt.cpIn.x - x, pt.cpIn.y - y) <= threshold) return { type: 'cpIn', index: i };
    if (Math.hypot(pt.cpOut.x - x, pt.cpOut.y - y) <= threshold) return { type: 'cpOut', index: i };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLONE STAMP TOOL
// ═══════════════════════════════════════════════════════════════════════════

export interface CloneState {
  sourceSet: boolean;
  sourceX: number;
  sourceY: number;
  offsetX: number;
  offsetY: number;
  /** Whether we've started painting (to lock offset) */
  painting: boolean;
}

export function createCloneState(): CloneState {
  return { sourceSet: false, sourceX: 0, sourceY: 0, offsetX: 0, offsetY: 0, painting: false };
}

/** Paint clone stamp from source to destination */
export function paintCloneStamp(
  srcCanvas: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  clone: CloneState,
  px: number, py: number,
  brushSize: number,
  brushOpacity: number,
  brushHardness: number,
): void {
  if (!clone.sourceSet) return;

  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return;

  const sx = px + clone.offsetX;
  const sy = py + clone.offsetY;
  const r = brushSize / 2;

  // Sample circular region from source
  const x0 = Math.max(0, Math.round(sx - r));
  const y0 = Math.max(0, Math.round(sy - r));
  const x1 = Math.min(srcCanvas.width, Math.round(sx + r));
  const y1 = Math.min(srcCanvas.height, Math.round(sy + r));
  if (x1 <= x0 || y1 <= y0) return;

  const srcData = srcCtx.getImageData(x0, y0, x1 - x0, y1 - y0);

  // Create a circular soft brush
  const dstX = Math.round(px - r);
  const dstY = Math.round(py - r);
  const size = Math.round(brushSize);
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = size;
  tmpCanvas.height = size;
  const tmpCtx = tmpCanvas.getContext('2d')!;

  // Draw sampled pixels with radial falloff
  const tmpData = tmpCtx.createImageData(size, size);
  const td = tmpData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
      if (dist > 1) continue;

      const alpha = brushHardness >= 100 ? 1 : Math.max(0, 1 - Math.pow(dist, 2 / (1 - brushHardness / 100 + 0.01)));
      const srcPx = Math.round(x - size / 2 + (sx - x0));
      const srcPy = Math.round(y - size / 2 + (sy - y0));

      if (srcPx >= 0 && srcPx < srcData.width && srcPy >= 0 && srcPy < srcData.height) {
        const si = (srcPy * srcData.width + srcPx) * 4;
        const di = (y * size + x) * 4;
        td[di] = srcData.data[si];
        td[di + 1] = srcData.data[si + 1];
        td[di + 2] = srcData.data[si + 2];
        td[di + 3] = Math.round(srcData.data[si + 3] * alpha * (brushOpacity / 100));
      }
    }
  }

  tmpCtx.putImageData(tmpData, 0, 0);
  dstCtx.drawImage(tmpCanvas, dstX, dstY);
}

// ═══════════════════════════════════════════════════════════════════════════
// HEAL BRUSH TOOL
// ═══════════════════════════════════════════════════════════════════════════

/** Heal brush: clone + blend to match destination texture/color */
export function paintHealBrush(
  srcCanvas: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  clone: CloneState,
  px: number, py: number,
  brushSize: number,
  brushOpacity: number,
): void {
  if (!clone.sourceSet) return;

  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return;

  const r = brushSize / 2;
  const size = Math.round(brushSize);

  // Get source region
  const sx = Math.round(px + clone.offsetX - r);
  const sy = Math.round(py + clone.offsetY - r);
  const dx = Math.round(px - r);
  const dy = Math.round(py - r);

  const clampW = Math.min(size, srcCanvas.width - Math.max(0, sx), srcCanvas.width - Math.max(0, dx));
  const clampH = Math.min(size, srcCanvas.height - Math.max(0, sy), srcCanvas.height - Math.max(0, dy));
  if (clampW <= 0 || clampH <= 0) return;

  const srcData = srcCtx.getImageData(Math.max(0, sx), Math.max(0, sy), clampW, clampH);
  const dstData = dstCtx.getImageData(Math.max(0, dx), Math.max(0, dy), clampW, clampH);

  // Compute average color of source and destination
  let srcR = 0, srcG = 0, srcB = 0, srcCount = 0;
  let dstR = 0, dstG = 0, dstB = 0, dstCount = 0;

  for (let y = 0; y < clampH; y++) {
    for (let x = 0; x < clampW; x++) {
      const dist = Math.hypot(x - clampW / 2, y - clampH / 2) / (Math.min(clampW, clampH) / 2);
      if (dist > 1) continue;
      const i = (y * clampW + x) * 4;
      if (srcData.data[i + 3] > 0) { srcR += srcData.data[i]; srcG += srcData.data[i + 1]; srcB += srcData.data[i + 2]; srcCount++; }
      if (dstData.data[i + 3] > 0) { dstR += dstData.data[i]; dstG += dstData.data[i + 1]; dstB += dstData.data[i + 2]; dstCount++; }
    }
  }

  if (srcCount === 0 || dstCount === 0) return;

  // Color correction offsets
  const offR = (dstR / dstCount) - (srcR / srcCount);
  const offG = (dstG / dstCount) - (srcG / srcCount);
  const offB = (dstB / dstCount) - (srcB / srcCount);

  // Apply: use source texture + destination color
  const outData = dstCtx.createImageData(clampW, clampH);
  for (let y = 0; y < clampH; y++) {
    for (let x = 0; x < clampW; x++) {
      const dist = Math.hypot(x - clampW / 2, y - clampH / 2) / (Math.min(clampW, clampH) / 2);
      if (dist > 1) continue;
      const alpha = Math.max(0, 1 - dist * dist) * (brushOpacity / 100);
      const i = (y * clampW + x) * 4;
      const hr = Math.min(255, Math.max(0, srcData.data[i] + offR));
      const hg = Math.min(255, Math.max(0, srcData.data[i + 1] + offG));
      const hb = Math.min(255, Math.max(0, srcData.data[i + 2] + offB));
      outData.data[i] = Math.round(dstData.data[i] * (1 - alpha) + hr * alpha);
      outData.data[i + 1] = Math.round(dstData.data[i + 1] * (1 - alpha) + hg * alpha);
      outData.data[i + 2] = Math.round(dstData.data[i + 2] * (1 - alpha) + hb * alpha);
      outData.data[i + 3] = dstData.data[i + 3];
    }
  }

  dstCtx.putImageData(outData, Math.max(0, dx), Math.max(0, dy));
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════════════════

export type FilterName = 'blur' | 'sharpen' | 'noise' | 'vignette' | 'grain' | 'glow' | 'vintage' | 'bw' | 'sepia';

export interface FilterParams {
  intensity: number; // 0-100
  radius?: number;
}

/** Apply a filter to canvas image data */
export function applyFilter(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  filter: FilterName,
  params: FilterParams,
  selectionMask: Uint8Array | null,
): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const original = new Uint8ClampedArray(data);
  const strength = params.intensity / 100;

  switch (filter) {
    case 'blur': {
      const radius = Math.max(1, Math.round((params.radius ?? 5) * strength));
      boxBlurImage(data, w, h, radius);
      break;
    }
    case 'sharpen': {
      // Unsharp mask: original + (original - blur) * amount
      const blurred = new Uint8ClampedArray(data);
      boxBlurImage(blurred, w, h, 2);
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          data[i + c] = Math.min(255, Math.max(0, Math.round(original[i + c] + (original[i + c] - blurred[i + c]) * strength * 2)));
        }
      }
      break;
    }
    case 'noise': {
      for (let i = 0; i < data.length; i += 4) {
        const n = (Math.random() - 0.5) * 255 * strength * 0.5;
        data[i] = Math.min(255, Math.max(0, data[i] + n));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
      }
      break;
    }
    case 'vignette': {
      const cx = w / 2, cy = h / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
          const factor = 1 - Math.pow(dist, 1.5) * strength;
          const idx = (y * w + x) * 4;
          data[idx] = Math.round(data[idx] * factor);
          data[idx + 1] = Math.round(data[idx + 1] * factor);
          data[idx + 2] = Math.round(data[idx + 2] * factor);
        }
      }
      break;
    }
    case 'grain': {
      for (let i = 0; i < data.length; i += 4) {
        const grain = (Math.random() - 0.5) * strength * 80;
        // Luminance-weighted grain (more visible in midtones)
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        const midtoneFactor = 1 - Math.abs(lum - 0.5) * 2;
        const n = grain * (0.5 + midtoneFactor * 0.5);
        data[i] = Math.min(255, Math.max(0, Math.round(data[i] + n)));
        data[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] + n)));
        data[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] + n)));
      }
      break;
    }
    case 'glow': {
      // Bright pass + blur + screen blend
      const glowData = new Uint8ClampedArray(data);
      // Extract bright areas
      for (let i = 0; i < glowData.length; i += 4) {
        const lum = (glowData[i] * 0.299 + glowData[i + 1] * 0.587 + glowData[i + 2] * 0.114);
        if (lum < 180) { glowData[i] = 0; glowData[i + 1] = 0; glowData[i + 2] = 0; }
      }
      boxBlurImage(glowData, w, h, Math.max(3, Math.round(10 * strength)));
      // Screen blend
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          data[i + c] = Math.min(255, Math.round(data[i + c] + glowData[i + c] * strength - data[i + c] * glowData[i + c] * strength / 255));
        }
      }
      break;
    }
    case 'vintage': {
      for (let i = 0; i < data.length; i += 4) {
        // Warm tone shift + desaturate slightly + vignette
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const mix = 0.3 * strength;
        data[i] = Math.min(255, Math.round(data[i] * (1 - mix) + (gray + 30) * mix));
        data[i + 1] = Math.min(255, Math.round(data[i + 1] * (1 - mix) + (gray + 10) * mix));
        data[i + 2] = Math.max(0, Math.round(data[i + 2] * (1 - mix) + (gray - 20) * mix));
      }
      break;
    }
    case 'bw': {
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        data[i] = Math.round(data[i] * (1 - strength) + gray * strength);
        data[i + 1] = Math.round(data[i + 1] * (1 - strength) + gray * strength);
        data[i + 2] = Math.round(data[i + 2] * (1 - strength) + gray * strength);
      }
      break;
    }
    case 'sepia': {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        const sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        const sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        data[i] = Math.round(r * (1 - strength) + sr * strength);
        data[i + 1] = Math.round(g * (1 - strength) + sg * strength);
        data[i + 2] = Math.round(b * (1 - strength) + sb * strength);
      }
      break;
    }
  }

  // Apply selection mask - only modify selected pixels
  if (selectionMask) {
    for (let i = 0; i < w * h; i++) {
      const a = selectionMask[i] / 255;
      const pi = i * 4;
      data[pi] = Math.round(original[pi] * (1 - a) + data[pi] * a);
      data[pi + 1] = Math.round(original[pi + 1] * (1 - a) + data[pi + 1] * a);
      data[pi + 2] = Math.round(original[pi + 2] * (1 - a) + data[pi + 2] * a);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function boxBlurImage(data: Uint8ClampedArray | Uint8Array, w: number, h: number, radius: number): void {
  const tmp = new Uint8ClampedArray(data.length);
  const d = radius * 2 + 1;

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = Math.max(0, Math.min(w - 1, x + k));
        const i = (y * w + nx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
      }
      const i = (y * w + x) * 4;
      tmp[i] = Math.round(r / count);
      tmp[i + 1] = Math.round(g / count);
      tmp[i + 2] = Math.round(b / count);
      tmp[i + 3] = data[i + 3];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = Math.max(0, Math.min(h - 1, y + k));
        const i = (ny * w + x) * 4;
        r += tmp[i]; g += tmp[i + 1]; b += tmp[i + 2]; count++;
      }
      const i = (y * w + x) * 4;
      data[i] = Math.round(r / count);
      data[i + 1] = Math.round(g / count);
      data[i + 2] = Math.round(b / count);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORM ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export interface TransformState {
  active: boolean;
  /** Bounding box of the transform in canvas space */
  bounds: { x: number; y: number; w: number; h: number };
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** Which handle is being dragged */
  handle: string | null;
  /** The handle positions: tl, tc, tr, ml, mr, bl, bc, br, rotate */
  startBounds: { x: number; y: number; w: number; h: number } | null;
  startMouse: { x: number; y: number } | null;
}

export function createTransformState(): TransformState {
  return { active: false, bounds: { x: 0, y: 0, w: 0, h: 0 }, rotation: 0, scaleX: 1, scaleY: 1, handle: null, startBounds: null, startMouse: null };
}

export function getTransformHandles(bounds: { x: number; y: number; w: number; h: number }): { id: string; x: number; y: number; cursor: string }[] {
  const { x, y, w, h } = bounds;
  return [
    { id: 'tl', x, y, cursor: 'nwse-resize' },
    { id: 'tc', x: x + w / 2, y, cursor: 'ns-resize' },
    { id: 'tr', x: x + w, y, cursor: 'nesw-resize' },
    { id: 'ml', x, y: y + h / 2, cursor: 'ew-resize' },
    { id: 'mr', x: x + w, y: y + h / 2, cursor: 'ew-resize' },
    { id: 'bl', x, y: y + h, cursor: 'nesw-resize' },
    { id: 'bc', x: x + w / 2, y: y + h, cursor: 'ns-resize' },
    { id: 'br', x: x + w, y: y + h, cursor: 'nwse-resize' },
    { id: 'rotate', x: x + w / 2, y: y - 20, cursor: 'grab' },
  ];
}

export function drawTransformHandles(ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; w: number; h: number }): void {
  ctx.save();
  // Bounding box
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.setLineDash([]);

  // Handle points
  const handles = getTransformHandles(bounds);
  handles.forEach(h => {
    ctx.fillStyle = h.id === 'rotate' ? '#ec4899' : '#ffffff';
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 1.5;
    if (h.id === 'rotate') {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Line from top center to rotate handle
      ctx.beginPath();
      ctx.moveTo(bounds.x + bounds.w / 2, bounds.y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
    } else {
      ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
      ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
    }
  });
  ctx.restore();
}

export function hitTestTransformHandle(bounds: { x: number; y: number; w: number; h: number }, x: number, y: number, threshold: number = 8): string | null {
  const handles = getTransformHandles(bounds);
  for (const h of handles) {
    if (Math.hypot(h.x - x, h.y - y) <= threshold) return h.id;
  }
  // Check if inside bounds for move
  if (x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h) return 'move';
  return null;
}

export function applyTransformHandle(
  handle: string,
  startBounds: { x: number; y: number; w: number; h: number },
  startMouse: { x: number; y: number },
  currentMouse: { x: number; y: number },
  shiftKey: boolean,
): { x: number; y: number; w: number; h: number } {
  const dx = currentMouse.x - startMouse.x;
  const dy = currentMouse.y - startMouse.y;
  let { x, y, w, h } = { ...startBounds };

  switch (handle) {
    case 'move': x += dx; y += dy; break;
    case 'tl': x += dx; y += dy; w -= dx; h -= dy; break;
    case 'tc': y += dy; h -= dy; break;
    case 'tr': w += dx; y += dy; h -= dy; break;
    case 'ml': x += dx; w -= dx; break;
    case 'mr': w += dx; break;
    case 'bl': x += dx; w -= dx; h += dy; break;
    case 'bc': h += dy; break;
    case 'br': w += dx; h += dy; break;
  }

  // Constrain proportions if shift held
  if (shiftKey && handle !== 'move') {
    const aspect = startBounds.w / startBounds.h;
    if (Math.abs(w / h - aspect) > 0.01) {
      h = w / aspect;
    }
  }

  // Prevent negative dimensions
  if (w < 10) { w = 10; }
  if (h < 10) { h = 10; }

  return { x, y, w, h };
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTOGRAM
// ═══════════════════════════════════════════════════════════════════════════

export function computeHistogram(imageData: ImageData): { r: number[]; g: number[]; b: number[]; lum: number[] } {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const lum = new Array(256).fill(0);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    r[data[i]]++;
    g[data[i + 1]]++;
    b[data[i + 2]]++;
    const l = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    lum[Math.min(255, l)]++;
  }

  return { r, g, b, lum };
}

export function drawHistogram(
  ctx: CanvasRenderingContext2D,
  hist: { r: number[]; g: number[]; b: number[]; lum: number[] },
  w: number, h: number,
  channel: 'rgb' | 'r' | 'g' | 'b' | 'lum',
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, w, h);

  const channels: { data: number[]; color: string }[] = [];
  if (channel === 'rgb' || channel === 'lum') {
    channels.push({ data: hist.lum, color: 'rgba(255,255,255,0.5)' });
    if (channel === 'rgb') {
      channels.push({ data: hist.r, color: 'rgba(255,80,80,0.4)' });
      channels.push({ data: hist.g, color: 'rgba(80,255,80,0.4)' });
      channels.push({ data: hist.b, color: 'rgba(80,80,255,0.4)' });
    }
  } else {
    channels.push({ data: hist[channel], color: channel === 'r' ? 'rgba(255,80,80,0.7)' : channel === 'g' ? 'rgba(80,255,80,0.7)' : 'rgba(80,80,255,0.7)' });
  }

  channels.forEach(ch => {
    const max = Math.max(...ch.data) || 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = h - (ch.data[i] / max) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = ch.color;
    ctx.fill();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COLOR UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

export function parseColor(hex: string): { r: number; g: number; b: number; a: number } {
  if (hex.startsWith('rgba')) {
    const match = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) return { r: +match[1], g: +match[2], b: +match[3], a: match[4] ? Math.round(+match[4] * 255) : 255 };
  }
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
    a: h.length > 6 ? parseInt(h.substring(6, 8), 16) : 255,
  };
}

export function rgbToHSL(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRGB(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360; s /= 100; l /= 100;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/** Draw HSL color wheel + brightness square */
export function drawColorWheel(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2, cy = size / 2, radius = size / 2 - 4;

  // Hue ring
  for (let a = 0; a < 360; a++) {
    const startAngle = (a - 1) * Math.PI / 180;
    const endAngle = (a + 1) * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.arc(cx, cy, radius * 0.72, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = `hsl(${a}, 100%, 50%)`;
    ctx.fill();
  }

  // Inner saturation/lightness square
  const innerR = radius * 0.68;
  const sqSize = innerR * Math.sqrt(2);
  const sqX = cx - sqSize / 2;
  const sqY = cy - sqSize / 2;

  // Horizontal: saturation 0arrow-right100
  const gradH = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY);
  gradH.addColorStop(0, '#ffffff');
  gradH.addColorStop(1, 'hsl(0, 100%, 50%)');
  ctx.fillStyle = gradH;
  ctx.fillRect(sqX, sqY, sqSize, sqSize);

  // Vertical: lightness overlay
  const gradV = ctx.createLinearGradient(sqX, sqY, sqX, sqY + sqSize);
  gradV.addColorStop(0, 'rgba(0,0,0,0)');
  gradV.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = gradV;
  ctx.fillRect(sqX, sqY, sqSize, sqSize);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

export function canvasToBlob(canvas: HTMLCanvasElement, format: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const mimeType = format === 'jpg' || format === 'jpeg' ? 'image/jpeg'
                   : format === 'webp' ? 'image/webp'
                   : format === 'bmp' ? 'image/bmp'
                   : 'image/png';
    canvas.toBlob(resolve, mimeType, quality / 100);
  });
}

/** Export to TIFF (basic uncompressed TIFF) */
export function canvasToTIFF(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Build a minimal TIFF (uncompressed RGB)
  const pixelBytes = w * h * 3;
  const headerSize = 8;
  const ifdOffset = headerSize;
  const numTags = 10;
  const ifdSize = 2 + numTags * 12 + 4;
  const stripOffset = ifdOffset + ifdSize;

  const buf = new ArrayBuffer(stripOffset + pixelBytes);
  const view = new DataView(buf);
  const uint8 = new Uint8Array(buf);

  // TIFF Header (little-endian)
  view.setUint16(0, 0x4949, true);  // 'II' little-endian
  view.setUint16(2, 42, true);       // Magic
  view.setUint32(4, ifdOffset, true); // IFD offset

  // IFD
  let pos = ifdOffset;
  view.setUint16(pos, numTags, true); pos += 2;

  const writeTag = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(pos, tag, true); pos += 2;
    view.setUint16(pos, type, true); pos += 2;
    view.setUint32(pos, count, true); pos += 4;
    view.setUint32(pos, value, true); pos += 4;
  };

  writeTag(256, 3, 1, w);           // ImageWidth
  writeTag(257, 3, 1, h);           // ImageLength
  writeTag(258, 3, 1, 8);           // BitsPerSample
  writeTag(259, 3, 1, 1);           // Compression: none
  writeTag(262, 3, 1, 2);           // PhotometricInterpretation: RGB
  writeTag(273, 4, 1, stripOffset); // StripOffsets
  writeTag(277, 3, 1, 3);           // SamplesPerPixel
  writeTag(278, 4, 1, h);           // RowsPerStrip
  writeTag(279, 4, 1, pixelBytes);  // StripByteCounts
  writeTag(282, 5, 1, 72);          // XResolution (simplified)

  view.setUint32(pos, 0, true); // End of IFD chain

  // Pixel data: RGB (no alpha)
  let pPos = stripOffset;
  for (let i = 0; i < data.length; i += 4) {
    uint8[pPos++] = data[i];
    uint8[pPos++] = data[i + 1];
    uint8[pPos++] = data[i + 2];
  }

  return new Blob([buf], { type: 'image/tiff' });
}

/** Export canvas to BMP */
export function canvasToBMP(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const rowBytes = Math.ceil(w * 3 / 4) * 4; // Rows padded to 4-byte boundary
  const pixelBytes = rowBytes * h;
  const headerSize = 54;
  const fileSize = headerSize + pixelBytes;

  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  // BMP file header
  view.setUint8(0, 0x42); view.setUint8(1, 0x4D); // 'BM'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, headerSize, true);

  // DIB header (BITMAPINFOHEADER)
  view.setUint32(14, 40, true);       // Header size
  view.setInt32(18, w, true);          // Width
  view.setInt32(22, h, true);          // Height (positive = bottom-up)
  view.setUint16(26, 1, true);        // Color planes
  view.setUint16(28, 24, true);       // Bits per pixel
  view.setUint32(34, pixelBytes, true); // Image size

  // Pixel data (BGR, bottom to top)
  const uint8 = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w; // BMP is bottom-up
    const dstRowStart = headerSize + y * rowBytes;
    for (let x = 0; x < w; x++) {
      const si = (srcRow + x) * 4;
      const di = dstRowStart + x * 3;
      uint8[di] = data[si + 2];     // B
      uint8[di + 1] = data[si + 1]; // G
      uint8[di + 2] = data[si];     // R
    }
  }

  return new Blob([buf], { type: 'image/bmp' });
}
