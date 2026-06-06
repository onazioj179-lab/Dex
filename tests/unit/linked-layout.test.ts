// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { tileHorizontally, tileGroup, boundingBox } from '../../src/shared/workspace/linkedLayout';

const area = { x: 0, y: 0, width: 1000, height: 600 };

describe('Linked window Smart Expansion geometry', () => {
  it('tiles evenly with gaps, full height (aligned)', () => {
    const rects = tileHorizontally(area, 2, 8);
    expect(rects).toHaveLength(2);
    expect(rects[0].width).toBe(496); // (1000 - 8) / 2
    expect(rects[0].x).toBe(0);
    expect(rects[1].x).toBe(504); // 496 + 8 gap
    expect(rects[0].height).toBe(600); // stays aligned to the area
    expect(rects[1].height).toBe(600);
  });

  it('three windows share the area', () => {
    const rects = tileHorizontally(area, 3, 10);
    expect(rects).toHaveLength(3);
    // last window ends within the area
    expect(rects[2].x + rects[2].width).toBeLessThanOrEqual(area.width);
  });

  it('tileGroup maps ids left-to-right', () => {
    const map = tileGroup(['code', 'terminal'], area);
    expect(Object.keys(map).sort()).toEqual(['code', 'terminal']);
    expect(map.code.x).toBe(0);
    expect(map.terminal.x).toBeGreaterThan(map.code.x);
  });

  it('boundingBox contains all rects', () => {
    const bb = boundingBox([
      { x: 10, y: 20, width: 100, height: 50 },
      { x: 200, y: 10, width: 80, height: 90 },
    ]);
    expect(bb).toEqual({ x: 10, y: 10, width: 270, height: 90 });
  });

  it('empty inputs are safe', () => {
    expect(tileHorizontally(area, 0)).toEqual([]);
    expect(boundingBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
