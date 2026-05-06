// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX -- Search Indexer Web Worker (item 145)
// ===========================================================================
// Offloads search index building, file hashing, and fuzzy matching to a
// background thread so the main/UI thread stays responsive.
// ===========================================================================

interface IndexEntry {
  id: string;
  type: 'app' | 'file' | 'note' | 'task' | 'page' | 'setting' | 'action';
  title: string;
  keywords: string[];
  path?: string;
  icon?: string;
  color?: string;
  score?: number;
}

interface SearchIndex {
  entries: IndexEntry[];
  trigrams: Map<string, Set<number>>;
  lastBuilt: number;
}

let index: SearchIndex = {
  entries: [],
  trigrams: new Map(),
  lastBuilt: 0,
};

// ---------------------------------------------------------------------------
// Trigram index builder — O(n) build, O(1) lookup per trigram
// ---------------------------------------------------------------------------

function buildTrigrams(text: string): string[] {
  const t = text.toLowerCase().trim();
  const grams: string[] = [];
  for (let i = 0; i <= t.length - 3; i++) {
    grams.push(t.slice(i, i + 3));
  }
  return grams;
}

function buildIndex(entries: IndexEntry[]): void {
  index.entries = entries;
  index.trigrams = new Map();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const text = [entry.title, ...(entry.keywords || []), entry.path || ''].join(' ');
    const grams = buildTrigrams(text);
    for (const g of grams) {
      let set = index.trigrams.get(g);
      if (!set) {
        set = new Set();
        index.trigrams.set(g, set);
      }
      set.add(i);
    }
  }

  index.lastBuilt = Date.now();
}

// ---------------------------------------------------------------------------
// Fuzzy search — trigram intersection scoring
// ---------------------------------------------------------------------------

function search(query: string, limit = 20): IndexEntry[] {
  if (!query || query.length < 2) return [];

  const queryLower = query.toLowerCase().trim();
  const queryGrams = buildTrigrams(queryLower);

  if (queryGrams.length === 0) {
    // Fallback: prefix match on title
    return index.entries
      .filter(e => e.title.toLowerCase().startsWith(queryLower))
      .slice(0, limit);
  }

  // Score by trigram overlap
  const scores = new Map<number, number>();
  for (const g of queryGrams) {
    const matches = index.trigrams.get(g);
    if (matches) {
      for (const idx of matches) {
        scores.set(idx, (scores.get(idx) || 0) + 1);
      }
    }
  }

  // Boost exact prefix matches
  const results: Array<{ entry: IndexEntry; score: number }> = [];
  for (const [idx, trigramScore] of scores) {
    const entry = index.entries[idx];
    let score = trigramScore / queryGrams.length; // normalize 0-1
    if (entry.title.toLowerCase().startsWith(queryLower)) score += 0.5;
    if (entry.title.toLowerCase() === queryLower) score += 1;
    results.push({ entry: { ...entry, score }, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map(r => r.entry);
}

// ---------------------------------------------------------------------------
// Simple hash (for file dedup)
// ---------------------------------------------------------------------------

function simpleHash(data: string): string {
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h + data.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  switch (type) {
    case 'build-index': {
      buildIndex(payload.entries || []);
      self.postMessage({ type: 'index-built', id, payload: { count: index.entries.length, timestamp: index.lastBuilt } });
      break;
    }
    case 'search': {
      const results = search(payload.query, payload.limit);
      self.postMessage({ type: 'search-results', id, payload: { results } });
      break;
    }
    case 'hash': {
      const hash = simpleHash(payload.data);
      self.postMessage({ type: 'hash-result', id, payload: { hash } });
      break;
    }
    case 'add-entries': {
      const newEntries = payload.entries || [];
      buildIndex([...index.entries, ...newEntries]);
      self.postMessage({ type: 'entries-added', id, payload: { count: index.entries.length } });
      break;
    }
    default:
      self.postMessage({ type: 'error', id, payload: { message: `Unknown message type: ${type}` } });
  }
};
