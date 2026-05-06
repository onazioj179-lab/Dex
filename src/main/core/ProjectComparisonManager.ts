// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Project Comparison Manager (Feature 26)
// Structured side-by-side diff of two same-app projects.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

interface ComparisonDiff {
  field: string;
  leftValue: any;
  rightValue: any;
  status: 'same' | 'different' | 'left-only' | 'right-only';
}

interface ComparisonResult {
  leftProject: { app: string; id: string; name: string };
  rightProject: { app: string; id: string; name: string };
  diffs: ComparisonDiff[];
  similarity: number;
  compared_at: string;
}

class ProjectComparisonManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[ProjectComparison] Project comparison manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS comparison_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        left_id TEXT NOT NULL,
        left_name TEXT NOT NULL,
        right_id TEXT NOT NULL,
        right_name TEXT NOT NULL,
        similarity REAL NOT NULL DEFAULT 0,
        diff_count INTEGER NOT NULL DEFAULT 0,
        compared_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_comparison_app ON comparison_history(app);
    `);
  }

  private flatten(obj: any, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};
    if (obj === null || obj === undefined) return result;
    if (typeof obj !== 'object') {
      result[prefix] = obj;
      return result;
    }
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(result, this.flatten(obj[key], fullKey));
      } else {
        result[fullKey] = obj[key];
      }
    }
    return result;
  }

  compare(app: string, leftId: string, leftName: string, leftData: any, rightId: string, rightName: string, rightData: any): ComparisonResult {
    const leftFlat = this.flatten(leftData);
    const rightFlat = this.flatten(rightData);
    const allKeys = new Set([...Object.keys(leftFlat), ...Object.keys(rightFlat)]);

    const diffs: ComparisonDiff[] = [];
    let sameCount = 0;

    for (const key of allKeys) {
      const hasLeft = key in leftFlat;
      const hasRight = key in rightFlat;

      if (hasLeft && hasRight) {
        const leftVal = leftFlat[key];
        const rightVal = rightFlat[key];
        const isSame = JSON.stringify(leftVal) === JSON.stringify(rightVal);
        if (isSame) sameCount++;
        diffs.push({
          field: key,
          leftValue: leftVal,
          rightValue: rightVal,
          status: isSame ? 'same' : 'different',
        });
      } else if (hasLeft) {
        diffs.push({ field: key, leftValue: leftFlat[key], rightValue: null, status: 'left-only' });
      } else {
        diffs.push({ field: key, leftValue: null, rightValue: rightFlat[key], status: 'right-only' });
      }
    }

    diffs.sort((a, b) => {
      const order = { 'different': 0, 'left-only': 1, 'right-only': 2, 'same': 3 };
      return (order[a.status] || 0) - (order[b.status] || 0);
    });

    const similarity = allKeys.size > 0 ? Math.round((sameCount / allKeys.size) * 100) : 100;

    const db = this.getDb();
    if (db) {
      db.prepare(
        `INSERT INTO comparison_history (app, left_id, left_name, right_id, right_name, similarity, diff_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(app, leftId, leftName, rightId, rightName, similarity, diffs.filter(d => d.status !== 'same').length);
    }

    return {
      leftProject: { app, id: leftId, name: leftName },
      rightProject: { app, id: rightId, name: rightName },
      diffs,
      similarity,
      compared_at: new Date().toISOString(),
    };
  }

  compareFromVersionHistory(app: string, leftId: string, rightId: string): ComparisonResult | null {
    const db = this.getDb();
    if (!db) return null;

    try {
      const leftRow = db.prepare(
        `SELECT project_name, data FROM version_history WHERE app = ? AND id = ? ORDER BY created_at DESC LIMIT 1`
      ).get(app, leftId);
      const rightRow = db.prepare(
        `SELECT project_name, data FROM version_history WHERE app = ? AND id = ? ORDER BY created_at DESC LIMIT 1`
      ).get(app, rightId);

      if (!leftRow || !rightRow) return null;

      let leftData: any = {};
      let rightData: any = {};
      try { leftData = JSON.parse(leftRow.data); } catch (_e) { log.warn('[ProjectComparison] Failed to parse left project data:', leftId); }
      try { rightData = JSON.parse(rightRow.data); } catch (_e) { log.warn('[ProjectComparison] Failed to parse right project data:', rightId); }

      return this.compare(app, leftId, leftRow.project_name, leftData, rightId, rightRow.project_name, rightData);
    } catch (_e) {
      return null;
    }
  }

  getHistory(app?: string, limit: number = 50): any[] {
    const db = this.getDb();
    if (!db) return [];
    if (app) {
      return db.prepare(
        'SELECT * FROM comparison_history WHERE app = ? ORDER BY compared_at DESC LIMIT ?'
      ).all(app, limit);
    }
    return db.prepare(
      'SELECT * FROM comparison_history ORDER BY compared_at DESC LIMIT ?'
    ).all(limit);
  }

  private registerIPC(): void {
    ipcMain.handle('project-comparison:compare', async (_event, app: string, leftId: string, leftName: string, leftData: any, rightId: string, rightName: string, rightData: any) => {
      return this.compare(app, leftId, leftName, leftData, rightId, rightName, rightData);
    });

    ipcMain.handle('project-comparison:compareVersions', async (_event, app: string, leftId: string, rightId: string) => {
      return this.compareFromVersionHistory(app, leftId, rightId);
    });

    ipcMain.handle('project-comparison:getHistory', async (_event, app?: string, limit?: number) => {
      return this.getHistory(app, limit);
    });
  }
}

export const projectComparisonManager = new ProjectComparisonManager();
