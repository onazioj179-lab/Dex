// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface PageRankOptions {
  damping?: number;
  iterations?: number;
  tolerance?: number;
}

export function pageRank(
  adjacency: ReadonlyArray<ReadonlyArray<number>>,
  opts: PageRankOptions = {},
): Float64Array {
  const n = adjacency.length;
  const d = opts.damping ?? 0.85;
  const maxIter = opts.iterations ?? 100;
  const tol = opts.tolerance ?? 1e-8;
  const rank = new Float64Array(n).fill(1 / n);
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = adjacency[i].length;
  for (let it = 0; it < maxIter; it++) {
    const next = new Float64Array(n).fill((1 - d) / n);
    let danglingSum = 0;
    for (let i = 0; i < n; i++) {
      if (out[i] === 0) danglingSum += rank[i];
    }
    const danglingShare = (d * danglingSum) / n;
    for (let i = 0; i < n; i++) next[i] += danglingShare;
    for (let i = 0; i < n; i++) {
      if (out[i] === 0) continue;
      const share = (d * rank[i]) / out[i];
      const neigh = adjacency[i];
      for (let j = 0; j < neigh.length; j++) next[neigh[j]] += share;
    }
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(next[i] - rank[i]);
    rank.set(next);
    if (diff < tol) break;
  }
  return rank;
}
