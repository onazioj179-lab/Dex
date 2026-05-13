// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  mergeSort,
  KdTree2,
  WeightedRandom,
  dateRangeDays,
  dateRangeMonths,
  daysBetween,
  parseCron,
  nextCronAfter,
  cidrMatch,
  chunkArray,
  flattenObject,
  unflatten,
  htmlDecode,
  structClone,
} from '../../src/renderer/improvements500';

describe('mergeSort', () => {
  it('is stable across equal keys', () => {
    const items = [
      { k: 1, id: 'a' }, { k: 2, id: 'b' }, { k: 1, id: 'c' }, { k: 2, id: 'd' }, { k: 1, id: 'e' },
    ];
    const sorted = mergeSort(items, (a, b) => a.k - b.k);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });
  it('does not mutate original', () => {
    const original = [3, 1, 2];
    const sorted = mergeSort(original);
    expect(original).toEqual([3, 1, 2]);
    expect(sorted).toEqual([1, 2, 3]);
  });
});

describe('KdTree2', () => {
  const pts = [
    { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 2, y: 8 },
  ];
  const tree = new KdTree2(pts);
  it('nearest neighbor', () => {
    expect(tree.nearest({ x: 6, y: 5 })).toEqual({ x: 5, y: 5 });
    expect(tree.nearest({ x: -1, y: -1 })).toEqual({ x: 0, y: 0 });
  });
  it('range query', () => {
    const r = tree.rangeQuery(0, 0, 5, 5);
    expect(r).toContainEqual({ x: 0, y: 0 });
    expect(r).toContainEqual({ x: 1, y: 1 });
    expect(r).toContainEqual({ x: 5, y: 5 });
    expect(r).not.toContainEqual({ x: 10, y: 10 });
  });
  it('empty tree returns null', () => {
    expect(new KdTree2([]).nearest({ x: 0, y: 0 })).toBeNull();
  });
});

describe('WeightedRandom', () => {
  it('respects weights with deterministic random', () => {
    let seq = [0.0, 0.55, 0.95];
    let i = 0;
    const w = new WeightedRandom(
      [{ item: 'a', weight: 5 }, { item: 'b', weight: 3 }, { item: 'c', weight: 2 }],
      () => seq[i++ % seq.length]!,
    );
    // total=10. cumulative=[5,8,10]. 0.0*10=0 -> a, 0.55*10=5.5 -> b, 0.95*10=9.5 -> c
    expect(w.pick()).toBe('a');
    expect(w.pick()).toBe('b');
    expect(w.pick()).toBe('c');
  });
  it('rejects invalid weights', () => {
    expect(() => new WeightedRandom([{ item: 'x', weight: -1 }])).toThrow();
    expect(() => new WeightedRandom([])).toThrow();
  });
});

describe('dateRange', () => {
  it('dateRangeDays iterates UTC days', () => {
    const days = Array.from(dateRangeDays(new Date('2025-01-30T00:00:00Z'), new Date('2025-02-03T00:00:00Z')));
    expect(days.length).toBe(4);
    expect(days[0]!.toISOString()).toBe('2025-01-30T00:00:00.000Z');
    expect(days[3]!.toISOString()).toBe('2025-02-02T00:00:00.000Z');
  });
  it('dateRangeMonths iterates first-of-month UTC', () => {
    const months = Array.from(dateRangeMonths(new Date('2025-01-15T00:00:00Z'), new Date('2025-04-10T00:00:00Z')));
    expect(months.length).toBe(4);
    expect(months[0]!.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });
  it('daysBetween', () => {
    expect(daysBetween(new Date('2025-01-01T12:00:00Z'), new Date('2025-01-04T18:00:00Z'))).toBe(3);
  });
});

describe('cronLite', () => {
  it('parses fields', () => {
    const c = parseCron('*/15 9-17 * * 1-5');
    expect(c.minute.has(0)).toBe(true);
    expect(c.minute.has(15)).toBe(true);
    expect(c.minute.has(30)).toBe(true);
    expect(c.minute.has(45)).toBe(true);
    expect(c.minute.has(7)).toBe(false);
    expect(c.hour.has(9)).toBe(true);
    expect(c.hour.has(17)).toBe(true);
    expect(c.hour.has(8)).toBe(false);
    expect(c.dow.has(1)).toBe(true);
    expect(c.dow.has(5)).toBe(true);
    expect(c.dow.has(0)).toBe(false);
  });
  it('nextCronAfter computes next run', () => {
    const after = new Date(2025, 0, 1, 12, 7, 0); // Wed Jan 1 2025 12:07 local
    const next = nextCronAfter('*/15 * * * *', after);
    expect(next.getMinutes()).toBe(15);
  });
  it('rejects bad expression', () => {
    expect(() => parseCron('not enough')).toThrow();
    expect(() => parseCron('60 * * * *')).toThrow();
  });
});

describe('cidrMatch', () => {
  it('IPv4 within /24', () => {
    expect(cidrMatch('192.168.1.0/24', '192.168.1.55')).toBe(true);
    expect(cidrMatch('192.168.1.0/24', '192.168.2.55')).toBe(false);
  });
  it('IPv4 /32 exact', () => {
    expect(cidrMatch('10.0.0.5/32', '10.0.0.5')).toBe(true);
    expect(cidrMatch('10.0.0.5/32', '10.0.0.6')).toBe(false);
  });
  it('IPv4 /0 matches all', () => {
    expect(cidrMatch('0.0.0.0/0', '8.8.8.8')).toBe(true);
  });
  it('IPv6 within /64', () => {
    expect(cidrMatch('2001:db8::/32', '2001:db8::1')).toBe(true);
    expect(cidrMatch('2001:db8::/32', '2001:db9::1')).toBe(false);
  });
  it('rejects malformed', () => {
    expect(cidrMatch('not-cidr', '1.2.3.4')).toBe(false);
    expect(cidrMatch('1.2.3.4/40', '1.2.3.4')).toBe(false);
  });
});

describe('chunkArray', () => {
  it('splits evenly', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
  it('last chunk shorter', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('rejects bad size', () => {
    expect(() => chunkArray([1], 0)).toThrow();
    expect(() => chunkArray([1], -1)).toThrow();
  });
});

describe('flattenObject / unflatten', () => {
  const nested = {
    a: 1,
    b: { c: 2, d: { e: 3 } },
    f: [10, 20, { g: 30 }],
  };
  it('flatten produces dot keys', () => {
    const flat = flattenObject(nested);
    expect(flat['a']).toBe(1);
    expect(flat['b.c']).toBe(2);
    expect(flat['b.d.e']).toBe(3);
    expect(flat['f.0']).toBe(10);
    expect(flat['f.2.g']).toBe(30);
  });
  it('unflatten reverses flatten', () => {
    const flat = flattenObject(nested);
    const back = unflatten(flat);
    expect(back).toEqual(nested);
  });
});

describe('htmlDecode', () => {
  it('decodes named, decimal, hex entities', () => {
    expect(htmlDecode('&lt;a&gt;&amp;hi&quot;')).toBe('<a>&hi"');
    expect(htmlDecode('&#65;&#x42;')).toBe('AB');
    expect(htmlDecode('plain')).toBe('plain');
  });
  it('leaves unknown entities intact', () => {
    expect(htmlDecode('&unknown;')).toBe('&unknown;');
  });
});

describe('structClone', () => {
  it('deep clones plain objects', () => {
    const orig = { a: 1, b: { c: [1, 2, 3] } };
    const cloned = structClone(orig);
    expect(cloned).toEqual(orig);
    expect(cloned).not.toBe(orig);
    expect(cloned.b).not.toBe(orig.b);
    expect(cloned.b.c).not.toBe(orig.b.c);
  });
  it('clones Date and RegExp', () => {
    const d = new Date(123456);
    const r = /abc/gi;
    const cd = structClone(d);
    const cr = structClone(r);
    expect(cd.getTime()).toBe(123456);
    expect(cr.source).toBe('abc');
    expect(cr.flags).toBe('gi');
  });
});
