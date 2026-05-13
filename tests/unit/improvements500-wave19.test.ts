// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  UnionFind,
  SegmentTree,
  FenwickTree,
  topologicalSort,
  dijkstra,
  reconstructPath,
  tarjanSCC,
  primeSieve,
  isPrimeTrial,
  millerRabin,
  extendedGcd,
  modInverse,
  mat2Multiply,
  mat2Determinant,
  mat2Inverse,
  mat3Multiply,
  mat3Determinant,
  mat3Inverse,
} from '../../src/renderer/improvements500';

describe('UnionFind', () => {
  it('tracks connectivity and component count', () => {
    const uf = new UnionFind(5);
    expect(uf.components).toBe(5);
    expect(uf.union(0, 1)).toBe(true);
    expect(uf.union(2, 3)).toBe(true);
    expect(uf.union(0, 1)).toBe(false);
    expect(uf.connected(0, 1)).toBe(true);
    expect(uf.connected(0, 2)).toBe(false);
    expect(uf.components).toBe(3);
    uf.union(1, 3);
    expect(uf.connected(0, 3)).toBe(true);
    expect(uf.components).toBe(2);
  });
});

describe('SegmentTree', () => {
  it('answers sum queries and supports point updates', () => {
    const st = new SegmentTree<number>([1, 2, 3, 4, 5], {
      identity: 0,
      combine: (a, b) => a + b,
    });
    expect(st.query(0, 4)).toBe(15);
    expect(st.query(1, 3)).toBe(9);
    st.set(2, 10);
    expect(st.query(0, 4)).toBe(22);
  });
  it('works with min combiner', () => {
    const st = new SegmentTree<number>([7, 2, 9, 4, 5], {
      identity: Infinity,
      combine: (a, b) => Math.min(a, b),
    });
    expect(st.query(0, 4)).toBe(2);
    expect(st.query(2, 4)).toBe(4);
  });
});

describe('FenwickTree', () => {
  it('handles prefix sums and updates', () => {
    const f = new FenwickTree(5);
    [1, 2, 3, 4, 5].forEach((v, i) => f.update(i, v));
    expect(f.prefixSum(4)).toBe(15);
    expect(f.rangeSum(1, 3)).toBe(9);
    f.update(2, 10);
    expect(f.prefixSum(4)).toBe(25);
  });
});

describe('topologicalSort', () => {
  it('orders a DAG', () => {
    const order = topologicalSort({
      nodes: 4,
      edges: [[1, 2], [3], [3], []],
    });
    expect(order).not.toBeNull();
    const pos = new Map(order!.map((v, i) => [v, i]));
    expect(pos.get(0)!).toBeLessThan(pos.get(1)!);
    expect(pos.get(0)!).toBeLessThan(pos.get(2)!);
    expect(pos.get(1)!).toBeLessThan(pos.get(3)!);
    expect(pos.get(2)!).toBeLessThan(pos.get(3)!);
  });
  it('returns null on a cycle', () => {
    expect(
      topologicalSort({
        nodes: 3,
        edges: [[1], [2], [0]],
      }),
    ).toBeNull();
  });
});

describe('dijkstra', () => {
  it('finds shortest paths', () => {
    const g = [
      [{ to: 1, weight: 4 }, { to: 2, weight: 1 }],
      [{ to: 3, weight: 1 }],
      [{ to: 1, weight: 2 }, { to: 3, weight: 5 }],
      [],
    ];
    const { distance, predecessor } = dijkstra(g, 0);
    expect(distance[0]).toBe(0);
    expect(distance[1]).toBe(3);
    expect(distance[2]).toBe(1);
    expect(distance[3]).toBe(4);
    expect(reconstructPath(predecessor, 0, 3)).toEqual([0, 2, 1, 3]);
  });
  it('rejects negative weights', () => {
    expect(() => dijkstra([[{ to: 1, weight: -1 }], []], 0)).toThrow();
  });
});

describe('tarjanSCC', () => {
  it('finds strongly connected components', () => {
    // 0 -> 1 -> 2 -> 0 (one SCC), 3 -> 4 (two singletons).
    const sccs = tarjanSCC([[1], [2], [0], [4], []]);
    const sets = sccs.map((c) => c.slice().sort((a, b) => a - b));
    expect(sets.length).toBe(3);
    const big = sets.find((s) => s.length === 3);
    expect(big).toEqual([0, 1, 2]);
    expect(sets.some((s) => s.length === 1 && s[0] === 3)).toBe(true);
    expect(sets.some((s) => s.length === 1 && s[0] === 4)).toBe(true);
  });
});

describe('primeSieve / isPrimeTrial', () => {
  it('lists primes up to 30', () => {
    expect(Array.from(primeSieve(30))).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
  });
  it('isPrimeTrial agrees on small numbers', () => {
    for (const p of [2, 3, 5, 7, 11, 97, 9973]) expect(isPrimeTrial(p)).toBe(true);
    for (const c of [0, 1, 4, 9, 25, 100, 9999]) expect(isPrimeTrial(c)).toBe(false);
  });
});

describe('millerRabin', () => {
  it('agrees with sieve up to 200', () => {
    const sievePrimes = new Set(Array.from(primeSieve(200)));
    for (let n = 2; n <= 200; n += 1) {
      expect(millerRabin(n)).toBe(sievePrimes.has(n));
    }
  });
  it('detects large primes', () => {
    expect(millerRabin(2n ** 31n - 1n)).toBe(true); // Mersenne prime.
    expect(millerRabin(2n ** 31n - 1n + 4n)).toBe(false);
  });
});

describe('modInverse / extendedGcd', () => {
  it('computes Bezout', () => {
    const { gcd, x, y } = extendedGcd(240n, 46n);
    expect(gcd).toBe(2n);
    expect(240n * x + 46n * y).toBe(2n);
  });
  it('inverts mod prime', () => {
    expect(modInverse(3n, 11n)).toBe(4n);
    expect((3n * 4n) % 11n).toBe(1n);
  });
  it('throws when no inverse exists', () => {
    expect(() => modInverse(4n, 8n)).toThrow();
  });
});

describe('matrix2D', () => {
  it('mat2 multiply, det, inverse', () => {
    const a = [1, 2, 3, 4] as const;
    const b = [5, 6, 7, 8] as const;
    expect(mat2Multiply(a, b)).toEqual([19, 22, 43, 50]);
    expect(mat2Determinant(a)).toBe(-2);
    const inv = mat2Inverse(a);
    expect(inv[0]).toBeCloseTo(-2);
    expect(inv[1]).toBeCloseTo(1);
  });
  it('mat3 multiply by identity, det, inverse round-trip', () => {
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
    const m = [1, 2, 3, 0, 1, 4, 5, 6, 0] as const;
    expect(mat3Multiply(m, id)).toEqual([1, 2, 3, 0, 1, 4, 5, 6, 0]);
    expect(mat3Determinant(m)).toBe(1);
    const inv = mat3Inverse(m);
    const product = mat3Multiply(m, inv);
    for (let i = 0; i < 9; i += 1) {
      const expected = i === 0 || i === 4 || i === 8 ? 1 : 0;
      expect(product[i]!).toBeCloseTo(expected);
    }
  });
});
