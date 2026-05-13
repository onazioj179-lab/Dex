// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Polyline simplification via Ramer-Douglas-Peucker.
 * Reduces a chain of points to a smaller set whose perpendicular distance
 * from the original is below `tolerance`.
 */

export interface XY { x: number; y: number }

export function simplifyPolyline<P extends XY>(points: readonly P[], tolerance: number): P[] {
  if (points.length <= 2) return points.slice();
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error('simplifyPolyline: tolerance must be a non-negative number');
  }
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  rdp(points, 0, points.length - 1, sqTol, keep);
  const out: P[] = [];
  for (let i = 0; i < points.length; i += 1) if (keep[i]) out.push(points[i]!);
  return out;
}

function rdp<P extends XY>(points: readonly P[], lo: number, hi: number, sqTol: number, keep: Uint8Array): void {
  if (hi <= lo + 1) return;
  let maxSq = 0;
  let idx = -1;
  const a = points[lo]!;
  const b = points[hi]!;
  for (let i = lo + 1; i < hi; i += 1) {
    const d = perpSq(points[i]!, a, b);
    if (d > maxSq) { maxSq = d; idx = i; }
  }
  if (maxSq > sqTol && idx !== -1) {
    keep[idx] = 1;
    rdp(points, lo, idx, sqTol, keep);
    rdp(points, idx, hi, sqTol, keep);
  }
}

function perpSq(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const ex = p.x - a.x; const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  const px = a.x + tc * dx;
  const py = a.y + tc * dy;
  const ex = p.x - px; const ey = p.y - py;
  return ex * ex + ey * ey;
}
