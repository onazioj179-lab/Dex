// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Wavelet tree over a sequence of integers. Supports rank/quantile in
 * O(log sigma). Construction O(n log sigma).
 */

interface WaveletNode {
  bitmap: Uint8Array;
  prefixOnes: Int32Array; // prefix sum of 1-bits, length n+1
  lo: number;
  hi: number;
  left?: WaveletNode;
  right?: WaveletNode;
}

function buildNode(values: number[], lo: number, hi: number): WaveletNode {
  const n = values.length;
  const bitmap = new Uint8Array(n);
  const prefixOnes = new Int32Array(n + 1);
  if (lo === hi) {
    return { bitmap, prefixOnes, lo, hi };
  }
  const mid = Math.floor((lo + hi) / 2);
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (values[i]! <= mid) {
      bitmap[i] = 0;
      left.push(values[i]!);
    } else {
      bitmap[i] = 1;
      right.push(values[i]!);
    }
    prefixOnes[i + 1] = prefixOnes[i]! + bitmap[i]!;
  }
  const node: WaveletNode = { bitmap, prefixOnes, lo, hi };
  node.left = buildNode(left, lo, mid);
  node.right = buildNode(right, mid + 1, hi);
  return node;
}

export class WaveletTree {
  private root: WaveletNode;
  private size: number;
  constructor(values: ArrayLike<number>) {
    const arr: number[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i]!;
      arr.push(v);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    this.size = arr.length;
    if (this.size === 0) {
      lo = 0;
      hi = 0;
    }
    this.root = buildNode(arr, lo, hi);
  }

  /** Number of occurrences of `value` in prefix [0, position). */
  rank(value: number, position: number): number {
    if (position <= 0) return 0;
    let node = this.root;
    let l = 0;
    let r = Math.min(position, this.size);
    while (node.lo !== node.hi) {
      const mid = Math.floor((node.lo + node.hi) / 2);
      const onesL = node.prefixOnes[l]!;
      const onesR = node.prefixOnes[r]!;
      const zerosL = l - onesL;
      const zerosR = r - onesR;
      if (value <= mid) {
        l = zerosL;
        r = zerosR;
        node = node.left!;
      } else {
        l = onesL;
        r = onesR;
        node = node.right!;
      }
    }
    return r - l;
  }

  /** k-th smallest value (0-indexed) in range [lo, hi). */
  quantile(lo: number, hi: number, k: number): number {
    let node = this.root;
    let l = lo;
    let r = hi;
    while (node.lo !== node.hi) {
      const onesL = node.prefixOnes[l]!;
      const onesR = node.prefixOnes[r]!;
      const zerosL = l - onesL;
      const zerosR = r - onesR;
      const zerosCount = zerosR - zerosL;
      if (k < zerosCount) {
        l = zerosL;
        r = zerosR;
        node = node.left!;
      } else {
        k -= zerosCount;
        l = onesL;
        r = onesR;
        node = node.right!;
      }
    }
    return node.lo;
  }
}
