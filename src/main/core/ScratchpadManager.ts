// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Scratchpad Manager
// Globally accessible quick notes panel. Auto-saves to SQLite every 5s.
// Persists content, position, and size between sessions.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface ScratchpadState {
  content: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  updatedAt: number;
}

class ScratchpadManager {
  private mainWindow: BrowserWindow | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private pendingContent: string | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.ensureRow();
    this.registerIPC();
    this.startAutoSave();
    log.info('[Scratchpad] Scratchpad manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private ensureRow(): void {
    const db = this.getDb();
    if (!db) return;
    const existing = db.prepare('SELECT id FROM scratchpad WHERE id = 1').get();
    if (!existing) {
      db.prepare(
        'INSERT INTO scratchpad (id, content, position_x, position_y, width, height, updated_at) VALUES (1, ?, -1, -1, 400, 300, ?)'
      ).run('', Date.now());
    }
  }

  getState(): ScratchpadState {
    const db = this.getDb();
    if (!db) {
      return { content: '', positionX: -1, positionY: -1, width: 400, height: 300, updatedAt: Date.now() };
    }
    const row = db.prepare('SELECT * FROM scratchpad WHERE id = 1').get();
    if (!row) {
      return { content: '', positionX: -1, positionY: -1, width: 400, height: 300, updatedAt: Date.now() };
    }
    return {
      content: row.content || '',
      positionX: row.position_x,
      positionY: row.position_y,
      width: row.width,
      height: row.height,
      updatedAt: row.updated_at,
    };
  }

  updateContent(content: string): void {
    this.pendingContent = content;
  }

  saveNow(): void {
    const db = this.getDb();
    if (!db) return;
    if (this.pendingContent !== null) {
      db.prepare('UPDATE scratchpad SET content = ?, updated_at = ? WHERE id = 1')
        .run(this.pendingContent, Date.now());
      this.pendingContent = null;
    }
  }

  updatePosition(x: number, y: number, width: number, height: number): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('UPDATE scratchpad SET position_x = ?, position_y = ?, width = ?, height = ?, updated_at = ? WHERE id = 1')
      .run(x, y, width, height, Date.now());
  }

  clearContent(): void {
    const db = this.getDb();
    if (!db) return;
    this.pendingContent = null;
    db.prepare('UPDATE scratchpad SET content = ?, updated_at = ? WHERE id = 1')
      .run('', Date.now());
  }

  sendToNotes(): { content: string } | null {
    const state = this.getState();
    if (!state.content || state.content.trim().length === 0) return null;
    const content = state.content;
    this.clearContent();
    return { content };
  }

  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      this.saveNow();
    }, 5000);
  }

  private registerIPC(): void {
    ipcMain.handle('scratchpad:getState', () => {
      return this.getState();
    });

    ipcMain.handle('scratchpad:updateContent', (_event, content: string) => {
      this.updateContent(content);
      return true;
    });

    ipcMain.handle('scratchpad:saveNow', () => {
      this.saveNow();
      return true;
    });

    ipcMain.handle('scratchpad:updatePosition', (_event, x: number, y: number, width: number, height: number) => {
      this.updatePosition(x, y, width, height);
      return true;
    });

    ipcMain.handle('scratchpad:clear', () => {
      this.clearContent();
      return true;
    });

    ipcMain.handle('scratchpad:sendToNotes', () => {
      return this.sendToNotes();
    });
  }

  shutdown(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveNow();
    log.info('[Scratchpad] Shutdown');
  }
}

export const scratchpadManager = new ScratchpadManager();

export function initializeScratchpad(mainWindow: BrowserWindow): void {
  scratchpadManager.initialize(mainWindow);
}

export function shutdownScratchpad(): void {
  scratchpadManager.shutdown();
}
