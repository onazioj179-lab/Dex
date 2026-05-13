// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  erf,
  erfc,
  lambertW0,
  besselJ0,
  gammaLanczos,
  lnGamma,
  digamma,
  polyGcd,
  polyDivide,
  zScoreNormalize,
  minMaxNormalize,
  robustScale,
} from '../../src/renderer/improvements500';

describe('improvements500 Wave 45', () => {
  it('erf matches known values', () => {
    expect(Math.abs(erf(0))).toBeLessThan(1e-9);
    expect(erf(1)).toBeCloseTo(0.8427, 3);
    expect(erfc(1)).toBeCloseTo(1 - 0.8427, 3);
  });

  it('lambertW0(x*e^x) ~ x for x in (-1, 1)', () => {
    for (const x of [0.1, 0.5, 0.9, 1.5, 5]) {
      const y = x * Math.exp(x);
      expect(lambertW0(y)).toBeCloseTo(x, 6);
    }
  });

  it('besselJ0 known values', () => {
    expect(besselJ0(0)).toBeCloseTo(1, 6);
    expect(besselJ0(1)).toBeCloseTo(0.7651976866, 6);
    expect(Math.abs(besselJ0(2.4048))).toBeLessThan(1e-3);
  });

  it('gammaLanczos and lnGamma', () => {
    expect(gammaLanczos(5)).toBeCloseTo(24, 6);
    expect(gammaLanczos(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 6);
    expect(lnGamma(10)).toBeCloseTo(Math.log(362880), 6);
  });

  it('digamma values', () => {
    // psi(1) = -gamma = -0.5772156649
    expect(digamma(1)).toBeCloseTo(-0.5772156649, 4);
    expect(digamma(2)).toBeCloseTo(1 - 0.5772156649, 4);
  });

  it('polyGcd of (x^2-1) and (x-1) is (x-1)', () => {
    // ascending coeffs: x^2 - 1 = [-1, 0, 1]; x - 1 = [-1, 1]
    const g = polyGcd([-1, 0, 1], [-1, 1]);
    // monic of (x - 1): [-1, 1]
    expect(g).toHaveLength(2);
    expect(g[1]).toBeCloseTo(1, 6);
    expect(g[0]).toBeCloseTo(-1, 6);
  });

  it('polyDivide produces correct quotient and remainder', () => {
    // (x^2 + 2x + 1) / (x + 1) -> q = x + 1, r = 0
    const r = polyDivide([1, 2, 1], [1, 1]);
    expect(r.quotient[0]).toBeCloseTo(1, 6);
    expect(r.quotient[1]).toBeCloseTo(1, 6);
    expect(Math.abs(r.remainder[0]!)).toBeLessThan(1e-9);
  });

  it('zScoreNormalize produces zero mean and unit variance', () => {
    const r = zScoreNormalize([1, 2, 3, 4, 5]);
    const mean = r.values.reduce((a, b) => a + b, 0) / r.values.length;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });

  it('minMaxNormalize maps to [0, 1]', () => {
    const r = minMaxNormalize([1, 2, 3, 4, 5]);
    expect(r.values[0]).toBeCloseTo(0, 9);
    expect(r.values[r.values.length - 1]).toBeCloseTo(1, 9);
  });

  it('robustScale uses median and MAD', () => {
    const r = robustScale([1, 2, 3, 4, 100]);
    expect(r.median).toBe(3);
    expect(r.mad).toBeGreaterThan(0);
  });
});
