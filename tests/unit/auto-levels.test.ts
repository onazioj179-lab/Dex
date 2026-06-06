// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { autoLevels } from '../../src/shared/creative/autoLevels';

describe('autoLevels (#174 real auto-contrast engine)', () => {
  it('stretches a low-contrast channel to the full range', () => {
    // 4x1, red values bunched in [100,150]; alpha 255, no green/blue.
    const src = new Uint8ClampedArray([
      100, 0, 0, 255,
      110, 0, 0, 255,
      140, 0, 0, 255,
      150, 0, 0, 255,
    ]);
    const out = autoLevels(src, 4, 1, { clipPercent: 0 });
    expect(out[0]).toBe(0);       // darkest red -> 0
    expect(out[12]).toBe(255);    // brightest red -> 255
    expect(out[4]).toBeGreaterThan(0);
    expect(out[8]).toBeLessThan(255);
    // alpha preserved
    expect(out[3]).toBe(255);
  });

  it('leaves a flat (single-value) channel unchanged', () => {
    const src = new Uint8ClampedArray([128, 64, 32, 255, 128, 64, 32, 255]);
    const out = autoLevels(src, 2, 1, { clipPercent: 0 });
    expect(Array.from(out.slice(0, 4))).toEqual([128, 64, 32, 255]);
    expect(Array.from(out.slice(4, 8))).toEqual([128, 64, 32, 255]);
  });

  it('preserves dimensions and guards empty input', () => {
    expect(autoLevels(new Uint8ClampedArray(16), 2, 2).length).toBe(16);
    expect(autoLevels(new Uint8ClampedArray(0), 0, 0).length).toBe(0);
  });
});
