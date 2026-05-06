// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Multi Window Manager
// Detach any inner app into a standalone Electron window.
// State shared via IPC in real time. Window positions remembered.
// ==========================================================================

import { ipcMain, BrowserWindow, app, screen } from 'electron';
import * as path from 'path';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface DetachedWindowInfo {
  appId: string;
  window: BrowserWindow;
  bounds: { x: number; y: number; width: number; height: number };
}

class MultiWindowManager {
  private mainWindow: BrowserWindow | null = null;
  private detachedWindows: Map<string, BrowserWindow> = new Map();

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPC();
    log.info('[MultiWindow] Multi window manager initialized');
  }

  async detachApp(appId: string): Promise<boolean> {
    if (this.detachedWindows.has(appId)) {
      const existing = this.detachedWindows.get(appId)!;
      if (!existing.isDestroyed()) {
        existing.focus();
        return true;
      }
      this.detachedWindows.delete(appId);
    }

    const savedBounds = this.getSavedBounds(appId);
    const bounds = savedBounds || { x: 100, y: 100, width: 1024, height: 768 };

    const displays = screen.getAllDisplays();
    let validPosition = false;
    for (const display of displays) {
      const db = display.bounds;
      if (bounds.x >= db.x - 50 && bounds.y >= db.y - 50 &&
          bounds.x < db.x + db.width && bounds.y < db.y + db.height) {
        validPosition = true;
        break;
      }
    }
    if (!validPosition) {
      const primary = screen.getPrimaryDisplay();
      bounds.x = primary.bounds.x + 100;
      bounds.y = primary.bounds.y + 100;
    }

    const preloadPath = path.join(__dirname, 'preload.js');
    const detachedWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: 400,
      minHeight: 300,
      title: `DEX - ${appId}`,
      frame: true,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: true,
      },
    });

    this.detachedWindows.set(appId, detachedWindow);

    if (savedBounds && (savedBounds as any).maximized) {
      detachedWindow.maximize();
    }

    const indexPath = path.join(__dirname, '../renderer/index.html');
    try {
      await detachedWindow.loadFile(indexPath);
      detachedWindow.webContents.executeJavaScript(
        `window.__dexDetachedApp = "${appId}"; window.__dexIsDetached = true;`
      );
      // Show on ready-to-show to prevent white flash
      detachedWindow.once('ready-to-show', () => {
        if (!detachedWindow.isDestroyed()) detachedWindow.show();
      });
      // Fallback: if ready-to-show already fired before listener attached
      if (detachedWindow.isVisible()) {
        // already shown
      } else {
        setTimeout(() => {
          if (!detachedWindow.isDestroyed() && !detachedWindow.isVisible()) {
            detachedWindow.show();
          }
        }, 3000);
      }
    } catch (err) {
      log.error('[MultiWindow] Failed to load detached window:', err);
      detachedWindow.destroy();
      this.detachedWindows.delete(appId);
      return false;
    }

    detachedWindow.on('close', () => {
      if (!detachedWindow.isDestroyed()) {
        const currentBounds = detachedWindow.getBounds();
        const maximized = detachedWindow.isMaximized();
        this.saveBounds(appId, currentBounds.x, currentBounds.y, currentBounds.width, currentBounds.height, maximized);
      }
    });

    detachedWindow.on('closed', () => {
      this.detachedWindows.delete(appId);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('multiwindow:reattached', appId);
      }
    });

    detachedWindow.webContents.on('ipc-message', (_event, channel, ...args) => {
      if (channel.startsWith('state-sync:') && this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, ...args);
      }
    });

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('multiwindow:detached', appId);
    }

    log.info(`[MultiWindow] Detached app: ${appId}`);
    return true;
  }

  reattachApp(appId: string): boolean {
    const win = this.detachedWindows.get(appId);
    if (!win || win.isDestroyed()) {
      this.detachedWindows.delete(appId);
      return false;
    }

    const bounds = win.getBounds();
    const maximized = win.isMaximized();
    this.saveBounds(appId, bounds.x, bounds.y, bounds.width, bounds.height, maximized);

    win.close();
    return true;
  }

  broadcastToDetached(appId: string, channel: string, ...args: any[]): void {
    const win = this.detachedWindows.get(appId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }

  broadcastToAll(channel: string, ...args: any[]): void {
    for (const [, win] of this.detachedWindows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  isDetached(appId: string): boolean {
    const win = this.detachedWindows.get(appId);
    return !!win && !win.isDestroyed();
  }

  getDetachedApps(): string[] {
    const apps: string[] = [];
    for (const [appId, win] of this.detachedWindows) {
      if (!win.isDestroyed()) {
        apps.push(appId);
      }
    }
    return apps;
  }

  private getSavedBounds(appId: string): { x: number; y: number; width: number; height: number; maximized?: boolean } | null {
    const db = databaseManager.getDatabase();
    if (!db) return null;
    const row = db.prepare('SELECT * FROM detached_windows WHERE app_id = ?').get(appId);
    if (!row) return null;
    return {
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      maximized: row.maximized === 1,
    };
  }

  private saveBounds(appId: string, x: number, y: number, width: number, height: number, maximized: boolean): void {
    const db = databaseManager.getDatabase();
    if (!db) return;
    db.prepare(
      `INSERT INTO detached_windows (app_id, x, y, width, height, maximized) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(app_id) DO UPDATE SET x = ?, y = ?, width = ?, height = ?, maximized = ?`
    ).run(appId, x, y, width, height, maximized ? 1 : 0, x, y, width, height, maximized ? 1 : 0);
  }

  private registerIPC(): void {
    ipcMain.handle('multiwindow:detach', async (_event, appId: string) => {
      return this.detachApp(appId);
    });

    ipcMain.handle('multiwindow:reattach', (_event, appId: string) => {
      return this.reattachApp(appId);
    });

    ipcMain.handle('multiwindow:isDetached', (_event, appId: string) => {
      return this.isDetached(appId);
    });

    ipcMain.handle('multiwindow:getDetachedApps', () => {
      return this.getDetachedApps();
    });

    ipcMain.handle('multiwindow:broadcastState', (_event, appId: string, channel: string, data: any) => {
      this.broadcastToDetached(appId, channel, data);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data);
      }
      return true;
    });

    ipcMain.on('state-sync:update', (event, appId: string, stateKey: string, stateValue: any) => {
      for (const [id, win] of this.detachedWindows) {
        if (!win.isDestroyed() && win.webContents !== event.sender) {
          win.webContents.send('state-sync:update', appId, stateKey, stateValue);
        }
      }
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents !== event.sender) {
        this.mainWindow.webContents.send('state-sync:update', appId, stateKey, stateValue);
      }
    });
  }

  shutdown(): void {
    for (const [appId, win] of this.detachedWindows) {
      if (!win.isDestroyed()) {
        try {
          const bounds = win.getBounds();
          const maximized = win.isMaximized();
          this.saveBounds(appId, bounds.x, bounds.y, bounds.width, bounds.height, maximized);
          win.close();
        } catch {
          // ignore
        }
      }
    }
    this.detachedWindows.clear();
    log.info('[MultiWindow] Shutdown');
  }
}

export const multiWindowManager = new MultiWindowManager();

export function initializeMultiWindow(mainWindow: BrowserWindow): void {
  multiWindowManager.initialize(mainWindow);
}

export function shutdownMultiWindow(): void {
  multiWindowManager.shutdown();
}
