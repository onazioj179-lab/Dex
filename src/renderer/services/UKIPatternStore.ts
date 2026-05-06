// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX UKIPatternStore
 * -----------------------------------------------------------------------------
 * Local-only learner. Records (context-snapshot -> action) tuples in IndexedDB
 * with a tiny LRU + frequency map so UKI can surface "you usually do X right
 * after Y" suggestions in the dock pill. No network calls, ever.
 *
 * Storage shape:
 *   db: dex-uki-patterns
 *   store: events  { id, action, contextHash, ts }
 *   store: counts  { key (=`${contextHash}|${action}`), count, lastTs }
 */

// DEX v3.8.0 - UKIPatternStore

const DB_NAME = 'dex-uki-patterns';
const DB_VERSION = 1;
const EVENTS_STORE = 'events';
const COUNTS_STORE = 'counts';
const MAX_EVENTS = 5000;

export interface PatternEvent {
  id?: number;
  action: string;
  contextHash: string;
  ts: number;
}

export interface PatternCount {
  key: string;
  contextHash: string;
  action: string;
  count: number;
  lastTs: number;
}

export interface SuggestedAction {
  action: string;
  count: number;
  lastTs: number;
  confidence: number; // 0..1, share of actions taken in this context
}

let dbPromise: Promise<IDBDatabase> | null = null;
let memoryFallback: { events: PatternEvent[]; counts: Map<string, PatternCount> } | null = null;

function hasIDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (!hasIDB()) {
    memoryFallback = { events: [], counts: new Map() };
    return Promise.reject(new Error('no-indexeddb'));
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const s = db.createObjectStore(EVENTS_STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_ts', 'ts');
        s.createIndex('by_context', 'contextHash');
      }
      if (!db.objectStoreNames.contains(COUNTS_STORE)) {
        const s = db.createObjectStore(COUNTS_STORE, { keyPath: 'key' });
        s.createIndex('by_context', 'contextHash');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  body: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) => new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const req = body(s);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-tx-failed'));
    }),
  );
}

/** Stable, order-independent hash of a small string set. Local-only, not crypto. */
export function hashContext(parts: string[]): string {
  const sorted = [...parts].filter(Boolean).sort();
  let h = 2166136261;
  for (const p of sorted) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 124; // separator
  }
  return (h >>> 0).toString(36);
}

async function record(action: string, contextParts: string[]): Promise<void> {
  const ev: PatternEvent = { action, contextHash: hashContext(contextParts), ts: Date.now() };
  if (memoryFallback) {
    memoryFallback.events.push(ev);
    if (memoryFallback.events.length > MAX_EVENTS) memoryFallback.events.shift();
    const key = `${ev.contextHash}|${ev.action}`;
    const prev = memoryFallback.counts.get(key);
    memoryFallback.counts.set(key, {
      key, contextHash: ev.contextHash, action: ev.action,
      count: (prev?.count || 0) + 1, lastTs: ev.ts,
    });
    return;
  }
  try {
    await tx(EVENTS_STORE, 'readwrite', (s) => s.add(ev));
    const key = `${ev.contextHash}|${ev.action}`;
    const prev = await tx<PatternCount | undefined>(COUNTS_STORE, 'readonly', (s) => s.get(key));
    const next: PatternCount = {
      key, contextHash: ev.contextHash, action: ev.action,
      count: (prev?.count || 0) + 1, lastTs: ev.ts,
    };
    await tx(COUNTS_STORE, 'readwrite', (s) => s.put(next));
  } catch (err) {
    console.warn('[UKIPatternStore] record failed, falling back to memory', err);
    memoryFallback = memoryFallback || { events: [], counts: new Map() };
    memoryFallback.events.push(ev);
  }
}

async function suggest(contextParts: string[], limit = 3): Promise<SuggestedAction[]> {
  const hash = hashContext(contextParts);
  let rows: PatternCount[];
  if (memoryFallback) {
    rows = Array.from(memoryFallback.counts.values()).filter((c) => c.contextHash === hash);
  } else {
    try {
      rows = await tx<PatternCount[]>(COUNTS_STORE, 'readonly', (s) => {
        const idx = s.index('by_context');
        return idx.getAll(IDBKeyRange.only(hash));
      });
    } catch {
      return [];
    }
  }
  const total = rows.reduce((acc, r) => acc + r.count, 0) || 1;
  return rows
    .sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
    .slice(0, limit)
    .map((r) => ({ action: r.action, count: r.count, lastTs: r.lastTs, confidence: r.count / total }));
}

async function clear(): Promise<void> {
  if (memoryFallback) { memoryFallback.events = []; memoryFallback.counts.clear(); return; }
  try {
    await tx(EVENTS_STORE, 'readwrite', (s) => s.clear());
    await tx(COUNTS_STORE, 'readwrite', (s) => s.clear());
  } catch (err) {
    console.warn('[UKIPatternStore] clear failed', err);
  }
}

async function size(): Promise<{ events: number; patterns: number }> {
  if (memoryFallback) return { events: memoryFallback.events.length, patterns: memoryFallback.counts.size };
  try {
    const events = await tx<number>(EVENTS_STORE, 'readonly', (s) => s.count());
    const patterns = await tx<number>(COUNTS_STORE, 'readonly', (s) => s.count());
    return { events, patterns };
  } catch {
    return { events: 0, patterns: 0 };
  }
}

export const UKIPatternStore = {
  record,
  suggest,
  clear,
  size,
  /** Tests / HMR. */
  _useMemory(): void {
    dbPromise = null;
    memoryFallback = { events: [], counts: new Map() };
  },
};

export default UKIPatternStore;
