// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Module & SQLite Acceleration
// ==========================================================================
// Technique 1:  Lazy Initialization Factory
// Technique 2:  Dynamic Import Registry
// Technique 3:  V8 Code Cache Helper
// Technique 4:  V8 Heap Snapshot Script
// Technique 15: Pre-Allocated Statement Parameters
// Technique 16: Integer Primary Key Enforcement
// Technique 17: WITHOUT ROWID Helpers
// Technique 18: Read Batcher (Same-Tick Batching)
// Technique 19: Covering Index Definitions
// Technique 20: Partial Index Definitions
// Technique 21: In-Memory Config Map
// Technique 27: nextTick/setImmediate Optimization
// Technique 28: Event Loop Phase Awareness
// Technique 29: Recursive setImmediate Chunking
// Technique 30: Stream highWaterMark Tuning
// Technique 31: Pipeline Helper
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { pipeline, Readable, Writable, Transform } from 'stream';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Technique 1: Lazy Initialization Factory
// ---------------------------------------------------------------------------

export class LazyInit<T> {
  private value: T | undefined;
  private initializer: () => T;
  private initialized = false;

  constructor(initializer: () => T) {
    this.initializer = initializer;
  }

  get(): T {
    if (!this.initialized) {
      this.value = this.initializer();
      this.initialized = true;
    }
    return this.value!;
  }

  isInitialized(): boolean { return this.initialized; }

  reset(): void {
    this.value = undefined;
    this.initialized = false;
  }
}

export class AsyncLazyInit<T> {
  private value: T | undefined;
  private initializer: () => Promise<T>;
  private initialized = false;
  private pending: Promise<T> | null = null;

  constructor(initializer: () => Promise<T>) {
    this.initializer = initializer;
  }

  async get(): Promise<T> {
    if (this.initialized) return this.value!;
    if (this.pending) return this.pending;
    this.pending = this.initializer().then(val => {
      this.value = val;
      this.initialized = true;
      this.pending = null;
      return val;
    });
    return this.pending;
  }

  isInitialized(): boolean { return this.initialized; }

  reset(): void {
    this.value = undefined;
    this.initialized = false;
    this.pending = null;
  }
}

// Pre-built lazy inits for commonly deferred modules
export const lazyRegistry: Map<string, LazyInit<unknown>> = new Map();
export const asyncLazyRegistry: Map<string, AsyncLazyInit<unknown>> = new Map();

export function registerLazy<T>(name: string, init: () => T): LazyInit<T> {
  const lazy = new LazyInit(init);
  lazyRegistry.set(name, lazy as LazyInit<unknown>);
  return lazy;
}

export function registerAsyncLazy<T>(name: string, init: () => Promise<T>): AsyncLazyInit<T> {
  const lazy = new AsyncLazyInit(init);
  asyncLazyRegistry.set(name, lazy as AsyncLazyInit<unknown>);
  return lazy;
}

export function getLazy<T>(name: string): T | undefined {
  const lazy = lazyRegistry.get(name);
  return lazy ? lazy.get() as T : undefined;
}

export async function getAsyncLazy<T>(name: string): Promise<T | undefined> {
  const lazy = asyncLazyRegistry.get(name);
  return lazy ? await lazy.get() as T : undefined;
}

// ---------------------------------------------------------------------------
// Technique 2: Dynamic Import Registry
// ---------------------------------------------------------------------------

interface DynamicModule {
  path: string;
  module: unknown | null;
  loading: boolean;
  loadPromise: Promise<unknown> | null;
  loadTimeMs: number;
}

class DynamicImportRegistry {
  private modules: Map<string, DynamicModule> = new Map();

  register(name: string, modulePath: string): void {
    this.modules.set(name, { path: modulePath, module: null, loading: false, loadPromise: null, loadTimeMs: 0 });
  }

  async load<T>(name: string): Promise<T> {
    const entry = this.modules.get(name);
    if (!entry) throw new Error(`Module not registered: ${name}`);
    if (entry.module) return entry.module as T;
    if (entry.loadPromise) return entry.loadPromise as Promise<T>;

    const start = performance.now();
    entry.loading = true;
    entry.loadPromise = import(entry.path).then(mod => {
      entry.module = mod;
      entry.loading = false;
      entry.loadTimeMs = performance.now() - start;
      entry.loadPromise = null;
      return mod as T;
    }).catch(err => {
      entry.loading = false;
      entry.loadPromise = null;
      throw err;
    });
    return entry.loadPromise as Promise<T>;
  }

  isLoaded(name: string): boolean {
    const entry = this.modules.get(name);
    return entry ? entry.module !== null : false;
  }

  get stats(): Array<{ name: string; loaded: boolean; loadTimeMs: number }> {
    const result: Array<{ name: string; loaded: boolean; loadTimeMs: number }> = [];
    for (const [name, entry] of this.modules) {
      result.push({ name, loaded: entry.module !== null, loadTimeMs: entry.loadTimeMs });
    }
    return result;
  }
}

export const dynamicImports = new DynamicImportRegistry();

// ---------------------------------------------------------------------------
// Technique 3: V8 Code Cache Helper
// ---------------------------------------------------------------------------

import * as vm from 'vm';

export class V8CodeCache {
  private cacheDir: string;
  private cacheEnabled: boolean;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    this.cacheEnabled = true;
    try {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    } catch {
      this.cacheEnabled = false;
    }
  }

  getCachePath(scriptName: string): string {
    const safeName = scriptName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.cacheDir, `${safeName}.v8cache`);
  }

  compileWithCache(scriptName: string, source: string): vm.Script {
    const cachePath = this.getCachePath(scriptName);

    // Try to load cached data
    let cachedData: Buffer | undefined;
    if (this.cacheEnabled) {
      try {
        if (fs.existsSync(cachePath)) {
          cachedData = fs.readFileSync(cachePath);
        }
      } catch { /* ignore */ }
    }

    const script = new vm.Script(source, {
      filename: scriptName,
      cachedData,
      produceCachedData: !cachedData,
    });

    // Save cache if newly produced
    if (this.cacheEnabled && (script as unknown as { cachedDataProduced: boolean }).cachedDataProduced) {
      const newCache = (script as unknown as { cachedData: Buffer }).cachedData;
      if (newCache) {
        try { fs.writeFileSync(cachePath, newCache); } catch { /* ignore */ }
      }
    }

    return script;
  }

  invalidate(scriptName: string): void {
    const cachePath = this.getCachePath(scriptName);
    try { if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath); } catch { /* ignore */ }
  }

  invalidateAll(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const f of files) {
        if (f.endsWith('.v8cache')) {
          try { fs.unlinkSync(path.join(this.cacheDir, f)); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Technique 4: V8 Heap Snapshot Helper
// ---------------------------------------------------------------------------

import * as v8 from 'v8';

export function takeHeapSnapshot(outputDir: string, label: string = 'snapshot'): string | null {
  try {
    const timestamp = Date.now();
    const filename = `${label}-${timestamp}.heapsnapshot`;
    const filepath = path.join(outputDir, filename);
    v8.writeHeapSnapshot(filepath);
    return filepath;
  } catch (err) {
    log.error('[V8HeapSnapshot] Failed to take snapshot:', err);
    return null;
  }
}

export function getHeapStatistics(): v8.HeapInfo {
  return v8.getHeapStatistics();
}

export function getHeapSpaceStatistics(): v8.HeapSpaceInfo[] {
  return v8.getHeapSpaceStatistics();
}

// ---------------------------------------------------------------------------
// Technique 15: Pre-Allocated Statement Parameter Objects
// ---------------------------------------------------------------------------

export class StatementParamPool {
  private pools: Map<number, Array<Record<string, unknown>>> = new Map();

  getParams(paramCount: number): Record<string, unknown> {
    let pool = this.pools.get(paramCount);
    if (!pool) { pool = []; this.pools.set(paramCount, pool); }
    if (pool.length > 0) return pool.pop()!;
    return {};
  }

  releaseParams(params: Record<string, unknown>, paramCount: number): void {
    const pool = this.pools.get(paramCount);
    if (!pool || pool.length >= 64) return;
    // Reset all values to null
    for (const key in params) (params as Record<string, unknown>)[key] = null;
    pool.push(params);
  }
}

export const stmtParamPool = new StatementParamPool();

// Pre-defined parameter templates for common queries
export const PARAM_TEMPLATES = {
  // Activity inserts
  activityInsert: { $id: null, $type: null, $content: null, $timestamp: null, $appName: null },
  // Task inserts
  taskInsert: { $id: null, $title: null, $description: null, $priority: null, $status: null, $createdAt: null, $dueDate: null },
  // Settings updates
  settingUpdate: { $key: null, $value: null, $updatedAt: null },
  // Search queries
  searchQuery: { $term: null, $limit: null, $offset: null },
  // File metadata
  fileMetadata: { $id: null, $path: null, $name: null, $size: null, $type: null, $modifiedAt: null },
} as const;

// ---------------------------------------------------------------------------
// Technique 16/17: SQLite Schema Optimization SQL Generators
// ---------------------------------------------------------------------------

export const SQLiteOptimization = {
  // Technique 16: Integer primary key (use INTEGER PRIMARY KEY for autoincrement alias to rowid)
  integerPKTable(tableName: string, columns: string[]): string {
    return `CREATE TABLE IF NOT EXISTS "${tableName}" (id INTEGER PRIMARY KEY, ${columns.join(', ')})`;
  },

  // Technique 17: WITHOUT ROWID for tables with explicit compound primary keys
  withoutRowidTable(tableName: string, columns: string[], pkColumns: string[]): string {
    return `CREATE TABLE IF NOT EXISTS "${tableName}" (${columns.join(', ')}, PRIMARY KEY (${pkColumns.join(', ')})) WITHOUT ROWID`;
  },

  // Technique 19: Covering index (includes all columns needed by query)
  coveringIndex(indexName: string, tableName: string, keyColumns: string[], includeColumns: string[]): string {
    const allCols = [...keyColumns, ...includeColumns];
    return `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" (${allCols.join(', ')})`;
  },

  // Technique 20: Partial index (only indexes rows matching WHERE clause)
  partialIndex(indexName: string, tableName: string, columns: string[], whereClause: string): string {
    return `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" (${columns.join(', ')}) WHERE ${whereClause}`;
  },

  // Common optimizer pragmas for a new connection
  optimizerPragmas(): string[] {
    return [
      'PRAGMA journal_mode = WAL',
      'PRAGMA synchronous = NORMAL',
      'PRAGMA page_size = 4096',
      'PRAGMA cache_size = -10000',
      'PRAGMA mmap_size = 268435456',
      'PRAGMA temp_store = MEMORY',
      'PRAGMA auto_vacuum = INCREMENTAL',
      'PRAGMA wal_autocheckpoint = 1000',
      'PRAGMA optimize',
    ];
  },

  // Index definitions for DEX databases
  dexCoreIndexes(): string[] {
    return [
      // Covering index: activity lookups by type + timestamp
      'CREATE INDEX IF NOT EXISTS "idx_activities_type_ts" ON "activities" ("type", "timestamp", "id", "content")',
      // Partial index: only active tasks
      'CREATE INDEX IF NOT EXISTS "idx_tasks_active" ON "tasks" ("priority", "due_date") WHERE "status" != \'completed\'',
      // Covering index: settings by key
      'CREATE INDEX IF NOT EXISTS "idx_settings_key" ON "settings" ("key", "value")',
      // Partial index: recent activities (last 30 days)
      'CREATE INDEX IF NOT EXISTS "idx_activities_recent" ON "activities" ("timestamp") WHERE "timestamp" > (strftime(\'%s\', \'now\') - 2592000)',
      // Index for search
      'CREATE INDEX IF NOT EXISTS "idx_activities_content" ON "activities" ("content")',
    ];
  },

  dexRewindIndexes(): string[] {
    return [
      'CREATE INDEX IF NOT EXISTS "idx_snapshots_ts" ON "snapshots" ("timestamp", "app_name")',
      'CREATE INDEX IF NOT EXISTS "idx_snapshots_app" ON "snapshots" ("app_name", "timestamp")',
    ];
  },

  dexMediaIndexes(): string[] {
    return [
      'CREATE INDEX IF NOT EXISTS "idx_media_type_ts" ON "media_files" ("type", "created_at")',
      'CREATE INDEX IF NOT EXISTS "idx_media_path" ON "media_files" ("path")',
      'CREATE INDEX IF NOT EXISTS "idx_projects_name" ON "projects" ("name")',
    ];
  },
};

// ---------------------------------------------------------------------------
// Technique 18: Read Batcher (Same-Tick Batching)
// ---------------------------------------------------------------------------

export class ReadBatcher<K, V> {
  private pending: Map<K, Array<{ resolve: (v: V | undefined) => void; reject: (e: Error) => void }>> = new Map();
  private batchFn: (keys: K[]) => Promise<Map<K, V>>;
  private scheduled = false;

  constructor(batchFn: (keys: K[]) => Promise<Map<K, V>>) {
    this.batchFn = batchFn;
  }

  load(key: K): Promise<V | undefined> {
    return new Promise((resolve, reject) => {
      let entry = this.pending.get(key);
      if (!entry) {
        entry = [];
        this.pending.set(key, entry);
      }
      entry.push({ resolve, reject });

      if (!this.scheduled) {
        this.scheduled = true;
        process.nextTick(() => this.flush());
      }
    });
  }

  private async flush(): Promise<void> {
    this.scheduled = false;
    const batch = new Map(this.pending);
    this.pending.clear();

    const keys = Array.from(batch.keys());
    try {
      const results = await this.batchFn(keys);
      for (const [key, callbacks] of batch) {
        const value = results.get(key);
        for (const cb of callbacks) cb.resolve(value);
      }
    } catch (error) {
      for (const callbacks of batch.values()) {
        for (const cb of callbacks) cb.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Technique 21: In-Memory Config Map
// ---------------------------------------------------------------------------

class InMemoryConfig {
  private config: Map<string, unknown> = new Map();
  private dirty = false;
  private loadedAt = 0;

  set(key: string, value: unknown): void {
    this.config.set(key, value);
    this.dirty = true;
  }

  get<T>(key: string, defaultValue?: T): T {
    if (this.config.has(key)) return this.config.get(key) as T;
    return defaultValue as T;
  }

  has(key: string): boolean { return this.config.has(key); }

  delete(key: string): boolean {
    const result = this.config.delete(key);
    if (result) this.dirty = true;
    return result;
  }

  // Bulk load from DB/file (single read)
  loadAll(entries: Array<[string, unknown]>): void {
    this.config.clear();
    for (const [k, v] of entries) this.config.set(k, v);
    this.dirty = false;
    this.loadedAt = Date.now();
  }

  // Get entries that need persisting
  getAll(): Array<[string, unknown]> {
    return Array.from(this.config.entries());
  }

  isDirty(): boolean { return this.dirty; }
  markClean(): void { this.dirty = false; }
  get size(): number { return this.config.size; }
  get loadedTimestamp(): number { return this.loadedAt; }
}

export const inMemoryConfig = new InMemoryConfig();

// Pre-populate common config keys with defaults
const CONFIG_DEFAULTS: Array<[string, unknown]> = [
  ['theme', 'dark'],
  ['language', 'en'],
  ['autoSave', true],
  ['autoSaveIntervalMs', 30000],
  ['maxRecentFiles', 20],
  ['sidebarWidth', 280],
  ['sidebarCollapsed', false],
  ['focusModeEnabled', false],
  ['focusSessionMinutes', 25],
  ['breakMinutes', 5],
  ['notificationsEnabled', true],
  ['soundEnabled', true],
  ['hardwareAcceleration', true],
  ['performanceMode', 'balanced'],
  ['telemetryEnabled', false],
  ['maxConcurrentTasks', 4],
  ['searchMaxResults', 50],
  ['rewindMaxSnapshots', 1000],
  ['pluginSandboxEnabled', true],
  ['dbCacheSize', 10000],
];

inMemoryConfig.loadAll(CONFIG_DEFAULTS);

// ---------------------------------------------------------------------------
// Technique 27: nextTick/setImmediate Optimization
// ---------------------------------------------------------------------------

export const TickOptimizer = {
  // Use process.nextTick for high-priority microtask callbacks
  nextTick(fn: () => void): void {
    process.nextTick(fn);
  },

  // Use setImmediate for check-phase callbacks (after I/O)
  immediate(fn: () => void): void {
    setImmediate(fn);
  },

  // Technique 29: Recursive setImmediate chunking for large work
  chunk<T>(items: T[], batchSize: number, processFn: (batch: T[]) => void, onComplete?: () => void): void {
    let offset = 0;
    const total = items.length;

    function processChunk(): void {
      const end = Math.min(offset + batchSize, total);
      processFn(items.slice(offset, end));
      offset = end;
      if (offset < total) {
        setImmediate(processChunk);
      } else {
        if (onComplete) onComplete();
      }
    }

    if (total > 0) setImmediate(processChunk);
    else if (onComplete) onComplete();
  },

  // Technique 28: Event loop phase-aware scheduling
  // Poll phase: setTimeout(..., 0) -- fires in timer phase
  // Check phase: setImmediate -- fires after I/O poll
  // Microtask: process.nextTick -- fires between phases
  scheduleForPhase(phase: 'microtask' | 'timer' | 'check', fn: () => void): void {
    switch (phase) {
      case 'microtask': process.nextTick(fn); break;
      case 'timer': setTimeout(fn, 0); break;
      case 'check': setImmediate(fn); break;
    }
  },

  // Yield to event loop then continue (async)
  yieldTick(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
  },

  // Process items with periodic yielding
  async processWithYield<T>(items: T[], fn: (item: T) => void, yieldEvery: number = 100): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      fn(items[i]);
      if ((i + 1) % yieldEvery === 0) {
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Technique 30: Stream highWaterMark Tuning
// ---------------------------------------------------------------------------

export const StreamConfig = {
  // File reads: higher watermark for sequential access
  fileRead: { highWaterMark: 256 * 1024 }, // 256 KB
  // Network streams: standard
  network: { highWaterMark: 64 * 1024 }, // 64 KB
  // Small data transforms
  transform: { highWaterMark: 16 * 1024 }, // 16 KB
  // Large media files
  media: { highWaterMark: 1024 * 1024 }, // 1 MB
  // IPC messages
  ipc: { highWaterMark: 32 * 1024 }, // 32 KB
  // Log output
  logOutput: { highWaterMark: 64 * 1024 }, // 64 KB
};

export function createOptimizedReadStream(filePath: string, purpose: keyof typeof StreamConfig = 'fileRead'): fs.ReadStream {
  return fs.createReadStream(filePath, StreamConfig[purpose]);
}

export function createOptimizedWriteStream(filePath: string, purpose: keyof typeof StreamConfig = 'fileRead'): fs.WriteStream {
  return fs.createWriteStream(filePath, StreamConfig[purpose]);
}

// ---------------------------------------------------------------------------
// Technique 31: Pipeline Helper
// ---------------------------------------------------------------------------

export function pipelineAsync(...streams: Array<NodeJS.ReadableStream | NodeJS.WritableStream | NodeJS.ReadWriteStream>): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = streams as any[];
    args.push((err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
    (pipeline as any).apply(null, args);
  });
}

// Transform stream factory for common operations
export function createBatchTransform<T>(batchSize: number, processFn: (batch: T[]) => T[]): Transform {
  let buffer: T[] = [];
  return new Transform({
    objectMode: true,
    transform(chunk: T, _encoding, callback) {
      buffer.push(chunk);
      if (buffer.length >= batchSize) {
        const result = processFn(buffer);
        buffer = [];
        for (const item of result) this.push(item);
      }
      callback();
    },
    flush(callback) {
      if (buffer.length > 0) {
        const result = processFn(buffer);
        buffer = [];
        for (const item of result) this.push(item);
      }
      callback();
    }
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initializeModuleAccelerator(): void {
  // Register common dynamic imports (deferred loading)
  dynamicImports.register('sharp', 'sharp');
  dynamicImports.register('ffmpeg', 'fluent-ffmpeg');
  dynamicImports.register('marked', 'marked');
  dynamicImports.register('highlight', 'highlight.js');
  dynamicImports.register('katex', 'katex');

  log.info('[ModuleAccelerator] Techniques 1-4, 15-21, 27-31: Module acceleration initialized');
}

export function shutdownModuleAccelerator(): void {
  for (const lazy of lazyRegistry.values()) lazy.reset();
  for (const lazy of asyncLazyRegistry.values()) lazy.reset();
}
