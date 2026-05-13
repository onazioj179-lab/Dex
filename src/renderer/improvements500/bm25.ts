// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Okapi BM25 ranking.
export interface Bm25Options {
  k1?: number;
  b?: number;
}

export interface Bm25Result {
  docId: number;
  score: number;
}

export class Bm25 {
  private readonly docs: string[][] = [];
  private readonly df = new Map<string, number>();
  private totalLen = 0;
  private readonly k1: number;
  private readonly b: number;

  constructor(opts: Bm25Options = {}) {
    this.k1 = opts.k1 ?? 1.5;
    this.b = opts.b ?? 0.75;
  }

  addDocument(tokens: ReadonlyArray<string>): number {
    const id = this.docs.length;
    this.docs.push(tokens.slice());
    this.totalLen += tokens.length;
    const seen = new Set<string>();
    for (const t of tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    return id;
  }

  private idf(term: string): number {
    const n = this.docs.length;
    const d = this.df.get(term) ?? 0;
    return Math.log(1 + (n - d + 0.5) / (d + 0.5));
  }

  query(queryTokens: ReadonlyArray<string>, topK = 10): Bm25Result[] {
    if (this.docs.length === 0) return [];
    const avg = this.totalLen / this.docs.length;
    const out: Bm25Result[] = [];
    for (let id = 0; id < this.docs.length; id++) {
      const doc = this.docs[id];
      const tf = new Map<string, number>();
      for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      const denomBase = 1 - this.b + (this.b * doc.length) / avg;
      for (const term of queryTokens) {
        const f = tf.get(term);
        if (!f) continue;
        const idf = this.idf(term);
        score += (idf * (f * (this.k1 + 1))) / (f + this.k1 * denomBase);
      }
      if (score > 0) out.push({ docId: id, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, topK);
  }
}
