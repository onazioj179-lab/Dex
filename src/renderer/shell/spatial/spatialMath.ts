// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Spatial desktop math: camera, coordinate transforms, fitting, culling and
// reversible arrangements. Pure functions only (unit-tested).
//
// Coordinates: every floating window has a WORLD rect (x, y, w, h) in CSS px at
// 100% zoom. The camera is the world point shown at the top-left of the
// workspace (x, y) plus a zoom factor z:   screen = (world - cam) * z.
// Zooming toward a point keeps the world point under it fixed, computed from
// the absolute target values (not accumulated deltas), so repeated zoom/pan
// never drifts.
//

export interface Camera { x: number; y: number; z: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface ZoomLimits { min: number; max: number }

export const DEFAULT_LIMITS: ZoomLimits = { min: 0.05, max: 3 };
export const HOME_CAMERA: Camera = { x: 0, y: 0, z: 1 };
/** World extent: keeps coordinates well inside float precision for pixel math. */
export const WORLD_LIMIT = 1_000_000;

const finite = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

export function clampZoom(z: number, limits: ZoomLimits = DEFAULT_LIMITS): number {
  return Math.min(limits.max, Math.max(limits.min, finite(z, 1)));
}

/** Repair a camera read from storage (NaN, out-of-range, wrong type). */
export function sanitizeCamera(c: unknown, limits: ZoomLimits = DEFAULT_LIMITS): Camera {
  const o = (c && typeof c === 'object' ? c : {}) as Partial<Camera>;
  const clampPos = (v: number) => Math.min(WORLD_LIMIT, Math.max(-WORLD_LIMIT, v));
  return { x: clampPos(finite(o.x, 0)), y: clampPos(finite(o.y, 0)), z: clampZoom(finite(o.z, 1), limits) };
}

export function screenToWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.x + sx / cam.z, y: cam.y + sy / cam.z };
}

export function worldToScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.z, y: (wy - cam.y) * cam.z };
}

/** Zoom by `factor` keeping the world point under screen point (sx, sy) fixed. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number, limits: ZoomLimits = DEFAULT_LIMITS): Camera {
  const z = clampZoom(cam.z * factor, limits);
  const anchor = screenToWorld(cam, sx, sy);
  return { x: anchor.x - sx / z, y: anchor.y - sy / z, z };
}

/** Set an absolute zoom around a screen point. */
export function zoomToAt(cam: Camera, sx: number, sy: number, z: number, limits: ZoomLimits = DEFAULT_LIMITS): Camera {
  return zoomAt(cam, sx, sy, clampZoom(z, limits) / cam.z, limits);
}

/** Pan by a screen-space delta (drag right => content moves right). */
export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return sanitizeCamera({ x: cam.x - dxScreen / cam.z, y: cam.y - dyScreen / cam.z, z: cam.z });
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Camera that shows `target` centred in a viewport, with `pad` screen px around it. */
export function fitRect(target: Rect, vw: number, vh: number, pad = 48, limits: ZoomLimits = DEFAULT_LIMITS, maxZ = 1): Camera {
  const availW = Math.max(1, vw - pad * 2);
  const availH = Math.max(1, vh - pad * 2);
  const z = clampZoom(Math.min(availW / Math.max(1, target.w), availH / Math.max(1, target.h), maxZ), limits);
  return {
    x: target.x + target.w / 2 - vw / 2 / z,
    y: target.y + target.h / 2 - vh / 2 / z,
    z,
  };
}

/** World rect currently visible in a viewport of vw x vh screen px. */
export function viewRect(cam: Camera, vw: number, vh: number): Rect {
  return { x: cam.x, y: cam.y, w: vw / cam.z, h: vh / cam.z };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Is a world rect on screen (with a screen-px margin so edges pre-warm)? */
export function isOnScreen(r: Rect, cam: Camera, vw: number, vh: number, marginPx = 200): boolean {
  const m = marginPx / cam.z;
  const v = viewRect(cam, vw, vh);
  return intersects(r, { x: v.x - m, y: v.y - m, w: v.w + 2 * m, h: v.h + 2 * m });
}

/** Linear camera interpolation; zoom interpolated in log space so it feels even. */
export function lerpCamera(a: Camera, b: Camera, t: number, vw: number, vh: number): Camera {
  const k = Math.min(1, Math.max(0, t));
  const z = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * k);
  // Interpolate the view CENTRE (not the top-left) so a zoom transition
  // doesn't swing sideways.
  const ca = { x: a.x + vw / 2 / a.z, y: a.y + vh / 2 / a.z };
  const cb = { x: b.x + vw / 2 / b.z, y: b.y + vh / 2 / b.z };
  const cx = ca.x + (cb.x - ca.x) * k;
  const cy = ca.y + (cb.y - ca.y) * k;
  return { x: cx - vw / 2 / z, y: cy - vh / 2 / z, z };
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// ---- arrangements (keep each window's size; positions only) -----------------

export type ArrangeKind = 'grid' | 'masonry' | 'row' | 'cascade';
export interface ArrangeItem extends Rect { id: string }

/** Lay windows out starting at `origin`. Order is preserved (callers sort). */
export function arrange(kind: ArrangeKind, items: ArrangeItem[], origin: { x: number; y: number }, gap = 40): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  if (items.length === 0) return out;
  if (kind === 'row') {
    let x = origin.x;
    for (const it of items) { out[it.id] = { x, y: origin.y, w: it.w, h: it.h }; x += it.w + gap; }
    return out;
  }
  if (kind === 'cascade') {
    items.forEach((it, i) => { out[it.id] = { x: origin.x + i * 36, y: origin.y + i * 36, w: it.w, h: it.h }; });
    return out;
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(items.length)));
  if (kind === 'masonry') {
    const colW = Math.max(...items.map((i) => i.w));
    const heights = new Array(cols).fill(0);
    for (const it of items) {
      const c = heights.indexOf(Math.min(...heights));
      out[it.id] = { x: origin.x + c * (colW + gap), y: origin.y + heights[c], w: it.w, h: it.h };
      heights[c] += it.h + gap;
    }
    return out;
  }
  // grid: uniform cells sized to the largest window in each column/row
  const rows = Math.ceil(items.length / cols);
  const colW = new Array(cols).fill(0);
  const rowH = new Array(rows).fill(0);
  items.forEach((it, i) => {
    colW[i % cols] = Math.max(colW[i % cols], it.w);
    rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)], it.h);
  });
  items.forEach((it, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = origin.x + colW.slice(0, c).reduce((a, b) => a + b + gap, 0);
    const y = origin.y + rowH.slice(0, r).reduce((a, b) => a + b + gap, 0);
    out[it.id] = { x, y, w: it.w, h: it.h };
  });
  return out;
}

export function snapToGrid(v: number, step = 20): number {
  return Math.round(v / step) * step;
}

/**
 * Where to put a newly opened window: the free spot in the current view that is
 * nearest its centre (no overlap with any existing window, `gap` px apart).
 * When the view is full, fall back to the centre, nudged by a cascade step for
 * each window already at that spot so windows never land exactly on top of
 * each other.
 */
export function placeNewWindow(cam: Camera, vw: number, vh: number, size: { w: number; h: number }, existing: Rect[], gap = 24): Rect {
  const v = viewRect(cam, vw, vh);
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  const step = 40 / Math.max(cam.z, 0.25);
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = v.y + gap; y + size.h <= v.y + v.h - gap; y += step) {
    for (let x = v.x + gap; x + size.w <= v.x + v.w - gap; x += step) {
      const r = { x: x - gap, y: y - gap, w: size.w + gap * 2, h: size.h + gap * 2 };
      if (existing.some((e) => intersects(r, e))) continue;
      const d = Math.hypot(x + size.w / 2 - cx, y + size.h / 2 - cy);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (best) return { x: Math.round(best.x), y: Math.round(best.y), w: size.w, h: size.h };
  let x = Math.round(cx - size.w / 2);
  let y = Math.round(cy - size.h / 2);
  for (let i = 0; i < 50 && existing.some((r) => Math.abs(r.x - x) < 12 && Math.abs(r.y - y) < 12); i++) {
    x += 32; y += 32;
  }
  return { x, y, w: size.w, h: size.h };
}

// ---- magnetic snapping + alignment guides ------------------------------------

export interface Guide { axis: 'x' | 'y'; pos: number; from: number; to: number }

/**
 * Snap a moving rect's edges/centre to other windows' edges/centres when they
 * are within `threshold` world px. Returns the adjusted position and the guide
 * lines to draw (world coordinates). Each axis snaps independently.
 */
export function magneticSnap(moving: Rect, others: Rect[], threshold: number): { x: number; y: number; guides: Guide[] } {
  const xs = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
  const ys = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];
  let bestX: { d: number; delta: number; pos: number; o: Rect } | null = null;
  let bestY: { d: number; delta: number; pos: number; o: Rect } | null = null;
  const mx = xs(moving), my = ys(moving);
  for (const o of others) {
    for (const a of mx) for (const b of xs(o)) {
      const d = Math.abs(a - b);
      if (d <= threshold && (!bestX || d < bestX.d)) bestX = { d, delta: b - a, pos: b, o };
    }
    for (const a of my) for (const b of ys(o)) {
      const d = Math.abs(a - b);
      if (d <= threshold && (!bestY || d < bestY.d)) bestY = { d, delta: b - a, pos: b, o };
    }
  }
  const x = moving.x + (bestX?.delta ?? 0);
  const y = moving.y + (bestY?.delta ?? 0);
  const guides: Guide[] = [];
  if (bestX) guides.push({ axis: 'x', pos: bestX.pos, from: Math.min(y, bestX.o.y), to: Math.max(y + moving.h, bestX.o.y + bestX.o.h) });
  if (bestY) guides.push({ axis: 'y', pos: bestY.pos, from: Math.min(x, bestY.o.x), to: Math.max(x + moving.w, bestY.o.x + bestY.o.w) });
  return { x, y, guides };
}

export type AlignKind = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

/** Align rects to the extreme (or centre) of their shared bounds. Sizes kept. */
export function alignRects(items: ArrangeItem[], kind: AlignKind): Record<string, Rect> {
  const b = boundsOf(items);
  const out: Record<string, Rect> = {};
  if (!b) return out;
  for (const it of items) {
    let { x, y } = it;
    if (kind === 'left') x = b.x;
    else if (kind === 'right') x = b.x + b.w - it.w;
    else if (kind === 'center-x') x = Math.round(b.x + (b.w - it.w) / 2);
    else if (kind === 'top') y = b.y;
    else if (kind === 'bottom') y = b.y + b.h - it.h;
    else y = Math.round(b.y + (b.h - it.h) / 2);
    out[it.id] = { x, y, w: it.w, h: it.h };
  }
  return out;
}

/** Equal gaps between rects along an axis; the outermost two stay put. */
export function distributeRects(items: ArrangeItem[], axis: 'x' | 'y'): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  if (items.length < 3) { for (const it of items) out[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h }; return out; }
  const pos = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const size = (r: Rect) => (axis === 'x' ? r.w : r.h);
  const sorted = [...items].sort((a, b) => pos(a) - pos(b));
  const start = pos(sorted[0]);
  const end = Math.max(...sorted.map((r) => pos(r) + size(r)));
  const total = sorted.reduce((s, r) => s + size(r), 0);
  const gap = (end - start - total) / (sorted.length - 1);
  let cursor = start;
  for (const r of sorted) {
    const p = Math.round(cursor);
    out[r.id] = axis === 'x' ? { x: p, y: r.y, w: r.w, h: r.h } : { x: r.x, y: p, w: r.w, h: r.h };
    cursor += size(r) + gap;
  }
  return out;
}

/** Where to drop preset zones: a row starting at `origin`, `w`x`h` each. */
export function presetZoneRects(count: number, origin: { x: number; y: number }, w = 2400, h = 1500, gap = 200): Rect[] {
  return Array.from({ length: count }, (_, i) => ({ x: origin.x + i * (w + gap), y: origin.y, w, h }));
}

/** Two-pointer gesture: new camera from the pinch midpoint/distance change. */
export function pinchCamera(cam: Camera, prev: [{ x: number; y: number }, { x: number; y: number }], next: [{ x: number; y: number }, { x: number; y: number }], limits: ZoomLimits = DEFAULT_LIMITS): Camera {
  const mid = (p: typeof prev) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
  const dist = (p: typeof prev) => Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y));
  const m0 = mid(prev), m1 = mid(next);
  const zoomed = zoomAt(cam, m0.x, m0.y, dist(next) / dist(prev), limits);
  return panBy(zoomed, m1.x - m0.x, m1.y - m0.y);
}

/** Camera after an N-finger gesture step: zoom by `scale` about the previous
 *  centroid (cx, cy), then pan by the centroid's movement (screen px). */
export function gestureCamera(cam: Camera, d: { cx: number; cy: number; dx: number; dy: number; scale: number }, limits: ZoomLimits = DEFAULT_LIMITS): Camera {
  const zoomed = zoomAt(cam, d.cx, d.cy, d.scale, limits);
  return panBy(zoomed, d.dx, d.dy);
}
