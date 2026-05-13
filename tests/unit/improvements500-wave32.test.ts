// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  Dinic,
  pageRank,
  hits,
  RollingHash,
  Fenwick2D,
  SuffixAutomaton,
  PersistentArray,
  LeftistHeap,
  PairingHeap,
  yenKShortest,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 32', () => {
  it('Dinic max flow', () => {
    const d = new Dinic(4);
    d.addEdge(0, 1, 3);
    d.addEdge(0, 2, 2);
    d.addEdge(1, 2, 1);
    d.addEdge(1, 3, 2);
    d.addEdge(2, 3, 3);
    expect(d.maxFlow(0, 3)).toBe(5);
  });

  it('pageRank converges', () => {
    const adj = [[1, 2], [2], [0]];
    const r = pageRank(adj, { iterations: 200, tolerance: 1e-10 });
    let s = 0;
    for (let i = 0; i < r.length; i++) s += r[i];
    expect(Math.abs(s - 1)).toBeLessThan(1e-6);
    expect(r[2]).toBeGreaterThan(r[1]);
  });

  it('HITS algorithm', () => {
    const adj = [[1], [2], [0, 1]];
    const { hubs, authorities } = hits(adj, 100);
    expect(hubs.length).toBe(3);
    expect(authorities.length).toBe(3);
    expect(authorities[1]).toBeGreaterThan(0);
  });

  it('RollingHash matches substring equality', () => {
    const s = 'abracadabra';
    const rh = new RollingHash(s);
    expect(rh.hash(0, 4)).toBe(rh.hash(7, 11));
    expect(rh.hash(0, 4)).not.toBe(rh.hash(1, 5));
  });

  it('Fenwick2D range sum', () => {
    const f = new Fenwick2D(4, 4);
    f.update(0, 0, 5);
    f.update(1, 1, 3);
    f.update(3, 3, 7);
    expect(f.rangeSum(0, 0, 1, 1)).toBe(8);
    expect(f.rangeSum(0, 0, 3, 3)).toBe(15);
  });

  it('SuffixAutomaton contains and counts', () => {
    const sa = new SuffixAutomaton('abcbc');
    expect(sa.contains('bcb')).toBe(true);
    expect(sa.contains('cba')).toBe(false);
    expect(sa.countDistinctSubstrings()).toBe(12);
  });

  it('PersistentArray immutable updates', () => {
    const a = new PersistentArray<number>(8, 0);
    const b = a.set(3, 42);
    const c = b.set(3, 99);
    expect(a.get(3)).toBe(0);
    expect(b.get(3)).toBe(42);
    expect(c.get(3)).toBe(99);
  });

  it('LeftistHeap pops in order', () => {
    const h = new LeftistHeap<number>();
    [5, 2, 8, 1, 9, 3].forEach((v) => h.push(v));
    const out: number[] = [];
    while (h.size > 0) out.push(h.pop()!);
    expect(out).toEqual([1, 2, 3, 5, 8, 9]);
  });

  it('PairingHeap pops in order', () => {
    const h = new PairingHeap<number>();
    [7, 4, 11, 2, 6].forEach((v) => h.push(v));
    const out: number[] = [];
    while (h.size > 0) out.push(h.pop()!);
    expect(out).toEqual([2, 4, 6, 7, 11]);
  });

  it('yenKShortest returns increasing-cost paths', () => {
    const g = [
      [{ to: 1, weight: 1 }, { to: 2, weight: 2 }],
      [{ to: 3, weight: 1 }],
      [{ to: 3, weight: 1 }],
      [],
    ];
    const paths = yenKShortest(g, 0, 3, 3);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths[0].cost).toBe(2);
    expect(paths[1].cost).toBeGreaterThanOrEqual(paths[0].cost);
  });
});
