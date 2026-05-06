// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Media Controller
// Phase 7B: Media Storage (Local Files, Indexed)
// ===========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app, shell } from 'electron';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'other';

export interface MediaFile {
  id: string;
  name: string;
  originalName: string;
  filePath: string;
  type: MediaType;
  mimeType: string;
  size: number;
  tags: string[];
  description?: string;
  linkedTo?: { type: 'idea' | 'note' | 'session'; id: string };
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MediaStats {
  totalFiles: number;
  totalSize: number;
  byType: Record<MediaType, { count: number; size: number }>;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

function generateId(): string {
  return `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const MIME_TYPE_MAP: Record<string, MediaType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  'application/json': 'document',
};

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.mp3', '.wav', '.ogg', '.webm',
  '.mp4', '.mov',
  '.pdf', '.txt', '.md', '.json',
]);

// ===========================================================================
// Media Controller
// ===========================================================================

export class MediaController {
  private dataStore: DataStore;
  private logger: Logger;
  private mediaFiles: MediaFile[] = [];
  private storagePath: string;
  private initialized: boolean = false;

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
    this.storagePath = path.join(app.getPath('userData'), 'media');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure storage directories exist
      const subDirs = ['images', 'audio', 'video', 'documents', 'other'];
      for (const dir of subDirs) {
        const dirPath = path.join(this.storagePath, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      }

      // Load media file metadata
      const savedFiles = await this.dataStore.get<MediaFile[]>('mediaFiles');
      if (savedFiles) {
        this.mediaFiles = savedFiles;
        // Verify files still exist
        this.mediaFiles = this.mediaFiles.filter(file => {
          if (fs.existsSync(file.filePath)) {
            return true;
          }
          this.logger.warn(`Media file missing: ${file.filePath}`);
          return false;
        });
      }

      this.initialized = true;
      this.logger.info('Media Controller initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Media Controller');
    }
  }

  // -------------------------------------------------------------------------
  // Media File CRUD
  // -------------------------------------------------------------------------

  async getAll(): Promise<MediaFile[]> {
    return this.mediaFiles.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getById(id: string): Promise<MediaFile | null> {
    return this.mediaFiles.find(f => f.id === id) || null;
  }

  async getByType(type: MediaType): Promise<MediaFile[]> {
    return this.mediaFiles
      .filter(f => f.type === type)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async importFile(sourcePath: string, metadata?: Partial<MediaFile>): Promise<MediaFile> {
    // Validate file exists
    if (!fs.existsSync(sourcePath)) {
      throw new Error('Source file not found');
    }

    // Get file info
    const originalName = path.basename(sourcePath);
    const ext = path.extname(sourcePath).toLowerCase();
    
    // Validate extension
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`File type not allowed: ${ext}`);
    }

    // Determine media type
    const mimeType = this.getMimeType(ext);
    const type = MIME_TYPE_MAP[mimeType] || 'other';

    // Generate ID and destination path
    const id = generateId();
    const fileName = `${id}${ext}`;
    const destPath = path.join(this.storagePath, type + 's', fileName);

    // Copy file
    fs.copyFileSync(sourcePath, destPath);
    const stats = fs.statSync(destPath);

    const now = Date.now();
    const mediaFile: MediaFile = {
      id,
      name: metadata?.name || originalName,
      originalName,
      filePath: destPath,
      type,
      mimeType,
      size: stats.size,
      tags: metadata?.tags || [],
      description: metadata?.description,
      linkedTo: metadata?.linkedTo,
      pinned: metadata?.pinned || false,
      createdAt: now,
      updatedAt: now,
    };

    this.mediaFiles.push(mediaFile);
    await this.saveData();

    this.logger.info(`Media file imported: ${mediaFile.name}`);
    return mediaFile;
  }

  async saveFile(data: Buffer, name: string, mimeType: string, metadata?: Partial<MediaFile>): Promise<MediaFile> {
    const ext = this.getExtension(mimeType);
    const type = MIME_TYPE_MAP[mimeType] || 'other';
    
    const id = generateId();
    const fileName = `${id}${ext}`;
    const filePath = path.join(this.storagePath, type + 's', fileName);

    // Write file
    fs.writeFileSync(filePath, data);
    const stats = fs.statSync(filePath);

    const now = Date.now();
    const mediaFile: MediaFile = {
      id,
      name: metadata?.name || name,
      originalName: name,
      filePath,
      type,
      mimeType,
      size: stats.size,
      tags: metadata?.tags || [],
      description: metadata?.description,
      linkedTo: metadata?.linkedTo,
      pinned: metadata?.pinned || false,
      createdAt: now,
      updatedAt: now,
    };

    this.mediaFiles.push(mediaFile);
    await this.saveData();

    this.logger.info(`Media file saved: ${mediaFile.name}`);
    return mediaFile;
  }

  async updateMetadata(id: string, updates: Partial<MediaFile>): Promise<MediaFile | null> {
    const index = this.mediaFiles.findIndex(f => f.id === id);
    if (index === -1) return null;

    const file = this.mediaFiles[index];
    this.mediaFiles[index] = {
      ...file,
      ...updates,
      id: file.id, // Prevent ID change
      filePath: file.filePath, // Prevent path change
      updatedAt: Date.now(),
    };

    await this.saveData();
    return this.mediaFiles[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.mediaFiles.findIndex(f => f.id === id);
    if (index === -1) return false;

    const file = this.mediaFiles[index];

    // Delete file
    try {
      if (fs.existsSync(file.filePath)) {
        fs.unlinkSync(file.filePath);
      }
    } catch (error) {
      this.logger.error(`Failed to delete media file: ${file.filePath}`);
    }

    this.mediaFiles.splice(index, 1);
    await this.saveData();

    this.logger.info(`Media file deleted: ${file.name}`);
    return true;
  }

  async togglePin(id: string): Promise<MediaFile | null> {
    const file = this.mediaFiles.find(f => f.id === id);
    if (!file) return null;

    file.pinned = !file.pinned;
    file.updatedAt = Date.now();
    await this.saveData();

    return file;
  }

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  async getFileData(id: string): Promise<Buffer | null> {
    const file = this.mediaFiles.find(f => f.id === id);
    if (!file) return null;

    try {
      return fs.readFileSync(file.filePath);
    } catch (error) {
      this.logger.error(`Failed to read media file: ${file.filePath}`);
      return null;
    }
  }

  async getFilePath(id: string): Promise<string | null> {
    const file = this.mediaFiles.find(f => f.id === id);
    return file?.filePath || null;
  }

  async openInExplorer(id: string): Promise<boolean> {
    const file = this.mediaFiles.find(f => f.id === id);
    if (!file) return false;

    try {
      shell.showItemInFolder(file.filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async openFile(id: string): Promise<boolean> {
    const file = this.mediaFiles.find(f => f.id === id);
    if (!file) return false;

    try {
      await shell.openPath(file.filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Search & Filter
  // -------------------------------------------------------------------------

  async search(query: string): Promise<MediaFile[]> {
    const queryLower = query.toLowerCase();
    return this.mediaFiles.filter(file =>
      file.name.toLowerCase().includes(queryLower) ||
      file.description?.toLowerCase().includes(queryLower) ||
      file.tags.some(t => t.toLowerCase().includes(queryLower))
    );
  }

  async getByTag(tag: string): Promise<MediaFile[]> {
    const tagLower = tag.toLowerCase();
    return this.mediaFiles.filter(f => 
      f.tags.some(t => t.toLowerCase() === tagLower)
    );
  }

  async getPinned(): Promise<MediaFile[]> {
    return this.mediaFiles.filter(f => f.pinned);
  }

  async getRecent(limit: number = 10): Promise<MediaFile[]> {
    return this.mediaFiles
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async getLinkedTo(type: string, id: string): Promise<MediaFile[]> {
    return this.mediaFiles.filter(f => 
      f.linkedTo?.type === type && f.linkedTo?.id === id
    );
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats(): MediaStats {
    const byType: Record<MediaType, { count: number; size: number }> = {
      image: { count: 0, size: 0 },
      audio: { count: 0, size: 0 },
      video: { count: 0, size: 0 },
      document: { count: 0, size: 0 },
      other: { count: 0, size: 0 },
    };

    let totalSize = 0;
    for (const file of this.mediaFiles) {
      byType[file.type].count++;
      byType[file.type].size += file.size;
      totalSize += file.size;
    }

    return {
      totalFiles: this.mediaFiles.length,
      totalSize,
      byType,
    };
  }

  getStoragePath(): string {
    return this.storagePath;
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private getMimeType(ext: string): string {
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  private getExtension(mimeType: string): string {
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/webm': '.webm',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'application/json': '.json',
    };
    return extMap[mimeType] || '.bin';
  }

  // -------------------------------------------------------------------------
  // Data Management
  // -------------------------------------------------------------------------

  private async saveData(): Promise<void> {
    await this.dataStore.set('mediaFiles', this.mediaFiles);
  }

  async cleanup(maxAgeDays: number = 90): Promise<number> {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const toDelete = this.mediaFiles.filter(f => !f.pinned && f.createdAt < cutoff);
    
    for (const file of toDelete) {
      await this.delete(file.id);
    }

    return toDelete.length;
  }
}
