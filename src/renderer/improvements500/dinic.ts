// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface DinicEdge {
  to: number;
  cap: number;
  rev: number;
}

export class Dinic {
  private readonly n: number;
  private readonly graph: DinicEdge[][];
  private level: Int32Array = new Int32Array(0);
  private iter: Int32Array = new Int32Array(0);

  constructor(n: number) {
    this.n = n;
    this.graph = Array.from({ length: n }, () => []);
  }

  addEdge(from: number, to: number, cap: number): void {
    this.graph[from].push({ to, cap, rev: this.graph[to].length });
    this.graph[to].push({ to: from, cap: 0, rev: this.graph[from].length - 1 });
  }

  private bfs(s: number, t: number): boolean {
    this.level = new Int32Array(this.n).fill(-1);
    this.level[s] = 0;
    const q: number[] = [s];
    let head = 0;
    while (head < q.length) {
      const v = q[head++];
      for (const e of this.graph[v]) {
        if (e.cap > 0 && this.level[e.to] < 0) {
          this.level[e.to] = this.level[v] + 1;
          q.push(e.to);
        }
      }
    }
    return this.level[t] >= 0;
  }

  private dfs(v: number, t: number, f: number): number {
    if (v === t) return f;
    for (; this.iter[v] < this.graph[v].length; this.iter[v]++) {
      const e = this.graph[v][this.iter[v]];
      if (e.cap > 0 && this.level[v] < this.level[e.to]) {
        const d = this.dfs(e.to, t, Math.min(f, e.cap));
        if (d > 0) {
          e.cap -= d;
          this.graph[e.to][e.rev].cap += d;
          return d;
        }
      }
    }
    return 0;
  }

  maxFlow(s: number, t: number): number {
    let flow = 0;
    while (this.bfs(s, t)) {
      this.iter = new Int32Array(this.n);
      let f: number;
      while ((f = this.dfs(s, t, Number.POSITIVE_INFINITY)) > 0) {
        flow += f;
      }
    }
    return flow;
  }
}
