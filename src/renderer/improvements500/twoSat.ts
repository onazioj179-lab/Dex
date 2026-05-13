// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 2-SAT solver via implication graph + Tarjan's SCC. Each variable i
 * has two literal nodes: 2*i (positive) and 2*i+1 (negated).
 */

export interface TwoSatClause {
  /** Variable index (0..vars-1). */
  a: number;
  /** True for positive literal, false for negated. */
  aPositive: boolean;
  b: number;
  bPositive: boolean;
}

function literalNode(varIdx: number, positive: boolean): number {
  return 2 * varIdx + (positive ? 0 : 1);
}

function negate(node: number): number {
  return node ^ 1;
}

export interface TwoSatResult {
  satisfiable: boolean;
  assignment: boolean[];
}

export function twoSat(vars: number, clauses: ReadonlyArray<TwoSatClause>): TwoSatResult {
  const n = 2 * vars;
  const adj: number[][] = [];
  for (let i = 0; i < n; i += 1) adj.push([]);
  for (const c of clauses) {
    const x = literalNode(c.a, c.aPositive);
    const y = literalNode(c.b, c.bPositive);
    // (x OR y) === (~x -> y) AND (~y -> x)
    adj[negate(x)]!.push(y);
    adj[negate(y)]!.push(x);
  }
  // Kosaraju SCC
  const visited = new Uint8Array(n);
  const order: number[] = [];
  const dfs1 = (u: number): void => {
    const stack: number[] = [u];
    const it = new Int32Array(n);
    visited[u] = 1;
    while (stack.length > 0) {
      const v = stack[stack.length - 1]!;
      const list = adj[v]!;
      if (it[v]! < list.length) {
        const w = list[it[v]!]!;
        it[v] = it[v]! + 1;
        if (!visited[w]) {
          visited[w] = 1;
          stack.push(w);
        }
      } else {
        order.push(v);
        stack.pop();
      }
    }
  };
  for (let i = 0; i < n; i += 1) if (!visited[i]) dfs1(i);
  const radj: number[][] = [];
  for (let i = 0; i < n; i += 1) radj.push([]);
  for (let u = 0; u < n; u += 1) for (const v of adj[u]!) radj[v]!.push(u);
  const comp = new Int32Array(n).fill(-1);
  let cId = 0;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const start = order[i]!;
    if (comp[start] !== -1) continue;
    const stack: number[] = [start];
    comp[start] = cId;
    while (stack.length > 0) {
      const u = stack.pop()!;
      for (const v of radj[u]!) {
        if (comp[v] === -1) {
          comp[v] = cId;
          stack.push(v);
        }
      }
    }
    cId += 1;
  }
  const assignment = new Array<boolean>(vars).fill(false);
  for (let i = 0; i < vars; i += 1) {
    if (comp[2 * i] === comp[2 * i + 1]) {
      return { satisfiable: false, assignment: [] };
    }
    assignment[i] = comp[2 * i]! > comp[2 * i + 1]!;
  }
  return { satisfiable: true, assignment };
}
