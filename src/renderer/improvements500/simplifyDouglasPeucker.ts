// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Ramer-Douglas-Peucker polyline simplification. Reduces a polyline
 * to fewer vertices while preserving overall shape within `epsilon`
 * perpendicular distance. O(n log n) average case.
 */

export interface SimplifyPoint {
  x: number;
  y: number;
}

function perpDistance(p: SimplifyPoint, a: SimplifyPoint, b: SimplifyPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return num / Math.sqrt(dx * dx + dy * dy);
}

export function simplifyDouglasPeucker(
  points: ReadonlyArray<SimplifyPoint>,
  epsilon: number,
): SimplifyPoint[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    const a = points[lo]!;
    const b = points[hi]!;
    for (let i = lo + 1; i < hi; i += 1) {
      const d = perpDistance(points[i]!, a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx !== -1) {
      keep[maxIdx] = 1;
      stack.push([lo, maxIdx]);
      stack.push([maxIdx, hi]);
    }
  }
  const out: SimplifyPoint[] = [];
  for (let i = 0; i < points.length; i += 1) if (keep[i]) out.push(points[i]!);
  return out;
}
