// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { resampleImage, upscaleByFactor } from '../../src/shared/creative/resample';

/** Build a solid-colour RGBA image. */
function solid(w: number, h: number, [r, g, b, a]: [number, number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a; }
  return out;
}

describe('resample.resampleImage (#167 real upscale engine)', () => {
  it('upscales a solid colour without shifting it (weights normalise to 1)', () => {
    const src = solid(2, 2, [255, 0, 0, 255]);
    const out = resampleImage(src, 2, 2, 4, 4, 'lanczos3');
    expect(out.length).toBe(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      expect(out[i * 4]).toBe(255);     // R
      expect(out[i * 4 + 1]).toBe(0);   // G
      expect(out[i * 4 + 2]).toBe(0);   // B
      expect(out[i * 4 + 3]).toBe(255); // A
    }
  });

  it('upscales 1×1 to N×N keeping the single colour', () => {
    const out = resampleImage(solid(1, 1, [10, 20, 30, 40]), 1, 1, 3, 3, 'lanczos3');
    expect(out.length).toBe(3 * 3 * 4);
    for (let i = 0; i < 9; i++) {
      expect([out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]]).toEqual([10, 20, 30, 40]);
    }
  });

  it('bilinear downscale of a 2-colour image averages toward the middle', () => {
    // left column black, right column white, 2x1 -> 1x1 should be ~mid grey.
    const src = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const out = resampleImage(src, 2, 1, 1, 1, 'bilinear');
    expect(out[0]).toBeGreaterThan(100);
    expect(out[0]).toBeLessThan(155);
  });

  it('interpolated edge between two colours is monotonic (real interpolation)', () => {
    // 2x1: black | white, upscaled to 6x1 — values should rise left→right.
    const src = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const out = resampleImage(src, 2, 1, 6, 1, 'bilinear');
    const reds = [0, 1, 2, 3, 4, 5].map(x => out[x * 4]);
    for (let i = 1; i < reds.length; i++) expect(reds[i]).toBeGreaterThanOrEqual(reds[i - 1]);
    expect(reds[0]).toBeLessThan(reds[5]);
  });

  it('guards degenerate sizes', () => {
    expect(resampleImage(solid(1, 1, [0, 0, 0, 0]), 0, 1, 2, 2).length).toBe(0);
  });
});

describe('resample.upscaleByFactor', () => {
  it('doubles dimensions at 2×', () => {
    const { data, width, height } = upscaleByFactor(solid(3, 2, [1, 2, 3, 255]), 3, 2, 2);
    expect(width).toBe(6);
    expect(height).toBe(4);
    expect(data.length).toBe(6 * 4 * 4);
    expect([data[0], data[1], data[2], data[3]]).toEqual([1, 2, 3, 255]);
  });
});
