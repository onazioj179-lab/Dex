// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SplitMix64 PRNG - small-state seedable companion to PCG.
 * Often used to seed other generators. Returns BigInt + uint32 helpers.
 */

const MIX_MASK = 0xffffffffffffffffn;

export interface SplitMix64 {
  next64(): bigint;
  next32(): number;
  nextFloat(): number;
}

export function splitmix64(seed: number | bigint = 0): SplitMix64 {
  let state = (typeof seed === 'bigint' ? seed : BigInt(seed)) & MIX_MASK;
  const next64 = (): bigint => {
    state = (state + 0x9e3779b97f4a7c15n) & MIX_MASK;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MIX_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MIX_MASK;
    z = (z ^ (z >> 31n)) & MIX_MASK;
    return z;
  };
  const next32 = (): number => Number(next64() >> 32n) >>> 0;
  const nextFloat = (): number => next32() / 0x100000000;
  return { next64, next32, nextFloat };
}
