// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Matrix chain multiplication: minimum scalar multiplications needed
 * to compute the product M_1 * M_2 * ... * M_n given dimensions.
 * `dims` length is n+1; matrix i has shape dims[i] x dims[i+1].
 */

export interface MatrixChainResult {
  cost: number;
  /** split[i][j] = best k to split [i..j] product. */
  split: number[][];
  /** Returns parenthesized string ("(M1 (M2 M3))" style). */
  parenthesize(): string;
}

export function matrixChainOrder(dims: ReadonlyArray<number>): MatrixChainResult {
  if (dims.length < 2) throw new Error('matrixChainOrder: need at least 2 dimensions');
  const n = dims.length - 1;
  const dp = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const split = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let len = 2; len <= n; len += 1) {
    for (let i = 0; i + len - 1 < n; i += 1) {
      const j = i + len - 1;
      dp[i]![j] = Number.POSITIVE_INFINITY;
      for (let k = i; k < j; k += 1) {
        const cost = dp[i]![k]! + dp[k + 1]![j]! + dims[i]! * dims[k + 1]! * dims[j + 1]!;
        if (cost < dp[i]![j]!) {
          dp[i]![j] = cost;
          split[i]![j] = k;
        }
      }
    }
  }
  function build(i: number, j: number): string {
    if (i === j) return `M${i + 1}`;
    const k = split[i]![j]!;
    return `(${build(i, k)} ${build(k + 1, j)})`;
  }
  return { cost: dp[0]![n - 1]!, split, parenthesize: () => build(0, n - 1) };
}
