// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Per Project Version History Manager
// Automatic version snapshots for every saveable project in every app.
// Compressed JSON via zlib. Max 50 versions per project.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as zlib from 'zlib';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface VersionRecord {
  id: number;
  app: string;
  project_id: string;
  project_name: string;
  size: number;
  timestamp: number;
  auto_saved: number;
}

export interface VersionRecordFull extends VersionRecord {
  snapshot: Buffer;
}

const MAX_VERSIONS_PER_PROJECT = 50;

class VersionHistoryManager {
  private mainWindow: BrowserWindow | null = null;
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private dirtyProjects: Set<string> = new Set();

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[VersionHistory] Version history manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private compressState(state: any): Buffer {
    const json = JSON.stringify(state);
    return zlib.deflateSync(Buffer.from(json, 'utf8'));
  }

  private decompressState(compressed: Buffer): any {
    const decompressed = zlib.inflateSync(compressed);
    return JSON.parse(decompressed.toString('utf8'));
  }

  saveVersion(appName: string, projectId: string, projectName: string, state: any, autoSaved: boolean): number {
    const db = this.getDb();
    if (!db) return -1;

    const compressed = this.compressState(state);
    const now = Date.now();

    const result = db.prepare(
      `INSERT INTO version_history (app, project_id, project_name, snapshot, size, timestamp, auto_saved)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(appName, projectId, projectName, compressed, compressed.length, now, autoSaved ? 1 : 0);

    this.enforceVersionLimit(appName, projectId);

    const key = `${appName}:${projectId}`;
    this.dirtyProjects.delete(key);

    return Number(result.lastInsertRowid);
  }

  private enforceVersionLimit(appName: string, projectId: string): void {
    const db = this.getDb();
    if (!db) return;

    const count = db.prepare(
      'SELECT COUNT(*) as c FROM version_history WHERE app = ? AND project_id = ?'
    ).get(appName, projectId).c;

    if (count > MAX_VERSIONS_PER_PROJECT) {
      const excess = count - MAX_VERSIONS_PER_PROJECT;
      db.prepare(
        `DELETE FROM version_history WHERE id IN (
          SELECT id FROM version_history WHERE app = ? AND project_id = ?
          ORDER BY timestamp ASC LIMIT ?
        )`
      ).run(appName, projectId, excess);
    }
  }

  getVersions(appName: string, projectId: string): VersionRecord[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      `SELECT id, app, project_id, project_name, size, timestamp, auto_saved
       FROM version_history WHERE app = ? AND project_id = ?
       ORDER BY timestamp DESC`
    ).all(appName, projectId);
  }

  getVersionState(versionId: number): any | null {
    const db = this.getDb();
    if (!db) return null;
    const row = db.prepare('SELECT snapshot FROM version_history WHERE id = ?').get(versionId);
    if (!row || !row.snapshot) return null;
    try {
      return this.decompressState(row.snapshot);
    } catch (err) {
      log.error('[VersionHistory] Failed to decompress version', versionId, err);
      return null;
    }
  }

  restoreVersion(appName: string, projectId: string, versionId: number, currentState: any): { restored: any; backupVersionId: number } | null {
    const db = this.getDb();
    if (!db) return null;

    const record = db.prepare('SELECT * FROM version_history WHERE id = ?').get(versionId);
    if (!record) return null;

    const backupVersionId = this.saveVersion(appName, projectId, record.project_name, currentState, false);

    const restoredState = this.decompressState(record.snapshot);
    return { restored: restoredState, backupVersionId };
  }

  deleteVersion(versionId: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    db.prepare('DELETE FROM version_history WHERE id = ?').run(versionId);
    return true;
  }

  markDirty(appName: string, projectId: string): void {
    const key = `${appName}:${projectId}`;
    this.dirtyProjects.add(key);
  }

  startAutoSave(appName: string, projectId: string, projectName: string, getStateFn: () => any): void {
    const key = `${appName}:${projectId}`;

    if (this.autoSaveTimers.has(key)) {
      clearInterval(this.autoSaveTimers.get(key)!);
    }

    const timer = setInterval(() => {
      if (this.dirtyProjects.has(key)) {
        try {
          const state = getStateFn();
          if (state) {
            this.saveVersion(appName, projectId, projectName, state, true);
            log.info(`[VersionHistory] Auto-saved ${appName}/${projectId}`);
          }
        } catch (err) {
          log.warn('[VersionHistory] Auto-save failed:', err);
        }
      }
    }, 3 * 60 * 1000);

    this.autoSaveTimers.set(key, timer);
  }

  stopAutoSave(appName: string, projectId: string): void {
    const key = `${appName}:${projectId}`;
    const timer = this.autoSaveTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(key);
    }
    this.dirtyProjects.delete(key);
  }

  getProjectStats(appName: string, projectId: string): { count: number; totalSize: number; oldest: number | null; newest: number | null } {
    const db = this.getDb();
    if (!db) return { count: 0, totalSize: 0, oldest: null, newest: null };

    const row = db.prepare(
      `SELECT COUNT(*) as c, COALESCE(SUM(size), 0) as s, MIN(timestamp) as oldest, MAX(timestamp) as newest
       FROM version_history WHERE app = ? AND project_id = ?`
    ).get(appName, projectId);

    return {
      count: row.c,
      totalSize: row.s,
      oldest: row.oldest,
      newest: row.newest,
    };
  }

  private registerIPC(): void {
    ipcMain.handle('version-history:save', (_event, appName: string, projectId: string, projectName: string, state: any, autoSaved: boolean) => {
      return this.saveVersion(appName, projectId, projectName, state, autoSaved);
    });

    ipcMain.handle('version-history:getVersions', (_event, appName: string, projectId: string) => {
      return this.getVersions(appName, projectId);
    });

    ipcMain.handle('version-history:getState', (_event, versionId: number) => {
      return this.getVersionState(versionId);
    });

    ipcMain.handle('version-history:restore', (_event, appName: string, projectId: string, versionId: number, currentState: any) => {
      return this.restoreVersion(appName, projectId, versionId, currentState);
    });

    ipcMain.handle('version-history:delete', (_event, versionId: number) => {
      return this.deleteVersion(versionId);
    });

    ipcMain.handle('version-history:markDirty', (_event, appName: string, projectId: string) => {
      this.markDirty(appName, projectId);
      return true;
    });

    ipcMain.handle('version-history:getStats', (_event, appName: string, projectId: string) => {
      return this.getProjectStats(appName, projectId);
    });
  }

  shutdown(): void {
    for (const timer of this.autoSaveTimers.values()) {
      clearInterval(timer);
    }
    this.autoSaveTimers.clear();
    this.dirtyProjects.clear();
    log.info('[VersionHistory] Shutdown');
  }
}

export const versionHistoryManager = new VersionHistoryManager();

export function initializeVersionHistory(mainWindow: BrowserWindow): void {
  versionHistoryManager.initialize(mainWindow);
}

export function shutdownVersionHistory(): void {
  versionHistoryManager.shutdown();
}
