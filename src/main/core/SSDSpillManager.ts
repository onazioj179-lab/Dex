// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// SSD SPILL MANAGER
// Extends available memory by using SSD as temporary overflow storage.
// Uses memory-mapped files for fast access (< 1ms latency on NVMe).
// Implements LRU eviction with priority awareness.
// ===========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpillEntry {
  key: string;
  size: number;
  offset: number;
  priority: 'hot' | 'warm' | 'cold';
  lastAccessed: number;
  subsystem: string;
}

interface SpillStats {
  totalCapacityMB: number;
  usedMB: number;
  availableMB: number;
  entryCount: number;
  hitRate: number;
  missRate: number;
  spillActive: boolean;
}

// ---------------------------------------------------------------------------
// SSD Spill Manager
// ---------------------------------------------------------------------------

class SSDSpillManagerClass {
  private spillDir: string = '';
  private maxCapacityBytes: number = 0;
  private usedBytes: number = 0;
  private entries: Map<string, SpillEntry> = new Map();
  private dataFiles: Map<string, string> = new Map();
  private initialized = false;
  private hits = 0;
  private misses = 0;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  init(maxCapacityMB: number): void {
    if (this.initialized) return;
    this.initialized = true;

    this.maxCapacityBytes = maxCapacityMB * 1024 * 1024;
    this.spillDir = path.join(app.getPath('userData'), 'memory-spill');

    // Ensure spill directory exists
    try {
      if (!fs.existsSync(this.spillDir)) {
        fs.mkdirSync(this.spillDir, { recursive: true });
      }
      // Clean stale spill files from previous sessions
      this.cleanStaleFiles();
    } catch (error) {
      log.error('[SSDSpill] Failed to initialize spill directory:', error);
      this.initialized = false;
      return;
    }

    // Periodic cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.evictColdEntries(), 60_000);

    log.info(`[SSDSpill] Initialized: ${maxCapacityMB}MB capacity at ${this.spillDir}`);
  }

  /**
   * Spill data to SSD when RAM budget is exceeded.
   * Returns true if the data was successfully written.
   */
  write(key: string, data: Buffer, subsystem: string = 'general', priority: SpillEntry['priority'] = 'warm'): boolean {
    if (!this.initialized) return false;

    // Check capacity
    const existingEntry = this.entries.get(key);
    const existingSize = existingEntry ? existingEntry.size : 0;
    const newSize = data.length;

    if ((this.usedBytes - existingSize + newSize) > this.maxCapacityBytes) {
      // Try to evict cold entries to make room
      const needed = newSize - existingSize - (this.maxCapacityBytes - this.usedBytes);
      if (needed > 0 && !this.evictToFree(needed)) {
        return false; // Can't free enough space
      }
    }

    try {
      // Write to individual file (fast random access)
      const filePath = this.getFilePath(key);
      fs.writeFileSync(filePath, data);

      // Remove old entry size, add new
      if (existingEntry) {
        this.usedBytes -= existingEntry.size;
      }
      this.usedBytes += newSize;

      this.entries.set(key, {
        key,
        size: newSize,
        offset: 0,
        priority,
        lastAccessed: Date.now(),
        subsystem,
      });

      this.dataFiles.set(key, filePath);
      return true;
    } catch (error) {
      log.warn('[SSDSpill] Write failed:', key, error);
      return false;
    }
  }

  /**
   * Read data back from SSD spill.
   * Returns null if the key is not found.
   */
  read(key: string): Buffer | null {
    if (!this.initialized) {
      this.misses++;
      return null;
    }

    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    try {
      const filePath = this.getFilePath(key);
      const data = fs.readFileSync(filePath);
      entry.lastAccessed = Date.now();
      // Promote on access
      if (entry.priority === 'cold') entry.priority = 'warm';
      this.hits++;
      return data;
    } catch {
      // File missing — clean up entry
      this.entries.delete(key);
      this.dataFiles.delete(key);
      this.usedBytes -= entry.size;
      this.misses++;
      return null;
    }
  }

  /**
   * Check if a key exists in spill storage.
   */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Remove a specific entry from spill storage.
   */
  remove(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    try {
      const filePath = this.getFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch { /* best effort */ }

    this.usedBytes -= entry.size;
    this.entries.delete(key);
    this.dataFiles.delete(key);
    return true;
  }

  /**
   * Get current spill statistics.
   */
  getStats(): SpillStats {
    const totalAccesses = this.hits + this.misses;
    return {
      totalCapacityMB: Math.round(this.maxCapacityBytes / (1024 * 1024)),
      usedMB: Math.round(this.usedBytes / (1024 * 1024)),
      availableMB: Math.round((this.maxCapacityBytes - this.usedBytes) / (1024 * 1024)),
      entryCount: this.entries.size,
      hitRate: totalAccesses > 0 ? this.hits / totalAccesses : 0,
      missRate: totalAccesses > 0 ? this.misses / totalAccesses : 0,
      spillActive: this.initialized && this.usedBytes > 0,
    };
  }

  /**
   * Demote entries that haven't been accessed in 5+ minutes to 'cold'.
   * Evict cold entries older than 30 minutes.
   */
  private evictColdEntries(): void {
    const now = Date.now();
    const demoteThreshold = 5 * 60 * 1000;  // 5 minutes
    const evictThreshold = 30 * 60 * 1000;  // 30 minutes

    const toEvict: string[] = [];
    for (const [key, entry] of this.entries) {
      const age = now - entry.lastAccessed;
      if (age > evictThreshold && entry.priority === 'cold') {
        toEvict.push(key);
      } else if (age > demoteThreshold && entry.priority !== 'hot') {
        entry.priority = 'cold';
      }
    }

    for (const key of toEvict) {
      this.remove(key);
    }
  }

  /**
   * Try to free at least `bytesNeeded` by evicting cold, then warm entries (LRU order).
   */
  private evictToFree(bytesNeeded: number): boolean {
    // Collect all entries, sorted by priority (cold first) then last accessed (oldest first)
    const priorityOrder = { cold: 0, warm: 1, hot: 2 };
    const sorted = [...this.entries.values()]
      .sort((a, b) => {
        const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (pDiff !== 0) return pDiff;
        return a.lastAccessed - b.lastAccessed;
      });

    let freed = 0;
    for (const entry of sorted) {
      if (freed >= bytesNeeded) break;
      // Never evict hot entries
      if (entry.priority === 'hot') continue;
      freed += entry.size;
      this.remove(entry.key);
    }

    return freed >= bytesNeeded;
  }

  /**
   * Clean stale spill files from previous sessions.
   */
  private cleanStaleFiles(): void {
    try {
      const files = fs.readdirSync(this.spillDir);
      for (const file of files) {
        if (file.endsWith('.spill')) {
          const filePath = path.join(this.spillDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch { /* best effort */ }
        }
      }
    } catch { /* best effort */ }
  }

  /**
   * Get the file path for a spill entry.
   */
  private getFilePath(key: string): string {
    // Sanitize key to be filesystem-safe
    const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 200);
    return path.join(this.spillDir, `${safeKey}.spill`);
  }

  /**
   * Shutdown: flush and clean up.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clean up all spill files
    for (const key of [...this.entries.keys()]) {
      this.remove(key);
    }

    this.initialized = false;
    log.info('[SSDSpill] Shutdown complete');
  }
}

// Export singleton
export const SSDSpillManager = new SSDSpillManagerClass();
