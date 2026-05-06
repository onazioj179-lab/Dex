// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Color Label Manager (Feature 31)
// Color label system with 8 predefined colors for organizing items.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';
import { dexEventBus } from './DexEventBus';

interface ColorLabel {
  id: number;
  app: string;
  item_type: string;
  item_id: string;
  item_name: string;
  color: string;
  label: string;
  created_at: string;
}

const COLOR_PALETTE = [
  { key: 'red', hex: '#EF4444', name: 'Red' },
  { key: 'orange', hex: '#F97316', name: 'Orange' },
  { key: 'yellow', hex: '#EAB308', name: 'Yellow' },
  { key: 'green', hex: '#22C55E', name: 'Green' },
  { key: 'blue', hex: '#3B82F6', name: 'Blue' },
  { key: 'purple', hex: '#A855F7', name: 'Purple' },
  { key: 'pink', hex: '#EC4899', name: 'Pink' },
  { key: 'gray', hex: '#6B7280', name: 'Gray' },
] as const;

class ColorLabelManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[ColorLabels] Color label manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS color_labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(app, item_type, item_id)
      );
      CREATE INDEX IF NOT EXISTS idx_color_labels_app ON color_labels(app);
      CREATE INDEX IF NOT EXISTS idx_color_labels_color ON color_labels(color);
    `);
  }

  setLabel(app: string, itemType: string, itemId: string, itemName: string, color: string, label: string = ''): ColorLabel | null {
    const db = this.getDb();
    if (!db) return null;

    const validColor = COLOR_PALETTE.find(c => c.key === color);
    if (!validColor) return null;

    db.prepare(
      `INSERT INTO color_labels (app, item_type, item_id, item_name, color, label)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(app, item_type, item_id) DO UPDATE SET
         item_name = excluded.item_name,
         color = excluded.color,
         label = excluded.label`
    ).run(app, itemType, itemId, itemName, color, label.trim());

    const result = db.prepare(
      'SELECT * FROM color_labels WHERE app = ? AND item_type = ? AND item_id = ?'
    ).get(app, itemType, itemId) as ColorLabel;

    dexEventBus.emit('color-label-changed', 'color-labels', { app, itemType, itemId, color, label });

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('color-labels:changed', { app, itemType, itemId, color, label });
    }

    return result;
  }

  removeLabel(app: string, itemType: string, itemId: string): boolean {
    const db = this.getDb();
    if (!db) return false;
    const result = db.prepare(
      'DELETE FROM color_labels WHERE app = ? AND item_type = ? AND item_id = ?'
    ).run(app, itemType, itemId);
    return result.changes > 0;
  }

  getLabel(app: string, itemType: string, itemId: string): ColorLabel | null {
    const db = this.getDb();
    if (!db) return null;
    return db.prepare(
      'SELECT * FROM color_labels WHERE app = ? AND item_type = ? AND item_id = ?'
    ).get(app, itemType, itemId) as ColorLabel | null;
  }

  getLabelsByColor(app: string, color: string): ColorLabel[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM color_labels WHERE app = ? AND color = ? ORDER BY item_name ASC'
    ).all(app, color) as ColorLabel[];
  }

  getLabelsByApp(app: string): ColorLabel[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM color_labels WHERE app = ? ORDER BY color ASC, item_name ASC'
    ).all(app) as ColorLabel[];
  }

  getAllLabels(): ColorLabel[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM color_labels ORDER BY app ASC, color ASC, item_name ASC'
    ).all() as ColorLabel[];
  }

  getColorPalette(): Array<{ key: string; hex: string; name: string }> {
    return [...COLOR_PALETTE];
  }

  getColorStats(app?: string): Array<{ color: string; count: number }> {
    const db = this.getDb();
    if (!db) return [];
    if (app) {
      return db.prepare(
        'SELECT color, COUNT(*) as count FROM color_labels WHERE app = ? GROUP BY color ORDER BY count DESC'
      ).all(app) as any[];
    }
    return db.prepare(
      'SELECT color, COUNT(*) as count FROM color_labels GROUP BY color ORDER BY count DESC'
    ).all() as any[];
  }

  bulkSetColor(app: string, itemType: string, itemIds: string[], color: string, label: string = ''): number {
    const db = this.getDb();
    if (!db) return 0;

    const validColor = COLOR_PALETTE.find(c => c.key === color);
    if (!validColor) return 0;

    let count = 0;
    const insertStmt = db.prepare(
      `INSERT INTO color_labels (app, item_type, item_id, item_name, color, label)
       VALUES (?, ?, ?, '', ?, ?)
       ON CONFLICT(app, item_type, item_id) DO UPDATE SET
         color = excluded.color,
         label = excluded.label`
    );

    const transaction = db.transaction(() => {
      for (const itemId of itemIds) {
        insertStmt.run(app, itemType, itemId, color, label.trim());
        count++;
      }
    });

    transaction();
    return count;
  }

  private registerIPC(): void {
    ipcMain.handle('color-labels:set', async (_event, app: string, itemType: string, itemId: string, itemName: string, color: string, label?: string) => {
      return this.setLabel(app, itemType, itemId, itemName, color, label);
    });

    ipcMain.handle('color-labels:remove', async (_event, app: string, itemType: string, itemId: string) => {
      return this.removeLabel(app, itemType, itemId);
    });

    ipcMain.handle('color-labels:get', async (_event, app: string, itemType: string, itemId: string) => {
      return this.getLabel(app, itemType, itemId);
    });

    ipcMain.handle('color-labels:getByColor', async (_event, app: string, color: string) => {
      return this.getLabelsByColor(app, color);
    });

    ipcMain.handle('color-labels:getByApp', async (_event, app: string) => {
      return this.getLabelsByApp(app);
    });

    ipcMain.handle('color-labels:getAll', async () => {
      return this.getAllLabels();
    });

    ipcMain.handle('color-labels:getPalette', async () => {
      return this.getColorPalette();
    });

    ipcMain.handle('color-labels:getStats', async (_event, app?: string) => {
      return this.getColorStats(app);
    });

    ipcMain.handle('color-labels:bulkSet', async (_event, app: string, itemType: string, itemIds: string[], color: string, label?: string) => {
      return this.bulkSetColor(app, itemType, itemIds, color, label);
    });
  }
}

export const colorLabelManager = new ColorLabelManager();
