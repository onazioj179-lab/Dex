// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Hopcroft-Karp maximum bipartite matching. O(E * sqrt(V)) - much
 * faster than the naive O(VE) Hungarian-style augmenting-path search.
 */

const INF = Number.POSITIVE_INFINITY;

/**
 * Match left-side vertices [0..nLeft) to right-side vertices [0..nRight)
 * given an adjacency list `leftAdj[u]` listing right neighbors of u.
 * Returns array `matchL` where `matchL[u] = v` (or -1) and `matchSize`.
 */
export function hopcroftKarp(
  nLeft: number,
  nRight: number,
  leftAdj: ReadonlyArray<readonly number[]>,
): { matchL: Int32Array; matchR: Int32Array; matchSize: number } {
  const matchL = new Int32Array(nLeft).fill(-1);
  const matchR = new Int32Array(nRight).fill(-1);
  const dist: number[] = new Array(nLeft).fill(INF);

  const bfs = (): boolean => {
    const queue: number[] = [];
    for (let u = 0; u < nLeft; u += 1) {
      if (matchL[u] === -1) {
        dist[u] = 0;
        queue.push(u);
      } else {
        dist[u] = INF;
      }
    }
    let found = false;
    let head = 0;
    while (head < queue.length) {
      const u = queue[head]!;
      head += 1;
      for (const v of leftAdj[u]!) {
        const pair = matchR[v]!;
        if (pair === -1) found = true;
        else if (dist[pair] === INF) {
          dist[pair] = dist[u]! + 1;
          queue.push(pair);
        }
      }
    }
    return found;
  };

  const dfs = (u: number): boolean => {
    for (const v of leftAdj[u]!) {
      const pair = matchR[v]!;
      if (pair === -1 || (dist[pair] === dist[u]! + 1 && dfs(pair))) {
        matchL[u] = v;
        matchR[v] = u;
        return true;
      }
    }
    dist[u] = INF;
    return false;
  };

  let matchSize = 0;
  while (bfs()) {
    for (let u = 0; u < nLeft; u += 1) {
      if (matchL[u] === -1 && dfs(u)) matchSize += 1;
    }
  }
  return { matchL, matchR, matchSize };
}
