// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Linked Window "Smart Expansion" geometry (GOAL-6D). When windows are linked
 * they tile together and stay aligned: resize the group's area and every member
 * reflows to share it. Pure geometry, unit-testable; the shell calls this when a
 * linked group's bounds change.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Evenly tile `count` slots horizontally across `area`, separated by `gap`. */
export function tileHorizontally(area: Rect, count: number, gap = 8): Rect[] {
  if (count <= 0) return [];
  const totalGap = gap * (count - 1);
  const width = Math.max(1, Math.floor((area.width - totalGap) / count));
  const rects: Rect[] = [];
  for (let i = 0; i < count; i++) {
    rects.push({
      x: area.x + i * (width + gap),
      y: area.y,
      width,
      height: area.height,
    });
  }
  return rects;
}

/**
 * Tile a linked group of window ids across `area` (id -> rect), full height so
 * the windows stay aligned. Order of `ids` is preserved left-to-right.
 */
export function tileGroup(ids: readonly string[], area: Rect, gap = 8): Record<string, Rect> {
  const rects = tileHorizontally(area, ids.length, gap);
  const out: Record<string, Rect> = {};
  ids.forEach((id, i) => {
    out[id] = rects[i];
  });
  return out;
}

/** The tight bounding box that contains all `rects` (for moving a group together). */
export function boundingBox(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
