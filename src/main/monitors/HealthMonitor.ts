// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// HEALTH MONITOR - Phase 24: Internal Health Checks & Diagnostics
// ===========================================================================
// Self-monitoring for memory, tasks, storage, and system health
// Non-intrusive, informational, actionable

import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

const log = new Logger();

// Health thresholds
const THRESHOLDS = {
  memory: {
    warning: 200 * 1024 * 1024,  // 200MB
    critical: 350 * 1024 * 1024, // 350MB
  },
  storage: {
    warning: 100 * 1024 * 1024,  // 100MB
    critical: 500 * 1024 * 1024, // 500MB
  },
  taskLeakCount: 50,
  indexCorruptionThreshold: 0.1, // 10% error rate
};

interface HealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  timestamp: number;
  checks: {
    memory: HealthCheck;
    storage: HealthCheck;
    tasks: HealthCheck;
    index: HealthCheck;
    uptime: HealthCheck;
  };
  recommendations: string[];
}

interface HealthCheck {
  status: 'ok' | 'warning' | 'critical';
  value: number | string;
  message: string;
}

interface DiagnosticLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error';
  source: string;
  message: string;
  data?: Record<string, unknown>;
}

class HealthMonitor {
  private logs: DiagnosticLog[] = [];
  private maxLogs = 1000;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastHealth: HealthStatus | null = null;
  private diagnosticsEnabled = true;
  private dataPath: string;
  private logsPath: string;

  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'dex-data.json');
    this.logsPath = path.join(app.getPath('userData'), 'logs');
    this.ensureLogsDirectory();
  }

  private ensureLogsDirectory(): void {
    if (!fs.existsSync(this.logsPath)) {
      fs.mkdirSync(this.logsPath, { recursive: true });
    }
  }

  // -------------------------------------------------------------------------
  // PUBLIC API
  // -------------------------------------------------------------------------

  start(): void {
    if (this.checkInterval) return;
    
    // Run health check every 5 minutes
    this.checkInterval = setInterval(() => {
      this.runHealthCheck();
    }, 5 * 60 * 1000);

    // Initial check after 30 seconds
    setTimeout(() => this.runHealthCheck(), 30 * 1000);
    
    log.info('Health monitor started');
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    log.info('Health monitor stopped');
  }

  async runHealthCheck(): Promise<HealthStatus> {
    const checks = {
      memory: this.checkMemory(),
      storage: await this.checkStorage(),
      tasks: this.checkTasks(),
      index: await this.checkIndex(),
      uptime: this.checkUptime(),
    };

    const recommendations: string[] = [];
    let overall: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Evaluate overall status
    for (const [name, check] of Object.entries(checks)) {
      if (check.status === 'critical') {
        overall = 'critical';
        recommendations.push(this.getRecommendation(name, check));
      } else if (check.status === 'warning' && overall !== 'critical') {
        overall = 'warning';
        recommendations.push(this.getRecommendation(name, check));
      }
    }

    this.lastHealth = {
      overall,
      timestamp: Date.now(),
      checks,
      recommendations,
    };

    // Log if status is concerning
    if (overall !== 'healthy') {
      this.addLog('warning', 'HealthMonitor', `System health: ${overall}`, {
        recommendations,
      });
    }

    return this.lastHealth;
  }

  getLastHealth(): HealthStatus | null {
    return this.lastHealth;
  }

  // -------------------------------------------------------------------------
  // INDIVIDUAL CHECKS
  // -------------------------------------------------------------------------

  private checkMemory(): HealthCheck {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;
    const heapUsedMB = Math.round(heapUsed / 1024 / 1024);

    if (heapUsed > THRESHOLDS.memory.critical) {
      return {
        status: 'critical',
        value: heapUsedMB,
        message: `Memory usage critical: ${heapUsedMB}MB`,
      };
    }
    if (heapUsed > THRESHOLDS.memory.warning) {
      return {
        status: 'warning',
        value: heapUsedMB,
        message: `Memory usage elevated: ${heapUsedMB}MB`,
      };
    }
    return {
      status: 'ok',
      value: heapUsedMB,
      message: `Memory usage normal: ${heapUsedMB}MB`,
    };
  }

  private async checkStorage(): Promise<HealthCheck> {
    try {
      const stats = fs.statSync(this.dataPath);
      const sizeMB = Math.round(stats.size / 1024 / 1024);

      if (stats.size > THRESHOLDS.storage.critical) {
        return {
          status: 'critical',
          value: sizeMB,
          message: `Storage bloat detected: ${sizeMB}MB`,
        };
      }
      if (stats.size > THRESHOLDS.storage.warning) {
        return {
          status: 'warning',
          value: sizeMB,
          message: `Storage growing large: ${sizeMB}MB`,
        };
      }
      return {
        status: 'ok',
        value: sizeMB,
        message: `Storage size normal: ${sizeMB}MB`,
      };
    } catch {
      return {
        status: 'ok',
        value: 0,
        message: 'Storage check skipped (no data file)',
      };
    }
  }

  private checkTasks(): HealthCheck {
    // Check for potential task/timer leaks
    const activeHandles = (process as any)._getActiveHandles?.()?.length || 0;
    const activeRequests = (process as any)._getActiveRequests?.()?.length || 0;
    const total = activeHandles + activeRequests;

    if (total > THRESHOLDS.taskLeakCount * 2) {
      return {
        status: 'critical',
        value: total,
        message: `Potential task leak: ${total} active handles`,
      };
    }
    if (total > THRESHOLDS.taskLeakCount) {
      return {
        status: 'warning',
        value: total,
        message: `High handle count: ${total}`,
      };
    }
    return {
      status: 'ok',
      value: total,
      message: `Task count normal: ${total}`,
    };
  }

  private async checkIndex(): Promise<HealthCheck> {
    // Simple integrity check - verify data file is valid JSON
    try {
      if (fs.existsSync(this.dataPath)) {
        const content = fs.readFileSync(this.dataPath, 'utf8');
        JSON.parse(content);
        return {
          status: 'ok',
          value: 'valid',
          message: 'Data integrity: OK',
        };
      }
      return {
        status: 'ok',
        value: 'empty',
        message: 'No data file yet',
      };
    } catch (err) {
      return {
        status: 'critical',
        value: 'corrupted',
        message: 'Data file may be corrupted',
      };
    }
  }

  private checkUptime(): HealthCheck {
    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.round(uptimeSeconds / 3600 * 10) / 10;

    // Long uptime isn't bad, just informational
    return {
      status: 'ok',
      value: uptimeHours,
      message: `Uptime: ${uptimeHours} hours`,
    };
  }

  // -------------------------------------------------------------------------
  // RECOMMENDATIONS
  // -------------------------------------------------------------------------

  private getRecommendation(checkName: string, check: HealthCheck): string {
    switch (checkName) {
      case 'memory':
        return 'Consider restarting Dex to free memory';
      case 'storage':
        return 'Clean up old data in Settings > Storage';
      case 'tasks':
        return 'Restart Dex to clear stale tasks';
      case 'index':
        return 'Export data and verify backup, then contact support';
      default:
        return check.message;
    }
  }

  // -------------------------------------------------------------------------
  // LOGGING SYSTEM
  // -------------------------------------------------------------------------

  addLog(
    level: 'info' | 'warning' | 'error',
    source: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (!this.diagnosticsEnabled) return;

    const logEntry: DiagnosticLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      source,
      message,
      data,
    };

    this.logs.push(logEntry);

    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  getLogs(options?: {
    level?: 'info' | 'warning' | 'error';
    source?: string;
    since?: number;
    limit?: number;
  }): DiagnosticLog[] {
    let filtered = [...this.logs];

    if (options?.level) {
      filtered = filtered.filter(l => l.level === options.level);
    }
    if (options?.source) {
      filtered = filtered.filter(l => l.source === options.source);
    }
    if (options?.since) {
      const since = options.since;
      filtered = filtered.filter(l => l.timestamp > since);
    }
    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  clearLogs(): void {
    this.logs = [];
    log.info('Diagnostic logs cleared');
  }

  exportLogs(): string {
    const exportData = {
      exportedAt: new Date().toISOString(),
      dexVersion: app.getVersion(),
      platform: process.platform,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      health: this.lastHealth,
      logs: this.logs.map(l => ({
        ...l,
        // Sanitize any sensitive data
        data: l.data ? this.sanitizeData(l.data) : undefined,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'key', 'secret', 'token', 'auth'];

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  setDiagnosticsEnabled(enabled: boolean): void {
    this.diagnosticsEnabled = enabled;
    if (!enabled) {
      this.clearLogs();
    }
    log.info(`Diagnostics ${enabled ? 'enabled' : 'disabled'}`);
  }

  isDiagnosticsEnabled(): boolean {
    return this.diagnosticsEnabled;
  }
}

// Singleton instance
export const healthMonitor = new HealthMonitor();

// -------------------------------------------------------------------------
// IPC HANDLERS
// -------------------------------------------------------------------------

export function registerHealthHandlers(): void {
  // Run health check
  ipcMain.handle('health:check', async () => {
    return healthMonitor.runHealthCheck();
  });

  // Get last health status
  ipcMain.handle('health:getStatus', () => {
    return healthMonitor.getLastHealth();
  });

  // Get diagnostic logs
  ipcMain.handle('health:getLogs', (_event, options) => {
    return healthMonitor.getLogs(options);
  });

  // Clear logs
  ipcMain.handle('health:clearLogs', () => {
    healthMonitor.clearLogs();
    return { success: true };
  });

  // Export logs
  ipcMain.handle('health:exportLogs', () => {
    return healthMonitor.exportLogs();
  });

  // Toggle diagnostics
  ipcMain.handle('health:setDiagnosticsEnabled', (_event, enabled: boolean) => {
    healthMonitor.setDiagnosticsEnabled(enabled);
    return { success: true, enabled };
  });

  // Get diagnostics status
  ipcMain.handle('health:isDiagnosticsEnabled', () => {
    return healthMonitor.isDiagnosticsEnabled();
  });

  log.info('Health handlers registered');
}
