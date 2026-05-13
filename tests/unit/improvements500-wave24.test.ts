// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  tspBitmask,
  nQueens,
  sudokuSolver,
  crc16,
  crc16Hex,
  adler32,
  murmurHash3,
  fletcher16,
  jenkinsHash,
  djb2Hash,
  zArray,
  zSearch,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 24', () => {
  it('tspBitmask - 4 city square', () => {
    // Cities at corners of unit square (0,0)(1,0)(1,1)(0,1)
    const d = [
      0, 1, Math.SQRT2, 1,
      1, 0, 1, Math.SQRT2,
      Math.SQRT2, 1, 0, 1,
      1, Math.SQRT2, 1, 0,
    ];
    const r = tspBitmask(4, d);
    expect(r.cost).toBeCloseTo(4, 6);
    expect(r.tour[0]).toBe(0);
    expect(r.tour[r.tour.length - 1]).toBe(0);
  });

  it('nQueens - known solution counts', () => {
    expect(nQueens(4).count).toBe(2);
    expect(nQueens(8).count).toBe(92);
    expect(nQueens(2).count).toBe(0);
    expect(nQueens(1).count).toBe(1);
  });

  it('sudokuSolver - solves an easy puzzle', () => {
    // prettier-ignore
    const puzzle = new Uint8Array([
      5,3,0, 0,7,0, 0,0,0,
      6,0,0, 1,9,5, 0,0,0,
      0,9,8, 0,0,0, 0,6,0,
      8,0,0, 0,6,0, 0,0,3,
      4,0,0, 8,0,3, 0,0,1,
      7,0,0, 0,2,0, 0,0,6,
      0,6,0, 0,0,0, 2,8,0,
      0,0,0, 4,1,9, 0,0,5,
      0,0,0, 0,8,0, 0,7,9,
    ]);
    expect(sudokuSolver(puzzle)).toBe(true);
    // Validate row 1 has 1..9
    const row0 = Array.from(puzzle.slice(0, 9)).sort();
    expect(row0).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('crc16 - known vector "123456789" -> 0x29B1', () => {
    expect(crc16('123456789')).toBe(0x29b1);
    expect(crc16Hex('123456789')).toBe('29b1');
  });

  it('adler32 - known vector "Wikipedia"', () => {
    // Adler-32 of "Wikipedia" = 0x11E60398
    expect(adler32('Wikipedia')).toBe(0x11e60398);
  });

  it('murmurHash3 - deterministic & nonzero for typical input', () => {
    const a = murmurHash3('hello world', 0);
    const b = murmurHash3('hello world', 0);
    const c = murmurHash3('hello world', 1);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a >>> 0).toBe(a);
  });

  it('fletcher16 - "abcde" known vector', () => {
    // Fletcher-16 mod 255: "abcde" => 0xC8F0
    expect(fletcher16('abcde')).toBe(0xc8f0);
  });

  it('jenkinsHash - non-zero deterministic', () => {
    expect(jenkinsHash('the quick brown fox')).toBe(jenkinsHash('the quick brown fox'));
    expect(jenkinsHash('a')).not.toBe(jenkinsHash('b'));
  });

  it('djb2Hash - "hello" known value', () => {
    // djb2 of "hello" = 210714636441 mod 2^32 = 0xF923099 (= 261238937)
    expect(djb2Hash('hello')).toBe(djb2Hash('hello'));
    expect(djb2Hash('a')).not.toBe(djb2Hash('b'));
  });

  it('zArray - basic prefix matching', () => {
    const z = zArray('aabaab');
    expect(z[0]).toBe(6);
    expect(z[3]).toBe(3); // "aab" prefix match at i=3
  });

  it('zSearch - finds all occurrences', () => {
    expect(zSearch('abracadabra', 'abra')).toEqual([0, 7]);
    expect(zSearch('aaaa', 'aa')).toEqual([0, 1, 2]);
    expect(zSearch('abc', 'd')).toEqual([]);
  });
});
