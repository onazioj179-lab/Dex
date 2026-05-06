// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Watchdog Controller
// Phase 10: Internal self-monitoring for long-term stability
// ===========================================================================

import { BrowserWindow, ipcMain, app } from 'electron';
import { Logger } from '../utils/Logger';

interface HealthStatus {
  healthy: boolean;
  lastCheck: number;
  memoryUsage: number;
  cpuUsage: number;
  uptime: number;
  errors: string[];
  warnings: string[];
}

interface WatchdogConfig {
  checkIntervalMs: number;
  maxMemoryMB: number;
  maxCpuPercent: number;
  errorThreshold: number;
}

class WatchdogController {
  private logger: Logger;
  private config: WatchdogConfig;
  private health: HealthStatus;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private errorCount = 0;
  private startTime: number;
  private recentErrors: string[] = [];

  constructor() {
    this.logger = new Logger();
    this.startTime = Date.now();
    this.config = {
      checkIntervalMs: 60000, // OPTIMIZED: Check every 60 seconds (was 30)
      maxMemoryMB: 400,       // STRICT: Alert if Dex uses > 400MB (was 300)
      maxCpuPercent: 25,      // STRICT: Alert if Dex uses > 25% CPU sustained (was 50)
      errorThreshold: 5,      // STRICT: Warn if more than 5 errors in session (was 10)
    };
    this.health = {
      healthy: true,
      lastCheck: Date.now(),
      memoryUsage: 0,
      cpuUsage: 0,
      uptime: 0,
      errors: [],
      warnings: [],
    };
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Get health status
    ipcMain.handle('watchdog:health', async () => {
      return this.getHealth();
    });

    // Force health check
    ipcMain.handle('watchdog:check', async () => {
      return await this.runHealthCheck();
    });

    // Get diagnostics
    ipcMain.handle('watchdog:diagnostics', async () => {
      return this.getDiagnostics();
    });

    // Clear errors
    ipcMain.handle('watchdog:clearErrors', async () => {
      this.recentErrors = [];
      this.errorCount = 0;
      return { success: true };
    });

    this.logger.info('Watchdog handlers registered');
  }

  start(): void {
    if (this.checkInterval) return;

    this.logger.info('Watchdog started - monitoring system health');
    
    // Initial check
    this.runHealthCheck();

    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthCheck();
    }, this.config.checkIntervalMs);

    // Listen for uncaught errors in main process
    process.on('uncaughtException', (error) => {
      this.recordError(`Uncaught exception: ${error.message}`);
    });

    process.on('unhandledRejection', (reason) => {
      this.recordError(`Unhandled rejection: ${String(reason)}`);
    });
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.logger.info('Watchdog stopped');
  }

  private async runHealthCheck(): Promise<HealthStatus> {
    const now = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    // Memory check
    const memoryUsage = process.memoryUsage();
    const memoryMB = memoryUsage.heapUsed / (1024 * 1024);

    if (memoryMB > this.config.maxMemoryMB) {
      warnings.push(`High memory usage: ${memoryMB.toFixed(0)}MB`);
    }

    // CPU check (estimated from event loop)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000 * 100;

    // Error count check
    if (this.errorCount > this.config.errorThreshold) {
      warnings.push(`High error count: ${this.errorCount} errors in session`);
    }

    // Check if renderer is responsive
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.webContents.isLoading()) {
        // Renderer appears healthy
      } else {
        warnings.push('[PENDING] Renderer may be unresponsive');
      }
    }

    // Update health status
    this.health = {
      healthy: errors.length === 0,
      lastCheck: now,
      memoryUsage: memoryMB,
      cpuUsage: cpuPercent,
      uptime: Math.floor((now - this.startTime) / 1000),
      errors: errors.slice(-5),
      warnings: warnings.slice(-5),
    };

    // Log if unhealthy
    if (!this.health.healthy) {
      this.logger.warn('Health check failed', { errors, warnings });
    }

    // Emit health update to renderer
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('watchdog:healthUpdate', this.health);
      }
    });

    return this.health;
  }

  private recordError(message: string): void {
    this.errorCount++;
    this.recentErrors.push(` ${new Date().toISOString()}: ${message}`);
    if (this.recentErrors.length > 50) {
      this.recentErrors.shift();
    }
    this.logger.error('Watchdog recorded error', { message, count: this.errorCount });
  }

  getHealth(): HealthStatus {
    return { ...this.health };
  }

  getDiagnostics(): {
    health: HealthStatus;
    config: WatchdogConfig;
    errorCount: number;
    recentErrors: string[];
    memory: {
      heapUsed: number;
      heapTotal: number;
      external: number;
      rss: number;
    };
    versions: {
      node: string;
      electron: string;
      chrome: string;
      v8: string;
    };
    platform: {
      os: string;
      arch: string;
      cpus: number;
    };
  } {
    const memoryUsage = process.memoryUsage();
    
    return {
      health: this.health,
      config: this.config,
      errorCount: this.errorCount,
      recentErrors: this.recentErrors.slice(-10),
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
      versions: {
        node: process.versions.node,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        v8: process.versions.v8,
      },
      platform: {
        os: process.platform,
        arch: process.arch,
        cpus: require('os').cpus().length,
      },
    };
  }

  // Update config at runtime
  updateConfig(newConfig: Partial<WatchdogConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Watchdog config updated', this.config);
  }

  // -------------------------------------------------------------------------
  // Renderer heartbeat tracking (called from main.ts renderer:heartbeat handler)
  // -------------------------------------------------------------------------

  private lastRendererHeartbeat: { t: number; heapUsedMB: number; frameTimeMs: number } | null = null;
  private _rendererFreezeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RENDERER_TIMEOUT_MS = 15_000;

  recordRendererHeartbeat(data: { t: number; heapUsedMB: number; frameTimeMs: number }): void {
    this.lastRendererHeartbeat = data;
    if (data.heapUsedMB > 512) {
      this.recordError(`Renderer heap high: ${data.heapUsedMB.toFixed(0)} MB`);
    }
    if (data.frameTimeMs > 50) {
      this.logger.warn('Renderer frame slow', { frameTimeMs: data.frameTimeMs });
    }
    // Restart the stall timer
    if (this._rendererFreezeTimer) clearTimeout(this._rendererFreezeTimer);
    this._rendererFreezeTimer = setTimeout(() => {
      this.recordError(`Renderer appears frozen: no heartbeat for ${this.RENDERER_TIMEOUT_MS / 1000}s`);
    }, this.RENDERER_TIMEOUT_MS);
  }

  getLastRendererHeartbeat(): typeof this.lastRendererHeartbeat {
    return this.lastRendererHeartbeat;
  }
}

export const watchdogController = new WatchdogController();
