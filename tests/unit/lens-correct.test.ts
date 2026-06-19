// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Prism lens correction + chromatic aberration (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { applyLensCorrection } from '../../src/shared/creative/lensCorrect';

// Build a width x height RGBA buffer from a per-pixel painter.
function makeImage(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return data;
}

describe('applyLensCorrection', () => {
  it('is the identity transform when all options are zero', () => {
    const src = makeImage(5, 5, (x, y) => [x * 10, y * 10, (x + y) * 5, 255]);
    const out = applyLensCorrection(src, 5, 5, {});
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  it('keeps R/G/B aligned when chromatic is zero (a gray ramp stays gray)', () => {
    // Gray ramp: each pixel R=G=B. No CA -> output stays neutral (R===G===B).
    const src = makeImage(9, 9, (x) => [x * 20, x * 20, x * 20, 255]);
    const out = applyLensCorrection(src, 9, 9, { chromatic: 0 });
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(out[i + 1]);
      expect(out[i + 1]).toBe(out[i + 2]);
    }
  });

  it('separates R and B channels when chromatic is non-zero', () => {
    // Horizontal gray ramp so a radial channel shift changes R vs B somewhere.
    const src = makeImage(9, 9, (x) => [x * 28, x * 28, x * 28, 255]);
    const out = applyLensCorrection(src, 9, 9, { chromatic: 0.6 });
    let separated = false;
    for (let i = 0; i < out.length; i += 4) {
      if (out[i] !== out[i + 2]) { separated = true; break; }
    }
    expect(separated).toBe(true);
  });

  it('darkens edges more than the centre with a negative vignette', () => {
    const src = makeImage(11, 11, () => [200, 200, 200, 255]);
    const out = applyLensCorrection(src, 11, 11, { vignette: -0.8 });
    const centre = out[(5 * 11 + 5) * 4];     // middle pixel
    const corner = out[0];                      // top-left pixel
    expect(corner).toBeLessThan(centre);
  });
});
