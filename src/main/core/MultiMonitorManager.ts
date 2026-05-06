// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { app, screen, BrowserWindow, ipcMain, Display } from 'electron';
import { EventEmitter } from 'events';
import log from 'electron-log';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

interface DisplayRecord {
  id: number;
  electron_id: number;
  label: string;
  bounds_x: number;
  bounds_y: number;
  bounds_width: number;
  bounds_height: number;
  work_area_x: number;
  work_area_y: number;
  work_area_width: number;
  work_area_height: number;
  scale_factor: number;
  rotation: number;
  refresh_rate: number;
  is_primary: number;
  detected_at: number;
}

interface WindowPlacement {
  id: string;
  window_id: string;
  display_electron_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  is_maximized: number;
  is_fullscreen: number;
  updated_at: number;
}

interface DetachedWindowInfo {
  windowId: string;
  appId: string;
  browserWindow: BrowserWindow;
  displayElectronId: number;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS displays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  electron_id INTEGER UNIQUE,
  label TEXT DEFAULT '',
  bounds_x INTEGER DEFAULT 0,
  bounds_y INTEGER DEFAULT 0,
  bounds_width INTEGER DEFAULT 0,
  bounds_height INTEGER DEFAULT 0,
  work_area_x INTEGER DEFAULT 0,
  work_area_y INTEGER DEFAULT 0,
  work_area_width INTEGER DEFAULT 0,
  work_area_height INTEGER DEFAULT 0,
  scale_factor REAL DEFAULT 1.0,
  rotation INTEGER DEFAULT 0,
  refresh_rate REAL DEFAULT 60.0,
  is_primary INTEGER DEFAULT 0,
  detected_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS window_placements (
  id TEXT PRIMARY KEY,
  window_id TEXT UNIQUE,
  display_electron_id INTEGER DEFAULT 0,
  x INTEGER DEFAULT 0,
  y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1280,
  height INTEGER DEFAULT 800,
  is_maximized INTEGER DEFAULT 0,
  is_fullscreen INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_displays_electron_id ON displays(electron_id);
CREATE INDEX IF NOT EXISTS idx_window_placements_window_id ON window_placements(window_id);
`;

export class MultiMonitorManager extends EventEmitter {
  private db: Database.Database | null = null;
  private mainWindow: BrowserWindow | null = null;
  private displays: Map<number, Display> = new Map();
  private currentDisplayId: number = 0;
  private detachedWindows: Map<string, DetachedWindowInfo> = new Map();
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private sharedScaleBuffer: SharedArrayBuffer | null = null;
  private sharedScaleView: Int32Array | null = null;
  private initialized = false;

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'dex-core.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      // Migrate: if displays table exists with old schema (missing electron_id), drop and recreate
      try {
        const cols = this.db.pragma('table_info(displays)') as any[];
        if (cols.length > 0 && !cols.some((c: any) => c.name === 'electron_id')) {
          this.db.exec('DROP TABLE IF EXISTS displays');
          this.db.exec('DROP INDEX IF EXISTS idx_displays_electron_id');
        }
      } catch (_) { /* table doesn't exist yet */ }

      // Migrate: if window_placements table exists with old schema (missing id column), drop and recreate
      try {
        const wpCols = this.db.pragma('table_info(window_placements)') as any[];
        if (wpCols.length > 0 && !wpCols.some((c: any) => c.name === 'id')) {
          this.db.exec('DROP TABLE IF EXISTS window_placements');
          this.db.exec('DROP INDEX IF EXISTS idx_window_placements_window_id');
        }
      } catch (_) { /* table doesn't exist yet */ }

      this.db.exec(SCHEMA_SQL);

      this.sharedScaleBuffer = new SharedArrayBuffer(4);
      this.sharedScaleView = new Int32Array(this.sharedScaleBuffer);

      this.enumerateDisplays();
      this.setupDisplayListeners();
      this.setupIPC();

      if (mainWindow) {
        this.mainWindow = mainWindow;
        this.restoreMainWindowPlacement();
        this.trackWindowDisplay(mainWindow, 'main');
      }

      this.initialized = true;
      log.info('[MultiMonitorManager] Initialized with', this.displays.size, 'displays');
    } catch (err) {
      log.error('[MultiMonitorManager] Initialization failed:', err);
    }
  }

  private enumerateDisplays(): void {
    const allDisplays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();

    this.displays.clear();

    const insertOrUpdate = this.db!.prepare(`
      INSERT INTO displays (electron_id, label, bounds_x, bounds_y, bounds_width, bounds_height,
        work_area_x, work_area_y, work_area_width, work_area_height,
        scale_factor, rotation, refresh_rate, is_primary, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(electron_id) DO UPDATE SET
        label=excluded.label, bounds_x=excluded.bounds_x, bounds_y=excluded.bounds_y,
        bounds_width=excluded.bounds_width, bounds_height=excluded.bounds_height,
        work_area_x=excluded.work_area_x, work_area_y=excluded.work_area_y,
        work_area_width=excluded.work_area_width, work_area_height=excluded.work_area_height,
        scale_factor=excluded.scale_factor, rotation=excluded.rotation,
        refresh_rate=excluded.refresh_rate, is_primary=excluded.is_primary,
        detected_at=excluded.detected_at
    `);

    const now = Date.now();
    const insertMany = this.db!.transaction(() => {
      for (const d of allDisplays) {
        this.displays.set(d.id, d);
        const isPrimary = d.id === primaryDisplay.id ? 1 : 0;
        const displayRate = (d as any).displayFrequency || (d as any).refreshRate || 60;
        insertOrUpdate.run(
          d.id,
          d.label || `Display ${d.id}`,
          d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height,
          d.workArea.x, d.workArea.y, d.workArea.width, d.workArea.height,
          d.scaleFactor, d.rotation, displayRate, isPrimary, now
        );
      }
    });
    insertMany();

    const currentScale = this.getCurrentScaleFactor();
    if (this.sharedScaleView) {
      Atomics.store(this.sharedScaleView, 0, Math.round(currentScale * 1000));
    }
  }

  private setupDisplayListeners(): void {
    screen.on('display-added', (_event: any, newDisplay: Display) => {
      log.info('[MultiMonitorManager] Display added:', newDisplay.id);
      this.displays.set(newDisplay.id, newDisplay);
      this.enumerateDisplays();
      this.emit('displays-changed', { type: 'added', displayId: newDisplay.id });
      this.notifyRenderer('displays-changed', this.getDisplaysInfo());
    });

    screen.on('display-removed', (_event: any, oldDisplay: Display) => {
      log.info('[MultiMonitorManager] Display removed:', oldDisplay.id);
      this.displays.delete(oldDisplay.id);
      this.enumerateDisplays();
      this.handleDisplayRemoved(oldDisplay.id);
      this.emit('displays-changed', { type: 'removed', displayId: oldDisplay.id });
      this.notifyRenderer('displays-changed', this.getDisplaysInfo());
    });

    screen.on('display-metrics-changed', (_event: any, display: Display, changedMetrics: string[]) => {
      log.info('[MultiMonitorManager] Display metrics changed:', display.id, changedMetrics);
      this.displays.set(display.id, display);
      this.enumerateDisplays();
      if (changedMetrics.includes('scaleFactor')) {
        const newScale = this.getCurrentScaleFactor();
        if (this.sharedScaleView) {
          Atomics.store(this.sharedScaleView, 0, Math.round(newScale * 1000));
        }
        this.notifyRenderer('scale-factor-changed', { displayId: display.id, scaleFactor: display.scaleFactor });
      }
      this.emit('displays-changed', { type: 'metrics-changed', displayId: display.id, changedMetrics });
      this.notifyRenderer('displays-changed', this.getDisplaysInfo());
    });
  }

  private handleDisplayRemoved(removedDisplayId: number): void {
    const primaryDisplay = screen.getPrimaryDisplay();

    if (this.currentDisplayId === removedDisplayId && this.mainWindow && !this.mainWindow.isDestroyed()) {
      const workArea = primaryDisplay.workArea;
      this.mainWindow.setBounds({
        x: workArea.x + Math.round(workArea.width * 0.1),
        y: workArea.y + Math.round(workArea.height * 0.1),
        width: Math.round(workArea.width * 0.8),
        height: Math.round(workArea.height * 0.8)
      });
      this.currentDisplayId = primaryDisplay.id;
    }

    for (const [wid, info] of this.detachedWindows) {
      if (info.displayElectronId === removedDisplayId && info.browserWindow && !info.browserWindow.isDestroyed()) {
        const workArea = primaryDisplay.workArea;
        info.browserWindow.setBounds({
          x: workArea.x + Math.round(workArea.width * 0.15),
          y: workArea.y + Math.round(workArea.height * 0.15),
          width: Math.round(workArea.width * 0.7),
          height: Math.round(workArea.height * 0.7)
        });
        info.displayElectronId = primaryDisplay.id;
      }
    }
  }

  private restoreMainWindowPlacement(): void {
    if (!this.mainWindow || !this.db) return;

    const row = this.db.prepare('SELECT * FROM window_placements WHERE window_id = ?').get('main') as WindowPlacement | undefined;
    if (!row) return;

    const targetDisplay = this.displays.get(row.display_electron_id);
    const primary = screen.getPrimaryDisplay();
    const display = targetDisplay || primary;
    const workArea = display.workArea;

    let x = row.x;
    let y = row.y;
    let width = Math.min(row.width, workArea.width);
    let height = Math.min(row.height, workArea.height);

    if (x < workArea.x || x + width > workArea.x + workArea.width) {
      x = workArea.x + Math.round((workArea.width - width) / 2);
    }
    if (y < workArea.y || y + height > workArea.y + workArea.height) {
      y = workArea.y + Math.round((workArea.height - height) / 2);
    }

    this.mainWindow.setBounds({ x, y, width, height });

    if (row.is_maximized) {
      this.mainWindow.maximize();
    }

    this.currentDisplayId = display.id;
  }

  trackWindowDisplay(win: BrowserWindow, windowId: string): void {
    const updateDisplay = () => {
      if (win.isDestroyed()) return;
      if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
      this.moveDebounceTimer = setTimeout(() => {
        if (win.isDestroyed()) return;
        const bounds = win.getBounds();
        const centerX = bounds.x + Math.round(bounds.width / 2);
        const centerY = bounds.y + Math.round(bounds.height / 2);

        let closestDisplay: Display | null = null;
        let closestDistance = Infinity;

        for (const [, d] of this.displays) {
          const dx = Math.max(d.bounds.x - centerX, 0, centerX - (d.bounds.x + d.bounds.width));
          const dy = Math.max(d.bounds.y - centerY, 0, centerY - (d.bounds.y + d.bounds.height));
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < closestDistance) {
            closestDistance = dist;
            closestDisplay = d;
          }
        }

        if (closestDisplay) {
          const prevId = windowId === 'main' ? this.currentDisplayId : this.detachedWindows.get(windowId)?.displayElectronId;
          if (prevId !== closestDisplay.id) {
            if (windowId === 'main') {
              this.currentDisplayId = closestDisplay.id;
            } else {
              const info = this.detachedWindows.get(windowId);
              if (info) info.displayElectronId = closestDisplay.id;
            }
            const newScale = closestDisplay.scaleFactor;
            if (this.sharedScaleView) {
              Atomics.store(this.sharedScaleView, 0, Math.round(newScale * 1000));
            }
            this.notifyRenderer('display-changed-for-window', {
              windowId,
              displayId: closestDisplay.id,
              scaleFactor: newScale
            });
          }

          this.saveWindowPlacement(windowId, closestDisplay.id, bounds, win.isMaximized(), win.isFullScreen());
        }
      }, 100);
    };

    win.on('move', updateDisplay);
    win.on('resize', updateDisplay);
    win.on('maximize', updateDisplay);
    win.on('unmaximize', updateDisplay);
  }

  private saveWindowPlacement(windowId: string, displayElectronId: number, bounds: Electron.Rectangle, isMaximized: boolean, isFullscreen: boolean): void {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT INTO window_placements (id, window_id, display_electron_id, x, y, width, height, is_maximized, is_fullscreen, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(window_id) DO UPDATE SET
          display_electron_id=excluded.display_electron_id, x=excluded.x, y=excluded.y,
          width=excluded.width, height=excluded.height, is_maximized=excluded.is_maximized,
          is_fullscreen=excluded.is_fullscreen, updated_at=excluded.updated_at
      `).run(windowId, windowId, displayElectronId, bounds.x, bounds.y, bounds.width, bounds.height,
        isMaximized ? 1 : 0, isFullscreen ? 1 : 0, Date.now());
    } catch (err) {
      log.warn('[MultiMonitorManager] Failed to save window placement:', err);
    }
  }

  registerDetachedWindow(windowId: string, appId: string, win: BrowserWindow): void {
    const placement = this.db?.prepare('SELECT * FROM window_placements WHERE window_id = ?').get(windowId) as WindowPlacement | undefined;
    const primaryDisplay = screen.getPrimaryDisplay();

    if (placement) {
      const targetDisplay = this.displays.get(placement.display_electron_id);
      const display = targetDisplay || primaryDisplay;
      const workArea = display.workArea;
      let x = placement.x;
      let y = placement.y;
      let width = Math.min(placement.width, workArea.width);
      let height = Math.min(placement.height, workArea.height);
      if (x < workArea.x || x + width > workArea.x + workArea.width) {
        x = workArea.x + Math.round((workArea.width - width) / 2);
      }
      if (y < workArea.y || y + height > workArea.y + workArea.height) {
        y = workArea.y + Math.round((workArea.height - height) / 2);
      }
      win.setBounds({ x, y, width, height });

      this.detachedWindows.set(windowId, {
        windowId, appId, browserWindow: win, displayElectronId: display.id
      });
    } else {
      this.detachedWindows.set(windowId, {
        windowId, appId, browserWindow: win, displayElectronId: primaryDisplay.id
      });
    }

    this.trackWindowDisplay(win, windowId);

    win.on('closed', () => {
      this.detachedWindows.delete(windowId);
    });
  }

  enterFullscreen(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    const bounds = win.getBounds();
    this.saveWindowPlacement('pre-fullscreen', this.currentDisplayId, bounds, win.isMaximized(), false);
    win.setFullScreen(true);
  }

  exitFullscreen(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    win.setFullScreen(false);
    const placement = this.db?.prepare('SELECT * FROM window_placements WHERE window_id = ?').get('pre-fullscreen') as WindowPlacement | undefined;
    if (placement) {
      const targetDisplay = this.displays.get(placement.display_electron_id);
      if (targetDisplay) {
        win.setBounds({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
      }
    }
  }

  getCurrentScaleFactor(): number {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const bounds = this.mainWindow.getBounds();
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      return display.scaleFactor;
    }
    return screen.getPrimaryDisplay().scaleFactor;
  }

  getSharedScaleBuffer(): SharedArrayBuffer | null {
    return this.sharedScaleBuffer;
  }

  getDisplaysInfo(): any[] {
    const result: any[] = [];
    for (const [, d] of this.displays) {
      const displayRate = (d as any).displayFrequency || (d as any).refreshRate || 60;
      result.push({
        id: d.id,
        label: d.label || `Display ${d.id}`,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
        rotation: d.rotation,
        refreshRate: displayRate,
        isPrimary: d.id === screen.getPrimaryDisplay().id
      });
    }
    return result;
  }

  private notifyRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`multimonitor:${channel}`, data);
    }
    for (const [, info] of this.detachedWindows) {
      if (info.browserWindow && !info.browserWindow.isDestroyed()) {
        info.browserWindow.webContents.send(`multimonitor:${channel}`, data);
      }
    }
  }

  private setupIPC(): void {
    ipcMain.handle('multimonitor:get-displays', () => {
      return this.getDisplaysInfo();
    });

    ipcMain.handle('multimonitor:get-current-display', () => {
      const display = this.displays.get(this.currentDisplayId);
      if (!display) return null;
      const displayRate = (display as any).displayFrequency || (display as any).refreshRate || 60;
      return {
        id: display.id,
        label: display.label || `Display ${display.id}`,
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        rotation: display.rotation,
        refreshRate: displayRate,
        isPrimary: display.id === screen.getPrimaryDisplay().id
      };
    });

    ipcMain.handle('multimonitor:get-scale-factor', () => {
      return this.getCurrentScaleFactor();
    });

    ipcMain.handle('multimonitor:get-window-placement', (_event, windowId: string) => {
      if (!this.db) return null;
      return this.db.prepare('SELECT * FROM window_placements WHERE window_id = ?').get(windowId) || null;
    });

    ipcMain.handle('multimonitor:enter-fullscreen', () => {
      if (this.mainWindow) this.enterFullscreen(this.mainWindow);
    });

    ipcMain.handle('multimonitor:exit-fullscreen', () => {
      if (this.mainWindow) this.exitFullscreen(this.mainWindow);
    });

    ipcMain.handle('multimonitor:get-shared-scale-buffer', () => {
      return this.sharedScaleBuffer;
    });
  }

  destroy(): void {
    if (this.moveDebounceTimer) clearTimeout(this.moveDebounceTimer);
    this.detachedWindows.clear();
    this.displays.clear();
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
    }
    this.initialized = false;
    log.info('[MultiMonitorManager] Destroyed');
  }
}

export const multiMonitorManager = new MultiMonitorManager();
