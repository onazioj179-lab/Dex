// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Snapshot Comparison Manager (Feature 7)
// Side-by-side diff of any two version history snapshots.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface SnapshotDiff {
  totalChanged: number;
  totalAdded: number;
  totalRemoved: number;
  fields: FieldDiff[];
}

export interface FieldDiff {
  key: string;
  type: 'changed' | 'added' | 'removed' | 'unchanged';
  leftValue: any;
  rightValue: any;
}

class SnapshotComparisonManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[SnapshotComparison] Snapshot comparison manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  getSnapshot(snapshotId: number): any {
    const db = this.getDb();
    if (!db) return null;
    const row = db.prepare('SELECT * FROM version_history WHERE id = ?').get(snapshotId);
    if (!row) return null;

    let data: any;
    try {
      const raw = row.snapshot instanceof Buffer ? row.snapshot.toString('utf-8') : String(row.snapshot);
      data = JSON.parse(raw);
    } catch {
      data = { raw: String(row.snapshot) };
    }

    return {
      id: row.id,
      app: row.app,
      project_id: row.project_id,
      project_name: row.project_name,
      timestamp: row.timestamp,
      auto_saved: row.auto_saved,
      data,
    };
  }

  compareSnapshots(leftId: number, rightId: number): SnapshotDiff {
    const left = this.getSnapshot(leftId);
    const right = this.getSnapshot(rightId);

    if (!left || !right) {
      return { totalChanged: 0, totalAdded: 0, totalRemoved: 0, fields: [] };
    }

    return this.computeDiff(left.data, right.data);
  }

  private computeDiff(leftData: any, rightData: any): SnapshotDiff {
    const fields: FieldDiff[] = [];
    let totalChanged = 0;
    let totalAdded = 0;
    let totalRemoved = 0;

    const leftFlat = this.flattenObject(leftData);
    const rightFlat = this.flattenObject(rightData);

    const allKeys = new Set([...Object.keys(leftFlat), ...Object.keys(rightFlat)]);

    for (const key of allKeys) {
      const inLeft = key in leftFlat;
      const inRight = key in rightFlat;

      if (inLeft && inRight) {
        const leftVal = leftFlat[key];
        const rightVal = rightFlat[key];
        const same = JSON.stringify(leftVal) === JSON.stringify(rightVal);
        fields.push({
          key,
          type: same ? 'unchanged' : 'changed',
          leftValue: leftVal,
          rightValue: rightVal,
        });
        if (!same) totalChanged++;
      } else if (inLeft && !inRight) {
        fields.push({ key, type: 'removed', leftValue: leftFlat[key], rightValue: undefined });
        totalRemoved++;
      } else {
        fields.push({ key, type: 'added', leftValue: undefined, rightValue: rightFlat[key] });
        totalAdded++;
      }
    }

    fields.sort((a, b) => {
      const order = { changed: 0, added: 1, removed: 2, unchanged: 3 };
      return order[a.type] - order[b.type];
    });

    return { totalChanged, totalAdded, totalRemoved, fields };
  }

  private flattenObject(obj: any, prefix: string = ''): Record<string, any> {
    const result: Record<string, any> = {};
    if (obj === null || obj === undefined) return result;
    if (typeof obj !== 'object') {
      result[prefix || 'value'] = obj;
      return result;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const key = prefix ? `${prefix}[${i}]` : `[${i}]`;
        Object.assign(result, this.flattenObject(obj[i], key));
      }
      return result;
    }
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object') {
        Object.assign(result, this.flattenObject(v, key));
      } else {
        result[key] = v;
      }
    }
    return result;
  }

  restoreSnapshot(snapshotId: number): any {
    const snapshot = this.getSnapshot(snapshotId);
    if (!snapshot) return null;

    const db = this.getDb();
    if (!db) return null;

    const now = Date.now();
    const currentRow = db.prepare(
      'SELECT * FROM version_history WHERE app = ? AND project_id = ? ORDER BY timestamp DESC LIMIT 1'
    ).get(snapshot.app, snapshot.project_id);

    if (currentRow) {
      db.prepare(
        `INSERT INTO version_history (app, project_id, project_name, snapshot, size, timestamp, auto_saved)
         VALUES (?, ?, ?, ?, ?, ?, 0)`
      ).run(snapshot.app, snapshot.project_id, snapshot.project_name, currentRow.snapshot, currentRow.size || 0, now);
    }

    return snapshot;
  }

  private registerIPC(): void {
    ipcMain.handle('snapshot-comparison:compare', async (_event, leftId: number, rightId: number) => {
      return this.compareSnapshots(leftId, rightId);
    });

    ipcMain.handle('snapshot-comparison:getSnapshot', async (_event, snapshotId: number) => {
      return this.getSnapshot(snapshotId);
    });

    ipcMain.handle('snapshot-comparison:restore', async (_event, snapshotId: number) => {
      return this.restoreSnapshot(snapshotId);
    });
  }
}

export const snapshotComparisonManager = new SnapshotComparisonManager();
