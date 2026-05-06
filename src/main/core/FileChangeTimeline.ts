// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - File Change Timeline
// File change timeline with diff preview
// Universal compare tool (file, folder, text, metadata)
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type ChangeType = 'created' | 'modified' | 'deleted' | 'renamed' | 'moved';

export interface FileChange {
  id: string;
  path: string;
  type: ChangeType;
  timestamp: number;
  oldPath?: string;           // For rename/move
  size?: number;
  hash?: string;              // Content hash for change detection
  backupPath?: string;        // Path to version backup
}

export interface FileVersion {
  id: string;
  filePath: string;
  timestamp: number;
  size: number;
  hash: string;
  backupPath: string;
  changeType: ChangeType;
  metadata?: Record<string, unknown>;
}

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  lineNumber: number;
  content: string;
  oldContent?: string;
}

export interface DiffResult {
  leftPath: string;
  rightPath: string;
  leftLabel?: string;
  rightLabel?: string;
  lines: DiffLine[];
  stats: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  isBinary: boolean;
  isIdentical: boolean;
}

export interface FolderDiffItem {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  isDirectory: boolean;
  leftSize?: number;
  rightSize?: number;
  leftModified?: number;
  rightModified?: number;
}

export interface FolderDiffResult {
  leftPath: string;
  rightPath: string;
  items: FolderDiffItem[];
  stats: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

export interface TimelineConfig {
  maxVersionsPerFile: number;
  maxTotalVersions: number;
  backupRetentionDays: number;
  autoBackupOnModify: boolean;
  watchedFolders: string[];
  excludePatterns: string[];
}

// ===========================================================================
// FILE CHANGE TIMELINE
// ===========================================================================

class FileChangeTimelineClass extends EventEmitter {
  private config: TimelineConfig;
  private changes: Map<string, FileChange[]> = new Map(); // path -> changes
  private versions: Map<string, FileVersion[]> = new Map(); // path -> versions
  private versionsPath = '';
  private changeIdCounter = 0;

  constructor() {
    super();
    this.config = {
      maxVersionsPerFile: 10,
      maxTotalVersions: 1000,
      backupRetentionDays: 7,
      autoBackupOnModify: true,
      watchedFolders: [],
      excludePatterns: ['node_modules', '.git', '*.tmp', '*.log']
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.versionsPath = path.join(app.getPath('userData'), 'file-versions');
    
    try {
      await fs.mkdir(this.versionsPath, { recursive: true });
      await this.loadIndex();
      log.info('[Timeline] Initialized');
    } catch (error) {
      log.error('[Timeline] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Record change
    ipcMain.handle('timeline:recordChange', async (_event, filePath: string, type: ChangeType, oldPath?: string) => {
      return this.recordChange(filePath, type, oldPath);
    });

    // Get timeline for file
    ipcMain.handle('timeline:forFile', (_event, filePath: string) => {
      return this.getTimelineForFile(filePath);
    });

    // Get versions for file
    ipcMain.handle('timeline:versions', (_event, filePath: string) => {
      return this.getVersionsForFile(filePath);
    });

    // Create version backup
    ipcMain.handle('timeline:createVersion', async (_event, filePath: string) => {
      return this.createVersion(filePath);
    });

    // Restore version
    ipcMain.handle('timeline:restoreVersion', async (_event, versionId: string) => {
      return this.restoreVersion(versionId);
    });

    // Compare files
    ipcMain.handle('timeline:compareFiles', async (_event, leftPath: string, rightPath: string) => {
      return this.compareFiles(leftPath, rightPath);
    });

    // Compare with version
    ipcMain.handle('timeline:compareWithVersion', async (_event, filePath: string, versionId: string) => {
      return this.compareWithVersion(filePath, versionId);
    });

    // Compare folders
    ipcMain.handle('timeline:compareFolders', async (_event, leftPath: string, rightPath: string) => {
      return this.compareFolders(leftPath, rightPath);
    });

    // Compare text
    ipcMain.handle('timeline:compareText', (_event, leftText: string, rightText: string, leftLabel?: string, rightLabel?: string) => {
      return this.compareText(leftText, rightText, leftLabel, rightLabel);
    });

    // Get global timeline
    ipcMain.handle('timeline:global', (_event, startTime?: number, endTime?: number, limit?: number) => {
      return this.getGlobalTimeline(startTime, endTime, limit);
    });

    // Delete version
    ipcMain.handle('timeline:deleteVersion', async (_event, versionId: string) => {
      return this.deleteVersion(versionId);
    });

    // Configure
    ipcMain.handle('timeline:configure', (_event, config: Partial<TimelineConfig>) => {
      this.configure(config);
      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // CHANGE TRACKING
  // -------------------------------------------------------------------------

  async recordChange(filePath: string, type: ChangeType, oldPath?: string): Promise<FileChange> {
    const normalizedPath = path.normalize(filePath);
    
    // Get file stats
    let size: number | undefined;
    let hash: string | undefined;
    
    if (type !== 'deleted') {
      try {
        const stats = await fs.stat(normalizedPath);
        size = stats.size;
        
        // Only hash small files
        if (stats.size < 10 * 1024 * 1024) { // 10MB
          hash = await this.hashFile(normalizedPath);
        }
      } catch { /* File might not exist */ }
    }

    const change: FileChange = {
      id: this.generateId(),
      path: normalizedPath,
      type,
      timestamp: Date.now(),
      oldPath,
      size,
      hash
    };

    // Store change
    if (!this.changes.has(normalizedPath)) {
      this.changes.set(normalizedPath, []);
    }
    this.changes.get(normalizedPath)!.push(change);

    // Auto-backup on modify if enabled
    if (this.config.autoBackupOnModify && type === 'modified') {
      await this.createVersion(normalizedPath);
    }

    this.emit('change:recorded', change);
    return change;
  }

  getTimelineForFile(filePath: string): FileChange[] {
    const normalizedPath = path.normalize(filePath);
    return this.changes.get(normalizedPath) || [];
  }

  getGlobalTimeline(startTime?: number, endTime?: number, limit = 100): FileChange[] {
    const allChanges: FileChange[] = [];
    
    for (const changes of this.changes.values()) {
      allChanges.push(...changes);
    }

    let filtered = allChanges;
    
    if (startTime) {
      filtered = filtered.filter(c => c.timestamp >= startTime);
    }
    if (endTime) {
      filtered = filtered.filter(c => c.timestamp <= endTime);
    }

    return filtered
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // VERSION MANAGEMENT
  // -------------------------------------------------------------------------

  async createVersion(filePath: string): Promise<FileVersion | null> {
    const normalizedPath = path.normalize(filePath);
    
    try {
      const stats = await fs.stat(normalizedPath);
      const hash = await this.hashFile(normalizedPath);
      
      // Check if content changed
      const existingVersions = this.versions.get(normalizedPath) || [];
      if (existingVersions.length > 0) {
        const lastVersion = existingVersions[existingVersions.length - 1];
        if (lastVersion.hash === hash) {
          return null; // No change
        }
      }

      // Create backup
      const versionId = this.generateId();
      const backupPath = path.join(this.versionsPath, versionId);
      await fs.copyFile(normalizedPath, backupPath);

      const version: FileVersion = {
        id: versionId,
        filePath: normalizedPath,
        timestamp: Date.now(),
        size: stats.size,
        hash,
        backupPath,
        changeType: existingVersions.length === 0 ? 'created' : 'modified'
      };

      // Store version
      if (!this.versions.has(normalizedPath)) {
        this.versions.set(normalizedPath, []);
      }
      this.versions.get(normalizedPath)!.push(version);

      // Enforce limits
      await this.enforceVersionLimits(normalizedPath);
      await this.saveIndex();

      this.emit('version:created', version);
      return version;
    } catch (error) {
      log.error(`[Timeline] Failed to create version for ${filePath}:`, error);
      return null;
    }
  }

  getVersionsForFile(filePath: string): FileVersion[] {
    const normalizedPath = path.normalize(filePath);
    return (this.versions.get(normalizedPath) || [])
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async restoreVersion(versionId: string): Promise<{ success: boolean; error?: string }> {
    // Find version
    let targetVersion: FileVersion | null = null;
    
    for (const versions of this.versions.values()) {
      const found = versions.find(v => v.id === versionId);
      if (found) {
        targetVersion = found;
        break;
      }
    }

    if (!targetVersion) {
      return { success: false, error: 'Version not found' };
    }

    try {
      // Backup current before restore
      await this.createVersion(targetVersion.filePath);
      
      // Restore
      await fs.copyFile(targetVersion.backupPath, targetVersion.filePath);
      
      this.emit('version:restored', targetVersion);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  async deleteVersion(versionId: string): Promise<{ success: boolean }> {
    for (const [filePath, versions] of this.versions.entries()) {
      const index = versions.findIndex(v => v.id === versionId);
      if (index >= 0) {
        const version = versions[index];
        
        // Delete backup file
        try {
          await fs.unlink(version.backupPath);
        } catch { /* ignore */ }
        
        // Remove from list
        versions.splice(index, 1);
        
        if (versions.length === 0) {
          this.versions.delete(filePath);
        }
        
        await this.saveIndex();
        return { success: true };
      }
    }
    
    return { success: false };
  }

  private async enforceVersionLimits(filePath: string): Promise<void> {
    const versions = this.versions.get(filePath);
    if (!versions) return;

    // Per-file limit
    while (versions.length > this.config.maxVersionsPerFile) {
      const oldest = versions.shift();
      if (oldest) {
        try {
          await fs.unlink(oldest.backupPath);
        } catch { /* ignore */ }
      }
    }

    // Global limit
    let totalVersions = 0;
    for (const v of this.versions.values()) {
      totalVersions += v.length;
    }

    if (totalVersions > this.config.maxTotalVersions) {
      // Remove oldest versions globally
      const allVersions: FileVersion[] = [];
      for (const v of this.versions.values()) {
        allVersions.push(...v);
      }
      allVersions.sort((a, b) => a.timestamp - b.timestamp);

      const toRemove = allVersions.slice(0, totalVersions - this.config.maxTotalVersions);
      for (const version of toRemove) {
        await this.deleteVersion(version.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // COMPARISON
  // -------------------------------------------------------------------------

  async compareFiles(leftPath: string, rightPath: string): Promise<DiffResult> {
    const leftContent = await this.readFileContent(leftPath);
    const rightContent = await this.readFileContent(rightPath);

    if (leftContent.isBinary || rightContent.isBinary) {
      return {
        leftPath,
        rightPath,
        lines: [],
        stats: { added: 0, removed: 0, modified: 0, unchanged: 0 },
        isBinary: true,
        isIdentical: leftContent.content === rightContent.content
      };
    }

    return this.compareText(
      leftContent.content,
      rightContent.content,
      path.basename(leftPath),
      path.basename(rightPath)
    );
  }

  async compareWithVersion(filePath: string, versionId: string): Promise<DiffResult | null> {
    const versions = this.versions.get(path.normalize(filePath));
    const version = versions?.find(v => v.id === versionId);
    
    if (!version) return null;

    const result = await this.compareFiles(version.backupPath, filePath);
    result.leftLabel = `Version ${new Date(version.timestamp).toLocaleString()}`;
    result.rightLabel = 'Current';
    
    return result;
  }

  compareText(leftText: string, rightText: string, leftLabel?: string, rightLabel?: string): DiffResult {
    const leftLines = leftText.split('\n');
    const rightLines = rightText.split('\n');
    
    const diffLines: DiffLine[] = [];
    const stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };

    // Simple line-by-line diff (LCS would be better but more complex)
    const maxLines = Math.max(leftLines.length, rightLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const leftLine = leftLines[i];
      const rightLine = rightLines[i];

      if (leftLine === undefined) {
        diffLines.push({
          type: 'added',
          lineNumber: i + 1,
          content: rightLine
        });
        stats.added++;
      } else if (rightLine === undefined) {
        diffLines.push({
          type: 'removed',
          lineNumber: i + 1,
          content: leftLine
        });
        stats.removed++;
      } else if (leftLine === rightLine) {
        diffLines.push({
          type: 'unchanged',
          lineNumber: i + 1,
          content: rightLine
        });
        stats.unchanged++;
      } else {
        diffLines.push({
          type: 'modified',
          lineNumber: i + 1,
          content: rightLine,
          oldContent: leftLine
        });
        stats.modified++;
      }
    }

    return {
      leftPath: leftLabel || 'Left',
      rightPath: rightLabel || 'Right',
      leftLabel,
      rightLabel,
      lines: diffLines,
      stats,
      isBinary: false,
      isIdentical: stats.added === 0 && stats.removed === 0 && stats.modified === 0
    };
  }

  async compareFolders(leftPath: string, rightPath: string): Promise<FolderDiffResult> {
    const leftFiles = await this.listFolderRecursive(leftPath);
    const rightFiles = await this.listFolderRecursive(rightPath);

    const leftSet = new Set(leftFiles.map(f => f.relativePath));
    const rightSet = new Set(rightFiles.map(f => f.relativePath));

    const items: FolderDiffItem[] = [];
    const stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };

    // Check all left files
    for (const file of leftFiles) {
      if (!rightSet.has(file.relativePath)) {
        items.push({
          path: file.relativePath,
          status: 'removed',
          isDirectory: file.isDirectory,
          leftSize: file.size,
          leftModified: file.modified
        });
        stats.removed++;
      } else {
        // Find matching right file
        const rightFile = rightFiles.find(f => f.relativePath === file.relativePath)!;
        
        if (file.size !== rightFile.size || file.modified !== rightFile.modified) {
          items.push({
            path: file.relativePath,
            status: 'modified',
            isDirectory: file.isDirectory,
            leftSize: file.size,
            rightSize: rightFile.size,
            leftModified: file.modified,
            rightModified: rightFile.modified
          });
          stats.modified++;
        } else {
          items.push({
            path: file.relativePath,
            status: 'unchanged',
            isDirectory: file.isDirectory,
            leftSize: file.size,
            rightSize: rightFile.size
          });
          stats.unchanged++;
        }
      }
    }

    // Check for new files in right
    for (const file of rightFiles) {
      if (!leftSet.has(file.relativePath)) {
        items.push({
          path: file.relativePath,
          status: 'added',
          isDirectory: file.isDirectory,
          rightSize: file.size,
          rightModified: file.modified
        });
        stats.added++;
      }
    }

    // Sort by path
    items.sort((a, b) => a.path.localeCompare(b.path));

    return {
      leftPath,
      rightPath,
      items,
      stats
    };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fsSync.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async readFileContent(filePath: string): Promise<{ content: string; isBinary: boolean }> {
    try {
      const buffer = await fs.readFile(filePath);
      
      // Check if binary
      const isBinary = buffer.includes(0);
      if (isBinary) {
        return { content: buffer.toString('base64'), isBinary: true };
      }
      
      return { content: buffer.toString('utf-8'), isBinary: false };
    } catch {
      return { content: '', isBinary: false };
    }
  }

  private async listFolderRecursive(folderPath: string, basePath?: string): Promise<Array<{
    relativePath: string;
    isDirectory: boolean;
    size: number;
    modified: number;
  }>> {
    const base = basePath || folderPath;
    const results: Array<{
      relativePath: string;
      isDirectory: boolean;
      size: number;
      modified: number;
    }> = [];

    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        const relativePath = path.relative(base, fullPath);
        
        // Skip excluded patterns
        if (this.config.excludePatterns.some(p => {
          if (p.includes('*')) {
            return new RegExp(p.replace('*', '.*')).test(entry.name);
          }
          return entry.name === p;
        })) {
          continue;
        }

        const stats = await fs.stat(fullPath);
        
        results.push({
          relativePath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modified: stats.mtimeMs
        });

        if (entry.isDirectory()) {
          const subResults = await this.listFolderRecursive(fullPath, base);
          results.push(...subResults);
        }
      }
    } catch (error) {
      log.warn(`[Timeline] Failed to list folder ${folderPath}:`, error);
    }

    return results;
  }

  private generateId(): string {
    return `ver-${++this.changeIdCounter}-${Date.now()}`;
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadIndex(): Promise<void> {
    try {
      const indexPath = path.join(this.versionsPath, 'index.json');
      const content = await fs.readFile(indexPath, 'utf-8');
      const data = JSON.parse(content);
      
      this.versions = new Map(Object.entries(data.versions || {}));
      this.changes = new Map(Object.entries(data.changes || {}));
    } catch {
      // No index yet
    }
  }

  private async saveIndex(): Promise<void> {
    const indexPath = path.join(this.versionsPath, 'index.json');
    const data = {
      versions: Object.fromEntries(this.versions),
      changes: Object.fromEntries(this.changes)
    };
    await fs.writeFile(indexPath, JSON.stringify(data, null, 2));
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  configure(config: Partial<TimelineConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const FileChangeTimeline = new FileChangeTimelineClass();
export default FileChangeTimeline;
