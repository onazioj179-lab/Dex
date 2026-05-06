// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Keyboard Navigation Manager (Feature 10)
// Keyboard-only navigation mode with alphanumeric hint overlays.
// ==========================================================================

import { ipcMain, BrowserWindow, globalShortcut } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

class KeyboardNavigationManager {
  private mainWindow: BrowserWindow | null = null;
  private isActive: boolean = false;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.loadState();
    this.registerIPC();
    this.registerShortcut();
    log.info('[KeyboardNav] Keyboard navigation manager initialized');
  }

  private loadState(): void {
    const val = databaseManager.getSetting('keyboard_nav_enabled', 'false');
    this.isActive = val === 'true';
  }

  toggle(): boolean {
    this.isActive = !this.isActive;
    databaseManager.setSetting('keyboard_nav_enabled', this.isActive ? 'true' : 'false');
    if (this.mainWindow) {
      this.mainWindow.webContents.send('keyboard-nav:stateChanged', this.isActive);
    }
    return this.isActive;
  }

  setActive(active: boolean): void {
    this.isActive = active;
    databaseManager.setSetting('keyboard_nav_enabled', active ? 'true' : 'false');
    if (this.mainWindow) {
      this.mainWindow.webContents.send('keyboard-nav:stateChanged', this.isActive);
    }
  }

  getActive(): boolean {
    return this.isActive;
  }

  private registerShortcut(): void {
    try {
      const accelerator = process.platform === 'darwin' ? 'Cmd+Shift+K' : 'Ctrl+Shift+K';
      globalShortcut.register(accelerator, () => {
        this.toggle();
      });
    } catch (err) {
      log.warn('[KeyboardNav] Failed to register shortcut:', err);
    }
  }

  private registerIPC(): void {
    ipcMain.handle('keyboard-nav:toggle', async () => {
      return this.toggle();
    });

    ipcMain.handle('keyboard-nav:getState', async () => {
      return this.isActive;
    });

    ipcMain.handle('keyboard-nav:setState', async (_event, active: boolean) => {
      this.setActive(active);
    });
  }

  shutdown(): void {
    try {
      const accelerator = process.platform === 'darwin' ? 'Cmd+Shift+K' : 'Ctrl+Shift+K';
      globalShortcut.unregister(accelerator);
    } catch { /* non-critical */ }
  }
}

export const keyboardNavigationManager = new KeyboardNavigationManager();
