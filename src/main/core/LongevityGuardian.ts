// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Longevity Guardian
// Phase 44: Long-run resource sanity, memory drift detection, flat usage over time
// ===========================================================================

import log from 'electron-log';
import Store from 'electron-store';
import { ipcMain } from 'electron';

// ===========================================================================
// TYPES
// ===========================================================================

export interface LongevityConfig {
  enabled: boolean;
  checkDuringIdleOnly: boolean;
  memoryDriftThresholdMB: number;
  orphanedTaskTimeoutMs: number;
  cacheCompactionIntervalMs: number;
  maxIdleWorkers: number;
}

export interface ResourceBaseline {
  capturedAt: number;
  heapUsedMB: number;
  externalMB: number;
  handleCount: number;
  activeTimers: number;
}

export interface DriftReport {
  baselineHeapMB: number;
  currentHeapMB: number;
  driftMB: number;
  driftPercent: number;
  isAcceptable: boolean;
  recommendation: string | null;
}

export interface LongevityStats {
  uptimeMs: number;
  checksPerformed: number;
  compactionsRun: number;
  orphansCleanedUp: number;
  memoryRecoveredMB: number;
  lastDriftReport: DriftReport | null;
}

export interface OrphanedTask {
  id: string;
  type: string;
  startedAt: number;
  lastActivity: number;
  status: 'running' | 'stalled' | 'orphaned';
}

// ===========================================================================
// STORE
// ===========================================================================

const longevityStore = new Store<{
  config: LongevityConfig;
  baseline: ResourceBaseline | null;
  stats: LongevityStats;
  lastCheck: number;
}>({
  name: 'longevity-guardian',
  defaults: {
    config: {
      enabled: true,
      checkDuringIdleOnly: true,
      memoryDriftThresholdMB: 100,
      orphanedTaskTimeoutMs: 5 * 60 * 1000,   // 5 minutes
      cacheCompactionIntervalMs: 30 * 60 * 1000, // 30 minutes
      maxIdleWorkers: 2,
    },
    baseline: null,
    stats: {
      uptimeMs: 0,
      checksPerformed: 0,
      compactionsRun: 0,
      orphansCleanedUp: 0,
      memoryRecoveredMB: 0,
      lastDriftReport: null,
    },
    lastCheck: 0,
  },
});

// ===========================================================================
// LONGEVITY GUARDIAN
// ===========================================================================

class LongevityGuardian {
  private static instance: LongevityGuardian;
  private initialized = false;
  private startTime: number = 0;
  private checkTimer: NodeJS.Timeout | null = null;
  private isIdle: boolean = false;
  private trackedTasks: Map<string, OrphanedTask> = new Map();
  private cacheCompactors: Set<() => Promise<number>> = new Set();

  private constructor() {}

  static getInstance(): LongevityGuardian {
    if (!LongevityGuardian.instance) {
      LongevityGuardian.instance = new LongevityGuardian();
    }
    return LongevityGuardian.instance;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.startTime = Date.now();
    this.setupIPC();

    // Capture baseline after short delay
    setTimeout(() => this.captureBaseline(), 5000);

    // Start periodic checks
    const config = longevityStore.get('config');
    if (config.enabled) {
      this.startPeriodicChecks();
    }

    this.initialized = true;
    log.info('[LongevityGuardian] Initialized');
  }

  private setupIPC(): void {
    ipcMain.handle('longevity:getConfig', () => this.getConfig());
    ipcMain.handle('longevity:updateConfig', (_, config) => this.updateConfig(config));
    ipcMain.handle('longevity:getStats', () => this.getStats());
    ipcMain.handle('longevity:getDriftReport', () => this.getDriftReport());
    ipcMain.handle('longevity:runCompaction', () => this.runCompaction());
    ipcMain.handle('longevity:captureBaseline', () => this.captureBaseline());
    ipcMain.handle('longevity:getOrphanedTasks', () => this.getOrphanedTasks());
    ipcMain.handle('longevity:cleanupOrphanedTasks', () => this.cleanupOrphanedTasks());
  }

  async shutdown(): Promise<void> {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // PERIODIC CHECKS (IDLE ONLY)
  // -------------------------------------------------------------------------

  private startPeriodicChecks(): void {
    const config = longevityStore.get('config');
    
    this.checkTimer = setInterval(() => {
      if (config.checkDuringIdleOnly && !this.isIdle) {
        return; // Skip if not idle
      }
      this.runPeriodicCheck();
    }, config.cacheCompactionIntervalMs);
  }

  private async runPeriodicCheck(): Promise<void> {
    const config = longevityStore.get('config');
    if (!config.enabled) return;

    log.info('[LongevityGuardian] Running periodic check');

    // Update stats
    const stats = longevityStore.get('stats');
    stats.checksPerformed++;
    stats.uptimeMs = Date.now() - this.startTime;

    // Check memory drift
    const drift = this.getDriftReport();
    stats.lastDriftReport = drift;

    // Run compaction if drift is high
    if (drift && !drift.isAcceptable) {
      const recovered = await this.runCompaction();
      stats.compactionsRun++;
      stats.memoryRecoveredMB += recovered;
    }

    // Clean up orphaned tasks
    const orphansRemoved = await this.cleanupOrphanedTasks();
    stats.orphansCleanedUp += orphansRemoved;

    longevityStore.set('stats', stats);
    longevityStore.set('lastCheck', Date.now());
  }

  setIdleState(idle: boolean): void {
    this.isIdle = idle;
  }

  // -------------------------------------------------------------------------
  // MEMORY DRIFT DETECTION
  // -------------------------------------------------------------------------

  async captureBaseline(): Promise<ResourceBaseline> {
    const usage = process.memoryUsage();
    
    const baseline: ResourceBaseline = {
      capturedAt: Date.now(),
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      externalMB: Math.round(usage.external / 1024 / 1024),
      handleCount: 0, // Would need OS-specific code
      activeTimers: 0,
    };

    longevityStore.set('baseline', baseline);
    log.info(`[LongevityGuardian] Baseline captured: ${baseline.heapUsedMB}MB heap`);

    return baseline;
  }

  getDriftReport(): DriftReport | null {
    const baseline = longevityStore.get('baseline');
    if (!baseline) return null;

    const config = longevityStore.get('config');
    const usage = process.memoryUsage();
    const currentHeapMB = Math.round(usage.heapUsed / 1024 / 1024);
    const driftMB = currentHeapMB - baseline.heapUsedMB;
    const driftPercent = baseline.heapUsedMB > 0 
      ? Math.round((driftMB / baseline.heapUsedMB) * 100) 
      : 0;

    const isAcceptable = driftMB <= config.memoryDriftThresholdMB;

    let recommendation: string | null = null;
    if (!isAcceptable) {
      if (driftMB > config.memoryDriftThresholdMB * 2) {
        recommendation = 'Consider restarting Dex to free memory';
      } else {
        recommendation = 'Running automatic compaction';
      }
    }

    return {
      baselineHeapMB: baseline.heapUsedMB,
      currentHeapMB,
      driftMB,
      driftPercent,
      isAcceptable,
      recommendation,
    };
  }

  // -------------------------------------------------------------------------
  // CACHE COMPACTION
  // -------------------------------------------------------------------------

  registerCacheCompactor(compactor: () => Promise<number>): () => void {
    this.cacheCompactors.add(compactor);
    return () => this.cacheCompactors.delete(compactor);
  }

  async runCompaction(): Promise<number> {
    log.info('[LongevityGuardian] Running compaction');

    let totalRecovered = 0;

    // Run registered compactors
    for (const compactor of this.cacheCompactors) {
      try {
        const recovered = await compactor();
        totalRecovered += recovered;
      } catch (error) {
        log.error('[LongevityGuardian] Compactor failed:', error);
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      const beforeGC = process.memoryUsage().heapUsed;
      global.gc();
      const afterGC = process.memoryUsage().heapUsed;
      const gcRecovered = Math.max(0, beforeGC - afterGC) / 1024 / 1024;
      totalRecovered += Math.round(gcRecovered);
    }

    log.info(`[LongevityGuardian] Compaction recovered ${totalRecovered}MB`);
    return totalRecovered;
  }

  // -------------------------------------------------------------------------
  // ORPHANED TASK CLEANUP
  // -------------------------------------------------------------------------

  trackTask(taskId: string, type: string): void {
    this.trackedTasks.set(taskId, {
      id: taskId,
      type,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      status: 'running',
    });
  }

  updateTaskActivity(taskId: string): void {
    const task = this.trackedTasks.get(taskId);
    if (task) {
      task.lastActivity = Date.now();
      task.status = 'running';
    }
  }

  completeTask(taskId: string): void {
    this.trackedTasks.delete(taskId);
  }

  getOrphanedTasks(): OrphanedTask[] {
    const config = longevityStore.get('config');
    const now = Date.now();
    const orphaned: OrphanedTask[] = [];

    for (const task of this.trackedTasks.values()) {
      const inactiveTime = now - task.lastActivity;
      
      if (inactiveTime > config.orphanedTaskTimeoutMs) {
        task.status = 'orphaned';
        orphaned.push(task);
      } else if (inactiveTime > config.orphanedTaskTimeoutMs / 2) {
        task.status = 'stalled';
        orphaned.push(task);
      }
    }

    return orphaned;
  }

  async cleanupOrphanedTasks(): Promise<number> {
    const orphaned = this.getOrphanedTasks().filter(t => t.status === 'orphaned');
    
    for (const task of orphaned) {
      log.info(`[LongevityGuardian] Cleaning up orphaned task: ${task.id}`);
      this.trackedTasks.delete(task.id);
    }

    return orphaned.length;
  }

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  getConfig(): LongevityConfig {
    return longevityStore.get('config');
  }

  async updateConfig(updates: Partial<LongevityConfig>): Promise<LongevityConfig> {
    const config = longevityStore.get('config');
    const updated = { ...config, ...updates };
    longevityStore.set('config', updated);
    return updated;
  }

  getStats(): LongevityStats {
    const stats = longevityStore.get('stats');
    stats.uptimeMs = Date.now() - this.startTime;
    return stats;
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  // -------------------------------------------------------------------------
  // GUARANTEES
  // -------------------------------------------------------------------------

  /**
   * Verify that performance has not degraded over time
   */
  async verifyPerformanceStability(): Promise<{
    stable: boolean;
    metrics: {
      memoryDrift: number;
      orphanedTasks: number;
      compactionsPending: boolean;
    };
  }> {
    const drift = this.getDriftReport();
    const orphaned = this.getOrphanedTasks();
    const config = longevityStore.get('config');

    return {
      stable: (drift?.isAcceptable ?? true) && orphaned.length === 0,
      metrics: {
        memoryDrift: drift?.driftMB ?? 0,
        orphanedTasks: orphaned.length,
        compactionsPending: drift ? !drift.isAcceptable : false,
      },
    };
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const longevityGuardian = LongevityGuardian.getInstance();
export default longevityGuardian;
