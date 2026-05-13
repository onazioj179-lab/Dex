// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  karatsubaMul,
  digitsToBigInt,
  bigIntToDigits,
  Welford,
  medianFilter1d,
  otsuThreshold,
  applyThreshold,
  erodeBinary,
  dilateBinary,
  marchingSquares,
  worleyNoise2d,
  fbm2d,
  boyerMooreHorspool,
  simulatedAnnealing,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 42', () => {
  it('karatsubaMul matches BigInt multiply', () => {
    const a = 123456789012345678901234567890n;
    const b = 987654321098765432109876543210n;
    const expected = a * b;
    const product = karatsubaMul(bigIntToDigits(a), bigIntToDigits(b));
    expect(digitsToBigInt(product)).toBe(expected);
  });

  it('Welford computes mean and variance', () => {
    const w = new Welford();
    for (const v of [2, 4, 4, 4, 5, 5, 7, 9]) w.push(v);
    expect(w.mean()).toBeCloseTo(5, 8);
    expect(w.variance()).toBeCloseTo(32 / 7, 8);
  });

  it('medianFilter1d removes single spike', () => {
    const out = medianFilter1d([1, 1, 1, 100, 1, 1, 1], 3);
    expect(out).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('otsuThreshold separates bimodal histogram', () => {
    const img = new Uint8Array(200);
    for (let i = 0; i < 100; i++) img[i] = 30;
    for (let i = 100; i < 200; i++) img[i] = 200;
    const t = otsuThreshold(img);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(200);
    const bin = applyThreshold(img, t);
    expect(bin[0]).toBe(0);
    expect(bin[150]).toBe(255);
  });

  it('erode shrinks and dilate expands', () => {
    const img = new Uint8Array(25);
    img[12] = 255; // single pixel center
    const eroded = erodeBinary(img, 5, 5);
    expect(eroded[12]).toBe(0);
    const dilated = dilateBinary(img, 5, 5);
    expect(dilated[12]).toBe(255);
    expect(dilated[7]).toBe(255);
    expect(dilated[11]).toBe(255);
  });

  it('marchingSquares produces segments at iso level', () => {
    const w = 4;
    const h = 4;
    const f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = x;
    const segs = marchingSquares(f, w, h, 1.5);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.length % 4).toBe(0);
  });

  it('worleyNoise2d returns non-negative distance', () => {
    for (let i = 0; i < 20; i++) {
      const v = worleyNoise2d(Math.random() * 5, Math.random() * 5, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2);
    }
  });

  it('fbm2d sums octaves of constant noise', () => {
    const value = fbm2d(() => 0.5, 0, 0, { octaves: 4, lacunarity: 2, persistence: 0.5 });
    expect(value).toBeCloseTo(0.5, 8);
  });

  it('boyerMooreHorspool finds pattern', () => {
    expect(boyerMooreHorspool('abracadabra', 'cad')).toBe(4);
    expect(boyerMooreHorspool('abracadabra', 'xyz')).toBe(-1);
    expect(boyerMooreHorspool('aaaa', 'aa')).toBe(0);
  });

  it('simulatedAnnealing minimizes integer parabola', () => {
    let i = 0;
    const seq = [0.1, 0.5, 0.3, 0.7, 0.2, 0.9, 0.4, 0.6, 0.8, 0.05, 0.55, 0.35, 0.75, 0.25, 0.95, 0.45, 0.65, 0.85];
    const rand = () => seq[i++ % seq.length]!;
    const r = simulatedAnnealing<number>({
      initial: 50,
      energy: (x) => (x - 7) * (x - 7),
      neighbor: (x, rnd) => x + (rnd() < 0.5 ? -1 : 1),
      iterations: 2000,
      initialTemperature: 100,
      finalTemperature: 1e-3,
      rand,
    });
    expect(Math.abs(r.bestState - 7)).toBeLessThan(5);
    expect(r.bestEnergy).toBeLessThan(25);
  });
});
