// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Recycle Bin Manager
// Single path for all deletions across all inner apps.
// 30-day retention, auto-purge on launch, restore to original location.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface RecycleBinItem {
  id: number;
  app: string;
  item_type: string;
  item_name: string;
  item_data: string;
  original_location: string;
  deleted_at: number;
  expires_at: number;
}

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

class RecycleBinManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    this.purgeExpired();
    log.info('[RecycleBin] Recycle bin manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  deleteItem(app: string, itemType: string, itemName: string, itemData: any, originalLocation: string = ''): number {
    const db = this.getDb();
    if (!db) return -1;

    const now = Date.now();
    const expiresAt = now + RETENTION_MS;
    const dataJson = typeof itemData === 'string' ? itemData : JSON.stringify(itemData);

    const result = db.prepare(
      `INSERT INTO recycle_bin (app, item_type, item_name, item_data, original_location, deleted_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(app, itemType, itemName, dataJson, originalLocation, now, expiresAt);

    this.broadcastCount();
    return Number(result.lastInsertRowid);
  }

  restoreItem(id: number): RecycleBinItem | null {
    const db = this.getDb();
    if (!db) return null;

    const item = db.prepare('SELECT * FROM recycle_bin WHERE id = ?').get(id) as RecycleBinItem | undefined;
    if (!item) return null;

    db.prepare('DELETE FROM recycle_bin WHERE id = ?').run(id);
    this.broadcastCount();

    return item;
  }

  permanentlyDelete(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;

    db.prepare('DELETE FROM recycle_bin WHERE id = ?').run(id);
    this.broadcastCount();
    return true;
  }

  emptyAll(): number {
    const db = this.getDb();
    if (!db) return 0;

    const count = db.prepare('SELECT COUNT(*) as c FROM recycle_bin').get().c;
    db.prepare('DELETE FROM recycle_bin').run();
    this.broadcastCount();
    return count;
  }

  purgeExpired(): number {
    const db = this.getDb();
    if (!db) return 0;

    const now = Date.now();
    const result = db.prepare('DELETE FROM recycle_bin WHERE expires_at <= ?').run(now);
    const purged = result.changes;
    if (purged > 0) {
      log.info(`[RecycleBin] Purged ${purged} expired items`);
    }
    return purged;
  }

  getAll(appFilter?: string): RecycleBinItem[] {
    const db = this.getDb();
    if (!db) return [];

    if (appFilter && appFilter !== 'all') {
      return db.prepare(
        'SELECT * FROM recycle_bin WHERE app = ? ORDER BY deleted_at DESC'
      ).all(appFilter);
    }
    return db.prepare('SELECT * FROM recycle_bin ORDER BY deleted_at DESC').all();
  }

  getCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    return db.prepare('SELECT COUNT(*) as c FROM recycle_bin').get().c;
  }

  getGroupedByApp(): Array<{ app: string; count: number; items: RecycleBinItem[] }> {
    const all = this.getAll();
    const grouped: Map<string, RecycleBinItem[]> = new Map();
    for (const item of all) {
      const list = grouped.get(item.app) || [];
      list.push(item);
      grouped.set(item.app, list);
    }
    return Array.from(grouped.entries()).map(([app, items]) => ({
      app,
      count: items.length,
      items,
    }));
  }

  getItem(id: number): RecycleBinItem | null {
    const db = this.getDb();
    if (!db) return null;
    return db.prepare('SELECT * FROM recycle_bin WHERE id = ?').get(id) || null;
  }

  private broadcastCount(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('recycle-bin:count', this.getCount());
    }
  }

  private registerIPC(): void {
    ipcMain.handle('recycle-bin:delete', (_event, app: string, itemType: string, itemName: string, itemData: any, originalLocation?: string) => {
      return this.deleteItem(app, itemType, itemName, itemData, originalLocation || '');
    });

    ipcMain.handle('recycle-bin:restore', (_event, id: number) => {
      return this.restoreItem(id);
    });

    ipcMain.handle('recycle-bin:permanentlyDelete', (_event, id: number) => {
      return this.permanentlyDelete(id);
    });

    ipcMain.handle('recycle-bin:emptyAll', () => {
      return this.emptyAll();
    });

    ipcMain.handle('recycle-bin:getAll', (_event, appFilter?: string) => {
      return this.getAll(appFilter);
    });

    ipcMain.handle('recycle-bin:getCount', () => {
      return this.getCount();
    });

    ipcMain.handle('recycle-bin:getGrouped', () => {
      return this.getGroupedByApp();
    });

    ipcMain.handle('recycle-bin:getItem', (_event, id: number) => {
      return this.getItem(id);
    });

    ipcMain.handle('recycle-bin:purgeExpired', () => {
      return this.purgeExpired();
    });
  }

  shutdown(): void {
    log.info('[RecycleBin] Shutdown');
  }
}

export const recycleBinManager = new RecycleBinManager();

export function initializeRecycleBin(mainWindow: BrowserWindow): void {
  recycleBinManager.initialize(mainWindow);
}

export function shutdownRecycleBin(): void {
  recycleBinManager.shutdown();
}
