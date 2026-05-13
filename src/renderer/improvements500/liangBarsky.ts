// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Liang-Barsky line clipping against axis-aligned rectangle. Returns the
 * clipped segment, or null if the line lies entirely outside.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface LiangBarskyRect {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface LiangBarskySegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function liangBarskyClip(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: LiangBarskyRect,
): LiangBarskySegment | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - rect.xMin, rect.xMax - x0, y0 - rect.yMin, rect.yMax - y0];

  let u1 = 0;
  let u2 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > u2) return null;
        if (t > u1) u1 = t;
      } else {
        if (t < u1) return null;
        if (t < u2) u2 = t;
      }
    }
  }

  return {
    x0: x0 + u1 * dx,
    y0: y0 + u1 * dy,
    x1: x0 + u2 * dx,
    y1: y0 + u2 * dy,
  };
}
