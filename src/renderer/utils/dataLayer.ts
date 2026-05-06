// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Data Layer (Phase K: Items 776-800)
// Storage engine, state management, and caching
// =============================================================================

import { useEffect, useRef, useCallback, useState, useMemo, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StorageEntry<T = unknown> {
  key: string;
  value: T;
  timestamp: number;
  expires?: number;
  version: number;
}

export interface StateSnapshot<T> {
  state: T;
  timestamp: number;
  id: string;
  label?: string;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
  size: number;
}

export interface QueryResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'conflict' | 'error';
  lastSync: number;
  pendingChanges: number;
  conflicts: string[];
}

export interface MigrationDefinition {
  version: number;
  name: string;
  up: (db: IDBDatabase) => Promise<void>;
  down: (db: IDBDatabase) => Promise<void>;
}

// ---------------------------------------------------------------------------
// 776. Hybrid Storage Engine (IndexedDB + Memory + FileSystem)
// ---------------------------------------------------------------------------

export class HybridStorage {
  private memoryCache: Map<string, StorageEntry> = new Map();
  private dbName: string;
  private db: IDBDatabase | null = null;
  private version = 1;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  async get<T>(key: string): Promise<T | null> {
    // Check memory first
    const cached = this.memoryCache.get(key);
    if (cached && (!cached.expires || cached.expires > Date.now())) {
      return cached.value as T;
    }

    // Fall back to IndexedDB
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('data', 'readonly');
      const store = transaction.objectStore('data');
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result as StorageEntry<T> | undefined;
        if (entry && (!entry.expires || entry.expires > Date.now())) {
          this.memoryCache.set(key, entry);
          resolve(entry.value);
        } else {
          resolve(null);
        }
      };
    });
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const entry: StorageEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      expires: ttl ? Date.now() + ttl : undefined,
      version: 1,
    };

    this.memoryCache.set(key, entry);

    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('data', 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<boolean> {
    this.memoryCache.delete(key);

    if (!this.db) return true;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('data', 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();

    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('data', 'readwrite');
      const store = transaction.objectStore('data');
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async keys(): Promise<string[]> {
    if (!this.db) return Array.from(this.memoryCache.keys());

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('data', 'readonly');
      const store = transaction.objectStore('data');
      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  getMemoryUsage(): { entries: number; estimatedBytes: number } {
    let estimatedBytes = 0;
    this.memoryCache.forEach((entry) => {
      estimatedBytes += JSON.stringify(entry).length * 2; // Rough estimate
    });
    return { entries: this.memoryCache.size, estimatedBytes };
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.memoryCache.clear();
  }
}

// ---------------------------------------------------------------------------
// 777. File System Abstraction Layer
// ---------------------------------------------------------------------------

export class FileSystemAbstraction {
  private handles: Map<string, FileSystemFileHandle | FileSystemDirectoryHandle> = new Map();
  private root: FileSystemDirectoryHandle | null = null;

  async requestRoot(): Promise<boolean> {
    try {
      this.root = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<string | null> {
    try {
      const handle = await this.getFileHandle(path);
      if (!handle) return null;
      
      const file = await handle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  async readFileAsBuffer(path: string): Promise<ArrayBuffer | null> {
    try {
      const handle = await this.getFileHandle(path);
      if (!handle) return null;
      
      const file = await handle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  }

  async writeFile(path: string, content: string | ArrayBuffer): Promise<boolean> {
    try {
      const handle = await this.getFileHandle(path, true);
      if (!handle) return false;

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(path: string): Promise<boolean> {
    try {
      const parts = path.split('/');
      const fileName = parts.pop()!;
      const dirPath = parts.join('/');
      
      const dirHandle = await this.getDirectoryHandle(dirPath);
      if (!dirHandle) return false;

      await dirHandle.removeEntry(fileName);
      this.handles.delete(path);
      return true;
    } catch {
      return false;
    }
  }

  async listDirectory(path: string): Promise<{ name: string; isFile: boolean }[]> {
    try {
      const dirHandle = await this.getDirectoryHandle(path);
      if (!dirHandle) return [];

      const entries: { name: string; isFile: boolean }[] = [];
      for await (const [name, handle] of (dirHandle as any).entries()) {
        entries.push({
          name,
          isFile: handle.kind === 'file',
        });
      }
      return entries;
    } catch {
      return [];
    }
  }

  async createDirectory(path: string): Promise<boolean> {
    try {
      await this.getDirectoryHandle(path, true);
      return true;
    } catch {
      return false;
    }
  }

  private async getFileHandle(path: string, create = false): Promise<FileSystemFileHandle | null> {
    if (this.handles.has(path)) {
      const handle = this.handles.get(path);
      if (handle?.kind === 'file') return handle as FileSystemFileHandle;
    }

    if (!this.root) return null;

    try {
      const parts = path.split('/').filter(Boolean);
      const fileName = parts.pop()!;
      
      let current: FileSystemDirectoryHandle = this.root;
      for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create });
      }
      
      const handle = await current.getFileHandle(fileName, { create });
      this.handles.set(path, handle);
      return handle;
    } catch {
      return null;
    }
  }

  private async getDirectoryHandle(path: string, create = false): Promise<FileSystemDirectoryHandle | null> {
    if (!path || path === '/') return this.root;
    
    if (this.handles.has(path)) {
      const handle = this.handles.get(path);
      if (handle?.kind === 'directory') return handle as FileSystemDirectoryHandle;
    }

    if (!this.root) return null;

    try {
      const parts = path.split('/').filter(Boolean);
      let current: FileSystemDirectoryHandle = this.root;
      
      for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create });
      }
      
      this.handles.set(path, current);
      return current;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// 778. Document Recovery System
// ---------------------------------------------------------------------------

export class DocumentRecovery {
  private storage: HybridStorage;
  private interval: NodeJS.Timeout | null = null;
  private dirty = false;
  private documentId: string;

  constructor(documentId: string, storage: HybridStorage) {
    this.documentId = documentId;
    this.storage = storage;
  }

  startAutoSave(intervalMs = 30000): void {
    this.stopAutoSave();
    this.interval = setInterval(() => {
      if (this.dirty) {
        this.saveRecoveryPoint();
        this.dirty = false;
      }
    }, intervalMs);
  }

  stopAutoSave(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  markDirty(): void {
    this.dirty = true;
  }

  async saveRecoveryPoint(data?: unknown): Promise<void> {
    const key = `recovery:${this.documentId}`;
    await this.storage.set(key, {
      data,
      timestamp: Date.now(),
      version: 1,
    });
  }

  async getRecoveryPoint(): Promise<{ data: unknown; timestamp: number } | null> {
    const key = `recovery:${this.documentId}`;
    return this.storage.get(key);
  }

  async clearRecoveryPoint(): Promise<void> {
    const key = `recovery:${this.documentId}`;
    await this.storage.delete(key);
  }

  async listRecoveryPoints(): Promise<{ documentId: string; timestamp: number }[]> {
    const keys = await this.storage.keys();
    const recoveryKeys = keys.filter(k => k.startsWith('recovery:'));
    
    const points: { documentId: string; timestamp: number }[] = [];
    for (const key of recoveryKeys) {
      const data = await this.storage.get<{ timestamp: number }>(key);
      if (data) {
        points.push({
          documentId: key.replace('recovery:', ''),
          timestamp: data.timestamp,
        });
      }
    }
    return points;
  }
}

// ---------------------------------------------------------------------------
// 779-782. Immutable State Container with Time-Travel
// ---------------------------------------------------------------------------

export class ImmutableStateContainer<T> {
  private history: StateSnapshot<T>[] = [];
  private currentIndex = -1;
  private maxHistory: number;
  private listeners: Set<() => void> = new Set();

  constructor(initialState: T, maxHistory = 100) {
    this.maxHistory = maxHistory;
    this.pushState(initialState, 'Initial state');
  }

  // 779. Immutable State
  getState(): T {
    if (this.currentIndex < 0) {
      throw new Error('No state available');
    }
    return this.history[this.currentIndex].state;
  }

  setState(state: T, label?: string): void {
    // Remove any forward history
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }
    
    this.pushState(state, label);
    this.notifyListeners();
  }

  private pushState(state: T, label?: string): void {
    const snapshot: StateSnapshot<T> = {
      state: this.deepFreeze(JSON.parse(JSON.stringify(state))),
      timestamp: Date.now(),
      id: this.generateId(),
      label,
    };
    
    this.history.push(snapshot);
    this.currentIndex = this.history.length - 1;
    
    // Trim history if needed
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
      this.currentIndex = this.history.length - 1;
    }
  }

  private deepFreeze<U>(obj: U): U {
    if (obj === null || typeof obj !== 'object') return obj;
    
    Object.keys(obj as object).forEach(key => {
      const value = (obj as Record<string, unknown>)[key];
      if (typeof value === 'object' && value !== null) {
        this.deepFreeze(value);
      }
    });
    
    return Object.freeze(obj);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // 780. Time-Travel Debugging
  undo(): T | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.notifyListeners();
      return this.getState();
    }
    return null;
  }

  redo(): T | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      this.notifyListeners();
      return this.getState();
    }
    return null;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  // 781. State History Browser
  getHistory(): StateSnapshot<T>[] {
    return [...this.history];
  }

  goToSnapshot(id: string): T | null {
    const index = this.history.findIndex(s => s.id === id);
    if (index >= 0) {
      this.currentIndex = index;
      this.notifyListeners();
      return this.getState();
    }
    return null;
  }

  getSnapshotCount(): number {
    return this.history.length;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  // 782. State Diffing
  diff(fromId: string, toId: string): { path: string; oldValue: unknown; newValue: unknown }[] {
    const fromSnapshot = this.history.find(s => s.id === fromId);
    const toSnapshot = this.history.find(s => s.id === toId);
    
    if (!fromSnapshot || !toSnapshot) return [];
    
    return this.computeDiff(fromSnapshot.state, toSnapshot.state, '');
  }

  private computeDiff(
    from: unknown,
    to: unknown,
    path: string
  ): { path: string; oldValue: unknown; newValue: unknown }[] {
    const diffs: { path: string; oldValue: unknown; newValue: unknown }[] = [];
    
    if (from === to) return diffs;
    
    if (typeof from !== typeof to || from === null || to === null) {
      diffs.push({ path, oldValue: from, newValue: to });
      return diffs;
    }
    
    if (typeof from !== 'object') {
      if (from !== to) {
        diffs.push({ path, oldValue: from, newValue: to });
      }
      return diffs;
    }
    
    const fromObj = from as Record<string, unknown>;
    const toObj = to as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(fromObj), ...Object.keys(toObj)]);
    
    allKeys.forEach(key => {
      const childPath = path ? `${path}.${key}` : key;
      diffs.push(...this.computeDiff(fromObj[key], toObj[key], childPath));
    });
    
    return diffs;
  }

  // Subscribe for external sync
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }
}

// ---------------------------------------------------------------------------
// 783-786. State Persistence and Sync
// ---------------------------------------------------------------------------

// 783. State Persistence
export class StatePersistence<T> {
  private storage: HybridStorage;
  private key: string;
  private debounceMs: number;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(storage: HybridStorage, key: string, debounceMs = 1000) {
    this.storage = storage;
    this.key = key;
    this.debounceMs = debounceMs;
  }

  async save(state: T): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(async () => {
      await this.storage.set(this.key, {
        state,
        timestamp: Date.now(),
      });
    }, this.debounceMs);
  }

  async saveImmediate(state: T): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    await this.storage.set(this.key, {
      state,
      timestamp: Date.now(),
    });
  }

  async load(): Promise<T | null> {
    const data = await this.storage.get<{ state: T }>(this.key);
    return data?.state ?? null;
  }

  async clear(): Promise<void> {
    await this.storage.delete(this.key);
  }
}

// 784. State Migration
export class StateMigration<T> {
  private migrations: ((state: unknown) => unknown)[] = [];
  private currentVersion: number;

  constructor(currentVersion: number) {
    this.currentVersion = currentVersion;
  }

  addMigration(version: number, migrate: (state: unknown) => unknown): void {
    this.migrations[version] = migrate;
  }

  migrate(state: unknown, fromVersion: number): T {
    let current = state;
    
    for (let v = fromVersion; v < this.currentVersion; v++) {
      const migration = this.migrations[v + 1];
      if (migration) {
        current = migration(current);
      }
    }
    
    return current as T;
  }

  getCurrentVersion(): number {
    return this.currentVersion;
  }
}

// 785. Selective State Sync
export class SelectiveStateSync<T extends object> {
  private syncPaths: Set<string> = new Set();
  private lastSyncedState: Map<string, unknown> = new Map();

  addSyncPath(path: string): void {
    this.syncPaths.add(path);
  }

  removeSyncPath(path: string): void {
    this.syncPaths.delete(path);
  }

  getChangedPaths(state: T): string[] {
    const changed: string[] = [];
    
    this.syncPaths.forEach(path => {
      const value = this.getValueAtPath(state, path);
      const lastValue = this.lastSyncedState.get(path);
      
      if (JSON.stringify(value) !== JSON.stringify(lastValue)) {
        changed.push(path);
      }
    });
    
    return changed;
  }

  markSynced(state: T): void {
    this.syncPaths.forEach(path => {
      this.lastSyncedState.set(path, this.getValueAtPath(state, path));
    });
  }

  getValuesToSync(state: T): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    
    this.getChangedPaths(state).forEach(path => {
      values[path] = this.getValueAtPath(state, path);
    });
    
    return values;
  }

  private getValueAtPath(obj: T, path: string): unknown {
    return path.split('.').reduce((curr: unknown, key) => {
      if (curr && typeof curr === 'object') {
        return (curr as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}

// 786. Conflict Resolution
export class ConflictResolver<T> {
  private strategy: 'local-wins' | 'remote-wins' | 'merge' | 'manual';
  private mergeFunction?: (local: T, remote: T) => T;

  constructor(strategy: 'local-wins' | 'remote-wins' | 'merge' | 'manual' = 'local-wins') {
    this.strategy = strategy;
  }

  setStrategy(strategy: 'local-wins' | 'remote-wins' | 'merge' | 'manual'): void {
    this.strategy = strategy;
  }

  setMergeFunction(fn: (local: T, remote: T) => T): void {
    this.mergeFunction = fn;
    this.strategy = 'merge';
  }

  resolve(local: T, remote: T): T | { needsManual: true; local: T; remote: T } {
    switch (this.strategy) {
      case 'local-wins':
        return local;
      case 'remote-wins':
        return remote;
      case 'merge':
        if (this.mergeFunction) {
          return this.mergeFunction(local, remote);
        }
        return this.autoMerge(local, remote);
      case 'manual':
        return { needsManual: true, local, remote };
    }
  }

  private autoMerge(local: T, remote: T): T {
    if (typeof local !== 'object' || typeof remote !== 'object') {
      return local; // Primitive conflict, use local
    }
    
    const result = { ...remote } as T;
    for (const key of Object.keys(local as object)) {
      (result as Record<string, unknown>)[key] = (local as Record<string, unknown>)[key];
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// 787-791. Cache Management
// ---------------------------------------------------------------------------

// 787. LRU Cache
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private maxMemory: number;
  private currentMemory = 0;

  constructor(maxSize = 100, maxMemory = 50 * 1024 * 1024) {
    this.maxSize = maxSize;
    this.maxMemory = maxMemory;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Move to end (most recently used)
    this.cache.delete(key);
    entry.hits++;
    this.cache.set(key, entry);
    
    return entry.value;
  }

  set(key: string, value: T): void {
    const size = this.estimateSize(value);
    
    // Evict if needed
    while (
      (this.cache.size >= this.maxSize || this.currentMemory + size > this.maxMemory) &&
      this.cache.size > 0
    ) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.delete(oldest);
      }
    }
    
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      hits: 0,
      size,
    };
    
    this.cache.set(key, entry);
    this.currentMemory += size;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentMemory -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentMemory = 0;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  getStats(): { size: number; memory: number; maxSize: number; maxMemory: number } {
    return {
      size: this.cache.size,
      memory: this.currentMemory,
      maxSize: this.maxSize,
      maxMemory: this.maxMemory,
    };
  }

  private estimateSize(value: T): number {
    return JSON.stringify(value).length * 2;
  }
}

// 788. Cache Invalidation Patterns
export class CacheInvalidator {
  private tags: Map<string, Set<string>> = new Map();
  private dependencies: Map<string, Set<string>> = new Map();

  tagKey(key: string, tag: string): void {
    if (!this.tags.has(tag)) {
      this.tags.set(tag, new Set());
    }
    this.tags.get(tag)!.add(key);
  }

  addDependency(key: string, dependsOn: string): void {
    if (!this.dependencies.has(dependsOn)) {
      this.dependencies.set(dependsOn, new Set());
    }
    this.dependencies.get(dependsOn)!.add(key);
  }

  getKeysByTag(tag: string): string[] {
    return Array.from(this.tags.get(tag) || []);
  }

  getDependentKeys(key: string): string[] {
    return Array.from(this.dependencies.get(key) || []);
  }

  invalidateTag(tag: string): string[] {
    const keys = this.getKeysByTag(tag);
    const allInvalidated = new Set(keys);
    
    // Also invalidate dependent keys
    keys.forEach(key => {
      this.getDependentKeys(key).forEach(dep => allInvalidated.add(dep));
    });
    
    this.tags.delete(tag);
    return Array.from(allInvalidated);
  }

  invalidateKey(key: string): string[] {
    const invalidated = [key, ...this.getDependentKeys(key)];
    
    // Remove from all tags
    this.tags.forEach((keys) => keys.delete(key));
    this.dependencies.delete(key);
    
    return invalidated;
  }

  clear(): void {
    this.tags.clear();
    this.dependencies.clear();
  }
}

// 789. Cache Prefetching
export class CachePrefetcher<T> {
  private cache: LRUCache<T>;
  private fetchFn: (key: string) => Promise<T>;
  private prefetchQueue: string[] = [];
  private prefetching = false;

  constructor(cache: LRUCache<T>, fetchFn: (key: string) => Promise<T>) {
    this.cache = cache;
    this.fetchFn = fetchFn;
  }

  prefetch(keys: string[]): void {
    const newKeys = keys.filter(k => !this.cache.has(k) && !this.prefetchQueue.includes(k));
    this.prefetchQueue.push(...newKeys);
    this.processPrefetchQueue();
  }

  private async processPrefetchQueue(): Promise<void> {
    if (this.prefetching) return;
    this.prefetching = true;

    while (this.prefetchQueue.length > 0) {
      const key = this.prefetchQueue.shift()!;
      if (!this.cache.has(key)) {
        try {
          const value = await this.fetchFn(key);
          this.cache.set(key, value);
        } catch {
          // Ignore prefetch errors
        }
      }
      
      // Yield to main thread
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    this.prefetching = false;
  }

  cancelPrefetch(): void {
    this.prefetchQueue = [];
  }
}

// 790. Background Cache Refresh
export class CacheRefresher<T> {
  private cache: LRUCache<T>;
  private fetchFn: (key: string) => Promise<T>;
  private refreshInterval: number;
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(cache: LRUCache<T>, fetchFn: (key: string) => Promise<T>, refreshInterval = 60000) {
    this.cache = cache;
    this.fetchFn = fetchFn;
    this.refreshInterval = refreshInterval;
  }

  startRefresh(key: string): void {
    if (this.intervals.has(key)) return;

    const interval = setInterval(async () => {
      try {
        const value = await this.fetchFn(key);
        this.cache.set(key, value);
      } catch {
        // Ignore refresh errors
      }
    }, this.refreshInterval);

    this.intervals.set(key, interval);
  }

  stopRefresh(key: string): void {
    const interval = this.intervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(key);
    }
  }

  stopAllRefresh(): void {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
  }

  setRefreshInterval(interval: number): void {
    this.refreshInterval = interval;
  }
}

// 791. Cache Compression
export class CacheCompression {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  async compress(data: string): Promise<ArrayBuffer> {
    const stream = new Blob([data]).stream();
    const compressed = stream.pipeThrough(new CompressionStream('gzip'));
    return new Response(compressed).arrayBuffer();
  }

  async decompress(data: ArrayBuffer): Promise<string> {
    const stream = new Blob([data]).stream();
    const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
    const blob = await new Response(decompressed).blob();
    return blob.text();
  }

  estimateCompressionRatio(sample: string): number {
    // Quick estimate based on entropy
    const chars = new Set(sample);
    const entropy = Math.log2(chars.size);
    return Math.max(0.1, Math.min(1, entropy / 8));
  }
}

// ---------------------------------------------------------------------------
// 792-795. Query and Pagination
// ---------------------------------------------------------------------------

// 792. Computed/Derived State
export class ComputedState<T, R> {
  private compute: (state: T) => R;
  private cache: R | null = null;
  private lastState: T | null = null;

  constructor(compute: (state: T) => R) {
    this.compute = compute;
  }

  get(state: T): R {
    if (this.lastState !== null && this.shallowEqual(state, this.lastState)) {
      return this.cache!;
    }
    
    this.cache = this.compute(state);
    this.lastState = state;
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
    this.lastState = null;
  }

  private shallowEqual(a: T, b: T): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => 
      (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]
    );
  }
}

// 793. State Selectors with Memoization
export function createSelector<T, R>(
  selectors: ((state: T) => unknown)[],
  combiner: (...args: unknown[]) => R
): (state: T) => R {
  let lastArgs: unknown[] | null = null;
  let lastResult: R | null = null;

  return (state: T) => {
    const args = selectors.map(s => s(state));
    
    if (lastArgs !== null && args.every((arg, i) => arg === lastArgs![i])) {
      return lastResult!;
    }
    
    lastArgs = args;
    lastResult = combiner(...args);
    return lastResult;
  };
}

// 794. Query Builder
export class QueryBuilder<T> {
  private filters: ((item: T) => boolean)[] = [];
  private sortFn: ((a: T, b: T) => number) | null = null;
  private limitValue: number | null = null;
  private offsetValue = 0;
  private selectFields: (keyof T)[] | null = null;

  where(predicate: (item: T) => boolean): this {
    this.filters.push(predicate);
    return this;
  }

  orderBy<K extends keyof T>(field: K, direction: 'asc' | 'desc' = 'asc'): this {
    this.sortFn = (a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return direction === 'asc' ? cmp : -cmp;
    };
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  select(...fields: (keyof T)[]): this {
    this.selectFields = fields;
    return this;
  }

  execute(data: T[]): Partial<T>[] {
    let result = data.filter(item => this.filters.every(f => f(item)));
    
    if (this.sortFn) {
      result = [...result].sort(this.sortFn);
    }
    
    if (this.offsetValue > 0) {
      result = result.slice(this.offsetValue);
    }
    
    if (this.limitValue !== null) {
      result = result.slice(0, this.limitValue);
    }
    
    if (this.selectFields) {
      return result.map(item => {
        const partial: Partial<T> = {};
        this.selectFields!.forEach(field => {
          partial[field] = item[field];
        });
        return partial;
      });
    }
    
    return result;
  }

  count(data: T[]): number {
    return data.filter(item => this.filters.every(f => f(item))).length;
  }
}

// 795. Pagination State
export class PaginationState<T> {
  private data: T[] = [];
  private page = 1;
  private pageSize: number;
  private totalItems = 0;

  constructor(pageSize = 20) {
    this.pageSize = pageSize;
  }

  setData(data: T[], totalItems?: number): void {
    this.data = data;
    this.totalItems = totalItems ?? data.length;
  }

  getPage(): T[] {
    const start = (this.page - 1) * this.pageSize;
    return this.data.slice(start, start + this.pageSize);
  }

  setPage(page: number): void {
    this.page = Math.max(1, Math.min(page, this.getTotalPages()));
  }

  nextPage(): boolean {
    if (this.page < this.getTotalPages()) {
      this.page++;
      return true;
    }
    return false;
  }

  prevPage(): boolean {
    if (this.page > 1) {
      this.page--;
      return true;
    }
    return false;
  }

  getTotalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize);
  }

  getCurrentPage(): number {
    return this.page;
  }

  getPageSize(): number {
    return this.pageSize;
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
  }

  getResult(): QueryResult<T> {
    return {
      data: this.getPage(),
      total: this.totalItems,
      page: this.page,
      pageSize: this.pageSize,
      hasMore: this.page < this.getTotalPages(),
    };
  }
}

// ---------------------------------------------------------------------------
// 796-800. Database and Schema Management
// ---------------------------------------------------------------------------

// 796. Schema Migrations
export class SchemaMigrator {
  private migrations: MigrationDefinition[] = [];
  private db: IDBDatabase | null = null;

  addMigration(migration: MigrationDefinition): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  async migrate(dbName: string, targetVersion?: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion(dbName);
    const target = targetVersion ?? this.migrations[this.migrations.length - 1]?.version ?? 0;

    for (const migration of this.migrations) {
      if (migration.version > currentVersion && migration.version <= target) {
        await this.runMigration(dbName, migration);
      }
    }
  }

  async rollback(dbName: string, targetVersion: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion(dbName);
    
    const migrationsToRollback = this.migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .reverse();

    for (const migration of migrationsToRollback) {
      await this.runRollback(dbName, migration);
    }
  }

  private async getCurrentVersion(dbName: string): Promise<number> {
    return new Promise((resolve) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => {
        const version = request.result.version;
        request.result.close();
        resolve(version);
      };
      request.onerror = () => resolve(0);
    });
  }

  private async runMigration(dbName: string, migration: MigrationDefinition): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, migration.version);
      
      request.onupgradeneeded = async () => {
        try {
          await migration.up(request.result);
        } catch (e) {
          reject(e);
        }
      };
      
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  private async runRollback(dbName: string, migration: MigrationDefinition): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, migration.version - 1);
      
      request.onupgradeneeded = async () => {
        try {
          await migration.down(request.result);
        } catch (e) {
          reject(e);
        }
      };
      
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  }
}

// 797. Indexing Strategy
export class IndexManager {
  private indexes: Map<string, { fields: string[]; unique: boolean }> = new Map();

  defineIndex(name: string, fields: string[], unique = false): void {
    this.indexes.set(name, { fields, unique });
  }

  async createIndexes(db: IDBDatabase, storeName: string): Promise<void> {
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    
    this.indexes.forEach((config, name) => {
      if (!store.indexNames.contains(name)) {
        // Note: Can only create indexes during upgrade
        console.warn(`Index ${name} must be created during upgrade`);
      }
    });
  }

  getIndexDefinitions(): Map<string, { fields: string[]; unique: boolean }> {
    return new Map(this.indexes);
  }
}

// 798. Transaction Batching
export class TransactionBatcher {
  private pending: { store: string; operation: 'put' | 'delete'; data: unknown }[] = [];
  private db: IDBDatabase;
  private batchSize: number;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(db: IDBDatabase, batchSize = 100) {
    this.db = db;
    this.batchSize = batchSize;
  }

  put(store: string, data: unknown): void {
    this.pending.push({ store, operation: 'put', data });
    this.scheduleFlush();
  }

  delete(store: string, data: unknown): void {
    this.pending.push({ store, operation: 'delete', data });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.pending.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 100);
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.pending.length === 0) return;

    const batch = this.pending.splice(0, this.batchSize);
    const stores = new Set(batch.map(op => op.store));
    
    const transaction = this.db.transaction(Array.from(stores), 'readwrite');
    
    return new Promise((resolve, reject) => {
      batch.forEach(op => {
        const store = transaction.objectStore(op.store);
        if (op.operation === 'put') {
          store.put(op.data);
        } else {
          store.delete(op.data as IDBValidKey);
        }
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// 799. Read Replicas (Simulated)
export class ReadReplicaManager {
  private primary: HybridStorage;
  private replicas: HybridStorage[] = [];
  private readIndex = 0;

  constructor(primary: HybridStorage) {
    this.primary = primary;
  }

  addReplica(replica: HybridStorage): void {
    this.replicas.push(replica);
  }

  async write<T>(key: string, value: T): Promise<void> {
    await this.primary.set(key, value);
    // Replicate to all replicas
    await Promise.all(this.replicas.map(r => r.set(key, value)));
  }

  async read<T>(key: string): Promise<T | null> {
    if (this.replicas.length === 0) {
      return this.primary.get<T>(key);
    }
    
    // Round-robin read from replicas
    const replica = this.replicas[this.readIndex % this.replicas.length];
    this.readIndex++;
    return replica.get<T>(key);
  }

  getReplicaCount(): number {
    return this.replicas.length;
  }
}

// 800. Connection Pooling (Simulated for IndexedDB)
export class ConnectionPool {
  private pool: IDBDatabase[] = [];
  private maxSize: number;
  private dbName: string;
  private version: number;

  constructor(dbName: string, version: number, maxSize = 5) {
    this.dbName = dbName;
    this.version = version;
    this.maxSize = maxSize;
  }

  async acquire(): Promise<IDBDatabase> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  release(db: IDBDatabase): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(db);
    } else {
      db.close();
    }
  }

  async drain(): Promise<void> {
    this.pool.forEach(db => db.close());
    this.pool = [];
  }

  getPoolSize(): number {
    return this.pool.length;
  }
}

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

export function useImmutableState<T>(initialState: T, maxHistory = 100) {
  const container = useRef(new ImmutableStateContainer<T>(initialState, maxHistory));
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return container.current.subscribe(() => forceUpdate({}));
  }, []);

  return {
    state: container.current.getState(),
    setState: useCallback((state: T, label?: string) => container.current.setState(state, label), []),
    undo: useCallback(() => container.current.undo(), []),
    redo: useCallback(() => container.current.redo(), []),
    canUndo: container.current.canUndo(),
    canRedo: container.current.canRedo(),
    history: container.current.getHistory(),
  };
}

export function useLRUCache<T>(maxSize?: number, maxMemory?: number) {
  const cache = useRef(new LRUCache<T>(maxSize, maxMemory));

  return {
    get: useCallback((key: string) => cache.current.get(key), []),
    set: useCallback((key: string, value: T) => cache.current.set(key, value), []),
    delete: useCallback((key: string) => cache.current.delete(key), []),
    clear: useCallback(() => cache.current.clear(), []),
    stats: cache.current.getStats(),
  };
}

export function usePagination<T>(data: T[], pageSize = 20) {
  const pagination = useMemo(() => {
    const p = new PaginationState<T>(pageSize);
    p.setData(data);
    return p;
  }, [data, pageSize]);

  const [page, setPage] = useState(1);

  useEffect(() => {
    pagination.setPage(page);
  }, [page, pagination]);

  return {
    items: pagination.getPage(),
    page,
    totalPages: pagination.getTotalPages(),
    setPage,
    nextPage: () => setPage(p => Math.min(p + 1, pagination.getTotalPages())),
    prevPage: () => setPage(p => Math.max(p - 1, 1)),
    hasNext: page < pagination.getTotalPages(),
    hasPrev: page > 1,
  };
}

export function useHybridStorage(dbName: string) {
  const storage = useRef<HybridStorage | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage.current = new HybridStorage(dbName);
    storage.current.init().then(() => setReady(true));

    return () => {
      storage.current?.close();
    };
  }, [dbName]);

  return {
    ready,
    get: useCallback(<T,>(key: string) => storage.current?.get<T>(key) ?? Promise.resolve(null), []),
    set: useCallback(<T,>(key: string, value: T, ttl?: number) => storage.current?.set(key, value, ttl) ?? Promise.resolve(), []),
    delete: useCallback((key: string) => storage.current?.delete(key) ?? Promise.resolve(false), []),
    clear: useCallback(() => storage.current?.clear() ?? Promise.resolve(), []),
  };
}
