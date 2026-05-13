// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Polygon utilities - signed area (shoelace), centroid, winding.
 * Operates on simple (non-self-intersecting) polygons.
 */

export type Pt2 = readonly [number, number];

/** Signed area: positive = counter-clockwise, negative = clockwise. */
export function polygonSignedArea(points: readonly Pt2[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % n]!;
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonArea(points: readonly Pt2[]): number {
  return Math.abs(polygonSignedArea(points));
}

export function isClockwise(points: readonly Pt2[]): boolean {
  return polygonSignedArea(points) < 0;
}

/** Area-weighted centroid; returns [0,0] for degenerate polygon. */
export function polygonCentroid(points: readonly Pt2[]): Pt2 {
  const n = points.length;
  if (n < 3) return [0, 0];
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % n]!;
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a /= 2;
  if (a === 0) return [0, 0];
  return [cx / (6 * a), cy / (6 * a)];
}
