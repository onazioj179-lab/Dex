// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Smart Grouping Manager (Feature 16)
// Groups related notes, tasks, and media by shared signals.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface SmartGroup {
  id: number;
  label: string;
  app: string;
  item_ids: string[];
  signal: string;
  created: number;
  dismissed: number;
}

class SmartGroupingManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[SmartGrouping] Smart grouping manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS smart_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        app TEXT NOT NULL,
        item_ids TEXT NOT NULL,
        signal TEXT NOT NULL,
        created INTEGER NOT NULL,
        dismissed INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_smart_groups_app ON smart_groups(app);
      CREATE INDEX IF NOT EXISTS idx_smart_groups_dismissed ON smart_groups(dismissed);
    `);
  }

  runGrouping(): SmartGroup[] {
    const db = this.getDb();
    if (!db) return [];

    const now = Date.now();
    const groups: SmartGroup[] = [];

    try {
      const notesRow = db.prepare("SELECT value FROM settings WHERE key = 'notes_data'").get();
      if (notesRow) {
        const notes = JSON.parse(notesRow.value || '[]');
        if (Array.isArray(notes)) {
          const tagMap = new Map<string, any[]>();
          for (const note of notes) {
            const tags = note.tags || [];
            for (const tag of tags) {
              if (!tagMap.has(tag)) tagMap.set(tag, []);
              tagMap.get(tag)!.push(note);
            }
          }
          for (const [tag, items] of tagMap) {
            if (items.length >= 2) {
              groups.push({
                id: 0, label: `Notes tagged "${tag}"`, app: 'notes',
                item_ids: items.map((n: any) => n.id),
                signal: `shared-tag:${tag}`, created: now, dismissed: 0,
              });
            }
          }

          for (let i = 0; i < notes.length; i++) {
            for (let j = i + 1; j < notes.length; j++) {
              const timeDiff = Math.abs((notes[i].createdAt || 0) - (notes[j].createdAt || 0));
              if (timeDiff < 86400000 && timeDiff > 0) {
                const existsInGroup = groups.some(g =>
                  g.app === 'notes' && g.item_ids.includes(notes[i].id) && g.item_ids.includes(notes[j].id)
                );
                if (!existsInGroup) {
                  groups.push({
                    id: 0, label: 'Created around the same time', app: 'notes',
                    item_ids: [notes[i].id, notes[j].id],
                    signal: 'creation-proximity', created: now, dismissed: 0,
                  });
                }
              }
            }
          }

          const keywordMap = new Map<string, any[]>();
          for (const note of notes) {
            const content = ((note.content || note.text || '') + ' ' + (note.title || note.name || '')).toLowerCase();
            const words = content.split(/\s+/).filter((w: string) => w.length > 4);
            const wordFreq = new Map<string, number>();
            for (const w of words) {
              wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
            }
            const topWords = Array.from(wordFreq.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([w]) => w);
            for (const kw of topWords) {
              if (!keywordMap.has(kw)) keywordMap.set(kw, []);
              keywordMap.get(kw)!.push(note);
            }
          }
          for (const [keyword, items] of keywordMap) {
            if (items.length >= 2 && items.length <= 10) {
              const ids = items.map((n: any) => n.id);
              const uniqueIds = [...new Set(ids)];
              if (uniqueIds.length >= 2) {
                const alreadyGrouped = groups.some(g =>
                  g.app === 'notes' && g.signal.startsWith('shared-keyword') &&
                  uniqueIds.every(id => g.item_ids.includes(id))
                );
                if (!alreadyGrouped) {
                  groups.push({
                    id: 0, label: `Related to "${keyword}"`, app: 'notes',
                    item_ids: uniqueIds, signal: `shared-keyword:${keyword}`,
                    created: now, dismissed: 0,
                  });
                }
              }
            }
          }
        }
      }

      const tasksRow = db.prepare("SELECT value FROM settings WHERE key = 'tasks_data'").get();
      if (tasksRow) {
        const tasks = JSON.parse(tasksRow.value || '[]');
        if (Array.isArray(tasks)) {
          const tagMap = new Map<string, any[]>();
          for (const task of tasks) {
            const tags = task.tags || [];
            for (const tag of tags) {
              if (!tagMap.has(tag)) tagMap.set(tag, []);
              tagMap.get(tag)!.push(task);
            }
          }
          for (const [tag, items] of tagMap) {
            if (items.length >= 2) {
              groups.push({
                id: 0, label: `Tasks tagged "${tag}"`, app: 'tasks',
                item_ids: items.map((t: any) => t.id),
                signal: `shared-tag:${tag}`, created: now, dismissed: 0,
              });
            }
          }
        }
      }
    } catch (err) {
      log.warn('[SmartGrouping] Grouping error:', err);
    }

    this.saveGroups(groups);
    return groups;
  }

  private saveGroups(groups: SmartGroup[]): void {
    const db = this.getDb();
    if (!db) return;

    const stmt = db.prepare(
      'INSERT INTO smart_groups (label, app, item_ids, signal, created, dismissed) VALUES (?, ?, ?, ?, ?, 0)'
    );

    for (const g of groups) {
      const idsJson = JSON.stringify(g.item_ids);
      const existing = db.prepare(
        'SELECT id FROM smart_groups WHERE app = ? AND item_ids = ? AND dismissed = 0'
      ).get(g.app, idsJson);
      if (!existing) {
        stmt.run(g.label, g.app, idsJson, g.signal, g.created);
      }
    }
  }

  getGroups(app?: string): SmartGroup[] {
    const db = this.getDb();
    if (!db) return [];

    let query = 'SELECT * FROM smart_groups WHERE dismissed = 0';
    const params: any[] = [];
    if (app) {
      query += ' AND app = ?';
      params.push(app);
    }
    query += ' ORDER BY created DESC';

    return db.prepare(query).all(...params).map((row: any) => ({
      ...row,
      item_ids: JSON.parse(row.item_ids || '[]'),
    })) as SmartGroup[];
  }

  dismissGroup(id: number): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('UPDATE smart_groups SET dismissed = 1 WHERE id = ?').run(id);
  }

  convertToTag(groupId: number, tagName: string): boolean {
    const db = this.getDb();
    if (!db) return false;

    const group = db.prepare('SELECT * FROM smart_groups WHERE id = ?').get(groupId);
    if (!group) return false;

    this.dismissGroup(groupId);
    return true;
  }

  private registerIPC(): void {
    ipcMain.handle('smart-grouping:run', async () => {
      return this.runGrouping();
    });

    ipcMain.handle('smart-grouping:getGroups', async (_event, app?: string) => {
      return this.getGroups(app);
    });

    ipcMain.handle('smart-grouping:dismiss', async (_event, id: number) => {
      this.dismissGroup(id);
    });

    ipcMain.handle('smart-grouping:convertToTag', async (_event, groupId: number, tagName: string) => {
      return this.convertToTag(groupId, tagName);
    });
  }
}

export const smartGroupingManager = new SmartGroupingManager();
