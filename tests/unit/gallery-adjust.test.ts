// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { applyAdjustments, NEUTRAL, isNeutral, normalizeAdjustments, EditHistory, type Adjustments } from '../../src/renderer/pages/galleryAdjust';

const px = (...rgb: number[][]) => new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 200]));
const run = (input: Uint8ClampedArray, a: Partial<Adjustments>) => { const out = input.slice(); applyAdjustments(out, { ...NEUTRAL, ...a }); return out; };
const luma = (p: Uint8ClampedArray, i: number) => 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];

describe('gallery adjustments', () => {
  const sample = px([20, 30, 40], [128, 128, 128], [230, 220, 210], [200, 40, 60]);

  it('neutral is the identity and alpha is never touched', () => {
    expect(run(sample, {})).toEqual(sample);
    const out = run(sample, { exposure: 40, saturation: -100 });
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(200);
  });

  it('exposure brightens in stops; negative darkens', () => {
    expect(luma(run(sample, { exposure: 50 }), 4)).toBeGreaterThan(luma(sample, 4) + 30);
    expect(luma(run(sample, { exposure: -50 }), 4)).toBeLessThan(luma(sample, 4) - 30);
  });

  it('temperature is a white-balance shift, not a sepia/hue filter', () => {
    const warm = run(px([128, 128, 128]), { temperature: 80 });
    expect(warm[0]).toBeGreaterThan(128);
    expect(warm[2]).toBeLessThan(128);
    const cool = run(px([128, 128, 128]), { temperature: -80 });
    expect(cool[2]).toBeGreaterThan(cool[0]);
  });

  it('highlights act on bright tones, shadows on dark tones', () => {
    const dark = 0, bright = 8;
    const h = run(sample, { highlights: -100 });
    expect(luma(sample, bright) - luma(h, bright)).toBeGreaterThan(8);
    expect(Math.abs(luma(sample, dark) - luma(h, dark))).toBeLessThan(2);
    const s = run(sample, { shadows: 100 });
    expect(luma(s, dark) - luma(sample, dark)).toBeGreaterThan(8);
    expect(Math.abs(luma(s, bright) - luma(sample, bright))).toBeLessThan(3);
  });

  it('saturation -100 is grayscale; contrast spreads tones', () => {
    const g = run(sample, { saturation: -100 });
    expect(Math.max(g[12], g[13], g[14]) - Math.min(g[12], g[13], g[14])).toBeLessThanOrEqual(1);
    const c = run(sample, { contrast: 60 });
    expect(luma(c, 8) - luma(c, 0)).toBeGreaterThan(luma(sample, 8) - luma(sample, 0));
  });

  it('reads old stored adjustments and clamps junk', () => {
    expect(normalizeAdjustments({ e: 10, c: 20, s: 30, t: 40 })).toMatchObject({ exposure: 10, contrast: 20, saturation: 30, temperature: 40, highlights: 0 });
    expect(normalizeAdjustments({ exposure: 999, shadows: 'x' })).toMatchObject({ exposure: 100, shadows: 0 });
    expect(isNeutral(normalizeAdjustments(null))).toBe(true);
  });

  it('history undoes and redoes, and a new edit clears redo', () => {
    const h = new EditHistory({ v: 0 });
    h.push({ v: 1 }); h.push({ v: 2 }); h.push({ v: 2 });
    expect(h.undo()).toEqual({ v: 1 });
    expect(h.undo()).toEqual({ v: 0 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual({ v: 1 });
    h.push({ v: 5 });
    expect(h.canRedo).toBe(false);
    expect(h.current).toEqual({ v: 5 });
  });
});
