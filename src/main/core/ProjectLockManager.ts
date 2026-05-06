// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Project Lock Manager (Feature 35)
// Lock/unlock projects to prevent accidental edits.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';
import { dexEventBus } from './DexEventBus';

interface ProjectLock {
  id: number;
  app: string;
  project_id: string;
  project_name: string;
  locked_by: string;
  reason: string;
  locked_at: string;
}

class ProjectLockManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[ProjectLock] Project lock manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_locks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL DEFAULT '',
        locked_by TEXT NOT NULL DEFAULT 'user',
        reason TEXT NOT NULL DEFAULT '',
        locked_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(app, project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_locks_app ON project_locks(app);
    `);
  }

  lock(app: string, projectId: string, projectName: string, reason: string = '', lockedBy: string = 'user'): ProjectLock | null {
    const db = this.getDb();
    if (!db) return null;

    const existing = this.getLock(app, projectId);
    if (existing) return existing; // already locked

    const result = db.prepare(
      `INSERT INTO project_locks (app, project_id, project_name, locked_by, reason)
       VALUES (?, ?, ?, ?, ?)`
    ).run(app, projectId, projectName, lockedBy, reason);

    const lock = db.prepare('SELECT * FROM project_locks WHERE id = ?').get(result.lastInsertRowid) as ProjectLock;

    dexEventBus.emit('project-locked', 'project-lock', { app, projectId, projectName });

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('project-lock:changed', { app, projectId, locked: true });
    }

    log.info(`[ProjectLock] Locked project: ${projectName} (${app})`);
    return lock;
  }

  unlock(app: string, projectId: string): boolean {
    const db = this.getDb();
    if (!db) return false;

    const result = db.prepare(
      'DELETE FROM project_locks WHERE app = ? AND project_id = ?'
    ).run(app, projectId);

    if (result.changes > 0) {
      dexEventBus.emit('project-unlocked', 'project-lock', { app, projectId });

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('project-lock:changed', { app, projectId, locked: false });
      }

      log.info(`[ProjectLock] Unlocked project: ${projectId} (${app})`);
      return true;
    }

    return false;
  }

  isLocked(app: string, projectId: string): boolean {
    const db = this.getDb();
    if (!db) return false;
    const row = db.prepare(
      'SELECT id FROM project_locks WHERE app = ? AND project_id = ?'
    ).get(app, projectId);
    return !!row;
  }

  getLock(app: string, projectId: string): ProjectLock | null {
    const db = this.getDb();
    if (!db) return null;
    return db.prepare(
      'SELECT * FROM project_locks WHERE app = ? AND project_id = ?'
    ).get(app, projectId) as ProjectLock | null;
  }

  getLockedProjects(app?: string): ProjectLock[] {
    const db = this.getDb();
    if (!db) return [];
    if (app) {
      return db.prepare(
        'SELECT * FROM project_locks WHERE app = ? ORDER BY locked_at DESC'
      ).all(app) as ProjectLock[];
    }
    return db.prepare(
      'SELECT * FROM project_locks ORDER BY locked_at DESC'
    ).all() as ProjectLock[];
  }

  getLockedCount(app?: string): number {
    const db = this.getDb();
    if (!db) return 0;
    if (app) {
      return (db.prepare('SELECT COUNT(*) as cnt FROM project_locks WHERE app = ?').get(app) as any)?.cnt || 0;
    }
    return (db.prepare('SELECT COUNT(*) as cnt FROM project_locks').get() as any)?.cnt || 0;
  }

  toggleLock(app: string, projectId: string, projectName: string, reason: string = ''): boolean {
    if (this.isLocked(app, projectId)) {
      return this.unlock(app, projectId);
    } else {
      return !!this.lock(app, projectId, projectName, reason);
    }
  }

  private registerIPC(): void {
    ipcMain.handle('project-lock:lock', async (_event, app: string, projectId: string, projectName: string, reason?: string) => {
      return this.lock(app, projectId, projectName, reason);
    });

    ipcMain.handle('project-lock:unlock', async (_event, app: string, projectId: string) => {
      return this.unlock(app, projectId);
    });

    ipcMain.handle('project-lock:isLocked', async (_event, app: string, projectId: string) => {
      return this.isLocked(app, projectId);
    });

    ipcMain.handle('project-lock:getLock', async (_event, app: string, projectId: string) => {
      return this.getLock(app, projectId);
    });

    ipcMain.handle('project-lock:getAll', async (_event, app?: string) => {
      return this.getLockedProjects(app);
    });

    ipcMain.handle('project-lock:getCount', async (_event, app?: string) => {
      return this.getLockedCount(app);
    });

    ipcMain.handle('project-lock:toggle', async (_event, app: string, projectId: string, projectName: string, reason?: string) => {
      return this.toggleLock(app, projectId, projectName, reason);
    });
  }
}

export const projectLockManager = new ProjectLockManager();
