// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  popcount32,
  leadingZeros32,
  trailingZeros32,
  reverseBits32,
  binaryToGray,
  grayToBinary,
  grayCodeSequence,
  smallestPrimeFactorSieve,
  factorizeWithSpf,
  subsetSum,
  knapsackUnbounded,
  matrixChainOrder,
  bipartiteCheck,
  treeDiameter,
  LcaBinaryLifting,
  combinations,
  powerset,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 31', () => {
  it('bit ops 32', () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0b1011_0001)).toBe(4);
    expect(leadingZeros32(0)).toBe(32);
    expect(leadingZeros32(1)).toBe(31);
    expect(leadingZeros32(0xffffffff)).toBe(0);
    expect(trailingZeros32(0)).toBe(32);
    expect(trailingZeros32(1)).toBe(0);
    expect(trailingZeros32(0b1000)).toBe(3);
    expect(reverseBits32(1)).toBe(0x80000000 >>> 0);
    expect(reverseBits32(0x80000000)).toBe(1);
  });

  it('Gray code conversion + sequence', () => {
    for (let i = 0; i < 16; i += 1) {
      expect(grayToBinary(binaryToGray(i))).toBe(i);
    }
    const seq = grayCodeSequence(3);
    expect(seq.length).toBe(8);
    // Adjacent codes differ by exactly one bit
    for (let i = 1; i < seq.length; i += 1) {
      expect(popcount32(seq[i]! ^ seq[i - 1]!)).toBe(1);
    }
  });

  it('smallestPrimeFactor + factorize', () => {
    const spf = smallestPrimeFactorSieve(100);
    expect(spf[2]).toBe(2);
    expect(spf[15]).toBe(3);
    expect(spf[49]).toBe(7);
    expect(factorizeWithSpf(60, spf)).toEqual([2, 2, 3, 5]);
    expect(factorizeWithSpf(1, spf)).toEqual([]);
  });

  it('subsetSum bitset DP', () => {
    expect(subsetSum([3, 34, 4, 12, 5, 2], 9)).toBe(true);
    expect(subsetSum([3, 34, 4, 12, 5, 2], 30)).toBe(false);
    expect(subsetSum([], 0)).toBe(true);
    expect(subsetSum([], 5)).toBe(false);
  });

  it('knapsackUnbounded', () => {
    const items = [
      { weight: 1, value: 1 },
      { weight: 3, value: 4 },
      { weight: 4, value: 5 },
      { weight: 5, value: 7 },
    ];
    expect(knapsackUnbounded(items, 8)).toBe(11); // 5+3 -> 7+4
    expect(knapsackUnbounded(items, 0)).toBe(0);
  });

  it('matrixChainOrder - classic example', () => {
    // dims [40, 20, 30, 10, 30] -> minimum = 26000
    const r = matrixChainOrder([40, 20, 30, 10, 30]);
    expect(r.cost).toBe(26000);
    expect(r.parenthesize()).toContain('M');
  });

  it('bipartiteCheck - even cycle bipartite, odd not', () => {
    // Square: 0-1-2-3-0
    const square = [[1, 3], [0, 2], [1, 3], [0, 2]];
    expect(bipartiteCheck(square)).not.toBeNull();
    // Triangle: 0-1-2-0
    const triangle = [[1, 2], [0, 2], [0, 1]];
    expect(bipartiteCheck(triangle)).toBeNull();
  });

  it('treeDiameter - path graph', () => {
    // 0-1-2-3-4
    const tree = [[1], [0, 2], [1, 3], [2, 4], [3]];
    const r = treeDiameter(tree);
    expect(r.diameter).toBe(4);
    expect(new Set(r.endpoints)).toEqual(new Set([0, 4]));
    expect(r.centers).toEqual([2]);
  });

  it('LCA binary lifting', () => {
    // Tree:        0
    //            / | \
    //           1  2  3
    //          / \    |
    //         4   5   6
    const adj = [
      [1, 2, 3],
      [0, 4, 5],
      [0],
      [0, 6],
      [1],
      [1],
      [3],
    ];
    const lca = new LcaBinaryLifting(adj, 0);
    expect(lca.query(4, 5)).toBe(1);
    expect(lca.query(4, 6)).toBe(0);
    expect(lca.query(2, 6)).toBe(0);
    expect(lca.query(1, 4)).toBe(1);
  });

  it('combinations + powerset enumeration', () => {
    const c = Array.from(combinations(4, 2));
    expect(c.length).toBe(6);
    expect(c).toContainEqual([0, 1]);
    expect(c).toContainEqual([2, 3]);
    const p = Array.from(powerset(['a', 'b', 'c']));
    expect(p.length).toBe(8);
    expect(p).toContainEqual([]);
    expect(p).toContainEqual(['a', 'b', 'c']);
  });
});
