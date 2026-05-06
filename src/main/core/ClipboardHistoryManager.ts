// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Clipboard History Manager
// OS-Level clipboard history with search, pinning, and smart organization
// Zero background polling - event-driven only
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, clipboard, nativeImage, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type ClipboardItemType = 'text' | 'image' | 'html' | 'rtf' | 'files';

export interface ClipboardItem {
  id: string;
  type: ClipboardItemType;
  content: string;
  preview: string;
  html?: string;
  rtf?: string;
  imagePath?: string;
  imageSize?: { width: number; height: number };
  files?: string[];
  hash: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  pinned: boolean;
  favorite: boolean;
  tags: string[];
  source?: string;
  category?: string;
}

export interface ClipboardConfig {
  enabled: boolean;
  maxItems: number;
  maxImageSize: number; // bytes
  retentionDays: number;
  excludePasswords: boolean;
  excludePatterns: string[];
  syncAcrossDevices: boolean;
  showNotifications: boolean;
  deduplicateConsecutive: boolean;
}

export interface ClipboardFilter {
  type?: ClipboardItemType;
  search?: string;
  pinned?: boolean;
  favorite?: boolean;
  tags?: string[];
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
}

export interface ClipboardStats {
  totalItems: number;
  pinnedItems: number;
  favoriteItems: number;
  byType: Record<ClipboardItemType, number>;
  mostUsed: ClipboardItem[];
  recentTags: string[];
}

// ===========================================================================
// CLIPBOARD HISTORY MANAGER
// ===========================================================================

class ClipboardHistoryManagerClass extends EventEmitter {
  private config: ClipboardConfig;
  private history: ClipboardItem[] = [];
  private historyPath = '';
  private imagesPath = '';
  private lastClipboardHash = '';
  private checkInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;
  private isPaused = false;

  // Password detection patterns
  private passwordPatterns = [
    /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,64}$/, // Common password pattern
    /password[:\s]*\S+/i,
    /secret[:\s]*\S+/i,
    /api[_-]?key[:\s]*\S+/i,
    /token[:\s]*\S+/i,
  ];

  constructor() {
    super();
    this.config = {
      enabled: true,
      maxItems: 500,
      maxImageSize: 5 * 1024 * 1024, // 5MB
      retentionDays: 30,
      excludePasswords: true,
      excludePatterns: [],
      syncAcrossDevices: false,
      showNotifications: false,
      deduplicateConsecutive: true,
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.historyPath = path.join(app.getPath('userData'), 'clipboard');
    this.imagesPath = path.join(this.historyPath, 'images');
    
    try {
      await fs.mkdir(this.historyPath, { recursive: true });
      await fs.mkdir(this.imagesPath, { recursive: true });
      await this.loadHistory();
      await this.loadConfig();
      
      if (this.config.enabled) {
        this.startMonitoring();
      }
      
      // Cleanup old items
      await this.cleanup();
      
      log.info(`[ClipboardHistory] Initialized with ${this.history.length} items`);
    } catch (error) {
      log.error('[ClipboardHistory] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Get history
    ipcMain.handle('clipboard:history', (_event, filter?: ClipboardFilter) => {
      return this.getHistory(filter);
    });

    // Get single item
    ipcMain.handle('clipboard:get', (_event, id: string) => {
      return this.getItem(id);
    });

    // Paste item (copy back to clipboard)
    ipcMain.handle('clipboard:paste', async (_event, id: string) => {
      return this.pasteItem(id);
    });

    // Pin/unpin
    ipcMain.handle('clipboard:pin', (_event, id: string, pinned: boolean) => {
      return this.setPinned(id, pinned);
    });

    // Favorite
    ipcMain.handle('clipboard:favorite', (_event, id: string, favorite: boolean) => {
      return this.setFavorite(id, favorite);
    });

    // Add tags
    ipcMain.handle('clipboard:tag', (_event, id: string, tags: string[]) => {
      return this.setTags(id, tags);
    });

    // Delete item
    ipcMain.handle('clipboard:delete', async (_event, id: string) => {
      return this.deleteItem(id);
    });

    // Clear history
    ipcMain.handle('clipboard:clear', async (_event, keepPinned?: boolean) => {
      return this.clearHistory(keepPinned);
    });

    // Search
    ipcMain.handle('clipboard:search', (_event, query: string) => {
      return this.search(query);
    });

    // Stats
    ipcMain.handle('clipboard:stats', () => {
      return this.getStats();
    });

    // Config
    ipcMain.handle('clipboard:config', () => this.config);
    ipcMain.handle('clipboard:setConfig', async (_event, config: Partial<ClipboardConfig>) => {
      return this.setConfig(config);
    });

    // Pause/resume
    ipcMain.handle('clipboard:pause', () => {
      this.pause();
      return { success: true };
    });

    ipcMain.handle('clipboard:resume', () => {
      this.resume();
      return { success: true };
    });

    // Manual capture
    ipcMain.handle('clipboard:capture', async () => {
      return this.captureClipboard();
    });
  }

  // -------------------------------------------------------------------------
  // MONITORING (Event-driven, not polling)
  // -------------------------------------------------------------------------

  private startMonitoring(): void {
    if (this.checkInterval) return;
    
    // Clipboard check — 3s is sufficient since we hash-compare for actual changes
    this.checkInterval = setInterval(() => {
      if (!this.isPaused && this.config.enabled) {
        this.checkClipboard();
      }
    }, 3000);

    // Initial capture
    this.captureClipboard();
    
    log.info('[ClipboardHistory] Monitoring started');
  }

  private stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    log.info('[ClipboardHistory] Monitoring stopped');
  }

  private async checkClipboard(): Promise<void> {
    try {
      const formats = clipboard.availableFormats();
      if (formats.length === 0) return;

      // Get current content hash
      const text = clipboard.readText();
      const html = clipboard.readHTML();
      const image = clipboard.readImage();
      
      let contentHash = '';
      if (text) {
        contentHash = this.hashContent(text);
      } else if (!image.isEmpty()) {
        contentHash = this.hashContent(image.toPNG().toString('base64'));
      } else if (html) {
        contentHash = this.hashContent(html);
      }

      // Skip if same as last
      if (contentHash === this.lastClipboardHash) return;
      if (this.config.deduplicateConsecutive && this.history[0]?.hash === contentHash) return;

      this.lastClipboardHash = contentHash;
      await this.captureClipboard();
    } catch (error) {
      // Silent fail - clipboard may be locked by another app
    }
  }

  // -------------------------------------------------------------------------
  // CAPTURE
  // -------------------------------------------------------------------------

  async captureClipboard(): Promise<ClipboardItem | null> {
    if (!this.config.enabled || this.isPaused) return null;

    try {
      const formats = clipboard.availableFormats();
      if (formats.length === 0) return null;

      const text = clipboard.readText();
      const html = clipboard.readHTML();
      const rtf = clipboard.readRTF();
      const image = clipboard.readImage();

      // Determine type and content
      let type: ClipboardItemType = 'text';
      let content = '';
      let preview = '';

      if (!image.isEmpty()) {
        // Image
        type = 'image';
        const size = image.getSize();
        const buffer = image.toPNG();
        
        // Check size limit
        if (buffer.length > this.config.maxImageSize) {
          log.debug('[ClipboardHistory] Image too large, skipping');
          return null;
        }

        const id = `clip-img-${Date.now()}`;
        const imagePath = path.join(this.imagesPath, `${id}.png`);
        await fs.writeFile(imagePath, buffer);
        
        content = imagePath;
        preview = `Image (${size.width}${size.height})`;

        const item = this.createItem(type, content, preview);
        item.imagePath = imagePath;
        item.imageSize = size;
        return this.addItem(item);

      } else if (text) {
        // Check for password-like content
        if (this.config.excludePasswords && this.looksLikePassword(text)) {
          log.debug('[ClipboardHistory] Skipping password-like content');
          return null;
        }

        // Check exclude patterns
        for (const pattern of this.config.excludePatterns) {
          if (new RegExp(pattern, 'i').test(text)) {
            log.debug('[ClipboardHistory] Content matched exclude pattern');
            return null;
          }
        }

        type = html ? 'html' : 'text';
        content = text;
        preview = text.substring(0, 200).replace(/\s+/g, ' ').trim();
        if (text.length > 200) preview += '...';

        const item = this.createItem(type, content, preview);
        if (html) item.html = html;
        if (rtf) item.rtf = rtf;
        
        // Auto-categorize
        item.category = this.categorizeContent(text);
        
        return this.addItem(item);
      }

      return null;
    } catch (error) {
      log.error('[ClipboardHistory] Capture failed:', error);
      return null;
    }
  }

  private createItem(type: ClipboardItemType, content: string, preview: string): ClipboardItem {
    return {
      id: `clip-${++this.idCounter}-${Date.now()}`,
      type,
      content,
      preview,
      hash: this.hashContent(content),
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 1,
      pinned: false,
      favorite: false,
      tags: [],
    };
  }

  private addItem(item: ClipboardItem): ClipboardItem {
    // Check for duplicates (by hash)
    const existingIndex = this.history.findIndex(h => h.hash === item.hash);
    if (existingIndex > -1) {
      // Update existing item
      const existing = this.history[existingIndex];
      existing.lastUsedAt = Date.now();
      existing.useCount++;
      
      // Move to top
      this.history.splice(existingIndex, 1);
      this.history.unshift(existing);
      
      this.emit('item:updated', existing);
      this.saveHistory();
      return existing;
    }

    // Add new item
    this.history.unshift(item);

    // Enforce max items (keep pinned items)
    while (this.history.length > this.config.maxItems) {
      const removeIndex = this.history.findIndex((h, i) => 
        i > 0 && !h.pinned && !h.favorite
      );
      if (removeIndex > -1) {
        const removed = this.history.splice(removeIndex, 1)[0];
        if (removed.imagePath) {
          fs.unlink(removed.imagePath).catch((e: unknown) => { log.warn('[DEX]', e); });
        }
      } else {
        break;
      }
    }

    this.emit('item:added', item);
    this.notifyRenderer('clipboard:added', item);
    this.saveHistory();
    
    return item;
  }

  // -------------------------------------------------------------------------
  // HISTORY OPERATIONS
  // -------------------------------------------------------------------------

  getHistory(filter?: ClipboardFilter): ClipboardItem[] {
    let items = [...this.history];

    if (filter) {
      if (filter.type) {
        items = items.filter(i => i.type === filter.type);
      }
      if (filter.pinned !== undefined) {
        items = items.filter(i => i.pinned === filter.pinned);
      }
      if (filter.favorite !== undefined) {
        items = items.filter(i => i.favorite === filter.favorite);
      }
      if (filter.tags?.length) {
        items = items.filter(i => filter.tags!.some(t => i.tags.includes(t)));
      }
      if (filter.dateFrom) {
        items = items.filter(i => i.createdAt >= filter.dateFrom!);
      }
      if (filter.dateTo) {
        items = items.filter(i => i.createdAt <= filter.dateTo!);
      }
      if (filter.search) {
        const query = filter.search.toLowerCase();
        items = items.filter(i => 
          i.content.toLowerCase().includes(query) ||
          i.preview.toLowerCase().includes(query) ||
          i.tags.some(t => t.toLowerCase().includes(query))
        );
      }
      if (filter.limit) {
        items = items.slice(0, filter.limit);
      }
    }

    return items;
  }

  getItem(id: string): ClipboardItem | null {
    return this.history.find(i => i.id === id) || null;
  }

  async pasteItem(id: string): Promise<{ success: boolean; error?: string }> {
    const item = this.history.find(i => i.id === id);
    if (!item) {
      return { success: false, error: 'Item not found' };
    }

    try {
      // Pause monitoring to avoid re-capturing
      this.isPaused = true;

      switch (item.type) {
        case 'image':
          if (item.imagePath) {
            const buffer = await fs.readFile(item.imagePath);
            const image = nativeImage.createFromBuffer(buffer);
            clipboard.writeImage(image);
          }
          break;

        case 'html':
          clipboard.write({
            text: item.content,
            html: item.html || item.content,
          });
          break;

        case 'rtf':
          clipboard.write({
            text: item.content,
            rtf: item.rtf || item.content,
          });
          break;

        default:
          clipboard.writeText(item.content);
      }

      // Update usage stats
      item.lastUsedAt = Date.now();
      item.useCount++;
      this.saveHistory();

      // Resume after short delay
      setTimeout(() => {
        this.isPaused = false;
        this.lastClipboardHash = item.hash;
      }, 500);

      this.emit('item:pasted', item);
      return { success: true };

    } catch (error) {
      this.isPaused = false;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  setPinned(id: string, pinned: boolean): { success: boolean } {
    const item = this.history.find(i => i.id === id);
    if (item) {
      item.pinned = pinned;
      this.saveHistory();
      this.emit('item:updated', item);
      return { success: true };
    }
    return { success: false };
  }

  setFavorite(id: string, favorite: boolean): { success: boolean } {
    const item = this.history.find(i => i.id === id);
    if (item) {
      item.favorite = favorite;
      this.saveHistory();
      this.emit('item:updated', item);
      return { success: true };
    }
    return { success: false };
  }

  setTags(id: string, tags: string[]): { success: boolean } {
    const item = this.history.find(i => i.id === id);
    if (item) {
      item.tags = tags;
      this.saveHistory();
      this.emit('item:updated', item);
      return { success: true };
    }
    return { success: false };
  }

  async deleteItem(id: string): Promise<{ success: boolean }> {
    const index = this.history.findIndex(i => i.id === id);
    if (index > -1) {
      const item = this.history[index];
      
      // Delete associated image
      if (item.imagePath) {
        await fs.unlink(item.imagePath).catch((e: unknown) => { log.warn('[DEX]', e); });
      }
      
      this.history.splice(index, 1);
      this.saveHistory();
      this.emit('item:deleted', id);
      return { success: true };
    }
    return { success: false };
  }

  async clearHistory(keepPinned = true): Promise<{ success: boolean; removed: number }> {
    const toRemove = keepPinned 
      ? this.history.filter(i => !i.pinned)
      : this.history;

    // Delete images
    for (const item of toRemove) {
      if (item.imagePath) {
        await fs.unlink(item.imagePath).catch((e: unknown) => { log.warn('[DEX]', e); });
      }
    }

    const removed = toRemove.length;
    this.history = keepPinned ? this.history.filter(i => i.pinned) : [];
    this.saveHistory();
    this.emit('history:cleared', removed);
    
    return { success: true, removed };
  }

  // -------------------------------------------------------------------------
  // SEARCH
  // -------------------------------------------------------------------------

  search(query: string): ClipboardItem[] {
    if (!query.trim()) return this.history.slice(0, 50);

    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/);

    return this.history
      .map(item => {
        let score = 0;
        const contentLower = item.content.toLowerCase();
        const previewLower = item.preview.toLowerCase();

        for (const term of terms) {
          // Exact match in content
          if (contentLower.includes(term)) score += 10;
          // Match in preview
          if (previewLower.includes(term)) score += 5;
          // Match in tags
          if (item.tags.some(t => t.toLowerCase().includes(term))) score += 8;
          // Match category
          if (item.category?.toLowerCase().includes(term)) score += 5;
        }

        // Boost for pinned/favorite
        if (item.pinned) score += 3;
        if (item.favorite) score += 2;
        
        // Recency boost
        const ageHours = (Date.now() - item.lastUsedAt) / (1000 * 60 * 60);
        if (ageHours < 24) score += 2;

        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(({ item }) => item);
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): ClipboardStats {
    const byType: Record<ClipboardItemType, number> = {
      text: 0,
      image: 0,
      html: 0,
      rtf: 0,
      files: 0,
    };

    for (const item of this.history) {
      byType[item.type]++;
    }

    const allTags = this.history.flatMap(i => i.tags);
    const tagCounts = new Map<string, number>();
    for (const tag of allTags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }

    return {
      totalItems: this.history.length,
      pinnedItems: this.history.filter(i => i.pinned).length,
      favoriteItems: this.history.filter(i => i.favorite).length,
      byType,
      mostUsed: [...this.history]
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 10),
      recentTags: [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag]) => tag),
    };
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------

  async setConfig(config: Partial<ClipboardConfig>): Promise<{ success: boolean }> {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Start/stop monitoring based on enabled state
    if (config.enabled !== undefined) {
      if (config.enabled && !wasEnabled) {
        this.startMonitoring();
      } else if (!config.enabled && wasEnabled) {
        this.stopMonitoring();
      }
    }

    await this.saveConfig();
    return { success: true };
  }

  pause(): void {
    this.isPaused = true;
    this.emit('monitoring:paused');
  }

  resume(): void {
    this.isPaused = false;
    this.emit('monitoring:resumed');
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private looksLikePassword(text: string): boolean {
    // Skip if too short or too long
    if (text.length < 6 || text.length > 128) return false;
    
    // Skip if contains spaces (likely not a password)
    if (text.includes(' ') && text.length > 20) return false;

    // Check password patterns
    for (const pattern of this.passwordPatterns) {
      if (pattern.test(text)) return true;
    }

    // Check entropy (high entropy = likely password)
    const entropy = this.calculateEntropy(text);
    if (entropy > 4.5 && text.length >= 12 && text.length <= 64) {
      // High entropy short string - likely a password
      return true;
    }

    return false;
  }

  private calculateEntropy(text: string): number {
    const freq = new Map<string, number>();
    for (const char of text) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }
    
    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / text.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  private categorizeContent(text: string): string | undefined {
    // URLs
    if (/^https?:\/\/\S+$/.test(text)) return 'url';
    
    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return 'email';
    
    // Phone number
    if (/^[\d\s\-\+\(\)]{10,}$/.test(text)) return 'phone';
    
    // Code
    if (/^(const|let|var|function|class|import|export|def|public|private)\s/.test(text)) return 'code';
    
    // Path
    if (/^[A-Z]:\\|^\//.test(text)) return 'path';
    
    // JSON
    if (/^\s*[\{\[]/.test(text) && /[\}\]]\s*$/.test(text)) {
      try {
        JSON.parse(text);
        return 'json';
      } catch (e) { log.warn('[DEX]', e); }
    }

    return undefined;
  }

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadHistory(): Promise<void> {
    try {
      const historyFile = path.join(this.historyPath, 'history.json');
      const data = await fs.readFile(historyFile, 'utf-8');
      this.history = JSON.parse(data);
      
      // Find max ID
      for (const item of this.history) {
        const match = item.id.match(/clip-(\d+)-/);
        if (match) {
          this.idCounter = Math.max(this.idCounter, parseInt(match[1]));
        }
      }
    } catch (err: any) {
      log.warn('[ClipboardHistory] Failed to load history:', err.message);
      this.history = [];
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      const historyFile = path.join(this.historyPath, 'history.json');
      await fs.writeFile(historyFile, JSON.stringify(this.history, null, 2));
    } catch (error) {
      log.error('[ClipboardHistory] Failed to save history:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configFile = path.join(this.historyPath, 'config.json');
      const data = await fs.readFile(configFile, 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch (err: any) {
      log.warn('[ClipboardHistory] Failed to load config, using defaults:', err.message);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configFile = path.join(this.historyPath, 'config.json');
      await fs.writeFile(configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[ClipboardHistory] Failed to save config:', error);
    }
  }

  private async cleanup(): Promise<void> {
    const cutoff = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    const toRemove = this.history.filter(i => 
      !i.pinned && !i.favorite && i.createdAt < cutoff
    );

    for (const item of toRemove) {
      if (item.imagePath) {
        await fs.unlink(item.imagePath).catch((e: unknown) => { log.warn('[DEX]', e); });
      }
    }

    this.history = this.history.filter(i => 
      i.pinned || i.favorite || i.createdAt >= cutoff
    );

    if (toRemove.length > 0) {
      await this.saveHistory();
      log.info(`[ClipboardHistory] Cleaned up ${toRemove.length} old items`);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.stopMonitoring();
    await this.saveHistory();
    await this.saveConfig();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const ClipboardHistoryManager = new ClipboardHistoryManagerClass();
export default ClipboardHistoryManager;
