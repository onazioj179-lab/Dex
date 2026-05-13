/*
 * DEX - Axis-aligned 2D interval / rectangle helpers (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 */

export interface Rect2D {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True if two rectangles overlap (exclusive at right/bottom edges). */
export function rectsOverlap(a: Rect2D, b: Rect2D): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Intersection rectangle, or null if disjoint. */
export function rectIntersection(a: Rect2D, b: Rect2D): Rect2D | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bo = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || bo <= y) return null;
  return { x, y, w: r - x, h: bo - y };
}

/** Tight bounding rectangle of a list of rectangles. */
export function rectsBoundingBox(rects: readonly Rect2D[]): Rect2D | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** True if rectangle `a` fully contains rectangle `b`. */
export function rectContains(a: Rect2D, b: Rect2D): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}
