// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - In-App Feedback Collector
// Local-only feedback system. Reports saved as JSON files.
// Three report types: Bug, Feature Request, General.
// Optional system info included with user consent.
// ==========================================================================

import { ipcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export type ReportType = 'bug' | 'feature' | 'general';

export interface FeedbackReport {
  id: string;
  reportType: ReportType;
  description: string;
  systemInfo: SystemInfo | null;
  createdAt: number;
}

export interface SystemInfo {
  dexVersion: string;
  osName: string;
  osVersion: string;
  capabilityTier: number;
  activeApp: string;
  errorLogTail: string[];
}

class FeedbackCollector {
  private mainWindow: BrowserWindow | null = null;
  private feedbackDir: string = '';

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.feedbackDir = path.join(app.getPath('userData'), 'feedback');
    if (!fs.existsSync(this.feedbackDir)) {
      fs.mkdirSync(this.feedbackDir, { recursive: true });
    }
    this.registerIPC();
    log.info('[Feedback] Feedback collector initialized');
  }

  async submitReport(reportType: ReportType, description: string, includeSystemInfo: boolean): Promise<{ filePath: string }> {
    const now = Date.now();
    const id = `feedback-${now}`;

    let systemInfo: SystemInfo | null = null;
    if (includeSystemInfo) {
      systemInfo = await this.gatherSystemInfo();
    }

    const report: FeedbackReport = {
      id,
      reportType,
      description,
      systemInfo,
      createdAt: now,
    };

    const filename = `${id}.json`;
    const filePath = path.join(this.feedbackDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');

    const db = databaseManager.getDatabase();
    if (db) {
      db.prepare(
        'INSERT INTO feedback_reports (report_type, description, system_info, created_at) VALUES (?, ?, ?, ?)'
      ).run(reportType, description, includeSystemInfo ? JSON.stringify(systemInfo) : null, now);
    }

    log.info(`[Feedback] Report saved: ${filePath}`);
    return { filePath };
  }

  private async gatherSystemInfo(): Promise<SystemInfo> {
    const dexVersion = app.getVersion();
    const osName = os.platform();
    const osVersion = os.release();

    let capabilityTier = 1;
    try {
      const tierStr = databaseManager.getSetting('capability_tier', '1');
      capabilityTier = parseInt(tierStr, 10) || 1;
    } catch {
      capabilityTier = 1;
    }

    let activeApp = 'unknown';
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        activeApp = await this.mainWindow.webContents.executeJavaScript(
          `(function() { try { return window.__dexActiveApp || 'unknown'; } catch { return 'unknown'; } })()`
        );
      } catch {
        activeApp = 'unknown';
      }
    }

    const errorLogTail = this.getErrorLogTail(10);

    return { dexVersion, osName, osVersion, capabilityTier, activeApp, errorLogTail };
  }

  private getErrorLogTail(lines: number): string[] {
    try {
      const logPath = log.transports.file.getFile()?.path;
      if (!logPath || !fs.existsSync(logPath)) return [];
      const content = fs.readFileSync(logPath, 'utf8');
      const allLines = content.split('\n').filter(l => l.trim().length > 0);
      const errorLines = allLines.filter(l =>
        l.includes('[error]') || l.includes('Error') || l.includes('FATAL') || l.includes('warn')
      );
      return errorLines.slice(-lines);
    } catch {
      return [];
    }
  }

  getSystemInfoPreview(): Promise<SystemInfo> {
    return this.gatherSystemInfo();
  }

  getAllReports(): FeedbackReport[] {
    try {
      const files = fs.readdirSync(this.feedbackDir).filter(f => f.endsWith('.json'));
      const reports: FeedbackReport[] = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.feedbackDir, file), 'utf8');
          reports.push(JSON.parse(content));
        } catch {
          continue;
        }
      }
      return reports.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  getFeedbackDir(): string {
    return this.feedbackDir;
  }

  private registerIPC(): void {
    ipcMain.handle('feedback:submit', async (_event, reportType: ReportType, description: string, includeSystemInfo: boolean) => {
      return this.submitReport(reportType, description, includeSystemInfo);
    });

    ipcMain.handle('feedback:getSystemInfoPreview', async () => {
      return this.gatherSystemInfo();
    });

    ipcMain.handle('feedback:getAllReports', () => {
      return this.getAllReports();
    });

    ipcMain.handle('feedback:getFeedbackDir', () => {
      return this.feedbackDir;
    });
  }

  shutdown(): void {
    log.info('[Feedback] Shutdown');
  }
}

export const feedbackCollector = new FeedbackCollector();

export function initializeFeedback(mainWindow: BrowserWindow): void {
  feedbackCollector.initialize(mainWindow);
}

export function shutdownFeedback(): void {
  feedbackCollector.shutdown();
}
