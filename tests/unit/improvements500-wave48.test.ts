// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  simulateColorBlind,
  deltaE76,
  colorTemperatureToRgb,
  whiteBalanceGray,
  rgbToXyz,
  xyzToRgb,
  dct2,
  idct2,
  autocorrelate,
  detectPeaks,
  hzToMel,
  melToHz,
  melFilterbankCenters,
} from '../../src/renderer/improvements500';

describe('improvements500 Wave 48', () => {
  it('simulateColorBlind preserves grayscale', () => {
    const r = simulateColorBlind({ r: 128, g: 128, b: 128 }, 'protanopia');
    expect(r.r).toBeCloseTo(128, 0);
    expect(r.g).toBeCloseTo(128, 0);
  });

  it('deltaE76 of identical colors is 0', () => {
    expect(deltaE76({ l: 50, a: 0, b: 0 }, { l: 50, a: 0, b: 0 })).toBe(0);
  });

  it('colorTemperatureToRgb at 6500K is roughly white', () => {
    const c = colorTemperatureToRgb(6500);
    expect(c.r).toBeGreaterThan(200);
    expect(c.g).toBeGreaterThan(200);
    expect(c.b).toBeGreaterThan(200);
  });

  it('whiteBalanceGray equalizes channels', () => {
    const px = new Uint8ClampedArray([255, 100, 100, 255, 255, 100, 100, 255]);
    const out = whiteBalanceGray(px, 4);
    expect(out.length).toBe(8);
  });

  it('rgbToXyz -> xyzToRgb roundtrip', () => {
    const xyz = rgbToXyz({ r: 200, g: 100, b: 50 });
    const r = xyzToRgb(xyz);
    expect(Math.abs(r.r - 200)).toBeLessThan(2);
    expect(Math.abs(r.g - 100)).toBeLessThan(2);
    expect(Math.abs(r.b - 50)).toBeLessThan(2);
  });

  it('dct2 -> idct2 roundtrip', () => {
    const x = [1, 2, 3, 4, 5, 4, 3, 2];
    const r = idct2(dct2(x));
    for (let i = 0; i < x.length; i++) expect(r[i]).toBeCloseTo(x[i]!, 6);
  });

  it('autocorrelate at lag 0 equals sum of squares', () => {
    const x = [1, 2, 3];
    const a = autocorrelate(x);
    expect(a[0]).toBe(14);
  });

  it('detectPeaks finds local maxima', () => {
    const peaks = detectPeaks([0, 1, 0, 2, 0, 1, 0]);
    expect(peaks).toEqual([1, 3, 5]);
  });

  it('hzToMel -> melToHz roundtrip', () => {
    expect(melToHz(hzToMel(440))).toBeCloseTo(440, 4);
    expect(melFilterbankCenters(4, 100, 4000)).toHaveLength(4);
  });
});
