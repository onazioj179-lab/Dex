// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/*
 * DEX - Aho-Corasick multi-pattern string matcher (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 */

export interface AhoMatch {
  patternIndex: number;
  start: number;
  end: number;
}

interface Node {
  next: Map<number, number>;
  fail: number;
  out: number[];
  depth: number;
}

export class AhoCorasick {
  private readonly nodes: Node[] = [];
  private readonly patterns: string[];

  constructor(patterns: readonly string[]) {
    this.patterns = patterns.slice();
    this.nodes.push({ next: new Map(), fail: 0, out: [], depth: 0 });
    for (let i = 0; i < this.patterns.length; i += 1) {
      this.insert(this.patterns[i]!, i);
    }
    this.buildFail();
  }

  private insert(pat: string, idx: number): void {
    let node = 0;
    for (let i = 0; i < pat.length; i += 1) {
      const c = pat.charCodeAt(i);
      const cur = this.nodes[node]!;
      let nxt = cur.next.get(c);
      if (nxt === undefined) {
        nxt = this.nodes.length;
        this.nodes.push({ next: new Map(), fail: 0, out: [], depth: cur.depth + 1 });
        cur.next.set(c, nxt);
      }
      node = nxt;
    }
    this.nodes[node]!.out.push(idx);
  }

  private buildFail(): void {
    const queue: number[] = [];
    const root = this.nodes[0]!;
    for (const [, child] of root.next) {
      this.nodes[child]!.fail = 0;
      queue.push(child);
    }
    while (queue.length > 0) {
      const u = queue.shift()!;
      const node = this.nodes[u]!;
      for (const [c, v] of node.next) {
        let f = node.fail;
        while (f !== 0 && !this.nodes[f]!.next.has(c)) f = this.nodes[f]!.fail;
        const fNode = this.nodes[f]!;
        const candidate = fNode.next.get(c);
        this.nodes[v]!.fail = candidate !== undefined && candidate !== v ? candidate : 0;
        for (const o of this.nodes[this.nodes[v]!.fail]!.out) this.nodes[v]!.out.push(o);
        queue.push(v);
      }
    }
  }

  search(text: string): AhoMatch[] {
    const out: AhoMatch[] = [];
    let node = 0;
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i);
      while (node !== 0 && !this.nodes[node]!.next.has(c)) node = this.nodes[node]!.fail;
      const nxt = this.nodes[node]!.next.get(c);
      if (nxt !== undefined) node = nxt;
      const cur = this.nodes[node]!;
      if (cur.out.length > 0) {
        for (const idx of cur.out) {
          const len = this.patterns[idx]!.length;
          out.push({ patternIndex: idx, start: i - len + 1, end: i + 1 });
        }
      }
    }
    return out;
  }
}
