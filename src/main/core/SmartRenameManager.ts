// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Smart Rename Manager (Feature 24)
// Rename projects/items with reference propagation across all linked data.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';
import { dexEventBus } from './DexEventBus';

interface RenameRecord {
  id: number;
  app: string;
  item_type: string;
  item_id: string;
  old_name: string;
  new_name: string;
  references_updated: number;
  renamed_at: string;
}

class SmartRenameManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[SmartRename] Smart rename manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS rename_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        old_name TEXT NOT NULL,
        new_name TEXT NOT NULL,
        references_updated INTEGER NOT NULL DEFAULT 0,
        renamed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_rename_app ON rename_history(app, item_id);
    `);
  }

  rename(app: string, itemType: string, itemId: string, oldName: string, newName: string): { success: boolean; referencesUpdated: number } {
    const db = this.getDb();
    if (!db) return { success: false, referencesUpdated: 0 };

    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) {
      return { success: false, referencesUpdated: 0 };
    }

    let refsUpdated = 0;

    const updateRefs = db.transaction(() => {
      // Update project_links references
      try {
        const linkUpdate1 = db.prepare(
          `UPDATE project_links SET source_id = ? WHERE source_app = ? AND source_id = ?`
        );
        const r1 = linkUpdate1.run(trimmed, app, itemId);
        refsUpdated += r1.changes;

        const linkUpdate2 = db.prepare(
          `UPDATE project_links SET target_id = ? WHERE target_app = ? AND target_id = ?`
        );
        const r2 = linkUpdate2.run(trimmed, app, itemId);
        refsUpdated += r2.changes;
      } catch (_e) { /* table may not exist */ }

      // Update version_history references
      try {
        const verUpdate = db.prepare(
          `UPDATE version_history SET project_name = ? WHERE app = ? AND project_name = ?`
        );
        const r3 = verUpdate.run(trimmed, app, oldName);
        refsUpdated += r3.changes;
      } catch (_e) { /* table may not exist */ }

      // Update project_health references
      try {
        const healthUpdate = db.prepare(
          `UPDATE project_health SET project_name = ? WHERE app = ? AND project_name = ?`
        );
        const r4 = healthUpdate.run(trimmed, app, oldName);
        refsUpdated += r4.changes;
      } catch (_e) { /* table may not exist */ }

      // Update time_tracking references
      try {
        const timeUpdate = db.prepare(
          `UPDATE time_tracking SET project_name = ? WHERE app = ? AND project_name = ?`
        );
        const r5 = timeUpdate.run(trimmed, app, oldName);
        refsUpdated += r5.changes;
      } catch (_e) { /* table may not exist */ }

      // Update color_labels references
      try {
        const clUpdate = db.prepare(
          `UPDATE color_labels SET item_name = ? WHERE app = ? AND item_name = ?`
        );
        const r6 = clUpdate.run(trimmed, app, oldName);
        refsUpdated += r6.changes;
      } catch (_e) { /* table may not exist */ }

      // Record the rename
      db.prepare(
        `INSERT INTO rename_history (app, item_type, item_id, old_name, new_name, references_updated)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(app, itemType, itemId, oldName, trimmed, refsUpdated);
    });

    updateRefs();

    dexEventBus.emit('item-renamed', 'smart-rename', { app, itemType, itemId, oldName, newName: trimmed, referencesUpdated: refsUpdated });

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('smart-rename:completed', {
        app, itemType, itemId, oldName, newName: trimmed, referencesUpdated: refsUpdated,
      });
    }

    log.info(`[SmartRename] Renamed "${oldName}" -> "${trimmed}" in ${app}, updated ${refsUpdated} refs`);
    return { success: true, referencesUpdated: refsUpdated };
  }

  getHistory(app?: string, limit: number = 100): RenameRecord[] {
    const db = this.getDb();
    if (!db) return [];
    if (app) {
      return db.prepare(
        'SELECT * FROM rename_history WHERE app = ? ORDER BY renamed_at DESC LIMIT ?'
      ).all(app, limit) as RenameRecord[];
    }
    return db.prepare(
      'SELECT * FROM rename_history ORDER BY renamed_at DESC LIMIT ?'
    ).all(limit) as RenameRecord[];
  }

  private registerIPC(): void {
    ipcMain.handle('smart-rename:rename', async (_event, app: string, itemType: string, itemId: string, oldName: string, newName: string) => {
      return this.rename(app, itemType, itemId, oldName, newName);
    });

    ipcMain.handle('smart-rename:getHistory', async (_event, app?: string, limit?: number) => {
      return this.getHistory(app, limit);
    });
  }
}

export const smartRenameManager = new SmartRenameManager();
