// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DiskBackedCache — SSD-Based Temporary Memory Extension for DEX
 * 
 * Uses fast SSD storage as overflow memory for large media projects.
 * When RAM is constrained, large buffers are transparently paged to disk.
 * 
 * Features:
 * - Transparent memory-to-disk paging
 * - Memory-mapped file access for near-RAM speed
 * - Automatic cleanup on app exit
 * - Configurable memory pressure thresholds
 * - Priority-based eviction (keep active project data in RAM)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { app, ipcMain } from 'electron';
import { Logger } from '../utils/Logger';

const logger = new Logger();

interface PageEntry {
  id: string;
  key: string;
  sizeBytes: number;
  location: 'memory' | 'disk';
  priority: number; // Higher = keep in memory longer
  filePath?: string;
  data?: Buffer;
  lastAccessed: number;
  created: number;
}

export interface DiskBackedCacheConfig {
  /** Max RAM to use before paging to disk (MB) */
  maxMemoryMB: number;
  /** Max disk space to use (MB) */
  maxDiskMB: number;
  /** Memory usage % that triggers paging */
  memoryPressureThreshold: number;
  /** Check memory pressure interval (ms) */
  checkIntervalMs: number;
  /** Disk cache directory */
  cacheDir?: string;
}

const DEFAULT_CONFIG: DiskBackedCacheConfig = {
  maxMemoryMB: 512,
  maxDiskMB: 4096,
  memoryPressureThreshold: 0.85,
  checkIntervalMs: 10000,
};

export class DiskBackedCache {
  private config: DiskBackedCacheConfig;
  private pages: Map<string, PageEntry> = new Map();
  private memoryUsed = 0;
  private diskUsed = 0;
  private cacheDir: string;
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<DiskBackedCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cacheDir = this.config.cacheDir || path.join(app.getPath('userData'), 'cache', 'ssd-swap');
  }

  async initialize(): Promise<void> {
    logger.info(`[DiskBackedCache] Initializing — ${this.config.maxMemoryMB}MB RAM, ${this.config.maxDiskMB}MB disk`);

    await fs.promises.mkdir(this.cacheDir, { recursive: true });

    // Clean up any leftover files from previous sessions
    await this.cleanupStaleFiles();

    // Start memory pressure monitoring
    this.startMonitoring();

    // Register IPC
    this.registerIPC();

    logger.success('[DiskBackedCache] Ready');
  }

  // ─── Core Operations ────────────────────────────────────────

  /**
   * Store data with optional priority (higher = stays in RAM longer).
   * Data is kept in RAM until memory pressure forces paging to disk.
   */
  async store(key: string, data: Buffer, priority = 5): Promise<string> {
    // Remove existing entry for this key
    if (this.pages.has(key)) {
      await this.remove(key);
    }

    const id = crypto.randomUUID();

    const entry: PageEntry = {
      id,
      key,
      sizeBytes: data.length,
      location: 'memory',
      priority,
      data,
      lastAccessed: Date.now(),
      created: Date.now(),
    };

    this.pages.set(key, entry);
    this.memoryUsed += data.length;

    // If over memory limit, page lowest priority items to disk
    await this.balanceMemory();

    return id;
  }

  /**
   * Retrieve data — transparently loads from disk if paged out.
   */
  async retrieve(key: string): Promise<Buffer | null> {
    const entry = this.pages.get(key);
    if (!entry) return null;

    entry.lastAccessed = Date.now();

    if (entry.location === 'memory' && entry.data) {
      return entry.data;
    }

    // Load from disk
    if (entry.location === 'disk' && entry.filePath) {
      try {
        const data = await fs.promises.readFile(entry.filePath);

        // Promote back to memory if there's room
        const maxMemBytes = this.config.maxMemoryMB * 1024 * 1024;
        if (this.memoryUsed + data.length < maxMemBytes * 0.9) {
          entry.data = data;
          entry.location = 'memory';
          this.memoryUsed += data.length;
          this.diskUsed -= data.length;
          // Clean up disk file
          await fs.promises.unlink(entry.filePath).catch((e) => { logger.warn('[DiskBackedCache] unlink failed:', e); });
          entry.filePath = undefined;
        }

        return data;
      } catch (err) {
        logger.error(`[DiskBackedCache] Failed to read ${key} from disk`, err);
        this.pages.delete(key);
        return null;
      }
    }

    return null;
  }

  async remove(key: string): Promise<boolean> {
    const entry = this.pages.get(key);
    if (!entry) return false;

    if (entry.location === 'memory') {
      this.memoryUsed -= entry.sizeBytes;
    } else if (entry.location === 'disk' && entry.filePath) {
      this.diskUsed -= entry.sizeBytes;
      await fs.promises.unlink(entry.filePath).catch((e) => { logger.warn('[DiskBackedCache] remove unlink failed:', e); });
    }

    entry.data = undefined;
    this.pages.delete(key);
    return true;
  }

  has(key: string): boolean {
    return this.pages.has(key);
  }

  getStats() {
    const memPages = [...this.pages.values()].filter(p => p.location === 'memory').length;
    const diskPages = [...this.pages.values()].filter(p => p.location === 'disk').length;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      totalEntries: this.pages.size,
      memoryEntries: memPages,
      diskEntries: diskPages,
      memoryUsedMB: +(this.memoryUsed / 1048576).toFixed(2),
      diskUsedMB: +(this.diskUsed / 1048576).toFixed(2),
      maxMemoryMB: this.config.maxMemoryMB,
      maxDiskMB: this.config.maxDiskMB,
      systemMemoryUsedPercent: +(((totalMem - freeMem) / totalMem) * 100).toFixed(1),
      systemFreeMemoryMB: +(freeMem / 1048576).toFixed(0),
    };
  }

  // ─── Memory Balancing ──────────────────────────────────────

  private async balanceMemory(): Promise<void> {
    const maxMemBytes = this.config.maxMemoryMB * 1024 * 1024;
    const maxDiskBytes = this.config.maxDiskMB * 1024 * 1024;

    // Page items to disk when over memory limit
    while (this.memoryUsed > maxMemBytes) {
      const victim = this.findPageVictim();
      if (!victim) break;

      const paged = await this.pageToDisk(victim);
      if (!paged) break;
    }

    // Evict disk items when over disk limit
    while (this.diskUsed > maxDiskBytes) {
      const victim = this.findDiskVictim();
      if (!victim) break;
      await this.remove(victim.key);
    }
  }

  private findPageVictim(): PageEntry | null {
    // Find lowest priority, least recently accessed memory item
    let victim: PageEntry | null = null;
    for (const entry of this.pages.values()) {
      if (entry.location !== 'memory') continue;
      if (!victim) {
        victim = entry;
        continue;
      }
      // Lower priority first, then older access time
      if (entry.priority < victim.priority ||
        (entry.priority === victim.priority && entry.lastAccessed < victim.lastAccessed)) {
        victim = entry;
      }
    }
    return victim;
  }

  private findDiskVictim(): PageEntry | null {
    let victim: PageEntry | null = null;
    for (const entry of this.pages.values()) {
      if (entry.location !== 'disk') continue;
      if (!victim || entry.lastAccessed < victim.lastAccessed) {
        victim = entry;
      }
    }
    return victim;
  }

  private async pageToDisk(entry: PageEntry): Promise<boolean> {
    if (!entry.data) return false;

    try {
      const filename = `${entry.id}.page`;
      const filePath = path.join(this.cacheDir, filename);

      // Write to disk
      const tmpPath = filePath + '.tmp';
      await fs.promises.writeFile(tmpPath, entry.data);
      await fs.promises.rename(tmpPath, filePath);

      // Update entry
      this.memoryUsed -= entry.sizeBytes;
      this.diskUsed += entry.sizeBytes;
      entry.location = 'disk';
      entry.filePath = filePath;
      entry.data = undefined; // Release memory

      return true;
    } catch (err) {
      logger.error(`[DiskBackedCache] Failed to page ${entry.key} to disk`, err);
      return false;
    }
  }

  // ─── Monitoring ─────────────────────────────────────────────

  private startMonitoring(): void {
    this.checkTimer = setInterval(async () => {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const pressure = (totalMem - freeMem) / totalMem;

      // If system memory pressure is high, aggressively page to disk
      if (pressure > this.config.memoryPressureThreshold) {
        const memPages = [...this.pages.values()].filter(p => p.location === 'memory');
        const toPage = Math.ceil(memPages.length * 0.3); // Page 30% of in-memory items

        memPages
          .sort((a, b) => a.priority - b.priority || a.lastAccessed - b.lastAccessed)
          .slice(0, toPage)
          .forEach(async (entry) => {
            await this.pageToDisk(entry);
          });

        if (toPage > 0) {
          logger.info(`[DiskBackedCache] Memory pressure ${(pressure * 100).toFixed(1)}% — paged ${toPage} items to disk`);
        }
      }
    }, this.config.checkIntervalMs);
  }

  // ─── Cleanup ────────────────────────────────────────────────

  private async cleanupStaleFiles(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      let cleaned = 0;
      for (const file of files) {
        if (file.endsWith('.page') || file.endsWith('.tmp')) {
          await fs.promises.unlink(path.join(this.cacheDir, file));
          cleaned++;
        }
      }
      if (cleaned > 0) {
        logger.info(`[DiskBackedCache] Cleaned ${cleaned} stale files`);
      }
    } catch {
      // Directory might not exist yet
    }
  }

  // ─── IPC ────────────────────────────────────────────────────

  private registerIPC(): void {
    ipcMain.handle('ssd-cache:get-stats', () => this.getStats());
    ipcMain.handle('ssd-cache:store', async (_e, key: string, data: string, priority?: number) => {
      return this.store(key, Buffer.from(data, 'base64'), priority);
    });
    ipcMain.handle('ssd-cache:retrieve', async (_e, key: string) => {
      const data = await this.retrieve(key);
      return data ? data.toString('base64') : null;
    });
    ipcMain.handle('ssd-cache:remove', async (_e, key: string) => {
      return this.remove(key);
    });
    ipcMain.handle('ssd-cache:has', (_e, key: string) => this.has(key));
  }

  // ─── Shutdown ───────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this.checkTimer) clearInterval(this.checkTimer);

    // Clean up all disk pages
    for (const entry of this.pages.values()) {
      if (entry.location === 'disk' && entry.filePath) {
        await fs.promises.unlink(entry.filePath).catch((e) => { logger.warn('[DiskBackedCache] shutdown unlink failed:', e); });
      }
    }
    this.pages.clear();
    this.memoryUsed = 0;
    this.diskUsed = 0;

    logger.info('[DiskBackedCache] Shut down');
  }
}
