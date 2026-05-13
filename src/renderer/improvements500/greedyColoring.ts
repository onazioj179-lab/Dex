// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Greedy graph coloring via Welsh-Powell ordering. Produces a valid
 * (not necessarily optimal) proper colouring with at most
 * (max-degree + 1) colours.
 */

export interface ColoringResult {
  /** Color index per vertex. */
  color: Int32Array;
  /** Total number of distinct colours used. */
  colorsUsed: number;
}

export function greedyColoring(graph: ReadonlyArray<readonly number[]>): ColoringResult {
  const n = graph.length;
  const order = new Array(n);
  for (let i = 0; i < n; i += 1) order[i] = i;
  // Sort vertices by descending degree (Welsh-Powell heuristic)
  order.sort((a, b) => graph[b]!.length - graph[a]!.length);
  const color = new Int32Array(n).fill(-1);
  let used = 0;
  for (const v of order) {
    const blocked = new Set<number>();
    for (const u of graph[v]!) if (color[u]! !== -1) blocked.add(color[u]!);
    let c = 0;
    while (blocked.has(c)) c += 1;
    color[v] = c;
    if (c + 1 > used) used = c + 1;
  }
  return { color, colorsUsed: used };
}
