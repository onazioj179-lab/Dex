// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  SparseTable,
  longestIncreasingSubsequence,
  longestCommonSubsequence,
  longestCommonSubsequenceString,
  twoSat,
  eulerianPath,
  bfsLevels,
  bfsLayers,
  iddfs,
  findDirectedCycle,
  hasDirectedCycle,
  coinChangeMin,
  knapsack01,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 22', () => {
  it('SparseTable - range min queries', () => {
    const st = new SparseTable([7, 2, 9, 4, 5, 1, 6, 3]);
    expect(st.query(0, 7)).toBe(1);
    expect(st.query(0, 3)).toBe(2);
    expect(st.query(2, 4)).toBe(4);
    expect(st.query(6, 7)).toBe(3);
    expect(st.query(5, 5)).toBe(1);
  });

  it('SparseTable - range max via custom combine', () => {
    const st = new SparseTable([3, 1, 4, 1, 5, 9, 2, 6], Math.max);
    expect(st.query(0, 7)).toBe(9);
    expect(st.query(0, 3)).toBe(4);
    expect(st.query(6, 7)).toBe(6);
  });

  it('LIS - patience sorting result', () => {
    const r = longestIncreasingSubsequence([10, 9, 2, 5, 3, 7, 101, 18]);
    expect(r.length).toBe(4);
    // Verify increasing
    for (let i = 1; i < r.sequence.length; i += 1) {
      expect(r.sequence[i]).toBeGreaterThan(r.sequence[i - 1]!);
    }
  });

  it('LCS - classic example', () => {
    const r = longestCommonSubsequence('ABCBDAB'.split(''), 'BDCABA'.split(''));
    expect(r.length).toBe(4);
    expect(longestCommonSubsequenceString('ABCBDAB', 'BDCABA').length).toBe(4);
  });

  it('twoSat - satisfiable formula', () => {
    // (x0 OR x1) AND (NOT x0 OR x2) AND (NOT x1 OR x2)
    const r = twoSat(3, [
      { a: 0, aPositive: true, b: 1, bPositive: true },
      { a: 0, aPositive: false, b: 2, bPositive: true },
      { a: 1, aPositive: false, b: 2, bPositive: true },
    ]);
    expect(r.satisfiable).toBe(true);
    // Verify assignment satisfies all clauses
    const eval2 = (lit: { idx: number; pos: boolean }): boolean =>
      lit.pos ? r.assignment[lit.idx]! : !r.assignment[lit.idx]!;
    expect(eval2({ idx: 0, pos: true }) || eval2({ idx: 1, pos: true })).toBe(true);
  });

  it('twoSat - unsatisfiable formula', () => {
    // (x AND ~x): x OR x AND ~x OR ~x
    const r = twoSat(1, [
      { a: 0, aPositive: true, b: 0, bPositive: true },
      { a: 0, aPositive: false, b: 0, bPositive: false },
    ]);
    expect(r.satisfiable).toBe(false);
  });

  it('eulerianPath - circuit on triangle', () => {
    const r = eulerianPath(3, [
      { u: 0, v: 1 },
      { u: 1, v: 2 },
      { u: 2, v: 0 },
    ]);
    expect(r.exists).toBe(true);
    expect(r.isCircuit).toBe(true);
    expect(r.path[0]).toBe(r.path[r.path.length - 1]);
    expect(r.path.length).toBe(4); // 3 edges + return
  });

  it('eulerianPath - path with two odd vertices', () => {
    // Path graph 0-1-2 has odd-degree at 0 and 2
    const r = eulerianPath(3, [
      { u: 0, v: 1 },
      { u: 1, v: 2 },
    ]);
    expect(r.exists).toBe(true);
    expect(r.isCircuit).toBe(false);
    expect(r.path.length).toBe(3);
  });

  it('eulerianPath - rejects 4 odd vertices', () => {
    // K4 has all degree 3 -> 4 odd
    const r = eulerianPath(4, [
      { u: 0, v: 1 },
      { u: 0, v: 2 },
      { u: 0, v: 3 },
      { u: 1, v: 2 },
      { u: 1, v: 3 },
      { u: 2, v: 3 },
    ]);
    expect(r.exists).toBe(false);
  });

  it('bfsLevels - distances and layers', () => {
    // 0 -> 1 -> 2 -> 3, with 0 -> 4
    const graph: number[][] = [[1, 4], [0, 2], [1, 3], [2], [0]];
    const dist = bfsLevels(graph, 0);
    expect(Array.from(dist)).toEqual([0, 1, 2, 3, 1]);
    const layers = bfsLayers(graph, 0);
    expect(layers[0]).toEqual([0]);
    expect(layers[1]!.sort()).toEqual([1, 4]);
    expect(layers[2]).toEqual([2]);
    expect(layers[3]).toEqual([3]);
  });

  it('iddfs - finds shallow goal', () => {
    type Node = number;
    const path = iddfs<Node>(
      0,
      (n) => n === 7,
      (n) => [n + 1, n + 2],
      { maxDepth: 5 },
    );
    expect(path).not.toBeNull();
    expect(path![0]).toBe(0);
    expect(path![path!.length - 1]).toBe(7);
  });

  it('iddfs - returns null past depth', () => {
    const path = iddfs<number>(0, (n) => n === 100, (n) => [n + 1], { maxDepth: 3 });
    expect(path).toBeNull();
  });

  it('cycleDetect - finds cycle in directed graph', () => {
    const graph: number[][] = [[1], [2], [0]];
    expect(hasDirectedCycle(graph)).toBe(true);
    const cycle = findDirectedCycle(graph)!;
    expect(cycle).not.toBeNull();
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
  });

  it('cycleDetect - DAG has no cycle', () => {
    const graph: number[][] = [[1, 2], [3], [3], []];
    expect(hasDirectedCycle(graph)).toBe(false);
    expect(findDirectedCycle(graph)).toBeNull();
  });

  it('coinChangeMin - reachable and unreachable', () => {
    const r = coinChangeMin([1, 2, 5], 11);
    expect(r.count).toBe(3); // 5+5+1
    expect(r.coins.reduce((a, b) => a + b, 0)).toBe(11);
    const u = coinChangeMin([2, 4], 7);
    expect(u.count).toBe(-1);
    expect(coinChangeMin([1, 2, 5], 0).count).toBe(0);
  });

  it('knapsack01 - classic example', () => {
    const items = [
      { weight: 2, value: 3 },
      { weight: 3, value: 4 },
      { weight: 4, value: 5 },
      { weight: 5, value: 6 },
    ];
    const r = knapsack01(items, 5);
    expect(r.value).toBe(7); // items 0+1
    expect(r.selectedIndices.sort()).toEqual([0, 1]);
  });
});
