// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { area, center, contains, intersects, intersection, union, fromPoints, inflate } from '../../src/shared/math/rect';

describe('rect', () => {
  it('area and center', () => {
    expect(area({ x: 0, y: 0, width: 10, height: 5 })).toBe(50);
    expect(center({ x: 0, y: 0, width: 10, height: 10 })).toEqual({ x: 5, y: 5 });
  });

  it('contains and intersects', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(contains(r, { x: 5, y: 5 })).toBe(true);
    expect(contains(r, { x: 20, y: 5 })).toBe(false);
    expect(intersects(r, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(intersects(r, { x: 100, y: 100, width: 5, height: 5 })).toBe(false);
  });

  it('intersection and union', () => {
    expect(intersection({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }))
      .toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(intersection({ x: 0, y: 0, width: 5, height: 5 }, { x: 100, y: 100, width: 5, height: 5 })).toBeNull();
    expect(union({ x: 0, y: 0, width: 5, height: 5 }, { x: 10, y: 10, width: 5, height: 5 }))
      .toEqual({ x: 0, y: 0, width: 15, height: 15 });
  });

  it('fromPoints and inflate', () => {
    expect(fromPoints({ x: 10, y: 10 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(inflate({ x: 5, y: 5, width: 10, height: 10 }, 2)).toEqual({ x: 3, y: 3, width: 14, height: 14 });
  });
});
