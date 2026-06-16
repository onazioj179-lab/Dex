// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DiskBackedCache — DEPRECATED delegator (consolidation FINDING 11).
 *
 * Historically this provided SSD-based memory-to-disk paging as a second,
 * parallel disk cache layer. The consolidation audit collapses every persistent
 * disk cache into ONE tier owned by `CacheCoordinator` (backed by the merged
 * `DiskCache`, a 2GB LRU). This module is retained only as a thin, deprecated
 * shim so any remaining `ssd-cache:*` IPC wiring and existing callers keep
 * working against a stable surface — all real storage now lives in the single
 * `DiskCache` disk tier. Do not add new behavior here; use
 * `cacheCoordinator.getDiskTier()` directly.
 *
 * Semantics preserved for the public surface:
 *  - store/retrieve/remove/has round-trip Buffers through the disk tier.
 *  - LRU + 2GB size budget come from the underlying DiskCache.
 *  - The `priority` argument is accepted for compatibility but no longer drives
 *    a separate in-memory page pool (there is only one disk tier now).
 */

import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import * as os from 'os';
import { Logger } from '../utils/Logger';
import { cacheCoordinator } from './CacheCoordinator';
import type { DiskCache } from './DiskCache';

const logger = new Logger();

export interface DiskBackedCacheConfig {
  /** Max RAM to use before paging to disk (MB) — retained for API compatibility. */
  maxMemoryMB: number;
  /** Max disk space to use (MB) — retained for API compatibility. */
  maxDiskMB: number;
  /** Memory usage % that triggers paging — retained for API compatibility. */
  memoryPressureThreshold: number;
  /** Check memory pressure interval (ms) — retained for API compatibility. */
  checkIntervalMs: number;
  /** Disk cache directory — retained for API compatibility. */
  cacheDir?: string;
}

const DEFAULT_CONFIG: DiskBackedCacheConfig = {
  maxMemoryMB: 512,
  maxDiskMB: 4096,
  memoryPressureThreshold: 0.85,
  checkIntervalMs: 10000,
};

/** Namespace disk-tier keys so this shim never collides with other disk users. */
const KEY_PREFIX = 'ssd-swap:';

/**
 * @deprecated Use `cacheCoordinator.getDiskTier()`. This class delegates to the
 * single consolidated disk tier and exists only for backward compatibility.
 */
export class DiskBackedCache {
  private config: DiskBackedCacheConfig;
  // Track keys this shim owns so getStats() can report a meaningful entry count.
  private keys = new Set<string>();

  constructor(config: Partial<DiskBackedCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private async tier(): Promise<DiskCache> {
    return cacheCoordinator.getDiskTier();
  }

  async initialize(): Promise<void> {
    // Materialize the shared disk tier; no separate directory or monitor.
    await this.tier();
    this.registerIPC();
    logger.success('[DiskBackedCache] Ready (delegating to consolidated disk tier)');
  }

  // ─── Core Operations ────────────────────────────────────────

  /**
   * Store data in the consolidated disk tier. Returns a synthetic id for
   * backward compatibility (the disk tier is keyed, not id-addressed).
   */
  async store(key: string, data: Buffer, _priority = 5): Promise<string> {
    const tier = await this.tier();
    await tier.put(KEY_PREFIX + key, data);
    this.keys.add(key);
    return crypto.randomUUID();
  }

  /** Retrieve data from the consolidated disk tier. */
  async retrieve(key: string): Promise<Buffer | null> {
    const tier = await this.tier();
    return tier.get(KEY_PREFIX + key);
  }

  async remove(key: string): Promise<boolean> {
    const tier = await this.tier();
    this.keys.delete(key);
    return tier.delete(KEY_PREFIX + key);
  }

  has(key: string): boolean {
    // Synchronous compatibility check against the underlying tier when available.
    const tier = cacheCoordinator._diskTierForDelegation();
    return tier.has(KEY_PREFIX + key);
  }

  getStats() {
    const tier = cacheCoordinator._diskTierForDelegation();
    const diskStats = tier.getStats();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Shape preserved from the legacy paging cache; all storage is now on disk,
    // so memory-tier figures report zero.
    return {
      totalEntries: this.keys.size,
      memoryEntries: 0,
      diskEntries: this.keys.size,
      memoryUsedMB: 0,
      diskUsedMB: diskStats.totalSizeMB,
      maxMemoryMB: this.config.maxMemoryMB,
      maxDiskMB: this.config.maxDiskMB,
      systemMemoryUsedPercent: +(((totalMem - freeMem) / totalMem) * 100).toFixed(1),
      systemFreeMemoryMB: +(freeMem / 1048576).toFixed(0),
    };
  }

  // ─── IPC ────────────────────────────────────────────────────

  private registerIPC(): void {
    // Idempotent registration so repeated initialize() calls never throw.
    const handle = (channel: string, fn: Parameters<typeof ipcMain.handle>[1]) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, fn);
    };

    handle('ssd-cache:get-stats', () => this.getStats());
    handle('ssd-cache:store', async (_e, key: string, data: string, priority?: number) => {
      return this.store(key, Buffer.from(data, 'base64'), priority);
    });
    handle('ssd-cache:retrieve', async (_e, key: string) => {
      const data = await this.retrieve(key);
      return data ? data.toString('base64') : null;
    });
    handle('ssd-cache:remove', async (_e, key: string) => {
      return this.remove(key);
    });
    handle('ssd-cache:has', (_e, key: string) => this.has(key));
  }

  // ─── Shutdown ───────────────────────────────────────────────

  async shutdown(): Promise<void> {
    // The shared disk tier is owned (and shut down) by CacheCoordinator; this
    // shim only drops its own bookkeeping. Entries persist as part of the LRU.
    this.keys.clear();
    logger.info('[DiskBackedCache] Shut down (disk tier owned by CacheCoordinator)');
  }
}
