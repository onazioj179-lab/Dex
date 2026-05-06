// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Unified Media Timeline
// Central media management with timeline view, cross-type organization
// Links audio, video, images, recordings in one navigable timeline
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type MediaType = 'audio' | 'video' | 'image' | 'recording' | 'document';
export type TimelineView = 'day' | 'week' | 'month' | 'year' | 'all';
export type SortOrder = 'newest' | 'oldest' | 'alphabetical' | 'type' | 'size';

export interface MediaItem {
  id: string;
  type: MediaType;
  path: string;
  filename: string;
  title: string;
  description?: string;
  duration?: number; // For audio/video
  width?: number; // For images/video
  height?: number; // For images/video
  size: number; // File size in bytes
  createdAt: number;
  modifiedAt: number;
  addedAt: number;
  accessedAt?: number;
  thumbnail?: string;
  tags: string[];
  favorite: boolean;
  rating?: number;
  color?: string; // Extracted dominant color
  metadata: Record<string, unknown>;
  collections: string[];
  linkedItems: string[]; // Related media items
  sourceId?: string; // Reference to audio/video player item
}

export interface MediaCollection {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  items: string[];
  isSmartCollection: boolean;
  smartRules?: SmartCollectionRule[];
  createdAt: number;
  updatedAt: number;
  color?: string;
  icon?: string;
}

export interface SmartCollectionRule {
  field: keyof MediaItem | 'date' | 'extension';
  operator: 'is' | 'contains' | 'startsWith' | 'before' | 'after' | 'between' | 'greaterThan' | 'lessThan';
  value: string | number | [number, number];
}

export interface TimelineEvent {
  id: string;
  date: number;
  items: MediaItem[];
  summary: {
    audio: number;
    video: number;
    image: number;
    recording: number;
    document: number;
  };
}

export interface TimelineRange {
  start: number;
  end: number;
  events: TimelineEvent[];
  totalItems: number;
}

export interface MediaFilter {
  types?: MediaType[];
  tags?: string[];
  collections?: string[];
  favorite?: boolean;
  dateRange?: { start: number; end: number };
  search?: string;
  minSize?: number;
  maxSize?: number;
  minDuration?: number;
  maxDuration?: number;
  hasLinkedItems?: boolean;
  sortBy?: SortOrder;
  limit?: number;
  offset?: number;
}

export interface MediaStats {
  totalItems: number;
  byType: Record<MediaType, number>;
  byMonth: Record<string, number>;
  totalSize: number;
  totalDuration: number;
  topTags: { tag: string; count: number }[];
  recentActivity: MediaItem[];
  favorites: number;
}

export interface TimelineConfig {
  defaultView: TimelineView;
  groupByDate: boolean;
  showThumbnails: boolean;
  thumbnailSize: 'small' | 'medium' | 'large';
  autoGenerateThumbnails: boolean;
  watchFolders: string[];
  excludePatterns: string[];
}

// ===========================================================================
// UNIFIED MEDIA TIMELINE
// ===========================================================================

class UnifiedMediaTimelineClass extends EventEmitter {
  private items: Map<string, MediaItem> = new Map();
  private collections: Map<string, MediaCollection> = new Map();
  private config: TimelineConfig;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;
  private fileWatchers: Map<string, fs.FileHandle | null> = new Map();

  private readonly typeExtensions: Record<MediaType, string[]> = {
    audio: ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma'],
    video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.flv'],
    image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.heic'],
    recording: ['.m4a', '.wav', '.webm', '.ogg'], // Screen/voice recordings
    document: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'],
  };

  constructor() {
    super();
    this.config = {
      defaultView: 'month',
      groupByDate: true,
      showThumbnails: true,
      thumbnailSize: 'medium',
      autoGenerateThumbnails: true,
      watchFolders: [],
      excludePatterns: ['node_modules', '.git', 'thumbs.db', '.ds_store'],
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'media-timeline');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await fs.mkdir(path.join(this.dataPath, 'thumbnails'), { recursive: true });
      await this.loadItems();
      await this.loadCollections();
      await this.loadConfig();
      
      log.info(`[MediaTimeline] Initialized with ${this.items.size} items`);
    } catch (error) {
      log.error('[MediaTimeline] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Timeline queries
    ipcMain.handle('timeline:getRange', async (_event, start: number, end: number) => {
      return this.getTimelineRange(start, end);
    });

    ipcMain.handle('timeline:getView', async (_event, view: TimelineView, date?: number) => {
      return this.getTimelineView(view, date);
    });

    ipcMain.handle('timeline:today', () => this.getTodayTimeline());
    ipcMain.handle('timeline:thisWeek', () => this.getThisWeekTimeline());
    ipcMain.handle('timeline:thisMonth', () => this.getThisMonthTimeline());

    // Item operations
    ipcMain.handle('timeline:getItem', (_event, id: string) => {
      return this.items.get(id);
    });

    ipcMain.handle('timeline:getItems', (_event, filter?: MediaFilter) => {
      return this.getItems(filter);
    });

    ipcMain.handle('timeline:addItem', async (_event, filePath: string, metadata?: Partial<MediaItem>) => {
      return this.addItem(filePath, metadata);
    });

    ipcMain.handle('timeline:addItems', async (_event, paths: string[]) => {
      return this.addItems(paths);
    });

    ipcMain.handle('timeline:updateItem', async (_event, id: string, data: Partial<MediaItem>) => {
      return this.updateItem(id, data);
    });

    ipcMain.handle('timeline:removeItem', async (_event, id: string) => {
      return this.removeItem(id);
    });

    ipcMain.handle('timeline:toggleFavorite', async (_event, id: string) => {
      return this.toggleFavorite(id);
    });

    ipcMain.handle('timeline:setRating', async (_event, id: string, rating: number) => {
      return this.setRating(id, rating);
    });

    ipcMain.handle('timeline:setTags', async (_event, id: string, tags: string[]) => {
      return this.setTags(id, tags);
    });

    // Linking
    ipcMain.handle('timeline:linkItems', async (_event, id1: string, id2: string) => {
      return this.linkItems(id1, id2);
    });

    ipcMain.handle('timeline:unlinkItems', async (_event, id1: string, id2: string) => {
      return this.unlinkItems(id1, id2);
    });

    ipcMain.handle('timeline:getLinkedItems', (_event, id: string) => {
      return this.getLinkedItems(id);
    });

    // Collections
    ipcMain.handle('timeline:createCollection', async (_event, name: string, itemIds?: string[]) => {
      return this.createCollection(name, itemIds);
    });

    ipcMain.handle('timeline:getCollections', () => this.getCollections());
    
    ipcMain.handle('timeline:getCollection', (_event, id: string) => {
      return this.collections.get(id);
    });

    ipcMain.handle('timeline:updateCollection', async (_event, id: string, data: Partial<MediaCollection>) => {
      return this.updateCollection(id, data);
    });

    ipcMain.handle('timeline:deleteCollection', async (_event, id: string) => {
      return this.deleteCollection(id);
    });

    ipcMain.handle('timeline:addToCollection', async (_event, collectionId: string, itemIds: string[]) => {
      return this.addToCollection(collectionId, itemIds);
    });

    ipcMain.handle('timeline:removeFromCollection', async (_event, collectionId: string, itemIds: string[]) => {
      return this.removeFromCollection(collectionId, itemIds);
    });

    ipcMain.handle('timeline:getCollectionItems', (_event, collectionId: string) => {
      return this.getCollectionItems(collectionId);
    });

    // Smart collections
    ipcMain.handle('timeline:createSmartCollection', async (_event, name: string, rules: SmartCollectionRule[]) => {
      return this.createSmartCollection(name, rules);
    });

    // Search
    ipcMain.handle('timeline:search', (_event, query: string, filter?: MediaFilter) => {
      return this.search(query, filter);
    });

    ipcMain.handle('timeline:searchByDate', (_event, date: number) => {
      return this.searchByDate(date);
    });

    // Import/scan
    ipcMain.handle('timeline:scanFolder', async (_event, folderPath: string, recursive?: boolean) => {
      return this.scanFolder(folderPath, recursive);
    });

    ipcMain.handle('timeline:importFromAudioPlayer', async () => {
      return this.importFromAudioPlayer();
    });

    ipcMain.handle('timeline:importFromVideoPlayer', async () => {
      return this.importFromVideoPlayer();
    });

    // Thumbnails
    ipcMain.handle('timeline:generateThumbnail', async (_event, id: string) => {
      return this.generateThumbnail(id);
    });

    ipcMain.handle('timeline:getThumbnail', async (_event, id: string) => {
      return this.getThumbnail(id);
    });

    // Stats
    ipcMain.handle('timeline:getStats', () => this.getStats());
    ipcMain.handle('timeline:getAllTags', () => this.getAllTags());
    ipcMain.handle('timeline:getTypeBreakdown', () => this.getTypeBreakdown());

    // Activity
    ipcMain.handle('timeline:getRecentActivity', (_event, limit?: number) => {
      return this.getRecentActivity(limit);
    });

    ipcMain.handle('timeline:recordAccess', async (_event, id: string) => {
      return this.recordAccess(id);
    });

    // Config
    ipcMain.handle('timeline:config', () => this.config);
    ipcMain.handle('timeline:setConfig', async (_event, config: Partial<TimelineConfig>) => {
      return this.setConfig(config);
    });

    // Watch folders
    ipcMain.handle('timeline:addWatchFolder', async (_event, folderPath: string) => {
      return this.addWatchFolder(folderPath);
    });

    ipcMain.handle('timeline:removeWatchFolder', async (_event, folderPath: string) => {
      return this.removeWatchFolder(folderPath);
    });

    // Export
    ipcMain.handle('timeline:export', async (_event, filter?: MediaFilter, format?: 'json' | 'csv') => {
      return this.exportTimeline(filter, format);
    });
  }

  // -------------------------------------------------------------------------
  // TIMELINE QUERIES
  // -------------------------------------------------------------------------

  getTimelineRange(start: number, end: number): TimelineRange {
    const items = Array.from(this.items.values())
      .filter(item => item.createdAt >= start && item.createdAt <= end)
      .sort((a, b) => b.createdAt - a.createdAt);

    // Group by day
    const eventMap = new Map<string, MediaItem[]>();
    
    for (const item of items) {
      const dayKey = new Date(item.createdAt).toDateString();
      if (!eventMap.has(dayKey)) {
        eventMap.set(dayKey, []);
      }
      eventMap.get(dayKey)!.push(item);
    }

    const events: TimelineEvent[] = Array.from(eventMap.entries())
      .map(([dayKey, dayItems]) => ({
        id: `event-${dayKey}`,
        date: new Date(dayKey).getTime(),
        items: dayItems,
        summary: this.summarizeItems(dayItems),
      }))
      .sort((a, b) => b.date - a.date);

    return {
      start,
      end,
      events,
      totalItems: items.length,
    };
  }

  getTimelineView(view: TimelineView, date?: number): TimelineRange {
    const now = date || Date.now();
    const d = new Date(now);
    
    let start: number;
    let end: number;

    switch (view) {
      case 'day':
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        end = start + 24 * 60 * 60 * 1000 - 1;
        break;
      case 'week':
        const dayOfWeek = d.getDay();
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek).getTime();
        end = start + 7 * 24 * 60 * 60 * 1000 - 1;
        break;
      case 'month':
        start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        break;
      case 'year':
        start = new Date(d.getFullYear(), 0, 1).getTime();
        end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
        break;
      case 'all':
      default:
        start = 0;
        end = Date.now();
        break;
    }

    return this.getTimelineRange(start, end);
  }

  getTodayTimeline(): TimelineRange {
    return this.getTimelineView('day');
  }

  getThisWeekTimeline(): TimelineRange {
    return this.getTimelineView('week');
  }

  getThisMonthTimeline(): TimelineRange {
    return this.getTimelineView('month');
  }

  private summarizeItems(items: MediaItem[]): TimelineEvent['summary'] {
    const summary = { audio: 0, video: 0, image: 0, recording: 0, document: 0 };
    for (const item of items) {
      summary[item.type]++;
    }
    return summary;
  }

  // -------------------------------------------------------------------------
  // ITEM OPERATIONS
  // -------------------------------------------------------------------------

  async addItem(filePath: string, metadata?: Partial<MediaItem>): Promise<MediaItem | null> {
    try {
      // Check if already exists
      const existing = Array.from(this.items.values()).find(i => i.path === filePath);
      if (existing) return existing;

      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const type = this.detectMediaType(ext);
      
      if (!type) return null;

      const id = `media-${++this.idCounter}-${Date.now()}`;

      const item: MediaItem = {
        id,
        type,
        path: filePath,
        filename: path.basename(filePath),
        title: metadata?.title || path.basename(filePath, ext),
        description: metadata?.description,
        size: stats.size,
        createdAt: stats.birthtime.getTime(),
        modifiedAt: stats.mtime.getTime(),
        addedAt: Date.now(),
        tags: metadata?.tags || [],
        favorite: metadata?.favorite || false,
        rating: metadata?.rating,
        metadata: metadata?.metadata || {},
        collections: [],
        linkedItems: [],
        sourceId: metadata?.sourceId,
      };

      this.items.set(id, item);
      await this.saveItem(item);

      // Generate thumbnail if enabled
      if (this.config.autoGenerateThumbnails && (type === 'image' || type === 'video')) {
        await this.generateThumbnail(id);
      }

      this.emit('item:added', item);
      return item;
    } catch (error) {
      log.error(`[MediaTimeline] Failed to add item ${filePath}:`, error);
      return null;
    }
  }

  async addItems(paths: string[]): Promise<{ added: number; failed: number }> {
    let added = 0;
    let failed = 0;

    for (const filePath of paths) {
      const item = await this.addItem(filePath);
      if (item) added++;
      else failed++;
    }

    return { added, failed };
  }

  async updateItem(id: string, data: Partial<MediaItem>): Promise<{ success: boolean }> {
    const item = this.items.get(id);
    if (!item) return { success: false };

    if (data.title !== undefined) item.title = data.title;
    if (data.description !== undefined) item.description = data.description;
    if (data.tags !== undefined) item.tags = data.tags;
    if (data.favorite !== undefined) item.favorite = data.favorite;
    if (data.rating !== undefined) item.rating = data.rating;
    if (data.metadata !== undefined) item.metadata = { ...item.metadata, ...data.metadata };

    await this.saveItem(item);
    this.emit('item:updated', item);

    return { success: true };
  }

  async removeItem(id: string): Promise<{ success: boolean }> {
    const item = this.items.get(id);
    if (!item) return { success: false };

    // Remove from collections
    for (const collection of this.collections.values()) {
      const index = collection.items.indexOf(id);
      if (index >= 0) {
        collection.items.splice(index, 1);
        await this.saveCollection(collection);
      }
    }

    // Remove links
    for (const linkedId of item.linkedItems) {
      const linked = this.items.get(linkedId);
      if (linked) {
        linked.linkedItems = linked.linkedItems.filter(i => i !== id);
        await this.saveItem(linked);
      }
    }

    // Delete item file
    const itemPath = path.join(this.dataPath, 'items', `${id}.json`);
    await fs.unlink(itemPath).catch((e: unknown) => { log.warn('[DEX]', e); });

    // Delete thumbnail
    const thumbPath = path.join(this.dataPath, 'thumbnails', `${id}.jpg`);
    await fs.unlink(thumbPath).catch((e: unknown) => { log.warn('[DEX]', e); });

    this.items.delete(id);
    this.emit('item:removed', id);

    return { success: true };
  }

  getItems(filter?: MediaFilter): MediaItem[] {
    let items = Array.from(this.items.values());

    if (filter) {
      if (filter.types?.length) {
        items = items.filter(i => filter.types!.includes(i.type));
      }

      if (filter.tags?.length) {
        items = items.filter(i => filter.tags!.some(tag => i.tags.includes(tag)));
      }

      if (filter.collections?.length) {
        items = items.filter(i => filter.collections!.some(c => i.collections.includes(c)));
      }

      if (filter.favorite !== undefined) {
        items = items.filter(i => i.favorite === filter.favorite);
      }

      if (filter.dateRange) {
        items = items.filter(i => 
          i.createdAt >= filter.dateRange!.start &&
          i.createdAt <= filter.dateRange!.end
        );
      }

      if (filter.search) {
        const q = filter.search.toLowerCase();
        items = items.filter(i =>
          i.title.toLowerCase().includes(q) ||
          i.filename.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.tags.some(t => t.toLowerCase().includes(q))
        );
      }

      if (filter.minSize !== undefined) {
        items = items.filter(i => i.size >= filter.minSize!);
      }

      if (filter.maxSize !== undefined) {
        items = items.filter(i => i.size <= filter.maxSize!);
      }

      if (filter.minDuration !== undefined) {
        items = items.filter(i => (i.duration || 0) >= filter.minDuration!);
      }

      if (filter.maxDuration !== undefined) {
        items = items.filter(i => (i.duration || 0) <= filter.maxDuration!);
      }

      if (filter.hasLinkedItems !== undefined) {
        items = items.filter(i => (i.linkedItems.length > 0) === filter.hasLinkedItems);
      }

      // Sort
      switch (filter.sortBy) {
        case 'newest':
          items.sort((a, b) => b.createdAt - a.createdAt);
          break;
        case 'oldest':
          items.sort((a, b) => a.createdAt - b.createdAt);
          break;
        case 'alphabetical':
          items.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'type':
          items.sort((a, b) => a.type.localeCompare(b.type));
          break;
        case 'size':
          items.sort((a, b) => b.size - a.size);
          break;
        default:
          items.sort((a, b) => b.createdAt - a.createdAt);
      }

      // Pagination
      if (filter.offset !== undefined) {
        items = items.slice(filter.offset);
      }

      if (filter.limit !== undefined) {
        items = items.slice(0, filter.limit);
      }
    }

    return items;
  }

  async toggleFavorite(id: string): Promise<{ success: boolean; favorite: boolean }> {
    const item = this.items.get(id);
    if (!item) return { success: false, favorite: false };

    item.favorite = !item.favorite;
    await this.saveItem(item);

    this.emit('item:updated', item);
    return { success: true, favorite: item.favorite };
  }

  async setRating(id: string, rating: number): Promise<{ success: boolean }> {
    const item = this.items.get(id);
    if (!item) return { success: false };

    item.rating = Math.max(1, Math.min(5, rating));
    await this.saveItem(item);

    this.emit('item:updated', item);
    return { success: true };
  }

  async setTags(id: string, tags: string[]): Promise<{ success: boolean }> {
    const item = this.items.get(id);
    if (!item) return { success: false };

    item.tags = tags;
    await this.saveItem(item);

    this.emit('item:updated', item);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // LINKING
  // -------------------------------------------------------------------------

  async linkItems(id1: string, id2: string): Promise<{ success: boolean }> {
    const item1 = this.items.get(id1);
    const item2 = this.items.get(id2);
    if (!item1 || !item2) return { success: false };

    if (!item1.linkedItems.includes(id2)) {
      item1.linkedItems.push(id2);
    }
    if (!item2.linkedItems.includes(id1)) {
      item2.linkedItems.push(id1);
    }

    await this.saveItem(item1);
    await this.saveItem(item2);

    this.emit('items:linked', { id1, id2 });
    return { success: true };
  }

  async unlinkItems(id1: string, id2: string): Promise<{ success: boolean }> {
    const item1 = this.items.get(id1);
    const item2 = this.items.get(id2);
    if (!item1 || !item2) return { success: false };

    item1.linkedItems = item1.linkedItems.filter(i => i !== id2);
    item2.linkedItems = item2.linkedItems.filter(i => i !== id1);

    await this.saveItem(item1);
    await this.saveItem(item2);

    this.emit('items:unlinked', { id1, id2 });
    return { success: true };
  }

  getLinkedItems(id: string): MediaItem[] {
    const item = this.items.get(id);
    if (!item) return [];

    return item.linkedItems
      .map(linkedId => this.items.get(linkedId))
      .filter((i): i is MediaItem => i !== undefined);
  }

  // -------------------------------------------------------------------------
  // COLLECTIONS
  // -------------------------------------------------------------------------

  async createCollection(name: string, itemIds?: string[]): Promise<MediaCollection> {
    const id = `collection-${++this.idCounter}-${Date.now()}`;
    const now = Date.now();

    const collection: MediaCollection = {
      id,
      name,
      items: itemIds || [],
      isSmartCollection: false,
      createdAt: now,
      updatedAt: now,
    };

    // Update items
    for (const itemId of collection.items) {
      const item = this.items.get(itemId);
      if (item && !item.collections.includes(id)) {
        item.collections.push(id);
        await this.saveItem(item);
      }
    }

    this.collections.set(id, collection);
    await this.saveCollection(collection);

    this.emit('collection:created', collection);
    return collection;
  }

  getCollections(): MediaCollection[] {
    return Array.from(this.collections.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async updateCollection(id: string, data: Partial<MediaCollection>): Promise<{ success: boolean }> {
    const collection = this.collections.get(id);
    if (!collection) return { success: false };

    if (data.name !== undefined) collection.name = data.name;
    if (data.description !== undefined) collection.description = data.description;
    if (data.coverImage !== undefined) collection.coverImage = data.coverImage;
    if (data.color !== undefined) collection.color = data.color;
    if (data.icon !== undefined) collection.icon = data.icon;

    collection.updatedAt = Date.now();
    await this.saveCollection(collection);

    this.emit('collection:updated', collection);
    return { success: true };
  }

  async deleteCollection(id: string): Promise<{ success: boolean }> {
    const collection = this.collections.get(id);
    if (!collection) return { success: false };

    // Remove collection reference from items
    for (const itemId of collection.items) {
      const item = this.items.get(itemId);
      if (item) {
        item.collections = item.collections.filter(c => c !== id);
        await this.saveItem(item);
      }
    }

    const collectionPath = path.join(this.dataPath, 'collections', `${id}.json`);
    await fs.unlink(collectionPath).catch((e: unknown) => { log.warn('[DEX]', e); });

    this.collections.delete(id);
    this.emit('collection:deleted', id);

    return { success: true };
  }

  async addToCollection(collectionId: string, itemIds: string[]): Promise<{ success: boolean }> {
    const collection = this.collections.get(collectionId);
    if (!collection || collection.isSmartCollection) return { success: false };

    for (const itemId of itemIds) {
      const item = this.items.get(itemId);
      if (item && !collection.items.includes(itemId)) {
        collection.items.push(itemId);
        if (!item.collections.includes(collectionId)) {
          item.collections.push(collectionId);
          await this.saveItem(item);
        }
      }
    }

    collection.updatedAt = Date.now();
    await this.saveCollection(collection);

    this.emit('collection:updated', collection);
    return { success: true };
  }

  async removeFromCollection(collectionId: string, itemIds: string[]): Promise<{ success: boolean }> {
    const collection = this.collections.get(collectionId);
    if (!collection || collection.isSmartCollection) return { success: false };

    collection.items = collection.items.filter(id => !itemIds.includes(id));

    for (const itemId of itemIds) {
      const item = this.items.get(itemId);
      if (item) {
        item.collections = item.collections.filter(c => c !== collectionId);
        await this.saveItem(item);
      }
    }

    collection.updatedAt = Date.now();
    await this.saveCollection(collection);

    this.emit('collection:updated', collection);
    return { success: true };
  }

  getCollectionItems(collectionId: string): MediaItem[] {
    const collection = this.collections.get(collectionId);
    if (!collection) return [];

    if (collection.isSmartCollection && collection.smartRules) {
      return this.evaluateSmartCollection(collection);
    }

    return collection.items
      .map(id => this.items.get(id))
      .filter((i): i is MediaItem => i !== undefined);
  }

  async createSmartCollection(name: string, rules: SmartCollectionRule[]): Promise<MediaCollection> {
    const collection = await this.createCollection(name);
    collection.isSmartCollection = true;
    collection.smartRules = rules;
    
    await this.saveCollection(collection);
    return collection;
  }

  private evaluateSmartCollection(collection: MediaCollection): MediaItem[] {
    if (!collection.smartRules?.length) return [];

    return Array.from(this.items.values())
      .filter(item => {
        return collection.smartRules!.every(rule => {
          return this.evaluateRule(item, rule);
        });
      });
  }

  private evaluateRule(item: MediaItem, rule: SmartCollectionRule): boolean {
    let value: unknown;

    if (rule.field === 'date') {
      value = item.createdAt;
    } else if (rule.field === 'extension') {
      value = path.extname(item.filename).toLowerCase();
    } else {
      value = item[rule.field];
    }

    switch (rule.operator) {
      case 'is':
        return value === rule.value;
      case 'contains':
        return String(value).toLowerCase().includes(String(rule.value).toLowerCase());
      case 'startsWith':
        return String(value).toLowerCase().startsWith(String(rule.value).toLowerCase());
      case 'before':
        return Number(value) < Number(rule.value);
      case 'after':
        return Number(value) > Number(rule.value);
      case 'between':
        if (Array.isArray(rule.value)) {
          return Number(value) >= rule.value[0] && Number(value) <= rule.value[1];
        }
        return false;
      case 'greaterThan':
        return Number(value) > Number(rule.value);
      case 'lessThan':
        return Number(value) < Number(rule.value);
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // SEARCH
  // -------------------------------------------------------------------------

  search(query: string, filter?: MediaFilter): MediaItem[] {
    return this.getItems({ ...filter, search: query });
  }

  searchByDate(date: number): MediaItem[] {
    const dayStart = new Date(date).setHours(0, 0, 0, 0);
    const dayEnd = new Date(date).setHours(23, 59, 59, 999);

    return this.getItems({
      dateRange: { start: dayStart, end: dayEnd },
    });
  }

  // -------------------------------------------------------------------------
  // IMPORT/SCAN
  // -------------------------------------------------------------------------

  async scanFolder(folderPath: string, recursive = true): Promise<{ added: number; failed: number }> {
    const files: string[] = [];

    const scan = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // Check exclude patterns
          if (this.config.excludePatterns.some(p => 
            entry.name.toLowerCase().includes(p.toLowerCase())
          )) {
            continue;
          }

          if (entry.isDirectory() && recursive) {
            await scan(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (this.detectMediaType(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        log.error(`[MediaTimeline] Failed to scan ${dir}:`, error);
      }
    };

    await scan(folderPath);
    return this.addItems(files);
  }

  async importFromAudioPlayer(): Promise<{ added: number }> {
    // This would integrate with AudioPlayerSystem
    // For now, emit event for external handling
    this.emit('import:audio');
    return { added: 0 };
  }

  async importFromVideoPlayer(): Promise<{ added: number }> {
    // This would integrate with VideoPlayerSystem
    this.emit('import:video');
    return { added: 0 };
  }

  // -------------------------------------------------------------------------
  // THUMBNAILS
  // -------------------------------------------------------------------------

  async generateThumbnail(id: string): Promise<{ success: boolean; path?: string }> {
    const item = this.items.get(id);
    if (!item) return { success: false };

    // Thumbnail generation would use sharp for images, ffmpeg for video
    // For now, just mark that thumbnail should exist
    const thumbPath = path.join(this.dataPath, 'thumbnails', `${id}.jpg`);
    item.thumbnail = thumbPath;
    
    await this.saveItem(item);
    this.notifyRenderer('timeline:thumbnailGenerated', { id, path: thumbPath });

    return { success: true, path: thumbPath };
  }

  async getThumbnail(id: string): Promise<string | null> {
    const item = this.items.get(id);
    if (!item) return null;

    if (item.thumbnail) {
      try {
        await fs.access(item.thumbnail);
        return item.thumbnail;
      } catch {
        // Thumbnail doesn't exist
        return null;
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): MediaStats {
    const items = Array.from(this.items.values());
    
    const byType: Record<MediaType, number> = {
      audio: 0,
      video: 0,
      image: 0,
      recording: 0,
      document: 0,
    };

    const byMonth: Record<string, number> = {};
    const tagCounts = new Map<string, number>();
    let totalSize = 0;
    let totalDuration = 0;

    for (const item of items) {
      byType[item.type]++;
      totalSize += item.size;
      totalDuration += item.duration || 0;

      const monthKey = new Date(item.createdAt).toISOString().slice(0, 7);
      byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;

      for (const tag of item.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      totalItems: items.length,
      byType,
      byMonth,
      totalSize,
      totalDuration,
      topTags,
      recentActivity: this.getRecentActivity(10),
      favorites: items.filter(i => i.favorite).length,
    };
  }

  getAllTags(): { tag: string; count: number }[] {
    const tagCounts = new Map<string, number>();
    
    for (const item of this.items.values()) {
      for (const tag of item.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  getTypeBreakdown(): { type: MediaType; count: number; size: number }[] {
    const breakdown = new Map<MediaType, { count: number; size: number }>();
    
    for (const item of this.items.values()) {
      if (!breakdown.has(item.type)) {
        breakdown.set(item.type, { count: 0, size: 0 });
      }
      const data = breakdown.get(item.type)!;
      data.count++;
      data.size += item.size;
    }

    return Array.from(breakdown.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count);
  }

  // -------------------------------------------------------------------------
  // ACTIVITY
  // -------------------------------------------------------------------------

  getRecentActivity(limit = 20): MediaItem[] {
    return Array.from(this.items.values())
      .filter(i => i.accessedAt)
      .sort((a, b) => (b.accessedAt || 0) - (a.accessedAt || 0))
      .slice(0, limit);
  }

  async recordAccess(id: string): Promise<{ success: boolean }> {
    const item = this.items.get(id);
    if (!item) return { success: false };

    item.accessedAt = Date.now();
    await this.saveItem(item);

    this.emit('item:accessed', item);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // WATCH FOLDERS
  // -------------------------------------------------------------------------

  async addWatchFolder(folderPath: string): Promise<{ success: boolean }> {
    if (this.config.watchFolders.includes(folderPath)) {
      return { success: true };
    }

    this.config.watchFolders.push(folderPath);
    await this.saveConfig();

    // Initial scan
    await this.scanFolder(folderPath);

    return { success: true };
  }

  async removeWatchFolder(folderPath: string): Promise<{ success: boolean }> {
    const index = this.config.watchFolders.indexOf(folderPath);
    if (index === -1) return { success: false };

    this.config.watchFolders.splice(index, 1);
    await this.saveConfig();

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // EXPORT
  // -------------------------------------------------------------------------

  async exportTimeline(filter?: MediaFilter, format: 'json' | 'csv' = 'json'): Promise<string> {
    const items = this.getItems(filter);

    if (format === 'csv') {
      const headers = ['id', 'type', 'title', 'filename', 'path', 'size', 'createdAt', 'tags'];
      const rows = items.map(item => [
        item.id,
        item.type,
        `"${item.title.replace(/"/g, '""')}"`,
        `"${item.filename.replace(/"/g, '""')}"`,
        `"${item.path.replace(/"/g, '""')}"`,
        item.size,
        new Date(item.createdAt).toISOString(),
        `"${item.tags.join(', ')}"`,
      ].join(','));

      return [headers.join(','), ...rows].join('\n');
    }

    return JSON.stringify(items, null, 2);
  }

  // -------------------------------------------------------------------------
  // CONFIG
  // -------------------------------------------------------------------------

  async setConfig(config: Partial<TimelineConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private detectMediaType(ext: string): MediaType | null {
    for (const [type, extensions] of Object.entries(this.typeExtensions)) {
      if (extensions.includes(ext)) {
        return type as MediaType;
      }
    }
    return null;
  }

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadItems(): Promise<void> {
    try {
      const itemsPath = path.join(this.dataPath, 'items');
      await fs.mkdir(itemsPath, { recursive: true });
      
      const files = await fs.readdir(itemsPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(itemsPath, file), 'utf-8');
            const item = JSON.parse(data) as MediaItem;
            this.items.set(item.id, item);
            
            const match = item.id.match(/media-(\d+)-/);
            if (match) {
              this.idCounter = Math.max(this.idCounter, parseInt(match[1]));
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch (error) {
      log.error('[MediaTimeline] Failed to load items:', error);
    }
  }

  private async saveItem(item: MediaItem): Promise<void> {
    try {
      const itemsPath = path.join(this.dataPath, 'items');
      await fs.mkdir(itemsPath, { recursive: true });
      
      const itemPath = path.join(itemsPath, `${item.id}.json`);
      await fs.writeFile(itemPath, JSON.stringify(item, null, 2));
    } catch (error) {
      log.error('[MediaTimeline] Failed to save item:', error);
    }
  }

  private async loadCollections(): Promise<void> {
    try {
      const collectionsPath = path.join(this.dataPath, 'collections');
      await fs.mkdir(collectionsPath, { recursive: true });
      
      const files = await fs.readdir(collectionsPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(collectionsPath, file), 'utf-8');
            const collection = JSON.parse(data) as MediaCollection;
            this.collections.set(collection.id, collection);
            
            const match = collection.id.match(/collection-(\d+)-/);
            if (match) {
              this.idCounter = Math.max(this.idCounter, parseInt(match[1]));
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch (error) {
      log.error('[MediaTimeline] Failed to load collections:', error);
    }
  }

  private async saveCollection(collection: MediaCollection): Promise<void> {
    try {
      const collectionsPath = path.join(this.dataPath, 'collections');
      await fs.mkdir(collectionsPath, { recursive: true });
      
      const collectionPath = path.join(collectionsPath, `${collection.id}.json`);
      await fs.writeFile(collectionPath, JSON.stringify(collection, null, 2));
    } catch (error) {
      log.error('[MediaTimeline] Failed to save collection:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      const data = await fs.readFile(configPath, 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[MediaTimeline] Failed to save config:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    await this.saveConfig();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const UnifiedMediaTimeline = new UnifiedMediaTimelineClass();
export default UnifiedMediaTimeline;
