// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Time Tracking Manager (Feature 5)
// Silent time tracking per project, pause on idle, time reports.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface TimeEntry {
  id: number;
  app: string;
  project_id: string;
  project_name: string;
  duration_ms: number;
  date: string;
  session_id: string;
  timestamp: number;
}

export interface TimeReport {
  app: string;
  project_id: string;
  project_name: string;
  total_ms: number;
  date: string;
}

class TimeTrackingManager {
  private mainWindow: BrowserWindow | null = null;
  private activeProject: { app: string; projectId: string; projectName: string; startTime: number } | null = null;
  private idleStartTime: number = 0;
  private isIdle: boolean = false;
  private idleThresholdMs: number = 5 * 60 * 1000;
  private accumulatedIdleMs: number = 0;
  private sessionId: string = '';

  initialize(mainWindow: BrowserWindow, sessionId: string): void {
    this.mainWindow = mainWindow;
    this.sessionId = sessionId;
    this.createTables();
    this.registerIPC();
    log.info('[TimeTracking] Time tracking initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS time_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        date TEXT NOT NULL,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_time_tracking_app ON time_tracking(app);
      CREATE INDEX IF NOT EXISTS idx_time_tracking_date ON time_tracking(date);
      CREATE INDEX IF NOT EXISTS idx_time_tracking_project ON time_tracking(app, project_id);
    `);
  }

  startTracking(app: string, projectId: string, projectName: string): void {
    this.stopTracking();
    this.activeProject = { app, projectId, projectName, startTime: Date.now() };
    this.accumulatedIdleMs = 0;
    this.isIdle = false;
  }

  stopTracking(): TimeEntry | null {
    if (!this.activeProject) return null;

    const now = Date.now();
    let durationMs = now - this.activeProject.startTime - this.accumulatedIdleMs;
    if (this.isIdle) {
      durationMs -= (now - this.idleStartTime);
    }

    if (durationMs < 1000) {
      this.activeProject = null;
      return null;
    }

    const entry = this.recordEntry(
      this.activeProject.app,
      this.activeProject.projectId,
      this.activeProject.projectName,
      durationMs
    );

    this.activeProject = null;
    this.accumulatedIdleMs = 0;
    this.isIdle = false;
    return entry;
  }

  onIdleStart(): void {
    if (this.activeProject && !this.isIdle) {
      this.isIdle = true;
      this.idleStartTime = Date.now();
    }
  }

  onIdleEnd(): void {
    if (this.isIdle) {
      this.accumulatedIdleMs += Date.now() - this.idleStartTime;
      this.isIdle = false;
    }
  }

  private recordEntry(app: string, projectId: string, projectName: string, durationMs: number): TimeEntry | null {
    const db = this.getDb();
    if (!db) return null;

    const now = Date.now();
    const date = new Date().toISOString().split('T')[0];

    try {
      const result = db.prepare(
        `INSERT INTO time_tracking (app, project_id, project_name, duration_ms, date, session_id, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(app, projectId, projectName, durationMs, date, this.sessionId, now);

      return {
        id: Number(result.lastInsertRowid),
        app, project_id: projectId, project_name: projectName,
        duration_ms: durationMs, date, session_id: this.sessionId, timestamp: now,
      };
    } catch (err) {
      log.warn('[TimeTracking] Record error:', err);
      return null;
    }
  }

  getDailyReport(days: number = 30): TimeReport[] {
    const db = this.getDb();
    if (!db) return [];

    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    return db.prepare(
      `SELECT app, project_id, project_name, SUM(duration_ms) as total_ms, date
       FROM time_tracking WHERE date >= ? GROUP BY app, project_id, date ORDER BY date DESC`
    ).all(cutoff) as TimeReport[];
  }

  getWeeklyByApp(): Array<{ app: string; total_ms: number; week: string }> {
    const db = this.getDb();
    if (!db) return [];

    return db.prepare(
      `SELECT app, SUM(duration_ms) as total_ms,
              strftime('%Y-W%W', date) as week
       FROM time_tracking
       GROUP BY app, week
       ORDER BY week DESC
       LIMIT 200`
    ).all() as any[];
  }

  getProjectTotal(app: string, projectId: string): number {
    const db = this.getDb();
    if (!db) return 0;

    const row = db.prepare(
      'SELECT SUM(duration_ms) as total FROM time_tracking WHERE app = ? AND project_id = ?'
    ).get(app, projectId);
    return row?.total || 0;
  }

  getTotalSessionTime(): number {
    const db = this.getDb();
    if (!db) return 0;
    const row = db.prepare('SELECT SUM(duration_ms) as total FROM time_tracking').get();
    return row?.total || 0;
  }

  getLongestSession(): number {
    const db = this.getDb();
    if (!db) return 0;
    const row = db.prepare('SELECT MAX(duration_ms) as longest FROM time_tracking').get();
    return row?.longest || 0;
  }

  getMostUsedApp(): string | null {
    const db = this.getDb();
    if (!db) return null;
    const row = db.prepare(
      'SELECT app, SUM(duration_ms) as total FROM time_tracking GROUP BY app ORDER BY total DESC LIMIT 1'
    ).get();
    return row?.app || null;
  }

  getTodayTotal(): number {
    const db = this.getDb();
    if (!db) return 0;
    const today = new Date().toISOString().split('T')[0];
    const row = db.prepare(
      'SELECT SUM(duration_ms) as total FROM time_tracking WHERE date = ?'
    ).get(today);
    return row?.total || 0;
  }

  exportReport(format: 'text' | 'markdown' | 'json', days: number = 30): string {
    const data = this.getDailyReport(days);
    if (format === 'json') return JSON.stringify(data, null, 2);

    if (format === 'markdown') {
      let md = '# Time Tracking Report\n\n| Date | App | Project | Duration |\n|------|-----|---------|----------|\n';
      for (const r of data) {
        const hrs = Math.floor(r.total_ms / 3600000);
        const mins = Math.floor((r.total_ms % 3600000) / 60000);
        md += `| ${r.date} | ${r.app} | ${r.project_name} | ${hrs}h ${mins}m |\n`;
      }
      return md;
    }

    let text = 'Time Tracking Report\n\n';
    for (const r of data) {
      const hrs = Math.floor(r.total_ms / 3600000);
      const mins = Math.floor((r.total_ms % 3600000) / 60000);
      text += `${r.date} | ${r.app} | ${r.project_name} | ${hrs}h ${mins}m\n`;
    }
    return text;
  }

  private registerIPC(): void {
    ipcMain.handle('time-tracking:startTracking', async (_event, app: string, projectId: string, projectName: string) => {
      this.startTracking(app, projectId, projectName);
    });

    ipcMain.handle('time-tracking:stopTracking', async () => {
      return this.stopTracking();
    });

    ipcMain.handle('time-tracking:getDailyReport', async (_event, days?: number) => {
      return this.getDailyReport(days);
    });

    ipcMain.handle('time-tracking:getWeeklyByApp', async () => {
      return this.getWeeklyByApp();
    });

    ipcMain.handle('time-tracking:getProjectTotal', async (_event, app: string, projectId: string) => {
      return this.getProjectTotal(app, projectId);
    });

    ipcMain.handle('time-tracking:getTodayTotal', async () => {
      return this.getTodayTotal();
    });

    ipcMain.handle('time-tracking:getTotalSessionTime', async () => {
      return this.getTotalSessionTime();
    });

    ipcMain.handle('time-tracking:getLongestSession', async () => {
      return this.getLongestSession();
    });

    ipcMain.handle('time-tracking:getMostUsedApp', async () => {
      return this.getMostUsedApp();
    });

    ipcMain.handle('time-tracking:exportReport', async (_event, format: 'text' | 'markdown' | 'json', days?: number) => {
      return this.exportReport(format, days);
    });

    ipcMain.handle('time-tracking:onIdleStart', async () => {
      this.onIdleStart();
    });

    ipcMain.handle('time-tracking:onIdleEnd', async () => {
      this.onIdleEnd();
    });
  }
}

export const timeTrackingManager = new TimeTrackingManager();
