// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Dynamic Range Studio — HDR tone mapping (pure).
import { describe, it, expect } from 'vitest';
import { reinhard, acesFilmic, toneMapValue, toneMapRgb } from '../../src/shared/creative/toneMap';

describe('tone mapping', () => {
  it('reinhard maps 0->0, 1->0.5 and approaches 1', () => {
    expect(reinhard(0)).toBeCloseTo(0, 6);
    expect(reinhard(1)).toBeCloseTo(0.5, 6);
    expect(reinhard(1e6)).toBeGreaterThan(0.999);
    expect(reinhard(1e6)).toBeLessThanOrEqual(1);
  });

  it('compresses HDR values (>1) into display range (<=1)', () => {
    for (const x of [1.5, 4, 10, 100]) {
      expect(reinhard(x)).toBeLessThanOrEqual(1);
      expect(acesFilmic(x)).toBeLessThanOrEqual(1);
    }
  });

  it('operators are monotonic non-decreasing', () => {
    let pr = -1, pa = -1;
    for (let x = 0; x <= 8; x += 0.25) {
      const r = reinhard(x), a = acesFilmic(x);
      expect(r).toBeGreaterThanOrEqual(pr);
      expect(a).toBeGreaterThanOrEqual(pa);
      pr = r; pa = a;
    }
  });

  it('none clamps to 0..1', () => {
    expect(toneMapValue(-0.2, 'none')).toBe(0);
    expect(toneMapValue(0.5, 'none')).toBe(0.5);
    expect(toneMapValue(3, 'none')).toBe(1);
  });

  it('exposure scales input before mapping', () => {
    // +1 stop doubles the linear value, so reinhard(0.5*2)=reinhard(1)=0.5.
    const [r] = toneMapRgb(0.5, 0.5, 0.5, 'reinhard', 1);
    expect(r).toBeCloseTo(0.5, 6);
    // -1 stop halves it to 0.25: reinhard(0.25) = 0.25/1.25 = 0.2.
    const [r2] = toneMapRgb(0.5, 0.5, 0.5, 'reinhard', -1);
    expect(r2).toBeCloseTo(0.2, 6);
  });

  it('aces never returns out-of-range values', () => {
    for (const x of [0, 0.5, 1, 5, 50]) {
      const v = acesFilmic(x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
