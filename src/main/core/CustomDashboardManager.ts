// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Custom Dashboard Manager (Feature 27)
// Pinnable widget grid layout with user-configured dashboard panels.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

interface DashboardWidget {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, any>;
}

interface DashboardLayout {
  id: number;
  name: string;
  widgets: DashboardWidget[];
  is_default: number;
  created_at: string;
  updated_at: string;
}

const WIDGET_TYPES = [
  'tasks-summary',
  'word-count',
  'time-tracking',
  'project-health',
  'recent-activity',
  'goals-progress',
  'statistics',
  'media-gallery',
  'daily-note',
  'reminders',
  'search',
  'calendar',
  'clock',
  'quick-actions',
] as const;

class CustomDashboardManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.ensureDefaultLayout();
    this.registerIPC();
    log.info('[CustomDashboard] Custom dashboard manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_layouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        widgets TEXT NOT NULL DEFAULT '[]',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_dashboard_default ON dashboard_layouts(is_default);
    `);
  }

  private ensureDefaultLayout(): void {
    const db = this.getDb();
    if (!db) return;
    const existing = db.prepare('SELECT id FROM dashboard_layouts WHERE is_default = 1').get();
    if (existing) return;

    const defaultWidgets: DashboardWidget[] = [
      { id: 'w-tasks', type: 'tasks-summary', title: 'Tasks', x: 0, y: 0, w: 4, h: 3, config: {} },
      { id: 'w-stats', type: 'statistics', title: 'Statistics', x: 4, y: 0, w: 4, h: 3, config: {} },
      { id: 'w-activity', type: 'recent-activity', title: 'Recent Activity', x: 8, y: 0, w: 4, h: 3, config: {} },
      { id: 'w-goals', type: 'goals-progress', title: 'Goals', x: 0, y: 3, w: 6, h: 3, config: {} },
      { id: 'w-words', type: 'word-count', title: 'Word Count', x: 6, y: 3, w: 3, h: 3, config: {} },
      { id: 'w-time', type: 'time-tracking', title: 'Time', x: 9, y: 3, w: 3, h: 3, config: {} },
    ];

    db.prepare(
      `INSERT INTO dashboard_layouts (name, widgets, is_default) VALUES (?, ?, 1)`
    ).run('Default Dashboard', JSON.stringify(defaultWidgets));
  }

  getLayouts(): DashboardLayout[] {
    const db = this.getDb();
    if (!db) return [];
    const rows = db.prepare('SELECT * FROM dashboard_layouts ORDER BY is_default DESC, name ASC').all();
    return rows.map((r: any) => ({
      ...r,
      widgets: JSON.parse(r.widgets || '[]'),
    })) as DashboardLayout[];
  }

  getDefaultLayout(): DashboardLayout | null {
    const db = this.getDb();
    if (!db) return null;
    const row = db.prepare('SELECT * FROM dashboard_layouts WHERE is_default = 1').get() as any;
    if (!row) return null;
    return { ...row, widgets: JSON.parse(row.widgets || '[]') };
  }

  getLayout(id: number): DashboardLayout | null {
    const db = this.getDb();
    if (!db) return null;
    const row = db.prepare('SELECT * FROM dashboard_layouts WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...row, widgets: JSON.parse(row.widgets || '[]') };
  }

  createLayout(name: string, widgets: DashboardWidget[] = []): DashboardLayout | null {
    const db = this.getDb();
    if (!db) return null;

    const trimmed = name.trim();
    if (!trimmed) return null;

    const result = db.prepare(
      `INSERT INTO dashboard_layouts (name, widgets) VALUES (?, ?)`
    ).run(trimmed, JSON.stringify(widgets));

    return this.getLayout(result.lastInsertRowid as number);
  }

  updateLayout(id: number, updates: { name?: string; widgets?: DashboardWidget[] }): DashboardLayout | null {
    const db = this.getDb();
    if (!db) return null;

    const existing = db.prepare('SELECT * FROM dashboard_layouts WHERE id = ?').get(id);
    if (!existing) return null;

    if (updates.name !== undefined) {
      db.prepare('UPDATE dashboard_layouts SET name = ?, updated_at = datetime("now") WHERE id = ?').run(updates.name.trim(), id);
    }
    if (updates.widgets !== undefined) {
      db.prepare('UPDATE dashboard_layouts SET widgets = ?, updated_at = datetime("now") WHERE id = ?').run(JSON.stringify(updates.widgets), id);
    }

    return this.getLayout(id);
  }

  setDefault(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;

    const existing = db.prepare('SELECT id FROM dashboard_layouts WHERE id = ?').get(id);
    if (!existing) return false;

    db.prepare('UPDATE dashboard_layouts SET is_default = 0').run();
    db.prepare('UPDATE dashboard_layouts SET is_default = 1 WHERE id = ?').run(id);
    return true;
  }

  deleteLayout(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;

    const row = db.prepare('SELECT is_default FROM dashboard_layouts WHERE id = ?').get(id) as any;
    if (!row) return false;
    if (row.is_default === 1) return false; // cannot delete default

    db.prepare('DELETE FROM dashboard_layouts WHERE id = ?').run(id);
    return true;
  }

  addWidget(layoutId: number, widget: DashboardWidget): DashboardLayout | null {
    const layout = this.getLayout(layoutId);
    if (!layout) return null;

    const exists = layout.widgets.find(w => w.id === widget.id);
    if (exists) return layout;

    layout.widgets.push(widget);
    return this.updateLayout(layoutId, { widgets: layout.widgets });
  }

  removeWidget(layoutId: number, widgetId: string): DashboardLayout | null {
    const layout = this.getLayout(layoutId);
    if (!layout) return null;

    layout.widgets = layout.widgets.filter(w => w.id !== widgetId);
    return this.updateLayout(layoutId, { widgets: layout.widgets });
  }

  getWidgetTypes(): string[] {
    return [...WIDGET_TYPES];
  }

  private registerIPC(): void {
    ipcMain.handle('dashboard:getLayouts', async () => {
      return this.getLayouts();
    });

    ipcMain.handle('dashboard:getDefault', async () => {
      return this.getDefaultLayout();
    });

    ipcMain.handle('dashboard:getLayout', async (_event, id: number) => {
      return this.getLayout(id);
    });

    ipcMain.handle('dashboard:create', async (_event, name: string, widgets?: DashboardWidget[]) => {
      return this.createLayout(name, widgets);
    });

    ipcMain.handle('dashboard:update', async (_event, id: number, updates: { name?: string; widgets?: DashboardWidget[] }) => {
      return this.updateLayout(id, updates);
    });

    ipcMain.handle('dashboard:setDefault', async (_event, id: number) => {
      return this.setDefault(id);
    });

    ipcMain.handle('dashboard:delete', async (_event, id: number) => {
      return this.deleteLayout(id);
    });

    ipcMain.handle('dashboard:addWidget', async (_event, layoutId: number, widget: DashboardWidget) => {
      return this.addWidget(layoutId, widget);
    });

    ipcMain.handle('dashboard:removeWidget', async (_event, layoutId: number, widgetId: string) => {
      return this.removeWidget(layoutId, widgetId);
    });

    ipcMain.handle('dashboard:getWidgetTypes', async () => {
      return this.getWidgetTypes();
    });
  }
}

export const customDashboardManager = new CustomDashboardManager();
