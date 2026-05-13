// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Articulation points (cut vertices) in undirected graph via Tarjan's
 * lowlink algorithm. Returns sorted unique vertex indices.
 */

export function articulationPoints(graph: ReadonlyArray<readonly number[]>): number[] {
  const n = graph.length;
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const isAp = new Uint8Array(n);
  let timer = 0;

  const dfs = (start: number): void => {
    // Iterative DFS that tracks children of root
    const stack: Array<{ u: number; iter: number }> = [{ u: start, iter: 0 }];
    disc[start] = timer;
    low[start] = timer;
    timer += 1;
    let rootChildren = 0;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const u = frame.u;
      const list = graph[u]!;
      if (frame.iter < list.length) {
        const v = list[frame.iter]!;
        frame.iter += 1;
        if (disc[v] === -1) {
          parent[v] = u;
          if (u === start) rootChildren += 1;
          disc[v] = timer;
          low[v] = timer;
          timer += 1;
          stack.push({ u: v, iter: 0 });
        } else if (v !== parent[u]) {
          low[u] = Math.min(low[u]!, disc[v]!);
        }
      } else {
        stack.pop();
        if (stack.length > 0) {
          const pu = stack[stack.length - 1]!.u;
          low[pu] = Math.min(low[pu]!, low[u]!);
          if (pu !== start && low[u]! >= disc[pu]!) isAp[pu] = 1;
        }
      }
    }
    if (rootChildren > 1) isAp[start] = 1;
  };

  for (let i = 0; i < n; i += 1) if (disc[i] === -1) dfs(i);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) if (isAp[i]) out.push(i);
  return out;
}
