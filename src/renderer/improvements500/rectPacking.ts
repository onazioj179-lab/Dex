// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Guillotine rectangle bin packing. Used by sprite atlas generation in
 * FORGE/AXL and by the in-app icon-cache packer.
 */

export interface PackRect { width: number; height: number; }
export interface PlacedRect extends PackRect { x: number; y: number; index: number; }
export interface PackResult { width: number; height: number; placed: PlacedRect[]; unplaced: number[]; }

interface FreeRect { x: number; y: number; w: number; h: number; }

/** Heuristic: best-short-side-fit + guillotine split. */
export function packRects(rects: readonly PackRect[], binWidth: number, binHeight: number): PackResult {
  const free: FreeRect[] = [{ x: 0, y: 0, w: binWidth, h: binHeight }];
  const placed: PlacedRect[] = [];
  const unplaced: number[] = [];
  // Sort by max-side descending for stable packing.
  const order = rects
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Math.max(b.r.width, b.r.height) - Math.max(a.r.width, a.r.height));

  for (const { r, i } of order) {
    let bestIdx = -1;
    let bestScore = Infinity;
    for (let f = 0; f < free.length; f++) {
      const fr = free[f];
      if (fr.w >= r.width && fr.h >= r.height) {
        const score = Math.min(fr.w - r.width, fr.h - r.height);
        if (score < bestScore) { bestScore = score; bestIdx = f; }
      }
    }
    if (bestIdx === -1) { unplaced.push(i); continue; }
    const target = free[bestIdx];
    placed.push({ index: i, x: target.x, y: target.y, width: r.width, height: r.height });
    // Guillotine split: prefer horizontal split when remainder is wider.
    const right: FreeRect = { x: target.x + r.width, y: target.y, w: target.w - r.width, h: r.height };
    const bottom: FreeRect = { x: target.x, y: target.y + r.height, w: target.w, h: target.h - r.height };
    free.splice(bestIdx, 1);
    if (right.w > 0 && right.h > 0) free.push(right);
    if (bottom.w > 0 && bottom.h > 0) free.push(bottom);
  }
  return { width: binWidth, height: binHeight, placed, unplaced };
}
