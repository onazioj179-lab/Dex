// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Crash Reporter
// Privacy-safe crash collection, local-only storage, rollback detection
// ===========================================================================

import { app, crashReporter, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface CrashRecord {
  id: string;
  timestamp: number;
  type: 'renderer' | 'main' | 'gpu' | 'utility';
  version: string;
  platform: string;
  arch: string;
  uptime: number;
  message: string;
  stack?: string;
}

interface CrashStats {
  totalCrashes: number;
  crashesThisSession: number;
  crashesSinceUpdate: number;
  lastCrash: number;
  recentCrashes: CrashRecord[];
  rollbackRecommended: boolean;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CRASH_LOG_FILE = 'crash-log.json';
const MAX_STORED_CRASHES = 200;
const ROLLBACK_THRESHOLD = 5; // crashes since update triggers rollback suggestion
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// -----------------------------------------------------------------------------
// CrashReporterService
// -----------------------------------------------------------------------------

class CrashReporterService {
  private crashLogPath: string;
  private dumpPath: string;
  private crashes: CrashRecord[] = [];
  private sessionCrashCount = 0;
  private startTime = Date.now();
  private currentVersion: string;

  constructor() {
    const userData = app.getPath('userData');
    this.crashLogPath = path.join(userData, CRASH_LOG_FILE);
    this.dumpPath = path.join(userData, 'crashes');
    this.currentVersion = app.getVersion();

    this.ensureDumpDirectory();
    this.loadCrashLog();
    this.initializeNativeCrashReporter();
    this.registerProcessHandlers();
    this.registerIPC();

    // Purge crash dumps older than 30 days on startup
    const purged = this.purgeCrashDumps();
    if (purged > 0) {
      log.info(`[CrashReporter] Purged ${purged} old crash dump(s)`);
    }

    log.info('[CrashReporter] Initialized -- local-only mode, no remote telemetry');
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  private ensureDumpDirectory(): void {
    try {
      if (!fs.existsSync(this.dumpPath)) {
        fs.mkdirSync(this.dumpPath, { recursive: true });
      }
    } catch (err) {
      log.warn('[CrashReporter] Failed to create dump directory:', err);
    }
  }

  private loadCrashLog(): void {
    try {
      if (fs.existsSync(this.crashLogPath)) {
        const raw = fs.readFileSync(this.crashLogPath, 'utf-8');
        if (!raw.trim()) {
          this.crashes = [];
          return;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.crashes = parsed.slice(-MAX_STORED_CRASHES);
        }
      }
    } catch (err) {
      try {
        fs.writeFileSync(this.crashLogPath, '[]', 'utf-8');
      } catch {
        // Ignore secondary write failures and continue with a clean in-memory log.
      }
      log.warn('[CrashReporter] Failed to load crash log, starting fresh:', err);
      this.crashes = [];
    }
  }

  private saveCrashLog(): void {
    try {
      const trimmed = this.crashes.slice(-MAX_STORED_CRASHES);
      fs.writeFileSync(this.crashLogPath, JSON.stringify(trimmed, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[CrashReporter] Failed to save crash log:', err);
    }
  }

  private initializeNativeCrashReporter(): void {
    // Local-only crash reporter -- no remote submission for privacy
    crashReporter.start({
      productName: 'DEX',
      companyName: 'OnaziOJ',
      submitURL: '', // empty = local only, no remote
      uploadToServer: false,
      compress: true,
      extra: {
        version: this.currentVersion,
        platform: process.platform,
        arch: process.arch,
      },
    });
  }

  private registerProcessHandlers(): void {
    // Uncaught exceptions in main process
    process.on('uncaughtException', (error: Error) => {
      this.recordCrash('main', error.message, error.stack);
      log.error('[CrashReporter] Uncaught exception:', error.message);
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      this.recordCrash('main', `Unhandled rejection: ${message}`, stack);
      log.error('[CrashReporter] Unhandled rejection:', message);
    });

    // Renderer process crash
    app.on('render-process-gone', (_event, _webContents, details) => {
      this.recordCrash('renderer', `Renderer crashed: ${details.reason}`, undefined);
      log.error('[CrashReporter] Renderer process gone:', details.reason);
    });

    // GPU process crash
    app.on('child-process-gone', (_event, details) => {
      if (details.type === 'GPU') {
        this.recordCrash('gpu', `GPU process gone: ${details.reason}`, undefined);
        log.error('[CrashReporter] GPU process gone:', details.reason);
      } else {
        this.recordCrash('utility', `Child process gone (${details.type}): ${details.reason}`, undefined);
      }
    });
  }

  private registerIPC(): void {
    ipcMain.handle('crash-reporter:getStats', async () => this.getStats());
    ipcMain.handle('crash-reporter:getRecent', async (_e, limit?: number) => {
      return this.crashes.slice(-(limit || 20));
    });
    ipcMain.handle('crash-reporter:clear', async () => {
      this.crashes = [];
      this.saveCrashLog();
      return { success: true };
    });
    ipcMain.handle('crash-reporter:reportRendererError', async (_e, data: { message: string; stack?: string }) => {
      this.recordCrash('renderer', data.message, data.stack);
      return { recorded: true };
    });
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  /** Called from main.ts renderer:heartbeat handler when freeze is detected. */
  recordFreezeEvent(data: { source: string; frozenMs: number; t: number }): void {
    this.recordCrash('renderer', `Renderer freeze: ${data.frozenMs}ms`, `source=${data.source} t=${data.t}`);
  }

  /** Called from main.ts render-error:report handler. */
  recordRendererError(data: { kind: string; message: string; stack?: string; t: number }): void {
    this.recordCrash('renderer', `[${data.kind}] ${data.message}`, data.stack);
  }

  recordCrash(type: CrashRecord['type'], message: string, stack?: string): void {
    const record: CrashRecord = {
      id: `crash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type,
      version: this.currentVersion,
      platform: process.platform,
      arch: process.arch,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      message: message.slice(0, 500), // truncate for storage
      stack: stack ? stack.slice(0, 2000) : undefined,
    };

    this.crashes.push(record);
    this.sessionCrashCount++;
    this.saveCrashLog();

    // Notify renderer if window exists
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('crash-reporter:new-crash', record);
      }
    } catch {
      // Window may not be available during early startup
    }
  }

  // ---------------------------------------------------------------------------
  // Stats & Rollback Detection
  // ---------------------------------------------------------------------------

  getStats(): CrashStats {
    const now = Date.now();
    const recentCutoff = now - RECENT_WINDOW_MS;
    const recentCrashes = this.crashes.filter(c => c.timestamp > recentCutoff);
    const crashesSinceUpdate = this.crashes.filter(c => c.version === this.currentVersion).length;

    return {
      totalCrashes: this.crashes.length,
      crashesThisSession: this.sessionCrashCount,
      crashesSinceUpdate,
      lastCrash: this.crashes.length > 0 ? this.crashes[this.crashes.length - 1].timestamp : 0,
      recentCrashes: recentCrashes.slice(-10),
      rollbackRecommended: crashesSinceUpdate >= ROLLBACK_THRESHOLD,
    };
  }

  isRollbackRecommended(): boolean {
    const crashesSinceUpdate = this.crashes.filter(c => c.version === this.currentVersion).length;
    return crashesSinceUpdate >= ROLLBACK_THRESHOLD;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  purgeCrashDumps(olderThanDays = 30): number {
    let purged = 0;
    try {
      if (!fs.existsSync(this.dumpPath)) return 0;
      const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      const files = fs.readdirSync(this.dumpPath);
      for (const file of files) {
        const filePath = path.join(this.dumpPath, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            purged++;
          }
        } catch {
          // skip files that can't be accessed
        }
      }
    } catch (err) {
      log.warn('[CrashReporter] Purge failed:', err);
    }
    return purged;
  }

  destroy(): void {
    this.saveCrashLog();
    log.info('[CrashReporter] Shut down');
  }
}

// Singleton
export const crashReporterService = new CrashReporterService();
