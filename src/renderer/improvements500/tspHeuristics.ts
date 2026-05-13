// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
function tourCost(order: number[], dist: ReadonlyArray<ReadonlyArray<number>>): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) total += dist[order[i]][order[i + 1]];
  total += dist[order[order.length - 1]][order[0]];
  return total;
}

export function tspNearestNeighbor(
  dist: ReadonlyArray<ReadonlyArray<number>>,
  start = 0,
): { order: number[]; cost: number } {
  const n = dist.length;
  const visited = new Uint8Array(n);
  const order: number[] = [start];
  visited[start] = 1;
  let cur = start;
  for (let i = 1; i < n; i++) {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && dist[cur][j] < bestD) {
        bestD = dist[cur][j];
        best = j;
      }
    }
    if (best === -1) break;
    visited[best] = 1;
    order.push(best);
    cur = best;
  }
  return { order, cost: tourCost(order, dist) };
}

export function tsp2Opt(
  initialOrder: ReadonlyArray<number>,
  dist: ReadonlyArray<ReadonlyArray<number>>,
  maxIterations = 1000,
): { order: number[]; cost: number } {
  const order = initialOrder.slice();
  const n = order.length;
  let improved = true;
  let iter = 0;
  while (improved && iter < maxIterations) {
    improved = false;
    iter++;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = order[i - 1];
        const b = order[i];
        const c = order[k];
        const d = order[(k + 1) % n];
        const before = dist[a][b] + dist[c][d];
        const after = dist[a][c] + dist[b][d];
        if (after + 1e-12 < before) {
          let lo = i;
          let hi = k;
          while (lo < hi) {
            const t = order[lo];
            order[lo] = order[hi];
            order[hi] = t;
            lo++;
            hi--;
          }
          improved = true;
        }
      }
    }
  }
  return { order, cost: tourCost(order, dist) };
}
