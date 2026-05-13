// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Fisher-Yates (Knuth) in-place shuffle. Accepts an injectable RNG so the
 * caller can use a deterministic source.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function fisherYatesShuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function fisherYatesShuffled<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  return fisherYatesShuffle(arr.slice(), rand);
}
