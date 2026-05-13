// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * HyperLogLog cardinality estimator (HLL with bias correction).
 * Standard 14-bit (m=2^14) precision by default.
 */

export interface HyperLogLogOptions {
  precision?: number; // 4..16
}

function hash32(key: string): number {
  let h = 0xdeadbeef ^ 0x9e3779b1;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export class HyperLogLog {
  private readonly p: number;
  private readonly m: number;
  private readonly registers: Uint8Array;
  private readonly alphaMM: number;

  constructor(opts: HyperLogLogOptions = {}) {
    this.p = Math.min(16, Math.max(4, opts.precision ?? 14));
    this.m = 1 << this.p;
    this.registers = new Uint8Array(this.m);
    let alpha: number;
    if (this.m === 16) alpha = 0.673;
    else if (this.m === 32) alpha = 0.697;
    else if (this.m === 64) alpha = 0.709;
    else alpha = 0.7213 / (1 + 1.079 / this.m);
    this.alphaMM = alpha * this.m * this.m;
  }

  add(key: string): void {
    const h = hash32(key);
    const idx = h >>> (32 - this.p);
    const w = (h << this.p) >>> 0 | (1 << (this.p - 1));
    let r = 1;
    let mask = 1 << 31;
    while ((w & mask) === 0 && r < 32 - this.p + 1) {
      r += 1;
      mask >>>= 1;
    }
    if (r > this.registers[idx]!) this.registers[idx] = r;
  }

  estimate(): number {
    let sum = 0;
    let zeros = 0;
    for (let i = 0; i < this.m; i += 1) {
      const r = this.registers[i]!;
      sum += 2 ** -r;
      if (r === 0) zeros += 1;
    }
    let est = this.alphaMM / sum;
    // Small range correction.
    if (est <= (5 / 2) * this.m && zeros > 0) {
      est = this.m * Math.log(this.m / zeros);
    }
    return Math.round(est);
  }
}
