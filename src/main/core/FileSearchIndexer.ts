// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - File Search Indexer
// FINAL UI FUNCTIONALITY PHASE: Scoped Computer Search
// Indexes user-approved folders, incremental, pauses during interaction
// ===========================================================================

import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import { ipcMain, BrowserWindow } from 'electron';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface FileIndexEntry {
  id: string;
  name: string;
  nameLower: string;
  path: string;
  type: 'file' | 'folder';
  extension?: string;
  size?: number;
  modifiedAt: number;
  indexedAt: number;
  scope: string; // Which approved folder this belongs to
}

export interface IndexedScope {
  path: string;
  name: string;
  enabled: boolean;
  lastIndexed: number;
  fileCount: number;
}

export interface FileSearchResult {
  id: string;
  type: 'file' | 'folder';
  title: string;
  subtitle: string;
  path: string;
  scope: 'computer';
  score: number;
  action: {
    type: 'open';
    target: string;
  };
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const MAX_FILES_PER_SCOPE = 10000;
const INDEX_BATCH_SIZE = 100;
const INDEX_PAUSE_CHECK_INTERVAL = 50;
const SUPPORTED_EXTENSIONS = new Set([
  // Documents
  '.txt', '.md', '.doc', '.docx', '.pdf', '.rtf', '.odt',
  // Code
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.cs',
  '.html', '.css', '.scss', '.json', '.xml', '.yaml', '.yml',
  // Data
  '.csv', '.xls', '.xlsx', '.sql',
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  // Media
  '.mp3', '.wav', '.mp4', '.mov', '.avi',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz',
]);

// -----------------------------------------------------------------------------
// File Search Indexer
// -----------------------------------------------------------------------------

export class FileSearchIndexer {
  private dataStore: DataStore;
  private logger: Logger;
  private mainWindow: BrowserWindow | null = null;
  
  private index: Map<string, FileIndexEntry> = new Map();
  private scopes: IndexedScope[] = [];
  private isIndexing: boolean = false;
  private shouldPause: boolean = false;
  private lastUserActivity: number = Date.now();
  private activityCheckInterval: NodeJS.Timeout | null = null;

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
  }

  async initialize(mainWindow: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow;
    
    // Load persisted scopes
    await this.loadScopes();
    
    // Register IPC handlers
    this.registerHandlers();
    
    // Start activity monitor
    this.startActivityMonitor();
    
    // Start background indexing for all enabled scopes
    this.startBackgroundIndexing();
    
    this.logger.info('File Search Indexer initialized');
  }

  // -------------------------------------------------------------------------
  // IPC Handlers
  // -------------------------------------------------------------------------

  private registerHandlers(): void {
    // Get all indexed scopes
    ipcMain.handle('fileSearch:getScopes', async () => {
      return this.scopes;
    });

    // Add a new scope (folder to index)
    ipcMain.handle('fileSearch:addScope', async (_, folderPath: string) => {
      return this.addScope(folderPath);
    });

    // Remove a scope
    ipcMain.handle('fileSearch:removeScope', async (_, scopePath: string) => {
      return this.removeScope(scopePath);
    });

    // Enable/disable a scope
    ipcMain.handle('fileSearch:toggleScope', async (_, scopePath: string, enabled: boolean) => {
      return this.toggleScope(scopePath, enabled);
    });

    // Search files
    ipcMain.handle('fileSearch:search', async (_, query: string, options?: { limit?: number }) => {
      return this.search(query, options);
    });

    // Get index stats
    ipcMain.handle('fileSearch:getStats', async () => {
      return {
        totalFiles: this.index.size,
        scopes: this.scopes,
        isIndexing: this.isIndexing,
      };
    });

    // Trigger reindex
    ipcMain.handle('fileSearch:reindex', async (_, scopePath?: string) => {
      if (scopePath) {
        await this.reindexScope(scopePath);
      } else {
        await this.reindexAll();
      }
      return { success: true };
    });

    // Record user activity (pauses indexing)
    ipcMain.on('fileSearch:userActivity', () => {
      this.recordUserActivity();
    });
  }

  // -------------------------------------------------------------------------
  // Scope Management
  // -------------------------------------------------------------------------

  private async loadScopes(): Promise<void> {
    try {
      const savedScopes = await this.dataStore.get<IndexedScope[]>('fileSearchScopes');
      if (savedScopes && Array.isArray(savedScopes)) {
        this.scopes = savedScopes;
      }
      
      // Load index from disk
      const savedIndex = await this.dataStore.get<FileIndexEntry[]>('fileSearchIndex');
      if (savedIndex && Array.isArray(savedIndex)) {
        this.index.clear();
        for (const entry of savedIndex) {
          this.index.set(entry.id, entry);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load file search scopes');
    }
  }

  private async saveScopes(): Promise<void> {
    try {
      await this.dataStore.set('fileSearchScopes', this.scopes);
    } catch (error) {
      this.logger.error('Failed to save file search scopes');
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      const entries = Array.from(this.index.values());
      await this.dataStore.set('fileSearchIndex', entries);
    } catch (error) {
      this.logger.error('Failed to save file search index');
    }
  }

  async addScope(folderPath: string): Promise<{ success: boolean; error?: string }> {
    // Validate path exists
    if (!fs.existsSync(folderPath)) {
      return { success: false, error: 'Folder does not exist' };
    }

    // Check if already added
    if (this.scopes.some(s => s.path === folderPath)) {
      return { success: false, error: 'Folder already indexed' };
    }

    const scope: IndexedScope = {
      path: folderPath,
      name: path.basename(folderPath),
      enabled: true,
      lastIndexed: 0,
      fileCount: 0,
    };

    this.scopes.push(scope);
    await this.saveScopes();

    // Start indexing in background
    this.indexScope(scope);

    return { success: true };
  }

  async removeScope(scopePath: string): Promise<boolean> {
    const index = this.scopes.findIndex(s => s.path === scopePath);
    if (index === -1) return false;

    this.scopes.splice(index, 1);
    
    // Remove all entries from this scope
    for (const [id, entry] of this.index) {
      if (entry.scope === scopePath) {
        this.index.delete(id);
      }
    }

    await this.saveScopes();
    await this.saveIndex();
    
    return true;
  }

  async toggleScope(scopePath: string, enabled: boolean): Promise<boolean> {
    const scope = this.scopes.find(s => s.path === scopePath);
    if (!scope) return false;

    scope.enabled = enabled;
    await this.saveScopes();

    if (enabled && scope.lastIndexed === 0) {
      this.indexScope(scope);
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------

  private startBackgroundIndexing(): void {
    // Index all enabled scopes that haven't been indexed recently
    for (const scope of this.scopes) {
      if (scope.enabled) {
        const hoursSinceIndex = (Date.now() - scope.lastIndexed) / (1000 * 60 * 60);
        if (hoursSinceIndex > 24) {
          this.indexScope(scope);
        }
      }
    }
  }

  private async indexScope(scope: IndexedScope): Promise<void> {
    if (this.isIndexing) {
      // Queue for later
      return;
    }

    this.isIndexing = true;
    this.shouldPause = false;

    try {
      this.logger.info(`Indexing scope: ${scope.path}`);
      
      // Clear existing entries for this scope
      for (const [id, entry] of this.index) {
        if (entry.scope === scope.path) {
          this.index.delete(id);
        }
      }

      let fileCount = 0;
      await this.indexDirectory(scope.path, scope.path, fileCount);

      scope.lastIndexed = Date.now();
      scope.fileCount = fileCount;

      await this.saveScopes();
      await this.saveIndex();

      this.logger.info(`Indexed ${fileCount} files from ${scope.path}`);
    } catch (error) {
      this.logger.error(`Failed to index scope: ${scope.path}`);
    } finally {
      this.isIndexing = false;
    }
  }

  private async indexDirectory(
    dirPath: string,
    scopePath: string,
    fileCount: number
  ): Promise<number> {
    if (fileCount >= MAX_FILES_PER_SCOPE) return fileCount;

    // Check if should pause for user interaction
    await this.checkPause();

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      let batchCount = 0;

      for (const entry of entries) {
        if (fileCount >= MAX_FILES_PER_SCOPE) break;

        const fullPath = path.join(dirPath, entry.name);

        // Skip hidden files/folders
        if (entry.name.startsWith('.')) continue;

        // Skip node_modules and common large directories
        if (entry.isDirectory()) {
          const skipDirs = ['node_modules', '__pycache__', '.git', '.svn', 'dist', 'build', 'coverage'];
          if (skipDirs.includes(entry.name)) continue;
        }

        if (entry.isDirectory()) {
          // Recursively index subdirectory
          fileCount = await this.indexDirectory(fullPath, scopePath, fileCount);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          
          // Only index supported file types (or all if extension is empty/unknown)
          if (ext === '' || SUPPORTED_EXTENSIONS.has(ext)) {
            this.addFileToIndex(entry.name, fullPath, scopePath);
            fileCount++;
          }
        }

        batchCount++;
        if (batchCount >= INDEX_BATCH_SIZE) {
          // Yield to event loop
          await new Promise(resolve => setImmediate(resolve));
          batchCount = 0;
        }
      }
    } catch (error) {
      // Permission denied or other error - skip this directory
    }

    return fileCount;
  }

  private addFileToIndex(name: string, filePath: string, scopePath: string): void {
    const id = `file-${Buffer.from(filePath).toString('base64').slice(0, 32)}`;
    const ext = path.extname(name).toLowerCase();

    let stats: fs.Stats | null = null;
    try {
      stats = fs.statSync(filePath);
    } catch {
      // Ignore
    }

    const entry: FileIndexEntry = {
      id,
      name,
      nameLower: name.toLowerCase(),
      path: filePath,
      type: 'file',
      extension: ext || undefined,
      size: stats?.size,
      modifiedAt: stats?.mtimeMs || Date.now(),
      indexedAt: Date.now(),
      scope: scopePath,
    };

    this.index.set(id, entry);
  }

  private async reindexScope(scopePath: string): Promise<void> {
    const scope = this.scopes.find(s => s.path === scopePath);
    if (scope) {
      await this.indexScope(scope);
    }
  }

  private async reindexAll(): Promise<void> {
    for (const scope of this.scopes) {
      if (scope.enabled) {
        await this.indexScope(scope);
      }
    }
  }

  // -------------------------------------------------------------------------
  // User Activity & Pause
  // -------------------------------------------------------------------------

  private startActivityMonitor(): void {
    // Check for user activity every 500ms during indexing
    this.activityCheckInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - this.lastUserActivity;
      // Pause if user was active in last 500ms
      this.shouldPause = timeSinceActivity < 500;
    }, 500);
  }

  recordUserActivity(): void {
    this.lastUserActivity = Date.now();
  }

  private async checkPause(): Promise<void> {
    let pauseCount = 0;
    while (this.shouldPause && pauseCount < 20) {
      await new Promise(resolve => setTimeout(resolve, INDEX_PAUSE_CHECK_INTERVAL));
      pauseCount++;
    }
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  search(query: string, options?: { limit?: number }): FileSearchResult[] {
    const limit = options?.limit || 10;
    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);

    if (!queryLower) return [];

    const results: Array<FileSearchResult & { rawScore: number }> = [];

    for (const entry of this.index.values()) {
      // Check if scope is enabled
      const scope = this.scopes.find(s => s.path === entry.scope);
      if (!scope?.enabled) continue;

      let score = 0;

      // Exact match
      if (entry.nameLower === queryLower) {
        score = 1.0;
      }
      // Starts with query
      else if (entry.nameLower.startsWith(queryLower)) {
        score = 0.9;
      }
      // Contains query
      else if (entry.nameLower.includes(queryLower)) {
        score = 0.7;
      }
      // Word matching
      else {
        for (const word of queryWords) {
          if (entry.nameLower.includes(word)) {
            score += 0.3;
          }
        }
      }

      if (score > 0) {
        // Boost recent files
        const ageHours = (Date.now() - entry.modifiedAt) / (1000 * 60 * 60);
        if (ageHours < 24) score *= 1.1;
        else if (ageHours < 168) score *= 1.05; // 1 week

        results.push({
          id: entry.id,
          type: entry.type,
          title: entry.name,
          subtitle: entry.path,
          path: entry.path,
          scope: 'computer',
          score: Math.min(score, 1),
          rawScore: score,
          action: {
            type: 'open',
            target: entry.path,
          },
        });
      }
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.rawScore - a.rawScore)
      .slice(0, limit)
      .map(({ rawScore, ...result }) => result);
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  shutdown(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }
    this.saveIndex().catch((e: unknown) => { log.warn('[DEX]', e); });
  }
}

// Singleton instance
let fileSearchIndexer: FileSearchIndexer | null = null;

export function getFileSearchIndexer(): FileSearchIndexer | null {
  return fileSearchIndexer;
}

export function initializeFileSearchIndexer(
  dataStore: DataStore,
  logger: Logger,
  mainWindow: BrowserWindow
): FileSearchIndexer {
  fileSearchIndexer = new FileSearchIndexer(dataStore, logger);
  fileSearchIndexer.initialize(mainWindow);
  return fileSearchIndexer;
}

export function shutdownFileSearchIndexer(): void {
  fileSearchIndexer?.shutdown();
  fileSearchIndexer = null;
}
