// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Search History Manager (Feature 14)
// Records every search query and result click across all inner apps.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface SearchHistoryEntry {
  id: number;
  app: string;
  query: string;
  result_clicked: string;
  result_type: string;
  timestamp: number;
}

class SearchHistoryManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[SearchHistory] Search history manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        query TEXT NOT NULL,
        result_clicked TEXT DEFAULT '',
        result_type TEXT DEFAULT '',
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_search_history_timestamp ON search_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_search_history_app ON search_history(app);
      CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history(query);
    `);
  }

  recordSearch(app: string, query: string, resultClicked: string = '', resultType: string = ''): number {
    const db = this.getDb();
    if (!db) return -1;

    const trimmed = query.trim();
    if (trimmed.length === 0) return -1;

    const result = db.prepare(
      `INSERT INTO search_history (app, query, result_clicked, result_type, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(app, trimmed, resultClicked, resultType, Date.now());
    return Number(result.lastInsertRowid);
  }

  getHistory(limit: number = 200): SearchHistoryEntry[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM search_history ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as SearchHistoryEntry[];
  }

  getHistoryByApp(app: string, limit: number = 50): SearchHistoryEntry[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM search_history WHERE app = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(app, limit) as SearchHistoryEntry[];
  }

  getFrequentQueries(limit: number = 20): Array<{ query: string; count: number }> {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      `SELECT query, COUNT(*) as count FROM search_history
       GROUP BY query ORDER BY count DESC LIMIT ?`
    ).all(limit) as any[];
  }

  clearHistory(): number {
    const db = this.getDb();
    if (!db) return 0;
    const result = db.prepare('DELETE FROM search_history').run();
    return result.changes;
  }

  private registerIPC(): void {
    ipcMain.handle('search-history:record', async (_event, app: string, query: string, resultClicked?: string, resultType?: string) => {
      return this.recordSearch(app, query, resultClicked, resultType);
    });

    ipcMain.handle('search-history:getHistory', async (_event, limit?: number) => {
      return this.getHistory(limit);
    });

    ipcMain.handle('search-history:getByApp', async (_event, app: string, limit?: number) => {
      return this.getHistoryByApp(app, limit);
    });

    ipcMain.handle('search-history:getFrequent', async (_event, limit?: number) => {
      return this.getFrequentQueries(limit);
    });

    ipcMain.handle('search-history:clear', async () => {
      return this.clearHistory();
    });
  }
}

export const searchHistoryManager = new SearchHistoryManager();
