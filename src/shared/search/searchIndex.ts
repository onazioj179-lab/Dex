// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * In-memory inverted search index (the pure-logic core of the shared Search
 * Engine; the JS fallback before native `fts.rs`). Add documents, then query
 * with BM25 ranking. Integration layer composing `tokenize` + `bm25`. Pure: no
 * DOM, no IO — persistence/indexing host lives above.
 */

import { termFrequencies, tokenize } from './tokenize';
import { bm25Score, type CorpusStats } from './bm25';

interface Doc {
  tf: Map<string, number>;
  length: number;
}

export interface IndexHit {
  id: string;
  score: number;
}

export class SearchIndex {
  private docs = new Map<string, Doc>();
  private df = new Map<string, number>(); // document frequency per term
  private totalLength = 0;

  /** Add or replace a document. */
  add(id: string, text: string): void {
    this.remove(id); // replace semantics
    const tf = termFrequencies(text);
    let length = 0;
    tf.forEach((count, term) => {
      length += count;
      this.df.set(term, (this.df.get(term) ?? 0) + 1);
    });
    this.docs.set(id, { tf, length });
    this.totalLength += length;
  }

  /** Remove a document if present. */
  remove(id: string): void {
    const doc = this.docs.get(id);
    if (!doc) return;
    doc.tf.forEach((_count, term) => {
      const next = (this.df.get(term) ?? 1) - 1;
      if (next <= 0) this.df.delete(term); else this.df.set(term, next);
    });
    this.totalLength -= doc.length;
    this.docs.delete(id);
  }

  size(): number { return this.docs.size; }

  private stats(): CorpusStats {
    return {
      totalDocs: this.docs.size,
      avgDocLength: this.docs.size === 0 ? 1 : this.totalLength / this.docs.size,
      docFreq: this.df,
    };
  }

  /** BM25-ranked search; only matching docs returned, highest score first. */
  search(query: string, limit = 20): IndexHit[] {
    const terms = tokenize(query);
    if (terms.length === 0 || this.docs.size === 0) return [];
    const stats = this.stats();
    const hits: IndexHit[] = [];
    this.docs.forEach((doc, id) => {
      const score = bm25Score(terms, doc.tf, doc.length, stats);
      if (score > 0) hits.push({ id, score });
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  clear(): void {
    this.docs.clear();
    this.df.clear();
    this.totalLength = 0;
  }
}
