// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Gallery Viewer
// Premium image gallery with virtualized grid, smooth scrolling, keyboard nav
// No background scanning, no forced import, no re-encoding
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, nativeImage, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type GalleryViewMode = 'grid' | 'focus' | 'filmstrip' | 'list';
export type SortField = 'name' | 'date' | 'size' | 'type' | 'rating';
export type SortDirection = 'asc' | 'desc';

export interface GalleryImage {
  id: string;
  path: string;
  filename: string;
  extension: string;
  size: number;
  width?: number;
  height?: number;
  aspectRatio?: number;
  thumbnail?: string;
  createdAt: number;
  modifiedAt: number;
  addedAt: number;
  metadata: ImageMetadata;
  tags: string[];
  rating?: number;
  favorite: boolean;
  color?: string; // Dominant color
}

export interface ImageMetadata {
  format?: string;
  colorSpace?: string;
  hasAlpha?: boolean;
  bitDepth?: number;
  dpi?: number;
  // EXIF data
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  dateTaken?: number;
  gps?: { lat: number; lng: number };
}

export interface GalleryFolder {
  id: string;
  path: string;
  name: string;
  imageCount: number;
  subfolderCount: number;
  coverImage?: string;
  addedAt: number;
  lastScanned?: number;
}

export interface GallerySelection {
  images: string[];
  anchor?: string;
  lastSelected?: string;
}

export interface GalleryFilter {
  folder?: string;
  tags?: string[];
  favorite?: boolean;
  rating?: number;
  dateRange?: { start: number; end: number };
  sizeRange?: { min: number; max: number };
  dimensions?: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number };
  search?: string;
  extensions?: string[];
}

export interface GallerySort {
  field: SortField;
  direction: SortDirection;
}

export interface VirtualizedRange {
  startIndex: number;
  endIndex: number;
  overscan: number;
}

export interface GalleryStats {
  totalImages: number;
  totalFolders: number;
  totalSize: number;
  byExtension: Record<string, number>;
  topTags: { tag: string; count: number }[];
  favorites: number;
  averageRating: number;
}

export interface GalleryConfig {
  defaultView: GalleryViewMode;
  gridColumns: number;
  thumbnailSize: number;
  thumbnailQuality: number;
  showFilenames: boolean;
  showMetadata: boolean;
  showOverlay: boolean;
  sortBy: SortField;
  sortDirection: SortDirection;
  virtualizeThreshold: number;
  overscanCount: number;
  smoothScrolling: boolean;
  preloadAdjacent: number;
  enableZoom: boolean;
  zoomLevels: number[];
  loopNavigation: boolean;
}

// ===========================================================================
// SUPPORTED FORMATS
// ===========================================================================

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
  '.tiff', '.tif', '.ico', '.heic', '.heif', '.avif', '.raw',
  '.cr2', '.nef', '.arw', '.dng', // RAW formats
]);

const DESIGN_EXTENSIONS = new Set([
  '.psd', '.ai', '.sketch', '.fig', '.xd',
]);

// ===========================================================================
// GALLERY VIEWER
// ===========================================================================

class GalleryViewerClass extends EventEmitter {
  private images: Map<string, GalleryImage> = new Map();
  private folders: Map<string, GalleryFolder> = new Map();
  private thumbnailCache: Map<string, string> = new Map();
  private selection: GallerySelection = { images: [] };
  private currentFolder: string | null = null;
  private currentView: GalleryViewMode = 'grid';
  private focusedIndex = -1;
  private filter: GalleryFilter = {};
  private sort: GallerySort = { field: 'date', direction: 'desc' };
  private config: GalleryConfig;
  private dataPath = '';
  private thumbnailPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;

  constructor() {
    super();
    
    this.config = {
      defaultView: 'grid',
      gridColumns: 4,
      thumbnailSize: 200,
      thumbnailQuality: 80,
      showFilenames: true,
      showMetadata: false,
      showOverlay: true,
      sortBy: 'date',
      sortDirection: 'desc',
      virtualizeThreshold: 50,
      overscanCount: 5,
      smoothScrolling: true,
      preloadAdjacent: 3,
      enableZoom: true,
      zoomLevels: [1, 1.5, 2, 3, 4],
      loopNavigation: true,
    };
    
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'gallery');
    this.thumbnailPath = path.join(this.dataPath, 'thumbnails');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await fs.mkdir(this.thumbnailPath, { recursive: true });
      await this.loadConfig();
      await this.loadGalleryData();
      
      log.info(`[Gallery] Initialized with ${this.images.size} images`);
    } catch (error) {
      log.error('[Gallery] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Folder operations
    ipcMain.handle('gallery:openFolder', async (_event, folderPath: string) => {
      return this.openFolder(folderPath);
    });
    
    ipcMain.handle('gallery:addFolder', async (_event, folderPath: string) => {
      return this.addFolder(folderPath);
    });
    
    ipcMain.handle('gallery:removeFolder', async (_event, folderId: string) => {
      return this.removeFolder(folderId);
    });
    
    ipcMain.handle('gallery:getFolders', () => this.getFolders());
    
    // Image operations
    ipcMain.handle('gallery:getImages', (_event, filter?: GalleryFilter) => {
      return this.getImages(filter);
    });
    
    ipcMain.handle('gallery:getImage', (_event, imageId: string) => {
      return this.getImage(imageId);
    });
    
    ipcMain.handle('gallery:loadImage', async (_event, filePath: string) => {
      return this.loadImage(filePath);
    });
    
    ipcMain.handle('gallery:getFullImage', async (_event, imageId: string) => {
      return this.getFullImageData(imageId);
    });
    
    ipcMain.handle('gallery:getThumbnail', async (_event, imageId: string) => {
      return this.getThumbnail(imageId);
    });

    // Virtualization
    ipcMain.handle('gallery:getVirtualized', (_event, range: VirtualizedRange, filter?: GalleryFilter) => {
      return this.getVirtualizedImages(range, filter);
    });
    
    ipcMain.handle('gallery:getTotalCount', (_event, filter?: GalleryFilter) => {
      return this.getTotalCount(filter);
    });

    // View management
    ipcMain.handle('gallery:setView', (_event, view: GalleryViewMode) => {
      return this.setView(view);
    });
    
    ipcMain.handle('gallery:getView', () => this.currentView);

    // Selection
    ipcMain.handle('gallery:select', (_event, imageId: string, extend?: boolean, range?: boolean) => {
      return this.selectImage(imageId, extend, range);
    });
    
    ipcMain.handle('gallery:selectAll', () => this.selectAll());
    ipcMain.handle('gallery:clearSelection', () => this.clearSelection());
    ipcMain.handle('gallery:getSelection', () => this.selection);

    // Navigation
    ipcMain.handle('gallery:navigate', (_event, direction: 'next' | 'previous' | 'first' | 'last') => {
      return this.navigate(direction);
    });
    
    ipcMain.handle('gallery:goTo', (_event, index: number) => {
      return this.goToIndex(index);
    });
    
    ipcMain.handle('gallery:focus', (_event, imageId: string) => {
      return this.focusImage(imageId);
    });

    // Sorting & Filtering
    ipcMain.handle('gallery:setSort', (_event, sort: GallerySort) => {
      return this.setSort(sort);
    });
    
    ipcMain.handle('gallery:setFilter', (_event, filter: GalleryFilter) => {
      return this.setFilter(filter);
    });
    
    ipcMain.handle('gallery:clearFilter', () => this.clearFilter());

    // Metadata
    ipcMain.handle('gallery:updateMetadata', async (_event, imageId: string, updates: Partial<GalleryImage>) => {
      return this.updateImageMetadata(imageId, updates);
    });
    
    ipcMain.handle('gallery:setRating', async (_event, imageId: string, rating: number) => {
      return this.setRating(imageId, rating);
    });
    
    ipcMain.handle('gallery:toggleFavorite', async (_event, imageId: string) => {
      return this.toggleFavorite(imageId);
    });
    
    ipcMain.handle('gallery:addTags', async (_event, imageId: string, tags: string[]) => {
      return this.addTags(imageId, tags);
    });

    // Stats & Config
    ipcMain.handle('gallery:getStats', () => this.getStats());
    ipcMain.handle('gallery:getConfig', () => this.config);
    ipcMain.handle('gallery:updateConfig', async (_event, updates: Partial<GalleryConfig>) => {
      return this.updateConfig(updates);
    });

    // External actions
    ipcMain.handle('gallery:openInExplorer', async (_event, imageId: string) => {
      return this.openInExplorer(imageId);
    });
    
    ipcMain.handle('gallery:openWith', async (_event, imageId: string) => {
      return this.openWithDefaultApp(imageId);
    });
  }

  // -------------------------------------------------------------------------
  // FOLDER OPERATIONS
  // -------------------------------------------------------------------------

  async openFolder(folderPath: string): Promise<GalleryImage[]> {
    const absolutePath = path.isAbsolute(folderPath) ? folderPath : path.resolve(folderPath);
    
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        throw new Error('Not a directory');
      }
      
      this.currentFolder = absolutePath;
      
      // Load images from folder (on-demand, no background scanning)
      const images = await this.loadImagesFromFolder(absolutePath);
      
      this.emit('folderOpened', { path: absolutePath, count: images.length });
      log.info(`[Gallery] Opened folder: ${absolutePath} (${images.length} images)`);
      
      return images;
    } catch (error) {
      log.error(`[Gallery] Failed to open folder: ${folderPath}`, error);
      return [];
    }
  }

  async addFolder(folderPath: string): Promise<GalleryFolder | null> {
    const absolutePath = path.isAbsolute(folderPath) ? folderPath : path.resolve(folderPath);
    
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        return null;
      }
      
      // Check if already added
      for (const folder of this.folders.values()) {
        if (folder.path === absolutePath) {
          return folder;
        }
      }
      
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      const imageCount = entries.filter(e => 
        e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase())
      ).length;
      const subfolderCount = entries.filter(e => e.isDirectory()).length;
      
      const folder: GalleryFolder = {
        id: this.generateId(),
        path: absolutePath,
        name: path.basename(absolutePath),
        imageCount,
        subfolderCount,
        addedAt: Date.now(),
      };
      
      this.folders.set(folder.id, folder);
      await this.saveGalleryData();
      
      this.emit('folderAdded', folder);
      log.info(`[Gallery] Added folder: ${absolutePath}`);
      
      return folder;
    } catch (error) {
      log.error(`[Gallery] Failed to add folder: ${folderPath}`, error);
      return null;
    }
  }

  async removeFolder(folderId: string): Promise<boolean> {
    const folder = this.folders.get(folderId);
    if (!folder) return false;
    
    // Remove images from this folder
    for (const [imageId, image] of this.images) {
      if (image.path.startsWith(folder.path)) {
        this.images.delete(imageId);
      }
    }
    
    this.folders.delete(folderId);
    await this.saveGalleryData();
    
    this.emit('folderRemoved', folderId);
    log.info(`[Gallery] Removed folder: ${folder.path}`);
    
    return true;
  }

  getFolders(): GalleryFolder[] {
    return Array.from(this.folders.values());
  }

  // -------------------------------------------------------------------------
  // IMAGE LOADING
  // -------------------------------------------------------------------------

  private async loadImagesFromFolder(folderPath: string): Promise<GalleryImage[]> {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const images: GalleryImage[] = [];
    
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext) && !DESIGN_EXTENSIONS.has(ext)) continue;
      
      const filePath = path.join(folderPath, entry.name);
      const image = await this.loadImage(filePath);
      
      if (image) {
        images.push(image);
      }
    }
    
    return images;
  }

  async loadImage(filePath: string): Promise<GalleryImage | null> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    
    // Check if already loaded
    const existing = this.findImageByPath(absolutePath);
    if (existing) {
      return this.images.get(existing) || null;
    }
    
    try {
      const stat = await fs.stat(absolutePath);
      const ext = path.extname(absolutePath).toLowerCase();
      
      const image: GalleryImage = {
        id: this.generateId(),
        path: absolutePath,
        filename: path.basename(absolutePath),
        extension: ext,
        size: stat.size,
        createdAt: stat.birthtime.getTime(),
        modifiedAt: stat.mtime.getTime(),
        addedAt: Date.now(),
        metadata: {},
        tags: [],
        favorite: false,
      };
      
      // Get dimensions for images (not design files)
      if (IMAGE_EXTENSIONS.has(ext)) {
        const dimensions = await this.getImageDimensions(absolutePath);
        if (dimensions) {
          image.width = dimensions.width;
          image.height = dimensions.height;
          image.aspectRatio = dimensions.width / dimensions.height;
        }
      }
      
      this.images.set(image.id, image);
      
      // Generate thumbnail in background (don't block)
      this.generateThumbnail(image.id).catch((e: unknown) => { log.warn('[DEX]', e); });
      
      return image;
    } catch (error) {
      log.error(`[Gallery] Failed to load image: ${filePath}`, error);
      return null;
    }
  }

  private async getImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
    try {
      const img = nativeImage.createFromPath(filePath);
      if (img.isEmpty()) return null;
      return img.getSize();
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // THUMBNAILS
  // -------------------------------------------------------------------------

  async generateThumbnail(imageId: string): Promise<string | null> {
    const image = this.images.get(imageId);
    if (!image) return null;
    
    // Check cache
    const cached = this.thumbnailCache.get(imageId);
    if (cached) return cached;
    
    try {
      const img = nativeImage.createFromPath(image.path);
      if (img.isEmpty()) return null;
      
      const size = img.getSize();
      const targetSize = this.config.thumbnailSize;
      
      // Calculate resize dimensions maintaining aspect ratio
      let width = targetSize;
      let height = targetSize;
      
      if (size.width > size.height) {
        height = Math.round((targetSize / size.width) * size.height);
      } else {
        width = Math.round((targetSize / size.height) * size.width);
      }
      
      const resized = img.resize({ width, height });
      const buffer = resized.toJPEG(this.config.thumbnailQuality);
      const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      
      // Cache in memory
      this.thumbnailCache.set(imageId, dataUrl);
      
      // Save to disk
      const thumbPath = path.join(this.thumbnailPath, `${imageId}.jpg`);
      await fs.writeFile(thumbPath, buffer);
      
      // Update image record
      image.thumbnail = dataUrl;
      
      return dataUrl;
    } catch (error) {
      log.error(`[Gallery] Failed to generate thumbnail: ${imageId}`, error);
      return null;
    }
  }

  async getThumbnail(imageId: string): Promise<string | null> {
    // Check memory cache
    const cached = this.thumbnailCache.get(imageId);
    if (cached) return cached;
    
    // Check disk cache
    const thumbPath = path.join(this.thumbnailPath, `${imageId}.jpg`);
    try {
      const buffer = await fs.readFile(thumbPath);
      const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      this.thumbnailCache.set(imageId, dataUrl);
      return dataUrl;
    } catch {
      // Generate new thumbnail
      return this.generateThumbnail(imageId);
    }
  }

  // -------------------------------------------------------------------------
  // IMAGE RETRIEVAL
  // -------------------------------------------------------------------------

  getImages(filter?: GalleryFilter): GalleryImage[] {
    let images = Array.from(this.images.values());
    
    // Apply filter
    if (filter) {
      images = this.applyFilter(images, filter);
    } else if (Object.keys(this.filter).length > 0) {
      images = this.applyFilter(images, this.filter);
    }
    
    // Apply sort
    images = this.applySortToImages(images);
    
    return images;
  }

  getImage(imageId: string): GalleryImage | null {
    return this.images.get(imageId) || null;
  }

  async getFullImageData(imageId: string): Promise<string | null> {
    const image = this.images.get(imageId);
    if (!image) return null;
    
    try {
      const buffer = await fs.readFile(image.path);
      const mimeType = this.getMimeType(image.extension);
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      log.error(`[Gallery] Failed to get full image: ${imageId}`, error);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // VIRTUALIZATION
  // -------------------------------------------------------------------------

  getVirtualizedImages(range: VirtualizedRange, filter?: GalleryFilter): GalleryImage[] {
    const allImages = this.getImages(filter);
    
    const start = Math.max(0, range.startIndex - range.overscan);
    const end = Math.min(allImages.length, range.endIndex + range.overscan);
    
    return allImages.slice(start, end);
  }

  getTotalCount(filter?: GalleryFilter): number {
    return this.getImages(filter).length;
  }

  // -------------------------------------------------------------------------
  // VIEW MANAGEMENT
  // -------------------------------------------------------------------------

  setView(view: GalleryViewMode): GalleryViewMode {
    const previousView = this.currentView;
    this.currentView = view;
    
    this.emit('viewChanged', { previous: previousView, current: view });
    log.info(`[Gallery] View changed: ${previousView} -> ${view}`);
    
    return view;
  }

  // -------------------------------------------------------------------------
  // SELECTION
  // -------------------------------------------------------------------------

  selectImage(imageId: string, extend = false, range = false): GallerySelection {
    const images = this.getImages();
    const index = images.findIndex(img => img.id === imageId);
    
    if (index === -1) return this.selection;
    
    if (range && this.selection.anchor) {
      // Range selection
      const anchorIndex = images.findIndex(img => img.id === this.selection.anchor);
      if (anchorIndex !== -1) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        this.selection.images = images.slice(start, end + 1).map(img => img.id);
      }
    } else if (extend) {
      // Toggle selection
      const idx = this.selection.images.indexOf(imageId);
      if (idx === -1) {
        this.selection.images.push(imageId);
      } else {
        this.selection.images.splice(idx, 1);
      }
      this.selection.anchor = imageId;
    } else {
      // Single selection
      this.selection.images = [imageId];
      this.selection.anchor = imageId;
    }
    
    this.selection.lastSelected = imageId;
    this.emit('selectionChanged', this.selection);
    
    return this.selection;
  }

  selectAll(): GallerySelection {
    const images = this.getImages();
    this.selection.images = images.map(img => img.id);
    this.emit('selectionChanged', this.selection);
    return this.selection;
  }

  clearSelection(): GallerySelection {
    this.selection = { images: [] };
    this.emit('selectionChanged', this.selection);
    return this.selection;
  }

  // -------------------------------------------------------------------------
  // NAVIGATION
  // -------------------------------------------------------------------------

  navigate(direction: 'next' | 'previous' | 'first' | 'last'): GalleryImage | null {
    const images = this.getImages();
    if (images.length === 0) return null;
    
    let newIndex: number;
    
    switch (direction) {
      case 'next':
        newIndex = this.focusedIndex + 1;
        if (newIndex >= images.length) {
          newIndex = this.config.loopNavigation ? 0 : images.length - 1;
        }
        break;
        
      case 'previous':
        newIndex = this.focusedIndex - 1;
        if (newIndex < 0) {
          newIndex = this.config.loopNavigation ? images.length - 1 : 0;
        }
        break;
        
      case 'first':
        newIndex = 0;
        break;
        
      case 'last':
        newIndex = images.length - 1;
        break;
    }
    
    return this.goToIndex(newIndex);
  }

  goToIndex(index: number): GalleryImage | null {
    const images = this.getImages();
    
    if (index < 0 || index >= images.length) {
      return null;
    }
    
    this.focusedIndex = index;
    const image = images[index];
    
    this.emit('navigationChanged', { index, image });
    
    // Preload adjacent images
    this.preloadAdjacentImages(index);
    
    return image;
  }

  focusImage(imageId: string): GalleryImage | null {
    const images = this.getImages();
    const index = images.findIndex(img => img.id === imageId);
    
    if (index === -1) return null;
    
    return this.goToIndex(index);
  }

  private async preloadAdjacentImages(currentIndex: number): Promise<void> {
    const images = this.getImages();
    const preloadCount = this.config.preloadAdjacent;
    
    for (let offset = 1; offset <= preloadCount; offset++) {
      // Preload next
      const nextIndex = currentIndex + offset;
      if (nextIndex < images.length) {
        this.getThumbnail(images[nextIndex].id).catch((e: unknown) => { log.warn('[DEX]', e); });
      }
      
      // Preload previous
      const prevIndex = currentIndex - offset;
      if (prevIndex >= 0) {
        this.getThumbnail(images[prevIndex].id).catch((e: unknown) => { log.warn('[DEX]', e); });
      }
    }
  }

  // -------------------------------------------------------------------------
  // SORTING & FILTERING
  // -------------------------------------------------------------------------

  setSort(sort: GallerySort): GallerySort {
    this.sort = sort;
    this.emit('sortChanged', sort);
    return sort;
  }

  setFilter(filter: GalleryFilter): GalleryFilter {
    this.filter = filter;
    this.emit('filterChanged', filter);
    return filter;
  }

  clearFilter(): void {
    this.filter = {};
    this.emit('filterChanged', {});
  }

  private applyFilter(images: GalleryImage[], filter: GalleryFilter): GalleryImage[] {
    return images.filter(image => {
      // Folder filter
      if (filter.folder && !image.path.startsWith(filter.folder)) {
        return false;
      }
      
      // Tags filter
      if (filter.tags && filter.tags.length > 0) {
        if (!filter.tags.some(tag => image.tags.includes(tag))) {
          return false;
        }
      }
      
      // Favorite filter
      if (filter.favorite !== undefined && image.favorite !== filter.favorite) {
        return false;
      }
      
      // Rating filter
      if (filter.rating !== undefined) {
        if (!image.rating || image.rating < filter.rating) {
          return false;
        }
      }
      
      // Date range filter
      if (filter.dateRange) {
        if (image.createdAt < filter.dateRange.start || image.createdAt > filter.dateRange.end) {
          return false;
        }
      }
      
      // Size range filter
      if (filter.sizeRange) {
        if (filter.sizeRange.min && image.size < filter.sizeRange.min) return false;
        if (filter.sizeRange.max && image.size > filter.sizeRange.max) return false;
      }
      
      // Dimensions filter
      if (filter.dimensions) {
        if (filter.dimensions.minWidth && (!image.width || image.width < filter.dimensions.minWidth)) return false;
        if (filter.dimensions.minHeight && (!image.height || image.height < filter.dimensions.minHeight)) return false;
        if (filter.dimensions.maxWidth && image.width && image.width > filter.dimensions.maxWidth) return false;
        if (filter.dimensions.maxHeight && image.height && image.height > filter.dimensions.maxHeight) return false;
      }
      
      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        if (!image.filename.toLowerCase().includes(searchLower) &&
            !image.tags.some(tag => tag.toLowerCase().includes(searchLower))) {
          return false;
        }
      }
      
      // Extensions filter
      if (filter.extensions && filter.extensions.length > 0) {
        if (!filter.extensions.includes(image.extension)) {
          return false;
        }
      }
      
      return true;
    });
  }

  private applySortToImages(images: GalleryImage[]): GalleryImage[] {
    const { field, direction } = this.sort;
    const multiplier = direction === 'asc' ? 1 : -1;
    
    return images.sort((a, b) => {
      let comparison = 0;
      
      switch (field) {
        case 'name':
          comparison = a.filename.localeCompare(b.filename);
          break;
        case 'date':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'type':
          comparison = a.extension.localeCompare(b.extension);
          break;
        case 'rating':
          comparison = (a.rating || 0) - (b.rating || 0);
          break;
      }
      
      return comparison * multiplier;
    });
  }

  // -------------------------------------------------------------------------
  // METADATA UPDATES
  // -------------------------------------------------------------------------

  async updateImageMetadata(imageId: string, updates: Partial<GalleryImage>): Promise<GalleryImage | null> {
    const image = this.images.get(imageId);
    if (!image) return null;
    
    // Apply allowed updates
    if (updates.tags) image.tags = updates.tags;
    if (updates.rating !== undefined) image.rating = updates.rating;
    if (updates.favorite !== undefined) image.favorite = updates.favorite;
    
    await this.saveGalleryData();
    this.emit('imageUpdated', image);
    
    return image;
  }

  async setRating(imageId: string, rating: number): Promise<boolean> {
    const image = this.images.get(imageId);
    if (!image) return false;
    
    image.rating = Math.max(0, Math.min(5, rating));
    await this.saveGalleryData();
    this.emit('imageUpdated', image);
    
    return true;
  }

  async toggleFavorite(imageId: string): Promise<boolean> {
    const image = this.images.get(imageId);
    if (!image) return false;
    
    image.favorite = !image.favorite;
    await this.saveGalleryData();
    this.emit('imageUpdated', image);
    
    return image.favorite;
  }

  async addTags(imageId: string, tags: string[]): Promise<string[]> {
    const image = this.images.get(imageId);
    if (!image) return [];
    
    const newTags = tags.filter(tag => !image.tags.includes(tag));
    image.tags = [...image.tags, ...newTags];
    
    await this.saveGalleryData();
    this.emit('imageUpdated', image);
    
    return image.tags;
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): GalleryStats {
    const images = Array.from(this.images.values());
    
    const byExtension: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    let totalSize = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    let favorites = 0;
    
    for (const image of images) {
      // Extension counts
      byExtension[image.extension] = (byExtension[image.extension] || 0) + 1;
      
      // Tag counts
      for (const tag of image.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
      
      // Size
      totalSize += image.size;
      
      // Rating
      if (image.rating) {
        ratingSum += image.rating;
        ratingCount++;
      }
      
      // Favorites
      if (image.favorite) favorites++;
    }
    
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
    
    return {
      totalImages: images.length,
      totalFolders: this.folders.size,
      totalSize,
      byExtension,
      topTags,
      favorites,
      averageRating: ratingCount > 0 ? ratingSum / ratingCount : 0,
    };
  }

  // -------------------------------------------------------------------------
  // EXTERNAL ACTIONS
  // -------------------------------------------------------------------------

  async openInExplorer(imageId: string): Promise<boolean> {
    const image = this.images.get(imageId);
    if (!image) return false;
    
    shell.showItemInFolder(image.path);
    return true;
  }

  async openWithDefaultApp(imageId: string): Promise<boolean> {
    const image = this.images.get(imageId);
    if (!image) return false;
    
    await shell.openPath(image.path);
    return true;
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  async loadConfig(): Promise<void> {
    const configPath = path.join(this.dataPath, 'config.json');
    
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const saved = JSON.parse(data);
      this.config = { ...this.config, ...saved };
    } catch {
      // Use defaults
    }
  }

  async saveConfig(): Promise<void> {
    const configPath = path.join(this.dataPath, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
  }

  async updateConfig(updates: Partial<GalleryConfig>): Promise<GalleryConfig> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    this.emit('configUpdated', this.config);
    return this.config;
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadGalleryData(): Promise<void> {
    const dataPath = path.join(this.dataPath, 'gallery-data.json');
    
    try {
      const data = await fs.readFile(dataPath, 'utf-8');
      const saved = JSON.parse(data);
      
      if (saved.images) {
        this.images = new Map(saved.images.map((img: GalleryImage) => [img.id, img]));
      }
      
      if (saved.folders) {
        this.folders = new Map(saved.folders.map((f: GalleryFolder) => [f.id, f]));
      }
    } catch {
      // Start fresh
    }
  }

  private async saveGalleryData(): Promise<void> {
    const dataPath = path.join(this.dataPath, 'gallery-data.json');
    
    const data = {
      images: Array.from(this.images.values()),
      folders: Array.from(this.folders.values()),
    };
    
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private findImageByPath(filePath: string): string | null {
    for (const [id, image] of this.images) {
      if (image.path === filePath) return id;
    }
    return null;
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  // -------------------------------------------------------------------------
  // KEYBOARD NAVIGATION
  // -------------------------------------------------------------------------

  handleKeyPress(key: string, modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean }): boolean {
    switch (key) {
      case 'ArrowRight':
        this.navigate('next');
        return true;
        
      case 'ArrowLeft':
        this.navigate('previous');
        return true;
        
      case 'ArrowDown':
        if (this.currentView === 'grid') {
          this.goToIndex(this.focusedIndex + this.config.gridColumns);
        } else {
          this.navigate('next');
        }
        return true;
        
      case 'ArrowUp':
        if (this.currentView === 'grid') {
          this.goToIndex(this.focusedIndex - this.config.gridColumns);
        } else {
          this.navigate('previous');
        }
        return true;
        
      case 'Home':
        this.navigate('first');
        return true;
        
      case 'End':
        this.navigate('last');
        return true;
        
      case 'Enter':
      case 'Space':
        this.setView(this.currentView === 'focus' ? 'grid' : 'focus');
        return true;
        
      case 'Escape':
        if (this.currentView === 'focus') {
          this.setView('grid');
          return true;
        }
        break;
        
      case 'KeyA':
        if (modifiers.ctrl) {
          this.selectAll();
          return true;
        }
        break;
    }
    
    return false;
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    await this.saveGalleryData();
    await this.saveConfig();
    log.info('[Gallery] Shutdown complete');
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const GalleryViewer = new GalleryViewerClass();
export default GalleryViewer;
