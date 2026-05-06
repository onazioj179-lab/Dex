// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Bulk Metadata Editor Manager (Feature 33)
// Batch metadata operations on multiple selected items.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';
import { dexEventBus } from './DexEventBus';

interface BulkOperation {
  id: number;
  operation: string;
  app: string;
  item_count: number;
  details: string;
  executed_at: string;
}

class BulkMetadataManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[BulkMetadata] Bulk metadata editor manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS bulk_operations_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        app TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        details TEXT NOT NULL DEFAULT '{}',
        executed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_bulk_ops_app ON bulk_operations_log(app);
    `);
  }

  bulkSetColor(app: string, itemType: string, itemIds: string[], color: string): number {
    const db = this.getDb();
    if (!db) return 0;

    let count = 0;
    const stmt = db.prepare(
      `INSERT INTO color_labels (app, item_type, item_id, item_name, color, label)
       VALUES (?, ?, ?, '', ?, '')
       ON CONFLICT(app, item_type, item_id) DO UPDATE SET color = excluded.color`
    );

    const transaction = db.transaction(() => {
      for (const id of itemIds) {
        try {
          stmt.run(app, itemType, id, color);
          count++;
        } catch (_e) { /* skip failures */ }
      }
    });

    try { transaction(); } catch (_e) { /* color_labels may not exist */ }

    this.logOperation('bulk-set-color', app, count, { color, itemType });
    return count;
  }

  bulkAddTag(app: string, itemIds: string[], tag: string): number {
    const db = this.getDb();
    if (!db) return 0;

    const trimmedTag = tag.trim();
    if (!trimmedTag) return 0;

    // Tags are stored inline in the settings or project data. We store tag associations.
    let count = 0;

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS item_tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          app TEXT NOT NULL,
          item_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(app, item_id, tag)
        );
        CREATE INDEX IF NOT EXISTS idx_item_tags_app ON item_tags(app, item_id);
        CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag);
      `);
    } catch (_e) { /* already exists */ }

    const stmt = db.prepare(
      `INSERT OR IGNORE INTO item_tags (app, item_id, tag) VALUES (?, ?, ?)`
    );

    const transaction = db.transaction(() => {
      for (const id of itemIds) {
        const r = stmt.run(app, id, trimmedTag);
        if (r.changes > 0) count++;
      }
    });

    transaction();
    this.logOperation('bulk-add-tag', app, count, { tag: trimmedTag });
    return count;
  }

  bulkRemoveTag(app: string, itemIds: string[], tag: string): number {
    const db = this.getDb();
    if (!db) return 0;

    let count = 0;
    try {
      const stmt = db.prepare(
        'DELETE FROM item_tags WHERE app = ? AND item_id = ? AND tag = ?'
      );

      const transaction = db.transaction(() => {
        for (const id of itemIds) {
          const r = stmt.run(app, id, tag);
          count += r.changes;
        }
      });

      transaction();
    } catch (_e) { /* table may not exist */ }

    this.logOperation('bulk-remove-tag', app, count, { tag });
    return count;
  }

  bulkSetExpiry(app: string, itemType: string, itemIds: string[], expiresAt: string): number {
    const db = this.getDb();
    if (!db) return 0;

    let count = 0;
    try {
      const stmt = db.prepare(
        `INSERT INTO content_expiry (app, item_type, item_id, item_name, expires_at)
         VALUES (?, ?, ?, '', ?)
         ON CONFLICT DO NOTHING`
      );

      const transaction = db.transaction(() => {
        for (const id of itemIds) {
          try {
            stmt.run(app, itemType, id, expiresAt);
            count++;
          } catch (_e) { /* skip */ }
        }
      });

      transaction();
    } catch (_e) { /* content_expiry may not exist */ }

    this.logOperation('bulk-set-expiry', app, count, { expiresAt, itemType });
    return count;
  }

  bulkDelete(app: string, itemType: string, itemIds: string[]): number {
    const db = this.getDb();
    if (!db) return 0;

    let count = 0;

    // Move to recycle bin instead of hard delete
    try {
      const stmt = db.prepare(
        `INSERT INTO recycle_bin (app, item_type, item_name, data, deleted_at, expires_at)
         VALUES (?, ?, ?, '{}', datetime('now'), datetime('now', '+30 days'))`
      );

      const transaction = db.transaction(() => {
        for (const id of itemIds) {
          try {
            stmt.run(app, itemType, id);
            count++;
          } catch (_e) { /* skip */ }
        }
      });

      transaction();
    } catch (_e) { /* recycle_bin may not exist */ }

    this.logOperation('bulk-delete', app, count, { itemType });

    dexEventBus.emit('bulk-operation-completed', 'bulk-metadata', { operation: 'delete', app, count });

    return count;
  }

  bulkMoveToReadLater(app: string, items: Array<{ id: string; title: string }>): number {
    const db = this.getDb();
    if (!db) return 0;

    let count = 0;
    try {
      const stmt = db.prepare(
        `INSERT INTO read_later (app, item_type, item_id, title, priority) VALUES (?, 'item', ?, ?, 'normal')`
      );

      const transaction = db.transaction(() => {
        for (const item of items) {
          try {
            stmt.run(app, item.id, item.title);
            count++;
          } catch (_e) { /* skip */ }
        }
      });

      transaction();
    } catch (_e) { /* read_later may not exist */ }

    this.logOperation('bulk-read-later', app, count, {});
    return count;
  }

  getOperationHistory(app?: string, limit: number = 50): BulkOperation[] {
    const db = this.getDb();
    if (!db) return [];
    if (app) {
      return db.prepare(
        'SELECT * FROM bulk_operations_log WHERE app = ? ORDER BY executed_at DESC LIMIT ?'
      ).all(app, limit) as BulkOperation[];
    }
    return db.prepare(
      'SELECT * FROM bulk_operations_log ORDER BY executed_at DESC LIMIT ?'
    ).all(limit) as BulkOperation[];
  }

  private logOperation(operation: string, app: string, itemCount: number, details: any): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare(
      'INSERT INTO bulk_operations_log (operation, app, item_count, details) VALUES (?, ?, ?, ?)'
    ).run(operation, app, itemCount, JSON.stringify(details));
  }

  private registerIPC(): void {
    ipcMain.handle('bulk-metadata:setColor', async (_event, app: string, itemType: string, itemIds: string[], color: string) => {
      return this.bulkSetColor(app, itemType, itemIds, color);
    });

    ipcMain.handle('bulk-metadata:addTag', async (_event, app: string, itemIds: string[], tag: string) => {
      return this.bulkAddTag(app, itemIds, tag);
    });

    ipcMain.handle('bulk-metadata:removeTag', async (_event, app: string, itemIds: string[], tag: string) => {
      return this.bulkRemoveTag(app, itemIds, tag);
    });

    ipcMain.handle('bulk-metadata:setExpiry', async (_event, app: string, itemType: string, itemIds: string[], expiresAt: string) => {
      return this.bulkSetExpiry(app, itemType, itemIds, expiresAt);
    });

    ipcMain.handle('bulk-metadata:delete', async (_event, app: string, itemType: string, itemIds: string[]) => {
      return this.bulkDelete(app, itemType, itemIds);
    });

    ipcMain.handle('bulk-metadata:moveToReadLater', async (_event, app: string, items: Array<{ id: string; title: string }>) => {
      return this.bulkMoveToReadLater(app, items);
    });

    ipcMain.handle('bulk-metadata:history', async (_event, app?: string, limit?: number) => {
      return this.getOperationHistory(app, limit);
    });
  }
}

export const bulkMetadataManager = new BulkMetadataManager();
