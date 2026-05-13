// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export class RollingHash {
  private readonly base: bigint;
  private readonly mod: bigint;
  private readonly h: BigInt64Array;
  private readonly pow: BigInt64Array;

  constructor(s: string, base = 131n, mod = (1n << 61n) - 1n) {
    this.base = base;
    this.mod = mod;
    const n = s.length;
    this.h = new BigInt64Array(n + 1);
    this.pow = new BigInt64Array(n + 1);
    this.pow[0] = 1n;
    for (let i = 0; i < n; i++) {
      this.h[i + 1] = (this.h[i] * base + BigInt(s.charCodeAt(i))) % mod;
      this.pow[i + 1] = (this.pow[i] * base) % mod;
    }
  }

  hash(l: number, r: number): bigint {
    let v = this.h[r] - ((this.h[l] * this.pow[r - l]) % this.mod);
    v %= this.mod;
    if (v < 0n) v += this.mod;
    return v;
  }
}
