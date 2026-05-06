// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Duplication Detector (Feature 9)
// Cross-app duplication detection with Jaccard similarity and hash matching.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface DuplicateGroup {
  id: number;
  type: string;
  items: DuplicateItem[];
  dismissed: number;
  detected_at: number;
}

export interface DuplicateItem {
  app: string;
  item_id: string;
  item_name: string;
  item_type: string;
  last_modified: number;
}

class DuplicationDetectorManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[DuplicationDetector] Duplication detector initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS duplicate_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        items TEXT NOT NULL,
        dismissed INTEGER DEFAULT 0,
        detected_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_duplicate_groups_type ON duplicate_groups(type);
      CREATE INDEX IF NOT EXISTS idx_duplicate_groups_dismissed ON duplicate_groups(dismissed);
    `);
  }

  private jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    if (wordsA.size === 0 && wordsB.size === 0) return 1;
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }
    const union = wordsA.size + wordsB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private contentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  runDetection(): DuplicateGroup[] {
    const db = this.getDb();
    if (!db) return [];

    const groups: DuplicateGroup[] = [];
    const now = Date.now();

    try {
      const notesRow = db.prepare("SELECT value FROM settings WHERE key = 'notes_data'").get();
      if (notesRow) {
        const notes = JSON.parse(notesRow.value || '[]');
        if (Array.isArray(notes) && notes.length > 1) {
          for (let i = 0; i < notes.length; i++) {
            for (let j = i + 1; j < notes.length; j++) {
              const contentA = notes[i].content || notes[i].text || '';
              const contentB = notes[j].content || notes[j].text || '';
              if (contentA.length < 10 || contentB.length < 10) continue;

              const sim = this.jaccardSimilarity(contentA, contentB);
              if (sim >= 0.85) {
                groups.push({
                  id: 0, type: 'similar-notes',
                  items: [
                    { app: 'notes', item_id: notes[i].id, item_name: notes[i].title || notes[i].name || 'Untitled', item_type: 'note', last_modified: notes[i].updatedAt || now },
                    { app: 'notes', item_id: notes[j].id, item_name: notes[j].title || notes[j].name || 'Untitled', item_type: 'note', last_modified: notes[j].updatedAt || now },
                  ],
                  dismissed: 0, detected_at: now,
                });
              }
            }
          }
        }
      }

      const tasksRow = db.prepare("SELECT value FROM settings WHERE key = 'tasks_data'").get();
      if (tasksRow) {
        const tasks = JSON.parse(tasksRow.value || '[]');
        if (Array.isArray(tasks)) {
          const nameMap = new Map<string, any[]>();
          for (const t of tasks) {
            const key = (t.title || t.name || '').toLowerCase().trim();
            if (key.length < 3) continue;
            if (!nameMap.has(key)) nameMap.set(key, []);
            nameMap.get(key)!.push(t);
          }
          for (const [, dupes] of nameMap) {
            if (dupes.length > 1) {
              groups.push({
                id: 0, type: 'identical-tasks',
                items: dupes.map((t: any) => ({
                  app: t.app || 'tasks', item_id: t.id, item_name: t.title || t.name,
                  item_type: 'task', last_modified: t.updatedAt || now,
                })),
                dismissed: 0, detected_at: now,
              });
            }
          }
        }
      }

      const mediaItems = db.prepare('SELECT id, filepath, filename, type, size FROM media_library').all();
      const sizeMap = new Map<string, any[]>();
      for (const m of mediaItems) {
        const key = `${m.size}-${m.type}`;
        if (!sizeMap.has(key)) sizeMap.set(key, []);
        sizeMap.get(key)!.push(m);
      }
      for (const [, dupes] of sizeMap) {
        if (dupes.length > 1) {
          groups.push({
            id: 0, type: 'identical-media',
            items: dupes.map((m: any) => ({
              app: 'media', item_id: String(m.id), item_name: m.filename,
              item_type: 'media', last_modified: now,
            })),
            dismissed: 0, detected_at: now,
          });
        }
      }
    } catch (err) {
      log.warn('[DuplicationDetector] Detection error:', err);
    }

    this.saveGroups(groups);
    return groups;
  }

  private saveGroups(groups: DuplicateGroup[]): void {
    const db = this.getDb();
    if (!db) return;

    const stmt = db.prepare(
      'INSERT INTO duplicate_groups (type, items, dismissed, detected_at) VALUES (?, ?, 0, ?)'
    );

    for (const g of groups) {
      const isDismissed = db.prepare(
        `SELECT id FROM duplicate_groups WHERE type = ? AND items = ? AND dismissed = 1`
      ).get(g.type, JSON.stringify(g.items));
      if (!isDismissed) {
        stmt.run(g.type, JSON.stringify(g.items), g.detected_at);
      }
    }
  }

  getGroups(includeDismissed: boolean = false): DuplicateGroup[] {
    const db = this.getDb();
    if (!db) return [];

    let query = 'SELECT * FROM duplicate_groups';
    if (!includeDismissed) query += ' WHERE dismissed = 0';
    query += ' ORDER BY detected_at DESC';

    return db.prepare(query).all().map((row: any) => ({
      ...row,
      items: JSON.parse(row.items || '[]'),
    })) as DuplicateGroup[];
  }

  dismissGroup(id: number): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('UPDATE duplicate_groups SET dismissed = 1 WHERE id = ?').run(id);
  }

  clearAll(): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('DELETE FROM duplicate_groups').run();
  }

  private registerIPC(): void {
    ipcMain.handle('duplication-detector:run', async () => {
      return this.runDetection();
    });

    ipcMain.handle('duplication-detector:getGroups', async (_event, includeDismissed?: boolean) => {
      return this.getGroups(includeDismissed);
    });

    ipcMain.handle('duplication-detector:dismiss', async (_event, id: number) => {
      this.dismissGroup(id);
    });

    ipcMain.handle('duplication-detector:clearAll', async () => {
      this.clearAll();
    });
  }
}

export const duplicationDetectorManager = new DuplicationDetectorManager();
