// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rectangle math (marquee selection, window snapping, hit-testing, layout). All
 * rects are {x, y, width, height} with non-negative size. Pure: no DOM, no IO.
 */

export interface Rect { x: number; y: number; width: number; height: number }
export interface Pt { x: number; y: number }

export function area(r: Rect): number { return Math.max(0, r.width) * Math.max(0, r.height); }
export function right(r: Rect): number { return r.x + r.width; }
export function bottom(r: Rect): number { return r.y + r.height; }
export function center(r: Rect): Pt { return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }

/** True when point `p` is inside `r` (inclusive edges). */
export function contains(r: Rect, p: Pt): boolean {
  return p.x >= r.x && p.x <= right(r) && p.y >= r.y && p.y <= bottom(r);
}

/** True when two rects overlap (touching edges count as overlap). */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= right(b) && right(a) >= b.x && a.y <= bottom(b) && bottom(a) >= b.y;
}

/** Overlapping region, or null when they don't intersect. */
export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(right(a), right(b));
  const btm = Math.min(bottom(a), bottom(b));
  if (r < x || btm < y) return null;
  return { x, y, width: r - x, height: btm - y };
}

/** Smallest rect containing both. */
export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(right(a), right(b)) - x, height: Math.max(bottom(a), bottom(b)) - y };
}

/** A rect from two corner points (any order). */
export function fromPoints(a: Pt, b: Pt): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Grow (or shrink, with negative) a rect by `amount` on all sides. */
export function inflate(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, width: r.width + amount * 2, height: r.height + amount * 2 };
}
