// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  aStarBidirectional,
  SegmentTreeLazy,
  LiChaoTree,
  mosAlgorithm,
  SqrtDecomposition,
  PersistentSegmentTree,
  ImplicitTreap,
  jacobiSymbol,
  polyMul,
  deBruijnSequence,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 26', () => {
  it('aStarBidirectional - finds shortest path on small grid graph', () => {
    // 0-1-2-3 chain plus edge 0-3 cost 100
    const fwd = [
      [{ to: 1, weight: 1 }, { to: 3, weight: 100 }],
      [{ to: 2, weight: 1 }],
      [{ to: 3, weight: 1 }],
      [],
    ];
    const back = [
      [],
      [{ to: 0, weight: 1 }],
      [{ to: 1, weight: 1 }],
      [{ to: 0, weight: 100 }, { to: 2, weight: 1 }],
    ];
    const r = aStarBidirectional({
      nodes: 4,
      forward: fwd,
      backward: back,
      start: 0,
      goal: 3,
      heuristic: () => 0,
    });
    expect(r).not.toBeNull();
    expect(r!.cost).toBe(3);
    expect(r!.path[0]).toBe(0);
    expect(r!.path[r!.path.length - 1]).toBe(3);
  });

  it('SegmentTreeLazy - range add + range sum', () => {
    const t = new SegmentTreeLazy([1, 2, 3, 4, 5]);
    expect(t.rangeSum(0, 5)).toBe(15);
    t.rangeAdd(1, 4, 10); // add 10 to indices 1,2,3
    expect(t.rangeSum(0, 5)).toBe(15 + 30);
    expect(t.rangeSum(1, 4)).toBe(2 + 3 + 4 + 30);
  });

  it('LiChaoTree - lower envelope minimum', () => {
    const tree = new LiChaoTree(0, 100);
    tree.addLine(2, 0); // y = 2x
    tree.addLine(-1, 50); // y = -x + 50
    tree.addLine(0, 10); // y = 10
    expect(tree.queryMin(0)).toBe(0);
    expect(tree.queryMin(50)).toBeLessThanOrEqual(0);
  });

  it("mosAlgorithm - distinct count via add/remove", () => {
    const arr = [1, 2, 1, 3, 2, 1, 3];
    const counts = new Map<number, number>();
    let distinct = 0;
    const add = (i: number) => {
      const v = arr[i]!;
      const c = counts.get(v) ?? 0;
      if (c === 0) distinct += 1;
      counts.set(v, c + 1);
    };
    const remove = (i: number) => {
      const v = arr[i]!;
      const c = counts.get(v)!;
      if (c === 1) distinct -= 1;
      counts.set(v, c - 1);
    };
    const ans = mosAlgorithm(
      arr.length,
      [
        { lo: 0, hi: 7 }, // {1,2,3} = 3
        { lo: 0, hi: 3 }, // {1,2} = 2
        { lo: 3, hi: 7 }, // {1,2,3} = 3
      ],
      add,
      remove,
      () => distinct,
    );
    expect(ans).toEqual([3, 2, 3]);
  });

  it('SqrtDecomposition - point update + range sum', () => {
    const d = new SqrtDecomposition([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(d.rangeSum(0, 10)).toBe(55);
    d.pointUpdate(5, 100);
    expect(d.rangeSum(0, 10)).toBe(55 - 6 + 100);
    expect(d.rangeSum(3, 7)).toBe(4 + 5 + 100 + 7);
  });

  it('PersistentSegmentTree - prior versions preserved', () => {
    const t = new PersistentSegmentTree([1, 2, 3, 4]);
    expect(t.rangeSum(0, 0, 4)).toBe(10);
    const v1 = t.update(0, 1, 20);
    expect(t.rangeSum(0, 0, 4)).toBe(10); // original unchanged
    expect(t.rangeSum(v1, 0, 4)).toBe(28);
  });

  it('ImplicitTreap - insertAt / at / removeAt', () => {
    const t = new ImplicitTreap<number>();
    for (let i = 0; i < 5; i += 1) t.insertAt(i, i + 1);
    expect(t.toArray()).toEqual([1, 2, 3, 4, 5]);
    t.insertAt(2, 99);
    expect(t.toArray()).toEqual([1, 2, 99, 3, 4, 5]);
    expect(t.at(2)).toBe(99);
    expect(t.removeAt(2)).toBe(99);
    expect(t.toArray()).toEqual([1, 2, 3, 4, 5]);
  });

  it('jacobiSymbol - known values', () => {
    expect(jacobiSymbol(1n, 1n)).toBe(1);
    expect(jacobiSymbol(2n, 7n)).toBe(1); // 2 is QR mod 7 (3^2=9=2)
    expect(jacobiSymbol(3n, 7n)).toBe(-1);
    expect(jacobiSymbol(7n, 7n)).toBe(0);
  });

  it('polyMul - small schoolbook', () => {
    // (1 + 2x) * (3 + 4x) = 3 + 10x + 8x^2
    const out = polyMul([1, 2], [3, 4]);
    expect(Array.from(out)).toEqual([3, 10, 8]);
  });

  it('polyMul - large size triggers FFT path and matches schoolbook', () => {
    const a = new Array(80).fill(0).map((_, i) => i + 1);
    const b = new Array(80).fill(0).map((_, i) => 80 - i);
    const fast = polyMul(a, b);
    // Reference schoolbook
    const ref = new Float64Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i += 1)
      for (let j = 0; j < b.length; j += 1) ref[i + j] += a[i]! * b[j]!;
    for (let i = 0; i < ref.length; i += 1) expect(fast[i]!).toBeCloseTo(ref[i]!, 4);
  });

  it('deBruijnSequence - B(2,3) length 8 contains all 3-bit strings', () => {
    const seq = deBruijnSequence(2, 3);
    expect(seq.length).toBe(8);
    const cyclic = seq.concat(seq.slice(0, 2));
    const seen = new Set<string>();
    for (let i = 0; i < 8; i += 1) seen.add(cyclic.slice(i, i + 3).join(''));
    expect(seen.size).toBe(8);
  });
});
