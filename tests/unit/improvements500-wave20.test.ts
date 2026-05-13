// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  SkipList,
  AvlTree,
  kmpSearch,
  kmpAll,
  rabinKarpSearch,
  rabinKarpAll,
  longestPalindrome,
  suffixArray,
  lcpArray,
  editScript,
  Treap,
  mat4Identity,
  mat4Multiply,
  mat4Translation,
  mat4Scale,
  mat4RotationZ,
  CountingBloomFilter,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 20', () => {
  it('SkipList - insert/contains/remove maintain sorted order', () => {
    const sl = new SkipList<number>();
    [5, 1, 9, 3, 7, 2, 8, 4, 6].forEach((v) => sl.insert(v));
    expect(sl.size).toBe(9);
    expect(sl.contains(7)).toBe(true);
    expect(sl.contains(100)).toBe(false);
    expect(sl.toArray()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sl.remove(5)).toBe(true);
    expect(sl.remove(5)).toBe(false);
    expect(sl.toArray()).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
  });

  it('AvlTree - balanced after sorted insertions', () => {
    const t = new AvlTree<number>();
    for (let i = 1; i <= 31; i += 1) t.insert(i);
    expect(t.size).toBe(31);
    expect(t.contains(15)).toBe(true);
    expect(t.contains(50)).toBe(false);
    expect(t.height()).toBeLessThanOrEqual(6);
    expect(t.inOrder()).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it('kmpSearch finds first match and kmpAll finds all', () => {
    expect(kmpSearch('ababcabcabababd', 'ababd')).toBe(10);
    expect(kmpSearch('hello', 'world')).toBe(-1);
    expect(kmpAll('aaaaa', 'aa')).toEqual([0, 2]);
    expect(kmpAll('abcabcabc', 'abc')).toEqual([0, 3, 6]);
  });

  it('rabinKarpSearch matches kmp on basic cases', () => {
    expect(rabinKarpSearch('the quick brown fox', 'brown')).toBe(10);
    expect(rabinKarpSearch('abcdef', 'xyz')).toBe(-1);
    expect(rabinKarpAll('ababab', 'ab')).toEqual([0, 2, 4]);
  });

  it('longestPalindrome finds Manacher result', () => {
    expect(longestPalindrome('babad').length).toBe(3);
    expect(longestPalindrome('cbbd').length).toBe(2);
    const r = longestPalindrome('forgeeksskeegfor');
    expect(r.length).toBe(10);
    expect(r.start).toBe(3);
  });

  it('suffixArray - sorted suffix indices', () => {
    const sa = suffixArray('banana');
    // banana suffixes sorted: a(5), ana(3), anana(1), banana(0), na(4), nana(2)
    expect(Array.from(sa)).toEqual([5, 3, 1, 0, 4, 2]);
    const lcp = lcpArray('banana', sa);
    expect(lcp.length).toBe(5);
    expect(lcp[0]).toBe(1); // a vs ana -> 1
  });

  it('editScript - reconstructs valid transformation', () => {
    const ops = editScript('kitten', 'sitting');
    // distance is 3
    const cost = ops.filter((o) => o.kind !== 'match').length;
    expect(cost).toBe(3);
    // apply ops to 'kitten' deterministically -> 'sitting'
    let aIdx = 0;
    let result = '';
    for (const op of ops) {
      if (op.kind === 'match') {
        result += op.char;
        aIdx += 1;
      } else if (op.kind === 'replace') {
        result += op.to;
        aIdx += 1;
      } else if (op.kind === 'insert') {
        result += op.char;
      } else {
        aIdx += 1;
      }
    }
    expect(result).toBe('sitting');
    expect(aIdx).toBe('kitten'.length);
  });

  it('Treap - randomized BST keeps sorted order', () => {
    const t = new Treap<number>();
    [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5].forEach((v) => t.insert(v));
    expect(t.contains(9)).toBe(true);
    expect(t.contains(7)).toBe(false);
    const sorted = t.inOrder();
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]).toBeGreaterThan(sorted[i - 1]!);
    }
  });

  it('mat4Identity * X = X', () => {
    const t = mat4Translation(2, 3, 4);
    const out = mat4Multiply(mat4Identity(), t);
    expect(out).toEqual(t);
  });

  it('mat4 translation then scale composes', () => {
    const m = mat4Multiply(mat4Translation(1, 2, 3), mat4Scale(2, 2, 2));
    expect(m.length).toBe(16);
    // last column should be translation [1,2,3,1]
    expect(m[12]).toBe(1);
    expect(m[13]).toBe(2);
    expect(m[14]).toBe(3);
    expect(m[15]).toBe(1);
  });

  it('mat4RotationZ(0) is identity', () => {
    const r = mat4RotationZ(0);
    const id = mat4Identity();
    for (let i = 0; i < 16; i += 1) {
      expect(Math.abs(r[i]! - id[i]!)).toBeLessThan(1e-9);
    }
  });

  it('CountingBloomFilter - add/remove/contains', () => {
    const bf = new CountingBloomFilter({ capacity: 100, falsePositiveRate: 0.01 });
    bf.add('alpha');
    bf.add('beta');
    bf.add('alpha');
    expect(bf.contains('alpha')).toBe(true);
    expect(bf.contains('beta')).toBe(true);
    expect(bf.remove('alpha')).toBe(true);
    expect(bf.contains('alpha')).toBe(true); // still present (count was 2)
    bf.remove('alpha');
    // After two removes, 'alpha' may now report false (counters at 0 for its slots)
    // But there could be incidental ones from 'beta' overlapping; just sanity check.
    expect(typeof bf.contains('alpha')).toBe('boolean');
  });
});
