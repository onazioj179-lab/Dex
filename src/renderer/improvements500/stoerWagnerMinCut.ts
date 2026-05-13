// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export function stoerWagnerMinCut(weights: ReadonlyArray<ReadonlyArray<number>>): number {
  const n = weights.length;
  if (n < 2) return 0;
  const w: number[][] = weights.map((row) => row.slice());
  const exists = new Uint8Array(n).fill(1);
  let best = Number.POSITIVE_INFINITY;
  for (let phase = 0; phase < n - 1; phase++) {
    const added = new Uint8Array(n);
    const wsum = new Float64Array(n);
    let prev = -1;
    let last = -1;
    for (let i = 0; i < n - phase; i++) {
      let sel = -1;
      let bestW = -Infinity;
      for (let v = 0; v < n; v++) {
        if (exists[v] && !added[v] && wsum[v] > bestW) {
          bestW = wsum[v];
          sel = v;
        }
      }
      if (sel === -1) break;
      if (i === n - phase - 1) {
        if (bestW < best) best = bestW;
        // merge sel into prev
        if (prev !== -1) {
          for (let v = 0; v < n; v++) {
            w[prev][v] += w[sel][v];
            w[v][prev] += w[v][sel];
          }
          exists[sel] = 0;
        }
        last = sel;
      } else {
        added[sel] = 1;
        for (let v = 0; v < n; v++) if (exists[v] && !added[v]) wsum[v] += w[sel][v];
        prev = sel;
      }
    }
    if (last === -1) break;
  }
  return best === Number.POSITIVE_INFINITY ? 0 : best;
}
