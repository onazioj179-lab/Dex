// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Count-Min Sketch - sub-linear-memory frequency estimator.
 * Provides upper-bound estimates for the count of any key.
 */

export interface CountMinOptions {
  width: number;
  depth: number;
  seed?: number;
}

function hashWith(key: string, salt: number, modulus: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % modulus + modulus) % modulus;
}

export class CountMinSketch {
  private readonly table: Uint32Array;
  private readonly width: number;
  private readonly depth: number;
  private readonly salts: number[];

  constructor(opts: CountMinOptions) {
    if (opts.width <= 0 || opts.depth <= 0) throw new Error('width and depth must be positive');
    this.width = opts.width;
    this.depth = opts.depth;
    this.table = new Uint32Array(this.width * this.depth);
    const seed = opts.seed ?? 0;
    this.salts = [];
    for (let d = 0; d < this.depth; d += 1) {
      this.salts.push(Math.imul(d + 1, 0x9e3779b1) ^ seed);
    }
  }

  add(key: string, count = 1): void {
    for (let d = 0; d < this.depth; d += 1) {
      const idx = d * this.width + hashWith(key, this.salts[d]!, this.width);
      this.table[idx] = (this.table[idx]! + count) >>> 0;
    }
  }

  estimate(key: string): number {
    let min = Infinity;
    for (let d = 0; d < this.depth; d += 1) {
      const idx = d * this.width + hashWith(key, this.salts[d]!, this.width);
      const v = this.table[idx]!;
      if (v < min) min = v;
    }
    return min === Infinity ? 0 : min;
  }
}
