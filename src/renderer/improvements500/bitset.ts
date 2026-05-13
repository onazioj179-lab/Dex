// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Compact bit set backed by a Uint32Array. Fixed capacity at construction.
 */

export class BitSet {
  private readonly words: Uint32Array;
  private readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('BitSet: capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.words = new Uint32Array((capacity + 31) >>> 5);
  }

  size(): number { return this.capacity; }

  set(i: number): void {
    this.checkRange(i);
    this.words[i >>> 5]! |= (1 << (i & 31)) >>> 0;
  }

  clear(i: number): void {
    this.checkRange(i);
    this.words[i >>> 5]! &= ~((1 << (i & 31)) >>> 0);
  }

  toggle(i: number): void {
    this.checkRange(i);
    this.words[i >>> 5]! ^= (1 << (i & 31)) >>> 0;
  }

  has(i: number): boolean {
    this.checkRange(i);
    return ((this.words[i >>> 5]! >>> (i & 31)) & 1) === 1;
  }

  popcount(): number {
    let total = 0;
    for (let w = 0; w < this.words.length; w += 1) total += popcount32(this.words[w]!);
    return total;
  }

  reset(): void {
    this.words.fill(0);
  }

  private checkRange(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.capacity) {
      throw new RangeError(`BitSet: index ${i} out of range [0, ${this.capacity})`);
    }
  }
}

function popcount32(n: number): number {
  let v = n - ((n >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}
