// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX - Storage Manager
 * ===========================================================================
 * 
 * Efficient, structured storage layer for Dex system data.
 * 
 * PRINCIPLES:
 * - Separation: User files vs Dex system data
 * - Efficiency: Indexed metadata only, no file duplication
 * - Visibility: Storage usage always visible to user
 * - Control: Hard limits configurable by user
 * - Cleanup: Automatic removal of unused cache data
 */

import log from 'electron-log';
import { ipcMain, app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ===========================================================================
// Types
// ===========================================================================

export interface StorageConfig {
  maxStorageMB: number;          // Hard limit in MB (default: 500MB)
  maxCacheMB: number;            // Cache limit (default: 100MB)
  retentionDays: {
    logs: number;                // Days to keep logs (default: 30)
    cache: number;               // Days to keep cache (default: 7)
    learningData: number;        // Days to keep learning data (default: 90)
  };
  autoCleanup: boolean;          // Auto-cleanup enabled (default: true)
  cleanupIntervalHours: number;  // How often to run cleanup (default: 24)
}

export interface StorageStats {
  totalUsedBytes: number;
  totalUsedMB: number;
  limitMB: number;
  usagePercent: number;
  breakdown: {
    notes: number;
    automations: number;
    logs: number;
    learning: number;
    cache: number;
    metadata: number;
    other: number;
  };
  fileCount: number;
  lastCleanup: number | null;
  healthStatus: 'healthy' | 'warning' | 'critical';
}

export interface StorageLocation {
  id: string;
  name: string;
  path: string;
  type: 'system' | 'user' | 'cache';
  sizeBytes: number;
  fileCount: number;
}

interface MetadataIndex {
  id: string;
  type: 'note' | 'automation' | 'file' | 'workflow' | 'log';
  name: string;
  path?: string;                  // Reference to external file (not duplicated)
  createdAt: number;
  updatedAt: number;
  size: number;
  tags: string[];
  metadata: Record<string, any>;
}

// ===========================================================================
// Storage Manager
// ===========================================================================

class StorageManager {
  private mainWindow: BrowserWindow | null = null;
  private baseDir: string;
  private configFile: string;
  private indexFilePath: string;
  
  private config: StorageConfig;
  private metadataIndex: Map<string, MetadataIndex> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Storage directories
  private readonly dirs = {
    notes: 'notes',
    automations: 'automations',
    logs: 'logs',
    learning: 'learning',
    cache: 'cache',
    metadata: 'metadata',
    temp: 'temp',
  };

  constructor() {
    this.baseDir = path.join(app.getPath('userData'), 'storage');
    this.configFile = path.join(this.baseDir, 'config.json');
    this.indexFilePath = path.join(this.baseDir, 'index.json');
    
    this.config = {
      maxStorageMB: 500,
      maxCacheMB: 100,
      retentionDays: {
        logs: 30,
        cache: 7,
        learningData: 90,
      },
      autoCleanup: true,
      cleanupIntervalHours: 24,
    };
    
    this.initialize();
    this.registerIPCHandlers();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private async initialize(): Promise<void> {
    try {
      // Create directory structure
      this.ensureDirectories();
      
      // Load configuration
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(data) };
      } else {
        this.saveConfig();
      }
      
      // Load metadata index
      if (fs.existsSync(this.indexFilePath)) {
        const data = fs.readFileSync(this.indexFilePath, 'utf-8');
        const entries: MetadataIndex[] = JSON.parse(data);
        entries.forEach(e => this.metadataIndex.set(e.id, e));
      }
      
      // Schedule auto-cleanup
      if (this.config.autoCleanup) {
        this.scheduleCleanup();
      }
      
      // Run initial cleanup if needed
      const stats = await this.getStats();
      if (stats.healthStatus === 'critical') {
        await this.runCleanup();
      }
      
      log.info('[StorageManager] Initialized:', {
        usedMB: stats.totalUsedMB.toFixed(2),
        limitMB: this.config.maxStorageMB,
        files: stats.fileCount,
      });
    } catch (err) {
      log.error('[StorageManager] Initialization error:', err);
    }
  }

  private ensureDirectories(): void {
    // Create base directory
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    
    // Create subdirectories
    Object.values(this.dirs).forEach(dir => {
      const fullPath = path.join(this.baseDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ===========================================================================
  // Storage Operations
  // ===========================================================================

  /**
   * Store data in Dex storage (not user files)
   */
  async store(
    type: 'note' | 'automation' | 'log' | 'learning' | 'cache' | 'metadata',
    id: string,
    data: any,
    options?: { tags?: string[]; metadata?: Record<string, any> }
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      // Check storage limits
      const stats = await this.getStats();
      const dataSize = Buffer.byteLength(JSON.stringify(data), 'utf-8');
      
      if (stats.totalUsedBytes + dataSize > this.config.maxStorageMB * 1024 * 1024) {
        // Try cleanup first
        await this.runCleanup();
        const newStats = await this.getStats();
        
        if (newStats.totalUsedBytes + dataSize > this.config.maxStorageMB * 1024 * 1024) {
          return { success: false, error: 'Storage limit exceeded' };
        }
      }
      
      // Determine directory
      const dirMap: Record<string, string> = {
        note: this.dirs.notes,
        automation: this.dirs.automations,
        log: this.dirs.logs,
        learning: this.dirs.learning,
        cache: this.dirs.cache,
        metadata: this.dirs.metadata,
      };
      
      const dir = path.join(this.baseDir, dirMap[type]);
      const filePath = path.join(dir, `${id}.json`);
      
      // Write data
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      // Update index
      const indexEntry: MetadataIndex = {
        id,
        type: type === 'log' ? 'log' : type === 'cache' ? 'file' : type as any,
        name: options?.metadata?.name || id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: dataSize,
        tags: options?.tags || [],
        metadata: options?.metadata || {},
      };
      
      this.metadataIndex.set(id, indexEntry);
      await this.saveIndex();
      
      return { success: true, path: filePath };
    } catch (err: any) {
      log.error('[StorageManager] Store error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Retrieve data from Dex storage
   */
  async retrieve(
    type: 'note' | 'automation' | 'log' | 'learning' | 'cache' | 'metadata',
    id: string
  ): Promise<any | null> {
    try {
      const dirMap: Record<string, string> = {
        note: this.dirs.notes,
        automation: this.dirs.automations,
        log: this.dirs.logs,
        learning: this.dirs.learning,
        cache: this.dirs.cache,
        metadata: this.dirs.metadata,
      };
      
      const filePath = path.join(this.baseDir, dirMap[type], `${id}.json`);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      log.error('[StorageManager] Retrieve error:', err);
      return null;
    }
  }

  /**
   * Delete data from Dex storage
   */
  async delete(
    type: 'note' | 'automation' | 'log' | 'learning' | 'cache' | 'metadata',
    id: string
  ): Promise<boolean> {
    try {
      const dirMap: Record<string, string> = {
        note: this.dirs.notes,
        automation: this.dirs.automations,
        log: this.dirs.logs,
        learning: this.dirs.learning,
        cache: this.dirs.cache,
        metadata: this.dirs.metadata,
      };
      
      const filePath = path.join(this.baseDir, dirMap[type], `${id}.json`);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      this.metadataIndex.delete(id);
      await this.saveIndex();
      
      return true;
    } catch (err) {
      log.error('[StorageManager] Delete error:', err);
      return false;
    }
  }

  /**
   * Store file reference (metadata only, no duplication)
   */
  async indexFile(
    filePath: string,
    options?: { tags?: string[]; metadata?: Record<string, any> }
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }
      
      const stats = fs.statSync(filePath);
      const id = crypto.createHash('md5').update(filePath).digest('hex');
      
      const indexEntry: MetadataIndex = {
        id,
        type: 'file',
        name: path.basename(filePath),
        path: filePath,                    // Reference only, not copied
        createdAt: stats.birthtime.getTime(),
        updatedAt: stats.mtime.getTime(),
        size: stats.size,
        tags: options?.tags || [],
        metadata: {
          extension: path.extname(filePath),
          directory: path.dirname(filePath),
          ...options?.metadata,
        },
      };
      
      this.metadataIndex.set(id, indexEntry);
      await this.saveIndex();
      
      return { success: true, id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Remove file from index (doesn't delete actual file)
   */
  async unindexFile(filePath: string): Promise<boolean> {
    const id = crypto.createHash('md5').update(filePath).digest('hex');
    this.metadataIndex.delete(id);
    await this.saveIndex();
    return true;
  }

  // ===========================================================================
  // Statistics & Monitoring
  // ===========================================================================

  async getStats(): Promise<StorageStats> {
    const breakdown = {
      notes: 0,
      automations: 0,
      logs: 0,
      learning: 0,
      cache: 0,
      metadata: 0,
      other: 0,
    };
    
    let totalSize = 0;
    let fileCount = 0;
    
    // Calculate size for each directory
    const dirSizes: Record<string, number> = {};
    for (const [key, dir] of Object.entries(this.dirs)) {
      const fullPath = path.join(this.baseDir, dir);
      const size = this.getDirectorySize(fullPath);
      dirSizes[key] = size;
      totalSize += size;
      fileCount += this.getFileCount(fullPath);
    }
    
    breakdown.notes = dirSizes.notes || 0;
    breakdown.automations = dirSizes.automations || 0;
    breakdown.logs = dirSizes.logs || 0;
    breakdown.learning = dirSizes.learning || 0;
    breakdown.cache = dirSizes.cache || 0;
    breakdown.metadata = dirSizes.metadata || 0;
    
    // Add index file size
    if (fs.existsSync(this.indexFilePath)) {
      const indexSize = fs.statSync(this.indexFilePath).size;
      breakdown.metadata += indexSize;
      totalSize += indexSize;
      fileCount++;
    }
    
    const limitBytes = this.config.maxStorageMB * 1024 * 1024;
    const usagePercent = (totalSize / limitBytes) * 100;
    
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (usagePercent > 90) healthStatus = 'critical';
    else if (usagePercent > 75) healthStatus = 'warning';
    
    return {
      totalUsedBytes: totalSize,
      totalUsedMB: totalSize / (1024 * 1024),
      limitMB: this.config.maxStorageMB,
      usagePercent,
      breakdown,
      fileCount,
      lastCleanup: this.getLastCleanupTime(),
      healthStatus,
    };
  }

  private getDirectorySize(dirPath: string): number {
    let size = 0;
    try {
      if (!fs.existsSync(dirPath)) return 0;
      
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          size += this.getDirectorySize(filePath);
        } else {
          size += stats.size;
        }
      }
    } catch (err) {
      // Ignore errors
    }
    return size;
  }

  private getFileCount(dirPath: string): number {
    let count = 0;
    try {
      if (!fs.existsSync(dirPath)) return 0;
      
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          count += this.getFileCount(filePath);
        } else {
          count++;
        }
      }
    } catch (err) {
      // Ignore errors
    }
    return count;
  }

  getLocations(): StorageLocation[] {
    const locations: StorageLocation[] = [];
    
    for (const [key, dir] of Object.entries(this.dirs)) {
      const fullPath = path.join(this.baseDir, dir);
      const type = key === 'cache' || key === 'temp' ? 'cache' : 'system';
      
      locations.push({
        id: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        path: fullPath,
        type,
        sizeBytes: this.getDirectorySize(fullPath),
        fileCount: this.getFileCount(fullPath),
      });
    }
    
    return locations;
  }

  // ===========================================================================
  // Cleanup & Maintenance
  // ===========================================================================

  async runCleanup(): Promise<{
    deletedFiles: number;
    freedBytes: number;
    categories: Record<string, number>;
  }> {
    log.info('[StorageManager] Running cleanup...');
    
    let deletedFiles = 0;
    let freedBytes = 0;
    const categories: Record<string, number> = {};
    
    const now = Date.now();
    
    // 1. Clean old logs
    const logCutoff = now - this.config.retentionDays.logs * 24 * 60 * 60 * 1000;
    const logResult = await this.cleanDirectory(
      path.join(this.baseDir, this.dirs.logs),
      logCutoff
    );
    deletedFiles += logResult.deleted;
    freedBytes += logResult.freed;
    categories['logs'] = logResult.freed;
    
    // 2. Clean old cache
    const cacheCutoff = now - this.config.retentionDays.cache * 24 * 60 * 60 * 1000;
    const cacheResult = await this.cleanDirectory(
      path.join(this.baseDir, this.dirs.cache),
      cacheCutoff
    );
    deletedFiles += cacheResult.deleted;
    freedBytes += cacheResult.freed;
    categories['cache'] = cacheResult.freed;
    
    // 3. Clean temp directory completely
    const tempResult = await this.cleanDirectory(
      path.join(this.baseDir, this.dirs.temp),
      now // Delete everything
    );
    deletedFiles += tempResult.deleted;
    freedBytes += tempResult.freed;
    categories['temp'] = tempResult.freed;
    
    // 4. Clean old learning data if needed
    const learningCutoff = now - this.config.retentionDays.learningData * 24 * 60 * 60 * 1000;
    const learningResult = await this.cleanDirectory(
      path.join(this.baseDir, this.dirs.learning),
      learningCutoff
    );
    deletedFiles += learningResult.deleted;
    freedBytes += learningResult.freed;
    categories['learning'] = learningResult.freed;
    
    // 5. Clean orphaned index entries
    await this.cleanOrphanedIndexEntries();
    
    // Record cleanup time
    this.recordCleanupTime();
    
    log.info('[StorageManager] Cleanup complete:', {
      deletedFiles,
      freedMB: (freedBytes / (1024 * 1024)).toFixed(2),
    });
    
    this.emitStorageChange();
    
    return { deletedFiles, freedBytes, categories };
  }

  private async cleanDirectory(
    dirPath: string,
    cutoffTime: number
  ): Promise<{ deleted: number; freed: number }> {
    let deleted = 0;
    let freed = 0;
    
    try {
      if (!fs.existsSync(dirPath)) return { deleted, freed };
      
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          const size = stats.size;
          fs.unlinkSync(filePath);
          deleted++;
          freed += size;
        }
      }
    } catch (err) {
      log.error('[StorageManager] Clean directory error:', err);
    }
    
    return { deleted, freed };
  }

  private async cleanOrphanedIndexEntries(): Promise<void> {
    const toDelete: string[] = [];
    
    for (const [id, entry] of this.metadataIndex) {
      // Check if referenced file still exists
      if (entry.path && !fs.existsSync(entry.path)) {
        toDelete.push(id);
      }
    }
    
    toDelete.forEach(id => this.metadataIndex.delete(id));
    
    if (toDelete.length > 0) {
      await this.saveIndex();
    }
  }

  private scheduleCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, intervalMs);
  }

  private getLastCleanupTime(): number | null {
    try {
      const markerFile = path.join(this.baseDir, '.last_cleanup');
      if (fs.existsSync(markerFile)) {
        return parseInt(fs.readFileSync(markerFile, 'utf-8'), 10);
      }
    } catch (err) {
      // Ignore
    }
    return null;
  }

  private recordCleanupTime(): void {
    try {
      const markerFile = path.join(this.baseDir, '.last_cleanup');
      fs.writeFileSync(markerFile, Date.now().toString());
    } catch (err) {
      // Ignore
    }
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  getConfig(): StorageConfig {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<StorageConfig>): Promise<boolean> {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    
    // Reschedule cleanup if interval changed
    if (updates.autoCleanup !== undefined || updates.cleanupIntervalHours !== undefined) {
      if (this.config.autoCleanup) {
        this.scheduleCleanup();
      } else if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }
    
    this.emitStorageChange();
    return true;
  }

  private saveConfig(): void {
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
  }

  private async saveIndex(): Promise<void> {
    const entries = Array.from(this.metadataIndex.values());
    fs.writeFileSync(this.indexFilePath, JSON.stringify(entries, null, 2));
  }

  // ===========================================================================
  // Search & Query
  // ===========================================================================

  async search(query: string, options?: {
    types?: MetadataIndex['type'][];
    tags?: string[];
    limit?: number;
  }): Promise<MetadataIndex[]> {
    const lowerQuery = query.toLowerCase();
    let results: MetadataIndex[] = [];
    
    for (const entry of this.metadataIndex.values()) {
      // Filter by type
      if (options?.types && !options.types.includes(entry.type)) {
        continue;
      }
      
      // Filter by tags
      if (options?.tags && !options.tags.some(t => entry.tags.includes(t))) {
        continue;
      }
      
      // Match query
      if (
        entry.name.toLowerCase().includes(lowerQuery) ||
        entry.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
        (entry.path && entry.path.toLowerCase().includes(lowerQuery))
      ) {
        results.push(entry);
      }
    }
    
    // Sort by recency
    results.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // Apply limit
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }
    
    return results;
  }

  async listByType(type: MetadataIndex['type']): Promise<MetadataIndex[]> {
    const results: MetadataIndex[] = [];
    
    for (const entry of this.metadataIndex.values()) {
      if (entry.type === type) {
        results.push(entry);
      }
    }
    
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  private emitStorageChange(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.getStats().then(stats => {
        this.mainWindow!.webContents.send('storage:changed', stats);
      });
    }
  }

  // ===========================================================================
  // IPC Handlers
  // ===========================================================================

  private registerIPCHandlers(): void {
    ipcMain.handle('storage:getStats', () => this.getStats());
    ipcMain.handle('storage:getLocations', () => this.getLocations());
    ipcMain.handle('storage:getConfig', () => this.getConfig());
    ipcMain.handle('storage:updateConfig', (_, updates) => this.updateConfig(updates));
    
    ipcMain.handle('storage:store', (_, type, id, data, options) => 
      this.store(type, id, data, options)
    );
    ipcMain.handle('storage:retrieve', (_, type, id) => this.retrieve(type, id));
    ipcMain.handle('storage:delete', (_, type, id) => this.delete(type, id));
    
    ipcMain.handle('storage:indexFile', (_, filePath, options) => 
      this.indexFile(filePath, options)
    );
    ipcMain.handle('storage:unindexFile', (_, filePath) => this.unindexFile(filePath));
    
    ipcMain.handle('storage:search', (_, query, options) => this.search(query, options));
    ipcMain.handle('storage:listByType', (_, type) => this.listByType(type));
    
    ipcMain.handle('storage:runCleanup', () => this.runCleanup());
  }
}

// ===========================================================================
// Export
// ===========================================================================

export const storageManager = new StorageManager();
export default storageManager;
