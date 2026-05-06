// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Daily Note Manager (Feature 12)
// Auto-creates a structured daily note at first launch each day.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface DailyNote {
  id: string;
  date: string;
  title: string;
  content: string;
  pinned: boolean;
  tag: string;
  created_at: number;
}

class DailyNoteManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[DailyNote] Daily note manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_notes (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        pinned INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON daily_notes(date);
    `);
  }

  private getTodayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private formatDateHeading(date: Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
  }

  todayNoteExists(): boolean {
    const db = this.getDb();
    if (!db) return true;
    const today = this.getTodayStr();
    const row = db.prepare('SELECT id FROM daily_notes WHERE date = ?').get(today);
    return !!row;
  }

  createTodayNote(): DailyNote | null {
    const db = this.getDb();
    if (!db) return null;

    const today = this.getTodayStr();
    const existing = db.prepare('SELECT * FROM daily_notes WHERE date = ?').get(today);
    if (existing) {
      return {
        id: existing.id, date: existing.date, title: existing.title,
        content: existing.content, pinned: existing.pinned === 1,
        tag: 'daily-note', created_at: existing.created_at,
      };
    }

    const now = new Date();
    const heading = this.formatDateHeading(now);
    const noteId = `daily-${today}`;

    let unfinishedSection = '';
    let dueTodaySection = '';

    try {
      const tasksRow = db.prepare("SELECT value FROM settings WHERE key = 'tasks_data'").get();
      if (tasksRow) {
        const tasks = JSON.parse(tasksRow.value || '[]');
        if (Array.isArray(tasks)) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const unfinished = tasks.filter((t: any) =>
            t.dueDate === yesterday && t.status !== 'completed'
          );
          const dueToday = tasks.filter((t: any) =>
            t.dueDate === today && t.status !== 'completed'
          );

          if (unfinished.length > 0) {
            unfinishedSection = unfinished.map((t: any) =>
              `- [ ] ${t.title || t.name}`
            ).join('\n');
          }
          if (dueToday.length > 0) {
            dueTodaySection = dueToday.map((t: any) =>
              `- [ ] ${t.title || t.name}`
            ).join('\n');
          }
        }
      }
    } catch { /* non-critical */ }

    const content = [
      `# ${heading}`,
      '',
      '## Unfinished from Yesterday',
      unfinishedSection || '(none)',
      '',
      '## Due Today',
      dueTodaySection || '(none)',
      '',
      '## Focus Intentions',
      '',
      '',
      '## Notes',
      '',
    ].join('\n');

    const noteRecord = {
      id: noteId,
      date: today,
      title: heading,
      content,
      pinned: 1,
      created_at: Date.now(),
    };

    db.prepare(
      'INSERT INTO daily_notes (id, date, title, content, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(noteRecord.id, noteRecord.date, noteRecord.title, noteRecord.content, noteRecord.pinned, noteRecord.created_at);

    this.unpinYesterdayNote();

    return {
      ...noteRecord,
      pinned: true,
      tag: 'daily-note',
    };
  }

  private unpinYesterdayNote(): void {
    const db = this.getDb();
    if (!db) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    db.prepare('UPDATE daily_notes SET pinned = 0 WHERE date = ?').run(yesterday);
  }

  updateNoteContent(noteId: string, content: string): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('UPDATE daily_notes SET content = ? WHERE id = ?').run(content, noteId);
  }

  getTodayNote(): DailyNote | null {
    const db = this.getDb();
    if (!db) return null;
    const today = this.getTodayStr();
    const row = db.prepare('SELECT * FROM daily_notes WHERE date = ?').get(today);
    if (!row) return null;
    return { ...row, pinned: row.pinned === 1, tag: 'daily-note' } as DailyNote;
  }

  getAllDailyNotes(): DailyNote[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM daily_notes ORDER BY date DESC').all().map((row: any) => ({
      ...row, pinned: row.pinned === 1, tag: 'daily-note',
    })) as DailyNote[];
  }

  private registerIPC(): void {
    ipcMain.handle('daily-note:exists', async () => {
      return this.todayNoteExists();
    });

    ipcMain.handle('daily-note:create', async () => {
      return this.createTodayNote();
    });

    ipcMain.handle('daily-note:getToday', async () => {
      return this.getTodayNote();
    });

    ipcMain.handle('daily-note:getAll', async () => {
      return this.getAllDailyNotes();
    });

    ipcMain.handle('daily-note:updateContent', async (_event, noteId: string, content: string) => {
      this.updateNoteContent(noteId, content);
    });
  }
}

export const dailyNoteManager = new DailyNoteManager();
