// =============================================================================
// DEX Platform — Wave 6.2 Rewind: file diff
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Diff — Myers O(ND) diff for line-oriented text. Returns hunk records the
 * UI can render side-by-side or unified.
 *
 * For binary files the function returns a single 'replace' hunk covering the
 * entire range.
 */

export type LineOp = 'eq' | 'add' | 'del';

export interface DiffLine {
  op: LineOp;
  /** Line number in old file (1-based) — present for 'eq' and 'del'. */
  oldLine?: number;
  /** Line number in new file (1-based) — present for 'eq' and 'add'. */
  newLine?: number;
  text: string;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  deleted: number;
}

export function diffText(oldText: string, newText: string): DiffResult {
  const a = oldText.split(/\r?\n/);
  const b = newText.split(/\r?\n/);
  const path = myers(a, b);

  const lines: DiffLine[] = [];
  let added = 0, deleted = 0;
  let oi = 0, ni = 0;
  for (const op of path) {
    if (op === 'eq') {
      lines.push({ op: 'eq', oldLine: oi + 1, newLine: ni + 1, text: a[oi]! });
      oi++; ni++;
    } else if (op === 'del') {
      lines.push({ op: 'del', oldLine: oi + 1, text: a[oi]! });
      oi++; deleted++;
    } else {
      lines.push({ op: 'add', newLine: ni + 1, text: b[ni]! });
      ni++; added++;
    }
  }
  return { lines, added, deleted };
}

function myers(a: string[], b: string[]): LineOp[] {
  const N = a.length, M = b.length;
  const max = N + M;
  if (max === 0) return [];

  const v = new Map<number, number>();
  v.set(1, 0);
  const trace: Map<number, number>[] = [];
  let dResult = -1;

  for (let d = 0; d <= max; d++) {
    const snap = new Map(v);
    trace.push(snap);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const vKMinus = v.get(k - 1) ?? -1;
      const vKPlus = v.get(k + 1) ?? -1;
      if (k === -d || (k !== d && vKMinus < vKPlus)) {
        x = vKPlus;
      } else {
        x = vKMinus + 1;
      }
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      v.set(k, x);
      if (x >= N && y >= M) { dResult = d; break; }
    }
    if (dResult !== -1) break;
  }

  // Backtrack
  const ops: LineOp[] = [];
  let x = N, y = M;
  for (let d = dResult; d > 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d]!;
    const k = x - y;
    let prevK: number;
    const vKMinus = vd.get(k - 1) ?? -1;
    const vKPlus = vd.get(k + 1) ?? -1;
    if (k === -d || (k !== d && vKMinus < vKPlus)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vd.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push('eq'); x--; y--; }
    if (x === prevX) { ops.push('add'); y--; }
    else { ops.push('del'); x--; }
  }
  while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) { ops.push('eq'); x--; y--; }
  return ops.reverse();
}

/** Quick byte-level equality test (for binary file detection). */
export function diffBinary(a: Uint8Array, b: Uint8Array): { equal: boolean; sizeOld: number; sizeNew: number } {
  return { equal: a.length === b.length && a.every((v, i) => v === b[i]),
           sizeOld: a.length, sizeNew: b.length };
}
