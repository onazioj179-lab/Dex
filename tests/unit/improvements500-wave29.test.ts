// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  eulerTotient,
  pollardRho,
  quickSelect,
  medianOfMediansSelect,
  matrixInverse,
  gaussJordanSolve,
  jacobiEigen,
  hungarianAssign,
  edmondsKarp,
  jaroSimilarity,
  jaroWinklerSimilarity,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 29', () => {
  it('eulerTotient - known values', () => {
    expect(eulerTotient(1)).toBe(1);
    expect(eulerTotient(9)).toBe(6);
    expect(eulerTotient(10)).toBe(4);
    expect(eulerTotient(36)).toBe(12);
    expect(eulerTotient(97)).toBe(96); // prime
  });

  it('pollardRho - finds factor of composite', () => {
    const f = pollardRho(8051n); // 8051 = 83 * 97
    expect(8051n % f).toBe(0n);
    expect(f).not.toBe(1n);
    expect(f).not.toBe(8051n);
    expect(pollardRho(15n)).toBeOneOf([3n, 5n]);
  });

  it('quickSelect - matches sorted array', () => {
    const data = [9, 3, 1, 7, 5, 8, 2, 4, 6];
    const sorted = [...data].sort((a, b) => a - b);
    for (let k = 0; k < data.length; k += 1) {
      expect(quickSelect(data, k)).toBe(sorted[k]);
    }
  });

  it('medianOfMediansSelect - matches sorted array', () => {
    const data = [42, 17, 8, 99, 23, 4, 56, 31, 71, 13];
    const sorted = [...data].sort((a, b) => a - b);
    for (let k = 0; k < data.length; k += 1) {
      expect(medianOfMediansSelect(data, k)).toBe(sorted[k]);
    }
  });

  it('matrixInverse - 3x3 inverse satisfies A * A^-1 = I', () => {
    const A = [
      [4, 7, 2],
      [3, 6, 1],
      [2, 5, 1],
    ];
    const inv = matrixInverse(A)!;
    expect(inv).not.toBeNull();
    // Multiply A * inv and check identity
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        let sum = 0;
        for (let k = 0; k < 3; k += 1) sum += A[i]![k]! * inv[k]![j]!;
        expect(sum).toBeCloseTo(i === j ? 1 : 0, 6);
      }
    }
    // Singular returns null
    expect(matrixInverse([
      [1, 2],
      [2, 4],
    ])).toBeNull();
  });

  it('gaussJordanSolve - solves 3x3 system', () => {
    const A = [
      [2, 1, -1],
      [-3, -1, 2],
      [-2, 1, 2],
    ];
    const b = [8, -11, -3];
    const x = gaussJordanSolve(A, b)!;
    expect(x[0]!).toBeCloseTo(2, 6);
    expect(x[1]!).toBeCloseTo(3, 6);
    expect(x[2]!).toBeCloseTo(-1, 6);
  });

  it('jacobiEigen - eigenvalues of diagonal matrix', () => {
    const M = [
      [4, 0, 0],
      [0, 2, 0],
      [0, 0, 1],
    ];
    const r = jacobiEigen(M);
    expect(r.eigenvalues).toEqual([4, 2, 1]);
    // Symmetric non-diagonal: [[2,1],[1,2]] has eigenvalues 3 and 1
    const r2 = jacobiEigen([[2, 1], [1, 2]]);
    expect(r2.eigenvalues[0]).toBeCloseTo(3, 6);
    expect(r2.eigenvalues[1]).toBeCloseTo(1, 6);
  });

  it('hungarianAssign - 3x3 minimum cost', () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const r = hungarianAssign(cost);
    expect(r.cost).toBe(5); // 1 + 2 + 2 = 5
    // Each worker must be assigned a unique job
    const jobs = new Set(r.assignment);
    expect(jobs.size).toBe(3);
  });

  it('edmondsKarp - max flow on classic example', () => {
    // 4-node graph: 0->1 cap 3, 0->2 cap 2, 1->2 cap 1, 1->3 cap 2, 2->3 cap 4
    const cap = [
      [0, 3, 2, 0],
      [0, 0, 1, 2],
      [0, 0, 0, 4],
      [0, 0, 0, 0],
    ];
    const r = edmondsKarp(cap, 0, 3);
    expect(r.maxFlow).toBe(5);
  });

  it('jaroWinklerSimilarity - known values', () => {
    expect(jaroSimilarity('MARTHA', 'MARHTA')).toBeCloseTo(0.9444, 3);
    expect(jaroWinklerSimilarity('MARTHA', 'MARHTA')).toBeCloseTo(0.9611, 3);
    expect(jaroWinklerSimilarity('DIXON', 'DICKSONX')).toBeCloseTo(0.8133, 2);
    expect(jaroWinklerSimilarity('abc', 'abc')).toBe(1);
    expect(jaroWinklerSimilarity('', 'abc')).toBe(0);
  });
});
