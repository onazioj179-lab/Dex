// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Hungarian algorithm for minimum-cost assignment on a square cost
 * matrix. Returns the assignment array (worker[i] = job j) and the
 * total minimum cost. O(n^3).
 */

export interface HungarianResult {
  /** assignment[i] = j means worker i is assigned to job j */
  assignment: number[];
  cost: number;
}

export function hungarianAssign(costMatrix: ReadonlyArray<ReadonlyArray<number>>): HungarianResult {
  const n = costMatrix.length;
  if (n === 0) return { assignment: [], cost: 0 };
  for (const row of costMatrix) {
    if (row.length !== n) throw new Error('hungarianAssign: cost matrix must be square');
  }
  // Implementation based on the O(n^3) potentials method (Jonker-Volgenant style).
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
          if (cur < minv[j]!) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j]! < delta) {
            delta = minv[j]!;
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }
  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j += 1) {
    if (p[j]! > 0) assignment[p[j]! - 1] = j - 1;
  }
  let cost = 0;
  for (let i = 0; i < n; i += 1) cost += costMatrix[i]![assignment[i]!]!;
  return { assignment, cost };
}
