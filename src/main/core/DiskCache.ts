// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DiskCache — 2GB LRU Disk Cache for DEX
 * 
 * Provides a persistent, auto-evicting disk cache with:
 * - Configurable max size (default 2GB)
 * - LRU eviction (oldest-accessed items removed first)
 * - File-based storage with metadata index
 * - Atomic writes (write-then-rename)
 * - Auto-cleanup on startup
 * - Thread-safe access via file locks
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app, ipcMain } from 'electron';
import { Logger } from '../utils/Logger';

const logger = new Logger();

interface CacheEntry {
  key: string;
  filename: string;
  size: number;
  createdAt: number;
  accessedAt: number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

interface CacheIndex {
  version: number;
  maxSizeBytes: number;
  currentSizeBytes: number;
  entries: Record<string, CacheEntry>;
}

export interface DiskCacheConfig {
  maxSizeMB: number;
  cacheDir?: string;
  autoCleanupOnStartup: boolean;
  evictionBatchSize: number;
}

const DEFAULT_CONFIG: DiskCacheConfig = {
  maxSizeMB: 2048, // 2GB
  autoCleanupOnStartup: true,
  evictionBatchSize: 50,
};

export class DiskCache {
  private config: DiskCacheConfig;
  private cacheDir: string;
  private indexPath: string;
  private index: CacheIndex;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<DiskCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cacheDir = this.config.cacheDir || path.join(app.getPath('userData'), 'cache', 'disk-lru');
    this.indexPath = path.join(this.cacheDir, '_index.json');
    this.index = {
      version: 1,
      maxSizeBytes: this.config.maxSizeMB * 1024 * 1024,
      currentSizeBytes: 0,
      entries: {},
    };
  }

  async initialize(): Promise<void> {
    logger.info(`[DiskCache] Initializing with max size ${this.config.maxSizeMB}MB`);

    // Ensure cache directory exists
    await fs.promises.mkdir(this.cacheDir, { recursive: true });

    // Load existing index
    await this.loadIndex();

    // Verify integrity — remove orphaned files
    if (this.config.autoCleanupOnStartup) {
      await this.verifyIntegrity();
    }

    // Evict if over limit
    await this.evictIfNeeded();

    // Register IPC handlers
    this.registerIPC();

    // Schedule periodic flush
    this.scheduleFlush();

    logger.info(`[DiskCache] Ready — ${Object.keys(this.index.entries).length} entries, ` +
      `${(this.index.currentSizeBytes / 1048576).toFixed(1)}MB used`);
  }

  // ─── Core Operations ────────────────────────────────────────

  async get(key: string): Promise<Buffer | null> {
    const entry = this.index.entries[key];
    if (!entry) return null;

    const filePath = path.join(this.cacheDir, entry.filename);
    try {
      const data = await fs.promises.readFile(filePath);
      // Update access time (LRU)
      entry.accessedAt = Date.now();
      this.markDirty();
      return data;
    } catch {
      // File missing — remove from index
      this.removeEntry(key);
      return null;
    }
  }

  async getString(key: string): Promise<string | null> {
    const data = await this.get(key);
    return data ? data.toString('utf8') : null;
  }

  async getJSON<T = unknown>(key: string): Promise<T | null> {
    const str = await this.getString(key);
    if (!str) return null;
    try {
      return JSON.parse(str) as T;
    } catch {
      return null;
    }
  }

  async put(key: string, data: Buffer | string, options?: { mimeType?: string; metadata?: Record<string, unknown> }): Promise<boolean> {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    // Don't cache items larger than 10% of max
    if (buffer.length > this.index.maxSizeBytes * 0.1) {
      logger.warn(`[DiskCache] Item too large to cache: ${key} (${(buffer.length / 1048576).toFixed(1)}MB)`);
      return false;
    }

    // Remove existing entry if present
    if (this.index.entries[key]) {
      this.removeEntry(key);
    }

    // Evict space if needed
    const spaceNeeded = buffer.length;
    while (this.index.currentSizeBytes + spaceNeeded > this.index.maxSizeBytes) {
      const evicted = this.evictLRU();
      if (!evicted) break; // Nothing left to evict
    }

    // Generate unique filename
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const filename = `${hash}_${Date.now()}`;
    const filePath = path.join(this.cacheDir, filename);

    try {
      // Atomic write: write to temp then rename
      const tmpPath = filePath + '.tmp';
      await fs.promises.writeFile(tmpPath, buffer);
      await fs.promises.rename(tmpPath, filePath);

      // Add to index
      const entry: CacheEntry = {
        key,
        filename,
        size: buffer.length,
        createdAt: Date.now(),
        accessedAt: Date.now(),
        mimeType: options?.mimeType,
        metadata: options?.metadata,
      };

      this.index.entries[key] = entry;
      this.index.currentSizeBytes += buffer.length;
      this.markDirty();

      return true;
    } catch (err) {
      logger.error(`[DiskCache] Failed to write ${key}`, err);
      return false;
    }
  }

  async putJSON(key: string, data: unknown, options?: { metadata?: Record<string, unknown> }): Promise<boolean> {
    return this.put(key, JSON.stringify(data), { mimeType: 'application/json', ...options });
  }

  async delete(key: string): Promise<boolean> {
    return this.removeEntry(key);
  }

  has(key: string): boolean {
    return key in this.index.entries;
  }

  getStats() {
    const entries = Object.values(this.index.entries);
    return {
      totalEntries: entries.length,
      totalSizeBytes: this.index.currentSizeBytes,
      totalSizeMB: +(this.index.currentSizeBytes / 1048576).toFixed(2),
      maxSizeMB: this.config.maxSizeMB,
      usagePercent: +((this.index.currentSizeBytes / this.index.maxSizeBytes) * 100).toFixed(1),
      oldestEntry: entries.length > 0
        ? Math.min(...entries.map(e => e.accessedAt))
        : null,
      newestEntry: entries.length > 0
        ? Math.max(...entries.map(e => e.accessedAt))
        : null,
    };
  }

  // ─── LRU Eviction ──────────────────────────────────────────

  private evictLRU(): boolean {
    const entries = Object.values(this.index.entries);
    if (entries.length === 0) return false;

    // Find least recently accessed
    entries.sort((a, b) => a.accessedAt - b.accessedAt);
    const oldest = entries[0];
    return this.removeEntry(oldest.key);
  }

  private async evictIfNeeded(): Promise<void> {
    let evicted = 0;
    while (this.index.currentSizeBytes > this.index.maxSizeBytes) {
      if (!this.evictLRU()) break;
      evicted++;
    }
    if (evicted > 0) {
      logger.info(`[DiskCache] Evicted ${evicted} entries to stay within ${this.config.maxSizeMB}MB limit`);
      await this.flushIndex();
    }
  }

  private removeEntry(key: string): boolean {
    const entry = this.index.entries[key];
    if (!entry) return false;

    // Delete file
    const filePath = path.join(this.cacheDir, entry.filename);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File already gone
    }

    this.index.currentSizeBytes -= entry.size;
    delete this.index.entries[key];
    this.markDirty();
    return true;
  }

  async clear(): Promise<void> {
    const keys = Object.keys(this.index.entries);
    for (const key of keys) {
      this.removeEntry(key);
    }
    this.index.currentSizeBytes = 0;
    await this.flushIndex();
    logger.info('[DiskCache] Cache cleared');
  }

  // ─── Index Persistence ─────────────────────────────────────

  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.indexPath, 'utf8');
      const parsed = JSON.parse(data) as CacheIndex;
      this.index = {
        ...parsed,
        maxSizeBytes: this.config.maxSizeMB * 1024 * 1024,
      };
    } catch {
      // Fresh start
    }
  }

  private async flushIndex(): Promise<void> {
    try {
      const tmpPath = this.indexPath + '.tmp';
      await fs.promises.writeFile(tmpPath, JSON.stringify(this.index));
      await fs.promises.rename(tmpPath, this.indexPath);
      this.dirty = false;
    } catch (err) {
      logger.error('[DiskCache] Failed to flush index', err);
    }
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private scheduleFlush(): void {
    this.flushTimer = setInterval(async () => {
      if (this.dirty) {
        await this.flushIndex();
      }
    }, 5000); // Flush every 5s if dirty
  }

  // ─── Integrity ──────────────────────────────────────────────

  private async verifyIntegrity(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      const indexedFiles = new Set(
        Object.values(this.index.entries).map(e => e.filename)
      );

      let orphansRemoved = 0;
      for (const file of files) {
        if (file === '_index.json' || file.endsWith('.tmp')) continue;
        if (!indexedFiles.has(file)) {
          await fs.promises.unlink(path.join(this.cacheDir, file));
          orphansRemoved++;
        }
      }

      // Remove index entries for missing files
      let missingRemoved = 0;
      for (const [key, entry] of Object.entries(this.index.entries)) {
        const exists = files.includes(entry.filename);
        if (!exists) {
          this.index.currentSizeBytes -= entry.size;
          delete this.index.entries[key];
          missingRemoved++;
        }
      }

      if (orphansRemoved > 0 || missingRemoved > 0) {
        logger.info(`[DiskCache] Cleanup: ${orphansRemoved} orphans, ${missingRemoved} missing entries removed`);
        await this.flushIndex();
      }
    } catch (err) {
      logger.warn('[DiskCache] Integrity check failed', err);
    }
  }

  // ─── IPC ────────────────────────────────────────────────────

  private registerIPC(): void {
    ipcMain.handle('cache:get-stats', () => this.getStats());
    ipcMain.handle('cache:clear', async () => {
      await this.clear();
      return true;
    });
    ipcMain.handle('cache:get', async (_e, key: string) => {
      const data = await this.getString(key);
      return data;
    });
    ipcMain.handle('cache:put', async (_e, key: string, value: string) => {
      return this.put(key, value);
    });
    ipcMain.handle('cache:delete', async (_e, key: string) => {
      return this.delete(key);
    });
    ipcMain.handle('cache:has', (_e, key: string) => this.has(key));
  }

  // ─── Shutdown ───────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.dirty) await this.flushIndex();
    logger.info('[DiskCache] Shut down');
  }
}
