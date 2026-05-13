// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Async cache backed by IndexedDB when available, with an in-memory fallback
 * (used in tests and the main process). Stores arbitrary string blobs keyed
 * by string. The IDB layer is intentionally feature-light: get / set / delete
 * / clear, no transactions exposed.
 */

export interface KvCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

class MemoryKv implements KvCache {
  private readonly store = new Map<string, string>();
  async get(key: string): Promise<string | undefined> {
    return this.store.get(key);
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async clear(): Promise<void> {
    this.store.clear();
  }
}

interface IDBLike {
  open(name: string, version?: number): {
    onupgradeneeded: ((this: unknown, ev: { target: { result: unknown } }) => void) | null;
    onsuccess: ((this: unknown, ev: { target: { result: unknown } }) => void) | null;
    onerror: ((this: unknown, ev: unknown) => void) | null;
  };
}

function getIndexedDb(): IDBLike | null {
  const g = globalThis as { indexedDB?: unknown };
  return (g.indexedDB as IDBLike | undefined) ?? null;
}

class IdbKv implements KvCache {
  private dbPromise: Promise<unknown> | null = null;
  constructor(private readonly dbName: string, private readonly storeName: string) {}

  private open(): Promise<unknown> {
    if (this.dbPromise) return this.dbPromise;
    const idb = getIndexedDb();
    if (!idb) return Promise.reject(new Error('indexedDB unavailable'));
    this.dbPromise = new Promise((resolve, reject) => {
      const req = idb.open(this.dbName, 1) as unknown as {
        onupgradeneeded: (ev: { target: { result: { createObjectStore(name: string): unknown; objectStoreNames: { contains(n: string): boolean } } } }) => void;
        onsuccess: (ev: { target: { result: unknown } }) => void;
        onerror: (ev: unknown) => void;
      };
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = (ev) => resolve(ev.target.result);
      req.onerror = (ev) => reject(new Error(`indexedDB open failed: ${String(ev)}`));
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: 'readonly' | 'readwrite', fn: (s: unknown) => unknown): Promise<T> {
    const db = await this.open() as { transaction(name: string, mode: string): { objectStore(n: string): unknown; oncomplete: (() => void) | null; onerror: ((e: unknown) => void) | null }; };
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(this.storeName, mode);
      const store = t.objectStore(this.storeName);
      const req = fn(store) as { onsuccess?: ((ev: { target: { result: T } }) => void); onerror?: ((ev: unknown) => void); };
      let result: T | undefined;
      if (req && typeof req === 'object') {
        req.onsuccess = (ev) => { result = ev.target.result; };
        req.onerror = (ev) => reject(new Error(`idb op failed: ${String(ev)}`));
      }
      t.oncomplete = () => resolve(result as T);
      t.onerror = (ev) => reject(new Error(`idb tx failed: ${String(ev)}`));
    });
  }

  async get(key: string): Promise<string | undefined> {
    return this.tx<string | undefined>('readonly', (s) => (s as { get(k: string): unknown }).get(key));
  }
  async set(key: string, value: string): Promise<void> {
    await this.tx<void>('readwrite', (s) => (s as { put(v: string, k: string): unknown }).put(value, key));
  }
  async delete(key: string): Promise<void> {
    await this.tx<void>('readwrite', (s) => (s as { delete(k: string): unknown }).delete(key));
  }
  async clear(): Promise<void> {
    await this.tx<void>('readwrite', (s) => (s as { clear(): unknown }).clear());
  }
}

export function createKvCache(dbName = 'dex-cache', storeName = 'kv'): KvCache {
  return getIndexedDb() ? new IdbKv(dbName, storeName) : new MemoryKv();
}

/** Exported for tests that want the in-memory implementation regardless of env. */
export function createMemoryKvCache(): KvCache {
  return new MemoryKv();
}
