// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Dependency Manager (Feature 30)
// Project dependency tracking with circular dependency detection.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';
import { dexEventBus } from './DexEventBus';

interface Dependency {
  id: number;
  app: string;
  source_id: string;
  source_name: string;
  target_id: string;
  target_name: string;
  dep_type: string;
  created_at: string;
}

const DEP_TYPES = ['blocks', 'requires', 'includes', 'extends'] as const;

class DependencyManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[Dependencies] Dependency manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL,
        target_name TEXT NOT NULL DEFAULT '',
        dep_type TEXT NOT NULL DEFAULT 'requires',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(app, source_id, target_id, dep_type)
      );
      CREATE INDEX IF NOT EXISTS idx_dep_source ON dependencies(app, source_id);
      CREATE INDEX IF NOT EXISTS idx_dep_target ON dependencies(app, target_id);
    `);
  }

  addDependency(app: string, sourceId: string, sourceName: string, targetId: string, targetName: string, depType: string = 'requires'): { success: boolean; circular?: boolean; dependency?: Dependency } {
    const db = this.getDb();
    if (!db) return { success: false };

    if (sourceId === targetId) return { success: false };

    const validType = DEP_TYPES.includes(depType as any) ? depType : 'requires';

    // Check for circular dependency
    if (this.wouldCreateCircle(app, sourceId, targetId)) {
      log.warn(`[Dependencies] Circular dependency detected: ${sourceId} -> ${targetId}`);
      return { success: false, circular: true };
    }

    // Check for duplicate
    const existing = db.prepare(
      'SELECT id FROM dependencies WHERE app = ? AND source_id = ? AND target_id = ? AND dep_type = ?'
    ).get(app, sourceId, targetId, validType);

    if (existing) return { success: false };

    const result = db.prepare(
      `INSERT INTO dependencies (app, source_id, source_name, target_id, target_name, dep_type)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(app, sourceId, sourceName, targetId, targetName, validType);

    const dep = db.prepare('SELECT * FROM dependencies WHERE id = ?').get(result.lastInsertRowid) as Dependency;

    dexEventBus.emit('dependency-added', 'dependency-manager', { app, sourceId, targetId, depType: validType });

    return { success: true, dependency: dep };
  }

  removeDependency(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    const result = db.prepare('DELETE FROM dependencies WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getDependencies(app: string, sourceId: string): Dependency[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM dependencies WHERE app = ? AND source_id = ? ORDER BY created_at ASC'
    ).all(app, sourceId) as Dependency[];
  }

  getDependents(app: string, targetId: string): Dependency[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM dependencies WHERE app = ? AND target_id = ? ORDER BY created_at ASC'
    ).all(app, targetId) as Dependency[];
  }

  getAllForApp(app: string): Dependency[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM dependencies WHERE app = ? ORDER BY created_at ASC'
    ).all(app) as Dependency[];
  }

  getDepTypes(): string[] {
    return [...DEP_TYPES];
  }

  private wouldCreateCircle(app: string, sourceId: string, newTargetId: string): boolean {
    const db = this.getDb();
    if (!db) return false;

    // BFS from newTargetId to see if we can reach sourceId
    const visited = new Set<string>();
    const queue = [newTargetId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === sourceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = db.prepare(
        'SELECT target_id FROM dependencies WHERE app = ? AND source_id = ?'
      ).all(app, current) as Array<{ target_id: string }>;

      for (const dep of deps) {
        if (!visited.has(dep.target_id)) {
          queue.push(dep.target_id);
        }
      }

      // Safety: don't traverse more than 500 nodes
      if (visited.size > 500) break;
    }

    return false;
  }

  getChain(app: string, sourceId: string): string[][] {
    const db = this.getDb();
    if (!db) return [];

    const chains: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[]) => {
      if (visited.has(current)) return;
      visited.add(current);
      path.push(current);

      const deps = db.prepare(
        'SELECT target_id FROM dependencies WHERE app = ? AND source_id = ?'
      ).all(app, current) as Array<{ target_id: string }>;

      if (deps.length === 0) {
        chains.push([...path]);
      } else {
        for (const dep of deps) {
          dfs(dep.target_id, path);
        }
      }

      path.pop();
      visited.delete(current);
    };

    dfs(sourceId, []);
    return chains;
  }

  private registerIPC(): void {
    ipcMain.handle('dependencies:add', async (_event, app: string, sourceId: string, sourceName: string, targetId: string, targetName: string, depType?: string) => {
      return this.addDependency(app, sourceId, sourceName, targetId, targetName, depType);
    });

    ipcMain.handle('dependencies:remove', async (_event, id: number) => {
      return this.removeDependency(id);
    });

    ipcMain.handle('dependencies:get', async (_event, app: string, sourceId: string) => {
      return this.getDependencies(app, sourceId);
    });

    ipcMain.handle('dependencies:getDependents', async (_event, app: string, targetId: string) => {
      return this.getDependents(app, targetId);
    });

    ipcMain.handle('dependencies:getAll', async (_event, app: string) => {
      return this.getAllForApp(app);
    });

    ipcMain.handle('dependencies:getChain', async (_event, app: string, sourceId: string) => {
      return this.getChain(app, sourceId);
    });

    ipcMain.handle('dependencies:getTypes', async () => {
      return this.getDepTypes();
    });
  }
}

export const dependencyManager = new DependencyManager();
