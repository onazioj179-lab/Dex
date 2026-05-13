// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cuckoo filter - probabilistic membership with deletion support.
 * Two-hash bucketing with fingerprint kicking. Memory-efficient
 * alternative to Bloom for sets that need removal.
 */

export interface CuckooFilterOptions {
  capacity: number;
  bucketSize?: number;
  fingerprintBits?: number;
  maxKicks?: number;
}

function fingerprintFor(key: string, bits: number): number {
  // Simple 32-bit FNV-1a, masked to bits; reserve 0 as empty marker.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const mask = (1 << bits) - 1;
  let fp = (h >>> 0) & mask;
  if (fp === 0) fp = 1;
  return fp;
}

function indexHash(key: string, modulus: number): number {
  let h = 0xcbf29ce4;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % modulus + modulus) % modulus;
}

function altIndex(i: number, fp: number, modulus: number): number {
  const fpStr = `fp:${fp}`;
  const j = indexHash(fpStr, modulus);
  return ((i ^ j) % modulus + modulus) % modulus;
}

export class CuckooFilter {
  private readonly buckets: Uint32Array;
  private readonly numBuckets: number;
  private readonly bucketSize: number;
  private readonly fingerprintBits: number;
  private readonly maxKicks: number;
  private size_ = 0;

  constructor(opts: CuckooFilterOptions) {
    if (opts.capacity <= 0) throw new Error('capacity must be positive');
    this.bucketSize = opts.bucketSize ?? 4;
    this.fingerprintBits = opts.fingerprintBits ?? 8;
    this.maxKicks = opts.maxKicks ?? 500;
    let n = Math.ceil(opts.capacity / this.bucketSize);
    let pow = 1;
    while (pow < n) pow <<= 1;
    this.numBuckets = pow;
    this.buckets = new Uint32Array(this.numBuckets * this.bucketSize);
  }

  get size(): number {
    return this.size_;
  }

  private slot(b: number, s: number): number {
    return b * this.bucketSize + s;
  }

  private tryInsert(b: number, fp: number): boolean {
    for (let s = 0; s < this.bucketSize; s += 1) {
      if (this.buckets[this.slot(b, s)] === 0) {
        this.buckets[this.slot(b, s)] = fp;
        return true;
      }
    }
    return false;
  }

  add(key: string): boolean {
    const fp = fingerprintFor(key, this.fingerprintBits);
    const i1 = indexHash(key, this.numBuckets);
    const i2 = altIndex(i1, fp, this.numBuckets);
    if (this.tryInsert(i1, fp) || this.tryInsert(i2, fp)) {
      this.size_ += 1;
      return true;
    }
    let i = Math.random() < 0.5 ? i1 : i2;
    let curFp = fp;
    for (let k = 0; k < this.maxKicks; k += 1) {
      const slot = Math.floor(Math.random() * this.bucketSize);
      const idx = this.slot(i, slot);
      const evicted = this.buckets[idx]!;
      this.buckets[idx] = curFp;
      curFp = evicted;
      i = altIndex(i, curFp, this.numBuckets);
      if (this.tryInsert(i, curFp)) {
        this.size_ += 1;
        return true;
      }
    }
    return false;
  }

  contains(key: string): boolean {
    const fp = fingerprintFor(key, this.fingerprintBits);
    const i1 = indexHash(key, this.numBuckets);
    const i2 = altIndex(i1, fp, this.numBuckets);
    for (let s = 0; s < this.bucketSize; s += 1) {
      if (this.buckets[this.slot(i1, s)] === fp) return true;
      if (this.buckets[this.slot(i2, s)] === fp) return true;
    }
    return false;
  }

  remove(key: string): boolean {
    const fp = fingerprintFor(key, this.fingerprintBits);
    const i1 = indexHash(key, this.numBuckets);
    const i2 = altIndex(i1, fp, this.numBuckets);
    for (let s = 0; s < this.bucketSize; s += 1) {
      if (this.buckets[this.slot(i1, s)] === fp) {
        this.buckets[this.slot(i1, s)] = 0;
        this.size_ -= 1;
        return true;
      }
      if (this.buckets[this.slot(i2, s)] === fp) {
        this.buckets[this.slot(i2, s)] = 0;
        this.size_ -= 1;
        return true;
      }
    }
    return false;
  }
}
