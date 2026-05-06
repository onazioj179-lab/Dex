// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Statistics Dashboard Manager (Feature 20)
// Lifetime statistics aggregated from all SQLite data across DEX.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface LifetimeStats {
  totalProjects: number;
  totalTasksCreated: number;
  totalTasksCompleted: number;
  taskCompletionRate: number;
  totalFocusSessions: number;
  totalFocusHours: number;
  totalExports: number;
  totalFilesImported: number;
  totalNotesCreated: number;
  totalWordsWritten: number;
  totalAutomationsTriggered: number;
  totalPluginsInstalled: number;
  totalCommandsRun: number;
  totalVoiceMemosRecorded: number;
  totalTimeSpentMs: number;
  longestSessionMs: number;
  mostUsedApp: string;
  mostProductiveDay: string;
  currentStreak: number;
  longestStreak: number;
  computedAt: number;
}

class StatisticsDashboardManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[StatsDashboard] Statistics dashboard initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS stats_summary (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data TEXT NOT NULL,
        computed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage_days (
        date TEXT PRIMARY KEY,
        actions INTEGER DEFAULT 0
      );
    `);
  }

  computeStats(): LifetimeStats {
    const db = this.getDb();
    const stats: LifetimeStats = {
      totalProjects: 0, totalTasksCreated: 0, totalTasksCompleted: 0,
      taskCompletionRate: 0, totalFocusSessions: 0, totalFocusHours: 0,
      totalExports: 0, totalFilesImported: 0, totalNotesCreated: 0,
      totalWordsWritten: 0, totalAutomationsTriggered: 0, totalPluginsInstalled: 0,
      totalCommandsRun: 0, totalVoiceMemosRecorded: 0, totalTimeSpentMs: 0,
      longestSessionMs: 0, mostUsedApp: 'none', mostProductiveDay: 'none',
      currentStreak: 0, longestStreak: 0, computedAt: Date.now(),
    };

    if (!db) return stats;

    try {
      const tasksRow = db.prepare("SELECT value FROM settings WHERE key = 'tasks_data'").get();
      if (tasksRow) {
        const tasks = JSON.parse(tasksRow.value || '[]');
        if (Array.isArray(tasks)) {
          stats.totalTasksCreated = tasks.length;
          stats.totalTasksCompleted = tasks.filter((t: any) => t.status === 'completed').length;
          stats.taskCompletionRate = stats.totalTasksCreated > 0
            ? Math.round((stats.totalTasksCompleted / stats.totalTasksCreated) * 100) : 0;
        }
      }

      const notesRow = db.prepare("SELECT value FROM settings WHERE key = 'notes_data'").get();
      if (notesRow) {
        const notes = JSON.parse(notesRow.value || '[]');
        if (Array.isArray(notes)) {
          stats.totalNotesCreated = notes.length;
        }
      }

      const mediaCount = db.prepare('SELECT COUNT(*) as c FROM media_library').get();
      stats.totalFilesImported = mediaCount?.c || 0;

      try {
        const timeRow = db.prepare('SELECT SUM(duration_ms) as total FROM time_tracking').get();
        stats.totalTimeSpentMs = timeRow?.total || 0;

        const longestRow = db.prepare('SELECT MAX(duration_ms) as longest FROM time_tracking').get();
        stats.longestSessionMs = longestRow?.longest || 0;

        const appRow = db.prepare(
          'SELECT app, SUM(duration_ms) as total FROM time_tracking GROUP BY app ORDER BY total DESC LIMIT 1'
        ).get();
        stats.mostUsedApp = appRow?.app || 'none';
      } catch { /* time_tracking may not exist yet */ }

      try {
        const memoCount = db.prepare('SELECT COUNT(*) as c FROM voice_memos').get();
        stats.totalVoiceMemosRecorded = memoCount?.c || 0;
      } catch { /* voice_memos may not exist yet */ }

      try {
        const wordRow = db.prepare('SELECT SUM(words) as total FROM word_count_log').get();
        stats.totalWordsWritten = wordRow?.total || 0;
      } catch { /* word_count_log may not exist yet */ }

      const focusRow = db.prepare("SELECT value FROM settings WHERE key = 'focus_sessions'").get();
      if (focusRow) {
        const sessions = JSON.parse(focusRow.value || '[]');
        if (Array.isArray(sessions)) {
          stats.totalFocusSessions = sessions.length;
          const totalMs = sessions.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
          stats.totalFocusHours = Math.round(totalMs / 3600000 * 10) / 10;
        }
      }

      try {
        const days = db.prepare('SELECT date, actions FROM usage_days ORDER BY date DESC').all() as any[];
        if (days.length > 0) {
          let currentStreak = 0;
          let longestStreak = 0;
          let streak = 0;
          let prevDate = new Date();

          for (let i = 0; i < days.length; i++) {
            const d = new Date(days[i].date);
            if (i === 0) {
              const diffDays = Math.floor((prevDate.getTime() - d.getTime()) / 86400000);
              if (diffDays <= 1) {
                streak = 1;
              } else {
                streak = 0;
              }
            } else {
              const prev = new Date(days[i - 1].date);
              const diffDays = Math.floor((prev.getTime() - d.getTime()) / 86400000);
              if (diffDays === 1) {
                streak++;
              } else {
                longestStreak = Math.max(longestStreak, streak);
                if (i <= 1) currentStreak = streak;
                streak = 1;
              }
            }
          }
          longestStreak = Math.max(longestStreak, streak);
          currentStreak = currentStreak || streak;
          stats.currentStreak = currentStreak;
          stats.longestStreak = longestStreak;

          let maxActions = 0;
          let maxDate = '';
          for (const day of days) {
            if (day.actions > maxActions) {
              maxActions = day.actions;
              maxDate = day.date;
            }
          }
          stats.mostProductiveDay = maxDate || 'none';
        }
      } catch { /* non-critical */ }
    } catch (err) {
      log.warn('[StatsDashboard] Compute error:', err);
    }

    try {
      db.prepare(
        `INSERT INTO stats_summary (id, data, computed_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = ?, computed_at = ?`
      ).run(JSON.stringify(stats), stats.computedAt, JSON.stringify(stats), stats.computedAt);
    } catch { /* non-critical */ }

    return stats;
  }

  getCachedStats(): LifetimeStats | null {
    const db = this.getDb();
    if (!db) return null;
    try {
      const row = db.prepare('SELECT data FROM stats_summary WHERE id = 1').get();
      if (row) return JSON.parse(row.data);
    } catch { /* non-critical */ }
    return null;
  }

  recordUsageDay(): void {
    const db = this.getDb();
    if (!db) return;
    const today = new Date().toISOString().split('T')[0];
    db.prepare(
      `INSERT INTO usage_days (date, actions) VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET actions = actions + 1`
    ).run(today);
  }

  private registerIPC(): void {
    ipcMain.handle('stats-dashboard:compute', async () => {
      return this.computeStats();
    });

    ipcMain.handle('stats-dashboard:getCached', async () => {
      return this.getCachedStats();
    });

    ipcMain.handle('stats-dashboard:recordUsage', async () => {
      this.recordUsageDay();
    });
  }
}

export const statisticsDashboardManager = new StatisticsDashboardManager();
