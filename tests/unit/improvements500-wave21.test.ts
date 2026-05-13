// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  Deque,
  PerlinNoise,
  SimplexNoise,
  catmullRomSpline,
  bsplineCurve,
  polynomialFit,
  polynomialEval,
  fft,
  ifft,
  fftFromReal,
  hammingEncode4,
  hammingDecode7,
  sutherlandHodgmanClip,
  fordFulkerson,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 21', () => {
  it('Deque - push/pop both ends and grow', () => {
    const d = new Deque<number>(2);
    d.pushBack(1);
    d.pushBack(2);
    d.pushFront(0);
    d.pushBack(3); // forces grow
    expect(d.size).toBe(4);
    expect(d.toArray()).toEqual([0, 1, 2, 3]);
    expect(d.popFront()).toBe(0);
    expect(d.popBack()).toBe(3);
    expect(d.peekFront()).toBe(1);
    expect(d.peekBack()).toBe(2);
    expect(d.size).toBe(2);
  });

  it('PerlinNoise - deterministic for same seed, in [-1,1]', () => {
    const a = new PerlinNoise(42);
    const b = new PerlinNoise(42);
    for (let i = 0; i < 5; i += 1) {
      const x = i * 0.37;
      const y = i * 0.71;
      const va = a.noise2D(x, y);
      expect(va).toBeCloseTo(b.noise2D(x, y), 12);
      expect(va).toBeGreaterThanOrEqual(-1);
      expect(va).toBeLessThanOrEqual(1);
    }
    expect(a.noise3D(0.1, 0.2, 0.3)).toBeCloseTo(b.noise3D(0.1, 0.2, 0.3), 12);
  });

  it('SimplexNoise - deterministic and bounded', () => {
    const s = new SimplexNoise(7);
    const v = s.noise2D(1.234, 5.678);
    expect(v).toBeGreaterThanOrEqual(-1.5);
    expect(v).toBeLessThanOrEqual(1.5);
    const s2 = new SimplexNoise(7);
    expect(s2.noise2D(1.234, 5.678)).toBeCloseTo(v, 12);
  });

  it('catmullRomSpline passes through control points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
    ];
    const curve = catmullRomSpline(pts, 8);
    // First sample should equal first control point
    expect(curve[0]!.x).toBeCloseTo(0, 9);
    expect(curve[0]!.y).toBeCloseTo(0, 9);
    // Last point appended
    expect(curve[curve.length - 1]!.x).toBeCloseTo(3, 9);
    expect(curve[curve.length - 1]!.y).toBeCloseTo(1, 9);
    expect(curve.length).toBeGreaterThan(pts.length);
  });

  it('bsplineCurve interpolates a smooth curve', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: -1 },
      { x: 3, y: 1 },
      { x: 4, y: 0 },
    ];
    const curve = bsplineCurve(pts, 3, 32);
    expect(curve.length).toBe(32);
    // Clamped knot -> first/last samples coincide with first/last controls
    expect(curve[0]!.x).toBeCloseTo(0, 6);
    expect(curve[0]!.y).toBeCloseTo(0, 6);
    expect(curve[31]!.x).toBeCloseTo(4, 6);
    expect(curve[31]!.y).toBeCloseTo(0, 6);
  });

  it('polynomialFit recovers exact polynomial', () => {
    // f(x) = 2 + 3x - x^2
    const xs = [0, 1, 2, 3, 4, 5];
    const ys = xs.map((x) => 2 + 3 * x - x * x);
    const c = polynomialFit(xs, ys, 2);
    expect(c[0]).toBeCloseTo(2, 6);
    expect(c[1]).toBeCloseTo(3, 6);
    expect(c[2]).toBeCloseTo(-1, 6);
    expect(polynomialEval(c, 7)).toBeCloseTo(2 + 21 - 49, 6);
  });

  it('fft + ifft round trip recovers signal', () => {
    const signal = [1, 2, 3, 4, 4, 3, 2, 1];
    const F = fftFromReal(signal);
    const back = ifft(F);
    for (let i = 0; i < signal.length; i += 1) {
      expect(back.real[i]).toBeCloseTo(signal[i]!, 9);
      expect(back.imag[i]).toBeCloseTo(0, 9);
    }
  });

  it('fft of constant signal -> only DC bin nonzero', () => {
    const real = new Float64Array([5, 5, 5, 5]);
    const imag = new Float64Array(4);
    const F = fft({ real, imag });
    expect(F.real[0]).toBeCloseTo(20, 9);
    for (let i = 1; i < 4; i += 1) {
      expect(F.real[i]).toBeCloseTo(0, 9);
      expect(F.imag[i]).toBeCloseTo(0, 9);
    }
  });

  it('hammingCode encode + decode (no error)', () => {
    for (let n = 0; n < 16; n += 1) {
      const cw = hammingEncode4(n);
      const r = hammingDecode7(cw);
      expect(r.data).toBe(n);
      expect(r.corrected).toBe(false);
    }
  });

  it('hammingCode corrects single-bit error', () => {
    const cw = hammingEncode4(0b1011);
    for (let bit = 0; bit < 7; bit += 1) {
      const flipped = cw ^ (1 << bit);
      const r = hammingDecode7(flipped);
      expect(r.data).toBe(0b1011);
      expect(r.corrected).toBe(true);
    }
  });

  it('sutherlandHodgmanClip clips a triangle to a square', () => {
    // Subject: triangle extending outside the unit square
    const subject = [
      { x: -1, y: -1 },
      { x: 2, y: 0.5 },
      { x: 0.5, y: 2 },
    ];
    // Clip: unit square [0,1]^2, CCW
    const clip = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const out = sutherlandHodgmanClip(subject, clip);
    expect(out.length).toBeGreaterThanOrEqual(3);
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('fordFulkerson - max flow on classic example', () => {
    // 4-node graph: s=0, a=1, b=2, t=3
    const edges = [
      { from: 0, to: 1, capacity: 3 },
      { from: 0, to: 2, capacity: 2 },
      { from: 1, to: 2, capacity: 1 },
      { from: 1, to: 3, capacity: 2 },
      { from: 2, to: 3, capacity: 3 },
    ];
    expect(fordFulkerson(4, edges, 0, 3)).toBe(5);
  });
});
