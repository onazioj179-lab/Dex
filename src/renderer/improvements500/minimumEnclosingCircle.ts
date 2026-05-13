// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Welzl's smallest enclosing circle for a set of 2D points.
 * Expected O(n) time.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface WelzlPoint {
  x: number;
  y: number;
}

export interface MinimumEnclosingCircle {
  cx: number;
  cy: number;
  r: number;
}

function circleFrom2(a: WelzlPoint, b: WelzlPoint): MinimumEnclosingCircle {
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    r: Math.hypot(a.x - b.x, a.y - b.y) / 2,
  };
}

function circleFrom3(a: WelzlPoint, b: WelzlPoint, c: WelzlPoint): MinimumEnclosingCircle {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const cx = c.x;
  const cy = c.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (d === 0) {
    // Collinear: return the circle through the two farthest points.
    const ab = circleFrom2(a, b);
    const ac = circleFrom2(a, c);
    const bc = circleFrom2(b, c);
    return [ab, ac, bc].sort((p, q) => q.r - p.r)[0]!;
  }
  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) / d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) / d;
  return { cx: ux, cy: uy, r: Math.hypot(ax - ux, ay - uy) };
}

function inCircle(p: WelzlPoint, c: MinimumEnclosingCircle): boolean {
  return Math.hypot(p.x - c.cx, p.y - c.cy) <= c.r + 1e-10;
}

function trivialCircle(boundary: WelzlPoint[]): MinimumEnclosingCircle {
  if (boundary.length === 0) return { cx: 0, cy: 0, r: 0 };
  if (boundary.length === 1) return { cx: boundary[0]!.x, cy: boundary[0]!.y, r: 0 };
  if (boundary.length === 2) return circleFrom2(boundary[0]!, boundary[1]!);
  return circleFrom3(boundary[0]!, boundary[1]!, boundary[2]!);
}

export function minimumEnclosingCircle(points: readonly WelzlPoint[]): MinimumEnclosingCircle {
  // Iterative Welzl with shuffled point order.
  const arr = points.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  let circle = trivialCircle([]);
  for (let i = 0; i < arr.length; i++) {
    if (!inCircle(arr[i]!, circle)) {
      circle = trivialCircle([arr[i]!]);
      for (let j = 0; j < i; j++) {
        if (!inCircle(arr[j]!, circle)) {
          circle = circleFrom2(arr[i]!, arr[j]!);
          for (let k = 0; k < j; k++) {
            if (!inCircle(arr[k]!, circle)) {
              circle = circleFrom3(arr[i]!, arr[j]!, arr[k]!);
            }
          }
        }
      }
    }
  }
  return circle;
}
