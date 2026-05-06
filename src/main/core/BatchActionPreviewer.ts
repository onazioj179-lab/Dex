// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Batch Action Previewer
// Rename, move, organize in batches
// Preview results before running
// Cancel anytime - safety first
// ===========================================================================

import { EventEmitter } from 'events';
import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type BatchActionType = 
  | 'rename'        // Rename files with pattern
  | 'move'          // Move files to directory
  | 'copy'          // Copy files to directory
  | 'delete'        // Delete files (to trash)
  | 'organize'      // Organize by date/type/name
  | 'flatten'       // Flatten nested folders
  | 'dedupe'        // Find and handle duplicates
  | 'convert';      // Convert file formats (if applicable)

export type BatchStatus = 'preview' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';

export interface BatchItem {
  id: string;
  sourcePath: string;
  sourceExists: boolean;
  targetPath?: string;        // For rename/move/copy
  targetExists?: boolean;     // Will overwrite?
  action: 'keep' | 'overwrite' | 'skip' | 'rename-target';
  error?: string;
  completed: boolean;
}

export interface BatchPreview {
  id: string;
  type: BatchActionType;
  items: BatchItem[];
  stats: {
    total: number;
    willProcess: number;
    willSkip: number;
    willOverwrite: number;
    errors: number;
  };
  createdAt: number;
}

export interface BatchProgress {
  batchId: string;
  status: BatchStatus;
  processed: number;
  total: number;
  current?: BatchItem;
  errors: Array<{ item: BatchItem; error: string }>;
  startedAt?: number;
  completedAt?: number;
}

export interface RenamePattern {
  find: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
}

export interface OrganizeOptions {
  by: 'date' | 'type' | 'extension' | 'name-first-letter' | 'size';
  dateFormat?: string;        // e.g., 'YYYY/MM' for date organizing
  customFolders?: Record<string, string[]>; // type -> extensions mapping
}

// ===========================================================================
// BATCH ACTION PREVIEWER
// ===========================================================================

class BatchActionPreviewerClass extends EventEmitter {
  private previews: Map<string, BatchPreview> = new Map();
  private activeBatch: BatchProgress | null = null;
  private cancellationRequested = false;
  private batchIdCounter = 0;

  constructor() {
    super();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Preview rename batch
    ipcMain.handle('batch:previewRename', async (_event, files: string[], pattern: RenamePattern) => {
      return this.previewRename(files, pattern);
    });

    // Preview move batch
    ipcMain.handle('batch:previewMove', async (_event, files: string[], targetDir: string) => {
      return this.previewMove(files, targetDir);
    });

    // Preview copy batch
    ipcMain.handle('batch:previewCopy', async (_event, files: string[], targetDir: string) => {
      return this.previewCopy(files, targetDir);
    });

    // Preview delete batch
    ipcMain.handle('batch:previewDelete', async (_event, files: string[]) => {
      return this.previewDelete(files);
    });

    // Preview organize batch
    ipcMain.handle('batch:previewOrganize', async (_event, files: string[], targetDir: string, options: OrganizeOptions) => {
      return this.previewOrganize(files, targetDir, options);
    });

    // Update item action
    ipcMain.handle('batch:updateItem', (_event, previewId: string, itemId: string, action: BatchItem['action']) => {
      return this.updateItemAction(previewId, itemId, action);
    });

    // Execute batch
    ipcMain.handle('batch:execute', async (_event, previewId: string) => {
      return this.executeBatch(previewId);
    });

    // Cancel batch
    ipcMain.handle('batch:cancel', (_event, previewId?: string) => {
      return this.cancelBatch(previewId);
    });

    // Get progress
    ipcMain.handle('batch:progress', () => {
      return this.activeBatch;
    });

    // Get preview
    ipcMain.handle('batch:getPreview', (_event, previewId: string) => {
      return this.previews.get(previewId) || null;
    });

    // Clear preview
    ipcMain.handle('batch:clearPreview', (_event, previewId: string) => {
      return this.clearPreview(previewId);
    });
  }

  // -------------------------------------------------------------------------
  // PREVIEW GENERATION
  // -------------------------------------------------------------------------

  async previewRename(files: string[], pattern: RenamePattern): Promise<BatchPreview> {
    const items: BatchItem[] = [];
    const previewId = this.generateId();

    for (const filePath of files) {
      const item = await this.createRenameItem(previewId, filePath, pattern);
      items.push(item);
    }

    const preview = this.createPreview(previewId, 'rename', items);
    this.previews.set(previewId, preview);
    return preview;
  }

  private async createRenameItem(previewId: string, filePath: string, pattern: RenamePattern): Promise<BatchItem> {
    const itemId = `${previewId}-${this.generateItemId()}`;
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);

    let sourceExists = false;
    try {
      await fs.access(filePath);
      sourceExists = true;
    } catch { /* doesn't exist */ }

    // Apply rename pattern
    let newName: string;
    if (pattern.useRegex) {
      const regex = new RegExp(pattern.find, pattern.caseSensitive ? 'g' : 'gi');
      newName = baseName.replace(regex, pattern.replace);
    } else {
      const flags = pattern.caseSensitive ? 'g' : 'gi';
      const escapedFind = this.escapeRegex(pattern.find);
      newName = baseName.replace(new RegExp(escapedFind, flags), pattern.replace);
    }

    const targetPath = path.join(dir, newName + ext);
    let targetExists = false;
    
    if (targetPath !== filePath) {
      try {
        await fs.access(targetPath);
        targetExists = true;
      } catch { /* doesn't exist */ }
    }

    return {
      id: itemId,
      sourcePath: filePath,
      sourceExists,
      targetPath,
      targetExists,
      action: targetExists ? 'skip' : 'keep',
      completed: false
    };
  }

  async previewMove(files: string[], targetDir: string): Promise<BatchPreview> {
    const items: BatchItem[] = [];
    const previewId = this.generateId();

    for (const filePath of files) {
      const item = await this.createMoveItem(previewId, filePath, targetDir);
      items.push(item);
    }

    const preview = this.createPreview(previewId, 'move', items);
    this.previews.set(previewId, preview);
    return preview;
  }

  private async createMoveItem(previewId: string, filePath: string, targetDir: string): Promise<BatchItem> {
    const itemId = `${previewId}-${this.generateItemId()}`;
    const fileName = path.basename(filePath);
    const targetPath = path.join(targetDir, fileName);

    let sourceExists = false;
    try {
      await fs.access(filePath);
      sourceExists = true;
    } catch { /* doesn't exist */ }

    let targetExists = false;
    try {
      await fs.access(targetPath);
      targetExists = true;
    } catch { /* doesn't exist */ }

    return {
      id: itemId,
      sourcePath: filePath,
      sourceExists,
      targetPath,
      targetExists,
      action: targetExists ? 'skip' : 'keep',
      completed: false
    };
  }

  async previewCopy(files: string[], targetDir: string): Promise<BatchPreview> {
    const items: BatchItem[] = [];
    const previewId = this.generateId();

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const targetPath = path.join(targetDir, fileName);
      
      let sourceExists = false;
      try {
        await fs.access(filePath);
        sourceExists = true;
      } catch { /* doesn't exist */ }

      let targetExists = false;
      try {
        await fs.access(targetPath);
        targetExists = true;
      } catch { /* doesn't exist */ }

      items.push({
        id: `${previewId}-${this.generateItemId()}`,
        sourcePath: filePath,
        sourceExists,
        targetPath,
        targetExists,
        action: targetExists ? 'skip' : 'keep',
        completed: false
      });
    }

    const preview = this.createPreview(previewId, 'copy', items);
    this.previews.set(previewId, preview);
    return preview;
  }

  async previewDelete(files: string[]): Promise<BatchPreview> {
    const items: BatchItem[] = [];
    const previewId = this.generateId();

    for (const filePath of files) {
      let sourceExists = false;
      try {
        await fs.access(filePath);
        sourceExists = true;
      } catch { /* doesn't exist */ }

      items.push({
        id: `${previewId}-${this.generateItemId()}`,
        sourcePath: filePath,
        sourceExists,
        action: 'keep',
        completed: false
      });
    }

    const preview = this.createPreview(previewId, 'delete', items);
    this.previews.set(previewId, preview);
    return preview;
  }

  async previewOrganize(files: string[], targetDir: string, options: OrganizeOptions): Promise<BatchPreview> {
    const items: BatchItem[] = [];
    const previewId = this.generateId();

    for (const filePath of files) {
      const item = await this.createOrganizeItem(previewId, filePath, targetDir, options);
      items.push(item);
    }

    const preview = this.createPreview(previewId, 'organize', items);
    this.previews.set(previewId, preview);
    return preview;
  }

  private async createOrganizeItem(
    previewId: string,
    filePath: string,
    targetDir: string,
    options: OrganizeOptions
  ): Promise<BatchItem> {
    const itemId = `${previewId}-${this.generateItemId()}`;
    const fileName = path.basename(filePath);

    let sourceExists = false;
    let stats: { mtimeMs: number; size: number } | null = null;
    try {
      const stat = await fs.stat(filePath);
      sourceExists = true;
      stats = { mtimeMs: stat.mtimeMs, size: stat.size };
    } catch { /* doesn't exist */ }

    // Determine target folder based on organize options
    const subFolder = this.getOrganizeFolder(filePath, options, stats);
    const targetPath = path.join(targetDir, subFolder, fileName);

    let targetExists = false;
    try {
      await fs.access(targetPath);
      targetExists = true;
    } catch { /* doesn't exist */ }

    return {
      id: itemId,
      sourcePath: filePath,
      sourceExists,
      targetPath,
      targetExists,
      action: targetExists ? 'skip' : 'keep',
      completed: false
    };
  }

  private getOrganizeFolder(
    filePath: string,
    options: OrganizeOptions,
    stats: { mtimeMs: number; size: number } | null
  ): string {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const fileName = path.basename(filePath, path.extname(filePath));

    switch (options.by) {
      case 'date': {
        if (!stats) return 'unknown';
        const date = new Date(stats.mtimeMs);
        const format = options.dateFormat || 'YYYY/MM';
        return this.formatDate(date, format);
      }

      case 'type': {
        // Common file type categories
        const categories: Record<string, string[]> = {
          'Images': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'],
          'Documents': ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'txt', 'rtf'],
          'Videos': ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'],
          'Audio': ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'],
          'Archives': ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
          'Code': ['js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'php', 'rb'],
          ...options.customFolders
        };

        for (const [category, extensions] of Object.entries(categories)) {
          if (extensions.includes(ext)) {
            return category;
          }
        }
        return 'Other';
      }

      case 'extension':
        return ext || 'no-extension';

      case 'name-first-letter':
        const firstChar = fileName.charAt(0).toUpperCase();
        return /[A-Z]/.test(firstChar) ? firstChar : '#';

      case 'size': {
        if (!stats) return 'unknown';
        const mb = stats.size / (1024 * 1024);
        if (mb < 1) return 'Small (< 1MB)';
        if (mb < 10) return 'Medium (1-10MB)';
        if (mb < 100) return 'Large (10-100MB)';
        return 'Very Large (> 100MB)';
      }

      default:
        return 'Other';
    }
  }

  private formatDate(date: Date, format: string): string {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day);
  }

  private createPreview(id: string, type: BatchActionType, items: BatchItem[]): BatchPreview {
    const stats = {
      total: items.length,
      willProcess: items.filter(i => i.action === 'keep' || i.action === 'overwrite').length,
      willSkip: items.filter(i => i.action === 'skip').length,
      willOverwrite: items.filter(i => i.action === 'overwrite').length,
      errors: items.filter(i => i.error).length
    };

    return {
      id,
      type,
      items,
      stats,
      createdAt: Date.now()
    };
  }

  // -------------------------------------------------------------------------
  // ITEM MANAGEMENT
  // -------------------------------------------------------------------------

  updateItemAction(previewId: string, itemId: string, action: BatchItem['action']): { success: boolean } {
    const preview = this.previews.get(previewId);
    if (!preview) return { success: false };

    const item = preview.items.find(i => i.id === itemId);
    if (!item) return { success: false };

    item.action = action;
    
    // Recalculate stats
    preview.stats = {
      total: preview.items.length,
      willProcess: preview.items.filter(i => i.action === 'keep' || i.action === 'overwrite').length,
      willSkip: preview.items.filter(i => i.action === 'skip').length,
      willOverwrite: preview.items.filter(i => i.action === 'overwrite').length,
      errors: preview.items.filter(i => i.error).length
    };

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // BATCH EXECUTION
  // -------------------------------------------------------------------------

  async executeBatch(previewId: string): Promise<BatchProgress> {
    const preview = this.previews.get(previewId);
    if (!preview) {
      throw new Error('Preview not found');
    }

    if (this.activeBatch && this.activeBatch.status === 'running') {
      throw new Error('Another batch is already running');
    }

    this.cancellationRequested = false;
    const itemsToProcess = preview.items.filter(i => 
      i.action === 'keep' || i.action === 'overwrite'
    );

    this.activeBatch = {
      batchId: previewId,
      status: 'running',
      processed: 0,
      total: itemsToProcess.length,
      errors: [],
      startedAt: Date.now()
    };

    this.emit('batch:started', this.activeBatch);

    try {
      for (const item of itemsToProcess) {
        if (this.cancellationRequested) {
          this.activeBatch.status = 'cancelled';
          break;
        }

        this.activeBatch.current = item;
        this.emit('batch:progress', this.activeBatch);

        try {
          await this.executeItem(preview.type, item);
          item.completed = true;
        } catch (error) {
          item.error = error instanceof Error ? error.message : 'Unknown error';
          this.activeBatch.errors.push({ item, error: item.error });
          log.error(`[Batch] Error processing ${item.sourcePath}:`, error);
        }

        this.activeBatch.processed++;
      }

      if (this.activeBatch.status !== 'cancelled') {
        this.activeBatch.status = this.activeBatch.errors.length > 0 ? 'error' : 'completed';
      }
    } finally {
      this.activeBatch.completedAt = Date.now();
      this.activeBatch.current = undefined;
      this.emit('batch:completed', this.activeBatch);
    }

    return this.activeBatch;
  }

  private async executeItem(type: BatchActionType, item: BatchItem): Promise<void> {
    switch (type) {
      case 'rename':
      case 'move':
        if (!item.targetPath) throw new Error('No target path');
        await fs.mkdir(path.dirname(item.targetPath), { recursive: true });
        await fs.rename(item.sourcePath, item.targetPath);
        break;

      case 'copy':
        if (!item.targetPath) throw new Error('No target path');
        await fs.mkdir(path.dirname(item.targetPath), { recursive: true });
        await fs.copyFile(item.sourcePath, item.targetPath);
        break;

      case 'delete':
        // Move to trash would be better - for now, just delete
        await fs.unlink(item.sourcePath);
        break;

      case 'organize':
        if (!item.targetPath) throw new Error('No target path');
        await fs.mkdir(path.dirname(item.targetPath), { recursive: true });
        await fs.rename(item.sourcePath, item.targetPath);
        break;

      default:
        throw new Error(`Unsupported action type: ${type}`);
    }
  }

  cancelBatch(_previewId?: string): { success: boolean } {
    if (this.activeBatch && this.activeBatch.status === 'running') {
      this.cancellationRequested = true;
      return { success: true };
    }
    return { success: false };
  }

  clearPreview(previewId: string): { success: boolean } {
    return { success: this.previews.delete(previewId) };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private generateId(): string {
    return `batch-${++this.batchIdCounter}-${Date.now()}`;
  }

  private itemIdCounter = 0;
  private generateItemId(): string {
    return `item-${++this.itemIdCounter}`;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const BatchActionPreviewer = new BatchActionPreviewerClass();
export default BatchActionPreviewer;
