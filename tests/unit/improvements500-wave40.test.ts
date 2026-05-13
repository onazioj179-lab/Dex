// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  liangBarskyClip,
  Xorshift32,
  Xoshiro128pp,
  crc8,
  AliasSampler,
  buildNaturalCubicSpline,
  evalCubicSpline,
  theilSen,
  verletSolve,
  PidController,
  gradientDescent1d,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 40', () => {
  it('liangBarsky clips horizontal line', () => {
    const r = { xMin: 0, yMin: 0, xMax: 10, yMax: 10 };
    const s = liangBarskyClip(-5, 5, 15, 5, r);
    expect(s).not.toBeNull();
    expect(s!.x0).toBeCloseTo(0, 6);
    expect(s!.x1).toBeCloseTo(10, 6);
    expect(liangBarskyClip(20, 20, 30, 30, r)).toBeNull();
  });

  it('Xorshift32 deterministic', () => {
    const a = new Xorshift32(42);
    const b = new Xorshift32(42);
    for (let i = 0; i < 50; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('Xoshiro128pp deterministic and produces uint32', () => {
    const a = new Xoshiro128pp(1, 2, 3, 4);
    const b = new Xoshiro128pp(1, 2, 3, 4);
    for (let i = 0; i < 50; i++) {
      const v = a.nextUint32();
      expect(v).toBe(b.nextUint32());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('crc8 of empty is 0', () => {
    expect(crc8(new Uint8Array(0))).toBe(0);
    // Independent value: known crc8 of "123456789" is 0xF4 (poly 0x07).
    expect(crc8('123456789')).toBe(0xf4);
  });

  it('AliasSampler respects weights approximately', () => {
    const sampler = new AliasSampler([1, 1, 8]);
    const counts = [0, 0, 0];
    const n = 5000;
    for (let i = 0; i < n; i++) counts[sampler.sample()]!++;
    expect(counts[2]! / n).toBeGreaterThan(0.7);
    expect(counts[2]! / n).toBeLessThan(0.9);
  });

  it('cubicSpline interpolates quadratic exactly at knots', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => x * x);
    const sp = buildNaturalCubicSpline(xs, ys);
    for (let i = 0; i < xs.length; i++) expect(evalCubicSpline(sp, xs[i]!)).toBeCloseTo(ys[i]!, 8);
  });

  it('theilSen recovers slope on linear data', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [1, 3, 5, 7, 9];
    const r = theilSen(xs, ys);
    expect(r.slope).toBeCloseTo(2, 8);
    expect(r.intercept).toBeCloseTo(1, 8);
  });

  it('verlet integrator simulates harmonic oscillator', () => {
    // x'' = -x, x(0)=1, v(0)=0 => x(t)=cos(t). At t=PI, x = -1.
    const r = verletSolve((x) => -x, 1, 0, Math.PI, 2000);
    expect(r.x[r.x.length - 1]).toBeCloseTo(-1, 3);
  });

  it('PidController drives toward setpoint', () => {
    const pid = new PidController({ kp: 0.5, ki: 0.1, kd: 0.05 });
    let measurement = 0;
    for (let i = 0; i < 200; i++) {
      const out = pid.step(1, measurement, 0.1);
      measurement += out * 0.1; // integrator plant
    }
    expect(measurement).toBeCloseTo(1, 1);
  });

  it('gradientDescent1d minimizes (x-3)^2', () => {
    const r = gradientDescent1d((x) => 2 * (x - 3), 0, { learningRate: 0.1, maxIterations: 500 });
    expect(r.converged).toBe(true);
    expect(r.x).toBeCloseTo(3, 6);
  });
});
