// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Line diff (UKI plan diffs, Rewind/version compare, Notes history). Classic
 * LCS line diff producing equal/added/removed ops in order. Pure: no DOM, no IO.
 */

export type DiffType = 'eq' | 'add' | 'del';

export interface DiffLine {
  type: DiffType;
  line: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

/** Diff two texts line-by-line via longest-common-subsequence. */
export function diffLines(aText: string, bText: string): DiffLine[] {
  const a = aText === '' ? [] : aText.split('\n');
  const b = bText === '' ? [] : bText.split('\n');
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Backtrack into an ordered op list.
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'eq', line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', line: a[i] }); i++; }
    else { out.push({ type: 'add', line: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: 'del', line: a[i] }); i++; }
  while (j < m) { out.push({ type: 'add', line: b[j] }); j++; }
  return out;
}

/** Summary counts for a diff. */
export function diffStats(diff: readonly DiffLine[]): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0 };
  for (const d of diff) {
    if (d.type === 'add') stats.added++;
    else if (d.type === 'del') stats.removed++;
    else stats.unchanged++;
  }
  return stats;
}
