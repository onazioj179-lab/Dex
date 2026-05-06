// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Diagnostics Controller
// Phase 11: Local logging, crash reports, performance metrics
// No automatic uploads - user has full control
// ===========================================================================

import { ipcMain, app, dialog, BrowserWindow, shell } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';
import si from 'systeminformation';
import { NativeSystem, isNativeAvailable } from '../native/bridge';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: any;
}

interface CrashReport {
  id: string;
  timestamp: string;
  error: string;
  stack?: string;
  appVersion: string;
  osInfo: string;
  memoryUsage: NodeJS.MemoryUsage;
}

interface PerformanceSnapshot {
  timestamp: string;
  cpu: number;
  memory: { used: number; total: number; percent: number };
  uptime: number;
  fps?: number;
}

interface DiagnosticsPreferences {
  loggingEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxLogFiles: number;
  maxLogSizeMB: number;
  collectPerformanceMetrics: boolean;
  crashReportingEnabled: boolean;
}

class DiagnosticsController {
  private readonly logsPath: string;
  private readonly crashReportsPath: string;
  private readonly metricsPath: string;
  private preferences: DiagnosticsPreferences;
  private recentLogs: LogEntry[] = [];
  private performanceHistory: PerformanceSnapshot[] = [];
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor() {
    const userData = app.getPath('userData');
    this.logsPath = path.join(userData, 'logs');
    this.crashReportsPath = path.join(userData, 'crash-reports');
    this.metricsPath = path.join(userData, 'metrics');
    
    this.preferences = {
      loggingEnabled: true,
      logLevel: 'info',
      maxLogFiles: 10,
      maxLogSizeMB: 10,
      collectPerformanceMetrics: true,
      crashReportingEnabled: true
    };

    this.init();
    this.registerHandlers();
  }

  private async init(): Promise<void> {
    try {
      // Create directories
      await fs.mkdir(this.logsPath, { recursive: true });
      await fs.mkdir(this.crashReportsPath, { recursive: true });
      await fs.mkdir(this.metricsPath, { recursive: true });

      // Configure electron-log
      log.transports.file.resolvePathFn = () => path.join(this.logsPath, 'dex.log');
      log.transports.file.maxSize = this.preferences.maxLogSizeMB * 1024 * 1024;
      
      // Setup unhandled exception handler
      this.setupCrashHandler();
      
      // Start performance monitoring
      if (this.preferences.collectPerformanceMetrics) {
        this.startPerformanceMonitoring();
      }

      log.info('Diagnostics initialized');
    } catch (error) {
      log.error('Failed to initialize diagnostics:', error);
    }
  }

  private setupCrashHandler(): void {
    process.on('uncaughtException', async (error) => {
      await this.saveCrashReport(error);
      log.error('Uncaught exception:', error);
    });

    process.on('unhandledRejection', async (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      await this.saveCrashReport(error);
      log.error('Unhandled rejection:', error);
    });
  }

  private registerHandlers(): void {
    // Get diagnostics preferences
    ipcMain.handle('diagnostics:getPreferences', () => {
      return this.preferences;
    });

    // Set diagnostics preferences
    ipcMain.handle('diagnostics:setPreferences', async (_, prefs: Partial<DiagnosticsPreferences>) => {
      this.preferences = { ...this.preferences, ...prefs };
      
      // Toggle performance monitoring
      if (prefs.collectPerformanceMetrics !== undefined) {
        if (prefs.collectPerformanceMetrics) {
          this.startPerformanceMonitoring();
        } else {
          this.stopPerformanceMonitoring();
        }
      }
      
      return { success: true };
    });

    // Get recent logs
    ipcMain.handle('diagnostics:getLogs', async (_, count?: number) => {
      return this.getRecentLogs(count || 100);
    });

    // Get logs from file
    ipcMain.handle('diagnostics:getLogFile', async (_, date?: string) => {
      return await this.getLogFileContents(date);
    });

    // List log files
    ipcMain.handle('diagnostics:listLogFiles', async () => {
      return await this.listLogFiles();
    });

    // Clear logs
    ipcMain.handle('diagnostics:clearLogs', async () => {
      return await this.clearLogs();
    });

    // Get crash reports
    ipcMain.handle('diagnostics:getCrashReports', async () => {
      return await this.getCrashReports();
    });

    // Delete crash report
    ipcMain.handle('diagnostics:deleteCrashReport', async (_, id: string) => {
      return await this.deleteCrashReport(id);
    });

    // Clear all crash reports
    ipcMain.handle('diagnostics:clearCrashReports', async () => {
      return await this.clearCrashReports();
    });

    // Get performance metrics
    ipcMain.handle('diagnostics:getPerformance', async () => {
      return await this.getPerformanceMetrics();
    });

    // Get performance history
    ipcMain.handle('diagnostics:getPerformanceHistory', async () => {
      return this.performanceHistory;
    });

    // Get system info
    ipcMain.handle('diagnostics:getSystemInfo', async () => {
      return await this.getSystemInfo();
    });

    // Export diagnostics
    ipcMain.handle('diagnostics:export', async () => {
      return await this.exportDiagnostics();
    });

    // Open logs folder
    ipcMain.handle('diagnostics:openLogsFolder', () => {
      shell.openPath(this.logsPath);
      return { success: true };
    });

    // Log from renderer
    ipcMain.handle('diagnostics:log', async (_, level: string, category: string, message: string, data?: any) => {
      this.log(level as any, category, message, data);
      return { success: true };
    });

    // Report error from renderer
    ipcMain.handle('diagnostics:reportError', async (_, error: { message: string; stack?: string }) => {
      const err = new Error(error.message);
      err.stack = error.stack;
      await this.saveCrashReport(err);
      return { success: true };
    });
  }

  // ===========================================================================
  // LOGGING
  // ===========================================================================

  log(level: 'info' | 'warn' | 'error' | 'debug', category: string, message: string, data?: any): void {
    if (!this.preferences.loggingEnabled) return;

    const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levelPriority[level] < levelPriority[this.preferences.logLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data
    };

    // Add to recent logs (keep last 500)
    this.recentLogs.push(entry);
    if (this.recentLogs.length > 500) {
      this.recentLogs.shift();
    }

    // Write to file via electron-log
    const logMessage = `[${category}] ${message}`;
    switch (level) {
      case 'debug': log.debug(logMessage, data); break;
      case 'info': log.info(logMessage, data); break;
      case 'warn': log.warn(logMessage, data); break;
      case 'error': log.error(logMessage, data); break;
    }
  }

  getRecentLogs(count: number): LogEntry[] {
    return this.recentLogs.slice(-count);
  }

  async getLogFileContents(date?: string): Promise<string> {
    try {
      const logFile = path.join(this.logsPath, 'dex.log');
      if (!fsSync.existsSync(logFile)) {
        return '';
      }
      return await fs.readFile(logFile, 'utf-8');
    } catch (error) {
      log.error('Failed to read log file:', error);
      return '';
    }
  }

  async listLogFiles(): Promise<{ name: string; size: number; modified: Date }[]> {
    try {
      const files = await fs.readdir(this.logsPath);
      const logFiles = await Promise.all(
        files.filter(f => f.endsWith('.log')).map(async (name) => {
          const stats = await fs.stat(path.join(this.logsPath, name));
          return { name, size: stats.size, modified: stats.mtime };
        })
      );
      return logFiles.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    } catch {
      return [];
    }
  }

  async clearLogs(): Promise<{ success: boolean }> {
    try {
      const files = await fs.readdir(this.logsPath);
      for (const file of files) {
        if (file.endsWith('.log')) {
          await fs.unlink(path.join(this.logsPath, file));
        }
      }
      this.recentLogs = [];
      return { success: true };
    } catch (error) {
      log.error('Failed to clear logs:', error);
      return { success: false };
    }
  }

  // ===========================================================================
  // CRASH REPORTS
  // ===========================================================================

  async saveCrashReport(error: Error): Promise<void> {
    if (!this.preferences.crashReportingEnabled) return;

    try {
      const report: CrashReport = {
        id: `crash_${Date.now()}`,
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
        appVersion: app.getVersion(),
        osInfo: `${os.platform()} ${os.release()} (${os.arch()})`,
        memoryUsage: process.memoryUsage()
      };

      const reportPath = path.join(this.crashReportsPath, `${report.id}.json`);
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
      
      // Clean old crash reports (keep last 20)
      await this.cleanOldCrashReports(20);
    } catch (err) {
      log.error('Failed to save crash report:', err);
    }
  }

  async getCrashReports(): Promise<CrashReport[]> {
    try {
      const files = await fs.readdir(this.crashReportsPath);
      const reports: CrashReport[] = [];
      
      for (const file of files.filter(f => f.endsWith('.json'))) {
        const content = await fs.readFile(path.join(this.crashReportsPath, file), 'utf-8');
        reports.push(JSON.parse(content));
      }
      
      return reports.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch {
      return [];
    }
  }

  async deleteCrashReport(id: string): Promise<{ success: boolean }> {
    try {
      const reportPath = path.join(this.crashReportsPath, `${id}.json`);
      if (fsSync.existsSync(reportPath)) {
        await fs.unlink(reportPath);
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async clearCrashReports(): Promise<{ success: boolean }> {
    try {
      const files = await fs.readdir(this.crashReportsPath);
      for (const file of files) {
        await fs.unlink(path.join(this.crashReportsPath, file));
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private async cleanOldCrashReports(keepCount: number): Promise<void> {
    const reports = await this.getCrashReports();
    for (let i = keepCount; i < reports.length; i++) {
      await this.deleteCrashReport(reports[i].id);
    }
  }

  // ===========================================================================
  // PERFORMANCE METRICS
  // ===========================================================================

  startPerformanceMonitoring(): void {
    if (this.metricsInterval) return;
    
    this.metricsInterval = setInterval(async () => {
      const snapshot = await this.capturePerformanceSnapshot();
      this.performanceHistory.push(snapshot);
      
      // Keep last 60 snapshots (1 hour if interval is 1 minute)
      if (this.performanceHistory.length > 60) {
        this.performanceHistory.shift();
      }
    }, 60000); // Every minute
  }

  stopPerformanceMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  async capturePerformanceSnapshot(): Promise<PerformanceSnapshot> {
    // Use Rust native module when available
    const nativeStats = NativeSystem.getStats();
    if (nativeStats) {
      return {
        timestamp: new Date().toISOString(),
        cpu: Math.round(nativeStats.cpuPercent),
        memory: {
          used: Math.round(nativeStats.memoryUsed / (1024 * 1024 * 1024) * 100) / 100,
          total: Math.round(nativeStats.memoryTotal / (1024 * 1024 * 1024) * 100) / 100,
          percent: Math.round(nativeStats.memoryPercent),
        },
        uptime: Math.round(process.uptime()),
      };
    }

    // Fallback to systeminformation
    const [cpuLoad, memInfo] = await Promise.all([
      si.currentLoad(),
      si.mem()
    ]);

    return {
      timestamp: new Date().toISOString(),
      cpu: Math.round(cpuLoad.currentLoad),
      memory: {
        used: Math.round(memInfo.used / (1024 * 1024 * 1024) * 100) / 100,
        total: Math.round(memInfo.total / (1024 * 1024 * 1024) * 100) / 100,
        percent: Math.round((memInfo.used / memInfo.total) * 100)
      },
      uptime: Math.round(process.uptime())
    };
  }

  async getPerformanceMetrics(): Promise<{
    current: PerformanceSnapshot;
    processMemory: NodeJS.MemoryUsage;
    nodeVersion: string;
    electronVersion: string;
  }> {
    const current = await this.capturePerformanceSnapshot();
    
    return {
      current,
      processMemory: process.memoryUsage(),
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron
    };
  }

  // ===========================================================================
  // SYSTEM INFO
  // ===========================================================================

  async getSystemInfo(): Promise<Record<string, any>> {
    // For detailed hardware info (CPU brand, GPU, etc.) we still use systeminformation
    // as Rust native module focuses on real-time monitoring rather than hardware details.
    // Native module provides disk info as a faster alternative to si.fsSize().
    const nativeDisks = isNativeAvailable() ? NativeSystem.getDisks() : null;
    const [cpu, mem, osInfo, graphics, disk] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.graphics(),
      nativeDisks ? Promise.resolve(null) : si.fsSize()
    ]);

    return {
      app: {
        version: app.getVersion(),
        name: app.getName(),
        path: app.getPath('exe'),
        userData: app.getPath('userData')
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        arch: osInfo.arch,
        hostname: osInfo.hostname
      },
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        speed: cpu.speed
      },
      memory: {
        total: Math.round(mem.total / (1024 * 1024 * 1024) * 100) / 100,
        free: Math.round(mem.free / (1024 * 1024 * 1024) * 100) / 100,
        used: Math.round(mem.used / (1024 * 1024 * 1024) * 100) / 100
      },
      graphics: graphics.controllers.map(g => ({
        model: g.model,
        vram: g.vram
      })),
      storage: nativeDisks
        ? nativeDisks.map(d => ({
            mount: d.mount,
            size: Math.round(d.total / (1024 * 1024 * 1024)),
            used: Math.round(d.used / (1024 * 1024 * 1024)),
            available: Math.round(d.available / (1024 * 1024 * 1024))
          }))
        : (disk || []).map((d: any) => ({
            mount: d.mount,
            size: Math.round(d.size / (1024 * 1024 * 1024)),
            used: Math.round(d.used / (1024 * 1024 * 1024)),
            available: Math.round(d.available / (1024 * 1024 * 1024))
          })),
      runtime: {
        node: process.versions.node,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        v8: process.versions.v8
      }
    };
  }

  // ===========================================================================
  // EXPORT
  // ===========================================================================

  async exportDiagnostics(): Promise<{ success: boolean; path?: string }> {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow();
      if (!mainWindow) {
        return { success: false };
      }

      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Diagnostics',
        defaultPath: path.join(app.getPath('documents'), `dex-diagnostics-${Date.now()}.json`),
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (canceled || !filePath) {
        return { success: false };
      }

      const diagnostics = {
        exportedAt: new Date().toISOString(),
        systemInfo: await this.getSystemInfo(),
        recentLogs: this.recentLogs,
        performanceHistory: this.performanceHistory,
        crashReports: await this.getCrashReports()
      };

      // Redact secrets before writing to disk
      const redacted = JSON.stringify(diagnostics, null, 2)
        .replace(/("(?:password|pin|secret|token|masterPassword|sessionToken|apiKey|masterKey|encryptedKey)":\s*)"[^"]*"/gi, '$1"[REDACTED]"')
        .replace(/"(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)"/g, '"[JWT_REDACTED]"');

      await fs.writeFile(filePath, redacted, 'utf-8');
      return { success: true, path: filePath };
    } catch {
      return { success: false };
    }
  }
}

export const diagnosticsController = new DiagnosticsController();
