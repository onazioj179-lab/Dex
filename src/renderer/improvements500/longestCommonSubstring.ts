// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Longest common substring (contiguous) using DP. Returns the substring and its length.
export interface LcsSubstringResult {
  substring: string;
  length: number;
  indexA: number;
  indexB: number;
}

export function longestCommonSubstring(a: string, b: string): LcsSubstringResult {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return { substring: '', length: 0, indexA: 0, indexB: 0 };
  let prev = new Uint32Array(n + 1);
  let curr = new Uint32Array(n + 1);
  let best = 0;
  let endA = 0;
  let endB = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) {
          best = curr[j];
          endA = i;
          endB = j;
        }
      } else {
        curr[j] = 0;
      }
    }
    [prev, curr] = [curr, prev];
  }
  return {
    substring: a.slice(endA - best, endA),
    length: best,
    indexA: endA - best,
    indexB: endB - best,
  };
}
