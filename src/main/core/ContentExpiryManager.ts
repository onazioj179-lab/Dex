// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Content Expiry Manager (Feature 13)
// Marks items with expiry dates, auto-moves to recycle bin when expired.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface ContentExpiry {
  id: number;
  app: string;
  item_type: string;
  item_id: string;
  item_name: string;
  expires_at: number;
  created: number;
}

class ContentExpiryManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[ContentExpiry] Content expiry manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS content_expiry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_content_expiry_expires ON content_expiry(expires_at);
      CREATE INDEX IF NOT EXISTS idx_content_expiry_item ON content_expiry(app, item_id);
    `);
  }

  setExpiry(app: string, itemType: string, itemId: string, itemName: string, expiresAt: number): number {
    const db = this.getDb();
    if (!db) return -1;

    const existing = db.prepare(
      'SELECT id FROM content_expiry WHERE app = ? AND item_id = ?'
    ).get(app, itemId);

    if (existing) {
      db.prepare('UPDATE content_expiry SET expires_at = ?, item_name = ? WHERE id = ?')
        .run(expiresAt, itemName, existing.id);
      return existing.id;
    }

    const result = db.prepare(
      `INSERT INTO content_expiry (app, item_type, item_id, item_name, expires_at, created)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(app, itemType, itemId, itemName, expiresAt, Date.now());
    return Number(result.lastInsertRowid);
  }

  removeExpiry(app: string, itemId: string): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('DELETE FROM content_expiry WHERE app = ? AND item_id = ?').run(app, itemId);
    return true;
  }

  getExpiry(app: string, itemId: string): ContentExpiry | null {
    const db = this.getDb();
    if (!db) return null;
    return db.prepare(
      'SELECT * FROM content_expiry WHERE app = ? AND item_id = ?'
    ).get(app, itemId) as ContentExpiry | null;
  }

  getAllExpiries(): ContentExpiry[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM content_expiry ORDER BY expires_at ASC'
    ).all() as ContentExpiry[];
  }

  processExpiredItems(): Array<{ app: string; itemId: string; itemName: string }> {
    const db = this.getDb();
    if (!db) return [];

    const now = Date.now();
    const expired = db.prepare(
      'SELECT * FROM content_expiry WHERE expires_at <= ?'
    ).all(now) as ContentExpiry[];

    const processed: Array<{ app: string; itemId: string; itemName: string }> = [];

    for (const item of expired) {
      try {
        const expiresAt30Days = now + (30 * 86400000);
        db.prepare(
          `INSERT INTO recycle_bin (app, item_type, item_name, item_data, original_location, deleted_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(item.app, item.item_type, item.item_name,
          JSON.stringify({ expired: true, item_id: item.item_id, source: 'content-expiry' }),
          `${item.app}/${item.item_type}`, now, expiresAt30Days);

        db.prepare('DELETE FROM content_expiry WHERE id = ?').run(item.id);
        processed.push({ app: item.app, itemId: item.item_id, itemName: item.item_name });
      } catch (err) {
        log.warn('[ContentExpiry] Error processing expired item:', err);
      }
    }

    if (processed.length > 0) {
      log.info(`[ContentExpiry] Processed ${processed.length} expired items`);
    }
    return processed;
  }

  private registerIPC(): void {
    ipcMain.handle('content-expiry:set', async (_event, app: string, itemType: string, itemId: string, itemName: string, expiresAt: number) => {
      return this.setExpiry(app, itemType, itemId, itemName, expiresAt);
    });

    ipcMain.handle('content-expiry:remove', async (_event, app: string, itemId: string) => {
      return this.removeExpiry(app, itemId);
    });

    ipcMain.handle('content-expiry:get', async (_event, app: string, itemId: string) => {
      return this.getExpiry(app, itemId);
    });

    ipcMain.handle('content-expiry:getAll', async () => {
      return this.getAllExpiries();
    });

    ipcMain.handle('content-expiry:processExpired', async () => {
      return this.processExpiredItems();
    });
  }
}

export const contentExpiryManager = new ContentExpiryManager();
