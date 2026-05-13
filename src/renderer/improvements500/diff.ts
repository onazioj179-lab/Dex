// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Line-based diff using a simplified Myers algorithm. Used by collab
 * comments, version history, and Notes change view.
 */

export type LineDiffOp = 'equal' | 'insert' | 'delete';
export interface LineDiffChunk { op: LineDiffOp; lines: string[]; }

export function diffLines(a: string, b: string): LineDiffChunk[] {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  return diffArrays(aLines, bLines);
}

export function diffArrays<T>(a: readonly T[], b: readonly T[]): LineDiffChunk[] {
  // LCS table.
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack.
  const out: LineDiffChunk[] = [];
  let i = m, j = n;
  const push = (op: LineDiffOp, line: string): void => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.lines.unshift(line);
    else out.push({ op, lines: [line] });
  };
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { push('equal', String(a[i - 1])); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { push('delete', String(a[i - 1])); i--; }
    else { push('insert', String(b[j - 1])); j--; }
  }
  while (i > 0) { push('delete', String(a[i - 1])); i--; }
  while (j > 0) { push('insert', String(b[j - 1])); j--; }
  return out.reverse();
}
