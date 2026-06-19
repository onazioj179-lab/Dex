// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Graph centrality (DEX v6 Track G). Degree centrality over an undirected edge
 * list, normalized so the most-connected node scores 1. Pure + unit-tested;
 * Nexus uses it to size hub nodes in the knowledge graph (node radius grows with
 * connectedness, the standard graph-viz convention) instead of file size alone.
 */

/**
 * Returns a normalized degree-centrality score in [0, 1] for each of the
 * `nodeCount` nodes. Edges are `[a, b]` index pairs; out-of-range indices are
 * ignored. When there are no edges every score is 0.
 */
export function degreeCentrality(
  nodeCount: number,
  edges: ReadonlyArray<readonly [number, number]>,
): number[] {
  const degree = new Array<number>(Math.max(0, nodeCount)).fill(0);
  for (const [a, b] of edges) {
    if (a >= 0 && a < nodeCount) degree[a] += 1;
    if (b >= 0 && b < nodeCount) degree[b] += 1;
  }
  let max = 0;
  for (const d of degree) if (d > max) max = d;
  return max === 0 ? degree.map(() => 0) : degree.map(d => d / max);
}
