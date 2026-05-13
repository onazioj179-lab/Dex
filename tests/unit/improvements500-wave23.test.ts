// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  bellmanFord,
  floydWarshall,
  floydPath,
  primMst,
  kruskalMst,
  articulationPoints,
  graphBridges,
  hopcroftKarp,
  stableMarriage,
  chineseRemainder,
  gcd,
  lcm,
  gcdMany,
  lcmMany,
  gcdBig,
  lcmBig,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 23', () => {
  it('bellmanFord - positive weights match Dijkstra', () => {
    const r = bellmanFord(
      4,
      [
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 2, weight: 2 },
        { from: 0, to: 2, weight: 5 },
        { from: 2, to: 3, weight: 1 },
      ],
      0,
    );
    expect(r.hasNegativeCycle).toBe(false);
    expect(r.distance[0]).toBe(0);
    expect(r.distance[1]).toBe(1);
    expect(r.distance[2]).toBe(3);
    expect(r.distance[3]).toBe(4);
  });

  it('bellmanFord - detects negative cycle', () => {
    const r = bellmanFord(
      3,
      [
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 2, weight: -3 },
        { from: 2, to: 0, weight: 1 },
      ],
      0,
    );
    expect(r.hasNegativeCycle).toBe(true);
  });

  it('floydWarshall - all-pairs shortest paths', () => {
    const r = floydWarshall(4, [
      { from: 0, to: 1, weight: 5 },
      { from: 0, to: 3, weight: 10 },
      { from: 1, to: 2, weight: 3 },
      { from: 2, to: 3, weight: 1 },
    ]);
    expect(r.distance[0 * 4 + 3]).toBe(9);
    expect(r.distance[0 * 4 + 2]).toBe(8);
    const path = floydPath(r, 0, 3);
    expect(path).toEqual([0, 1, 2, 3]);
  });

  it('primMst - classic example total weight', () => {
    const r = primMst(5, [
      { u: 0, v: 1, weight: 2 },
      { u: 0, v: 3, weight: 6 },
      { u: 1, v: 2, weight: 3 },
      { u: 1, v: 3, weight: 8 },
      { u: 1, v: 4, weight: 5 },
      { u: 2, v: 4, weight: 7 },
      { u: 3, v: 4, weight: 9 },
    ]);
    expect(r.totalWeight).toBe(16);
    expect(r.edges.length).toBe(4);
  });

  it('kruskalMst - matches Prim total weight', () => {
    const edges = [
      { u: 0, v: 1, weight: 2 },
      { u: 0, v: 3, weight: 6 },
      { u: 1, v: 2, weight: 3 },
      { u: 1, v: 3, weight: 8 },
      { u: 1, v: 4, weight: 5 },
      { u: 2, v: 4, weight: 7 },
      { u: 3, v: 4, weight: 9 },
    ];
    expect(kruskalMst(5, edges).totalWeight).toBe(16);
  });

  it('articulationPoints - finds cut vertex', () => {
    // 0-1-2-3 with 4 attached to 1: vertex 1 and 2 are cut
    const graph: number[][] = [[1], [0, 2, 4], [1, 3], [2], [1]];
    const ap = articulationPoints(graph);
    expect(ap.sort()).toEqual([1, 2]);
  });

  it('articulationPoints - cycle has none', () => {
    const graph: number[][] = [[1, 3], [0, 2], [1, 3], [2, 0]];
    expect(articulationPoints(graph)).toEqual([]);
  });

  it('graphBridges - finds bridge edges', () => {
    // Same path-with-leaf graph: edges 0-1, 1-2, 2-3, 1-4 are all bridges
    const graph: number[][] = [[1], [0, 2, 4], [1, 3], [2], [1]];
    const bridges = graphBridges(graph);
    const set = new Set(bridges.map((b) => `${Math.min(b.u, b.v)}-${Math.max(b.u, b.v)}`));
    expect(set.has('0-1')).toBe(true);
    expect(set.has('1-2')).toBe(true);
    expect(set.has('2-3')).toBe(true);
    expect(set.has('1-4')).toBe(true);
    expect(bridges.length).toBe(4);
  });

  it('hopcroftKarp - max bipartite matching', () => {
    // 3 left, 3 right; edges: 0-{0,1}, 1-{0}, 2-{1,2}
    const left: number[][] = [[0, 1], [0], [1, 2]];
    const r = hopcroftKarp(3, 3, left);
    expect(r.matchSize).toBe(3);
  });

  it('stableMarriage - produces a valid stable matching', () => {
    const proposers = [
      [0, 1, 2],
      [1, 0, 2],
      [0, 1, 2],
    ];
    const receivers = [
      [1, 0, 2],
      [0, 1, 2],
      [0, 1, 2],
    ];
    const r = stableMarriage(proposers, receivers);
    // Each proposer matched
    for (let p = 0; p < 3; p += 1) expect(r.matchProposers[p]).toBeGreaterThanOrEqual(0);
    // No duplicates on receiver side
    const seen = new Set<number>();
    for (let p = 0; p < 3; p += 1) {
      const r2 = r.matchProposers[p]!;
      expect(seen.has(r2)).toBe(false);
      seen.add(r2);
    }
  });

  it('chineseRemainder - coprime moduli', () => {
    // x ≡ 2 (mod 3), x ≡ 3 (mod 5), x ≡ 2 (mod 7)  =>  x = 23 mod 105
    const r = chineseRemainder([
      { remainder: 2n, modulus: 3n },
      { remainder: 3n, modulus: 5n },
      { remainder: 2n, modulus: 7n },
    ]);
    expect(r.remainder).toBe(23n);
    expect(r.modulus).toBe(105n);
  });

  it('chineseRemainder - inconsistent system throws', () => {
    expect(() =>
      chineseRemainder([
        { remainder: 1n, modulus: 4n },
        { remainder: 2n, modulus: 6n },
      ]),
    ).toThrow();
  });

  it('gcd / lcm number variants', () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(0, 5)).toBe(5);
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(0, 7)).toBe(0);
    expect(gcdMany([12, 18, 24])).toBe(6);
    expect(lcmMany([2, 3, 4])).toBe(12);
  });

  it('gcd / lcm bigint variants', () => {
    expect(gcdBig(123456789012345n, 987654321098765n)).toBe(5n);
    expect(lcmBig(6n, 9n)).toBe(18n);
  });
});
