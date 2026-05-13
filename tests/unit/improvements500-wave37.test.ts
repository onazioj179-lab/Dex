// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  base91Encode,
  base91Decode,
  sha256Hex,
  hmacSha256,
  lzssCompress,
  lzssDecompress,
  KdTree,
  Bm25,
  ordinalSuffix,
  businessDaysBetween,
  longestCommonSubstring,
  gaussianBlur1D,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 37', () => {
  it('base91 round trip', () => {
    const data = new Uint8Array([0, 1, 2, 3, 4, 200, 199, 17, 33, 99, 50]);
    const enc = base91Encode(data);
    const dec = base91Decode(enc);
    expect(Array.from(dec)).toEqual(Array.from(data));
  });

  it('sha256 known vectors', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hmac-sha256 RFC4231 case 1', () => {
    const key = new Uint8Array(20).fill(0x0b);
    const msg = new TextEncoder().encode('Hi There');
    const mac = hmacSha256(key, msg);
    let hex = '';
    for (let i = 0; i < mac.length; i++) hex += mac[i].toString(16).padStart(2, '0');
    expect(hex).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  });

  it('lzss round trip', () => {
    const text = new TextEncoder().encode(
      'the quick brown fox jumps over the lazy dog. the quick brown fox jumps again.',
    );
    const compressed = lzssCompress(text);
    const back = lzssDecompress(compressed);
    expect(Array.from(back)).toEqual(Array.from(text));
  });

  it('kd-tree finds nearest neighbour', () => {
    const pts = [
      { coords: [0, 0] },
      { coords: [10, 10] },
      { coords: [3, 4] },
      { coords: [7, 1] },
    ];
    const tree = new KdTree(pts);
    const nn = tree.knn([3, 5], 1);
    expect(nn[0].coords).toEqual([3, 4]);
  });

  it('bm25 ranks query match', () => {
    const bm = new Bm25();
    bm.addDocument(['cats', 'and', 'dogs']);
    bm.addDocument(['the', 'fox', 'jumps']);
    bm.addDocument(['cats', 'cats', 'are', 'great']);
    const r = bm.query(['cats']);
    expect(r[0].docId).toBe(2);
  });

  it('case converters', () => {
    expect(longestCommonSubstring('abcdef', 'zcdez').substring).toBe('cde');
    expect(longestCommonSubstring('hello', 'world').length).toBe(1);
  });

  it('ordinalSuffix handles edge cases', () => {
    expect(ordinalSuffix(1)).toBe('st');
    expect(ordinalSuffix(2)).toBe('nd');
    expect(ordinalSuffix(11)).toBe('th');
    expect(ordinalSuffix(21)).toBe('st');
    expect(ordinalSuffix(112)).toBe('th');
  });

  it('business days between weekdays', () => {
    // Mon Jan 1 2024 .. Mon Jan 8 2024 -> 5 weekdays
    const start = new Date(Date.UTC(2024, 0, 1));
    const end = new Date(Date.UTC(2024, 0, 8));
    expect(businessDaysBetween(start, end)).toBe(5);
  });

  it('gaussian blur 1D preserves peak', () => {
    const blurred = gaussianBlur1D([0, 0, 0, 1, 0, 0, 0], 1);
    expect(blurred.length).toBe(7);
    expect(blurred[3]).toBeGreaterThan(blurred[2]);
    expect(blurred[3]).toBeGreaterThan(blurred[4]);
  });
});
