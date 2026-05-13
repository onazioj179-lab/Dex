// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Iterative Deepening DFS - combines DFS memory efficiency with BFS
 * optimal depth-finding. Useful when the goal depth is unknown but
 * shallow.
 */

export interface IddfsOptions {
  maxDepth: number;
}

/**
 * Returns first path from `start` to a node satisfying `goal`, or null.
 * `expand(node)` returns successor nodes.
 */
export function iddfs<T>(
  start: T,
  goal: (node: T) => boolean,
  expand: (node: T) => Iterable<T>,
  opts: IddfsOptions,
): T[] | null {
  for (let depth = 0; depth <= opts.maxDepth; depth += 1) {
    const found = dls(start, goal, expand, depth);
    if (found !== null) return found;
  }
  return null;
}

function dls<T>(
  node: T,
  goal: (n: T) => boolean,
  expand: (n: T) => Iterable<T>,
  limit: number,
): T[] | null {
  if (goal(node)) return [node];
  if (limit === 0) return null;
  for (const child of expand(node)) {
    const sub = dls(child, goal, expand, limit - 1);
    if (sub !== null) return [node, ...sub];
  }
  return null;
}
