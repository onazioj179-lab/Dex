// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Fast atan2 approximation. Maximum error ~0.0038 radians. Useful
 * for vector angles in tight inner loops where Math.atan2 cost
 * dominates and full precision is not required.
 */

export function atan2Approx(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const a = Math.min(ax, ay) / Math.max(ax, ay);
  const s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = Math.PI / 2 - r;
  if (x < 0) r = Math.PI - r;
  if (y < 0) r = -r;
  return r;
}
