// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Read Later Manager (Feature 32)
// Queue for saving items to read or review later.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

interface ReadLaterItem {
  id: number;
  app: string;
  item_type: string;
  item_id: string;
  title: string;
  url: string;
  notes: string;
  priority: string;
  read: number;
  read_at: string | null;
  created_at: string;
}

class ReadLaterManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[ReadLater] Read later manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS read_later (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL DEFAULT '',
        item_type TEXT NOT NULL DEFAULT 'link',
        item_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        read INTEGER NOT NULL DEFAULT 0,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_read_later_read ON read_later(read);
      CREATE INDEX IF NOT EXISTS idx_read_later_priority ON read_later(priority);
    `);
  }

  add(params: {
    app?: string;
    itemType?: string;
    itemId?: string;
    title: string;
    url?: string;
    notes?: string;
    priority?: string;
  }): ReadLaterItem | null {
    const db = this.getDb();
    if (!db) return null;

    const trimmed = params.title.trim();
    if (!trimmed) return null;

    const priority = ['low', 'normal', 'high'].includes(params.priority || '') ? params.priority : 'normal';

    const result = db.prepare(
      `INSERT INTO read_later (app, item_type, item_id, title, url, notes, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.app || '',
      params.itemType || 'link',
      params.itemId || '',
      trimmed,
      params.url || '',
      params.notes || '',
      priority,
    );

    return db.prepare('SELECT * FROM read_later WHERE id = ?').get(result.lastInsertRowid) as ReadLaterItem;
  }

  markRead(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('UPDATE read_later SET read = 1, read_at = datetime("now") WHERE id = ?').run(id);
    return true;
  }

  markUnread(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('UPDATE read_later SET read = 0, read_at = NULL WHERE id = ?').run(id);
    return true;
  }

  updateNotes(id: number, notes: string): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('UPDATE read_later SET notes = ? WHERE id = ?').run(notes, id);
    return true;
  }

  setPriority(id: number, priority: string): boolean {
    const db = this.getDb();
    if (!db) return false;
    if (!['low', 'normal', 'high'].includes(priority)) return false;
    db.prepare('UPDATE read_later SET priority = ? WHERE id = ?').run(priority, id);
    return true;
  }

  remove(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('DELETE FROM read_later WHERE id = ?').run(id);
    return true;
  }

  getAll(includeRead: boolean = false): ReadLaterItem[] {
    const db = this.getDb();
    if (!db) return [];
    if (includeRead) {
      return db.prepare(
        `SELECT * FROM read_later ORDER BY
         CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END,
         created_at DESC`
      ).all() as ReadLaterItem[];
    }
    return db.prepare(
      `SELECT * FROM read_later WHERE read = 0 ORDER BY
       CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END,
       created_at DESC`
    ).all() as ReadLaterItem[];
  }

  getUnreadCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    const row = db.prepare('SELECT COUNT(*) as cnt FROM read_later WHERE read = 0').get() as any;
    return row?.cnt || 0;
  }

  search(query: string): ReadLaterItem[] {
    const db = this.getDb();
    if (!db) return [];
    const pattern = `%${query.trim()}%`;
    return db.prepare(
      'SELECT * FROM read_later WHERE title LIKE ? OR notes LIKE ? OR url LIKE ? ORDER BY created_at DESC LIMIT 100'
    ).all(pattern, pattern, pattern) as ReadLaterItem[];
  }

  private registerIPC(): void {
    ipcMain.handle('read-later:add', async (_event, params: any) => {
      return this.add(params);
    });

    ipcMain.handle('read-later:markRead', async (_event, id: number) => {
      return this.markRead(id);
    });

    ipcMain.handle('read-later:markUnread', async (_event, id: number) => {
      return this.markUnread(id);
    });

    ipcMain.handle('read-later:updateNotes', async (_event, id: number, notes: string) => {
      return this.updateNotes(id, notes);
    });

    ipcMain.handle('read-later:setPriority', async (_event, id: number, priority: string) => {
      return this.setPriority(id, priority);
    });

    ipcMain.handle('read-later:remove', async (_event, id: number) => {
      return this.remove(id);
    });

    ipcMain.handle('read-later:getAll', async (_event, includeRead?: boolean) => {
      return this.getAll(includeRead);
    });

    ipcMain.handle('read-later:getUnreadCount', async () => {
      return this.getUnreadCount();
    });

    ipcMain.handle('read-later:search', async (_event, query: string) => {
      return this.search(query);
    });
  }
}

export const readLaterManager = new ReadLaterManager();
