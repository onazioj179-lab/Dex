// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * A* shortest path on a generic graph.
 * Caller supplies neighbor expansion, edge cost, and a heuristic.
 */

export interface AStarOptions<N> {
  start: N;
  goal: N;
  neighbors: (node: N) => Iterable<N>;
  cost: (from: N, to: N) => number;
  heuristic: (node: N, goal: N) => number;
  key?: (node: N) => string;
  maxExpansions?: number;
}

export interface AStarResult<N> {
  path: N[];
  cost: number;
  expansions: number;
}

export function aStar<N>(opts: AStarOptions<N>): AStarResult<N> | null {
  const key = opts.key ?? ((n: N) => String(n));
  const max = opts.maxExpansions ?? 1_000_000;
  const open = new BinaryHeap<{ node: N; f: number }>((a, b) => a.f - b.f);
  const gScore = new Map<string, number>();
  const came = new Map<string, N>();
  const startKey = key(opts.start);
  const goalKey = key(opts.goal);
  gScore.set(startKey, 0);
  open.push({ node: opts.start, f: opts.heuristic(opts.start, opts.goal) });
  let expansions = 0;
  while (open.size() > 0) {
    if (expansions++ > max) return null;
    const { node } = open.pop()!;
    const nodeKey = key(node);
    if (nodeKey === goalKey) {
      return { path: reconstruct(came, opts.start, node, key), cost: gScore.get(goalKey) ?? 0, expansions };
    }
    const g = gScore.get(nodeKey) ?? Infinity;
    for (const next of opts.neighbors(node)) {
      const nextKey = key(next);
      const tentative = g + opts.cost(node, next);
      if (tentative < (gScore.get(nextKey) ?? Infinity)) {
        came.set(nextKey, node);
        gScore.set(nextKey, tentative);
        open.push({ node: next, f: tentative + opts.heuristic(next, opts.goal) });
      }
    }
  }
  return null;
}

function reconstruct<N>(came: Map<string, N>, start: N, end: N, key: (n: N) => string): N[] {
  const path: N[] = [end];
  let cur = end;
  const startKey = key(start);
  while (key(cur) !== startKey) {
    const prev = came.get(key(cur));
    if (prev === undefined) break;
    path.push(prev);
    cur = prev;
  }
  return path.reverse();
}

class BinaryHeap<T> {
  private data: T[] = [];
  constructor(private readonly cmp: (a: T, b: T) => number) {}
  size(): number { return this.data.length; }
  push(v: T): void { this.data.push(v); this.up(this.data.length - 1); }
  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) { this.data[0] = last; this.down(0); }
    return top;
  }
  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (this.cmp(this.data[i]!, this.data[p]!) < 0) { [this.data[i], this.data[p]] = [this.data[p]!, this.data[i]!]; i = p; }
      else break;
    }
  }
  private down(i: number): void {
    const n = this.data.length;
    while (true) {
      const l = i * 2 + 1; const r = l + 1; let s = i;
      if (l < n && this.cmp(this.data[l]!, this.data[s]!) < 0) s = l;
      if (r < n && this.cmp(this.data[r]!, this.data[s]!) < 0) s = r;
      if (s === i) break;
      [this.data[i], this.data[s]] = [this.data[s]!, this.data[i]!]; i = s;
    }
  }
}
