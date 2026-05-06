// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Memory Budget Service
// ==========================================================================
// Tracks allocation per process and per worker. Every process reports its
// heap usage every 10 seconds via IPC. The service computes total DEX memory
// consumption and compares against the tier budget, emitting pressure events.
// ==========================================================================

import { ipcMain, BrowserWindow, app } from 'electron';
import * as log from 'electron-log';
import {
  hardwareDetector,
  MemoryBudgets,
  CapabilityTierName,
} from './HardwareDetector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryPressureLevel = 'normal' | 'moderate' | 'high' | 'critical' | 'emergency';

export interface ProcessMemoryReport {
  processId: string;
  category: 'main' | 'renderer' | 'worker' | 'game';
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  timestamp: number;
}

export interface MemoryBudgetSnapshot {
  tier: CapabilityTierName;
  budgets: MemoryBudgets;
  totalUsedMB: number;
  budgetUsedPercent: number;
  pressureLevel: MemoryPressureLevel;
  processes: ProcessMemoryReport[];
}

export type MemoryPressureHandler = (level: MemoryPressureLevel) => void;

// ---------------------------------------------------------------------------
// Memory Budget Service
// ---------------------------------------------------------------------------

class MemoryBudgetService {
  private processReports = new Map<string, ProcessMemoryReport>();
  private pressureLevel: MemoryPressureLevel = 'normal';
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private pressureHandlers: MemoryPressureHandler[] = [];
  private mainWindow: BrowserWindow | null = null;
  private started = false;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(win: BrowserWindow): void {
    if (this.started) return;
    this.started = true;
    this.mainWindow = win;
    this.registerIPC();
    this.checkInterval = setInterval(() => this.evaluatePressure(), 10_000);
    this.reportMainProcess();
    log.info('[MemoryBudget] Started');
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.started = false;
    log.info('[MemoryBudget] Stopped');
  }

  onPressureChange(handler: MemoryPressureHandler): () => void {
    this.pressureHandlers.push(handler);
    return () => {
      this.pressureHandlers = this.pressureHandlers.filter(h => h !== handler);
    };
  }

  getPressureLevel(): MemoryPressureLevel {
    return this.pressureLevel;
  }

  getSnapshot(): MemoryBudgetSnapshot {
    const tier = hardwareDetector.getTier();
    const budgets = hardwareDetector.getMemoryBudgets();
    const processes = Array.from(this.processReports.values());
    const totalUsedMB = processes.reduce((sum, p) => sum + p.heapUsedMB, 0);
    const budgetUsedPercent = budgets.totalBudgetMB > 0
      ? Math.round((totalUsedMB / budgets.totalBudgetMB) * 100)
      : 0;

    return {
      tier,
      budgets,
      totalUsedMB,
      budgetUsedPercent,
      pressureLevel: this.pressureLevel,
      processes,
    };
  }

  // -----------------------------------------------------------------------
  // IPC
  // -----------------------------------------------------------------------

  private registerIPC(): void {
    ipcMain.on('memory:report', (_, report: ProcessMemoryReport) => {
      this.processReports.set(report.processId, report);
    });

    ipcMain.handle('memory:getSnapshot', async () => {
      return this.getSnapshot();
    });

    ipcMain.handle('memory:getPressure', async () => {
      return this.pressureLevel;
    });
  }

  // -----------------------------------------------------------------------
  // Main process self-report
  // -----------------------------------------------------------------------

  private reportMainProcess(): void {
    const report = () => {
      const mem = process.memoryUsage();
      this.processReports.set('main', {
        processId: 'main',
        category: 'main',
        heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
        rssMB: Math.round(mem.rss / (1024 * 1024)),
        timestamp: Date.now(),
      });
    };
    report();
    setInterval(report, 10_000);
  }

  // -----------------------------------------------------------------------
  // Pressure evaluation
  // -----------------------------------------------------------------------

  private evaluatePressure(): void {
    const snapshot = this.getSnapshot();
    const pct = snapshot.budgetUsedPercent;

    let newLevel: MemoryPressureLevel = 'normal';
    if (pct >= 100) {
      newLevel = 'emergency';
    } else if (pct >= 95) {
      newLevel = 'critical';
    } else if (pct >= 90) {
      newLevel = 'high';
    } else if (pct >= 80) {
      newLevel = 'moderate';
    }

    if (newLevel !== this.pressureLevel) {
      const prev = this.pressureLevel;
      this.pressureLevel = newLevel;
      log.info(`[MemoryBudget] Pressure changed: ${prev} -> ${newLevel} (${pct}% of ${snapshot.budgets.totalBudgetMB}MB)`);
      this.broadcast(newLevel);
    }

    this.pruneStaleReports();

    if (newLevel === 'emergency') {
      this.emergencyRecovery();
    }
  }

  private pruneStaleReports(): void {
    const cutoff = Date.now() - 60_000;
    for (const [id, report] of this.processReports) {
      if (report.timestamp < cutoff && id !== 'main') {
        this.processReports.delete(id);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Broadcast pressure to renderer
  // -----------------------------------------------------------------------

  private broadcast(level: MemoryPressureLevel): void {
    for (const handler of this.pressureHandlers) {
      try { handler(level); } catch (e) { log.warn('[MemoryBudget] Handler error:', e); }
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('dex:memory-pressure', { level, timestamp: Date.now() });
    }
  }

  // -----------------------------------------------------------------------
  // Emergency recovery
  // -----------------------------------------------------------------------

  private emergencyRecovery(): void {
    log.warn('[MemoryBudget] Emergency memory recovery initiated');

    if (typeof (global as any).gc === 'function') {
      (global as any).gc();
    } else {
      try {
        const large = Buffer.alloc(50 * 1024 * 1024);
        large.fill(0);
      } catch { /* ignore */ }
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('dex:memory-emergency', {
        message: 'DEX reduced its memory usage because your system is running low.',
        timestamp: Date.now(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const memoryBudget = new MemoryBudgetService();
