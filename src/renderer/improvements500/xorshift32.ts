// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Marsaglia xorshift32 PRNG. Period 2^32 - 1. Seed must be non-zero.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export class Xorshift32 {
  private state: number;

  constructor(seed = 2463534242) {
    this.state = (seed | 0) === 0 ? 2463534242 : seed | 0;
  }

  nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return this.state >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x100000000;
  }

  reset(seed: number): void {
    this.state = (seed | 0) === 0 ? 2463534242 : seed | 0;
  }
}
