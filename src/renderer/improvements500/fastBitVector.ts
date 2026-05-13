// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export class FastBitVector {
  private readonly bits: Uint32Array;
  private readonly _length: number;
  private readonly rank1: Uint32Array;

  constructor(input: Uint8Array | ReadonlyArray<number>) {
    this._length = input.length;
    const words = Math.ceil(this._length / 32);
    this.bits = new Uint32Array(words);
    for (let i = 0; i < this._length; i++) {
      if (input[i]) this.bits[i >> 5] |= 1 << (i & 31);
    }
    this.rank1 = new Uint32Array(words + 1);
    for (let i = 0; i < words; i++) {
      this.rank1[i + 1] = this.rank1[i] + this.popcount(this.bits[i]);
    }
  }

  get length(): number {
    return this._length;
  }

  private popcount(x: number): number {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    x = (x + (x >>> 4)) & 0x0f0f0f0f;
    return (x * 0x01010101) >>> 24;
  }

  get(i: number): number {
    return (this.bits[i >> 5] >>> (i & 31)) & 1;
  }

  rank(i: number): number {
    if (i <= 0) return 0;
    if (i > this._length) i = this._length;
    const w = i >> 5;
    const r = i & 31;
    let cnt = this.rank1[w];
    if (r > 0) cnt += this.popcount(this.bits[w] & ((1 << r) - 1));
    return cnt;
  }

  select(k: number): number {
    if (k <= 0) return -1;
    let lo = 0;
    let hi = this._length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.rank(mid + 1) >= k) hi = mid;
      else lo = mid + 1;
    }
    return lo < this._length && this.get(lo) === 1 ? lo : -1;
  }
}
