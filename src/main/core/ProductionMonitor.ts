// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX -- Production Monitor
// Health checks, performance baseline tracking, session digest.
// Runs in the main process. All telemetry stays local.
// ===========================================================================

import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface HealthSnapshot {
  timestamp: number;
  uptime: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage: {
    percentCPUUsage: number;
    idleWakeupsPerSecond: number;
  };
  systemMemory: {
    total: number;
    free: number;
    usedPercent: number;
  };
  windowCount: number;
  rendererResponsive: boolean;
}

interface PerformanceBaseline {
  startupTimeMs: number;
  averageMemoryMB: number;
  peakMemoryMB: number;
  averageCPUPercent: number;
  sessionCount: number;
  lastUpdated: number;
}

interface SessionDigest {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  peakMemoryMB: number;
  averageCPUPercent: number;
  healthCheckCount: number;
  warningCount: number;
  appVersion: string;
  platform: string;
}

interface MonitorConfig {
  healthCheckIntervalMs: number;
  maxSnapshots: number;
  maxDigests: number;
  memoryWarningThresholdMB: number;
  cpuWarningThresholdPercent: number;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DIGEST_FILE = 'session-digests.json';
const BASELINE_FILE = 'perf-baseline.json';

const DEFAULT_CONFIG: MonitorConfig = {
  healthCheckIntervalMs: 60000, // 60 seconds (was 30s)
  maxSnapshots: 120,
  maxDigests: 100,
  memoryWarningThresholdMB: 1536, // 1.5GB (was 1GB)
  cpuWarningThresholdPercent: 90, // 90% (was 80%)
};

// -----------------------------------------------------------------------------
// Production Monitor
// -----------------------------------------------------------------------------

export class ProductionMonitor {
  private config: MonitorConfig;
  private snapshots: HealthSnapshot[] = [];
  private baseline: PerformanceBaseline;
  private sessionId: string;
  private sessionStart: number;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private mainWindow: BrowserWindow | null = null;
  private warningCount = 0;
  private startupTimeMs = 0;
  private digestPath: string;
  private baselinePath: string;

  constructor(config?: Partial<MonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const userDataPath = app.getPath('userData');
    this.digestPath = path.join(userDataPath, DIGEST_FILE);
    this.baselinePath = path.join(userDataPath, BASELINE_FILE);
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessionStart = Date.now();
    this.baseline = this.loadBaseline();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // Baseline Persistence
  // -------------------------------------------------------------------------

  private loadBaseline(): PerformanceBaseline {
    try {
      if (fs.existsSync(this.baselinePath)) {
        return JSON.parse(fs.readFileSync(this.baselinePath, 'utf-8'));
      }
    } catch {
      log.warn('[ProductionMonitor] Baseline load failed, using defaults');
    }
    return {
      startupTimeMs: 0,
      averageMemoryMB: 0,
      peakMemoryMB: 0,
      averageCPUPercent: 0,
      sessionCount: 0,
      lastUpdated: 0,
    };
  }

  private saveBaseline(): void {
    try {
      fs.writeFileSync(this.baselinePath, JSON.stringify(this.baseline, null, 2));
    } catch (error) {
      log.error('[ProductionMonitor] Baseline save failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // Health Checks
  // -------------------------------------------------------------------------

  private takeSnapshot(): HealthSnapshot {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const snapshot: HealthSnapshot = {
      timestamp: Date.now(),
      uptime: process.uptime(),
      memoryUsage: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      cpuUsage: {
        percentCPUUsage: (cpu.user + cpu.system) / 1e6,
        idleWakeupsPerSecond: 0,
      },
      systemMemory: {
        total: totalMem,
        free: freeMem,
        usedPercent: ((totalMem - freeMem) / totalMem) * 100,
      },
      windowCount: BrowserWindow.getAllWindows().length,
      rendererResponsive: this.isRendererResponsive(),
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.config.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.config.maxSnapshots);
    }

    this.checkThresholds(snapshot);
    return snapshot;
  }

  private isRendererResponsive(): boolean {
    // If window not set yet, assume it's responsive (can't determine)
    if (!this.mainWindow) return true;
    if (this.mainWindow.isDestroyed()) return false;
    try {
      return !this.mainWindow.webContents.isCrashed();
    } catch {
      return false;
    }
  }

  private checkThresholds(snapshot: HealthSnapshot): void {
    const memMB = snapshot.memoryUsage.rss / (1024 * 1024);

    if (memMB > this.config.memoryWarningThresholdMB) {
      this.warningCount++;
      log.warn(`[ProductionMonitor] High memory usage: ${memMB.toFixed(0)}MB`);
      this.notifyRenderer('monitor:warning', {
        type: 'memory',
        value: memMB,
        threshold: this.config.memoryWarningThresholdMB,
      });
    }

    if (!snapshot.rendererResponsive) {
      this.warningCount++;
      log.warn('[ProductionMonitor] Renderer unresponsive');
      this.notifyRenderer('monitor:warning', {
        type: 'renderer-unresponsive',
      });
    }
  }

  // -------------------------------------------------------------------------
  // Session Digest
  // -------------------------------------------------------------------------

  private buildDigest(): SessionDigest {
    const now = Date.now();
    const durationMinutes = (now - this.sessionStart) / 60000;

    let peakMemory = 0;
    let totalCPU = 0;

    for (const snap of this.snapshots) {
      const memMB = snap.memoryUsage.rss / (1024 * 1024);
      if (memMB > peakMemory) peakMemory = memMB;
      totalCPU += snap.cpuUsage.percentCPUUsage;
    }

    const avgCPU = this.snapshots.length > 0 ? totalCPU / this.snapshots.length : 0;

    return {
      sessionId: this.sessionId,
      startedAt: this.sessionStart,
      endedAt: now,
      durationMinutes: Math.round(durationMinutes * 10) / 10,
      peakMemoryMB: Math.round(peakMemory),
      averageCPUPercent: Math.round(avgCPU * 100) / 100,
      healthCheckCount: this.snapshots.length,
      warningCount: this.warningCount,
      appVersion: app.getVersion(),
      platform: process.platform,
    };
  }

  private saveDigest(digest: SessionDigest): void {
    try {
      let digests: SessionDigest[] = [];
      if (fs.existsSync(this.digestPath)) {
        digests = JSON.parse(fs.readFileSync(this.digestPath, 'utf-8'));
      }
      digests.push(digest);
      if (digests.length > this.config.maxDigests) {
        digests = digests.slice(-this.config.maxDigests);
      }
      fs.writeFileSync(this.digestPath, JSON.stringify(digests, null, 2));
    } catch (error) {
      log.error('[ProductionMonitor] Digest save failed:', error);
    }
  }

  private updateBaseline(digest: SessionDigest): void {
    const n = this.baseline.sessionCount;
    this.baseline.averageMemoryMB = (this.baseline.averageMemoryMB * n + digest.peakMemoryMB) / (n + 1);
    this.baseline.averageCPUPercent = (this.baseline.averageCPUPercent * n + digest.averageCPUPercent) / (n + 1);
    if (digest.peakMemoryMB > this.baseline.peakMemoryMB) {
      this.baseline.peakMemoryMB = digest.peakMemoryMB;
    }
    if (this.startupTimeMs > 0) {
      this.baseline.startupTimeMs = (this.baseline.startupTimeMs * n + this.startupTimeMs) / (n + 1);
    }
    this.baseline.sessionCount = n + 1;
    this.baseline.lastUpdated = Date.now();
    this.saveBaseline();
  }

  // -------------------------------------------------------------------------
  // IPC
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    ipcMain.handle('monitor:getHealth', () => {
      return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : this.takeSnapshot();
    });

    ipcMain.handle('monitor:getSnapshots', (_e, limit?: number) => {
      const count = Math.min(limit || 30, this.snapshots.length);
      return this.snapshots.slice(-count);
    });

    ipcMain.handle('monitor:getBaseline', () => ({ ...this.baseline }));

    ipcMain.handle('monitor:getDigests', (_e, limit?: number) => {
      try {
        if (!fs.existsSync(this.digestPath)) return [];
        const digests: SessionDigest[] = JSON.parse(fs.readFileSync(this.digestPath, 'utf-8'));
        const count = Math.min(limit || 20, digests.length);
        return digests.slice(-count);
      } catch {
        return [];
      }
    });

    ipcMain.handle('monitor:getWarningCount', () => this.warningCount);
  }

  private notifyRenderer(channel: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  recordStartupTime(ms: number): void {
    this.startupTimeMs = ms;
    log.info(`[ProductionMonitor] Startup time: ${ms}ms`);
  }

  start(): void {
    this.takeSnapshot();
    this.healthTimer = setInterval(() => {
      this.takeSnapshot();
    }, this.config.healthCheckIntervalMs);
    log.info('[ProductionMonitor] Health monitoring started');
  }

  stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    const digest = this.buildDigest();
    this.saveDigest(digest);
    this.updateBaseline(digest);
    log.info(`[ProductionMonitor] Session ${this.sessionId} ended (${digest.durationMinutes}min, peak ${digest.peakMemoryMB}MB)`);
  }
}
