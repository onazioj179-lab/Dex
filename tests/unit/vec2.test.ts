// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import * as v from '../../src/shared/math/vec2';

describe('vec2', () => {
  it('basic arithmetic', () => {
    expect(v.add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(v.sub({ x: 3, y: 4 }, { x: 1, y: 2 })).toEqual({ x: 2, y: 2 });
    expect(v.scale({ x: 2, y: 3 }, 2)).toEqual({ x: 4, y: 6 });
    expect(v.dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
  });

  it('length, distance, normalize', () => {
    expect(v.length({ x: 3, y: 4 })).toBe(5);
    expect(v.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    const n = v.normalize({ x: 3, y: 4 });
    expect(n.x).toBeCloseTo(0.6, 6);
    expect(n.y).toBeCloseTo(0.8, 6);
    expect(v.normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('lerp and angles', () => {
    expect(v.lerp({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.5)).toEqual({ x: 5, y: 5 });
    expect(v.angle({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 6);
    const r = v.rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(1, 6);
    expect(v.perpendicular({ x: 3, y: 4 })).toEqual({ x: -4, y: 3 });
  });
});
