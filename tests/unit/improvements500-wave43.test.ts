// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  brentRoot,
  goldenSectionMin,
  rombergIntegrate,
  gaussLegendreIntegrate,
  chebyshevT,
  clenshawChebyshev,
  legendreP,
  rayTriangleIntersect,
  minimumEnclosingCircle,
  rodriguesRotate,
  bernsteinBasis,
  bernsteinEval,
  binomial,
} from '../../src/renderer/improvements500';

describe('improvements500 Wave 43', () => {
  it('brentRoot finds zero of cos on [0, pi]', () => {
    const r = brentRoot(Math.cos, 0, Math.PI);
    expect(Math.abs(r - Math.PI / 2)).toBeLessThan(1e-9);
  });

  it('goldenSectionMin minimizes (x-3)^2', () => {
    const x = goldenSectionMin((v) => (v - 3) * (v - 3), -10, 10);
    expect(Math.abs(x - 3)).toBeLessThan(1e-6);
  });

  it('rombergIntegrate integrates sin on [0, pi] = 2', () => {
    const v = rombergIntegrate(Math.sin, 0, Math.PI, 6);
    expect(Math.abs(v - 2)).toBeLessThan(1e-8);
  });

  it('gaussLegendreIntegrate integrates x^2 on [0, 1] = 1/3', () => {
    const v = gaussLegendreIntegrate((x) => x * x, 0, 1, 5);
    expect(Math.abs(v - 1 / 3)).toBeLessThan(1e-12);
  });

  it('chebyshevT and Clenshaw agree', () => {
    expect(chebyshevT(4, 0.5)).toBeCloseTo(8 * 0.5 ** 4 - 8 * 0.5 ** 2 + 1, 12);
    // Series with single coefficient: clenshaw([0,0,0,0,1], x) = T_4(x).
    expect(clenshawChebyshev([0, 0, 0, 0, 1], 0.5)).toBeCloseTo(chebyshevT(4, 0.5), 12);
  });

  it('legendreP(2, x) = 0.5*(3x^2 - 1)', () => {
    expect(legendreP(2, 0.7)).toBeCloseTo(0.5 * (3 * 0.49 - 1), 12);
  });

  it('rayTriangleIntersect hits and misses', () => {
    const hit = rayTriangleIntersect(
      { x: 0.25, y: 0.25, z: -1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(1, 12);
    const miss = rayTriangleIntersect(
      { x: 2, y: 2, z: -1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    expect(miss).toBeNull();
  });

  it('minimumEnclosingCircle covers all points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
      { x: 2, y: 1 },
    ];
    const c = minimumEnclosingCircle(pts);
    for (const p of pts) {
      expect(Math.hypot(p.x - c.cx, p.y - c.cy)).toBeLessThanOrEqual(c.r + 1e-6);
    }
  });

  it('rodriguesRotate rotates +x to +y around +z by pi/2', () => {
    const v = rodriguesRotate({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Math.PI / 2);
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.y).toBeCloseTo(1, 12);
    expect(v.z).toBeCloseTo(0, 12);
  });

  it('bernsteinBasis sums to 1 and bernsteinEval matches binomial expansion', () => {
    const n = 4;
    const t = 0.3;
    let sum = 0;
    for (let i = 0; i <= n; i++) sum += bernsteinBasis(i, n, t);
    expect(sum).toBeCloseTo(1, 12);
    expect(binomial(6, 2)).toBe(15);
    // For coeffs all 1, sum = 1.
    expect(bernsteinEval([1, 1, 1, 1, 1], t)).toBeCloseTo(1, 12);
  });
});
