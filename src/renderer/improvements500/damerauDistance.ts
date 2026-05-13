// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Damerau-Levenshtein edit distance (allows adjacent transposition as a
 * single edit). Stricter than plain Levenshtein for typo correction.
 */

export function damerauDistance(a: string, b: string): number {
  const m = a.length; const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const da = new Map<string, number>();
  const inf = m + n;
  const H: number[][] = Array.from({ length: m + 2 }, () => new Array<number>(n + 2).fill(0));
  H[0]![0] = inf;
  for (let i = 0; i <= m; i += 1) { H[i + 1]![0] = inf; H[i + 1]![1] = i; }
  for (let j = 0; j <= n; j += 1) { H[0]![j + 1] = inf; H[1]![j + 1] = j; }
  for (let i = 1; i <= m; i += 1) {
    let db = 0;
    for (let j = 1; j <= n; j += 1) {
      const ai = a.charAt(i - 1);
      const bj = b.charAt(j - 1);
      const i1 = da.get(bj) ?? 0;
      const j1 = db;
      let cost = 1;
      if (ai === bj) { cost = 0; db = j; }
      H[i + 1]![j + 1] = Math.min(
        H[i]![j]! + cost,
        H[i + 1]![j]! + 1,
        H[i]![j + 1]! + 1,
        H[i1]![j1]! + (i - i1 - 1) + 1 + (j - j1 - 1),
      );
    }
    da.set(a.charAt(i - 1), i);
  }
  return H[m + 1]![n + 1]!;
}
