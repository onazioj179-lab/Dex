// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Longest Common Subsequence via dynamic programming. O(m*n) time and
 * O(m*n) memory; returns length and one valid LCS string/array.
 */

export interface LcsResult<T> {
  length: number;
  sequence: T[];
}

export function longestCommonSubsequence<T>(
  a: readonly T[],
  b: readonly T[],
  equals: (x: T, y: T) => boolean = (x, y) => x === y,
): LcsResult<T> {
  const m = a.length;
  const n = b.length;
  const dp: Int32Array[] = [];
  for (let i = 0; i <= m; i += 1) dp.push(new Int32Array(n + 1));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (equals(a[i - 1]!, b[j - 1]!)) dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const seq: T[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (equals(a[i - 1]!, b[j - 1]!)) {
      seq.push(a[i - 1]!);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i -= 1;
    else j -= 1;
  }
  seq.reverse();
  return { length: seq.length, sequence: seq };
}

/** Convenience wrapper for strings - returns the LCS as a string. */
export function longestCommonSubsequenceString(a: string, b: string): string {
  const r = longestCommonSubsequence(a.split(''), b.split(''));
  return r.sequence.join('');
}
