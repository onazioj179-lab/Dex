// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Seedable PRNG (mulberry32) + helpers. Used for deterministic test
 * fixtures, AXL paint scatter, FORGE primitive placement, and any other
 * spot that needs reproducible randomness.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, good enough for non-crypto purposes. */
export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, minInclusive: number, maxExclusive: number): number {
  return Math.floor(rng() * (maxExclusive - minInclusive)) + minInclusive;
}

export function randomChoice<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Fisher-Yates in-place shuffle using an injected RNG. */
export function shuffleInPlace<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
