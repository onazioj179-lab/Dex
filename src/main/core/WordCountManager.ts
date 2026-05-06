// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Word Count Manager (Feature 23)
// System-wide word count tracking across all text content.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface WordCountEntry {
  id: number;
  app: string;
  date: string;
  words: number;
  session_id: string;
}

class WordCountManager {
  private mainWindow: BrowserWindow | null = null;
  private dailyGoal: number = 0;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.loadGoal();
    this.registerIPC();
    log.info('[WordCount] Word count manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS word_count_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        date TEXT NOT NULL,
        words INTEGER NOT NULL,
        session_id TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_word_count_date ON word_count_log(date);
      CREATE INDEX IF NOT EXISTS idx_word_count_app ON word_count_log(app);
    `);
  }

  private loadGoal(): void {
    const val = databaseManager.getSetting('word_count_daily_goal', '0');
    this.dailyGoal = parseInt(val, 10) || 0;
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  recordWordDelta(app: string, oldText: string, newText: string, sessionId: string = ''): number {
    const oldCount = this.countWords(oldText || '');
    const newCount = this.countWords(newText || '');
    const delta = newCount - oldCount;

    if (delta === 0) return 0;

    const db = this.getDb();
    if (!db) return delta;

    const today = new Date().toISOString().split('T')[0];
    db.prepare(
      'INSERT INTO word_count_log (app, date, words, session_id) VALUES (?, ?, ?, ?)'
    ).run(app, today, delta, sessionId);

    return delta;
  }

  getTodayCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    const today = new Date().toISOString().split('T')[0];
    const row = db.prepare(
      'SELECT SUM(words) as total FROM word_count_log WHERE date = ?'
    ).get(today);
    return Math.max(0, row?.total || 0);
  }

  getWeekCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const row = db.prepare(
      'SELECT SUM(words) as total FROM word_count_log WHERE date >= ?'
    ).get(weekAgo);
    return Math.max(0, row?.total || 0);
  }

  getAllTimeCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    const row = db.prepare('SELECT SUM(words) as total FROM word_count_log').get();
    return Math.max(0, row?.total || 0);
  }

  getDailyHistory(days: number = 90): Array<{ date: string; words: number }> {
    const db = this.getDb();
    if (!db) return [];
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    return db.prepare(
      `SELECT date, SUM(words) as words FROM word_count_log
       WHERE date >= ? GROUP BY date ORDER BY date ASC`
    ).all(cutoff) as any[];
  }

  setDailyGoal(goal: number): void {
    this.dailyGoal = Math.max(0, goal);
    databaseManager.setSetting('word_count_daily_goal', String(this.dailyGoal));
  }

  getDailyGoal(): number {
    return this.dailyGoal;
  }

  getDailyGoalProgress(): { current: number; goal: number; percentage: number } {
    const current = this.getTodayCount();
    return {
      current,
      goal: this.dailyGoal,
      percentage: this.dailyGoal > 0 ? Math.min(100, Math.round((current / this.dailyGoal) * 100)) : 0,
    };
  }

  private registerIPC(): void {
    ipcMain.handle('word-count:record', async (_event, app: string, oldText: string, newText: string, sessionId?: string) => {
      return this.recordWordDelta(app, oldText, newText, sessionId);
    });

    ipcMain.handle('word-count:getToday', async () => {
      return this.getTodayCount();
    });

    ipcMain.handle('word-count:getWeek', async () => {
      return this.getWeekCount();
    });

    ipcMain.handle('word-count:getAllTime', async () => {
      return this.getAllTimeCount();
    });

    ipcMain.handle('word-count:getHistory', async (_event, days?: number) => {
      return this.getDailyHistory(days);
    });

    ipcMain.handle('word-count:setGoal', async (_event, goal: number) => {
      this.setDailyGoal(goal);
    });

    ipcMain.handle('word-count:getGoal', async () => {
      return this.getDailyGoal();
    });

    ipcMain.handle('word-count:getProgress', async () => {
      return this.getDailyGoalProgress();
    });
  }
}

export const wordCountManager = new WordCountManager();
