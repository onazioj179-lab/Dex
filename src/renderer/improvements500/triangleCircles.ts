// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Triangle circumcircle and incircle.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface TrianglePoint {
  x: number;
  y: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export function circumcircle(a: TrianglePoint, b: TrianglePoint, c: TrianglePoint): Circle | null {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const cx = c.x;
  const cy = c.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (d === 0) return null;
  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) / d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  return { cx: ux, cy: uy, r };
}

export function incircle(a: TrianglePoint, b: TrianglePoint, c: TrianglePoint): Circle | null {
  const la = Math.hypot(b.x - c.x, b.y - c.y);
  const lb = Math.hypot(c.x - a.x, c.y - a.y);
  const lc = Math.hypot(a.x - b.x, a.y - b.y);
  const s = la + lb + lc;
  if (s === 0) return null;
  const ix = (la * a.x + lb * b.x + lc * c.x) / s;
  const iy = (la * a.y + lb * b.y + lc * c.y) / s;
  const semi = s / 2;
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  const r = area / semi;
  return { cx: ix, cy: iy, r };
}
