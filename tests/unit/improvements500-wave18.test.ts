// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  CuckooFilter,
  CountMinSketch,
  HyperLogLog,
  splitmix64,
  mergeIntervals,
  subtractIntervals,
  intersectIntervals,
  polygonArea,
  polygonSignedArea,
  polygonCentroid,
  isClockwise,
  convexHull,
  RoundRobin,
  parseTsv,
  writeTsv,
  code128Checksum,
  code128Encode,
} from '../../src/renderer/improvements500';

describe('CuckooFilter', () => {
  it('add/contains/remove works', () => {
    const f = new CuckooFilter({ capacity: 1024 });
    f.add('alpha');
    f.add('beta');
    expect(f.contains('alpha')).toBe(true);
    expect(f.contains('beta')).toBe(true);
    expect(f.remove('alpha')).toBe(true);
    expect(f.contains('alpha')).toBe(false);
  });
  it('size tracks insertions and removals', () => {
    const f = new CuckooFilter({ capacity: 256 });
    for (let i = 0; i < 50; i += 1) f.add(`k${i}`);
    expect(f.size).toBe(50);
  });
});

describe('CountMinSketch', () => {
  it('estimate is a lower-bounded upper bound', () => {
    const s = new CountMinSketch({ width: 1024, depth: 4, seed: 1 });
    for (let i = 0; i < 10; i += 1) s.add('hot');
    s.add('cold');
    expect(s.estimate('hot')).toBeGreaterThanOrEqual(10);
    expect(s.estimate('cold')).toBeGreaterThanOrEqual(1);
    expect(s.estimate('absent')).toBeGreaterThanOrEqual(0);
  });
});

describe('HyperLogLog', () => {
  it('estimates cardinality within ~5% on 5000 unique items', () => {
    const hll = new HyperLogLog({ precision: 12 });
    for (let i = 0; i < 5000; i += 1) hll.add(`item-${i}`);
    const est = hll.estimate();
    expect(est).toBeGreaterThan(4500);
    expect(est).toBeLessThan(5500);
  });
});

describe('splitmix64', () => {
  it('is deterministic from the same seed', () => {
    const a = splitmix64(42n);
    const b = splitmix64(42n);
    expect(a.next64()).toBe(b.next64());
    expect(a.next32()).toBe(b.next32());
  });
  it('nextFloat is in [0,1)', () => {
    const r = splitmix64(7);
    for (let i = 0; i < 50; i += 1) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('interval1D', () => {
  it('merges overlapping intervals', () => {
    expect(
      mergeIntervals([
        { start: 1, end: 3 },
        { start: 2, end: 5 },
        { start: 8, end: 10 },
      ]),
    ).toEqual([
      { start: 1, end: 5 },
      { start: 8, end: 10 },
    ]);
  });
  it('subtracts and intersects', () => {
    expect(
      subtractIntervals([{ start: 0, end: 10 }], [{ start: 3, end: 5 }]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
    expect(
      intersectIntervals([{ start: 0, end: 5 }], [{ start: 3, end: 8 }]),
    ).toEqual([{ start: 3, end: 5 }]);
  });
});

describe('polygonArea', () => {
  it('square has correct area, centroid, winding', () => {
    const sq: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    expect(polygonArea(sq)).toBe(16);
    expect(polygonSignedArea(sq)).toBe(16);
    expect(isClockwise(sq)).toBe(false);
    expect(polygonCentroid(sq)).toEqual([2, 2]);
  });
});

describe('convexHull', () => {
  it('returns the bounding rectangle for points inside it', () => {
    const pts: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2],
      [1, 1],
      [3, 3],
    ];
    const hull = convexHull(pts);
    expect(hull.length).toBe(4);
    const set = new Set(hull.map((p) => p.join(',')));
    expect(set.has('0,0')).toBe(true);
    expect(set.has('4,0')).toBe(true);
    expect(set.has('4,4')).toBe(true);
    expect(set.has('0,4')).toBe(true);
  });
});

describe('RoundRobin', () => {
  it('cycles through entries', () => {
    const rr = new RoundRobin(['a', 'b', 'c']);
    expect(rr.next()).toBe('a');
    expect(rr.next()).toBe('b');
    expect(rr.next()).toBe('c');
    expect(rr.next()).toBe('a');
  });
  it('nextWhere skips by predicate', () => {
    const rr = new RoundRobin([1, 2, 3, 4]);
    expect(rr.nextWhere((n) => n % 2 === 0)).toBe(2);
    expect(rr.nextWhere((n) => n > 3)).toBe(4);
  });
});

describe('tsvParse', () => {
  it('round-trips simple data', () => {
    const rows = [
      ['name', 'age'],
      ['Ada', '36'],
      ['Tab\there', '7'],
    ];
    const tsv = writeTsv(rows);
    const back = parseTsv(tsv);
    expect(back).toEqual(rows);
  });
  it('handles quoted fields with embedded newlines', () => {
    const tsv = `a\t"line1\nline2"\nb\tc`;
    const rows = parseTsv(tsv);
    expect(rows).toEqual([
      ['a', 'line1\nline2'],
      ['b', 'c'],
    ]);
  });
});

describe('barcode128', () => {
  it('checksum is deterministic and in [0, 102]', () => {
    const c = code128Checksum('PJJ123C');
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(102);
    expect(code128Checksum('PJJ123C')).toBe(c);
  });
  it('encoded pattern starts with start-B and is all 0/1', () => {
    const bits = code128Encode('HELLO');
    expect(bits.startsWith('11010010000')).toBe(true);
    expect(/^[01]+$/.test(bits)).toBe(true);
  });
  it('rejects non-subset-B characters', () => {
    expect(() => code128Encode(String.fromCharCode(7))).toThrow();
  });
});
