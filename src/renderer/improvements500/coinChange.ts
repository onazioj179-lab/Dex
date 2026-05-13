// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Coin-change minimum-coins DP. Returns the smallest number of coins
 * needed to sum to `target`, or -1 when unreachable. Coins are
 * positive integers and may be reused without limit.
 */

export interface CoinChangeResult {
  count: number;
  /** One valid coin sequence summing to target; empty when unreachable. */
  coins: number[];
}

export function coinChangeMin(coins: readonly number[], target: number): CoinChangeResult {
  if (target < 0) return { count: -1, coins: [] };
  if (target === 0) return { count: 0, coins: [] };
  const dp = new Int32Array(target + 1).fill(-1);
  const choice = new Int32Array(target + 1).fill(-1);
  dp[0] = 0;
  for (let v = 1; v <= target; v += 1) {
    for (const c of coins) {
      if (c <= 0 || c > v) continue;
      if (dp[v - c]! < 0) continue;
      const candidate = dp[v - c]! + 1;
      if (dp[v]! < 0 || candidate < dp[v]!) {
        dp[v] = candidate;
        choice[v] = c;
      }
    }
  }
  if (dp[target]! < 0) return { count: -1, coins: [] };
  const out: number[] = [];
  let cur = target;
  while (cur > 0) {
    const c = choice[cur]!;
    out.push(c);
    cur -= c;
  }
  return { count: dp[target]!, coins: out };
}
