// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 0/1 Knapsack DP. Each item may be picked at most once. Returns the
 * maximum value plus the indices of selected items.
 */

export interface KnapsackItem {
  weight: number;
  value: number;
}

export interface KnapsackResult {
  value: number;
  selectedIndices: number[];
}

export function knapsack01(items: ReadonlyArray<KnapsackItem>, capacity: number): KnapsackResult {
  if (capacity < 0) throw new Error('capacity must be non-negative');
  const n = items.length;
  const dp: number[][] = [];
  for (let i = 0; i <= n; i += 1) dp.push(new Array<number>(capacity + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    const w = items[i - 1]!.weight;
    const v = items[i - 1]!.value;
    for (let c = 0; c <= capacity; c += 1) {
      dp[i]![c] = dp[i - 1]![c]!;
      if (w <= c) {
        const take = dp[i - 1]![c - w]! + v;
        if (take > dp[i]![c]!) dp[i]![c] = take;
      }
    }
  }
  const selected: number[] = [];
  let c = capacity;
  for (let i = n; i > 0; i -= 1) {
    if (dp[i]![c]! !== dp[i - 1]![c]!) {
      selected.push(i - 1);
      c -= items[i - 1]!.weight;
    }
  }
  selected.reverse();
  return { value: dp[n]![capacity]!, selectedIndices: selected };
}
