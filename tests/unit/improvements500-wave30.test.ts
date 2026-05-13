// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  josephus,
  catalan,
  catalanList,
  stirling2,
  bernoulliNumbers,
  hammingDistance,
  hammingDistanceBytes,
  soundex,
  cosineSimilarity,
  nGramTokenize,
  nGramArray,
  nextPermutation,
  prevPermutation,
  partitionInteger,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 30', () => {
  it('josephus - known small cases', () => {
    expect(josephus(1, 1)).toBe(0);
    expect(josephus(7, 3)).toBe(3); // classic
    expect(josephus(5, 2)).toBe(2);
  });

  it('catalan - first eight numbers', () => {
    expect(catalanList(7)).toEqual([1, 1, 2, 5, 14, 42, 132, 429]);
    expect(catalan(0)).toBe(1);
    expect(catalan(5)).toBe(42);
  });

  it('stirling2 - known values', () => {
    expect(stirling2(0, 0)).toBe(1);
    expect(stirling2(4, 2)).toBe(7);
    expect(stirling2(5, 3)).toBe(25);
    expect(stirling2(5, 5)).toBe(1);
    expect(stirling2(3, 5)).toBe(0);
  });

  it('bernoulliNumbers - first values match known rationals', () => {
    const B = bernoulliNumbers(8);
    expect(B[0]).toEqual({ num: 1n, den: 1n });
    expect(B[1]).toEqual({ num: 1n, den: 2n });
    expect(B[2]).toEqual({ num: 1n, den: 6n });
    expect(B[3]).toEqual({ num: 0n, den: 1n });
    expect(B[4]).toEqual({ num: -1n, den: 30n });
    expect(B[6]).toEqual({ num: 1n, den: 42n });
    expect(B[8]).toEqual({ num: -1n, den: 30n });
  });

  it('hammingDistance / hammingDistanceBytes', () => {
    expect(hammingDistance('karolin', 'kathrin')).toBe(3);
    expect(hammingDistance('1011101', '1001001')).toBe(2);
    expect(hammingDistanceBytes(new Uint8Array([0xff, 0x00]), new Uint8Array([0x0f, 0xf0]))).toBe(8);
    expect(() => hammingDistance('a', 'bc')).toThrow();
  });

  it('soundex - canonical examples', () => {
    expect(soundex('Robert')).toBe('R163');
    expect(soundex('Rupert')).toBe('R163');
    expect(soundex('Rubin')).toBe('R150');
    expect(soundex('Ashcraft')).toBe('A261');
    expect(soundex('')).toBe('0000');
  });

  it('cosineSimilarity - known values', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([1, 1], [1, -1])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('nGramTokenize / nGramArray', () => {
    expect(nGramTokenize('abcd', 2)).toEqual(['ab', 'bc', 'cd']);
    expect(nGramTokenize('ab', 3)).toEqual([]);
    expect(nGramArray([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [2, 3, 4]]);
  });

  it('nextPermutation / prevPermutation - cycle through permutations', () => {
    const a = [1, 2, 3];
    expect(nextPermutation(a)).toBe(true);
    expect(a).toEqual([1, 3, 2]);
    expect(nextPermutation(a)).toBe(true);
    expect(a).toEqual([2, 1, 3]);
    const last = [3, 2, 1];
    expect(nextPermutation(last)).toBe(false);
    expect(last).toEqual([1, 2, 3]); // wrapped
    const b = [2, 1, 3];
    expect(prevPermutation(b)).toBe(true);
    expect(b).toEqual([1, 3, 2]);
  });

  it('partitionInteger - count and contents', () => {
    expect(partitionInteger(0)).toEqual([[]]);
    expect(partitionInteger(4).length).toBe(5);
    expect(partitionInteger(5).length).toBe(7);
    const p4 = partitionInteger(4);
    // Each partition sums to 4 and is sorted descending
    for (const part of p4) {
      expect(part.reduce((a, b) => a + b, 0)).toBe(4);
      for (let i = 1; i < part.length; i += 1) {
        expect(part[i - 1]).toBeGreaterThanOrEqual(part[i]!);
      }
    }
  });
});
