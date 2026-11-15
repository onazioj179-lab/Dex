// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PRISM Asset Library items rendered to real pixels.
 *
 * The panel used to insert a `shape` layer with no pixels for every item, and
 * the compositor only draws layers that have pixels, so Star, Waves or Sunset
 * all inserted an invisible, empty layer. Each item is now drawn here and
 * inserted as an ordinary image layer the pixel tools can edit.
 */

export const ASSET_SHAPES = ['Rectangle', 'Circle', 'Triangle', 'Star', 'Arrow', 'Heart', 'Diamond', 'Pentagon'] as const;
export const ASSET_PATTERNS = ['Dots', 'Lines', 'Grid', 'Chevron', 'Waves', 'Crosses', 'Hexagons', 'Moire'] as const;
export const ASSET_GRADIENTS = ['Sunset', 'Ocean', 'Forest', 'Flame', 'Sky', 'Neon', 'Pastel', 'Mono'] as const;

export type AssetCategory = 'shapes' | 'patterns' | 'gradients';

/** Gradient stops, top-left to bottom-right. */
export const GRADIENT_STOPS: Record<(typeof ASSET_GRADIENTS)[number], string[]> = {
  Sunset: ['#ff5e62', '#ff9966', '#ffd36e'],
  Ocean: ['#0b3d91', '#1e88e5', '#4dd0e1'],
  Forest: ['#0b3d20', '#2e7d32', '#9ccc65'],
  Flame: ['#5a0000', '#e53935', '#ffb300'],
  Sky: ['#4a90e2', '#87ceeb', '#e3f2fd'],
  Neon: ['#ff00cc', '#7b2ff7', '#00e5ff'],
  Pastel: ['#ffd1dc', '#e0bbe4', '#b5ead7'],
  Mono: ['#000000', '#808080', '#ffffff'],
};

type Pt = [number, number];

/** Closed polygon points for the polygonal shapes, in a unit box (0..1). */
export function shapePoints(name: string): Pt[] | null {
  const ring = (n: number, r: number, rot = -Math.PI / 2): Pt[] =>
    Array.from({ length: n }, (_, i) => [0.5 + r * Math.cos(rot + (i * 2 * Math.PI) / n), 0.5 + r * Math.sin(rot + (i * 2 * Math.PI) / n)]);
  switch (name) {
    case 'Triangle': return [[0.5, 0.06], [0.95, 0.92], [0.05, 0.92]];
    case 'Diamond': return [[0.5, 0.04], [0.96, 0.5], [0.5, 0.96], [0.04, 0.5]];
    case 'Pentagon': return ring(5, 0.46);
    case 'Star': {
      const outer = ring(5, 0.47), inner = ring(5, 0.19, -Math.PI / 2 + Math.PI / 5);
      return outer.flatMap((p, i) => [p, inner[i]]);
    }
    case 'Arrow': return [[0.04, 0.38], [0.6, 0.38], [0.6, 0.14], [0.96, 0.5], [0.6, 0.86], [0.6, 0.62], [0.04, 0.62]];
    default: return null;
  }
}

/** Draw one shape filling a w×h box. */
function drawShape(ctx: CanvasRenderingContext2D, name: string, w: number, h: number): void {
  ctx.beginPath();
  if (name === 'Rectangle') ctx.rect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
  else if (name === 'Circle') ctx.ellipse(w / 2, h / 2, w * 0.46, h * 0.46, 0, 0, Math.PI * 2);
  else if (name === 'Heart') {
    ctx.moveTo(w * 0.5, h * 0.9);
    ctx.bezierCurveTo(w * 0.05, h * 0.6, w * 0.02, h * 0.25, w * 0.27, h * 0.15);
    ctx.bezierCurveTo(w * 0.42, h * 0.1, w * 0.5, h * 0.22, w * 0.5, h * 0.3);
    ctx.bezierCurveTo(w * 0.5, h * 0.22, w * 0.58, h * 0.1, w * 0.73, h * 0.15);
    ctx.bezierCurveTo(w * 0.98, h * 0.25, w * 0.95, h * 0.6, w * 0.5, h * 0.9);
  } else {
    const pts = shapePoints(name) ?? [];
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
  }
  ctx.closePath();
  ctx.fill();
}

/** Draw a repeating pattern over w×h. */
function drawPattern(ctx: CanvasRenderingContext2D, name: string, w: number, h: number, color: string): void {
  const s = Math.max(12, Math.round(Math.min(w, h) / 24)); // cell size
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s / 8);
  ctx.beginPath();
  for (let y = 0; y < h + s; y += s) {
    for (let x = 0; x < w + s; x += s) {
      switch (name) {
        case 'Dots': ctx.moveTo(x + s / 2 + s / 6, y + s / 2); ctx.arc(x + s / 2, y + s / 2, s / 6, 0, Math.PI * 2); break;
        case 'Crosses': ctx.moveTo(x + s * 0.3, y + s * 0.5); ctx.lineTo(x + s * 0.7, y + s * 0.5); ctx.moveTo(x + s * 0.5, y + s * 0.3); ctx.lineTo(x + s * 0.5, y + s * 0.7); break;
        case 'Hexagons': {
          const ox = x + ((Math.round(y / s) % 2) * s) / 2, r = s / 2.2;
          for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; const px = ox + s / 2 + r * Math.cos(a), py = y + s / 2 + r * Math.sin(a); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          break;
        }
        default: break;
      }
    }
  }
  if (name === 'Lines') for (let x = -h; x < w + h; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x + h, h); }
  if (name === 'Grid') { for (let x = 0; x <= w; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, h); } for (let y = 0; y <= h; y += s) { ctx.moveTo(0, y); ctx.lineTo(w, y); } }
  if (name === 'Chevron') for (let y = 0; y < h + s; y += s) { ctx.moveTo(0, y); for (let x = 0; x <= w + s; x += s) { ctx.lineTo(x + s / 2, y - s / 2); ctx.lineTo(x + s, y); } }
  if (name === 'Waves') for (let y = 0; y < h + s; y += s) { ctx.moveTo(0, y); for (let x = 0; x <= w; x += 4) ctx.lineTo(x, y + Math.sin((x / s) * Math.PI) * (s / 4)); }
  if (name === 'Moire') for (let r = s / 2; r < Math.hypot(w, h); r += s / 2) { ctx.moveTo(w * 0.35 + r, h * 0.5); ctx.arc(w * 0.35, h * 0.5, r, 0, Math.PI * 2); ctx.moveTo(w * 0.65 + r, h * 0.5); ctx.arc(w * 0.65, h * 0.5, r, 0, Math.PI * 2); }
  if (name === 'Dots') ctx.fill(); else ctx.stroke();
}

export interface RenderedAsset { dataUrl: string; x: number; y: number; width: number; height: number }

/**
 * Render an Asset Library item for a document of `doc` size. Shapes are a
 * centred square a third of the short side; patterns and gradients cover the
 * document. Returns null when no 2D canvas is available.
 */
export function renderAsset(category: AssetCategory, name: string, color: string, doc: { width: number; height: number }): RenderedAsset | null {
  const full = category !== 'shapes';
  const side = Math.max(16, Math.round(Math.min(doc.width, doc.height) / 3));
  const w = full ? doc.width : side, h = full ? doc.height : side;
  if (w <= 0 || h <= 0 || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  if (category === 'shapes') { ctx.fillStyle = color; drawShape(ctx, name, w, h); }
  else if (category === 'patterns') drawPattern(ctx, name, w, h, color);
  else {
    const stops = GRADIENT_STOPS[name as keyof typeof GRADIENT_STOPS] ?? GRADIENT_STOPS.Mono;
    const g = ctx.createLinearGradient(0, 0, w, h);
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  return { dataUrl: c.toDataURL('image/png'), x: full ? 0 : Math.round((doc.width - w) / 2), y: full ? 0 : Math.round((doc.height - h) / 2), width: w, height: h };
}
