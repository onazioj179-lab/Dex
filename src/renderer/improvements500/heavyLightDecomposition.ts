// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface HldData {
  parent: Int32Array;
  depth: Int32Array;
  heavy: Int32Array;
  head: Int32Array;
  pos: Int32Array;
}

export function heavyLightDecomposition(
  adjacency: ReadonlyArray<ReadonlyArray<number>>,
  root = 0,
): HldData {
  const n = adjacency.length;
  const parent = new Int32Array(n).fill(-1);
  const depth = new Int32Array(n);
  const size = new Int32Array(n);
  const heavy = new Int32Array(n).fill(-1);
  const head = new Int32Array(n);
  const pos = new Int32Array(n);
  const order: number[] = [];
  // iterative DFS for size + parent + depth
  const stack: Array<[number, number]> = [[root, 0]];
  parent[root] = -1;
  depth[root] = 0;
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const v = top[0];
    if (top[1] === 0) order.push(v);
    if (top[1] < adjacency[v].length) {
      const u = adjacency[v][top[1]++];
      if (u !== parent[v]) {
        parent[u] = v;
        depth[u] = depth[v] + 1;
        stack.push([u, 0]);
      }
    } else {
      stack.pop();
    }
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i];
    size[v] = 1;
    let maxSize = 0;
    for (const u of adjacency[v]) {
      if (u === parent[v]) continue;
      size[v] += size[u];
      if (size[u] > maxSize) {
        maxSize = size[u];
        heavy[v] = u;
      }
    }
  }
  let timer = 0;
  const decomp: number[] = [root];
  head[root] = root;
  while (decomp.length > 0) {
    const v = decomp.pop()!;
    pos[v] = timer++;
    let cur = v;
    while (heavy[cur] !== -1) {
      const h = heavy[cur];
      head[h] = head[cur];
      pos[h] = timer++;
      for (const u of adjacency[cur]) {
        if (u !== parent[cur] && u !== h) {
          head[u] = u;
          decomp.push(u);
        }
      }
      cur = h;
    }
    for (const u of adjacency[cur]) {
      if (u !== parent[cur]) {
        head[u] = u;
        decomp.push(u);
      }
    }
  }
  return { parent, depth, heavy, head, pos };
}
