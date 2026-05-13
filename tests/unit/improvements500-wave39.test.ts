// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  bilinearResample,
  ditherBayer,
  sweptAabb,
  MersenneTwister,
  cohenSutherlandClip,
  kelvinToRgb,
  savitzkyGolay,
  emaSeries,
  linearRegression,
  rk4Solve,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 39', () => {
  it('bilinearResample upscales constant', () => {
    const src = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const out = bilinearResample(src, 2, 2, 4, 4);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(0.5, 6);
  });

  it('Bayer dither produces binary output', () => {
    const w = 16;
    const h = 16;
    const img = new Float32Array(w * h).fill(0.5);
    const out = ditherBayer(img, w, h);
    for (let i = 0; i < out.length; i++) expect([0, 255]).toContain(out[i]);
  });

  it('sweptAabb finds entry time', () => {
    const a = { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } };
    const b = { min: { x: 5, y: 0 }, max: { x: 6, y: 1 } };
    const hit = sweptAabb(a, { x: 10, y: 0 }, b);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.4, 6);
    expect(hit!.normal.x).toBe(-1);
  });

  it('Mersenne Twister deterministic with seed', () => {
    const m1 = new MersenneTwister(5489);
    const m2 = new MersenneTwister(5489);
    for (let i = 0; i < 100; i++) expect(m1.nextUint32()).toBe(m2.nextUint32());
  });

  it('HSL round trip', () => {
    const rect = { xMin: 0, yMin: 0, xMax: 10, yMax: 10 };
    const seg = cohenSutherlandClip(-5, 5, 15, 5, rect);
    expect(seg).not.toBeNull();
    expect(seg!.x0).toBeCloseTo(0, 6);
    expect(seg!.x1).toBeCloseTo(10, 6);
    const outside = cohenSutherlandClip(-5, -5, -1, -1, rect);
    expect(outside).toBeNull();
  });

  it('kelvinToRgb gives warm/cool ordering', () => {
    const warm = kelvinToRgb(2000);
    const cool = kelvinToRgb(10000);
    expect(warm.r).toBeGreaterThan(cool.r);
    expect(cool.b).toBeGreaterThan(warm.b);
  });

  it('savitzkyGolay smooths ramp', () => {
    const ramp = Array.from({ length: 20 }, (_, i) => i);
    const sm = savitzkyGolay(ramp, 5);
    // Smoothed ramp interior should approximately equal input.
    for (let i = 5; i < 15; i++) expect(sm[i]).toBeCloseTo(ramp[i], 6);
  });

  it('EMA approaches step value', () => {
    const series = new Array(50).fill(1);
    series.unshift(0);
    const out = emaSeries(series, 0.3);
    expect(out[out.length - 1]).toBeCloseTo(1, 5);
  });

  it('linearRegression recovers known slope', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [3, 5, 7, 9, 11]; // y = 2x + 1
    const r = linearRegression(xs, ys);
    expect(r.slope).toBeCloseTo(2, 8);
    expect(r.intercept).toBeCloseTo(1, 8);
    expect(r.r2).toBeCloseTo(1, 8);
  });

  it('RK4 integrates dy/dx = y to e at x=1', () => {
    const r = rk4Solve((_, y) => y, 0, 1, 1, 100);
    expect(r.y[r.y.length - 1]).toBeCloseTo(Math.E, 6);
  });
});
