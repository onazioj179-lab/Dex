// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cycle detection in directed graphs via DFS three-color marking.
 * Returns one cycle as a node sequence (start === end), or null.
 */

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function findDirectedCycle(graph: ReadonlyArray<readonly number[]>): number[] | null {
  const n = graph.length;
  const color = new Uint8Array(n).fill(WHITE);
  const parent = new Int32Array(n).fill(-1);
  let cycleStart = -1;
  let cycleEnd = -1;

  const dfs = (start: number): boolean => {
    const stack: number[] = [start];
    const it = new Int32Array(n);
    color[start] = GRAY;
    while (stack.length > 0) {
      const u = stack[stack.length - 1]!;
      const list = graph[u]!;
      if (it[u]! < list.length) {
        const v = list[it[u]!]!;
        it[u] = it[u]! + 1;
        if (color[v] === WHITE) {
          color[v] = GRAY;
          parent[v] = u;
          stack.push(v);
        } else if (color[v] === GRAY) {
          cycleStart = v;
          cycleEnd = u;
          return true;
        }
      } else {
        color[u] = BLACK;
        stack.pop();
      }
    }
    return false;
  };

  for (let i = 0; i < n; i += 1) {
    if (color[i] === WHITE && dfs(i)) {
      const cycle: number[] = [];
      let v = cycleEnd;
      cycle.push(cycleStart);
      while (v !== cycleStart && v !== -1) {
        cycle.push(v);
        v = parent[v]!;
      }
      cycle.push(cycleStart);
      cycle.reverse();
      return cycle;
    }
  }
  return null;
}

/** True iff the directed graph contains any cycle. */
export function hasDirectedCycle(graph: ReadonlyArray<readonly number[]>): boolean {
  return findDirectedCycle(graph) !== null;
}
