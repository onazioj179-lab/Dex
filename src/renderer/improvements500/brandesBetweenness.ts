// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export function brandesBetweenness(
  adjacency: ReadonlyArray<ReadonlyArray<number>>,
): Float64Array {
  const n = adjacency.length;
  const cb = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    const stack: number[] = [];
    const pred: number[][] = Array.from({ length: n }, () => []);
    const sigma = new Float64Array(n);
    sigma[s] = 1;
    const dist = new Int32Array(n).fill(-1);
    dist[s] = 0;
    const queue: number[] = [s];
    let head = 0;
    while (head < queue.length) {
      const v = queue[head++];
      stack.push(v);
      for (const w of adjacency[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }
    const delta = new Float64Array(n);
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) cb[w] += delta[w];
    }
  }
  for (let i = 0; i < n; i++) cb[i] /= 2;
  return cb;
}
