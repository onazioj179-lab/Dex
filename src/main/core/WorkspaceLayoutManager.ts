// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Workspace Layout Manager
// Save and restore named workspace arrangements.
// Three built-in layouts: Focus, Split, Default.
// Stored in SQLite. Integrates with global undo.
// ==========================================================================

import { ipcMain, BrowserWindow, screen } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface WorkspaceLayout {
  activeApp: string;
  dockState: 'pinned' | 'auto';
  splitScreen: {
    active: boolean;
    apps: string[];
    sizes: number[];
    direction: 'horizontal' | 'vertical';
  } | null;
  inspectorOpen: Record<string, boolean>;
  sidebarHelpOpen: Record<string, boolean>;
  windowBounds: { x: number; y: number; width: number; height: number };
  windowMaximized: boolean;
}

export interface LayoutRecord {
  id: number;
  name: string;
  layout_data: string;
  built_in: number;
  created_at: number;
  updated_at: number;
}

const BUILT_IN_LAYOUTS: Array<{ name: string; layout: WorkspaceLayout }> = [
  {
    name: 'Focus',
    layout: {
      activeApp: 'home',
      dockState: 'auto',
      splitScreen: null,
      inspectorOpen: {},
      sidebarHelpOpen: {},
      windowBounds: { x: 0, y: 0, width: 1280, height: 800 },
      windowMaximized: true,
    },
  },
  {
    name: 'Split',
    layout: {
      activeApp: 'notes',
      dockState: 'auto',
      splitScreen: {
        active: true,
        apps: ['notes', 'browser'],
        sizes: [50, 50],
        direction: 'horizontal',
      },
      inspectorOpen: { notes: true, browser: true },
      sidebarHelpOpen: {},
      windowBounds: { x: 0, y: 0, width: 1440, height: 900 },
      windowMaximized: false,
    },
  },
  {
    name: 'Default',
    layout: {
      activeApp: 'home',
      dockState: 'auto',
      splitScreen: null,
      inspectorOpen: {},
      sidebarHelpOpen: {},
      windowBounds: { x: 0, y: 0, width: 1280, height: 800 },
      windowMaximized: false,
    },
  },
];

class WorkspaceLayoutManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.ensureBuiltInLayouts();
    this.registerIPC();
    log.info('[Layouts] Workspace layout manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private ensureBuiltInLayouts(): void {
    const db = this.getDb();
    if (!db) return;

    for (const builtin of BUILT_IN_LAYOUTS) {
      const existing = db.prepare('SELECT id FROM workspace_layouts WHERE name = ? AND built_in = 1').get(builtin.name);
      if (!existing) {
        const now = Date.now();
        db.prepare(
          'INSERT INTO workspace_layouts (name, layout_data, built_in, created_at, updated_at) VALUES (?, ?, 1, ?, ?)'
        ).run(builtin.name, JSON.stringify(builtin.layout), now, now);
      }
    }
  }

  saveLayout(name: string, layout: WorkspaceLayout): number {
    const db = this.getDb();
    if (!db) return -1;

    const now = Date.now();
    const existing = db.prepare('SELECT id, built_in FROM workspace_layouts WHERE name = ?').get(name);
    if (existing) {
      if (existing.built_in === 1) {
        log.warn('[Layouts] Cannot overwrite built-in layout:', name);
        return -1;
      }
      db.prepare('UPDATE workspace_layouts SET layout_data = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(layout), now, existing.id);
      return existing.id;
    }

    const result = db.prepare(
      'INSERT INTO workspace_layouts (name, layout_data, built_in, created_at, updated_at) VALUES (?, ?, 0, ?, ?)'
    ).run(name, JSON.stringify(layout), now, now);

    return Number(result.lastInsertRowid);
  }

  getLayout(name: string): WorkspaceLayout | null {
    const db = this.getDb();
    if (!db) return null;
    const row = db.prepare('SELECT layout_data FROM workspace_layouts WHERE name = ?').get(name);
    if (!row) return null;
    try {
      return JSON.parse(row.layout_data);
    } catch {
      return null;
    }
  }

  getAllLayouts(): Array<{ id: number; name: string; builtIn: boolean; createdAt: number }> {
    const db = this.getDb();
    if (!db) return [];
    const rows = db.prepare('SELECT id, name, built_in, created_at FROM workspace_layouts ORDER BY built_in DESC, name ASC').all();
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      builtIn: r.built_in === 1,
      createdAt: r.created_at,
    }));
  }

  deleteLayout(name: string): boolean {
    const db = this.getDb();
    if (!db) return false;
    const row = db.prepare('SELECT built_in FROM workspace_layouts WHERE name = ?').get(name);
    if (!row || row.built_in === 1) return false;
    db.prepare('DELETE FROM workspace_layouts WHERE name = ?').run(name);
    return true;
  }

  applyLayout(name: string): WorkspaceLayout | null {
    const layout = this.getLayout(name);
    if (!layout) return null;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (layout.windowMaximized) {
        this.mainWindow.maximize();
      } else {
        const bounds = layout.windowBounds;
        const displays = screen.getAllDisplays();
        let validBounds = false;
        for (const display of displays) {
          const db = display.bounds;
          if (bounds.x >= db.x - 100 && bounds.y >= db.y - 100 &&
              bounds.x < db.x + db.width && bounds.y < db.y + db.height) {
            validBounds = true;
            break;
          }
        }
        if (validBounds) {
          this.mainWindow.setBounds(bounds);
        }
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        }
      }

      this.mainWindow.webContents.send('layout:apply', layout);
    }

    return layout;
  }

  getCurrentLayout(): WorkspaceLayout | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null;

    const bounds = this.mainWindow.getBounds();
    const maximized = this.mainWindow.isMaximized();

    return {
      activeApp: 'home',
      dockState: 'auto',
      splitScreen: null,
      inspectorOpen: {},
      sidebarHelpOpen: {},
      windowBounds: bounds,
      windowMaximized: maximized,
    };
  }

  private registerIPC(): void {
    ipcMain.handle('layout:save', (_event, name: string, layout: WorkspaceLayout) => {
      return this.saveLayout(name, layout);
    });

    ipcMain.handle('layout:get', (_event, name: string) => {
      return this.getLayout(name);
    });

    ipcMain.handle('layout:getAll', () => {
      return this.getAllLayouts();
    });

    ipcMain.handle('layout:delete', (_event, name: string) => {
      return this.deleteLayout(name);
    });

    ipcMain.handle('layout:apply', (_event, name: string) => {
      return this.applyLayout(name);
    });

    ipcMain.handle('layout:getCurrent', () => {
      return this.getCurrentLayout();
    });

    ipcMain.handle('layout:saveCurrentAs', async (_event, name: string) => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return -1;

      const rendererState = await this.mainWindow.webContents.executeJavaScript(
        `(function() {
          try {
            return {
              activeApp: window.__dexActiveApp || 'home',
              dockState: window.__dexDockState || 'auto',
              splitScreen: window.__dexSplitScreen || null,
              inspectorOpen: window.__dexInspectorOpen || {},
              sidebarHelpOpen: window.__dexSidebarHelpOpen || {},
            };
          } catch { return null; }
        })()`
      );

      const bounds = this.mainWindow.getBounds();
      const maximized = this.mainWindow.isMaximized();

      const layout: WorkspaceLayout = {
        activeApp: rendererState?.activeApp || 'home',
        dockState: rendererState?.dockState || 'auto',
        splitScreen: rendererState?.splitScreen || null,
        inspectorOpen: rendererState?.inspectorOpen || {},
        sidebarHelpOpen: rendererState?.sidebarHelpOpen || {},
        windowBounds: bounds,
        windowMaximized: maximized,
      };

      return this.saveLayout(name, layout);
    });
  }

  shutdown(): void {
    log.info('[Layouts] Shutdown');
  }
}

export const workspaceLayoutManager = new WorkspaceLayoutManager();

export function initializeWorkspaceLayouts(mainWindow: BrowserWindow): void {
  workspaceLayoutManager.initialize(mainWindow);
}

export function shutdownWorkspaceLayouts(): void {
  workspaceLayoutManager.shutdown();
}
