// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unbounded 0/1 knapsack: each item may be used any number of times.
 * Returns the maximum value attainable within `capacity`.
 */

export interface UnboundedKnapsackItem {
  weight: number;
  value: number;
}

export function knapsackUnbounded(items: ReadonlyArray<UnboundedKnapsackItem>, capacity: number): number {
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new Error('knapsackUnbounded: capacity must be non-negative integer');
  }
  const dp = new Float64Array(capacity + 1);
  for (let cap = 1; cap <= capacity; cap += 1) {
    let best = dp[cap]!;
    for (const item of items) {
      if (item.weight <= cap) {
        const candidate = dp[cap - item.weight]! + item.value;
        if (candidate > best) best = candidate;
      }
    }
    dp[cap] = best;
  }
  return dp[capacity]!;
}
