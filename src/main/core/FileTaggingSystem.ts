// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - File Tagging & Labeling System
// Non-destructive metadata tagging for files and folders
// User-defined tags, color labels, searchable metadata
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';
import * as crypto from 'crypto';

// ===========================================================================
// TYPES
// ===========================================================================

export type LabelColor = 
  | 'none' 
  | 'red' 
  | 'orange' 
  | 'yellow' 
  | 'green' 
  | 'blue' 
  | 'purple' 
  | 'gray';

export interface Tag {
  id: string;
  name: string;
  color: string;          // Hex color for display
  description?: string;
  icon?: string;          // Optional icon identifier
  createdAt: number;
  usageCount: number;
}

export interface FileMetadata {
  filePath: string;        // Absolute path (key)
  pathHash: string;        // Hash of path for quick lookup
  tags: string[];          // Tag IDs
  label: LabelColor;       // Color label
  rating: number;          // 0-5 stars
  notes: string;           // User notes/comments
  customFields: Record<string, string | number | boolean>;
  createdAt: number;
  updatedAt: number;
}

export interface TagFilter {
  tags?: string[];         // Include any of these tags
  tagsAll?: string[];      // Must have ALL these tags
  tagsExclude?: string[];  // Exclude files with these tags
  label?: LabelColor[];    // Filter by label colors
  ratingMin?: number;      // Minimum rating
  ratingMax?: number;      // Maximum rating
  hasNotes?: boolean;      // Has notes attached
  customField?: {
    key: string;
    value: string | number | boolean;
    operator?: 'eq' | 'ne' | 'gt' | 'lt' | 'contains';
  };
}

export interface TagStats {
  totalTags: number;
  totalTaggedFiles: number;
  tagUsage: Record<string, number>;
  labelUsage: Record<LabelColor, number>;
  avgRating: number;
}

export interface TaggingConfig {
  enableAutoSuggestion: boolean;
  maxTagsPerFile: number;
  allowCustomFields: boolean;
  inheritParentTags: boolean;
}

// ===========================================================================
// PRESET COLORS
// ===========================================================================

const LABEL_COLORS: Record<LabelColor, string> = {
  none: 'transparent',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  gray: '#6b7280',
};

const DEFAULT_TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
  '#a855f7', '#ec4899', '#14b8a6', '#6366f1', '#8b5cf6',
];

// ===========================================================================
// FILE TAGGING SYSTEM
// ===========================================================================

class FileTaggingSystemClass extends EventEmitter {
  private tags: Map<string, Tag> = new Map();
  private fileMetadata: Map<string, FileMetadata> = new Map();
  private pathIndex: Map<string, string> = new Map(); // pathHash -> filePath
  private config: TaggingConfig;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = {
      enableAutoSuggestion: true,
      maxTagsPerFile: 20,
      allowCustomFields: true,
      inheritParentTags: false,
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'tagging');

    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadData();
      log.info(`[FileTagging] Initialized with ${this.tags.size} tags, ${this.fileMetadata.size} tagged files`);
    } catch (error) {
      log.error('[FileTagging] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // -- Tag Management ----------------------------------------------------
    ipcMain.handle('tags:create', async (_event, name: string, color?: string, description?: string) => {
      return this.createTag(name, color, description);
    });

    ipcMain.handle('tags:update', async (_event, tagId: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>) => {
      return this.updateTag(tagId, updates);
    });

    ipcMain.handle('tags:delete', async (_event, tagId: string) => {
      return this.deleteTag(tagId);
    });

    ipcMain.handle('tags:get', (_event, tagId: string) => {
      return this.getTag(tagId);
    });

    ipcMain.handle('tags:list', () => {
      return this.listTags();
    });

    ipcMain.handle('tags:search', (_event, query: string) => {
      return this.searchTags(query);
    });

    ipcMain.handle('tags:suggest', (_event, filePath: string) => {
      return this.suggestTags(filePath);
    });

    // -- File Tagging ------------------------------------------------------
    ipcMain.handle('tagging:addTag', async (_event, filePath: string, tagId: string) => {
      return this.addTagToFile(filePath, tagId);
    });

    ipcMain.handle('tagging:removeTag', async (_event, filePath: string, tagId: string) => {
      return this.removeTagFromFile(filePath, tagId);
    });

    ipcMain.handle('tagging:setTags', async (_event, filePath: string, tagIds: string[]) => {
      return this.setFileTags(filePath, tagIds);
    });

    ipcMain.handle('tagging:setLabel', async (_event, filePath: string, label: LabelColor) => {
      return this.setFileLabel(filePath, label);
    });

    ipcMain.handle('tagging:setRating', async (_event, filePath: string, rating: number) => {
      return this.setFileRating(filePath, rating);
    });

    ipcMain.handle('tagging:setNotes', async (_event, filePath: string, notes: string) => {
      return this.setFileNotes(filePath, notes);
    });

    ipcMain.handle('tagging:setCustomField', async (_event, filePath: string, key: string, value: string | number | boolean) => {
      return this.setCustomField(filePath, key, value);
    });

    ipcMain.handle('tagging:removeCustomField', async (_event, filePath: string, key: string) => {
      return this.removeCustomField(filePath, key);
    });

    ipcMain.handle('tagging:getMetadata', (_event, filePath: string) => {
      return this.getFileMetadata(filePath);
    });

    ipcMain.handle('tagging:clearMetadata', async (_event, filePath: string) => {
      return this.clearFileMetadata(filePath);
    });

    // -- Batch Operations --------------------------------------------------
    ipcMain.handle('tagging:batchAddTag', async (_event, filePaths: string[], tagId: string) => {
      return this.batchAddTag(filePaths, tagId);
    });

    ipcMain.handle('tagging:batchRemoveTag', async (_event, filePaths: string[], tagId: string) => {
      return this.batchRemoveTag(filePaths, tagId);
    });

    ipcMain.handle('tagging:batchSetLabel', async (_event, filePaths: string[], label: LabelColor) => {
      return this.batchSetLabel(filePaths, label);
    });

    // -- Query & Search ----------------------------------------------------
    ipcMain.handle('tagging:findByTag', (_event, tagId: string) => {
      return this.findFilesByTag(tagId);
    });

    ipcMain.handle('tagging:findByLabel', (_event, label: LabelColor) => {
      return this.findFilesByLabel(label);
    });

    ipcMain.handle('tagging:findByRating', (_event, minRating: number, maxRating?: number) => {
      return this.findFilesByRating(minRating, maxRating);
    });

    ipcMain.handle('tagging:filter', (_event, filter: TagFilter) => {
      return this.filterFiles(filter);
    });

    ipcMain.handle('tagging:search', (_event, query: string) => {
      return this.searchTaggedFiles(query);
    });

    // -- Stats & Config ----------------------------------------------------
    ipcMain.handle('tagging:stats', () => this.getStats());
    ipcMain.handle('tagging:config', () => this.config);
    ipcMain.handle('tagging:setConfig', async (_event, config: Partial<TaggingConfig>) => {
      this.config = { ...this.config, ...config };
      await this.saveData();
      return { success: true };
    });

    // -- File Path Updates -------------------------------------------------
    ipcMain.handle('tagging:onFileMove', async (_event, oldPath: string, newPath: string) => {
      return this.handleFileMove(oldPath, newPath);
    });

    ipcMain.handle('tagging:onFileDelete', async (_event, filePath: string) => {
      return this.handleFileDelete(filePath);
    });
  }

  // -------------------------------------------------------------------------
  // TAG MANAGEMENT
  // -------------------------------------------------------------------------

  createTag(name: string, color?: string, description?: string): Tag {
    const normalizedName = name.trim().toLowerCase();
    
    // Check for duplicate
    const existing = Array.from(this.tags.values()).find(t => t.name.toLowerCase() === normalizedName);
    if (existing) {
      return existing;
    }

    const id = `tag-${++this.idCounter}-${Date.now()}`;
    const tag: Tag = {
      id,
      name: name.trim(),
      color: color || DEFAULT_TAG_COLORS[this.idCounter % DEFAULT_TAG_COLORS.length],
      description,
      createdAt: Date.now(),
      usageCount: 0,
    };

    this.tags.set(id, tag);
    this.markDirty();

    this.emit('tag:created', tag);
    this.notifyRenderer('tagging:tagCreated', tag);

    return tag;
  }

  updateTag(tagId: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>): Tag | null {
    const tag = this.tags.get(tagId);
    if (!tag) return null;

    // Prevent duplicate names
    if (updates.name) {
      const normalizedName = updates.name.trim().toLowerCase();
      const existing = Array.from(this.tags.values()).find(
        t => t.id !== tagId && t.name.toLowerCase() === normalizedName
      );
      if (existing) {
        return null;
      }
    }

    Object.assign(tag, updates);
    this.markDirty();

    this.emit('tag:updated', tag);
    this.notifyRenderer('tagging:tagUpdated', tag);

    return tag;
  }

  deleteTag(tagId: string): { success: boolean; affectedFiles: number } {
    const tag = this.tags.get(tagId);
    if (!tag) return { success: false, affectedFiles: 0 };

    let affectedFiles = 0;

    // Remove tag from all files
    for (const [filePath, metadata] of this.fileMetadata) {
      const index = metadata.tags.indexOf(tagId);
      if (index !== -1) {
        metadata.tags.splice(index, 1);
        metadata.updatedAt = Date.now();
        affectedFiles++;
      }
    }

    this.tags.delete(tagId);
    this.markDirty();

    this.emit('tag:deleted', tagId);
    this.notifyRenderer('tagging:tagDeleted', { tagId, affectedFiles });

    return { success: true, affectedFiles };
  }

  getTag(tagId: string): Tag | null {
    return this.tags.get(tagId) || null;
  }

  listTags(): Tag[] {
    return Array.from(this.tags.values()).sort((a, b) => b.usageCount - a.usageCount);
  }

  searchTags(query: string): Tag[] {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return this.listTags();

    return Array.from(this.tags.values())
      .filter(tag => 
        tag.name.toLowerCase().includes(normalizedQuery) ||
        tag.description?.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) => {
        // Prioritize exact matches
        const aExact = a.name.toLowerCase() === normalizedQuery ? 1 : 0;
        const bExact = b.name.toLowerCase() === normalizedQuery ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        
        // Then by starts with
        const aStarts = a.name.toLowerCase().startsWith(normalizedQuery) ? 1 : 0;
        const bStarts = b.name.toLowerCase().startsWith(normalizedQuery) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        
        // Then by usage
        return b.usageCount - a.usageCount;
      });
  }

  suggestTags(filePath: string): Tag[] {
    if (!this.config.enableAutoSuggestion) return [];

    const suggestions: Tag[] = [];
    const ext = path.extname(filePath).toLowerCase();
    const dirName = path.dirname(filePath);

    // Find tags commonly used in same directory
    const siblingTags = new Map<string, number>();
    for (const [fPath, metadata] of this.fileMetadata) {
      if (path.dirname(fPath) === dirName && fPath !== filePath) {
        for (const tagId of metadata.tags) {
          siblingTags.set(tagId, (siblingTags.get(tagId) || 0) + 1);
        }
      }
    }

    // Find tags commonly used with same extension
    const extTags = new Map<string, number>();
    for (const [fPath, metadata] of this.fileMetadata) {
      if (path.extname(fPath).toLowerCase() === ext && fPath !== filePath) {
        for (const tagId of metadata.tags) {
          extTags.set(tagId, (extTags.get(tagId) || 0) + 1);
        }
      }
    }

    // Combine and score
    const scored = new Map<string, number>();
    for (const [tagId, count] of siblingTags) {
      scored.set(tagId, (scored.get(tagId) || 0) + count * 2); // Weight sibling tags higher
    }
    for (const [tagId, count] of extTags) {
      scored.set(tagId, (scored.get(tagId) || 0) + count);
    }

    // Get existing tags for this file
    const existingTags = this.fileMetadata.get(filePath)?.tags || [];

    // Return top suggestions not already applied
    return Array.from(scored.entries())
      .filter(([tagId]) => !existingTags.includes(tagId))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tagId]) => this.tags.get(tagId)!)
      .filter(Boolean);
  }

  // -------------------------------------------------------------------------
  // FILE TAGGING
  // -------------------------------------------------------------------------

  private getOrCreateMetadata(filePath: string): FileMetadata {
    let metadata = this.fileMetadata.get(filePath);
    if (!metadata) {
      const pathHash = this.hashPath(filePath);
      metadata = {
        filePath,
        pathHash,
        tags: [],
        label: 'none',
        rating: 0,
        notes: '',
        customFields: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.fileMetadata.set(filePath, metadata);
      this.pathIndex.set(pathHash, filePath);
    }
    return metadata;
  }

  addTagToFile(filePath: string, tagId: string): { success: boolean } {
    const tag = this.tags.get(tagId);
    if (!tag) return { success: false };

    const metadata = this.getOrCreateMetadata(filePath);
    
    if (metadata.tags.includes(tagId)) {
      return { success: true }; // Already tagged
    }

    if (metadata.tags.length >= this.config.maxTagsPerFile) {
      return { success: false };
    }

    metadata.tags.push(tagId);
    metadata.updatedAt = Date.now();
    tag.usageCount++;
    this.markDirty();

    this.emit('file:tagged', { filePath, tagId });
    this.notifyRenderer('tagging:fileTagged', { filePath, tagId, metadata });

    return { success: true };
  }

  removeTagFromFile(filePath: string, tagId: string): { success: boolean } {
    const metadata = this.fileMetadata.get(filePath);
    if (!metadata) return { success: false };

    const index = metadata.tags.indexOf(tagId);
    if (index === -1) return { success: false };

    metadata.tags.splice(index, 1);
    metadata.updatedAt = Date.now();

    const tag = this.tags.get(tagId);
    if (tag && tag.usageCount > 0) {
      tag.usageCount--;
    }

    this.markDirty();
    this.cleanupEmptyMetadata(filePath);

    this.emit('file:untagged', { filePath, tagId });
    this.notifyRenderer('tagging:fileUntagged', { filePath, tagId });

    return { success: true };
  }

  setFileTags(filePath: string, tagIds: string[]): { success: boolean; applied: string[] } {
    const validTagIds = tagIds.filter(id => this.tags.has(id)).slice(0, this.config.maxTagsPerFile);
    const metadata = this.getOrCreateMetadata(filePath);

    // Decrement old tag usage
    for (const oldTagId of metadata.tags) {
      const tag = this.tags.get(oldTagId);
      if (tag && tag.usageCount > 0) {
        tag.usageCount--;
      }
    }

    // Set new tags and increment usage
    metadata.tags = validTagIds;
    for (const tagId of validTagIds) {
      const tag = this.tags.get(tagId);
      if (tag) {
        tag.usageCount++;
      }
    }

    metadata.updatedAt = Date.now();
    this.markDirty();

    this.emit('file:tagsSet', { filePath, tags: validTagIds });
    this.notifyRenderer('tagging:fileTagsSet', { filePath, tags: validTagIds, metadata });

    return { success: true, applied: validTagIds };
  }

  setFileLabel(filePath: string, label: LabelColor): { success: boolean } {
    const metadata = this.getOrCreateMetadata(filePath);
    metadata.label = label;
    metadata.updatedAt = Date.now();
    this.markDirty();

    this.emit('file:labeled', { filePath, label });
    this.notifyRenderer('tagging:fileLabelSet', { filePath, label, metadata });

    return { success: true };
  }

  setFileRating(filePath: string, rating: number): { success: boolean } {
    const clampedRating = Math.max(0, Math.min(5, Math.round(rating)));
    const metadata = this.getOrCreateMetadata(filePath);
    metadata.rating = clampedRating;
    metadata.updatedAt = Date.now();
    this.markDirty();

    this.emit('file:rated', { filePath, rating: clampedRating });
    this.notifyRenderer('tagging:fileRatingSet', { filePath, rating: clampedRating, metadata });

    return { success: true };
  }

  setFileNotes(filePath: string, notes: string): { success: boolean } {
    const metadata = this.getOrCreateMetadata(filePath);
    metadata.notes = notes;
    metadata.updatedAt = Date.now();
    this.markDirty();
    this.cleanupEmptyMetadata(filePath);

    this.emit('file:notesSet', { filePath, notes });
    this.notifyRenderer('tagging:fileNotesSet', { filePath, notes, metadata });

    return { success: true };
  }

  setCustomField(filePath: string, key: string, value: string | number | boolean): { success: boolean } {
    if (!this.config.allowCustomFields) return { success: false };

    const metadata = this.getOrCreateMetadata(filePath);
    metadata.customFields[key] = value;
    metadata.updatedAt = Date.now();
    this.markDirty();

    this.emit('file:customFieldSet', { filePath, key, value });
    this.notifyRenderer('tagging:customFieldSet', { filePath, key, value, metadata });

    return { success: true };
  }

  removeCustomField(filePath: string, key: string): { success: boolean } {
    const metadata = this.fileMetadata.get(filePath);
    if (!metadata || !(key in metadata.customFields)) return { success: false };

    delete metadata.customFields[key];
    metadata.updatedAt = Date.now();
    this.markDirty();
    this.cleanupEmptyMetadata(filePath);

    return { success: true };
  }

  getFileMetadata(filePath: string): FileMetadata | null {
    return this.fileMetadata.get(filePath) || null;
  }

  clearFileMetadata(filePath: string): { success: boolean } {
    const metadata = this.fileMetadata.get(filePath);
    if (!metadata) return { success: false };

    // Decrement tag usage
    for (const tagId of metadata.tags) {
      const tag = this.tags.get(tagId);
      if (tag && tag.usageCount > 0) {
        tag.usageCount--;
      }
    }

    this.fileMetadata.delete(filePath);
    this.pathIndex.delete(metadata.pathHash);
    this.markDirty();

    this.emit('file:metadataCleared', filePath);
    this.notifyRenderer('tagging:metadataCleared', filePath);

    return { success: true };
  }

  private cleanupEmptyMetadata(filePath: string): void {
    const metadata = this.fileMetadata.get(filePath);
    if (!metadata) return;

    const isEmpty = 
      metadata.tags.length === 0 &&
      metadata.label === 'none' &&
      metadata.rating === 0 &&
      metadata.notes === '' &&
      Object.keys(metadata.customFields).length === 0;

    if (isEmpty) {
      this.fileMetadata.delete(filePath);
      this.pathIndex.delete(metadata.pathHash);
    }
  }

  // -------------------------------------------------------------------------
  // BATCH OPERATIONS
  // -------------------------------------------------------------------------

  batchAddTag(filePaths: string[], tagId: string): { success: number; failed: number } {
    let success = 0;
    let failed = 0;

    for (const filePath of filePaths) {
      const result = this.addTagToFile(filePath, tagId);
      if (result.success) success++;
      else failed++;
    }

    return { success, failed };
  }

  batchRemoveTag(filePaths: string[], tagId: string): { success: number; failed: number } {
    let success = 0;
    let failed = 0;

    for (const filePath of filePaths) {
      const result = this.removeTagFromFile(filePath, tagId);
      if (result.success) success++;
      else failed++;
    }

    return { success, failed };
  }

  batchSetLabel(filePaths: string[], label: LabelColor): { success: number; failed: number } {
    let success = 0;
    let failed = 0;

    for (const filePath of filePaths) {
      const result = this.setFileLabel(filePath, label);
      if (result.success) success++;
      else failed++;
    }

    return { success, failed };
  }

  // -------------------------------------------------------------------------
  // QUERY & SEARCH
  // -------------------------------------------------------------------------

  findFilesByTag(tagId: string): string[] {
    const results: string[] = [];
    for (const [filePath, metadata] of this.fileMetadata) {
      if (metadata.tags.includes(tagId)) {
        results.push(filePath);
      }
    }
    return results;
  }

  findFilesByLabel(label: LabelColor): string[] {
    const results: string[] = [];
    for (const [filePath, metadata] of this.fileMetadata) {
      if (metadata.label === label) {
        results.push(filePath);
      }
    }
    return results;
  }

  findFilesByRating(minRating: number, maxRating = 5): string[] {
    const results: string[] = [];
    for (const [filePath, metadata] of this.fileMetadata) {
      if (metadata.rating >= minRating && metadata.rating <= maxRating) {
        results.push(filePath);
      }
    }
    return results;
  }

  filterFiles(filter: TagFilter): string[] {
    const results: string[] = [];

    for (const [filePath, metadata] of this.fileMetadata) {
      let matches = true;

      // Tags (any)
      if (filter.tags && filter.tags.length > 0) {
        matches = matches && filter.tags.some(t => metadata.tags.includes(t));
      }

      // Tags (all)
      if (filter.tagsAll && filter.tagsAll.length > 0) {
        matches = matches && filter.tagsAll.every(t => metadata.tags.includes(t));
      }

      // Tags (exclude)
      if (filter.tagsExclude && filter.tagsExclude.length > 0) {
        matches = matches && !filter.tagsExclude.some(t => metadata.tags.includes(t));
      }

      // Label
      if (filter.label && filter.label.length > 0) {
        matches = matches && filter.label.includes(metadata.label);
      }

      // Rating
      if (filter.ratingMin !== undefined) {
        matches = matches && metadata.rating >= filter.ratingMin;
      }
      if (filter.ratingMax !== undefined) {
        matches = matches && metadata.rating <= filter.ratingMax;
      }

      // Has notes
      if (filter.hasNotes !== undefined) {
        matches = matches && (filter.hasNotes ? metadata.notes.length > 0 : metadata.notes.length === 0);
      }

      // Custom field
      if (filter.customField) {
        const { key, value, operator = 'eq' } = filter.customField;
        const fieldValue = metadata.customFields[key];
        
        if (fieldValue === undefined) {
          matches = false;
        } else {
          switch (operator) {
            case 'eq':
              matches = matches && fieldValue === value;
              break;
            case 'ne':
              matches = matches && fieldValue !== value;
              break;
            case 'gt':
              matches = matches && fieldValue > value;
              break;
            case 'lt':
              matches = matches && fieldValue < value;
              break;
            case 'contains':
              matches = matches && String(fieldValue).includes(String(value));
              break;
          }
        }
      }

      if (matches) {
        results.push(filePath);
      }
    }

    return results;
  }

  searchTaggedFiles(query: string): Array<{ filePath: string; metadata: FileMetadata; score: number }> {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    const results: Array<{ filePath: string; metadata: FileMetadata; score: number }> = [];

    for (const [filePath, metadata] of this.fileMetadata) {
      let score = 0;

      // Search in file name
      const fileName = path.basename(filePath).toLowerCase();
      if (fileName.includes(normalizedQuery)) {
        score += fileName.startsWith(normalizedQuery) ? 10 : 5;
      }

      // Search in notes
      if (metadata.notes.toLowerCase().includes(normalizedQuery)) {
        score += 3;
      }

      // Search in tag names
      for (const tagId of metadata.tags) {
        const tag = this.tags.get(tagId);
        if (tag && tag.name.toLowerCase().includes(normalizedQuery)) {
          score += 5;
        }
      }

      // Search in custom field values
      for (const value of Object.values(metadata.customFields)) {
        if (String(value).toLowerCase().includes(normalizedQuery)) {
          score += 2;
        }
      }

      if (score > 0) {
        results.push({ filePath, metadata, score });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // -------------------------------------------------------------------------
  // FILE PATH UPDATES
  // -------------------------------------------------------------------------

  handleFileMove(oldPath: string, newPath: string): { success: boolean } {
    const metadata = this.fileMetadata.get(oldPath);
    if (!metadata) return { success: false };

    // Remove old entry
    this.fileMetadata.delete(oldPath);
    this.pathIndex.delete(metadata.pathHash);

    // Create new entry
    const newPathHash = this.hashPath(newPath);
    metadata.filePath = newPath;
    metadata.pathHash = newPathHash;
    metadata.updatedAt = Date.now();

    this.fileMetadata.set(newPath, metadata);
    this.pathIndex.set(newPathHash, newPath);
    this.markDirty();

    this.emit('file:moved', { oldPath, newPath });

    return { success: true };
  }

  handleFileDelete(filePath: string): { success: boolean } {
    return this.clearFileMetadata(filePath);
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): TagStats {
    const tagUsage: Record<string, number> = {};
    const labelUsage: Record<LabelColor, number> = {
      none: 0, red: 0, orange: 0, yellow: 0,
      green: 0, blue: 0, purple: 0, gray: 0,
    };
    let totalRating = 0;
    let ratedCount = 0;

    for (const tag of this.tags.values()) {
      tagUsage[tag.id] = tag.usageCount;
    }

    for (const metadata of this.fileMetadata.values()) {
      labelUsage[metadata.label]++;
      if (metadata.rating > 0) {
        totalRating += metadata.rating;
        ratedCount++;
      }
    }

    return {
      totalTags: this.tags.size,
      totalTaggedFiles: this.fileMetadata.size,
      tagUsage,
      labelUsage,
      avgRating: ratedCount > 0 ? totalRating / ratedCount : 0,
    };
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private hashPath(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }

  private markDirty(): void {
    this.dirty = true;
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      if (this.dirty) {
        await this.saveData();
      }
    }, 2000);
  }

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadData(): Promise<void> {
    try {
      // Load tags
      const tagsPath = path.join(this.dataPath, 'tags.json');
      try {
        const tagsData = await fs.readFile(tagsPath, 'utf-8');
        const tags = JSON.parse(tagsData) as Tag[];
        for (const tag of tags) {
          this.tags.set(tag.id, tag);
          const idNum = parseInt(tag.id.split('-')[1], 10);
          if (idNum > this.idCounter) this.idCounter = idNum;
        }
      } catch {
        // No existing tags
      }

      // Load file metadata
      const metadataPath = path.join(this.dataPath, 'metadata.json');
      try {
        const metadataData = await fs.readFile(metadataPath, 'utf-8');
        const metadataList = JSON.parse(metadataData) as FileMetadata[];
        for (const metadata of metadataList) {
          this.fileMetadata.set(metadata.filePath, metadata);
          this.pathIndex.set(metadata.pathHash, metadata.filePath);
        }
      } catch {
        // No existing metadata
      }

      // Load config
      const configPath = path.join(this.dataPath, 'config.json');
      try {
        const configData = await fs.readFile(configPath, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(configData) };
      } catch {
        // Use defaults
      }
    } catch (error) {
      log.error('[FileTagging] Load failed:', error);
    }
  }

  private async saveData(): Promise<void> {
    if (!this.dirty) return;

    try {
      // Save tags
      const tagsPath = path.join(this.dataPath, 'tags.json');
      await fs.writeFile(tagsPath, JSON.stringify(Array.from(this.tags.values()), null, 2));

      // Save file metadata
      const metadataPath = path.join(this.dataPath, 'metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(Array.from(this.fileMetadata.values()), null, 2));

      // Save config
      const configPath = path.join(this.dataPath, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));

      this.dirty = false;
      log.debug('[FileTagging] Data saved');
    } catch (error) {
      log.error('[FileTagging] Save failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveData();
  }
}

// ===========================================================================
// LABEL COLOR HELPERS (Export for UI)
// ===========================================================================

export const getLabelColor = (label: LabelColor): string => LABEL_COLORS[label];
export const getAllLabelColors = (): typeof LABEL_COLORS => ({ ...LABEL_COLORS });

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const FileTaggingSystem = new FileTaggingSystemClass();
export default FileTaggingSystem;
