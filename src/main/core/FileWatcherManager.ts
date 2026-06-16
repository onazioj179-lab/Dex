// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX - File Watcher Manager (Feature 22)
// Monitors user-specified folders and auto-imports new media files.
// ==========================================================================

import { ipcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { EventEmitter } from 'events';
import { databaseManager } from './DatabaseManager';

export interface WatchedFolder {
  id: number;
  folder_path: string;
  file_types: string;
  import_behavior: 'auto-import' | 'notify-only';
  created_at: number;
}

// ---------------------------------------------------------------------------
// Generic path-based watching (consolidated from the retired core/FileWatcher)
// Emits 'change' and 'changes' events for arbitrary authorized paths, used by
// the File Intelligence controller. Coexists with the media-library folder
// auto-import role above.
// ---------------------------------------------------------------------------

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  stats?: fs.Stats;
  timestamp: Date;
}

export interface PathWatcherConfig {
  path: string;
  recursive: boolean;
  enabled: boolean;
  ignoreDotFiles: boolean;
  ignorePatterns: string[];
  debounceMs: number;
}

export interface PathWatcherStatus {
  path: string;
  isWatching: boolean;
  eventCount: number;
  lastEvent?: FileChangeEvent;
  startedAt?: Date;
  errors: number;
}

class FileWatcherManager extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;
  private watchers: Map<number, fs.FSWatcher> = new Map();

  // Generic path-based watch state
  private pathWatchers: Map<string, fs.FSWatcher> = new Map();
  private pathConfigs: Map<string, PathWatcherConfig> = new Map();
  private pathStatus: Map<string, PathWatcherStatus> = new Map();
  private pathChangeBuffer: Map<string, FileChangeEvent[]> = new Map();
  private pathDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
  }

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

  // -------------------------------------------------------------------------
  // Generic Path Watching (File Intelligence)
  // -------------------------------------------------------------------------

  /**
   * Start watching an arbitrary directory and emit file-change events.
   * Returns true if the watcher was started.
   */
  watchPath(config: Partial<PathWatcherConfig> & { path: string }): boolean {
    const fullConfig: PathWatcherConfig = {
      recursive: true,
      enabled: true,
      ignoreDotFiles: true,
      ignorePatterns: [
        'node_modules',
        '.git',
        '__pycache__',
        '*.tmp',
        '*.temp',
        '~$*',
        '.DS_Store',
        'Thumbs.db',
      ],
      debounceMs: 300,
      ...config,
    };

    if (!fs.existsSync(fullConfig.path)) {
      log.error(`[FileWatcher] Path does not exist: ${fullConfig.path}`);
      return false;
    }

    // Stop existing watcher if any
    this.unwatchPath(fullConfig.path);

    try {
      const watcher = fs.watch(
        fullConfig.path,
        { recursive: fullConfig.recursive },
        (eventType, filename) => {
          this.handlePathWatchEvent(fullConfig.path, eventType, filename);
        }
      );

      watcher.on('error', (error) => {
        this.handlePathWatchError(fullConfig.path, error);
      });

      this.pathWatchers.set(fullConfig.path, watcher);
      this.pathConfigs.set(fullConfig.path, fullConfig);
      this.pathStatus.set(fullConfig.path, {
        path: fullConfig.path,
        isWatching: true,
        eventCount: 0,
        startedAt: new Date(),
        errors: 0,
      });

      log.info(`[FileWatcher] Started watching path: ${fullConfig.path}`);
      this.emit('watchStarted', fullConfig.path);
      return true;
    } catch (error) {
      log.error(`[FileWatcher] Failed to watch ${fullConfig.path}:`, error);
      return false;
    }
  }

  /**
   * Stop watching an arbitrary directory.
   */
  unwatchPath(dirPath: string): void {
    const watcher = this.pathWatchers.get(dirPath);
    if (watcher) {
      watcher.close();
      this.pathWatchers.delete(dirPath);
      this.pathConfigs.delete(dirPath);

      const status = this.pathStatus.get(dirPath);
      if (status) {
        status.isWatching = false;
      }

      const timer = this.pathDebounceTimers.get(dirPath);
      if (timer) {
        clearTimeout(timer);
        this.pathDebounceTimers.delete(dirPath);
      }

      log.info(`[FileWatcher] Stopped watching path: ${dirPath}`);
      this.emit('watchStopped', dirPath);
    }
  }

  getPathWatcherStatus(dirPath: string): PathWatcherStatus | undefined {
    return this.pathStatus.get(dirPath);
  }

  getAllPathWatcherStatuses(): PathWatcherStatus[] {
    return Array.from(this.pathStatus.values());
  }

  getPathWatcherServiceStatus() {
    return {
      isEnabled: true,
      isPaused: false,
      watcherCount: this.pathWatchers.size,
      totalEvents: Array.from(this.pathStatus.values())
        .reduce((sum, s) => sum + s.eventCount, 0),
      totalErrors: Array.from(this.pathStatus.values())
        .reduce((sum, s) => sum + s.errors, 0),
    };
  }

  private handlePathWatchEvent(
    basePath: string,
    eventType: string,
    filename: string | null
  ): void {
    if (!filename) return;

    const config = this.pathConfigs.get(basePath);
    if (!config || !config.enabled) return;

    const fullPath = path.join(basePath, filename);

    if (this.shouldIgnorePath(filename, config)) return;

    const event: FileChangeEvent = {
      type: this.determinePathEventType(fullPath, eventType),
      path: fullPath,
      timestamp: new Date(),
    };

    try {
      if (fs.existsSync(fullPath)) {
        event.stats = fs.statSync(fullPath);
      }
    } catch {
      // File might have been deleted
    }

    const buffer = this.pathChangeBuffer.get(basePath) || [];
    buffer.push(event);
    this.pathChangeBuffer.set(basePath, buffer);

    const status = this.pathStatus.get(basePath);
    if (status) {
      status.eventCount++;
      status.lastEvent = event;
    }

    this.debouncePathEmit(basePath, config.debounceMs);
  }

  private determinePathEventType(
    filePath: string,
    fsEventType: string
  ): FileChangeEvent['type'] {
    try {
      const exists = fs.existsSync(filePath);
      if (!exists) {
        return 'unlink';
      }

      const stats = fs.statSync(filePath);
      if (fsEventType === 'rename') {
        return stats.isDirectory() ? 'addDir' : 'add';
      }
      return 'change';
    } catch {
      return 'unlink';
    }
  }

  private debouncePathEmit(basePath: string, delay: number): void {
    const existing = this.pathDebounceTimers.get(basePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.flushPathBuffer(basePath);
      this.pathDebounceTimers.delete(basePath);
    }, delay);

    this.pathDebounceTimers.set(basePath, timer);
  }

  private flushPathBuffer(basePath: string): void {
    const events = this.pathChangeBuffer.get(basePath) || [];
    this.pathChangeBuffer.set(basePath, []);

    if (events.length === 0) return;

    // Deduplicate events for the same path
    const deduplicated = new Map<string, FileChangeEvent>();
    for (const event of events) {
      deduplicated.set(event.path, event);
    }

    const finalEvents = Array.from(deduplicated.values());

    this.emit('changes', {
      basePath,
      events: finalEvents,
      count: finalEvents.length,
    });

    for (const event of finalEvents) {
      this.emit('change', event);
    }
  }

  private handlePathWatchError(basePath: string, error: Error): void {
    log.error(`[FileWatcher] Error on ${basePath}:`, error);

    const status = this.pathStatus.get(basePath);
    if (status) {
      status.errors++;
    }

    this.emit('error', { path: basePath, error });

    // Try to recover by restarting the watcher
    const config = this.pathConfigs.get(basePath);
    if (config && status && status.errors < 5) {
      setTimeout(() => {
        log.info(`[FileWatcher] Attempting to recover watcher for ${basePath}`);
        this.watchPath(config);
      }, 5000);
    }
  }

  private shouldIgnorePath(filename: string, config: PathWatcherConfig): boolean {
    if (config.ignoreDotFiles && filename.startsWith('.')) {
      return true;
    }

    for (const pattern of config.ignorePatterns) {
      if (this.matchPathPattern(filename, pattern)) {
        return true;
      }
    }

    return false;
  }

  private matchPathPattern(filename: string, pattern: string): boolean {
    if (pattern.startsWith('*')) {
      return filename.endsWith(pattern.slice(1));
    }
    if (pattern.endsWith('*')) {
      return filename.startsWith(pattern.slice(0, -1));
    }
    return filename === pattern || filename.includes(pattern);
  }

  shutdown(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    for (const watcher of this.pathWatchers.values()) {
      watcher.close();
    }
    this.pathWatchers.clear();
    this.pathConfigs.clear();
    for (const timer of this.pathDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.pathDebounceTimers.clear();
  }
}

export const fileWatcherManager = new FileWatcherManager();
