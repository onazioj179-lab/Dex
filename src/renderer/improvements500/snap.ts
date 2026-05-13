// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Snap-to-grid + edge snap (T3-067, T6-013/14 helper).
 */

export interface SnapConfig {
  gridSize: number;
  /** Threshold in px to snap to a guide. Default 6. */
  threshold?: number;
}

export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapPointToGrid(x: number, y: number, gridSize: number): { x: number; y: number } {
  return { x: snapToGrid(x, gridSize), y: snapToGrid(y, gridSize) };
}

/** Snap a value to the nearest of a list of edges within threshold. */
export function snapToGuides(value: number, guides: readonly number[], threshold = 6): number {
  let best = value;
  let bestDist = threshold;
  for (const g of guides) {
    const d = Math.abs(value - g);
    if (d < bestDist) { bestDist = d; best = g; }
  }
  return best;
}

export interface BoundsLike { x: number; y: number; width: number; height: number; }

/** Snap a moving box to the edges and centerlines of `targets`. */
export function snapBoxToBoxes(box: BoundsLike, targets: readonly BoundsLike[], threshold = 6): BoundsLike {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const t of targets) {
    xs.push(t.x, t.x + t.width, t.x + t.width / 2);
    ys.push(t.y, t.y + t.height, t.y + t.height / 2);
  }
  const left = snapToGuides(box.x, xs, threshold);
  const right = snapToGuides(box.x + box.width, xs, threshold);
  const top = snapToGuides(box.y, ys, threshold);
  const bottom = snapToGuides(box.y + box.height, ys, threshold);
  // Prefer the smaller delta on each axis.
  const dx = Math.abs(left - box.x) <= Math.abs(right - (box.x + box.width)) ? (left - box.x) : (right - (box.x + box.width));
  const dy = Math.abs(top - box.y) <= Math.abs(bottom - (box.y + box.height)) ? (top - box.y) : (bottom - (box.y + box.height));
  return { ...box, x: box.x + dx, y: box.y + dy };
}
