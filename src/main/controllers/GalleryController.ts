// ═══════════════════════════════════════════════════════════════════════════
// DEX - Gallery Controller
// Phase 67: Visual media browsing with virtualization
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GalleryItem {
  id: string;
  name: string;
  path: string;
  thumbnail?: string;
  width: number;
  height: number;
  size: number;
  format: string;
  createdAt: number;
  modifiedAt: number;
  tags: string[];
  favorite: boolean;
  projectId?: string;
}

export interface GalleryFolder {
  id: string;
  name: string;
  path: string;
  itemCount: number;
  thumbnail?: string;
}

interface ScanOptions {
  path: string;
  recursive?: boolean;
  extensions?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Gallery Controller
// ═══════════════════════════════════════════════════════════════════════════

export class GalleryController {
  private dataStore: DataStore;
  private logger: Logger;
  private items: GalleryItem[] = [];
  private folders: GalleryFolder[] = [];
  private watchedPaths: Set<string> = new Set();
  private thumbnailCache: Map<string, string> = new Map();
  private initialized: boolean = false;

  // Supported image formats
  private static readonly EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', 
    '.bmp', '.ico', '.tiff', '.tif'
  ];

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('[Gallery] Initializing...');

    // Load saved gallery data
    await this.loadGalleryData();

    // Register IPC handlers
    this.registerHandlers();

    this.initialized = true;
    this.logger.info(`[Gallery] Initialized with ${this.items.length} items`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC Handlers
  // ─────────────────────────────────────────────────────────────────────────

  private registerHandlers(): void {
    // Get all gallery items
    ipcMain.handle('gallery:getItems', async (_, folderId?: string) => {
      return this.getItems(folderId);
    });

    // Get folders
    ipcMain.handle('gallery:getFolders', async (_, parentPath?: string) => {
      return this.getFolders(parentPath);
    });

    // Get single item
    ipcMain.handle('gallery:getItem', async (_, id: string) => {
      return this.items.find(i => i.id === id) || null;
    });

    // Scan folder
    ipcMain.handle('gallery:scan', async (_, options: ScanOptions) => {
      return this.scanFolder(options);
    });

    // Add folder to watch
    ipcMain.handle('gallery:addFolder', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Image Folder',
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        await this.scanFolder({ path: result.filePaths[0], recursive: true });
        return result.filePaths[0];
      }
      return null;
    });

    // Update item metadata
    ipcMain.handle('gallery:updateItem', async (_, id: string, updates: Partial<GalleryItem>) => {
      return this.updateItem(id, updates);
    });

    // Add tags to items
    ipcMain.handle('gallery:addTags', async (_, ids: string[], tags: string[]) => {
      return this.addTags(ids, tags);
    });

    // Remove tags from items
    ipcMain.handle('gallery:removeTags', async (_, ids: string[], tags: string[]) => {
      return this.removeTags(ids, tags);
    });

    // Toggle favorite
    ipcMain.handle('gallery:toggleFavorite', async (_, id: string) => {
      return this.toggleFavorite(id);
    });

    // Delete items
    ipcMain.handle('gallery:delete', async (_, ids: string[]) => {
      return this.deleteItems(ids);
    });

    // Get thumbnail
    ipcMain.handle('gallery:getThumbnail', async (_, id: string) => {
      return this.getThumbnail(id);
    });

    // Compare items
    ipcMain.handle('gallery:compare', async (_, ids: string[]) => {
      return ids.map(id => this.items.find(i => i.id === id)).filter(Boolean);
    });

    // Get item by path
    ipcMain.handle('gallery:getByPath', async (_, filePath: string) => {
      return this.items.find(i => i.path === filePath) || null;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core Methods
  // ─────────────────────────────────────────────────────────────────────────

  private async loadGalleryData(): Promise<void> {
    try {
      const data = await this.dataStore.get('gallery:items');
      if (data) {
        this.items = data;
      }
      
      const folders = await this.dataStore.get('gallery:folders');
      if (folders) {
        this.folders = folders;
      }
    } catch (error) {
      this.logger.error('[Gallery] Failed to load data:', error);
    }
  }

  private async saveGalleryData(): Promise<void> {
    try {
      await this.dataStore.set('gallery:items', this.items);
      await this.dataStore.set('gallery:folders', this.folders);
    } catch (error) {
      this.logger.error('[Gallery] Failed to save data:', error);
    }
  }

  private getItems(folderId?: string): GalleryItem[] {
    if (folderId) {
      const folder = this.folders.find(f => f.id === folderId);
      if (folder) {
        return this.items.filter(i => i.path.startsWith(folder.path));
      }
    }
    return this.items;
  }

  private getFolders(parentPath?: string): GalleryFolder[] {
    if (parentPath) {
      return this.folders.filter(f => path.dirname(f.path) === parentPath);
    }
    return this.folders;
  }

  private async scanFolder(options: ScanOptions): Promise<number> {
    const { path: folderPath, recursive = true, extensions = GalleryController.EXTENSIONS } = options;
    
    this.logger.info(`[Gallery] Scanning: ${folderPath}`);
    let count = 0;

    try {
      const items = await this.scanDirectory(folderPath, recursive, new Set(extensions));
      
      // Merge with existing items, avoiding duplicates
      for (const item of items) {
        const existing = this.items.find(i => i.path === item.path);
        if (!existing) {
          this.items.push(item);
          count++;
        }
      }

      // Add folder to watch list
      this.watchedPaths.add(folderPath);
      
      // Update folder info
      const existingFolder = this.folders.find(f => f.path === folderPath);
      if (existingFolder) {
        existingFolder.itemCount = items.length;
      } else {
        this.folders.push({
          id: `folder-${Date.now()}`,
          name: path.basename(folderPath),
          path: folderPath,
          itemCount: items.length,
        });
      }

      await this.saveGalleryData();
      this.logger.info(`[Gallery] Scanned ${count} new items`);
      
    } catch (error) {
      this.logger.error('[Gallery] Scan failed:', error);
    }

    return count;
  }

  private async scanDirectory(
    dirPath: string, 
    recursive: boolean, 
    extensions: Set<string>
  ): Promise<GalleryItem[]> {
    const items: GalleryItem[] = [];

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && recursive) {
          const subItems = await this.scanDirectory(fullPath, recursive, extensions);
          items.push(...subItems);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.has(ext)) {
            const stats = await fs.promises.stat(fullPath);
            
            items.push({
              id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: entry.name,
              path: fullPath,
              width: 0, // Would need image processing to get actual dimensions
              height: 0,
              size: stats.size,
              format: ext.substring(1).toUpperCase(),
              createdAt: stats.birthtime.getTime(),
              modifiedAt: stats.mtime.getTime(),
              tags: [],
              favorite: false,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`[Gallery] Error scanning ${dirPath}:`, error);
    }

    return items;
  }

  private async updateItem(id: string, updates: Partial<GalleryItem>): Promise<GalleryItem | null> {
    const index = this.items.findIndex(i => i.id === id);
    if (index === -1) return null;

    // Don't allow updating critical fields
    const { id: _, path: __, ...safeUpdates } = updates;
    this.items[index] = { ...this.items[index], ...safeUpdates };
    
    await this.saveGalleryData();
    return this.items[index];
  }

  private async addTags(ids: string[], tags: string[]): Promise<void> {
    for (const id of ids) {
      const item = this.items.find(i => i.id === id);
      if (item) {
        const uniqueTags = new Set([...item.tags, ...tags]);
        item.tags = Array.from(uniqueTags);
      }
    }
    await this.saveGalleryData();
  }

  private async removeTags(ids: string[], tags: string[]): Promise<void> {
    const tagSet = new Set(tags);
    for (const id of ids) {
      const item = this.items.find(i => i.id === id);
      if (item) {
        item.tags = item.tags.filter(t => !tagSet.has(t));
      }
    }
    await this.saveGalleryData();
  }

  private async toggleFavorite(id: string): Promise<boolean> {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.favorite = !item.favorite;
      await this.saveGalleryData();
      return item.favorite;
    }
    return false;
  }

  private async deleteItems(ids: string[]): Promise<number> {
    const idSet = new Set(ids);
    const initialCount = this.items.length;
    this.items = this.items.filter(i => !idSet.has(i.id));
    await this.saveGalleryData();
    return initialCount - this.items.length;
  }

  private async getThumbnail(id: string): Promise<string | null> {
    // Check cache first
    if (this.thumbnailCache.has(id)) {
      return this.thumbnailCache.get(id)!;
    }

    const item = this.items.find(i => i.id === id);
    if (!item) return null;

    // For now, return the file path as base64 data URL
    // In production, you'd want to generate actual thumbnails
    try {
      const data = await fs.promises.readFile(item.path);
      const base64 = data.toString('base64');
      const mimeType = this.getMimeType(item.format.toLowerCase());
      const dataUrl = `data:${mimeType};base64,${base64}`;
      
      // Cache the result
      this.thumbnailCache.set(id, dataUrl);
      
      return dataUrl;
    } catch (error) {
      this.logger.error('[Gallery] Failed to get thumbnail:', error);
      return null;
    }
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
      tiff: 'image/tiff',
      tif: 'image/tiff',
    };
    return mimeTypes[format] || 'image/jpeg';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.saveGalleryData();
    this.thumbnailCache.clear();
    this.logger.info('[Gallery] Shutdown complete');
  }
}
