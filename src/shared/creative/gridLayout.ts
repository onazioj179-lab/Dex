// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Grid layout math (Gallery, Prism contact-sheet, Forge queue thumbnails). Given
 * an item count and cell geometry, returns the rectangle for each item plus the
 * total container size — without measuring the DOM. Pure: no DOM, no IO.
 */

export interface GridOptions {
  cols: number;
  cellWidth: number;
  cellHeight: number;
  gapX?: number;
  gapY?: number;
}

export interface CellRect {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Number of rows needed for `count` items in `cols` columns. */
export function gridRows(count: number, cols: number): number {
  if (count <= 0 || cols <= 0) return 0;
  return Math.ceil(count / cols);
}

/** Compute a rectangle for each of `count` items. */
export function layoutGrid(count: number, opts: GridOptions): CellRect[] {
  const cols = Math.max(1, Math.floor(opts.cols));
  const gapX = opts.gapX ?? 0;
  const gapY = opts.gapY ?? 0;
  const out: CellRect[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    out.push({
      index: i,
      row,
      col,
      x: col * (opts.cellWidth + gapX),
      y: row * (opts.cellHeight + gapY),
      width: opts.cellWidth,
      height: opts.cellHeight,
    });
  }
  return out;
}

/** Total pixel size of the grid container for `count` items. */
export function gridContainerSize(count: number, opts: GridOptions): { width: number; height: number } {
  const cols = Math.max(1, Math.floor(opts.cols));
  const rows = gridRows(count, cols);
  const usedCols = Math.min(cols, Math.max(0, count));
  const gapX = opts.gapX ?? 0;
  const gapY = opts.gapY ?? 0;
  return {
    width: usedCols === 0 ? 0 : usedCols * opts.cellWidth + (usedCols - 1) * gapX,
    height: rows === 0 ? 0 : rows * opts.cellHeight + (rows - 1) * gapY,
  };
}

/** Best column count to fit cells of `cellWidth` (+gap) into `availableWidth`. */
export function columnsForWidth(availableWidth: number, cellWidth: number, gap = 0): number {
  if (cellWidth <= 0) return 1;
  return Math.max(1, Math.floor((availableWidth + gap) / (cellWidth + gap)));
}
