// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tarjan's strongly-connected-components algorithm. Iterative-flavor
 * implementation using an explicit stack to avoid recursion depth limits.
 */

export function tarjanSCC(graph: ReadonlyArray<readonly number[]>): number[][] {
  const n = graph.length;
  const indices = new Int32Array(n).fill(-1);
  const lowlinks = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const sccs: number[][] = [];
  let index = 0;

  const callStack: Array<{ v: number; iter: number }> = [];

  for (let start = 0; start < n; start += 1) {
    if (indices[start] !== -1) continue;
    indices[start] = index;
    lowlinks[start] = index;
    index += 1;
    stack.push(start);
    onStack[start] = 1;
    callStack.push({ v: start, iter: 0 });
    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1]!;
      const adj = graph[frame.v]!;
      if (frame.iter < adj.length) {
        const w = adj[frame.iter]!;
        frame.iter += 1;
        if (indices[w] === -1) {
          indices[w] = index;
          lowlinks[w] = index;
          index += 1;
          stack.push(w);
          onStack[w] = 1;
          callStack.push({ v: w, iter: 0 });
        } else if (onStack[w] === 1) {
          if (indices[w]! < lowlinks[frame.v]!) lowlinks[frame.v] = indices[w]!;
        }
      } else {
        // Pop frame; propagate lowlink to caller.
        if (lowlinks[frame.v]! === indices[frame.v]!) {
          const comp: number[] = [];
          let w: number;
          do {
            w = stack.pop()!;
            onStack[w] = 0;
            comp.push(w);
          } while (w !== frame.v);
          sccs.push(comp);
        }
        callStack.pop();
        if (callStack.length > 0) {
          const parent = callStack[callStack.length - 1]!;
          if (lowlinks[frame.v]! < lowlinks[parent.v]!) lowlinks[parent.v] = lowlinks[frame.v]!;
        }
      }
    }
  }
  return sccs;
}
