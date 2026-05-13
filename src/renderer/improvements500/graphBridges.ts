// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bridges (cut edges) in undirected graph via Tarjan's lowlink. Each
 * bridge edge's removal disconnects the graph.
 */

export interface BridgeEdge {
  u: number;
  v: number;
}

export function graphBridges(graph: ReadonlyArray<readonly number[]>): BridgeEdge[] {
  const n = graph.length;
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const parent = new Int32Array(n).fill(-1);
  let timer = 0;
  const out: BridgeEdge[] = [];

  const dfs = (start: number): void => {
    disc[start] = timer;
    low[start] = timer;
    timer += 1;
    const stack: Array<{ u: number; iter: number }> = [{ u: start, iter: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const u = frame.u;
      const list = graph[u]!;
      if (frame.iter < list.length) {
        const v = list[frame.iter]!;
        frame.iter += 1;
        if (disc[v] === -1) {
          parent[v] = u;
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
          if (low[u]! > disc[pu]!) out.push({ u: pu, v: u });
        }
      }
    }
  };

  for (let i = 0; i < n; i += 1) if (disc[i] === -1) dfs(i);
  return out;
}
