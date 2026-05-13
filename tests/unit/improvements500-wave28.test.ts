// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  circleCircleIntersect,
  polynomialDiv,
  hornerEval,
  continuedFraction,
  sternBrocotPath,
  sternBrocotFromPath,
  lz77Encode,
  lz77Decode,
  toRoman,
  fromRoman,
  parseDuration,
  formatDurationShort,
  Kalman1D,
  deCasteljauCubic,
  sampleCubicBezier,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 28', () => {
  it('circleCircleIntersect - two intersection points and disjoint case', () => {
    const r = circleCircleIntersect(0, 0, 5, 8, 0, 5);
    expect(r).not.toBeNull();
    // Symmetric across x-axis
    expect(r!.a.x).toBeCloseTo(4, 6);
    expect(r!.b.x).toBeCloseTo(4, 6);
    expect(r!.a.y).toBeCloseTo(3, 6);
    expect(r!.b.y).toBeCloseTo(-3, 6);

    expect(circleCircleIntersect(0, 0, 1, 100, 0, 1)).toBeNull();
    expect(circleCircleIntersect(0, 0, 1, 0, 0, 1)).toBeNull(); // concentric
  });

  it('polynomialDiv - (x^3 - 1) / (x - 1) = x^2 + x + 1', () => {
    const num = [-1, 0, 0, 1]; // -1 + 0x + 0x^2 + x^3
    const den = [-1, 1]; // -1 + x
    const { quotient, remainder } = polynomialDiv(num, den);
    expect(quotient).toEqual([1, 1, 1]);
    expect(remainder.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(remainder[0]!)).toBeLessThan(1e-9);
  });

  it('hornerEval - matches direct evaluation', () => {
    // 2 + 3x + x^2 at x=4 -> 2 + 12 + 16 = 30
    expect(hornerEval([2, 3, 1], 4)).toBe(30);
    expect(hornerEval([], 5)).toBe(0);
  });

  it('continuedFraction - golden ratio coefficients', () => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const cf = continuedFraction(phi, 10);
    expect(cf.coeffs.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
    const last = cf.convergents[cf.convergents.length - 1]!;
    expect(Math.abs(last.num / last.den - phi)).toBeLessThan(1e-3);
  });

  it('sternBrocot - path round-trip for 5/7', () => {
    const path = sternBrocotPath(5, 7);
    const r = sternBrocotFromPath(path);
    expect(r.num).toBe(5);
    expect(r.den).toBe(7);
  });

  it('lz77Encode + lz77Decode - round-trip with repeated pattern', () => {
    const text = 'the quick brown fox jumps over the lazy dog. the quick brown fox.';
    const data = new TextEncoder().encode(text);
    const tokens = lz77Encode(data);
    const round = lz77Decode(tokens);
    expect(new TextDecoder().decode(round)).toBe(text);
  });

  it('Roman numerals - round-trip for sample values', () => {
    const samples = [1, 4, 9, 14, 40, 90, 400, 900, 1994, 3999];
    for (const n of samples) {
      expect(fromRoman(toRoman(n))).toBe(n);
    }
    expect(toRoman(1994)).toBe('MCMXCIV');
  });

  it('parseDuration / formatDuration', () => {
    expect(parseDuration('1h30m')).toBe(90 * 60_000);
    expect(parseDuration('45s')).toBe(45_000);
    expect(parseDuration('2d 3h')).toBe(2 * 86_400_000 + 3 * 3_600_000);
    expect(parseDuration('500ms')).toBe(500);
    expect(formatDurationShort(90 * 60_000)).toBe('1h30m');
    expect(formatDurationShort(0)).toBe('0s');
    expect(() => parseDuration('garbage')).toThrow();
  });

  it('Kalman1D - converges toward true value with noisy measurements', () => {
    const k = new Kalman1D({ x: 0, p: 1, q: 1e-4, r: 1e-2 });
    const truth = 5;
    let last = 0;
    for (let i = 0; i < 50; i += 1) {
      const noise = (Math.sin(i * 7) + Math.cos(i * 13)) * 0.05;
      last = k.update(truth + noise);
    }
    expect(Math.abs(last - truth)).toBeLessThan(0.2);
  });

  it('deCasteljauCubic - interpolates endpoints exactly', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 1, y: 2 };
    const p2 = { x: 3, y: 2 };
    const p3 = { x: 4, y: 0 };
    const a = deCasteljauCubic(p0, p1, p2, p3, 0);
    const b = deCasteljauCubic(p0, p1, p2, p3, 1);
    expect(a).toEqual(p0);
    expect(b).toEqual(p3);
    const samples = sampleCubicBezier(p0, p1, p2, p3, 4);
    expect(samples.length).toBe(5);
    expect(samples[0]).toEqual(p0);
    expect(samples[4]).toEqual(p3);
  });
});
