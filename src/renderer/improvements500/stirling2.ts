// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Stirling numbers of the second kind: S(n, k) counts the number of
 * ways to partition an n-element set into k non-empty subsets.
 * Computed via the standard recurrence
 * S(n, k) = k * S(n-1, k) + S(n-1, k-1).
 */

export function stirling2(n: number, k: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error('stirling2: n must be non-negative integer');
  if (!Number.isInteger(k) || k < 0) throw new Error('stirling2: k must be non-negative integer');
  if (k === 0) return n === 0 ? 1 : 0;
  if (k > n) return 0;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(k + 1).fill(0));
  dp[0]![0] = 1;
  for (let i = 1; i <= n; i += 1) {
    const limit = Math.min(i, k);
    for (let j = 1; j <= limit; j += 1) {
      dp[i]![j] = j * dp[i - 1]![j]! + dp[i - 1]![j - 1]!;
    }
  }
  return dp[n]![k]!;
}
