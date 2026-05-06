// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX -- Search Worker Client (item 145)
// ===========================================================================
// Provides a simple API over the search indexer web worker.
// Falls back to main-thread execution if workers are unavailable.
// ===========================================================================

let worker: Worker | null = null;
let messageId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL('../workers/searchIndexer.worker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e) => {
      const { id, payload } = e.data;
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p.resolve(payload);
      }
    };
    worker.onerror = (e) => {
      console.warn('[SearchWorker] Error:', e.message);
    };
    return worker;
  } catch {
    return null;
  }
}

function send(type: string, payload: any): Promise<any> {
  const w = getWorker();
  if (!w) return Promise.resolve(null);

  const id = ++messageId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type, payload, id });
    // Timeout after 5s to avoid dangling promises
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Search worker timeout'));
      }
    }, 5000);
  });
}

export interface SearchEntry {
  id: string;
  type: 'app' | 'file' | 'note' | 'task' | 'page' | 'setting' | 'action';
  title: string;
  keywords: string[];
  path?: string;
  icon?: string;
  color?: string;
  score?: number;
}

export async function buildSearchIndex(entries: SearchEntry[]): Promise<{ count: number; timestamp: number } | null> {
  return send('build-index', { entries });
}

export async function searchIndex(query: string, limit = 20): Promise<SearchEntry[]> {
  const result = await send('search', { query, limit });
  return result?.results || [];
}

export async function addSearchEntries(entries: SearchEntry[]): Promise<{ count: number } | null> {
  return send('add-entries', { entries });
}

export function terminateSearchWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    pending.clear();
  }
}
