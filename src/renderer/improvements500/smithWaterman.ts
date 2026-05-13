// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface LocalAlignmentOptions {
  match?: number;
  mismatch?: number;
  gap?: number;
}

export interface LocalAlignmentResult {
  score: number;
  alignedA: string;
  alignedB: string;
  startA: number;
  startB: number;
}

export function smithWaterman(a: string, b: string, opts: LocalAlignmentOptions = {}): LocalAlignmentResult {
  const match = opts.match ?? 2;
  const mismatch = opts.mismatch ?? -1;
  const gap = opts.gap ?? -1;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  let best = 0;
  let bi = 0;
  let bj = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = a[i - 1] === b[j - 1] ? match : mismatch;
      const v = Math.max(0, dp[i - 1][j - 1] + s, dp[i - 1][j] + gap, dp[i][j - 1] + gap);
      dp[i][j] = v;
      if (v > best) {
        best = v;
        bi = i;
        bj = j;
      }
    }
  }
  let i = bi;
  let j = bj;
  let alignedA = '';
  let alignedB = '';
  while (i > 0 && j > 0 && dp[i][j] > 0) {
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
  return { score: best, alignedA, alignedB, startA: i, startB: j };
}
