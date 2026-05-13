// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  quickSort,
  binarySearch,
  lowerBound,
  upperBound,
  shuffleSeeded,
  zip,
  zipLongest,
  unzip,
  groupBy,
  keyBy,
  countBy,
  rangeIter,
  rangeArray,
  enumerate,
  debouncePromise,
  BatchScheduler,
  expoBackoff,
  uuidV7,
} from '../../src/renderer/improvements500';

describe('quickSort', () => {
  it('sorts ascending', () => {
    const arr = [5, 1, 4, 2, 8, 3, 7, 6];
    quickSort(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('uses comparator', () => {
    const arr = [{ p: 3 }, { p: 1 }, { p: 2 }];
    quickSort(arr, (a, b) => a.p - b.p);
    expect(arr.map((x) => x.p)).toEqual([1, 2, 3]);
  });
  it('handles small arrays via insertion path', () => {
    const arr = [3, 1, 2];
    quickSort(arr);
    expect(arr).toEqual([1, 2, 3]);
  });
  it('handles large random arrays', () => {
    const arr = Array.from({ length: 500 }, () => Math.floor(Math.random() * 1000));
    const expected = [...arr].sort((a, b) => a - b);
    quickSort(arr);
    expect(arr).toEqual(expected);
  });
});

describe('binarySearch / bounds', () => {
  const arr = [1, 3, 3, 3, 5, 7, 9];
  it('finds value', () => {
    expect(binarySearch(arr, 5)).toBe(4);
    expect(binarySearch(arr, 4)).toBe(-1);
  });
  it('lowerBound and upperBound', () => {
    expect(lowerBound(arr, 3)).toBe(1);
    expect(upperBound(arr, 3)).toBe(4);
    expect(lowerBound(arr, 0)).toBe(0);
    expect(upperBound(arr, 100)).toBe(arr.length);
  });
});

describe('shuffleSeeded', () => {
  it('is deterministic for same seed', () => {
    const a = shuffleSeeded([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 42);
    const b = shuffleSeeded([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 42);
    expect(a).toEqual(b);
    expect(a.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('different seeds produce different orders for non-trivial arrays', () => {
    const a = shuffleSeeded([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1);
    const b = shuffleSeeded([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2);
    expect(a).not.toEqual(b);
  });
});

describe('zip / unzip', () => {
  it('zip stops at shortest', () => {
    expect(zip([1, 2, 3], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]);
  });
  it('zipLongest pads with filler', () => {
    expect(zipLongest(0, [1, 2, 3], [10, 20])).toEqual([[1, 10], [2, 20], [3, 0]]);
  });
  it('unzip is inverse of zip', () => {
    const z = zip([1, 2, 3], ['a', 'b', 'c']);
    const [nums, letters] = unzip(z);
    expect(nums).toEqual([1, 2, 3]);
    expect(letters).toEqual(['a', 'b', 'c']);
  });
});

describe('groupBy / keyBy / countBy', () => {
  const items = [
    { id: 1, kind: 'a' },
    { id: 2, kind: 'b' },
    { id: 3, kind: 'a' },
  ];
  it('groupBy', () => {
    const g = groupBy(items, (i) => i.kind);
    expect(g.a?.length).toBe(2);
    expect(g.b?.length).toBe(1);
  });
  it('keyBy', () => {
    const k = keyBy(items, (i) => i.id);
    expect(k['2']?.kind).toBe('b');
  });
  it('countBy', () => {
    const c = countBy(items, (i) => i.kind);
    expect(c.a).toBe(2);
    expect(c.b).toBe(1);
  });
});

describe('rangeIter / enumerate', () => {
  it('range single arg', () => {
    expect(rangeArray(5)).toEqual([0, 1, 2, 3, 4]);
  });
  it('range start/stop/step', () => {
    expect(rangeArray(2, 10, 2)).toEqual([2, 4, 6, 8]);
    expect(rangeArray(10, 0, -2)).toEqual([10, 8, 6, 4, 2]);
  });
  it('rangeIter rejects step 0', () => {
    expect(() => Array.from(rangeIter(0, 5, 0))).toThrow();
  });
  it('enumerate yields [index, item]', () => {
    expect(Array.from(enumerate(['a', 'b', 'c']))).toEqual([[0, 'a'], [1, 'b'], [2, 'c']]);
    expect(Array.from(enumerate(['x'], 5))).toEqual([[5, 'x']]);
  });
});

describe('debouncePromise', () => {
  it('coalesces multiple calls and uses last args', async () => {
    const fn = vi.fn(async (n: number) => n * 2);
    const d = debouncePromise(fn, 20);
    const p1 = d(1);
    const p2 = d(2);
    const p3 = d(3);
    const [a, b, c] = await Promise.all([p1, p2, p3]);
    expect(a).toBe(6); expect(b).toBe(6); expect(c).toBe(6);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });
  it('cancel rejects pending', async () => {
    const fn = vi.fn(async (n: number) => n);
    const d = debouncePromise(fn, 50);
    const p = d(1);
    d.cancel();
    await expect(p).rejects.toThrow();
  });
});

describe('BatchScheduler', () => {
  it('flushes after window', async () => {
    const flushes: number[][] = [];
    const b = new BatchScheduler<number>({ windowMs: 20, onFlush: (batch) => { flushes.push(batch); } });
    b.push(1); b.push(2); b.push(3);
    await new Promise((r) => setTimeout(r, 40));
    expect(flushes).toEqual([[1, 2, 3]]);
  });
  it('flushes immediately at maxBatch', async () => {
    const flushes: number[][] = [];
    const b = new BatchScheduler<number>({ windowMs: 1000, maxBatch: 2, onFlush: (batch) => { flushes.push(batch); } });
    b.push(1); b.push(2);
    expect(flushes).toEqual([[1, 2]]);
    b.push(3);
    b.flush();
    expect(flushes).toEqual([[1, 2], [3]]);
  });
});

describe('expoBackoff', () => {
  it('no jitter returns capped exponential', () => {
    expect(expoBackoff(0, { baseMs: 100, jitter: 'none' })).toBe(100);
    expect(expoBackoff(3, { baseMs: 100, jitter: 'none' })).toBe(800);
    expect(expoBackoff(10, { baseMs: 100, maxMs: 5000, jitter: 'none' })).toBe(5000);
  });
  it('full jitter respects cap', () => {
    const v = expoBackoff(2, { baseMs: 100, jitter: 'full', random: () => 0.5 });
    expect(v).toBe(200); // 0.5 * (100 * 4)
  });
  it('rejects bad input', () => {
    expect(() => expoBackoff(-1, { baseMs: 100 })).toThrow();
    expect(() => expoBackoff(0, { baseMs: 0 })).toThrow();
  });
});

describe('uuidV7', () => {
  it('matches version 7 + variant 10xx', () => {
    const id = uuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('encodes timestamp prefix', () => {
    const fixed = 0x0182_b1f0_0000; // arbitrary
    const id = uuidV7({ now: () => fixed, random: () => 0 });
    const tsHex = fixed.toString(16).padStart(12, '0');
    const expectedPrefix = `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}`;
    expect(id.startsWith(expectedPrefix)).toBe(true);
  });
  it('two ids close in time sort lex same as time order', () => {
    const a = uuidV7({ now: () => 1000, random: () => 0 });
    const b = uuidV7({ now: () => 2000, random: () => 0 });
    expect(a < b).toBe(true);
  });
});
