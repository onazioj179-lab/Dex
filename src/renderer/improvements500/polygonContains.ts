// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Point-in-polygon test using the ray-casting / crossing-number
 * algorithm. Works for simple non-self-intersecting polygons.
 */

export interface PolyPoint {
  x: number;
  y: number;
}

/**
 * Returns true when `point` lies strictly inside (or on boundary of)
 * `polygon`. Polygon vertices may be in either winding order.
 */
export function polygonContains(polygon: ReadonlyArray<PolyPoint>, point: PolyPoint): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  let j = n - 1;
  const { x, y } = point;
  for (let i = 0; i < n; i += 1) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersect =
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}
