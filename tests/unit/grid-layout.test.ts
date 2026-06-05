// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { gridRows, layoutGrid, gridContainerSize, columnsForWidth } from '../../src/shared/creative/gridLayout';

const OPTS = { cols: 2, cellWidth: 100, cellHeight: 50, gapX: 10, gapY: 10 };

describe('grid layout', () => {
  it('computes row count', () => {
    expect(gridRows(5, 2)).toBe(3);
    expect(gridRows(4, 2)).toBe(2);
    expect(gridRows(0, 2)).toBe(0);
  });

  it('places cells with gaps', () => {
    const cells = layoutGrid(3, OPTS);
    expect(cells[0]).toMatchObject({ row: 0, col: 0, x: 0, y: 0 });
    expect(cells[1]).toMatchObject({ row: 0, col: 1, x: 110, y: 0 });
    expect(cells[2]).toMatchObject({ row: 1, col: 0, x: 0, y: 60 });
  });

  it('computes container size', () => {
    expect(gridContainerSize(3, OPTS)).toEqual({ width: 210, height: 110 });
    expect(gridContainerSize(0, OPTS)).toEqual({ width: 0, height: 0 });
    expect(gridContainerSize(1, OPTS)).toEqual({ width: 100, height: 50 });
  });

  it('picks columns to fit a width', () => {
    expect(columnsForWidth(420, 100, 10)).toBe(3);
    expect(columnsForWidth(50, 100, 10)).toBe(1); // always at least 1
  });
});
