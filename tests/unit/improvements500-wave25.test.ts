// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  nextGreaterElements,
  largestRectangleHistogram,
  slidingWindowMax,
  slidingWindowMin,
  kosarajuScc,
  mergeKSortedLists,
  WaveletTree,
  grahamScan,
  polygonContains,
  segmentsIntersect,
  huffmanEncode,
  huffmanDecode,
  rleEncode,
  rleDecode,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 25', () => {
  it('nextGreaterElements - canonical', () => {
    const r = nextGreaterElements([2, 1, 3, 4, 1]);
    expect(Array.from(r)).toEqual([2, 2, 3, -1, -1]);
  });

  it('largestRectangleHistogram - canonical', () => {
    expect(largestRectangleHistogram([2, 1, 5, 6, 2, 3])).toBe(10);
  });

  it('slidingWindowMax/Min - window 3 over [1,3,-1,-3,5,3,6,7]', () => {
    const arr = [1, 3, -1, -3, 5, 3, 6, 7];
    expect(Array.from(slidingWindowMax(arr, 3))).toEqual([3, 3, 5, 5, 6, 7]);
    expect(Array.from(slidingWindowMin(arr, 3))).toEqual([-1, -3, -3, -3, 3, 3]);
  });

  it('kosarajuScc - 3 components', () => {
    // 0 -> 1 -> 2 -> 0 (cycle), 3 -> 4, 5
    const graph = [[1], [2], [0], [4], [], []];
    const r = kosarajuScc(graph);
    expect(r.count).toBe(4);
    expect(r.componentOf[0]).toBe(r.componentOf[1]);
    expect(r.componentOf[1]).toBe(r.componentOf[2]);
    expect(r.componentOf[3]).not.toBe(r.componentOf[4]);
  });

  it('mergeKSortedLists - merges 3 lists', () => {
    expect(mergeKSortedLists([[1, 4, 7], [2, 5, 8], [3, 6, 9]])).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('WaveletTree - rank and quantile', () => {
    const tree = new WaveletTree([3, 1, 4, 1, 5, 9, 2, 6, 5, 3]);
    expect(tree.rank(1, 10)).toBe(2);
    expect(tree.rank(5, 10)).toBe(2);
    expect(tree.quantile(0, 10, 0)).toBe(1); // smallest
    expect(tree.quantile(0, 10, 9)).toBe(9); // largest
  });

  it('grahamScan - convex hull of square + interior point', () => {
    const hull = grahamScan([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 }, // interior
    ]);
    expect(hull.length).toBe(4);
  });

  it('polygonContains - inside vs outside', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(polygonContains(poly, { x: 2, y: 2 })).toBe(true);
    expect(polygonContains(poly, { x: 5, y: 5 })).toBe(false);
  });

  it('segmentsIntersect - X crossing', () => {
    const r = segmentsIntersect(
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 2, y: 0 },
    );
    expect(r).not.toBeNull();
    expect(r!.x).toBeCloseTo(1);
    expect(r!.y).toBeCloseTo(1);
  });

  it('segmentsIntersect - parallel returns null', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }),
    ).toBeNull();
  });

  it('huffmanEncode/Decode round-trip', () => {
    const data = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
    const encoded = huffmanEncode(data);
    const decoded = huffmanDecode(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(data));
  });

  it('rleEncode/Decode round-trip', () => {
    const input = new Uint8Array([1, 1, 1, 2, 2, 3, 3, 3, 3, 4]);
    const enc = rleEncode(input);
    expect(Array.from(enc)).toEqual([3, 1, 2, 2, 4, 3, 1, 4]);
    expect(Array.from(rleDecode(enc))).toEqual(Array.from(input));
  });
});
