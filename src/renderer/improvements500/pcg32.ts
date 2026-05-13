// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PCG32 (PCG-XSH-RR) — small, fast, statistically strong seeded PRNG.
 * Returns a function producing uint32 values in `next32`, plus a
 * convenience `nextFloat` for [0,1).
 *
 * Reference: Melissa O'Neill, "PCG: A Family of Simple Fast
 * Space-Efficient Statistically Good Algorithms for Random Number
 * Generation" (2014).
 */

export interface Pcg32 {
  next32(): number;
  nextFloat(): number;
}

const MULT = 6364136223846793005n;
const INC = 1442695040888963407n;
const MASK64 = (1n << 64n) - 1n;

export function pcg32(seed: number | bigint = 0): Pcg32 {
  let state = (BigInt(seed) + INC) & MASK64;
  state = (state * MULT + INC) & MASK64;
  return {
    next32() {
      const old = state;
      state = (state * MULT + INC) & MASK64;
      const xorShifted = Number(((old >> 18n) ^ old) >> 27n) >>> 0;
      const rot = Number(old >> 59n);
      return ((xorShifted >>> rot) | (xorShifted << ((-rot) & 31))) >>> 0;
    },
    nextFloat() {
      // top 24 bits / 2^24 -> uniform [0,1)
      return (this.next32() >>> 8) / 0x1000000;
    },
  };
}
