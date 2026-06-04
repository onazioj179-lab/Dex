// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Snapping helpers (Vinx/Flux timeline, Canvas/Prism alignment). Snap a value
 * to a grid, or to the nearest of a set of snap points within a threshold
 * (clip edges, playhead, guides). Pure: no DOM, no IO.
 */

/** Snap `value` to the nearest multiple of `grid` (grid<=0 → unchanged). */
export function snapToGrid(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export interface SnapResult {
  value: number;
  snapped: boolean;
  /** The snap point used, when snapped. */
  target?: number;
}

/**
 * Snap `value` to the nearest of `points` if one is within `threshold`.
 * Otherwise returns the original value unsnapped. Ties prefer the closer (then
 * smaller) point.
 */
export function nearestSnap(value: number, points: readonly number[], threshold: number): SnapResult {
  let best: number | undefined;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.abs(p - value);
    if (d < bestDist || (d === bestDist && best !== undefined && p < best)) {
      bestDist = d;
      best = p;
    }
  }
  if (best !== undefined && bestDist <= threshold) {
    return { value: best, snapped: true, target: best };
  }
  return { value, snapped: false };
}

/** Clamp a value into [min, max]. */
export function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Snap to a grid OR the nearest point, whichever is closer within threshold.
 * Grid snap always applies (no threshold); point snap wins when strictly closer.
 */
export function snapValue(
  value: number,
  opts: { grid?: number; points?: readonly number[]; threshold?: number },
): SnapResult {
  const threshold = opts.threshold ?? Infinity;
  const gridded = opts.grid && opts.grid > 0 ? snapToGrid(value, opts.grid) : value;
  if (!opts.points || opts.points.length === 0) {
    return { value: gridded, snapped: gridded !== value, target: gridded };
  }
  const pt = nearestSnap(value, opts.points, threshold);
  if (pt.snapped && Math.abs(pt.value - value) <= Math.abs(gridded - value)) {
    return pt;
  }
  return { value: gridded, snapped: gridded !== value, target: gridded };
}
