// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Returns the intersection points of two circles in 2D, or null if
 * the circles do not intersect, are concentric, or one is contained
 * within the other without touching.
 */

export interface CircleIntersection {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export function circleCircleIntersect(
  c1x: number,
  c1y: number,
  r1: number,
  c2x: number,
  c2y: number,
  r2: number,
): CircleIntersection | null {
  const dx = c2x - c1x;
  const dy = c2y - c1y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return null;
  if (d > r1 + r2 || d < Math.abs(r1 - r2)) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  const h = hSq < 0 ? 0 : Math.sqrt(hSq);
  const px = c1x + (a * dx) / d;
  const py = c1y + (a * dy) / d;
  const rx = -dy * (h / d);
  const ry = dx * (h / d);
  return {
    a: { x: px + rx, y: py + ry },
    b: { x: px - rx, y: py - ry },
  };
}
