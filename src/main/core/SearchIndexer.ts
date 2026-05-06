// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Search Indexer (Optimized)
// Phase 15: Deep Internal Micro-Optimization
// Incremental indexing with bounded memory and instant partial results
// ===========================================================================

import log from 'electron-log';
import { BoundedCache, memoryManager } from './MemoryManager';
import { backgroundTasks, scheduleIdleWork } from './BackgroundTasks';

// ===========================================================================
// TYPES
// ===========================================================================

export interface SearchableItem {
  id: string;
  type: 'note' | 'action' | 'workflow' | 'operation' | 'timer' | 'task';
  title: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  updatedAt: number;
}

export interface SearchResult {
  item: SearchableItem;
  score: number;
  matches: Array<{
    field: string;
    positions: number[];
  }>;
}

interface TokenIndex {
  token: string;
  ids: Set<string>;
  idf: number; // Inverse document frequency
}

interface DocumentEntry {
  id: string;
  tokens: Map<string, number>; // token -> frequency
  updatedAt: number;
}

// ===========================================================================
// TOKENIZER - Efficient text processing
// ===========================================================================

class Tokenizer {
  private cache: BoundedCache<string[]>;
  private stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
    'she', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
  ]);

  constructor() {
    this.cache = memoryManager.createCache<string[]>('tokenizer', {
      maxSize: 1000,
      ttlMs: 10 * 60 * 1000, // 10 minute TTL
    });
  }

  tokenize(text: string): string[] {
    // Check cache first
    const cacheKey = this.hashText(text);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Tokenize
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => 
        token.length >= 2 && 
        token.length <= 50 &&
        !this.stopWords.has(token) &&
        !/^\d+$/.test(token)
      );

    // Cache result
    this.cache.set(cacheKey, tokens);
    return tokens;
  }

  // Extract n-grams for fuzzy matching
  ngrams(text: string, n = 3): string[] {
    const normalized = text.toLowerCase().replace(/\s+/g, '');
    if (normalized.length < n) return [normalized];
    
    const grams: string[] = [];
    for (let i = 0; i <= normalized.length - n; i++) {
      grams.push(normalized.slice(i, i + n));
    }
    return grams;
  }

  private hashText(text: string): string {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 100); i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return `${hash}-${text.length}`;
  }
}

// ===========================================================================
// SEARCH INDEX
// ===========================================================================

class SearchIndexerClass {
  private tokenizer = new Tokenizer();
  private invertedIndex = new Map<string, TokenIndex>();
  private documents = new Map<string, DocumentEntry>();
  private items = new Map<string, SearchableItem>();
  private indexingQueue: SearchableItem[] = [];
  private isIndexing = false;
  private dirty = false;

  // Configuration
  private config = {
    maxIndexSize: 10000,
    batchIndexSize: 50,
    minQueryLength: 2,
    maxResults: 100,
    fuzzyThreshold: 0.6,
  };

  // Add or update an item in the index
  index(item: SearchableItem): void {
    this.items.set(item.id, item);
    this.indexingQueue.push(item);
    this.dirty = true;

    // Schedule background indexing
    this.scheduleIndexing();
  }

  // Remove an item from the index
  remove(itemId: string): void {
    const doc = this.documents.get(itemId);
    if (!doc) return;

    // Remove from inverted index
    for (const [token] of doc.tokens) {
      const index = this.invertedIndex.get(token);
      if (index) {
        index.ids.delete(itemId);
        if (index.ids.size === 0) {
          this.invertedIndex.delete(token);
        }
      }
    }

    this.documents.delete(itemId);
    this.items.delete(itemId);
    this.dirty = true;
  }

  // Search with instant partial results
  search(query: string, options?: {
    types?: SearchableItem['type'][];
    limit?: number;
    fuzzy?: boolean;
  }): SearchResult[] {
    const { types, limit = 20, fuzzy = true } = options ?? {};

    if (query.length < this.config.minQueryLength) {
      return [];
    }

    const queryTokens = this.tokenizer.tokenize(query);
    if (queryTokens.length === 0) return [];

    // Calculate scores for each matching document
    const scores = new Map<string, number>();
    const matches = new Map<string, Array<{ field: string; positions: number[] }>>();

    for (const token of queryTokens) {
      // Exact match
      this.addScoresForToken(token, scores, 1.0);

      // Fuzzy matches
      if (fuzzy) {
        for (const [indexToken, index] of this.invertedIndex) {
          if (indexToken !== token && this.similarity(token, indexToken) >= this.config.fuzzyThreshold) {
            this.addScoresForToken(indexToken, scores, 0.7);
          }
        }
      }
    }

    // Build results
    let results: SearchResult[] = [];
    for (const [id, score] of scores) {
      const item = this.items.get(id);
      if (!item) continue;

      // Filter by type
      if (types && !types.includes(item.type)) continue;

      results.push({
        item,
        score,
        matches: matches.get(id) ?? [],
      });
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Limit results
    return results.slice(0, Math.min(limit, this.config.maxResults));
  }

  // Get instant suggestions while typing
  suggest(prefix: string, limit = 5): string[] {
    if (prefix.length < 2) return [];

    const suggestions: Array<{ token: string; score: number }> = [];
    const normalizedPrefix = prefix.toLowerCase();

    for (const [token, index] of this.invertedIndex) {
      if (token.startsWith(normalizedPrefix)) {
        suggestions.push({
          token,
          score: index.ids.size, // Popularity score
        });
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.token);
  }

  // Force immediate indexing (use sparingly)
  async flushIndex(): Promise<void> {
    while (this.indexingQueue.length > 0) {
      await this.processIndexBatch();
    }
    this.updateIDF();
  }

  // Get index statistics
  getStats(): {
    documentCount: number;
    tokenCount: number;
    pendingIndexing: number;
    memoryEstimateMB: number;
  } {
    return {
      documentCount: this.documents.size,
      tokenCount: this.invertedIndex.size,
      pendingIndexing: this.indexingQueue.length,
      memoryEstimateMB: this.estimateMemory(),
    };
  }

  // Clear the entire index
  clear(): void {
    this.invertedIndex.clear();
    this.documents.clear();
    this.items.clear();
    this.indexingQueue = [];
    this.dirty = false;
  }

  private scheduleIndexing(): void {
    if (this.isIndexing) return;

    scheduleIdleWork(async () => {
      await this.processIndexBatch();
    }, { name: 'search-indexing' });
  }

  private async processIndexBatch(): Promise<void> {
    if (this.isIndexing || this.indexingQueue.length === 0) return;

    this.isIndexing = true;

    try {
      const batch = this.indexingQueue.splice(0, this.config.batchIndexSize);
      
      for (const item of batch) {
        this.indexItem(item);
        
        // Yield to main thread periodically
        if (batch.indexOf(item) % 10 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // Update IDF scores after batch
      if (this.dirty) {
        this.updateIDF();
        this.dirty = false;
      }

      // Schedule next batch if more items
      if (this.indexingQueue.length > 0) {
        this.scheduleIndexing();
      }
    } finally {
      this.isIndexing = false;
    }
  }

  private indexItem(item: SearchableItem): void {
    // Enforce max index size
    if (this.documents.size >= this.config.maxIndexSize && !this.documents.has(item.id)) {
      // Remove oldest document
      const oldest = this.findOldestDocument();
      if (oldest) this.remove(oldest);
    }

    // Remove existing entry for this item
    if (this.documents.has(item.id)) {
      this.remove(item.id);
    }

    // Build token frequency map
    const tokenFreq = new Map<string, number>();
    const addTokens = (text: string, boost = 1) => {
      for (const token of this.tokenizer.tokenize(text)) {
        tokenFreq.set(token, (tokenFreq.get(token) ?? 0) + boost);
      }
    };

    // Index fields with different weights
    addTokens(item.title, 3);  // Title is most important
    if (item.content) addTokens(item.content, 1);
    if (item.tags) item.tags.forEach(tag => addTokens(tag, 2));

    // Add to document store
    this.documents.set(item.id, {
      id: item.id,
      tokens: tokenFreq,
      updatedAt: item.updatedAt,
    });

    // Update inverted index
    for (const [token] of tokenFreq) {
      let index = this.invertedIndex.get(token);
      if (!index) {
        index = { token, ids: new Set(), idf: 0 };
        this.invertedIndex.set(token, index);
      }
      index.ids.add(item.id);
    }
  }

  private addScoresForToken(token: string, scores: Map<string, number>, boost: number): void {
    const index = this.invertedIndex.get(token);
    if (!index) return;

    for (const id of index.ids) {
      const doc = this.documents.get(id);
      if (!doc) continue;

      const tf = doc.tokens.get(token) ?? 0;
      const tfidf = tf * index.idf * boost;
      scores.set(id, (scores.get(id) ?? 0) + tfidf);
    }
  }

  private updateIDF(): void {
    const N = this.documents.size;
    if (N === 0) return;

    for (const [, index] of this.invertedIndex) {
      // IDF = log(N / df) where df = document frequency
      index.idf = Math.log(N / index.ids.size);
    }
  }

  private similarity(a: string, b: string): number {
    // Levenshtein distance-based similarity
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    
    const distance = this.levenshtein(a, b);
    return 1 - distance / maxLen;
  }

  private levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private findOldestDocument(): string | undefined {
    let oldest: { id: string; updatedAt: number } | undefined;

    for (const [id, doc] of this.documents) {
      if (!oldest || doc.updatedAt < oldest.updatedAt) {
        oldest = { id, updatedAt: doc.updatedAt };
      }
    }

    return oldest?.id;
  }

  private estimateMemory(): number {
    // Rough estimate: ~100 bytes per token, ~200 bytes per document
    const tokenBytes = this.invertedIndex.size * 100;
    const docBytes = this.documents.size * 200;
    return (tokenBytes + docBytes) / (1024 * 1024);
  }
}

// Singleton export
export const searchIndexer = new SearchIndexerClass();
