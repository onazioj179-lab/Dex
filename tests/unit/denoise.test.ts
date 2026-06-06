// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { medianDenoise, denoiseImage } from '../../src/shared/creative/denoise';

/** RGBA helpers over a flat array. */
function px(buf: ArrayLike<number>, w: number, x: number, y: number): [number, number, number, number] {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}
function fill(w: number, h: number, v: number, a = 255): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = a; }
  return out;
}

describe('denoise.medianDenoise (#170 real edge-preserving engine)', () => {
  it('removes an impulse-noise outlier (median of a uniform field)', () => {
    const w = 5, h = 5;
    const img = fill(w, h, 128);
    // inject a single bright "hot" pixel in the middle
    const c = (2 * w + 2) * 4;
    img[c] = 255; img[c + 1] = 255; img[c + 2] = 255;
    const out = medianDenoise(img, w, h, 1);
    expect(px(out, w, 2, 2)).toEqual([128, 128, 128, 255]); // outlier corrected
  });

  it('preserves a hard edge (does not blur like a Gaussian)', () => {
    const w = 6, h = 3;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x < 3 ? 0 : 255;
        const i = (y * w + x) * 4;
        img[i] = v; img[i + 1] = v; img[i + 2] = v; img[i + 3] = 255;
      }
    }
    const out = medianDenoise(img, w, h, 1);
    // pixels well inside each region keep their exact value — edge stays crisp
    expect(px(out, w, 0, 1)[0]).toBe(0);
    expect(px(out, w, 5, 1)[0]).toBe(255);
  });

  it('preserves alpha and dimensions', () => {
    const out = medianDenoise(fill(4, 4, 100, 200), 4, 4, 1);
    expect(out.length).toBe(4 * 4 * 4);
    expect(px(out, 4, 1, 1)[3]).toBe(200);
  });

  it('guards degenerate sizes', () => {
    expect(medianDenoise(new Uint8ClampedArray(0), 0, 0).length).toBe(0);
  });
});

describe('denoise.denoiseImage (multi-pass)', () => {
  it('runs multiple passes and stays uniform on a flat field', () => {
    const out = denoiseImage(fill(5, 5, 64), 5, 5, { radius: 1, passes: 3 });
    expect(px(out, 5, 2, 2)).toEqual([64, 64, 64, 255]);
  });
});
