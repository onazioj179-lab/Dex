// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Kosaraju strongly connected components. Two DFS passes over the
 * graph and its transpose. Returns component ID per node.
 */

export interface SccResult {
  /** Component index assigned to each node. */
  componentOf: Int32Array;
  /** Total number of components. */
  count: number;
  /** Component lists (componentNodes[c] = list of nodes in component c). */
  componentNodes: number[][];
}

export function kosarajuScc(graph: ReadonlyArray<readonly number[]>): SccResult {
  const n = graph.length;
  const visited = new Uint8Array(n);
  const order: number[] = [];
  // First pass on original graph - record finishing order iteratively
  for (let i = 0; i < n; i += 1) {
    if (visited[i]) continue;
    const stack: Array<{ u: number; iter: number }> = [{ u: i, iter: 0 }];
    visited[i] = 1;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const u = frame.u;
      const list = graph[u]!;
      if (frame.iter < list.length) {
        const v = list[frame.iter]!;
        frame.iter += 1;
        if (!visited[v]) {
          visited[v] = 1;
          stack.push({ u: v, iter: 0 });
        }
      } else {
        order.push(u);
        stack.pop();
      }
    }
  }
  // Build transpose
  const transpose: number[][] = [];
  for (let i = 0; i < n; i += 1) transpose.push([]);
  for (let u = 0; u < n; u += 1) {
    for (const v of graph[u]!) transpose[v]!.push(u);
  }
  // Second pass in reverse finishing order
  const componentOf = new Int32Array(n).fill(-1);
  const componentNodes: number[][] = [];
  let cid = 0;
  for (let idx = order.length - 1; idx >= 0; idx -= 1) {
    const start = order[idx]!;
    if (componentOf[start]! !== -1) continue;
    const comp: number[] = [];
    const stack = [start];
    componentOf[start] = cid;
    while (stack.length > 0) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of transpose[u]!) {
        if (componentOf[v]! === -1) {
          componentOf[v] = cid;
          stack.push(v);
        }
      }
    }
    componentNodes.push(comp);
    cid += 1;
  }
  return { componentOf, count: cid, componentNodes };
}
