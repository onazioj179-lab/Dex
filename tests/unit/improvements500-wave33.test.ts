// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  johnsonAllPairs,
  MergeSortTree,
  SplayTree,
  FibonacciHeap,
  FastBitVector,
  chuLiuEdmonds,
  brandesBetweenness,
  heavyLightDecomposition,
  tspNearestNeighbor,
  tsp2Opt,
  stoerWagnerMinCut,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 33', () => {
  it('johnsonAllPairs handles negative weights', () => {
    const g = [
      [{ to: 1, weight: 4 }, { to: 2, weight: 1 }],
      [{ to: 2, weight: -2 }],
      [],
    ];
    const d = johnsonAllPairs(g);
    expect(d).not.toBeNull();
    expect(d![0][2]).toBe(1);
    expect(d![1][2]).toBe(-2);
  });

  it('MergeSortTree counts <= x in range', () => {
    const t = new MergeSortTree([1, 5, 2, 6, 3, 7, 4]);
    expect(t.countLeqRange(0, 6, 4)).toBe(4);
    expect(t.countLeqRange(2, 5, 5)).toBe(2);
  });

  it('SplayTree insert/contains', () => {
    const t = new SplayTree<number>();
    [5, 2, 8, 1, 9].forEach((v) => t.insert(v));
    expect(t.contains(8)).toBe(true);
    expect(t.contains(7)).toBe(false);
    expect(t.size).toBe(5);
  });

  it('FibonacciHeap pops in order', () => {
    const h = new FibonacciHeap<number>();
    [9, 4, 6, 1, 3, 8].forEach((v) => h.push(v));
    const out: number[] = [];
    while (h.size > 0) out.push(h.pop()!);
    expect(out).toEqual([1, 3, 4, 6, 8, 9]);
  });

  it('FastBitVector rank/select', () => {
    const bv = new FastBitVector([1, 0, 1, 1, 0, 0, 1, 0, 1]);
    expect(bv.rank(4)).toBe(3);
    expect(bv.rank(9)).toBe(5);
    expect(bv.select(3)).toBe(3);
    expect(bv.select(5)).toBe(8);
  });

  it('chuLiuEdmonds computes total cost', () => {
    const result = chuLiuEdmonds(
      4,
      [
        { from: 0, to: 1, weight: 1 },
        { from: 0, to: 2, weight: 5 },
        { from: 1, to: 2, weight: 2 },
        { from: 2, to: 3, weight: 1 },
      ],
      0,
    );
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(4);
  });

  it('brandesBetweenness on path graph', () => {
    const g = [[1], [0, 2], [1, 3], [2]];
    const cb = brandesBetweenness(g);
    expect(cb[0]).toBeCloseTo(0, 5);
    expect(cb[1]).toBeCloseTo(2, 5);
    expect(cb[2]).toBeCloseTo(2, 5);
  });

  it('heavyLightDecomposition fills all positions', () => {
    const g = [[1, 2], [0, 3, 4], [0], [1], [1]];
    const hld = heavyLightDecomposition(g, 0);
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) seen.add(hld.pos[i]);
    expect(seen.size).toBe(5);
    expect(hld.depth[3]).toBe(2);
  });

  it('tsp nearest neighbor + 2-opt improves cost', () => {
    const dist = [
      [0, 2, 9, 10],
      [2, 0, 6, 4],
      [9, 6, 0, 8],
      [10, 4, 8, 0],
    ];
    const nn = tspNearestNeighbor(dist, 0);
    const opt = tsp2Opt(nn.order, dist);
    expect(opt.cost).toBeLessThanOrEqual(nn.cost);
  });

  it('stoerWagnerMinCut on K4', () => {
    const w = [
      [0, 1, 1, 1],
      [1, 0, 1, 1],
      [1, 1, 0, 1],
      [1, 1, 1, 0],
    ];
    expect(stoerWagnerMinCut(w)).toBe(3);
  });
});
