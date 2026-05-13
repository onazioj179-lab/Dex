// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Li-Chao tree maintaining the lower envelope of a set of lines and
 * answering minimum-y queries at a given x. O(log n) per insert and
 * query over a fixed integer x-range.
 */

interface Line {
  m: number;
  b: number;
}

function evalAt(line: Line, x: number): number {
  return line.m * x + line.b;
}

export class LiChaoTree {
  private xLo: number;
  private xHi: number;
  private lines: Array<Line | null>;
  private size: number;

  constructor(xLo: number, xHi: number) {
    if (xHi <= xLo) throw new Error('LiChaoTree: xHi must be > xLo');
    this.xLo = xLo;
    this.xHi = xHi;
    let size = 1;
    while (size < xHi - xLo) size <<= 1;
    this.size = size;
    this.lines = new Array(size * 4).fill(null);
  }

  private add(node: number, lo: number, hi: number, line: Line): void {
    let cur: Line | null = line;
    while (true) {
      if (!this.lines[node]) {
        this.lines[node] = cur;
        return;
      }
      const mid = (lo + hi) >> 1;
      const existing = this.lines[node]!;
      const leftBetter = evalAt(cur, lo) < evalAt(existing, lo);
      const midBetter = evalAt(cur, mid) < evalAt(existing, mid);
      if (midBetter) {
        const tmp = this.lines[node]!;
        this.lines[node] = cur;
        cur = tmp;
      }
      if (hi - lo === 1) return;
      if (leftBetter !== midBetter) {
        node = 2 * node;
        hi = mid;
      } else {
        node = 2 * node + 1;
        lo = mid;
      }
    }
  }

  /** Insert line y = m*x + b. */
  addLine(m: number, b: number): void {
    this.add(1, 0, this.size, { m, b });
  }

  /** Minimum y over all stored lines at integer x in [xLo, xHi). */
  queryMin(x: number): number {
    if (x < this.xLo || x >= this.xHi) throw new Error('LiChaoTree: x out of range');
    let lo = 0;
    let hi = this.size;
    let node = 1;
    let best = Infinity;
    const xi = x - this.xLo;
    while (true) {
      if (this.lines[node]) {
        const v = evalAt(this.lines[node]!, x);
        if (v < best) best = v;
      }
      if (hi - lo === 1) return best;
      const mid = (lo + hi) >> 1;
      if (xi < mid) {
        node = 2 * node;
        hi = mid;
      } else {
        node = 2 * node + 1;
        lo = mid;
      }
    }
  }
}
