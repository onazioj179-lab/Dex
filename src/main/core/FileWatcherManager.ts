// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - File Watcher Manager (Feature 22)
// Monitors user-specified folders and auto-imports new media files.
// ==========================================================================

import { ipcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface WatchedFolder {
  id: number;
  folder_path: string;
  file_types: string;
  import_behavior: 'auto-import' | 'notify-only';
  created_at: number;
}

class FileWatcherManager {
  private mainWindow: BrowserWindow | null = null;
  private watchers: Map<number, fs.FSWatcher> = new Map();

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    this.startWatching();
    log.info('[FileWatcher] File watcher manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS watched_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path TEXT NOT NULL UNIQUE,
        file_types TEXT NOT NULL DEFAULT 'all',
        import_behavior TEXT NOT NULL DEFAULT 'notify-only',
        created_at INTEGER NOT NULL
      );
    `);
  }

  private getMediaType(ext: string): string | null {
    const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv'];
    const audioExts = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.opus', '.m4a'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff'];

    const lower = ext.toLowerCase();
    if (videoExts.includes(lower)) return 'video';
    if (audioExts.includes(lower)) return 'audio';
    if (imageExts.includes(lower)) return 'image';
    return null;
  }

  private matchesFilter(filename: string, filterStr: string): boolean {
    if (filterStr === 'all') return true;
    const ext = path.extname(filename);
    const mediaType = this.getMediaType(ext);
    if (!mediaType) return false;

    const filters = filterStr.split(',').map(f => f.trim().toLowerCase());
    return filters.includes(mediaType) || filters.includes('all');
  }

  async addWatchedFolder(importBehavior: 'auto-import' | 'notify-only' = 'notify-only', fileTypes: string = 'all'): Promise<WatchedFolder | null> {
    if (!this.mainWindow) return null;

    const { canceled, filePaths } = await dialog.showOpenDialog(this.mainWindow, {
      title: 'Select Folder to Watch',
      properties: ['openDirectory'],
    });

    if (canceled || filePaths.length === 0) return null;
    const folderPath = filePaths[0];

    return this.addFolder(folderPath, importBehavior, fileTypes);
  }

  addFolder(folderPath: string, importBehavior: 'auto-import' | 'notify-only', fileTypes: string): WatchedFolder | null {
    const db = this.getDb();
    if (!db) return null;

    try {
      const result = db.prepare(
        `INSERT INTO watched_folders (folder_path, file_types, import_behavior, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(folder_path) DO UPDATE SET file_types = ?, import_behavior = ?`
      ).run(folderPath, fileTypes, importBehavior, Date.now(), fileTypes, importBehavior);

      const folder = db.prepare('SELECT * FROM watched_folders WHERE folder_path = ?').get(folderPath) as WatchedFolder;
      this.watchFolder(folder);
      return folder;
    } catch (err) {
      log.warn('[FileWatcher] Add folder error:', err);
      return null;
    }
  }

  removeWatchedFolder(id: number): boolean {
    const db = this.getDb();
    if (!db) return false;

    const watcher = this.watchers.get(id);
    if (watcher) {
      watcher.close();
      this.watchers.delete(id);
    }

    db.prepare('DELETE FROM watched_folders WHERE id = ?').run(id);
    return true;
  }

  getWatchedFolders(): WatchedFolder[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM watched_folders ORDER BY created_at DESC').all() as WatchedFolder[];
  }

  private startWatching(): void {
    const folders = this.getWatchedFolders();
    for (const folder of folders) {
      this.watchFolder(folder);
    }
  }

  private watchFolder(folder: WatchedFolder): void {
    if (this.watchers.has(folder.id)) return;
    if (!fs.existsSync(folder.folder_path)) return;

    try {
      const watcher = fs.watch(folder.folder_path, { persistent: false }, (eventType, filename) => {
        if (eventType === 'rename' && filename) {
          this.handleNewFile(folder, filename);
        }
      });
      this.watchers.set(folder.id, watcher);
    } catch (err) {
      log.warn('[FileWatcher] Watch error for', folder.folder_path, ':', err);
    }
  }

  private handleNewFile(folder: WatchedFolder, filename: string): void {
    const fullPath = path.join(folder.folder_path, filename);
    if (!fs.existsSync(fullPath)) return;

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return;
    if (!this.matchesFilter(filename, folder.file_types)) return;

    if (folder.import_behavior === 'auto-import') {
      this.importFile(fullPath, filename);
    } else {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('file-watcher:newFile', {
          folderId: folder.id,
          filepath: fullPath,
          filename,
        });
      }
    }
  }

  private importFile(filepath: string, filename: string): void {
    const db = this.getDb();
    if (!db) return;

    try {
      const stat = fs.statSync(filepath);
      const ext = path.extname(filename);
      const mediaType = this.getMediaType(ext) || 'file';

      db.prepare(
        `INSERT INTO media_library (filepath, filename, type, size, imported_by, last_used, use_count, timestamp)
         VALUES (?, ?, ?, ?, 'file-watcher', ?, 1, ?)
         ON CONFLICT(filepath) DO NOTHING`
      ).run(filepath, filename, mediaType, stat.size, Date.now(), Date.now());

      log.info(`[FileWatcher] Auto-imported: ${filename}`);
    } catch (err) {
      log.warn('[FileWatcher] Import error:', err);
    }
  }

  private registerIPC(): void {
    ipcMain.handle('file-watcher:addFolder', async (_event, importBehavior?: string, fileTypes?: string) => {
      return this.addWatchedFolder(
        (importBehavior as 'auto-import' | 'notify-only') || 'notify-only',
        fileTypes || 'all'
      );
    });

    ipcMain.handle('file-watcher:removeFolder', async (_event, id: number) => {
      return this.removeWatchedFolder(id);
    });

    ipcMain.handle('file-watcher:getFolders', async () => {
      return this.getWatchedFolders();
    });

    ipcMain.handle('file-watcher:importFile', async (_event, filepath: string, filename: string) => {
      this.importFile(filepath, filename);
    });
  }

  shutdown(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

export const fileWatcherManager = new FileWatcherManager();
