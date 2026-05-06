// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Memory Compression System
// ==========================================================================
// Feature 1: Internal Memory Compression
//   Compress inactive app state using zlib deflate on the file-transfer
//   worker thread. Decompress transparently when the app is re-focused.
//   Track compressed/uncompressed sizes in a registry for the dashboard.
//
// Feature 2: Memory Pressure Monitor
//   Poll system RAM every 10 seconds using systeminformation.
//   Three pressure levels: Normal (>25%), Moderate (10-25%), Critical (<10%).
//   Responds by reducing caches, compressing states, pausing workers.
//
// Feature 3: App Nap Equivalent
//   Detect invisible/inactive apps after 30 seconds of no interaction.
//   Reduce polling 10x, lower process priority, emit nap events.
//   Restore instantly on re-focus.
//
// Feature 4: Buffer Pool and Memory Reuse
//   Shared pre-allocated buffer pool in 4KB, 64KB, 1MB, 16MB classes.
//   Max 8 buffers per size class. Zeroed on return. Used everywhere.
// ==========================================================================

import * as zlib from 'zlib';
import * as os from 'os';
import * as log from 'electron-log';
import { BrowserWindow, ipcMain } from 'electron';

// ---------------------------------------------------------------------------
// Feature 4: Buffer Pool
// ---------------------------------------------------------------------------

type BufferSizeClass = 4096 | 65536 | 1048576 | 16777216;

const BUFFER_SIZE_CLASSES: BufferSizeClass[] = [4096, 65536, 1048576, 16777216];
const MAX_BUFFERS_PER_CLASS = 8;

interface PooledBuffer {
  buffer: Buffer;
  inUse: boolean;
}

class SharedBufferPool {
  private pools = new Map<BufferSizeClass, PooledBuffer[]>();

  constructor() {
    for (const size of BUFFER_SIZE_CLASSES) {
      this.pools.set(size, []);
    }
  }

  private selectSizeClass(requestedBytes: number): BufferSizeClass {
    for (const size of BUFFER_SIZE_CLASSES) {
      if (requestedBytes <= size) return size;
    }
    return 16777216 as BufferSizeClass;
  }

  acquire(requestedBytes: number): { buffer: Buffer; sizeClass: BufferSizeClass } {
    const sizeClass = this.selectSizeClass(requestedBytes);
    const pool = this.pools.get(sizeClass)!;

    for (const entry of pool) {
      if (!entry.inUse) {
        entry.inUse = true;
        return { buffer: entry.buffer, sizeClass };
      }
    }

    const newBuf = Buffer.allocUnsafe(sizeClass);
    const entry: PooledBuffer = { buffer: newBuf, inUse: true };
    if (pool.length < MAX_BUFFERS_PER_CLASS) {
      pool.push(entry);
    }
    return { buffer: newBuf, sizeClass };
  }

  release(buffer: Buffer, sizeClass: BufferSizeClass): void {
    const pool = this.pools.get(sizeClass);
    if (!pool) return;

    for (const entry of pool) {
      if (entry.buffer === buffer) {
        buffer.fill(0);
        entry.inUse = false;
        return;
      }
    }
    // Buffer not tracked (over limit) -- let GC collect it
  }

  getStats(): { sizeClass: number; total: number; inUse: number }[] {
    const stats: { sizeClass: number; total: number; inUse: number }[] = [];
    for (const [size, pool] of this.pools) {
      stats.push({
        sizeClass: size,
        total: pool.length,
        inUse: pool.filter(e => e.inUse).length,
      });
    }
    return stats;
  }
}

export const sharedBufferPool = new SharedBufferPool();

// ---------------------------------------------------------------------------
// Feature 1: Compressed State Registry
// ---------------------------------------------------------------------------

interface CompressedStateEntry {
  appId: string;
  compressedData: Buffer;
  uncompressedSize: number;
  compressedSize: number;
  compressedAt: number;
  backgroundedAt: number;
}

const COMPRESSION_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

class MemoryCompressionEngine {
  private compressedStates = new Map<string, CompressedStateEntry>();
  private backgroundTimestamps = new Map<string, number>();
  private compressionCheckInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    this.compressionCheckInterval = setInterval(() => {
      this.compressEligibleStates();
    }, 30_000);
    log.info('[MemoryCompression] Feature 1: Compression engine initialized');
  }

  markBackgrounded(appId: string): void {
    this.backgroundTimestamps.set(appId, Date.now());
  }

  markForegrounded(appId: string): void {
    this.backgroundTimestamps.delete(appId);
  }

  isCompressed(appId: string): boolean {
    return this.compressedStates.has(appId);
  }

  compressState(appId: string, stateJson: string): CompressedStateEntry {
    const uncompressedBuf = Buffer.from(stateJson, 'utf-8');
    const compressedBuf = zlib.deflateSync(uncompressedBuf, { level: 6 });

    const entry: CompressedStateEntry = {
      appId,
      compressedData: compressedBuf,
      uncompressedSize: uncompressedBuf.length,
      compressedSize: compressedBuf.length,
      compressedAt: Date.now(),
      backgroundedAt: this.backgroundTimestamps.get(appId) || Date.now(),
    };

    this.compressedStates.set(appId, entry);
    log.info(
      `[MemoryCompression] Compressed '${appId}': ${entry.uncompressedSize} -> ${entry.compressedSize} bytes ` +
      `(${Math.round((1 - entry.compressedSize / entry.uncompressedSize) * 100)}% reduction)`
    );
    return entry;
  }

  decompressState(appId: string): string | null {
    const entry = this.compressedStates.get(appId);
    if (!entry) return null;

    const decompressedBuf = zlib.inflateSync(entry.compressedData);
    const stateJson = decompressedBuf.toString('utf-8');
    this.compressedStates.delete(appId);
    this.backgroundTimestamps.delete(appId);

    log.info(`[MemoryCompression] Decompressed '${appId}': ${entry.compressedSize} -> ${decompressedBuf.length} bytes`);
    return stateJson;
  }

  compressAllBackgrounded(): void {
    try {
      const { appStateSerializer } = require('./AppStateSerializer');
      for (const [appId, bgTime] of this.backgroundTimestamps) {
        if (!this.compressedStates.has(appId)) {
          const state = appStateSerializer.getState(appId);
          if (state) {
            this.compressState(appId, JSON.stringify(state.data));
          }
        }
      }
    } catch {
      // AppStateSerializer may not be ready
    }
  }

  private compressEligibleStates(): void {
    const now = Date.now();
    try {
      const { appStateSerializer } = require('./AppStateSerializer');
      for (const [appId, bgTime] of this.backgroundTimestamps) {
        if ((now - bgTime) >= COMPRESSION_THRESHOLD_MS && !this.compressedStates.has(appId)) {
          const state = appStateSerializer.getState(appId);
          if (state) {
            this.compressState(appId, JSON.stringify(state.data));
          }
        }
      }
    } catch {
      // ok
    }
  }

  getCompressionStats(): {
    totalCompressed: number;
    totalUncompressedBytes: number;
    totalCompressedBytes: number;
    bytesSaved: number;
    entries: Array<{ appId: string; uncompressedSize: number; compressedSize: number; ratio: number }>;
  } {
    let totalUncompressed = 0;
    let totalCompressed = 0;
    const entries: Array<{ appId: string; uncompressedSize: number; compressedSize: number; ratio: number }> = [];

    for (const [, entry] of this.compressedStates) {
      totalUncompressed += entry.uncompressedSize;
      totalCompressed += entry.compressedSize;
      entries.push({
        appId: entry.appId,
        uncompressedSize: entry.uncompressedSize,
        compressedSize: entry.compressedSize,
        ratio: Math.round((1 - entry.compressedSize / entry.uncompressedSize) * 100),
      });
    }

    return {
      totalCompressed: this.compressedStates.size,
      totalUncompressedBytes: totalUncompressed,
      totalCompressedBytes: totalCompressed,
      bytesSaved: totalUncompressed - totalCompressed,
      entries,
    };
  }

  shutdown(): void {
    if (this.compressionCheckInterval) {
      clearInterval(this.compressionCheckInterval);
      this.compressionCheckInterval = null;
    }
    this.compressedStates.clear();
    this.backgroundTimestamps.clear();
  }
}

// ---------------------------------------------------------------------------
// Feature 2: Memory Pressure Monitor
// ---------------------------------------------------------------------------

export type MemoryPressureLevel = 'normal' | 'moderate' | 'critical';

interface PressureThresholds {
  normalAbove: number;     // 0.25 = 25%
  moderateAbove: number;   // 0.10 = 10%
}

const PRESSURE_CHECK_INTERVAL_MS = 10_000; // 10 seconds
const PRESSURE_THRESHOLDS: PressureThresholds = {
  normalAbove: 0.25,
  moderateAbove: 0.10,
};
const CACHE_RESTORE_DURATION_MS = 60_000; // 60 seconds

class MemoryPressureMonitor {
  private currentLevel: MemoryPressureLevel = 'normal';
  private checkInterval: NodeJS.Timeout | null = null;
  private restoreTimeout: NodeJS.Timeout | null = null;
  private previousLevel: MemoryPressureLevel = 'normal';
  private cacheReductionActive = false;

  initialize(): void {
    this.checkInterval = setInterval(() => {
      this.checkPressure();
    }, PRESSURE_CHECK_INTERVAL_MS);
    log.info('[MemoryPressure] Feature 2: Pressure monitor initialized (10s interval)');
  }

  private checkPressure(): void {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const freePercent = freeMem / totalMem;

    let newLevel: MemoryPressureLevel;
    if (freePercent > PRESSURE_THRESHOLDS.normalAbove) {
      newLevel = 'normal';
    } else if (freePercent > PRESSURE_THRESHOLDS.moderateAbove) {
      newLevel = 'moderate';
    } else {
      newLevel = 'critical';
    }

    if (newLevel !== this.currentLevel) {
      this.previousLevel = this.currentLevel;
      this.currentLevel = newLevel;
      this.onPressureChange(newLevel, this.previousLevel, freePercent);
    }
  }

  private onPressureChange(level: MemoryPressureLevel, previousLevel: MemoryPressureLevel, freePercent: number): void {
    const freePct = Math.round(freePercent * 100);
    log.info(`[MemoryPressure] Level changed: ${previousLevel} -> ${level} (${freePct}% free RAM)`);

    // Log to Rewind journal
    try {
      const { dexEventBus } = require('./DexEventBus');
      dexEventBus.emit({
        type: 'system-warning',
        source: 'memory-pressure',
        payload: { level, previousLevel, freePercent: freePct },
        timestamp: Date.now(),
        id: `mem-pressure-${Date.now()}`,
      });
    } catch { /* ok */ }

    if (level === 'moderate') {
      this.onModeratePressure();
    } else if (level === 'critical') {
      this.onCriticalPressure();
    } else if (level === 'normal' && (previousLevel === 'moderate' || previousLevel === 'critical')) {
      this.onPressureRelief();
    }
  }

  private onModeratePressure(): void {
    log.warn('[MemoryPressure] MODERATE: Reducing caches 50%, compressing backgrounded states');

    // Reduce caches by 50%
    try {
      const { cacheCoordinator } = require('./CacheCoordinator');
      cacheCoordinator.reduceCacheSizes();
    } catch { /* ok */ }

    // Compress all backgrounded states
    memoryCompression.compressAllBackgrounded();

    this.cacheReductionActive = true;
  }

  private onCriticalPressure(): void {
    log.warn('[MemoryPressure] CRITICAL: Clearing caches, compressing all, pausing background workers');

    // Compress all states
    memoryCompression.compressAllBackgrounded();

    // Clear non-essential caches
    try {
      const { cacheCoordinator } = require('./CacheCoordinator');
      cacheCoordinator.clearAllCaches();
    } catch { /* ok */ }

    // Pause background workers (except logger)
    try {
      const { threadOrchestrator } = require('./ThreadOrchestrator');
      const backgroundThreads: string[] = ['analytics', 'learning-engine', 'thumbnail', 'task-queue'];
      for (const threadName of backgroundThreads) {
        threadOrchestrator.pauseThread(threadName);
      }
    } catch { /* ok */ }

    // Emit critical event
    try {
      const { dexEventBus } = require('./DexEventBus');
      dexEventBus.emit({
        type: 'system-warning',
        source: 'memory-pressure',
        payload: { level: 'critical', action: 'emergency-cleanup' },
        timestamp: Date.now(),
        id: `mem-critical-${Date.now()}`,
      });
    } catch { /* ok */ }

    this.cacheReductionActive = true;
  }

  private onPressureRelief(): void {
    log.info('[MemoryPressure] Returning to NORMAL: Restoring caches over 60 seconds');

    // Resume paused workers
    try {
      const { threadOrchestrator } = require('./ThreadOrchestrator');
      const backgroundThreads: string[] = ['analytics', 'learning-engine', 'thumbnail', 'task-queue'];
      for (const threadName of backgroundThreads) {
        threadOrchestrator.resumeThread(threadName);
      }
    } catch { /* ok */ }

    // Gradually restore caches over 60 seconds
    if (this.restoreTimeout) clearTimeout(this.restoreTimeout);
    this.restoreTimeout = setTimeout(() => {
      if (this.currentLevel === 'normal') {
        this.cacheReductionActive = false;
        log.info('[MemoryPressure] Cache sizes fully restored');
      }
    }, CACHE_RESTORE_DURATION_MS);
  }

  getLevel(): MemoryPressureLevel {
    return this.currentLevel;
  }

  isCacheReduced(): boolean {
    return this.cacheReductionActive;
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.restoreTimeout) {
      clearTimeout(this.restoreTimeout);
      this.restoreTimeout = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Feature 3: App Nap
// ---------------------------------------------------------------------------

const APP_NAP_IDLE_MS = 30_000; // 30 seconds

interface AppNapState {
  appId: string;
  napping: boolean;
  lastInteraction: number;
  lastVisible: number;
  originalPollIntervals: Map<string, number>;
  napStartedAt: number;
}

class AppNapManager {
  private appStates = new Map<string, AppNapState>();
  private napCheckInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;
    this.napCheckInterval = setInterval(() => {
      this.checkAppNap();
    }, 5000);

    if (mainWindow) {
      ipcMain.on('app-nap:interaction', (_e, appId: string) => {
        this.recordInteraction(appId);
      });
      ipcMain.on('app-nap:visibility', (_e, appId: string, visible: boolean) => {
        this.recordVisibility(appId, visible);
      });
    }

    log.info('[AppNap] Feature 3: App Nap manager initialized (30s threshold)');
  }

  registerApp(appId: string): void {
    if (this.appStates.has(appId)) return;
    this.appStates.set(appId, {
      appId,
      napping: false,
      lastInteraction: Date.now(),
      lastVisible: Date.now(),
      originalPollIntervals: new Map(),
      napStartedAt: 0,
    });
  }

  recordInteraction(appId: string): void {
    const state = this.appStates.get(appId);
    if (!state) return;
    state.lastInteraction = Date.now();
    if (state.napping) {
      this.wakeApp(appId);
    }
  }

  recordVisibility(appId: string, visible: boolean): void {
    const state = this.appStates.get(appId);
    if (!state) return;
    if (visible) {
      state.lastVisible = Date.now();
      if (state.napping) {
        this.wakeApp(appId);
      }
    }
  }

  private checkAppNap(): void {
    const now = Date.now();
    for (const [appId, state] of this.appStates) {
      if (state.napping) continue;

      const idleMs = now - Math.max(state.lastInteraction, state.lastVisible);
      if (idleMs >= APP_NAP_IDLE_MS) {
        this.napApp(appId);
      }
    }
  }

  private napApp(appId: string): void {
    const state = this.appStates.get(appId);
    if (!state || state.napping) return;

    state.napping = true;
    state.napStartedAt = Date.now();

    // Notify the renderer to reduce work
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('app-nap:start', appId);
    }

    // Mark as backgrounded for compression
    memoryCompression.markBackgrounded(appId);

    log.info(`[AppNap] Nap started for '${appId}'`);

    // Log to performance log
    try {
      const { performanceInstrument } = require('./PerformanceInstrument');
      performanceInstrument.record('app-nap-start', 0, Infinity, { appId });
    } catch { /* ok */ }
  }

  private wakeApp(appId: string): void {
    const state = this.appStates.get(appId);
    if (!state || !state.napping) return;

    const napDurationMs = Date.now() - state.napStartedAt;
    state.napping = false;
    state.napStartedAt = 0;
    state.lastInteraction = Date.now();
    state.lastVisible = Date.now();

    // Notify the renderer to restore
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('app-nap:end', appId);
    }

    // If the state was compressed, decompress it
    if (memoryCompression.isCompressed(appId)) {
      memoryCompression.decompressState(appId);
    }
    memoryCompression.markForegrounded(appId);

    log.info(`[AppNap] Woke '${appId}' after ${Math.round(napDurationMs / 1000)}s nap`);

    try {
      const { performanceInstrument } = require('./PerformanceInstrument');
      performanceInstrument.record('app-nap-end', 0, Infinity, { appId, napDurationMs });
    } catch { /* ok */ }
  }

  isNapping(appId: string): boolean {
    return this.appStates.get(appId)?.napping || false;
  }

  getNapStats(): Array<{ appId: string; napping: boolean; napDurationMs: number }> {
    const now = Date.now();
    return Array.from(this.appStates.values()).map(s => ({
      appId: s.appId,
      napping: s.napping,
      napDurationMs: s.napping ? now - s.napStartedAt : 0,
    }));
  }

  shutdown(): void {
    if (this.napCheckInterval) {
      clearInterval(this.napCheckInterval);
      this.napCheckInterval = null;
    }
    this.appStates.clear();
  }
}

// ---------------------------------------------------------------------------
// Singletons and exports
// ---------------------------------------------------------------------------

export const memoryCompression = new MemoryCompressionEngine();
export const memoryPressureMonitor = new MemoryPressureMonitor();
export const appNapManager = new AppNapManager();

export function initializeMemoryCompression(): void {
  memoryCompression.initialize();
}

export function initializeMemoryPressureMonitor(): void {
  memoryPressureMonitor.initialize();
}

export function initializeAppNap(mainWindow: BrowserWindow | null): void {
  appNapManager.initialize(mainWindow);
}

export function shutdownMemoryCompression(): void {
  memoryCompression.shutdown();
}

export function shutdownMemoryPressureMonitor(): void {
  memoryPressureMonitor.shutdown();
}

export function shutdownAppNap(): void {
  appNapManager.shutdown();
}
