// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface HitsResult {
  hubs: Float64Array;
  authorities: Float64Array;
}

export function hits(
  adjacency: ReadonlyArray<ReadonlyArray<number>>,
  iterations = 50,
): HitsResult {
  const n = adjacency.length;
  const hubs = new Float64Array(n).fill(1);
  const auth = new Float64Array(n).fill(1);
  const incoming: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (const j of adjacency[i]) incoming[j].push(i);
  }
  for (let it = 0; it < iterations; it++) {
    const newAuth = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const p of incoming[i]) s += hubs[p];
      newAuth[i] = s;
    }
    const newHubs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const j of adjacency[i]) s += newAuth[j];
      newHubs[i] = s;
    }
    let aNorm = 0;
    let hNorm = 0;
    for (let i = 0; i < n; i++) {
      aNorm += newAuth[i] * newAuth[i];
      hNorm += newHubs[i] * newHubs[i];
    }
    aNorm = Math.sqrt(aNorm) || 1;
    hNorm = Math.sqrt(hNorm) || 1;
    for (let i = 0; i < n; i++) {
      auth[i] = newAuth[i] / aNorm;
      hubs[i] = newHubs[i] / hNorm;
    }
  }
  return { hubs, authorities: auth };
}
