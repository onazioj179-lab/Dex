// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Clean Uninstall System
// System 5 Feature 10: Zero footprint after uninstall
// Tracks all created files, offers complete removal, leaves nothing behind
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, dialog, shell } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type FileCategory = 
  | 'config'
  | 'data'
  | 'cache'
  | 'logs'
  | 'temp'
  | 'user-created'
  | 'vault'
  | 'index'
  | 'backup';

export interface TrackedFile {
  path: string;
  category: FileCategory;
  createdAt: number;
  lastModified: number;
  sizeBytes: number;
  essential: boolean;
  userOwned: boolean;
  hash?: string;
}

export interface TrackedDirectory {
  path: string;
  category: FileCategory;
  createdAt: number;
  isEmpty: boolean;
  fileCount: number;
}

export interface FootprintSummary {
  totalFiles: number;
  totalDirectories: number;
  totalSizeBytes: number;
  byCategory: Record<FileCategory, { files: number; sizeBytes: number }>;
  userOwnedFiles: number;
  userOwnedSizeBytes: number;
}

export interface UninstallPreview {
  filesToRemove: TrackedFile[];
  directoriesToRemove: TrackedDirectory[];
  userDataToExport: TrackedFile[];
  totalSizeBytes: number;
  warnings: string[];
}

export interface UninstallResult {
  success: boolean;
  removedFiles: number;
  removedDirectories: number;
  errors: string[];
  remainingPaths: string[];
}

export interface UninstallConfig {
  trackNewFiles: boolean;
  exportUserDataOnUninstall: boolean;
  showConfirmationDialog: boolean;
  removeRegistryEntries: boolean;
  removeShortcuts: boolean;
  secureDelete: boolean;
  secureDeletePasses: number;
}

// ===========================================================================
// DEFAULT CONFIG
// ===========================================================================

const DEFAULT_CONFIG: UninstallConfig = {
  trackNewFiles: true,
  exportUserDataOnUninstall: true,
  showConfirmationDialog: true,
  removeRegistryEntries: true,
  removeShortcuts: true,
  secureDelete: false,
  secureDeletePasses: 1,
};

// ===========================================================================
// CLEAN UNINSTALL SYSTEM
// ===========================================================================

class CleanUninstallSystemClass extends EventEmitter {
  private config: UninstallConfig;
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private trackedDirectories: Map<string, TrackedDirectory> = new Map();
  private trackingPath = '';
  private dexPaths: string[] = [];
  private isInitialized = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const userData = app.getPath('userData');
    this.trackingPath = path.join(userData, 'footprint.json');
    
    // Identify all DEX-related paths
    this.dexPaths = [
      userData,
      app.getPath('logs'),
      app.getPath('temp'),
      path.join(userData, 'cache'), // App-specific cache within userData
      path.join(app.getPath('home'), '.dex'),
    ];

    try {
      await this.loadTracking();
      await this.scanExistingFiles();
      
      this.isInitialized = true;
      log.info('[CleanUninstall] Initialized');
    } catch (error) {
      log.error('[CleanUninstall] Initialization failed:', error);
    }
  }

  private async loadTracking(): Promise<void> {
    try {
      if (fsSync.existsSync(this.trackingPath)) {
        const data = await fs.readFile(this.trackingPath, 'utf-8');
        const tracking = JSON.parse(data);
        
        for (const file of tracking.files || []) {
          this.trackedFiles.set(file.path, file);
        }
        
        for (const dir of tracking.directories || []) {
          this.trackedDirectories.set(dir.path, dir);
        }
      }
    } catch (error) {
      log.error('[CleanUninstall] Failed to load tracking:', error);
    }
  }

  private async saveTracking(): Promise<void> {
    const tracking = {
      version: 1,
      updatedAt: Date.now(),
      files: Array.from(this.trackedFiles.values()),
      directories: Array.from(this.trackedDirectories.values()),
    };

    await fs.writeFile(this.trackingPath, JSON.stringify(tracking, null, 2));
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get footprint summary
    ipcMain.handle('uninstall:footprint', async () => {
      return this.getFootprintSummary();
    });

    // Preview uninstall
    ipcMain.handle('uninstall:preview', async (_event, options?: { keepUserData?: boolean }) => {
      return this.previewUninstall(options);
    });

    // Perform uninstall
    ipcMain.handle('uninstall:execute', async (_event, options?: { keepUserData?: boolean; exportPath?: string }) => {
      return this.executeUninstall(options);
    });

    // Export user data before uninstall
    ipcMain.handle('uninstall:exportUserData', async (_event, outputPath: string) => {
      return this.exportUserData(outputPath);
    });

    // List all tracked files
    ipcMain.handle('uninstall:listFiles', (_event, category?: FileCategory) => {
      return this.listTrackedFiles(category);
    });

    // Get config
    ipcMain.handle('uninstall:config', () => {
      return this.config;
    });

    // Update config
    ipcMain.handle('uninstall:setConfig', (_event, updates: Partial<UninstallConfig>) => {
      return this.updateConfig(updates);
    });

    // Register a file (for other modules to call)
    ipcMain.handle('uninstall:trackFile', (_event, filePath: string, category: FileCategory, userOwned?: boolean) => {
      return this.trackFile(filePath, category, userOwned);
    });

    // Open footprint location
    ipcMain.handle('uninstall:openFootprintLocation', () => {
      shell.showItemInFolder(app.getPath('userData'));
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // FILE TRACKING
  // -------------------------------------------------------------------------

  async trackFile(
    filePath: string,
    category: FileCategory,
    userOwned: boolean = false
  ): Promise<{ success: boolean }> {
    if (!this.config.trackNewFiles) return { success: false };

    try {
      const stat = await fs.stat(filePath);
      
      const tracked: TrackedFile = {
        path: filePath,
        category,
        createdAt: stat.birthtimeMs,
        lastModified: stat.mtimeMs,
        sizeBytes: stat.size,
        essential: category === 'config',
        userOwned,
      };

      this.trackedFiles.set(filePath, tracked);
      await this.saveTracking();

      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  trackDirectory(dirPath: string, category: FileCategory): void {
    const tracked: TrackedDirectory = {
      path: dirPath,
      category,
      createdAt: Date.now(),
      isEmpty: true,
      fileCount: 0,
    };

    this.trackedDirectories.set(dirPath, tracked);
  }

  // -------------------------------------------------------------------------
  // SCANNING
  // -------------------------------------------------------------------------

  private async scanExistingFiles(): Promise<void> {
    for (const basePath of this.dexPaths) {
      if (!fsSync.existsSync(basePath)) continue;

      try {
        await this.scanDirectory(basePath, this.categorizeBasePath(basePath));
      } catch (error) {
        log.error(`[CleanUninstall] Failed to scan ${basePath}:`, error);
      }
    }

    await this.saveTracking();
  }

  private async scanDirectory(dirPath: string, defaultCategory: FileCategory): Promise<void> {
    // Track the directory itself
    this.trackDirectory(dirPath, defaultCategory);

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, this.categorizeByPath(fullPath) || defaultCategory);
        } else {
          const category = this.categorizeByPath(fullPath) || defaultCategory;
          const userOwned = this.isUserOwnedFile(fullPath);
          
          try {
            const stat = await fs.stat(fullPath);
            
            const tracked: TrackedFile = {
              path: fullPath,
              category,
              createdAt: stat.birthtimeMs,
              lastModified: stat.mtimeMs,
              sizeBytes: stat.size,
              essential: category === 'config',
              userOwned,
            };

            this.trackedFiles.set(fullPath, tracked);
          } catch {
            // Skip files we can't stat
          }
        }
      }

      // Update directory stats
      const dir = this.trackedDirectories.get(dirPath);
      if (dir) {
        dir.fileCount = entries.length;
        dir.isEmpty = entries.length === 0;
      }
    } catch (error) {
      // Can't read directory
    }
  }

  private categorizeBasePath(basePath: string): FileCategory {
    const logsPath = app.getPath('logs');
    const tempPath = app.getPath('temp');
    const cachePath = path.join(app.getPath('userData'), 'cache');

    if (basePath === logsPath) return 'logs';
    if (basePath === tempPath) return 'temp';
    if (basePath === cachePath) return 'cache';
    return 'data';
  }

  private categorizeByPath(filePath: string): FileCategory | null {
    const name = path.basename(filePath).toLowerCase();
    const dir = path.dirname(filePath).toLowerCase();

    // By directory name
    if (dir.includes('vault')) return 'vault';
    if (dir.includes('cache')) return 'cache';
    if (dir.includes('log')) return 'logs';
    if (dir.includes('temp')) return 'temp';
    if (dir.includes('backup')) return 'backup';
    if (dir.includes('index')) return 'index';

    // By filename
    if (name.endsWith('.json') && (name.includes('config') || name.includes('settings'))) return 'config';
    if (name.endsWith('.log')) return 'logs';
    if (name.includes('cache')) return 'cache';

    return null;
  }

  private isUserOwnedFile(filePath: string): boolean {
    const name = path.basename(filePath).toLowerCase();
    const dir = path.dirname(filePath).toLowerCase();

    // User-owned patterns
    return (
      dir.includes('notes') ||
      dir.includes('vault') ||
      dir.includes('documents') ||
      name.includes('note-') ||
      name.includes('task-') ||
      name.includes('project-')
    );
  }

  // -------------------------------------------------------------------------
  // FOOTPRINT SUMMARY
  // -------------------------------------------------------------------------

  async getFootprintSummary(): Promise<FootprintSummary> {
    const summary: FootprintSummary = {
      totalFiles: 0,
      totalDirectories: this.trackedDirectories.size,
      totalSizeBytes: 0,
      byCategory: {
        config: { files: 0, sizeBytes: 0 },
        data: { files: 0, sizeBytes: 0 },
        cache: { files: 0, sizeBytes: 0 },
        logs: { files: 0, sizeBytes: 0 },
        temp: { files: 0, sizeBytes: 0 },
        'user-created': { files: 0, sizeBytes: 0 },
        vault: { files: 0, sizeBytes: 0 },
        index: { files: 0, sizeBytes: 0 },
        backup: { files: 0, sizeBytes: 0 },
      },
      userOwnedFiles: 0,
      userOwnedSizeBytes: 0,
    };

    for (const file of this.trackedFiles.values()) {
      summary.totalFiles++;
      summary.totalSizeBytes += file.sizeBytes;
      summary.byCategory[file.category].files++;
      summary.byCategory[file.category].sizeBytes += file.sizeBytes;

      if (file.userOwned) {
        summary.userOwnedFiles++;
        summary.userOwnedSizeBytes += file.sizeBytes;
      }
    }

    return summary;
  }

  listTrackedFiles(category?: FileCategory): TrackedFile[] {
    const files = Array.from(this.trackedFiles.values());
    
    if (category) {
      return files.filter(f => f.category === category);
    }

    return files;
  }

  // -------------------------------------------------------------------------
  // UNINSTALL PREVIEW
  // -------------------------------------------------------------------------

  async previewUninstall(options?: { keepUserData?: boolean }): Promise<UninstallPreview> {
    const keepUserData = options?.keepUserData ?? this.config.exportUserDataOnUninstall;
    
    const preview: UninstallPreview = {
      filesToRemove: [],
      directoriesToRemove: [],
      userDataToExport: [],
      totalSizeBytes: 0,
      warnings: [],
    };

    // Categorize files
    for (const file of this.trackedFiles.values()) {
      // Check if file still exists
      if (!fsSync.existsSync(file.path)) continue;

      if (file.userOwned && keepUserData) {
        preview.userDataToExport.push(file);
      } else {
        preview.filesToRemove.push(file);
        preview.totalSizeBytes += file.sizeBytes;
      }
    }

    // Add directories (sorted by depth, deepest first)
    const dirs = Array.from(this.trackedDirectories.values())
      .filter(d => fsSync.existsSync(d.path))
      .sort((a, b) => b.path.split(path.sep).length - a.path.split(path.sep).length);

    preview.directoriesToRemove = dirs;

    // Generate warnings
    if (preview.userDataToExport.length > 0 && keepUserData) {
      preview.warnings.push(`${preview.userDataToExport.length} user files will be preserved or exported`);
    }

    if (preview.filesToRemove.some(f => f.category === 'vault')) {
      preview.warnings.push('Vault files will be permanently deleted - ensure you have exported important data');
    }

    return preview;
  }

  // -------------------------------------------------------------------------
  // EXPORT USER DATA
  // -------------------------------------------------------------------------

  async exportUserData(outputPath: string): Promise<{ success: boolean; exportedCount: number; error?: string }> {
    try {
      await fs.mkdir(outputPath, { recursive: true });

      let exportedCount = 0;
      const userFiles = Array.from(this.trackedFiles.values()).filter(f => f.userOwned);

      for (const file of userFiles) {
        if (!fsSync.existsSync(file.path)) continue;

        try {
          const relativePath = path.relative(app.getPath('userData'), file.path);
          const destPath = path.join(outputPath, relativePath);
          
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(file.path, destPath);
          exportedCount++;
        } catch (error) {
          log.error(`[CleanUninstall] Failed to export ${file.path}:`, error);
        }
      }

      // Create manifest
      const manifest = {
        exportedAt: Date.now(),
        exportedFrom: 'DEX',
        version: app.getVersion(),
        fileCount: exportedCount,
        files: userFiles.map(f => ({
          originalPath: f.path,
          category: f.category,
          sizeBytes: f.sizeBytes,
        })),
      };

      await fs.writeFile(
        path.join(outputPath, 'dex-export-manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      return { success: true, exportedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, exportedCount: 0, error: errorMsg };
    }
  }

  // -------------------------------------------------------------------------
  // EXECUTE UNINSTALL
  // -------------------------------------------------------------------------

  async executeUninstall(options?: { 
    keepUserData?: boolean; 
    exportPath?: string;
  }): Promise<UninstallResult> {
    const result: UninstallResult = {
      success: true,
      removedFiles: 0,
      removedDirectories: 0,
      errors: [],
      remainingPaths: [],
    };

    // Show confirmation if configured
    if (this.config.showConfirmationDialog) {
      const response = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Cancel', 'Uninstall'],
        defaultId: 0,
        cancelId: 0,
        title: 'Confirm Uninstall',
        message: 'Are you sure you want to uninstall DEX?',
        detail: 'All application data will be permanently removed. User data can be exported first.',
      });

      if (response.response === 0) {
        return { ...result, success: false, errors: ['User cancelled'] };
      }
    }

    // Export user data if requested
    if (options?.exportPath) {
      const exportResult = await this.exportUserData(options.exportPath);
      if (!exportResult.success) {
        result.errors.push(`Export failed: ${exportResult.error}`);
      }
    }

    const preview = await this.previewUninstall(options);

    // Remove files
    for (const file of preview.filesToRemove) {
      try {
        if (this.config.secureDelete) {
          await this.secureDeleteFile(file.path);
        } else {
          await fs.unlink(file.path);
        }
        result.removedFiles++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to remove ${file.path}: ${errorMsg}`);
        result.remainingPaths.push(file.path);
      }
    }

    // Remove directories (deepest first)
    for (const dir of preview.directoriesToRemove) {
      try {
        await fs.rmdir(dir.path);
        result.removedDirectories++;
      } catch (error) {
        // Directory might not be empty or already removed
        if (fsSync.existsSync(dir.path)) {
          result.remainingPaths.push(dir.path);
        }
      }
    }

    // Platform-specific cleanup
    if (process.platform === 'win32' && this.config.removeRegistryEntries) {
      await this.cleanWindowsRegistry();
    }

    if (this.config.removeShortcuts) {
      await this.removeShortcuts();
    }

    result.success = result.errors.length === 0;
    
    this.emit('uninstall:completed', result);
    return result;
  }

  // -------------------------------------------------------------------------
  // SECURE DELETE
  // -------------------------------------------------------------------------

  private async secureDeleteFile(filePath: string): Promise<void> {
    const stat = await fs.stat(filePath);
    const size = stat.size;

    // Single-pass overwrite by default to avoid AV wiper-malware heuristic triggers.
    // Multi-pass (> 1) requires explicit user opt-in via config.
    const passes = Math.max(1, Math.min(this.config.secureDeletePasses, 3));
    for (let pass = 0; pass < passes; pass++) {
      const randomData = crypto.randomBytes(size);
      await fs.writeFile(filePath, randomData);
    }

    // Delete the file
    await fs.unlink(filePath);
  }

  // -------------------------------------------------------------------------
  // PLATFORM-SPECIFIC CLEANUP
  // -------------------------------------------------------------------------

  private async cleanWindowsRegistry(): Promise<void> {
    // This would require admin privileges in production
    // For now, just log the intent
    log.info('[CleanUninstall] Windows registry cleanup requested');
    
    // In production, you'd use a native module or spawn regedit
    // to remove entries like:
    // HKCU\Software\DEX
    // HKLM\Software\DEX (if installed for all users)
  }

  private async removeShortcuts(): Promise<void> {
    const shortcuts = [
      // Windows
      path.join(app.getPath('desktop'), 'DEX.lnk'),
      path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'DEX.lnk'),
      // macOS
      path.join(app.getPath('home'), 'Desktop', 'DEX.app'),
      // Linux
      path.join(app.getPath('home'), '.local', 'share', 'applications', 'dex.desktop'),
    ];

    for (const shortcut of shortcuts) {
      try {
        if (fsSync.existsSync(shortcut)) {
          await fs.unlink(shortcut);
          log.debug(`[CleanUninstall] Removed shortcut: ${shortcut}`);
        }
      } catch {
        // Ignore errors for shortcuts
      }
    }
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  updateConfig(updates: Partial<UninstallConfig>): { success: boolean } {
    this.config = { ...this.config, ...updates };
    this.emit('config:changed', this.config);
    return { success: true };
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const CleanUninstallSystem = new CleanUninstallSystemClass();
