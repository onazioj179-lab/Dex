// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  base85Encode,
  base85Decode,
  bwtTransform,
  bwtInverse,
  constantTimeEqual,
  rgbToOklab,
  oklabToRgb,
  kahanSum,
  neumaierSum,
  percentileLinear,
  MultiMap,
  Tfidf,
  simpsonsRule,
  trapezoidRule,
  newtonRaphson,
  bisection,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 36', () => {
  it('base85 round trip', () => {
    const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const enc = base85Encode(data);
    const dec = base85Decode(enc);
    expect(Array.from(dec)).toEqual(Array.from(data));
  });

  it('BWT round trip', () => {
    const data = new Uint8Array([66, 65, 78, 65, 78, 65]); // "BANANA"
    const f = bwtTransform(data);
    const inv = bwtInverse(f);
    expect(Array.from(inv)).toEqual(Array.from(data));
  });

  it('constantTimeEqual matches', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('Oklab round trip', () => {
    const c = rgbToOklab(0.5, 0.25, 0.75);
    const back = oklabToRgb(c);
    expect(Math.abs(back.r - 0.5)).toBeLessThan(1e-6);
    expect(Math.abs(back.g - 0.25)).toBeLessThan(1e-6);
    expect(Math.abs(back.b - 0.75)).toBeLessThan(1e-6);
  });

  it('compensated sums match large series', () => {
    const arr = new Array(10000).fill(0).map((_, i) => 1 / (i + 1));
    const naive = arr.reduce((a, b) => a + b, 0);
    expect(kahanSum(arr)).toBeCloseTo(naive, 8);
    expect(neumaierSum(arr)).toBeCloseTo(naive, 8);
  });

  it('percentile interpolates', () => {
    expect(percentileLinear([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentileLinear([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentileLinear([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentileLinear([1, 2, 3, 4, 5], 1)).toBe(5);
  });

  it('MultiMap basics', () => {
    const m = new MultiMap<string, number>();
    m.add('a', 1);
    m.add('a', 2);
    m.add('b', 9);
    expect(m.size).toBe(3);
    expect(Array.from(m.get('a'))).toEqual([1, 2]);
    m.delete('a', 1);
    expect(Array.from(m.get('a'))).toEqual([2]);
  });

  it('Tfidf ranks matching doc highest', () => {
    const t = new Tfidf();
    t.addDocument(['cats', 'and', 'dogs']);
    t.addDocument(['the', 'fox', 'jumps']);
    t.addDocument(['cats', 'are', 'great']);
    const r = t.query(['cats']);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].docId).toBeOneOf([0, 2]);
  });

  it("Simpson's rule integrates x^2 on [0,1]", () => {
    expect(simpsonsRule((x) => x * x, 0, 1, 100)).toBeCloseTo(1 / 3, 8);
    expect(trapezoidRule((x) => x * x, 0, 1, 1000)).toBeCloseTo(1 / 3, 4);
  });

  it('newtonRaphson + bisection find sqrt(2)', () => {
    const r1 = newtonRaphson((x) => x * x - 2, (x) => 2 * x, 1);
    expect(r1).not.toBeNull();
    expect(Math.abs(r1! - Math.SQRT2)).toBeLessThan(1e-10);
    const r2 = bisection((x) => x * x - 2, 0, 2);
    expect(r2).not.toBeNull();
    expect(Math.abs(r2! - Math.SQRT2)).toBeLessThan(1e-9);
  });
});
