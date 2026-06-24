// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Selectable tiling layouts for the DEX window manager (DEX_FEATURE_BACKLOG P1).
 *
 * Inspired by compositor-level tiling WMs (Hyprland's Master / Dwindle / Monocle
 * etc.): one pure function computes the rectangles for N windows under a chosen
 * layout STRATEGY, so the shell can offer "arrange as …" as a first-class,
 * runtime-switchable action rather than a single fixed grid. Pure geometry — no
 * DOM, no React — fully unit-testable; the AppManager wiring just maps the
 * returned rects onto its detached windows (clamping each to min-size after).
 */

import type { WindowBounds } from './windowLayout';

export type TilingLayout = 'master' | 'columns' | 'rows' | 'grid' | 'dwindle' | 'monocle';

export const TILING_LAYOUTS: readonly TilingLayout[] = [
  'master', 'columns', 'rows', 'grid', 'dwindle', 'monocle',
];

export function tilingLayoutLabel(layout: TilingLayout): string {
  switch (layout) {
    case 'master': return 'Master + Stack';
    case 'columns': return 'Columns';
    case 'rows': return 'Rows';
    case 'grid': return 'Grid';
    case 'dwindle': return 'Dwindle (spiral split)';
    case 'monocle': return 'Monocle (stacked)';
  }
}

export interface TilingOptions {
  /** Pixel gutter between tiles AND around the edges. Default 6. */
  gap?: number;
  /** Master pane fraction of width for the `master` layout. Default 0.6. */
  masterRatio?: number;
}

const floor = Math.floor;

/** Inset an area by a uniform gap on all sides (the outer margin). */
function innerArea(area: WindowBounds, gap: number): WindowBounds {
  return { x: area.x + gap, y: area.y + gap, w: Math.max(0, area.w - gap * 2), h: Math.max(0, area.h - gap * 2) };
}

/** Split `total` into `n` near-equal integer parts that sum exactly to `total`. */
function splitInt(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Lay `n` tiles out along the width of `area`, separated by `gap`. */
function columnsIn(area: WindowBounds, n: number, gap: number): WindowBounds[] {
  if (n <= 0) return [];
  const usable = area.w - gap * (n - 1);
  const widths = splitInt(usable, n);
  const out: WindowBounds[] = [];
  let x = area.x;
  for (let i = 0; i < n; i++) {
    out.push({ x, y: area.y, w: widths[i], h: area.h });
    x += widths[i] + gap;
  }
  return out;
}

/** Lay `n` tiles out down the height of `area`, separated by `gap`. */
function rowsIn(area: WindowBounds, n: number, gap: number): WindowBounds[] {
  if (n <= 0) return [];
  const usable = area.h - gap * (n - 1);
  const heights = splitInt(usable, n);
  const out: WindowBounds[] = [];
  let y = area.y;
  for (let i = 0; i < n; i++) {
    out.push({ x: area.x, y, w: area.w, h: heights[i] });
    y += heights[i] + gap;
  }
  return out;
}

/**
 * Compute tile rectangles for `count` windows in `workspace` under `layout`.
 * Returns exactly `count` non-overlapping rects (except `monocle`, where every
 * window fills the area). `gap` is applied between tiles and as the outer margin.
 */
export function computeTiling(
  layout: TilingLayout,
  count: number,
  workspace: WindowBounds,
  opts: TilingOptions = {},
): WindowBounds[] {
  if (count <= 0) return [];
  const gap = Math.max(0, opts.gap ?? 6);
  const masterRatio = Math.min(0.85, Math.max(0.3, opts.masterRatio ?? 0.6));
  const area = innerArea(workspace, gap);
  if (count === 1) return [{ ...area }];

  switch (layout) {
    case 'monocle':
      return Array.from({ length: count }, () => ({ ...area }));

    case 'columns':
      return columnsIn(area, count, gap);

    case 'rows':
      return rowsIn(area, count, gap);

    case 'master': {
      // Master pane on the left at full height; the rest stack on the right.
      const masterW = floor((area.w - gap) * masterRatio);
      const stackX = area.x + masterW + gap;
      const stackArea: WindowBounds = { x: stackX, y: area.y, w: area.w - masterW - gap, h: area.h };
      const master: WindowBounds = { x: area.x, y: area.y, w: masterW, h: area.h };
      return [master, ...rowsIn(stackArea, count - 1, gap)];
    }

    case 'dwindle': {
      // Spiral binary split: alternate vertical / horizontal halving, the last
      // two tiles sharing the final cell. Mirrors Hyprland's dwindle feel.
      const out: WindowBounds[] = [];
      let cur: WindowBounds = { ...area };
      for (let i = 0; i < count; i++) {
        const last = i === count - 1;
        if (last) { out.push({ ...cur }); break; }
        if (i % 2 === 0) {
          // split vertically (left | right); keep left, recurse right
          const leftW = floor((cur.w - gap) / 2);
          out.push({ x: cur.x, y: cur.y, w: leftW, h: cur.h });
          cur = { x: cur.x + leftW + gap, y: cur.y, w: cur.w - leftW - gap, h: cur.h };
        } else {
          // split horizontally (top / bottom); keep top, recurse bottom
          const topH = floor((cur.h - gap) / 2);
          out.push({ x: cur.x, y: cur.y, w: cur.w, h: topH });
          cur = { x: cur.x, y: cur.y + topH + gap, w: cur.w, h: cur.h - topH - gap };
        }
      }
      return out;
    }

    case 'grid':
    default: {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const colW = splitInt(area.w - gap * (cols - 1), cols);
      const rowH = splitInt(area.h - gap * (rows - 1), rows);
      // x offset per column, y offset per row.
      const colX: number[] = [];
      let ax = area.x;
      for (let c = 0; c < cols; c++) { colX.push(ax); ax += colW[c] + gap; }
      const rowY: number[] = [];
      let ay = area.y;
      for (let r = 0; r < rows; r++) { rowY.push(ay); ay += rowH[r] + gap; }
      const out: WindowBounds[] = [];
      for (let i = 0; i < count; i++) {
        const r = floor(i / cols);
        const c = i % cols;
        out.push({ x: colX[c], y: rowY[r], w: colW[c], h: rowH[r] });
      }
      return out;
    }
  }
}
