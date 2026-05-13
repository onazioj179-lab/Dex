// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Held-Karp dynamic programming TSP. Exact solution in O(n^2 * 2^n)
 * time and O(n * 2^n) memory. Practical up to ~20 cities.
 */

/**
 * Solve symmetric/asymmetric Travelling Salesman starting and ending at city 0.
 * `dist` is an n x n flat row-major matrix (dist[i*n+j] = cost i->j).
 * Returns total cost and the visiting order (starts and ends at 0).
 */
export function tspBitmask(
  n: number,
  dist: ArrayLike<number>,
): { cost: number; tour: number[] } {
  if (n <= 1) return { cost: 0, tour: [0] };
  if (n > 24) throw new Error('tspBitmask: n must be <= 24');
  const fullMask = (1 << n) - 1;
  const size = n * (1 << n);
  const dp = new Float64Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  dp[(1 << 0) * n + 0] = 0;
  for (let mask = 1; mask <= fullMask; mask += 1) {
    if (!(mask & 1)) continue;
    for (let u = 0; u < n; u += 1) {
      if (!(mask & (1 << u))) continue;
      const cur = dp[mask * n + u]!;
      if (!isFinite(cur)) continue;
      for (let v = 0; v < n; v += 1) {
        if (mask & (1 << v)) continue;
        const next = mask | (1 << v);
        const cost = cur + dist[u * n + v]!;
        if (cost < dp[next * n + v]!) {
          dp[next * n + v] = cost;
          parent[next * n + v] = u;
        }
      }
    }
  }
  let bestEnd = 1;
  let bestCost = Infinity;
  for (let v = 1; v < n; v += 1) {
    const cost = dp[fullMask * n + v]! + dist[v * n + 0]!;
    if (cost < bestCost) {
      bestCost = cost;
      bestEnd = v;
    }
  }
  const tour: number[] = [];
  let mask = fullMask;
  let cur = bestEnd;
  while (cur !== -1) {
    tour.push(cur);
    const p = parent[mask * n + cur]!;
    mask &= ~(1 << cur);
    cur = p;
  }
  tour.reverse();
  tour.push(0);
  return { cost: bestCost, tour };
}
