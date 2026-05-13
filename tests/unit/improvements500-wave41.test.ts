// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  Quadtree,
  Octree,
  earClipTriangulate,
  durandKernerRoots,
  conjugateGradient,
  gaussSeidel,
  circumcircle,
  incircle,
  fisherYatesShuffled,
  ComplementaryFilter,
  Kalman2d,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 41', () => {
  it('Quadtree range query', () => {
    const qt = new Quadtree<{ x: number; y: number; id: number }>({ xMin: 0, yMin: 0, xMax: 100, yMax: 100 }, 4);
    for (let i = 0; i < 50; i++) qt.insert({ x: i, y: i, id: i });
    const found = qt.query({ xMin: 10, yMin: 10, xMax: 20, yMax: 20 });
    expect(found.map((p) => p.id).sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('Octree range query', () => {
    const ot = new Octree<{ x: number; y: number; z: number; id: number }>(
      { xMin: 0, yMin: 0, zMin: 0, xMax: 10, yMax: 10, zMax: 10 },
      4,
    );
    for (let i = 0; i < 10; i++) ot.insert({ x: i, y: i, z: i, id: i });
    const found = ot.query({ xMin: 3, yMin: 3, zMin: 3, xMax: 5, yMax: 5, zMax: 5 });
    expect(found.map((p) => p.id).sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it('earClipTriangulate produces (n-2) triangles for convex polygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const tris = earClipTriangulate(square);
    expect(tris.length).toBe(2 * 3);
  });

  it('durandKernerRoots finds roots of (x-1)(x-2)(x-3)', () => {
    // x^3 - 6x^2 + 11x - 6
    const roots = durandKernerRoots([1, -6, 11, -6]);
    const reals = roots.map((r) => r.re).sort((a, b) => a - b);
    expect(reals[0]).toBeCloseTo(1, 5);
    expect(reals[1]).toBeCloseTo(2, 5);
    expect(reals[2]).toBeCloseTo(3, 5);
    for (const r of roots) expect(Math.abs(r.im)).toBeLessThan(1e-5);
  });

  it('conjugateGradient solves 2x2 SPD system', () => {
    // [[4,1],[1,3]] x = [1,2]; solution [1/11, 7/11]
    const A = [
      [4, 1],
      [1, 3],
    ];
    const b = new Float64Array([1, 2]);
    const result = conjugateGradient((v) => {
      const out = new Float64Array(2);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) out[i] += A[i]![j]! * v[j]!;
      return out;
    }, b);
    expect(result.converged).toBe(true);
    expect(result.x[0]).toBeCloseTo(1 / 11, 8);
    expect(result.x[1]).toBeCloseTo(7 / 11, 8);
  });

  it('gaussSeidel solves diagonally dominant system', () => {
    const A = [
      [10, -1, 2, 0],
      [-1, 11, -1, 3],
      [2, -1, 10, -1],
      [0, 3, -1, 8],
    ];
    const b = [6, 25, -11, 15];
    const r = gaussSeidel(A, b);
    expect(r.converged).toBe(true);
    expect(r.x[0]).toBeCloseTo(1, 4);
    expect(r.x[1]).toBeCloseTo(2, 4);
    expect(r.x[2]).toBeCloseTo(-1, 4);
    expect(r.x[3]).toBeCloseTo(1, 4);
  });

  it('circumcircle of right triangle has hypotenuse diameter', () => {
    const c = circumcircle({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 });
    expect(c).not.toBeNull();
    expect(c!.cx).toBeCloseTo(2, 6);
    expect(c!.cy).toBeCloseTo(1.5, 6);
    expect(c!.r).toBeCloseTo(2.5, 6);
  });

  it('incircle of 3-4-5 triangle radius 1', () => {
    const c = incircle({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 });
    expect(c).not.toBeNull();
    expect(c!.r).toBeCloseTo(1, 6);
  });

  it('fisherYatesShuffled preserves multiset', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    let i = 0;
    const seq = [0.1, 0.5, 0.3, 0.7, 0.2, 0.9, 0.4, 0.6, 0.8];
    const out = fisherYatesShuffled(arr, () => seq[i++ % seq.length]!);
    expect(out.slice().sort((a, b) => a - b)).toEqual(arr);
  });

  it('ComplementaryFilter weights gyro mostly', () => {
    const f = new ComplementaryFilter(0.98, 0);
    let angle = 0;
    for (let i = 0; i < 100; i++) angle = f.step(1, 0, 0.01); // gyro 1 rad/s, accel says 0
    // After 1 second at gyro=1, alpha=0.98 => steady-state pulled by accel toward 0; but transient ~0.5
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(1);
  });

  it('Kalman2d smooths noisy positions', () => {
    const k = new Kalman2d({ x: 0, y: 0, vx: 0, vy: 0 }, { processNoise: 0.001, measurementNoise: 1 });
    let lastX = 0;
    for (let i = 1; i <= 50; i++) {
      k.predict(0.1);
      const noise = (i % 2 === 0 ? 1 : -1) * 0.5;
      k.update(i + noise, i);
      lastX = k.current().x;
    }
    expect(lastX).toBeGreaterThan(40);
    expect(lastX).toBeLessThan(60);
  });
});
