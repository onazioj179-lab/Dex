// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { interpolateAt, sampleRange, keyframeBounds } from '../../src/shared/creative/keyframe';

const KEYS = [{ t: 0, value: 0 }, { t: 10, value: 100 }];

describe('keyframe interpolation', () => {
  it('interpolates linearly between keys', () => {
    expect(interpolateAt(KEYS, 5)).toBe(50);
    expect(interpolateAt(KEYS, 2.5)).toBe(25);
  });

  it('holds at endpoints (no extrapolation)', () => {
    expect(interpolateAt(KEYS, -5)).toBe(0);
    expect(interpolateAt(KEYS, 15)).toBe(100);
    expect(interpolateAt([], 5)).toBe(0);
    expect(interpolateAt([{ t: 3, value: 42 }], 99)).toBe(42);
  });

  it('applies per-segment easing to local progress', () => {
    const keys = [{ t: 0, value: 0, ease: (x: number) => x * x }, { t: 10, value: 100 }];
    expect(interpolateAt(keys, 5)).toBe(25); // 0.5^2 * 100
  });

  it('sorts unordered keyframes', () => {
    expect(interpolateAt([{ t: 10, value: 100 }, { t: 0, value: 0 }], 5)).toBe(50);
  });

  it('samples a range', () => {
    expect(sampleRange(KEYS, 0, 10, 3)).toEqual([0, 50, 100]);
    expect(sampleRange(KEYS, 0, 10, 1)).toEqual([0]);
    expect(sampleRange(KEYS, 0, 10, 0)).toEqual([]);
  });

  it('computes bounds', () => {
    expect(keyframeBounds([{ t: 8, value: 1 }, { t: 2, value: 2 }])).toEqual([2, 8]);
    expect(keyframeBounds([])).toBeNull();
  });
});
