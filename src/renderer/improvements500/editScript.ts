// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Edit script - reconstruct the operation list to transform A into B
 * using Wagner-Fischer + traceback. O(m*n) time and memory.
 */

export type EditOp =
  | { kind: 'match'; ai: number; bi: number; char: string }
  | { kind: 'insert'; bi: number; char: string }
  | { kind: 'delete'; ai: number; char: string }
  | { kind: 'replace'; ai: number; bi: number; from: string; to: string };

export function editScript(a: string, b: string): EditOp[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i += 1) dp.push(new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= n; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }
  const ops: EditOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
      ops.push({ kind: 'match', ai: i - 1, bi: j - 1, char: a[i - 1]! });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i]![j]! === dp[i - 1]![j - 1]! + 1) {
      ops.push({ kind: 'replace', ai: i - 1, bi: j - 1, from: a[i - 1]!, to: b[j - 1]! });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i]![j]! === dp[i - 1]![j]! + 1) {
      ops.push({ kind: 'delete', ai: i - 1, char: a[i - 1]! });
      i -= 1;
    } else {
      ops.push({ kind: 'insert', bi: j - 1, char: b[j - 1]! });
      j -= 1;
    }
  }
  return ops.reverse();
}
