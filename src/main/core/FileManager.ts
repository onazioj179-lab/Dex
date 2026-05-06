// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - File Management Module
// Phase 19: Controlled, permission-based file operations
// Only touches folders explicitly selected by the user
// ===========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Logger } from '../utils/Logger';

const log = new Logger();

// ===========================================================================
// TYPES
// ===========================================================================

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: 'file' | 'directory';
  extension: string;
  created: number;
  modified: number;
  accessed: number;
}

export interface FileOperation {
  id: string;
  type: 'rename' | 'move' | 'copy' | 'delete' | 'create';
  sourcePath: string;
  targetPath?: string;
  timestamp: number;
  success: boolean;
  error?: string;
  undoable: boolean;
  undoData?: {
    originalPath: string;
    originalName: string;
  };
}

export interface RenameRule {
  type: 'prefix' | 'suffix' | 'replace' | 'sequence' | 'date' | 'lowercase' | 'uppercase';
  value?: string;
  find?: string;
  startNumber?: number;
  dateFormat?: string;
}

export interface BatchRenamePreview {
  original: string;
  renamed: string;
  conflict: boolean;
}

export interface SortCriteria {
  field: 'name' | 'size' | 'type' | 'date' | 'extension';
  direction: 'asc' | 'desc';
}

export interface ScopeConfig {
  path: string;
  recursive: boolean;
  readOnly: boolean;
  addedAt: number;
  label?: string;
}

// ===========================================================================
// FILE MANAGER CLASS
// ===========================================================================

class FileManagerClass {
  private allowedScopes: Map<string, ScopeConfig> = new Map();
  private operationHistory: FileOperation[] = [];
  private maxHistorySize = 100;

  constructor() {
    this.loadScopes();
  }

  // -------------------------------------------------------------------------
  // SCOPE MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Add a folder to allowed scopes
   */
  addScope(folderPath: string, options: Partial<ScopeConfig> = {}): boolean {
    const normalized = path.normalize(folderPath);
    
    if (!fs.existsSync(normalized)) {
      log.warn(`[FileManager] Cannot add scope: path does not exist: ${normalized}`);
      return false;
    }

    const stats = fs.statSync(normalized);
    if (!stats.isDirectory()) {
      log.warn(`[FileManager] Cannot add scope: not a directory: ${normalized}`);
      return false;
    }

    const config: ScopeConfig = {
      path: normalized,
      recursive: options.recursive ?? false,
      readOnly: options.readOnly ?? false,
      addedAt: Date.now(),
      label: options.label,
    };

    this.allowedScopes.set(normalized, config);
    this.saveScopes();
    
    log.info(`[FileManager] Added scope: ${normalized} (recursive: ${config.recursive}, readOnly: ${config.readOnly})`);
    return true;
  }

  /**
   * Remove a folder from allowed scopes
   */
  removeScope(folderPath: string): boolean {
    const normalized = path.normalize(folderPath);
    const removed = this.allowedScopes.delete(normalized);
    
    if (removed) {
      this.saveScopes();
      log.info(`[FileManager] Removed scope: ${normalized}`);
    }
    
    return removed;
  }

  /**
   * Get all allowed scopes
   */
  getScopes(): ScopeConfig[] {
    return Array.from(this.allowedScopes.values());
  }

  /**
   * Check if a path is within allowed scope
   */
  isInScope(targetPath: string): boolean {
    const normalized = path.normalize(targetPath);
    
    for (const [scopePath, config] of this.allowedScopes) {
      if (config.recursive) {
        if (normalized.startsWith(scopePath + path.sep) || normalized === scopePath) {
          return true;
        }
      } else {
        const parent = path.dirname(normalized);
        if (parent === scopePath || normalized === scopePath) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Check if path is read-only
   */
  isReadOnly(targetPath: string): boolean {
    const normalized = path.normalize(targetPath);
    
    for (const [scopePath, config] of this.allowedScopes) {
      if (normalized.startsWith(scopePath)) {
        return config.readOnly;
      }
    }
    
    return true; // Default to read-only for safety
  }

  // -------------------------------------------------------------------------
  // FILE LISTING
  // -------------------------------------------------------------------------

  /**
   * List files in a directory (must be in scope)
   */
  listFiles(dirPath: string, sort?: SortCriteria): FileInfo[] | null {
    const normalized = path.normalize(dirPath);
    
    if (!this.isInScope(normalized)) {
      log.warn(`[FileManager] Access denied: ${normalized} not in scope`);
      return null;
    }

    if (!fs.existsSync(normalized)) {
      log.warn(`[FileManager] Path does not exist: ${normalized}`);
      return null;
    }

    try {
      const entries = fs.readdirSync(normalized, { withFileTypes: true });
      const files: FileInfo[] = [];

      for (const entry of entries) {
        const fullPath = path.join(normalized, entry.name);
        try {
          const stats = fs.statSync(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            size: stats.size,
            type: entry.isDirectory() ? 'directory' : 'file',
            extension: entry.isDirectory() ? '' : path.extname(entry.name).toLowerCase(),
            created: stats.birthtimeMs,
            modified: stats.mtimeMs,
            accessed: stats.atimeMs,
          });
        } catch (e) {
          // Skip files we can't access
          continue;
        }
      }

      if (sort) {
        files.sort((a, b) => {
          let comparison = 0;
          switch (sort.field) {
            case 'name':
              comparison = a.name.localeCompare(b.name);
              break;
            case 'size':
              comparison = a.size - b.size;
              break;
            case 'type':
              comparison = a.type.localeCompare(b.type) || a.extension.localeCompare(b.extension);
              break;
            case 'date':
              comparison = a.modified - b.modified;
              break;
            case 'extension':
              comparison = a.extension.localeCompare(b.extension);
              break;
          }
          return sort.direction === 'desc' ? -comparison : comparison;
        });
      }

      return files;
    } catch (error) {
      log.error(`[FileManager] Failed to list files:`, error);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // FILE OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Rename a file
   */
  renameFile(oldPath: string, newName: string): FileOperation {
    const normalizedOld = path.normalize(oldPath);
    const newPath = path.join(path.dirname(normalizedOld), newName);
    const operation: FileOperation = {
      id: this.generateId(),
      type: 'rename',
      sourcePath: normalizedOld,
      targetPath: newPath,
      timestamp: Date.now(),
      success: false,
      undoable: true,
      undoData: {
        originalPath: normalizedOld,
        originalName: path.basename(normalizedOld),
      },
    };

    if (!this.isInScope(normalizedOld)) {
      operation.error = 'Source path not in allowed scope';
      this.recordOperation(operation);
      return operation;
    }

    if (this.isReadOnly(normalizedOld)) {
      operation.error = 'Path is read-only';
      this.recordOperation(operation);
      return operation;
    }

    if (!fs.existsSync(normalizedOld)) {
      operation.error = 'Source file does not exist';
      this.recordOperation(operation);
      return operation;
    }

    if (fs.existsSync(newPath)) {
      operation.error = 'Target file already exists';
      this.recordOperation(operation);
      return operation;
    }

    try {
      fs.renameSync(normalizedOld, newPath);
      operation.success = true;
      log.info(`[FileManager] Renamed: ${normalizedOld} ${newPath}`);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[FileManager] Rename failed:`, error);
    }

    this.recordOperation(operation);
    return operation;
  }

  /**
   * Move a file
   */
  moveFile(sourcePath: string, targetDir: string): FileOperation {
    const normalizedSource = path.normalize(sourcePath);
    const normalizedTarget = path.normalize(targetDir);
    const targetPath = path.join(normalizedTarget, path.basename(normalizedSource));
    
    const operation: FileOperation = {
      id: this.generateId(),
      type: 'move',
      sourcePath: normalizedSource,
      targetPath,
      timestamp: Date.now(),
      success: false,
      undoable: true,
      undoData: {
        originalPath: normalizedSource,
        originalName: path.basename(normalizedSource),
      },
    };

    if (!this.isInScope(normalizedSource) || !this.isInScope(normalizedTarget)) {
      operation.error = 'Source or target path not in allowed scope';
      this.recordOperation(operation);
      return operation;
    }

    if (this.isReadOnly(normalizedSource) || this.isReadOnly(normalizedTarget)) {
      operation.error = 'Source or target path is read-only';
      this.recordOperation(operation);
      return operation;
    }

    if (!fs.existsSync(normalizedSource)) {
      operation.error = 'Source file does not exist';
      this.recordOperation(operation);
      return operation;
    }

    if (fs.existsSync(targetPath)) {
      operation.error = 'Target file already exists';
      this.recordOperation(operation);
      return operation;
    }

    try {
      fs.renameSync(normalizedSource, targetPath);
      operation.success = true;
      log.info(`[FileManager] Moved: ${normalizedSource} ${targetPath}`);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[FileManager] Move failed:`, error);
    }

    this.recordOperation(operation);
    return operation;
  }

  /**
   * Copy a file
   */
  copyFile(sourcePath: string, targetDir: string): FileOperation {
    const normalizedSource = path.normalize(sourcePath);
    const normalizedTarget = path.normalize(targetDir);
    const targetPath = path.join(normalizedTarget, path.basename(normalizedSource));
    
    const operation: FileOperation = {
      id: this.generateId(),
      type: 'copy',
      sourcePath: normalizedSource,
      targetPath,
      timestamp: Date.now(),
      success: false,
      undoable: true,
    };

    if (!this.isInScope(normalizedSource) || !this.isInScope(normalizedTarget)) {
      operation.error = 'Source or target path not in allowed scope';
      this.recordOperation(operation);
      return operation;
    }

    if (this.isReadOnly(normalizedTarget)) {
      operation.error = 'Target path is read-only';
      this.recordOperation(operation);
      return operation;
    }

    if (!fs.existsSync(normalizedSource)) {
      operation.error = 'Source file does not exist';
      this.recordOperation(operation);
      return operation;
    }

    if (fs.existsSync(targetPath)) {
      operation.error = 'Target file already exists';
      this.recordOperation(operation);
      return operation;
    }

    try {
      fs.copyFileSync(normalizedSource, targetPath);
      operation.success = true;
      log.info(`[FileManager] Copied: ${normalizedSource} ${targetPath}`);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[FileManager] Copy failed:`, error);
    }

    this.recordOperation(operation);
    return operation;
  }

  /**
   * Delete a file (moves to trash conceptually - keeps record for undo)
   */
  deleteFile(filePath: string): FileOperation {
    const normalized = path.normalize(filePath);
    
    const operation: FileOperation = {
      id: this.generateId(),
      type: 'delete',
      sourcePath: normalized,
      timestamp: Date.now(),
      success: false,
      undoable: false, // Deletes are not undoable by default
    };

    if (!this.isInScope(normalized)) {
      operation.error = 'Path not in allowed scope';
      this.recordOperation(operation);
      return operation;
    }

    if (this.isReadOnly(normalized)) {
      operation.error = 'Path is read-only';
      this.recordOperation(operation);
      return operation;
    }

    if (!fs.existsSync(normalized)) {
      operation.error = 'File does not exist';
      this.recordOperation(operation);
      return operation;
    }

    try {
      const stats = fs.statSync(normalized);
      if (stats.isDirectory()) {
        fs.rmdirSync(normalized, { recursive: true });
      } else {
        fs.unlinkSync(normalized);
      }
      operation.success = true;
      log.info(`[FileManager] Deleted: ${normalized}`);
    } catch (error) {
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[FileManager] Delete failed:`, error);
    }

    this.recordOperation(operation);
    return operation;
  }

  // -------------------------------------------------------------------------
  // BATCH OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Preview batch rename
   */
  previewBatchRename(files: string[], rules: RenameRule[]): BatchRenamePreview[] {
    const previews: BatchRenamePreview[] = [];
    const newNames = new Set<string>();

    for (let i = 0; i < files.length; i++) {
      const filePath = path.normalize(files[i]);
      let newName = path.basename(filePath);
      const ext = path.extname(newName);
      const base = path.basename(newName, ext);

      for (const rule of rules) {
        switch (rule.type) {
          case 'prefix':
            newName = (rule.value ?? '') + newName;
            break;
          case 'suffix':
            newName = base + (rule.value ?? '') + ext;
            break;
          case 'replace':
            if (rule.find && rule.value !== undefined) {
              newName = newName.replace(new RegExp(rule.find, 'g'), rule.value);
            }
            break;
          case 'sequence':
            const num = (rule.startNumber ?? 1) + i;
            newName = base + '_' + num.toString().padStart(3, '0') + ext;
            break;
          case 'date':
            const date = new Date();
            const dateStr = this.formatDate(date, rule.dateFormat ?? 'YYYY-MM-DD');
            newName = base + '_' + dateStr + ext;
            break;
          case 'lowercase':
            newName = newName.toLowerCase();
            break;
          case 'uppercase':
            newName = newName.toUpperCase();
            break;
        }
      }

      const conflict = newNames.has(newName.toLowerCase());
      newNames.add(newName.toLowerCase());

      previews.push({
        original: path.basename(filePath),
        renamed: newName,
        conflict,
      });
    }

    return previews;
  }

  /**
   * Execute batch rename
   */
  executeBatchRename(files: string[], rules: RenameRule[]): FileOperation[] {
    const previews = this.previewBatchRename(files, rules);
    const operations: FileOperation[] = [];

    // Check for conflicts first
    if (previews.some(p => p.conflict)) {
      log.warn('[FileManager] Batch rename has conflicts, aborting');
      return [];
    }

    for (let i = 0; i < files.length; i++) {
      const operation = this.renameFile(files[i], previews[i].renamed);
      operations.push(operation);
      
      if (!operation.success) {
        log.warn(`[FileManager] Batch rename stopped at file ${i + 1} due to error`);
        break;
      }
    }

    return operations;
  }

  /**
   * Organize files by type
   */
  organizeByType(dirPath: string): FileOperation[] {
    const normalized = path.normalize(dirPath);
    const files = this.listFiles(normalized);
    
    if (!files) {
      return [];
    }

    const operations: FileOperation[] = [];
    const typeMap: Record<string, string[]> = {
      images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
      documents: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'],
      spreadsheets: ['.xls', '.xlsx', '.csv', '.ods'],
      audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg'],
      video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv'],
      archives: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    };

    for (const file of files) {
      if (file.type === 'directory') continue;

      let targetFolder = 'other';
      for (const [folder, extensions] of Object.entries(typeMap)) {
        if (extensions.includes(file.extension)) {
          targetFolder = folder;
          break;
        }
      }

      const targetDir = path.join(normalized, targetFolder);
      
      // Create folder if needed
      if (!fs.existsSync(targetDir)) {
        try {
          fs.mkdirSync(targetDir, { recursive: true });
        } catch (e) {
          continue;
        }
      }

      const operation = this.moveFile(file.path, targetDir);
      operations.push(operation);
    }

    return operations;
  }

  // -------------------------------------------------------------------------
  // UNDO SUPPORT
  // -------------------------------------------------------------------------

  /**
   * Undo last operation
   */
  undoLastOperation(): FileOperation | null {
    const lastUndoable = [...this.operationHistory]
      .reverse()
      .find(op => op.success && op.undoable && op.undoData);

    if (!lastUndoable || !lastUndoable.undoData) {
      log.warn('[FileManager] No undoable operation found');
      return null;
    }

    switch (lastUndoable.type) {
      case 'rename':
        return this.renameFile(lastUndoable.targetPath!, lastUndoable.undoData.originalName);
      case 'move':
        return this.moveFile(lastUndoable.targetPath!, path.dirname(lastUndoable.undoData.originalPath));
      case 'copy':
        return this.deleteFile(lastUndoable.targetPath!);
      default:
        return null;
    }
  }

  /**
   * Get operation history
   */
  getHistory(): FileOperation[] {
    return [...this.operationHistory];
  }

  /**
   * Clear operation history
   */
  clearHistory(): void {
    this.operationHistory = [];
    log.info('[FileManager] Operation history cleared');
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private generateId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private formatDate(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return format
      .replace('YYYY', year.toString())
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes);
  }

  private recordOperation(operation: FileOperation): void {
    this.operationHistory.push(operation);
    
    // Trim history if too large
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory = this.operationHistory.slice(-this.maxHistorySize);
    }
  }

  private loadScopes(): void {
    try {
      const scopesPath = path.join(app.getPath('userData'), 'dex-file-scopes.json');
      if (fs.existsSync(scopesPath)) {
        const data = JSON.parse(fs.readFileSync(scopesPath, 'utf-8'));
        for (const scope of data.scopes ?? []) {
          if (fs.existsSync(scope.path)) {
            this.allowedScopes.set(scope.path, scope);
          }
        }
        log.info(`[FileManager] Loaded ${this.allowedScopes.size} scopes`);
      }
    } catch (error) {
      log.error('[FileManager] Failed to load scopes:', error);
    }
  }

  private saveScopes(): void {
    try {
      const scopesPath = path.join(app.getPath('userData'), 'dex-file-scopes.json');
      const data = {
        version: 1,
        scopes: Array.from(this.allowedScopes.values()),
      };
      fs.writeFileSync(scopesPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      log.error('[FileManager] Failed to save scopes:', error);
    }
  }
}

// Singleton export
export const fileManager = new FileManagerClass();
