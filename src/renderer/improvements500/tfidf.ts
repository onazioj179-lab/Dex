// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface TfidfQueryResult {
  docId: number;
  score: number;
}

export class Tfidf {
  private readonly docs: string[][] = [];
  private readonly df = new Map<string, number>();

  addDocument(tokens: ReadonlyArray<string>): number {
    const id = this.docs.length;
    this.docs.push(tokens.slice());
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
    if (d === 0) return 0;
    return Math.log((n + 1) / (d + 1)) + 1;
  }

  vector(docId: number): Map<string, number> {
    const tokens = this.docs[docId];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const out = new Map<string, number>();
    for (const [t, c] of tf) out.set(t, (c / tokens.length) * this.idf(t));
    return out;
  }

  query(queryTokens: ReadonlyArray<string>, topK = 10): TfidfQueryResult[] {
    const queryWeights = new Map<string, number>();
    for (const t of queryTokens) queryWeights.set(t, (queryWeights.get(t) ?? 0) + this.idf(t));
    const scores: TfidfQueryResult[] = [];
    for (let id = 0; id < this.docs.length; id++) {
      const v = this.vector(id);
      let s = 0;
      for (const [t, w] of queryWeights) s += (v.get(t) ?? 0) * w;
      if (s > 0) scores.push({ docId: id, score: s });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  get documentCount(): number {
    return this.docs.length;
  }
}
