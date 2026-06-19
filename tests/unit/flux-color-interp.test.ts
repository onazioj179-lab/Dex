// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Flux's linear-light hex color interpolation (v6 Track G) -- the engine
// previously stepped colors; now it tweens them smoothly.

import { describe, it, expect } from 'vitest';
import { isHexColor, lerpHexColor } from '../../src/renderer/DEXAPPLICATIONS/flux/FluxAnimation';

describe('isHexColor', () => {
  it('accepts #rrggbb only', () => {
    expect(isHexColor('#ffffff')).toBe(true);
    expect(isHexColor('#00AaFf')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('rgb(0,0,0)')).toBe(false);
  });
});

describe('lerpHexColor (linear-light)', () => {
  it('returns the endpoints exactly at t=0 and t=1', () => {
    expect(lerpHexColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpHexColor('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('black->white midpoint is neutral grey and BRIGHTER than naive 0x80 (linear-light)', () => {
    const mid = lerpHexColor('#000000', '#ffffff', 0.5);
    const r = parseInt(mid.slice(1, 3), 16);
    const g = parseInt(mid.slice(3, 5), 16);
    const b = parseInt(mid.slice(5, 7), 16);
    expect(r).toBe(g);
    expect(g).toBe(b);            // neutral grey
    expect(r).toBeGreaterThan(0x80); // linear-light mid (~188) is brighter than naive 128
    expect(r).toBeGreaterThanOrEqual(185);
    expect(r).toBeLessThanOrEqual(191);
  });

  it('a color interpolated with itself is unchanged', () => {
    expect(lerpHexColor('#3366cc', '#3366cc', 0.5)).toBe('#3366cc');
  });
});
