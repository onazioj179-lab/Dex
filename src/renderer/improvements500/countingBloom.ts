// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bloom filter with counter mode - alternative to plain bloom that
 * supports decrement/remove. Each cell is a small counter (default 4 bits).
 */

export interface CountingBloomOptions {
  capacity: number;
  falsePositiveRate?: number;
  counterBits?: number;
}

function fnv1a32(s: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class CountingBloomFilter {
  private readonly counters: Uint8Array;
  private readonly m: number;
  private readonly k: number;
  private readonly maxCount: number;

  constructor(opts: CountingBloomOptions) {
    if (opts.capacity <= 0) throw new Error('capacity must be positive');
    const fpr = opts.falsePositiveRate ?? 0.01;
    const counterBits = opts.counterBits ?? 4;
    this.maxCount = (1 << counterBits) - 1;
    this.m = Math.ceil((-opts.capacity * Math.log(fpr)) / (Math.log(2) ** 2));
    this.k = Math.max(1, Math.round((this.m / opts.capacity) * Math.log(2)));
    this.counters = new Uint8Array(this.m);
  }

  private hashes(key: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.k; i += 1) {
      out.push(fnv1a32(key, i + 1) % this.m);
    }
    return out;
  }

  add(key: string): void {
    for (const idx of this.hashes(key)) {
      if (this.counters[idx]! < this.maxCount) {
        this.counters[idx] = this.counters[idx]! + 1;
      }
    }
  }

  remove(key: string): boolean {
    if (!this.contains(key)) return false;
    for (const idx of this.hashes(key)) {
      if (this.counters[idx]! > 0) this.counters[idx] = this.counters[idx]! - 1;
    }
    return true;
  }

  contains(key: string): boolean {
    for (const idx of this.hashes(key)) {
      if (this.counters[idx] === 0) return false;
    }
    return true;
  }
}
