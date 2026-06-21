// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Smart Mask — luminosity masking (pure).
import { describe, it, expect } from 'vitest';
import { buildLuminanceMask, buildBandMask, luma709, LUMA_BANDS } from '../../src/shared/creative/luminanceMask';

// Helper: RGBA buffer from a list of gray levels.
function grays(levels: number[]): number[] {
  const out: number[] = [];
  for (const v of levels) out.push(v, v, v, 255);
  return out;
}

describe('luminanceMask', () => {
  it('luma709 is exact for pure white/black/gray', () => {
    expect(luma709(0, 0, 0)).toBeCloseTo(0, 6);
    expect(luma709(255, 255, 255)).toBeCloseTo(255, 6);
    expect(luma709(128, 128, 128)).toBeCloseTo(128, 6);
  });

  it('selects only pixels whose luma is within range', () => {
    const data = grays([0, 100, 200, 255]);
    const mask = buildLuminanceMask(data, 4, 90, 210);
    expect(Array.from(mask)).toEqual([0, 255, 255, 0]);
  });

  it('shadows band selects dark pixels, highlights selects bright', () => {
    const data = grays([10, 128, 240]);
    const sh = buildBandMask(data, 3, 'shadows');
    const hi = buildBandMask(data, 3, 'highlights');
    expect(sh[0]).toBe(255); expect(sh[2]).toBe(0);
    expect(hi[2]).toBe(255); expect(hi[0]).toBe(0);
  });

  it('the three bands partition the 0..255 range without gaps or overlap', () => {
    // Every luma 0..255 belongs to exactly one band.
    for (let v = 0; v <= 255; v++) {
      const inBands = (['shadows', 'midtones', 'highlights'] as const)
        .filter(b => v >= LUMA_BANDS[b][0] && v <= LUMA_BANDS[b][1]);
      expect(inBands.length).toBe(1);
    }
  });

  it('mask length matches pixel count', () => {
    const data = grays([0, 50, 100, 150, 200]);
    expect(buildLuminanceMask(data, 5, 0, 255).length).toBe(5);
  });
});
