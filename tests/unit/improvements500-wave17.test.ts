// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  AhoCorasick,
  boyerMooreSearch,
  boyerMooreAll,
  crc32,
  crc32Hex,
  RadixTree,
  rectsOverlap,
  rectIntersection,
  rectsBoundingBox,
  rectContains,
  hilbertXYToIndex,
  hilbertIndexToXY,
  mortonEncode,
  mortonDecode,
  quatFromAxisAngle,
  quatMul,
  quatRotateVec,
  quatSlerp,
  QUAT_IDENTITY,
  simhash64,
  simhashHamming,
  xxhash32,
  xxhash32Hex,
} from '../../src/renderer/improvements500';

describe('ahoCorasick', () => {
  it('finds all overlapping pattern occurrences', () => {
    const ac = new AhoCorasick(['he', 'she', 'his', 'hers']);
    const m = ac.search('ushers');
    const labels = m.map((x) => `${x.patternIndex}@${x.start}-${x.end}`).sort();
    expect(labels).toContain('1@1-4');
    expect(labels).toContain('0@2-4');
    expect(labels).toContain('3@2-6');
  });
  it('returns no matches when none', () => {
    expect(new AhoCorasick(['xyz']).search('abc')).toEqual([]);
  });
});

describe('boyerMoore', () => {
  it('finds first occurrence', () => {
    expect(boyerMooreSearch('abracadabra', 'cad')).toBe(4);
    expect(boyerMooreSearch('abc', 'd')).toBe(-1);
  });
  it('finds all non-overlapping occurrences', () => {
    expect(boyerMooreAll('abababab', 'ab')).toEqual([0, 2, 4, 6]);
  });
  it('empty pattern returns start position', () => {
    expect(boyerMooreSearch('hello', '')).toBe(0);
  });
});

describe('crc32', () => {
  it('matches the well-known checksum for "123456789"', () => {
    expect(crc32('123456789')).toBe(0xcbf43926);
    expect(crc32Hex('123456789')).toBe('cbf43926');
  });
  it('empty input returns 0', () => {
    expect(crc32('')).toBe(0);
  });
});

describe('RadixTree', () => {
  it('stores and retrieves keys with shared prefixes', () => {
    const t = new RadixTree<number>();
    t.set('hello', 1);
    t.set('help', 2);
    t.set('hero', 3);
    expect(t.get('hello')).toBe(1);
    expect(t.get('help')).toBe(2);
    expect(t.get('hero')).toBe(3);
    expect(t.get('hel')).toBeUndefined();
    expect(t.size).toBe(3);
  });
  it('lists keys with a prefix', () => {
    const t = new RadixTree<number>();
    t.set('apple', 1);
    t.set('app', 2);
    t.set('apricot', 3);
    t.set('banana', 4);
    expect(t.keysWithPrefix('app').sort()).toEqual(['app', 'apple']);
    expect(t.keysWithPrefix('z')).toEqual([]);
  });
});

describe('interval2D', () => {
  it('detects overlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
  it('computes intersection and bounding box', () => {
    expect(rectIntersection({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({
      x: 5,
      y: 5,
      w: 5,
      h: 5,
    });
    expect(
      rectsBoundingBox([
        { x: 0, y: 0, w: 5, h: 5 },
        { x: 10, y: 10, w: 5, h: 5 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 15, h: 15 });
    expect(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
  });
});

describe('hilbertCurve', () => {
  it('round-trips on 8x8 grid', () => {
    for (let x = 0; x < 8; x += 1) {
      for (let y = 0; y < 8; y += 1) {
        const d = hilbertXYToIndex(8, x, y);
        const [x2, y2] = hilbertIndexToXY(8, d);
        expect([x2, y2]).toEqual([x, y]);
      }
    }
  });
  it('rejects non-power-of-two side', () => {
    expect(() => hilbertXYToIndex(7, 0, 0)).toThrow();
  });
});

describe('mortonCurve', () => {
  it('round-trips encode/decode', () => {
    for (const [x, y] of [[0, 0], [1, 1], [5, 7], [255, 128], [65535, 65535]] as const) {
      const code = mortonEncode(x, y);
      expect(mortonDecode(code)).toEqual([x, y]);
    }
  });
  it('throws on out-of-range input', () => {
    expect(() => mortonEncode(-1, 0)).toThrow();
    expect(() => mortonEncode(0x10000, 0)).toThrow();
  });
});

describe('quaternion', () => {
  it('identity rotation leaves vectors unchanged', () => {
    const [x, y, z] = quatRotateVec(QUAT_IDENTITY, 1, 2, 3);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(2);
    expect(z).toBeCloseTo(3);
  });
  it('rotates 90 degrees around Z', () => {
    const q = quatFromAxisAngle(0, 0, 1, Math.PI / 2);
    const [x, y, z] = quatRotateVec(q, 1, 0, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
    expect(z).toBeCloseTo(0);
  });
  it('multiply and slerp run', () => {
    const a = quatFromAxisAngle(0, 0, 1, 0);
    const b = quatFromAxisAngle(0, 0, 1, Math.PI / 2);
    const half = quatSlerp(a, b, 0.5);
    const product = quatMul(b, b); // 180 degrees
    expect(half.w).toBeGreaterThan(0);
    expect(Math.abs(product.w)).toBeLessThan(1e-9);
  });
});

describe('simhash', () => {
  it('produces equal hashes for identical inputs', () => {
    expect(simhash64('the quick brown fox')).toBe(simhash64('the quick brown fox'));
  });
  it('similar texts have small Hamming distance', () => {
    const a = simhash64('the quick brown fox jumps over the lazy dog');
    const b = simhash64('the quick brown fox leaps over the lazy dog');
    const c = simhash64('completely unrelated topic about cooking pasta');
    expect(simhashHamming(a, b)).toBeLessThan(simhashHamming(a, c));
  });
});

describe('xxhash32', () => {
  it('matches reference vectors for "Nobody inspects the spammish repetition"', () => {
    // Reference value computed against canonical xxHash32 implementation.
    expect(xxhash32('Nobody inspects the spammish repetition')).toBe(0xe2293b2f);
  });
  it('seed changes the output', () => {
    expect(xxhash32('abc', 0)).not.toBe(xxhash32('abc', 1));
  });
  it('hex output is 8 chars', () => {
    expect(xxhash32Hex('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});
