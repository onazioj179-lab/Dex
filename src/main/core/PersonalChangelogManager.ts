// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - Personal Changelog Manager (Feature 38)
// Auto-generated personal changelog from activity with template rendering.
// ==========================================================================

import { ipcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

interface ChangelogEntry {
  id: number;
  date: string;
  category: string;
  title: string;
  details: string;
  app: string;
  created_at: string;
}

interface ChangelogSummary {
  period: string;
  entries: ChangelogEntry[];
  stats: {
    total: number;
    byCategory: Record<string, number>;
    byApp: Record<string, number>;
  };
}

class PersonalChangelogManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[PersonalChangelog] Personal changelog manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS personal_changelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        title TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        app TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_changelog_date ON personal_changelog(date);
      CREATE INDEX IF NOT EXISTS idx_changelog_category ON personal_changelog(category);
    `);
  }

  addEntry(date: string, category: string, title: string, details: string = '', app: string = ''): ChangelogEntry | null {
    const db = this.getDb();
    if (!db) return null;

    const trimmed = title.trim();
    if (!trimmed) return null;

    const result = db.prepare(
      `INSERT INTO personal_changelog (date, category, title, details, app) VALUES (?, ?, ?, ?, ?)`
    ).run(date, category, trimmed, details, app);

    return db.prepare('SELECT * FROM personal_changelog WHERE id = ?').get(result.lastInsertRowid) as ChangelogEntry;
  }

  removeEntry(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;
    const result = db.prepare('DELETE FROM personal_changelog WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getEntries(options?: { startDate?: string; endDate?: string; category?: string; app?: string; limit?: number }): ChangelogEntry[] {
    const db = this.getDb();
    if (!db) return [];

    let sql = 'SELECT * FROM personal_changelog WHERE 1=1';
    const params: any[] = [];

    if (options?.startDate) {
      sql += ' AND date >= ?';
      params.push(options.startDate);
    }
    if (options?.endDate) {
      sql += ' AND date <= ?';
      params.push(options.endDate);
    }
    if (options?.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }
    if (options?.app) {
      sql += ' AND app = ?';
      params.push(options.app);
    }

    sql += ' ORDER BY date DESC, created_at DESC';
    sql += ` LIMIT ${Math.min(options?.limit || 500, 2000)}`;

    return db.prepare(sql).all(...params) as ChangelogEntry[];
  }

  generateFromActivity(startDate: string, endDate: string): number {
    const db = this.getDb();
    if (!db) return 0;

    let count = 0;

    // Pull from activity_feed
    try {
      const activities = db.prepare(
        `SELECT * FROM activity_feed WHERE date(created_at) >= ? AND date(created_at) <= ?
         ORDER BY created_at ASC`
      ).all(startDate, endDate) as any[];

      const insertStmt = db.prepare(
        `INSERT INTO personal_changelog (date, category, title, details, app)
         VALUES (?, ?, ?, ?, ?)`
      );

      const transaction = db.transaction(() => {
        for (const activity of activities) {
          const date = activity.created_at.split('T')[0] || activity.created_at.split(' ')[0];
          insertStmt.run(
            date,
            activity.event_type || 'general',
            activity.title || activity.event_type,
            activity.details || '',
            activity.app || '',
          );
          count++;
        }
      });

      transaction();
    } catch (_e) { /* activity_feed may not exist */ }

    return count;
  }

  getSummary(startDate: string, endDate: string): ChangelogSummary {
    const entries = this.getEntries({ startDate, endDate });

    const byCategory: Record<string, number> = {};
    const byApp: Record<string, number> = {};

    for (const entry of entries) {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
      if (entry.app) {
        byApp[entry.app] = (byApp[entry.app] || 0) + 1;
      }
    }

    return {
      period: `${startDate} to ${endDate}`,
      entries,
      stats: {
        total: entries.length,
        byCategory,
        byApp,
      },
    };
  }

  renderMarkdown(startDate: string, endDate: string): string {
    const summary = this.getSummary(startDate, endDate);
    const lines: string[] = [];

    lines.push(`# Personal Changelog`);
    lines.push(`## ${summary.period}`);
    lines.push('');
    lines.push(`Total changes: ${summary.stats.total}`);
    lines.push('');

    // Group entries by date
    const byDate = new Map<string, ChangelogEntry[]>();
    for (const entry of summary.entries) {
      const existing = byDate.get(entry.date) || [];
      existing.push(entry);
      byDate.set(entry.date, existing);
    }

    for (const [date, entries] of byDate) {
      lines.push(`### ${date}`);
      lines.push('');
      for (const entry of entries) {
        const appLabel = entry.app ? ` [${entry.app}]` : '';
        const catLabel = entry.category !== 'general' ? ` (${entry.category})` : '';
        lines.push(`- ${entry.title}${appLabel}${catLabel}`);
        if (entry.details) {
          try {
            const parsed = JSON.parse(entry.details);
            if (parsed && typeof parsed === 'object') {
              for (const [key, val] of Object.entries(parsed)) {
                if (val && typeof val !== 'object') {
                  lines.push(`  - ${key}: ${val}`);
                }
              }
            }
          } catch (_e) {
            if (entry.details.length > 0 && entry.details !== '{}') {
              lines.push(`  - ${entry.details}`);
            }
          }
        }
      }
      lines.push('');
    }

    // Summary section
    if (Object.keys(summary.stats.byCategory).length > 0) {
      lines.push('### Categories');
      lines.push('');
      for (const [cat, cnt] of Object.entries(summary.stats.byCategory).sort((a, b) => b[1] - a[1])) {
        lines.push(`- ${cat}: ${cnt}`);
      }
      lines.push('');
    }

    if (Object.keys(summary.stats.byApp).length > 0) {
      lines.push('### By Application');
      lines.push('');
      for (const [app, cnt] of Object.entries(summary.stats.byApp).sort((a, b) => b[1] - a[1])) {
        lines.push(`- ${app}: ${cnt}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  async exportChangelog(startDate: string, endDate: string): Promise<string | null> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null;

    const markdown = this.renderMarkdown(startDate, endDate);

    const result = await dialog.showSaveDialog(this.mainWindow, {
      title: 'Export Personal Changelog',
      defaultPath: `changelog-${startDate}-to-${endDate}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });

    if (result.canceled || !result.filePath) return null;

    fs.writeFileSync(result.filePath, markdown, 'utf-8');
    log.info(`[PersonalChangelog] Exported changelog to ${result.filePath}`);
    return result.filePath;
  }

  getCategories(): string[] {
    const db = this.getDb();
    if (!db) return [];
    const rows = db.prepare(
      'SELECT DISTINCT category FROM personal_changelog ORDER BY category ASC'
    ).all() as any[];
    return rows.map(r => r.category);
  }

  private registerIPC(): void {
    ipcMain.handle('changelog:add', async (_event, date: string, category: string, title: string, details?: string, app?: string) => {
      return this.addEntry(date, category, title, details, app);
    });

    ipcMain.handle('changelog:remove', async (_event, id: number) => {
      return this.removeEntry(id);
    });

    ipcMain.handle('changelog:get', async (_event, options?: any) => {
      return this.getEntries(options);
    });

    ipcMain.handle('changelog:generate', async (_event, startDate: string, endDate: string) => {
      return this.generateFromActivity(startDate, endDate);
    });

    ipcMain.handle('changelog:getSummary', async (_event, startDate: string, endDate: string) => {
      return this.getSummary(startDate, endDate);
    });

    ipcMain.handle('changelog:renderMarkdown', async (_event, startDate: string, endDate: string) => {
      return this.renderMarkdown(startDate, endDate);
    });

    ipcMain.handle('changelog:export', async (_event, startDate: string, endDate: string) => {
      return this.exportChangelog(startDate, endDate);
    });

    ipcMain.handle('changelog:getCategories', async () => {
      return this.getCategories();
    });
  }
}

export const personalChangelogManager = new PersonalChangelogManager();
