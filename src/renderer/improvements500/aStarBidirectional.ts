// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bidirectional A* search. Runs forward from start and backward from
 * goal simultaneously, terminating when frontiers meet. Often 2-4x
 * faster than unidirectional A* on uniform graphs.
 */

interface BiNode {
  node: number;
  f: number;
}

class MinHeap {
  private h: BiNode[] = [];
  push(n: BiNode): void {
    this.h.push(n);
    this.up(this.h.length - 1);
  }
  pop(): BiNode | undefined {
    if (this.h.length === 0) return undefined;
    const top = this.h[0]!;
    const last = this.h.pop()!;
    if (this.h.length > 0) {
      this.h[0] = last;
      this.down(0);
    }
    return top;
  }
  get size(): number {
    return this.h.length;
  }
  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p]!.f <= this.h[i]!.f) break;
      [this.h[p], this.h[i]] = [this.h[i]!, this.h[p]!];
      i = p;
    }
  }
  private down(i: number): void {
    const n = this.h.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let s = i;
      if (l < n && this.h[l]!.f < this.h[s]!.f) s = l;
      if (r < n && this.h[r]!.f < this.h[s]!.f) s = r;
      if (s === i) break;
      [this.h[s], this.h[i]] = [this.h[i]!, this.h[s]!];
      i = s;
    }
  }
}

export interface BiAStarOptions {
  nodes: number;
  /** forward[u] = list of {to, weight} */
  forward: ReadonlyArray<ReadonlyArray<{ to: number; weight: number }>>;
  /** backward[u] = predecessors of u as {to, weight} (i.e. reverse adjacency) */
  backward: ReadonlyArray<ReadonlyArray<{ to: number; weight: number }>>;
  start: number;
  goal: number;
  /** Admissible heuristic: heuristic(node, target) */
  heuristic: (node: number, target: number) => number;
}

export interface BiAStarResult {
  cost: number;
  path: number[];
}

export function aStarBidirectional(opts: BiAStarOptions): BiAStarResult | null {
  const { nodes, forward, backward, start, goal, heuristic } = opts;
  if (start === goal) return { cost: 0, path: [start] };
  const gF = new Float64Array(nodes).fill(Infinity);
  const gB = new Float64Array(nodes).fill(Infinity);
  const parentF = new Int32Array(nodes).fill(-1);
  const parentB = new Int32Array(nodes).fill(-1);
  gF[start] = 0;
  gB[goal] = 0;
  const openF = new MinHeap();
  const openB = new MinHeap();
  openF.push({ node: start, f: heuristic(start, goal) });
  openB.push({ node: goal, f: heuristic(goal, start) });
  const closedF = new Uint8Array(nodes);
  const closedB = new Uint8Array(nodes);
  let bestCost = Infinity;
  let meetNode = -1;
  while (openF.size > 0 && openB.size > 0) {
    if (openF.size <= openB.size) {
      const top = openF.pop()!;
      if (closedF[top.node]) continue;
      closedF[top.node] = 1;
      if (gF[top.node]! + gB[top.node]! < bestCost) {
        bestCost = gF[top.node]! + gB[top.node]!;
        meetNode = top.node;
      }
      if (top.f >= bestCost) break;
      for (const e of forward[top.node]!) {
        const ng = gF[top.node]! + e.weight;
        if (ng < gF[e.to]!) {
          gF[e.to] = ng;
          parentF[e.to] = top.node;
          openF.push({ node: e.to, f: ng + heuristic(e.to, goal) });
          if (gB[e.to]! < Infinity && ng + gB[e.to]! < bestCost) {
            bestCost = ng + gB[e.to]!;
            meetNode = e.to;
          }
        }
      }
    } else {
      const top = openB.pop()!;
      if (closedB[top.node]) continue;
      closedB[top.node] = 1;
      if (gF[top.node]! + gB[top.node]! < bestCost) {
        bestCost = gF[top.node]! + gB[top.node]!;
        meetNode = top.node;
      }
      if (top.f >= bestCost) break;
      for (const e of backward[top.node]!) {
        const ng = gB[top.node]! + e.weight;
        if (ng < gB[e.to]!) {
          gB[e.to] = ng;
          parentB[e.to] = top.node;
          openB.push({ node: e.to, f: ng + heuristic(e.to, start) });
          if (gF[e.to]! < Infinity && gF[e.to]! + ng < bestCost) {
            bestCost = gF[e.to]! + ng;
            meetNode = e.to;
          }
        }
      }
    }
  }
  if (meetNode === -1 || !isFinite(bestCost)) return null;
  // Reconstruct: forward[start..meet] then reverse(backward[goal..meet])
  const fwd: number[] = [];
  let cur = meetNode;
  while (cur !== -1) {
    fwd.push(cur);
    cur = parentF[cur]!;
  }
  fwd.reverse();
  const bwd: number[] = [];
  cur = parentB[meetNode]!;
  while (cur !== -1) {
    bwd.push(cur);
    cur = parentB[cur]!;
  }
  return { cost: bestCost, path: fwd.concat(bwd) };
}
