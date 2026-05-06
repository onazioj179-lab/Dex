// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Daily Briefing Manager (Feature 3)
// Non-blocking panel at first launch each day showing summary data.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface BriefingData {
  date: string;
  unfinishedTasks: Array<{ app: string; name: string; id: string }>;
  unfinishedVinxProjects: Array<{ name: string; id: string }>;
  unseenNotes: Array<{ name: string; id: string }>;
  dueTodayTasks: Array<{ app: string; name: string; id: string }>;
  focusSummary: { totalMinutes: number; sessionCount: number; avgScore: number };
  suggestedAction: string;
}

class DailyBriefingManager {
  private mainWindow: BrowserWindow | null = null;
  private briefingCache: BriefingData | null = null;
  private briefingEnabled: boolean = true;
  private dismissedToday: boolean = false;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.loadSettings();
    this.registerIPC();
    log.info('[DailyBriefing] Daily briefing manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_briefing_log (
        date TEXT PRIMARY KEY,
        shown INTEGER DEFAULT 0,
        dismissed INTEGER DEFAULT 0
      );
    `);
  }

  private loadSettings(): void {
    const db = this.getDb();
    if (!db) return;
    const val = databaseManager.getSetting('daily_briefing_enabled', 'true');
    this.briefingEnabled = val !== 'false';
  }

  private getTodayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  shouldShowBriefing(): boolean {
    if (!this.briefingEnabled || this.dismissedToday) return false;
    const db = this.getDb();
    if (!db) return false;

    const today = this.getTodayStr();
    const row = db.prepare('SELECT shown FROM daily_briefing_log WHERE date = ?').get(today);
    return !row || row.shown === 0;
  }

  markShown(): void {
    const db = this.getDb();
    if (!db) return;
    const today = this.getTodayStr();
    db.prepare(
      `INSERT INTO daily_briefing_log (date, shown) VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET shown = 1`
    ).run(today);
  }

  dismissForToday(): void {
    this.dismissedToday = true;
    const db = this.getDb();
    if (!db) return;
    const today = this.getTodayStr();
    db.prepare(
      `INSERT INTO daily_briefing_log (date, shown, dismissed) VALUES (?, 1, 1)
       ON CONFLICT(date) DO UPDATE SET dismissed = 1`
    ).run(today);
  }

  computeBriefing(): BriefingData {
    const db = this.getDb();
    const today = this.getTodayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const briefing: BriefingData = {
      date: today,
      unfinishedTasks: [],
      unfinishedVinxProjects: [],
      unseenNotes: [],
      dueTodayTasks: [],
      focusSummary: { totalMinutes: 0, sessionCount: 0, avgScore: 0 },
      suggestedAction: 'Review your tasks and start with the most important one.',
    };

    if (!db) return briefing;

    try {
      const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'tasks_data'").get();
      if (settingsRow) {
        try {
          const tasks = JSON.parse(settingsRow.value);
          if (Array.isArray(tasks)) {
            briefing.unfinishedTasks = tasks.filter((t: any) =>
              t.dueDate && t.dueDate === yesterday && t.status !== 'completed'
            ).map((t: any) => ({ app: t.app || 'tasks', name: t.title || t.name, id: t.id }));

            briefing.dueTodayTasks = tasks.filter((t: any) =>
              t.dueDate && t.dueDate === today && t.status !== 'completed'
            ).map((t: any) => ({ app: t.app || 'tasks', name: t.title || t.name, id: t.id }));
          }
        } catch { /* non-critical */ }
      }

      const focusRow = db.prepare("SELECT value FROM settings WHERE key = 'focus_sessions'").get();
      if (focusRow) {
        try {
          const sessions = JSON.parse(focusRow.value);
          if (Array.isArray(sessions)) {
            const yesterdaySessions = sessions.filter((s: any) =>
              s.date === yesterday || (s.timestamp && new Date(s.timestamp).toISOString().split('T')[0] === yesterday)
            );
            const totalMs = yesterdaySessions.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
            const avgScore = yesterdaySessions.length > 0
              ? Math.round(yesterdaySessions.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / yesterdaySessions.length)
              : 0;
            briefing.focusSummary = {
              totalMinutes: Math.round(totalMs / 60000),
              sessionCount: yesterdaySessions.length,
              avgScore,
            };
          }
        } catch { /* non-critical */ }
      }

      const dayOfWeek = new Date().getDay();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      if (briefing.dueTodayTasks.length > 0) {
        briefing.suggestedAction = `Start with "${briefing.dueTodayTasks[0].name}" which is due today.`;
      } else if (briefing.unfinishedTasks.length > 0) {
        briefing.suggestedAction = `Finish "${briefing.unfinishedTasks[0].name}" from yesterday.`;
      } else {
        briefing.suggestedAction = `${dayNames[dayOfWeek]} focus: review your projects and plan your day.`;
      }
    } catch (err) {
      log.warn('[DailyBriefing] Error computing briefing:', err);
    }

    this.briefingCache = briefing;
    return briefing;
  }

  setEnabled(enabled: boolean): void {
    this.briefingEnabled = enabled;
    databaseManager.setSetting('daily_briefing_enabled', enabled ? 'true' : 'false');
  }

  isEnabled(): boolean {
    return this.briefingEnabled;
  }

  private registerIPC(): void {
    ipcMain.handle('daily-briefing:shouldShow', async () => {
      return this.shouldShowBriefing();
    });

    ipcMain.handle('daily-briefing:getData', async () => {
      return this.briefingCache || this.computeBriefing();
    });

    ipcMain.handle('daily-briefing:markShown', async () => {
      this.markShown();
    });

    ipcMain.handle('daily-briefing:dismiss', async () => {
      this.dismissForToday();
    });

    ipcMain.handle('daily-briefing:setEnabled', async (_event, enabled: boolean) => {
      this.setEnabled(enabled);
    });

    ipcMain.handle('daily-briefing:isEnabled', async () => {
      return this.isEnabled();
    });
  }
}

export const dailyBriefingManager = new DailyBriefingManager();
