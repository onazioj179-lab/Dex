// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Storage Engine and File Operations
// ==========================================================================
// Feature 11: Platform-Optimal File Cloning (copy-on-write where possible)
// Feature 12: File Watch Coordinator (debounced, coalesced)
// Feature 13: Hard-Link Snapshots (instant backups)
// Feature 14: Hotfile Pre-Loader (frequently-accessed file caching)
// Feature 15: Unified Media Buffer Cache
// Feature 16: Atomic File Writes (write-rename pattern)
// Feature 17: Parallel Chunked Reading
// Feature 18: Content-Hash Deduplication
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as log from 'electron-log';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Feature 16: Atomic File Writes
// ---------------------------------------------------------------------------

const ATOMIC_TEMP_SUFFIX = '.dex-atomic-tmp';

export async function atomicWriteFile(filePath: string, data: string | Buffer): Promise<void> {
  const tmpPath = filePath + ATOMIC_TEMP_SUFFIX + '-' + process.pid + '-' + Date.now();
  const dir = path.dirname(filePath);

  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(tmpPath, data, { mode: 0o644 });

    // fsync to ensure data is on disk
    const fd = await fs.promises.open(tmpPath, 'r');
    await fd.sync();
    await fd.close();

    // Atomic rename
    await fs.promises.rename(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    try { await fs.promises.unlink(tmpPath); } catch { /* ok */ }
    throw err;
  }
}

export function atomicWriteFileSync(filePath: string, data: string | Buffer): void {
  const tmpPath = filePath + ATOMIC_TEMP_SUFFIX + '-' + process.pid + '-' + Date.now();
  const dir = path.dirname(filePath);

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, data, { mode: 0o644 });

    const fd = fs.openSync(tmpPath, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* ok */ }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Feature 11: Platform-Optimal File Cloning
// ---------------------------------------------------------------------------

export async function cloneFile(srcPath: string, dstPath: string): Promise<void> {
  const dir = path.dirname(dstPath);
  await fs.promises.mkdir(dir, { recursive: true });

  try {
    // Try copy-on-write first (FICLONE on Linux, reflink on macOS APFS)
    await fs.promises.copyFile(srcPath, dstPath, fs.constants.COPYFILE_FICLONE);
  } catch {
    // Fall back to regular copy
    await fs.promises.copyFile(srcPath, dstPath);
  }
}

// ---------------------------------------------------------------------------
// Feature 12: File Watch Coordinator
// ---------------------------------------------------------------------------

interface WatchEntry {
  watcher: fs.FSWatcher | null;
  callbacks: Set<(event: string, filename: string | null) => void>;
  debounceTimer: NodeJS.Timeout | null;
  pendingEvents: Map<string, string>; // filename -> event type
}

const WATCH_DEBOUNCE_MS = 200;

class FileWatchCoordinator {
  private watches = new Map<string, WatchEntry>();
  private batchFlushInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.batchFlushInterval = setInterval(() => {
      this.flushStaleWatches();
    }, 30_000);
    log.info('[FileWatch] Feature 12: File watch coordinator initialized');
  }

  watch(
    dirPath: string,
    callback: (event: string, filename: string | null) => void
  ): () => void {
    const normalized = path.resolve(dirPath);
    let entry = this.watches.get(normalized);

    if (!entry) {
      entry = {
        watcher: null,
        callbacks: new Set(),
        debounceTimer: null,
        pendingEvents: new Map(),
      };

      try {
        entry.watcher = fs.watch(normalized, { recursive: true }, (evtType, filename) => {
          this.onRawEvent(normalized, evtType, filename);
        });

        entry.watcher.on('error', (err) => {
          log.warn(`[FileWatch] Watcher error for '${normalized}':`, err);
          this.unwatch(normalized);
        });
      } catch (err) {
        log.warn(`[FileWatch] Failed to watch '${normalized}':`, err);
      }

      this.watches.set(normalized, entry);
    }

    entry.callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      entry!.callbacks.delete(callback);
      if (entry!.callbacks.size === 0) {
        this.unwatch(normalized);
      }
    };
  }

  private onRawEvent(dirPath: string, eventType: string, filename: string | null): void {
    const entry = this.watches.get(dirPath);
    if (!entry) return;

    const key = filename || '__root__';
    entry.pendingEvents.set(key, eventType);

    // Debounce: coalesce rapid events
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
    }

    entry.debounceTimer = setTimeout(() => {
      this.flushEvents(dirPath);
    }, WATCH_DEBOUNCE_MS);
  }

  private flushEvents(dirPath: string): void {
    const entry = this.watches.get(dirPath);
    if (!entry) return;

    for (const [filename, eventType] of entry.pendingEvents) {
      const fname = filename === '__root__' ? null : filename;
      for (const cb of entry.callbacks) {
        try {
          cb(eventType, fname);
        } catch (err) {
          log.warn('[FileWatch] Callback error:', err);
        }
      }
    }

    entry.pendingEvents.clear();
    entry.debounceTimer = null;
  }

  private unwatch(dirPath: string): void {
    const entry = this.watches.get(dirPath);
    if (!entry) return;

    if (entry.watcher) {
      try { entry.watcher.close(); } catch { /* ok */ }
    }
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
    }

    this.watches.delete(dirPath);
  }

  private flushStaleWatches(): void {
    for (const [dirPath, entry] of this.watches) {
      if (entry.callbacks.size === 0) {
        this.unwatch(dirPath);
      }
    }
  }

  getWatchedPaths(): string[] {
    return Array.from(this.watches.keys());
  }

  shutdown(): void {
    if (this.batchFlushInterval) {
      clearInterval(this.batchFlushInterval);
      this.batchFlushInterval = null;
    }
    for (const dirPath of [...this.watches.keys()]) {
      this.unwatch(dirPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 13: Hard-Link Snapshots
// ---------------------------------------------------------------------------

class SnapshotManager {
  private snapshotDir: string;

  constructor() {
    this.snapshotDir = '';
  }

  initialize(): void {
    this.snapshotDir = path.join(app.getPath('userData'), 'snapshots');
    fs.mkdirSync(this.snapshotDir, { recursive: true });
    log.info('[Snapshots] Feature 13: Hard-link snapshot manager initialized');
  }

  async createSnapshot(sourceDir: string, snapshotName: string): Promise<string> {
    const snapshotPath = path.join(this.snapshotDir, snapshotName);
    await fs.promises.mkdir(snapshotPath, { recursive: true });

    const entries = await this.walkDirectory(sourceDir);
    let linked = 0;
    let copied = 0;

    for (const entry of entries) {
      const relPath = path.relative(sourceDir, entry);
      const destPath = path.join(snapshotPath, relPath);
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

      try {
        // Try hard link first (instant, zero disk space)
        await fs.promises.link(entry, destPath);
        linked++;
      } catch {
        // Fall back to copy if hard link fails (cross-device, etc.)
        await fs.promises.copyFile(entry, destPath);
        copied++;
      }
    }

    log.info(`[Snapshots] Created '${snapshotName}': ${linked} linked, ${copied} copied, ${entries.length} total files`);
    return snapshotPath;
  }

  async restoreSnapshot(snapshotName: string, targetDir: string): Promise<number> {
    const snapshotPath = path.join(this.snapshotDir, snapshotName);
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot '${snapshotName}' not found`);
    }

    const entries = await this.walkDirectory(snapshotPath);
    let restored = 0;

    for (const entry of entries) {
      const relPath = path.relative(snapshotPath, entry);
      const destPath = path.join(targetDir, relPath);
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.copyFile(entry, destPath);
      restored++;
    }

    log.info(`[Snapshots] Restored '${snapshotName}': ${restored} files to '${targetDir}'`);
    return restored;
  }

  async listSnapshots(): Promise<Array<{ name: string; createdAt: number; fileCount: number }>> {
    if (!fs.existsSync(this.snapshotDir)) return [];

    const entries = await fs.promises.readdir(this.snapshotDir, { withFileTypes: true });
    const snapshots: Array<{ name: string; createdAt: number; fileCount: number }> = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const stat = await fs.promises.stat(path.join(this.snapshotDir, entry.name));
        const files = await this.walkDirectory(path.join(this.snapshotDir, entry.name));
        snapshots.push({
          name: entry.name,
          createdAt: stat.birthtimeMs,
          fileCount: files.length,
        });
      }
    }

    return snapshots;
  }

  async deleteSnapshot(snapshotName: string): Promise<void> {
    const snapshotPath = path.join(this.snapshotDir, snapshotName);
    if (fs.existsSync(snapshotPath)) {
      await fs.promises.rm(snapshotPath, { recursive: true, force: true });
      log.info(`[Snapshots] Deleted snapshot '${snapshotName}'`);
    }
  }

  private async walkDirectory(dir: string): Promise<string[]> {
    const results: string[] = [];

    async function walk(currentDir: string): Promise<void> {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          results.push(fullPath);
        }
      }
    }

    await walk(dir);
    return results;
  }
}

// ---------------------------------------------------------------------------
// Feature 14: Hotfile Pre-Loader
// ---------------------------------------------------------------------------

interface HotfileEntry {
  filePath: string;
  content: Buffer;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

const HOTFILE_MAX_ENTRIES = 64;
const HOTFILE_MAX_SIZE = 50 * 1024 * 1024; // 50MB total
const HOTFILE_THRESHOLD_ACCESSES = 3;

class HotfilePreLoader {
  private cache = new Map<string, HotfileEntry>();
  private accessCounts = new Map<string, number>();
  private totalCachedSize = 0;
  private evictionInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.evictionInterval = setInterval(() => {
      this.evictStale();
    }, 60_000);
    log.info('[HotfilePreLoader] Feature 14: Hotfile pre-loader initialized');
  }

  recordAccess(filePath: string): void {
    const normalized = path.resolve(filePath);
    const count = (this.accessCounts.get(normalized) || 0) + 1;
    this.accessCounts.set(normalized, count);

    if (count >= HOTFILE_THRESHOLD_ACCESSES && !this.cache.has(normalized)) {
      this.preload(normalized).catch(() => { /* ok */ });
    }

    // Update LRU
    const entry = this.cache.get(normalized);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount = count;
    }
  }

  async preload(filePath: string): Promise<void> {
    if (this.cache.has(filePath)) return;

    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size > 5 * 1024 * 1024) return; // Skip files > 5MB

      if (this.totalCachedSize + stat.size > HOTFILE_MAX_SIZE) {
        this.evictLRU(stat.size);
      }

      if (this.cache.size >= HOTFILE_MAX_ENTRIES) {
        this.evictLRU(0);
      }

      const content = await fs.promises.readFile(filePath);
      this.cache.set(filePath, {
        filePath,
        content,
        accessCount: this.accessCounts.get(filePath) || 1,
        lastAccessed: Date.now(),
        size: content.length,
      });
      this.totalCachedSize += content.length;
    } catch {
      // File may not exist or be unreadable
    }
  }

  getCached(filePath: string): Buffer | null {
    const normalized = path.resolve(filePath);
    this.recordAccess(normalized);
    const entry = this.cache.get(normalized);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.content;
    }
    return null;
  }

  private evictLRU(spaceNeeded: number): void {
    const sorted = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    let freed = 0;
    for (const [key, entry] of sorted) {
      if (this.cache.size <= 1) break;
      this.cache.delete(key);
      this.totalCachedSize -= entry.size;
      freed += entry.size;
      if (freed >= spaceNeeded && spaceNeeded > 0) break;
    }
  }

  private evictStale(): void {
    const staleThreshold = Date.now() - 5 * 60 * 1000; // 5 minutes
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < staleThreshold) {
        this.cache.delete(key);
        this.totalCachedSize -= entry.size;
      }
    }
  }

  getStats(): { entries: number; totalSize: number; hitRate: number } {
    return {
      entries: this.cache.size,
      totalSize: this.totalCachedSize,
      hitRate: 0, // Track separately if needed
    };
  }

  shutdown(): void {
    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
      this.evictionInterval = null;
    }
    this.cache.clear();
    this.accessCounts.clear();
    this.totalCachedSize = 0;
  }
}

// ---------------------------------------------------------------------------
// Feature 15: Unified Media Buffer Cache
// ---------------------------------------------------------------------------

interface MediaBufferEntry {
  key: string;
  data: Buffer;
  mimeType: string;
  size: number;
  lastAccessed: number;
  accessCount: number;
}

const MEDIA_CACHE_MAX_SIZE = 100 * 1024 * 1024; // 100MB

class UnifiedMediaBufferCache {
  private cache = new Map<string, MediaBufferEntry>();
  private totalSize = 0;
  private hits = 0;
  private misses = 0;

  put(key: string, data: Buffer, mimeType: string): void {
    if (data.length > MEDIA_CACHE_MAX_SIZE / 4) return; // Single item can't exceed 25% of cache

    // Evict if needed
    while (this.totalSize + data.length > MEDIA_CACHE_MAX_SIZE && this.cache.size > 0) {
      this.evictOne();
    }

    const existing = this.cache.get(key);
    if (existing) {
      this.totalSize -= existing.size;
    }

    this.cache.set(key, {
      key,
      data,
      mimeType,
      size: data.length,
      lastAccessed: Date.now(),
      accessCount: (existing?.accessCount || 0) + 1,
    });
    this.totalSize += data.length;
  }

  get(key: string): { data: Buffer; mimeType: string } | null {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      this.hits++;
      return { data: entry.data, mimeType: entry.mimeType };
    }
    this.misses++;
    return null;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  private evictOne(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldest = key;
      }
    }

    if (oldest) {
      const entry = this.cache.get(oldest)!;
      this.totalSize -= entry.size;
      this.cache.delete(oldest);
    }
  }

  reduceSizeBy(percent: number): void {
    const targetSize = this.totalSize * (1 - percent / 100);
    while (this.totalSize > targetSize && this.cache.size > 0) {
      this.evictOne();
    }
  }

  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  getStats(): { entries: number; totalSize: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      entries: this.cache.size,
      totalSize: this.totalSize,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Feature 17: Parallel Chunked Reading
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB chunks
const MAX_PARALLEL_CHUNKS = 4;

export async function readFileChunked(
  filePath: string,
  options?: { chunkSize?: number; maxParallel?: number; onChunk?: (chunk: Buffer, offset: number) => void }
): Promise<Buffer> {
  const chunkSize = options?.chunkSize || DEFAULT_CHUNK_SIZE;
  const maxParallel = options?.maxParallel || MAX_PARALLEL_CHUNKS;

  const stat = await fs.promises.stat(filePath);
  const fileSize = stat.size;

  if (fileSize <= chunkSize) {
    return fs.promises.readFile(filePath);
  }

  const fd = await fs.promises.open(filePath, 'r');
  const result = Buffer.allocUnsafe(fileSize);
  const chunks: Array<{ offset: number; length: number }> = [];

  for (let offset = 0; offset < fileSize; offset += chunkSize) {
    chunks.push({
      offset,
      length: Math.min(chunkSize, fileSize - offset),
    });
  }

  // Process in parallel batches
  for (let i = 0; i < chunks.length; i += maxParallel) {
    const batch = chunks.slice(i, i + maxParallel);
    await Promise.all(batch.map(async (chunk) => {
      const buf = Buffer.allocUnsafe(chunk.length);
      await fd.read(buf, 0, chunk.length, chunk.offset);
      buf.copy(result, chunk.offset);
      if (options?.onChunk) {
        options.onChunk(buf, chunk.offset);
      }
    }));
  }

  await fd.close();
  return result;
}

// ---------------------------------------------------------------------------
// Feature 18: Content-Hash Deduplication
// ---------------------------------------------------------------------------

interface DeduplicationEntry {
  hash: string;
  filePath: string;
  size: number;
  registeredAt: number;
}

class ContentHashDeduplicator {
  private hashIndex = new Map<string, DeduplicationEntry[]>();
  private fileHashes = new Map<string, string>();

  async hashFile(filePath: string): Promise<string> {
    const cached = this.fileHashes.get(filePath);
    if (cached) return cached;

    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer | string) => hash.update(chunk));
      stream.on('end', () => {
        const digest = hash.digest('hex');
        this.fileHashes.set(filePath, digest);
        resolve(digest);
      });
      stream.on('error', reject);
    });
  }

  async registerFile(filePath: string): Promise<{ hash: string; isDuplicate: boolean; duplicateOf: string | null }> {
    const hash = await this.hashFile(filePath);
    const stat = await fs.promises.stat(filePath);

    const existing = this.hashIndex.get(hash);
    if (existing && existing.length > 0) {
      // Check if this exact path is already registered
      const sameFile = existing.find(e => e.filePath === filePath);
      if (!sameFile) {
        existing.push({
          hash,
          filePath,
          size: stat.size,
          registeredAt: Date.now(),
        });
      }
      return { hash, isDuplicate: true, duplicateOf: existing[0].filePath };
    }

    this.hashIndex.set(hash, [{
      hash,
      filePath,
      size: stat.size,
      registeredAt: Date.now(),
    }]);
    return { hash, isDuplicate: false, duplicateOf: null };
  }

  async findDuplicates(dirPath: string): Promise<Map<string, string[]>> {
    const files = await this.walkFiles(dirPath);
    const duplicates = new Map<string, string[]>();

    for (const file of files) {
      const hash = await this.hashFile(file);
      const group = duplicates.get(hash) || [];
      group.push(file);
      duplicates.set(hash, group);
    }

    // Remove non-duplicates
    for (const [hash, files] of duplicates) {
      if (files.length <= 1) {
        duplicates.delete(hash);
      }
    }

    return duplicates;
  }

  getDuplicateGroups(): Array<{ hash: string; files: string[]; wastedBytes: number }> {
    const groups: Array<{ hash: string; files: string[]; wastedBytes: number }> = [];

    for (const [hash, entries] of this.hashIndex) {
      if (entries.length > 1) {
        const size = entries[0].size;
        groups.push({
          hash,
          files: entries.map(e => e.filePath),
          wastedBytes: size * (entries.length - 1),
        });
      }
    }

    return groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  }

  clearCache(): void {
    this.fileHashes.clear();
  }

  private async walkFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    async function walk(d: string): Promise<void> {
      const entries = await fs.promises.readdir(d, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          results.push(full);
        }
      }
    }
    await walk(dir);
    return results;
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const fileWatchCoordinator = new FileWatchCoordinator();
export const snapshotManager = new SnapshotManager();
export const hotfilePreLoader = new HotfilePreLoader();
export const mediaBufferCache = new UnifiedMediaBufferCache();
export const contentDeduplicator = new ContentHashDeduplicator();

export function initializeStorageEngine(): void {
  fileWatchCoordinator.initialize();
  snapshotManager.initialize();
  hotfilePreLoader.initialize();
  log.info('[StorageEngine] Features 11-18: Storage engine initialized');
}

export function shutdownStorageEngine(): void {
  fileWatchCoordinator.shutdown();
  hotfilePreLoader.shutdown();
  mediaBufferCache.clear();
  contentDeduplicator.clearCache();
}
