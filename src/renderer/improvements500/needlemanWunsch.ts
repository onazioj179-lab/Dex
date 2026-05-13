// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface AlignmentOptions {
  match?: number;
  mismatch?: number;
  gap?: number;
}

export interface AlignmentResult {
  score: number;
  alignedA: string;
  alignedB: string;
}

export function needlemanWunsch(a: string, b: string, opts: AlignmentOptions = {}): AlignmentResult {
  const match = opts.match ?? 1;
  const mismatch = opts.mismatch ?? -1;
  const gap = opts.gap ?? -2;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i * gap;
  for (let j = 0; j <= n; j++) dp[0][j] = j * gap;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = a[i - 1] === b[j - 1] ? match : mismatch;
      dp[i][j] = Math.max(dp[i - 1][j - 1] + s, dp[i - 1][j] + gap, dp[i][j - 1] + gap);
    }
  }
  let i = m;
  let j = n;
  let alignedA = '';
  let alignedB = '';
  while (i > 0 && j > 0) {
    const s = a[i - 1] === b[j - 1] ? match : mismatch;
    if (dp[i][j] === dp[i - 1][j - 1] + s) {
      alignedA = a[i - 1] + alignedA;
      alignedB = b[j - 1] + alignedB;
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + gap) {
      alignedA = a[i - 1] + alignedA;
      alignedB = '-' + alignedB;
      i--;
    } else {
      alignedA = '-' + alignedA;
      alignedB = b[j - 1] + alignedB;
      j--;
    }
  }
  while (i > 0) {
    alignedA = a[i - 1] + alignedA;
    alignedB = '-' + alignedB;
    i--;
  }
  while (j > 0) {
    alignedA = '-' + alignedA;
    alignedB = b[j - 1] + alignedB;
    j--;
  }
  return { score: dp[m][n], alignedA, alignedB };
}
