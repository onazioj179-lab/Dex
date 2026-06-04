// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bounding boxes (marquee selection, Flux/AXL/Canvas object bounds, fit-to-
 * selection). Computes the axis-aligned bounds of a set of points and combines
 * boxes. Pure: no DOM, no IO.
 */

export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; width: number; height: number }

/** Axis-aligned bounding box of points, or null when empty. */
export function boundingBox(points: readonly Pt[]): Box | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Smallest box containing both (treats null as "nothing"). */
export function mergeBoxes(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const btm = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: btm - y };
}

/** Box grown to include a point. */
export function expandToInclude(box: Box | null, p: Pt): Box {
  if (!box) return { x: p.x, y: p.y, width: 0, height: 0 };
  const x = Math.min(box.x, p.x);
  const y = Math.min(box.y, p.y);
  const right = Math.max(box.x + box.width, p.x);
  const btm = Math.max(box.y + box.height, p.y);
  return { x, y, width: right - x, height: btm - y };
}

/** Center point of a box. */
export function boxCenter(box: Box): Pt {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
