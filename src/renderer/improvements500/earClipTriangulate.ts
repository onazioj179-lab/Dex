// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Ear-clipping triangulation for simple (non-self-intersecting) polygons.
 * Returns a flat list of vertex indices forming triangles.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface EarClipPoint {
  x: number;
  y: number;
}

function area(poly: readonly EarClipPoint[]): number {
  let a = 0;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    a += poly[j]!.x * poly[i]!.y - poly[i]!.x * poly[j]!.y;
  }
  return a / 2;
}

function pointInTri(p: EarClipPoint, a: EarClipPoint, b: EarClipPoint, c: EarClipPoint): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export function earClipTriangulate(polygon: readonly EarClipPoint[]): number[] {
  const n = polygon.length;
  if (n < 3) return [];
  const ccw = area(polygon) > 0;
  const indices: number[] = [];
  for (let i = 0; i < n; i++) indices.push(ccw ? i : n - 1 - i);

  const triangles: number[] = [];
  let guard = 0;
  while (indices.length > 3) {
    let earFound = false;
    for (let i = 0; i < indices.length; i++) {
      const i0 = indices[(i - 1 + indices.length) % indices.length]!;
      const i1 = indices[i]!;
      const i2 = indices[(i + 1) % indices.length]!;
      const a = polygon[i0]!;
      const b = polygon[i1]!;
      const c = polygon[i2]!;
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 0) continue; // not convex
      let isEar = true;
      for (const idx of indices) {
        if (idx === i0 || idx === i1 || idx === i2) continue;
        if (pointInTri(polygon[idx]!, a, b, c)) {
          isEar = false;
          break;
        }
      }
      if (isEar) {
        triangles.push(i0, i1, i2);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) break;
    if (++guard > n * n) break;
  }
  if (indices.length === 3) triangles.push(indices[0]!, indices[1]!, indices[2]!);
  return triangles;
}
