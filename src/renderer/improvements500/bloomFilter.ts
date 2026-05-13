// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bloom filter (probabilistic set membership) with k hash functions.
 * Used for cheap dedupe / "have I seen this" checks where false positives are
 * tolerable.
 */

export interface BloomFilterOptions {
  /** Bit array size in bits. Must be > 0. */
  bits: number;
  /** Number of hash rounds. Must be > 0. */
  hashes: number;
}

function fnv1a(input: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class BloomFilter {
  private readonly bits: number;
  private readonly k: number;
  private readonly buf: Uint32Array;
  private size = 0;

  constructor(options: BloomFilterOptions) {
    if (!Number.isFinite(options.bits) || options.bits <= 0) {
      throw new Error('BloomFilter: bits must be > 0');
    }
    if (!Number.isFinite(options.hashes) || options.hashes <= 0) {
      throw new Error('BloomFilter: hashes must be > 0');
    }
    this.bits = Math.ceil(options.bits);
    this.k = Math.ceil(options.hashes);
    this.buf = new Uint32Array(Math.ceil(this.bits / 32));
  }

  private indices(value: string): number[] {
    const h1 = fnv1a(value, 0);
    const h2 = fnv1a(value, 0x9e3779b9);
    const out: number[] = new Array(this.k);
    for (let i = 0; i < this.k; i += 1) {
      out[i] = (h1 + Math.imul(i, h2)) >>> 0;
      out[i] = out[i] % this.bits;
    }
    return out;
  }

  add(value: string): void {
    const idxs = this.indices(value);
    for (let i = 0; i < idxs.length; i += 1) {
      const idx = idxs[i];
      const word = idx >>> 5;
      const bit = idx & 31;
      this.buf[word] = (this.buf[word] | (1 << bit)) >>> 0;
    }
    this.size += 1;
  }

  has(value: string): boolean {
    const idxs = this.indices(value);
    for (let i = 0; i < idxs.length; i += 1) {
      const idx = idxs[i];
      const word = idx >>> 5;
      const bit = idx & 31;
      if ((this.buf[word] & (1 << bit)) === 0) return false;
    }
    return true;
  }

  /** Approximate count of inserted items (note: counts duplicates). */
  get count(): number {
    return this.size;
  }
}

/** Returns recommended bits & hashes for ~`expected` items at false-positive rate `fpRate`. */
export function recommendBloomParams(expected: number, fpRate = 0.01): BloomFilterOptions {
  if (expected <= 0) throw new Error('expected must be > 0');
  if (fpRate <= 0 || fpRate >= 1) throw new Error('fpRate must be in (0,1)');
  const bits = Math.ceil(-(expected * Math.log(fpRate)) / (Math.LN2 * Math.LN2));
  const hashes = Math.max(1, Math.round((bits / expected) * Math.LN2));
  return { bits, hashes };
}
