// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Full Text Index Manager (Feature 29)
// FTS5 virtual table for universal full-text search with BM25 ranking.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

interface SearchResult {
  id: string;
  app: string;
  item_type: string;
  item_id: string;
  title: string;
  body: string;
  rank: number;
}

class FullTextIndexManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[FullTextIndex] Full text index manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS universal_fts USING fts5(
        app,
        item_type,
        item_id,
        title,
        body,
        content='universal_index',
        content_rowid='id',
        tokenize='porter unicode61'
      );
      CREATE TABLE IF NOT EXISTS universal_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(app, item_type, item_id)
      );
      CREATE INDEX IF NOT EXISTS idx_universal_app ON universal_index(app);
      CREATE INDEX IF NOT EXISTS idx_universal_type ON universal_index(item_type);
    `);

    // Create triggers for automatic FTS sync
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS universal_index_ai AFTER INSERT ON universal_index BEGIN
        INSERT INTO universal_fts(rowid, app, item_type, item_id, title, body)
        VALUES (new.id, new.app, new.item_type, new.item_id, new.title, new.body);
      END;
      CREATE TRIGGER IF NOT EXISTS universal_index_ad AFTER DELETE ON universal_index BEGIN
        INSERT INTO universal_fts(universal_fts, rowid, app, item_type, item_id, title, body)
        VALUES ('delete', old.id, old.app, old.item_type, old.item_id, old.title, old.body);
      END;
      CREATE TRIGGER IF NOT EXISTS universal_index_au AFTER UPDATE ON universal_index BEGIN
        INSERT INTO universal_fts(universal_fts, rowid, app, item_type, item_id, title, body)
        VALUES ('delete', old.id, old.app, old.item_type, old.item_id, old.title, old.body);
        INSERT INTO universal_fts(rowid, app, item_type, item_id, title, body)
        VALUES (new.id, new.app, new.item_type, new.item_id, new.title, new.body);
      END;
    `);
  }

  index(app: string, itemType: string, itemId: string, title: string, body: string): boolean {
    const db = this.getDb();
    if (!db) return false;

    db.prepare(
      `INSERT INTO universal_index (app, item_type, item_id, title, body, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(app, item_type, item_id) DO UPDATE SET
         title = excluded.title,
         body = excluded.body,
         updated_at = datetime('now')`
    ).run(app, itemType, itemId, title, body);

    return true;
  }

  removeFromIndex(app: string, itemType: string, itemId: string): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare(
      'DELETE FROM universal_index WHERE app = ? AND item_type = ? AND item_id = ?'
    ).run(app, itemType, itemId);
    return true;
  }

  search(query: string, options?: { app?: string; itemType?: string; limit?: number }): SearchResult[] {
    const db = this.getDb();
    if (!db) return [];

    const trimmed = query.trim();
    if (!trimmed) return [];

    const limit = Math.min(options?.limit || 50, 200);

    // Sanitize query for FTS5 - escape special characters
    const safeQuery = trimmed.replace(/["\-\[\]{}()*+?.,\\^$|#]/g, ' ').trim();
    if (!safeQuery) return [];

    let sql = `
      SELECT ui.id, ui.app, ui.item_type, ui.item_id, ui.title, ui.body,
             bm25(universal_fts) as rank
      FROM universal_fts f
      JOIN universal_index ui ON ui.id = f.rowid
      WHERE universal_fts MATCH ?
    `;
    const params: any[] = [safeQuery];

    if (options?.app) {
      sql += ' AND ui.app = ?';
      params.push(options.app);
    }
    if (options?.itemType) {
      sql += ' AND ui.item_type = ?';
      params.push(options.itemType);
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    try {
      return db.prepare(sql).all(...params) as SearchResult[];
    } catch (e: any) {
      log.warn(`[FullTextIndex] Search error: ${e.message}`);
      return [];
    }
  }

  rebuildIndex(): number {
    const db = this.getDb();
    if (!db) return 0;

    let count = 0;

    // Index from version_history
    try {
      const versions = db.prepare(
        'SELECT DISTINCT app, project_name, data FROM version_history'
      ).all();
      for (const v of versions as any[]) {
        try {
          const data = JSON.parse(v.data || '{}');
          const body = this.extractText(data);
          this.index(v.app, 'project', v.project_name, v.project_name, body);
          count++;
        } catch (_e) { /* skip bad data */ }
      }
    } catch (_e) { /* table may not exist */ }

    // Index from scratchpad
    try {
      const notes = db.prepare('SELECT * FROM scratchpad').all();
      for (const n of notes as any[]) {
        this.index('scratchpad', 'note', String(n.id), n.title || '', n.content || '');
        count++;
      }
    } catch (_e) { /* table may not exist */ }

    // Index from daily_notes
    try {
      const dailyNotes = db.prepare('SELECT * FROM daily_notes').all();
      for (const n of dailyNotes as any[]) {
        this.index('daily-notes', 'daily-note', String(n.id), n.title || '', n.content || '');
        count++;
      }
    } catch (_e) { /* table may not exist */ }

    log.info(`[FullTextIndex] Rebuilt index with ${count} items`);
    return count;
  }

  private extractText(obj: any, depth: number = 0): string {
    if (depth > 5) return '';
    if (obj === null || obj === undefined) return '';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (Array.isArray(obj)) {
      return obj.map(item => this.extractText(item, depth + 1)).join(' ');
    }
    if (typeof obj === 'object') {
      return Object.values(obj).map(v => this.extractText(v, depth + 1)).join(' ');
    }
    return '';
  }

  getIndexStats(): { totalItems: number; byApp: Record<string, number>; byType: Record<string, number> } {
    const db = this.getDb();
    if (!db) return { totalItems: 0, byApp: {}, byType: {} };

    const total = db.prepare('SELECT COUNT(*) as cnt FROM universal_index').get() as any;
    const byApp = db.prepare('SELECT app, COUNT(*) as cnt FROM universal_index GROUP BY app').all() as any[];
    const byType = db.prepare('SELECT item_type, COUNT(*) as cnt FROM universal_index GROUP BY item_type').all() as any[];

    return {
      totalItems: total?.cnt || 0,
      byApp: Object.fromEntries(byApp.map(r => [r.app, r.cnt])),
      byType: Object.fromEntries(byType.map(r => [r.item_type, r.cnt])),
    };
  }

  private registerIPC(): void {
    ipcMain.handle('fts:index', async (_event, app: string, itemType: string, itemId: string, title: string, body: string) => {
      return this.index(app, itemType, itemId, title, body);
    });

    ipcMain.handle('fts:remove', async (_event, app: string, itemType: string, itemId: string) => {
      return this.removeFromIndex(app, itemType, itemId);
    });

    ipcMain.handle('fts:search', async (_event, query: string, options?: any) => {
      return this.search(query, options);
    });

    ipcMain.handle('fts:rebuild', async () => {
      return this.rebuildIndex();
    });

    ipcMain.handle('fts:stats', async () => {
      return this.getIndexStats();
    });
  }
}

export const fullTextIndexManager = new FullTextIndexManager();
