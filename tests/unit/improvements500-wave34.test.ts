// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  SegTree2D,
  crt,
  extendedEuclidean,
  tonelliShanks,
  babyStepGiantStep,
  nttMultiply,
  PointQuadtree,
  lagrangeInterpolate,
  fwht,
  modPowBig,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 34', () => {
  it('SegTree2D point update + range sum', () => {
    const t = new SegTree2D(4, 4);
    t.update(0, 0, 5);
    t.update(2, 3, 7);
    t.update(1, 1, 3);
    expect(t.rangeSum(0, 0, 1, 1)).toBe(8);
    expect(t.rangeSum(0, 0, 3, 3)).toBe(15);
  });

  it('crt solves classic system', () => {
    const r = crt([2n, 3n, 2n], [3n, 5n, 7n]);
    expect(r).not.toBeNull();
    expect(r!.remainder).toBe(23n);
    expect(r!.modulus).toBe(105n);
  });

  it('extendedEuclidean satisfies Bezout', () => {
    const { g, x, y } = extendedEuclidean(240n, 46n);
    expect(g).toBe(2n);
    expect(240n * x + 46n * y).toBe(2n);
  });

  it('tonelliShanks finds modular sqrt', () => {
    const r = tonelliShanks(10n, 13n);
    expect(r).not.toBeNull();
    expect((r! * r!) % 13n).toBe(10n % 13n);
  });

  it('babyStepGiantStep finds discrete log', () => {
    // 2^x = 22 mod 29
    const x = babyStepGiantStep(2n, 22n, 29n);
    expect(x).not.toBeNull();
    let p = 1n;
    for (let i = 0n; i < x!; i++) p = (p * 2n) % 29n;
    expect(p).toBe(22n);
  });

  it('nttMultiply matches schoolbook', () => {
    const a = [1n, 2n, 3n];
    const b = [4n, 5n, 6n];
    const out = nttMultiply(a, b);
    expect(out[0]).toBe(4n);
    expect(out[1]).toBe(13n);
    expect(out[2]).toBe(28n);
    expect(out[3]).toBe(27n);
    expect(out[4]).toBe(18n);
  });

  it('PointQuadtree insert + query', () => {
    const q = new PointQuadtree(0, 0, 100, 100);
    q.insert({ x: 10, y: 10 });
    q.insert({ x: 20, y: 20 });
    q.insert({ x: 80, y: 80 });
    const found = q.query({ x: 0, y: 0, w: 50, h: 50 });
    expect(found.length).toBe(2);
  });

  it('lagrangeInterpolate matches polynomial', () => {
    // f(x)=x^2: at 0,1,2 -> 0,1,4
    const v = lagrangeInterpolate([0, 1, 2], [0, 1, 4], 3);
    expect(Math.abs(v - 9)).toBeLessThan(1e-9);
  });

  it('fwht inverse round-trips', () => {
    const a = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const orig = a.slice();
    fwht(a, false);
    fwht(a, true);
    for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - orig[i])).toBeLessThan(1e-9);
  });

  it('modPowBig 2^10 mod 1000', () => {
    expect(modPowBig(2n, 10n, 1000n)).toBe(24n);
    expect(modPowBig(7n, 256n, 13n)).toBe(9n);
  });
});
