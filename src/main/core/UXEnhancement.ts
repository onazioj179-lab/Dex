/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX OVERVIEW MODE & QUICK PREVIEW
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Premium UX features:
 * - Overview Mode: See all open windows, virtual desktops, and apps at once
 * - Quick Preview: Instant file preview with spacebar (like Quick Look)
 * - Smart Tags: Advanced file organization with metadata
 * - Dynamic Themes: Time-aware wallpapers and system themes
 */

import { app, ipcMain, BrowserWindow, screen, globalShortcut, nativeImage, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface VirtualDesktop {
  id: string;
  name: string;
  index: number;
  windowIds: number[];
  isActive: boolean;
  thumbnail?: string;
}

interface WindowInfo {
  id: number;
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
  isMinimized: boolean;
  isMaximized: boolean;
  isFocused: boolean;
  desktopId: string;
  thumbnail?: string;
  appIcon?: string;
}

interface SmartTag {
  id: string;
  name: string;
  color: string;
  icon: string;
  rules?: TagRule[];
  filePaths: string[];
}

interface TagRule {
  type: 'extension' | 'name-contains' | 'folder' | 'date-modified' | 'size';
  value: string;
  operator?: 'equals' | 'contains' | 'greater' | 'less';
}

interface QuickPreviewState {
  isOpen: boolean;
  filePath: string | null;
  fileType: string | null;
  metadata: FileMetadata | null;
}

interface FileMetadata {
  name: string;
  size: number;
  created: Date;
  modified: Date;
  type: string;
  dimensions?: { width: number; height: number };
  duration?: number;
  pages?: number;
}

interface DynamicTheme {
  id: string;
  name: string;
  schedule: 'auto' | 'manual' | 'time-based';
  lightThemeStart?: string; // HH:MM
  darkThemeStart?: string; // HH:MM
  wallpapers?: {
    morning: string;
    afternoon: string;
    evening: string;
    night: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW MODE - All Windows & Desktops at Glance
// ═══════════════════════════════════════════════════════════════════════════

class OverviewModeService {
  private virtualDesktops: Map<string, VirtualDesktop> = new Map();
  private isOverviewActive = false;
  private overviewWindow: BrowserWindow | null = null;
  private currentDesktopId: string = 'desktop-1';

  constructor() {
    this.initializeDefaultDesktops();
  }

  private initializeDefaultDesktops(): void {
    // Create default desktop
    this.virtualDesktops.set('desktop-1', {
      id: 'desktop-1',
      name: 'Desktop 1',
      index: 0,
      windowIds: [],
      isActive: true,
    });
  }

  /**
   * Toggle Overview Mode
   */
  toggleOverview(): void {
    if (this.isOverviewActive) {
      this.hideOverview();
    } else {
      this.showOverview();
    }
  }

  /**
   * Show Overview Mode
   */
  showOverview(): void {
    if (this.isOverviewActive) return;

    console.log('[OverviewMode] Activating...');
    this.isOverviewActive = true;

    // Capture all window thumbnails
    const windows = this.getAllWindowsInfo();
    const desktops = Array.from(this.virtualDesktops.values());

    // Emit to main window to show overlay
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('overview:show', {
          windows,
          desktops,
          currentDesktopId: this.currentDesktopId,
        });
      }
    });
  }

  /**
   * Hide Overview Mode
   */
  hideOverview(): void {
    if (!this.isOverviewActive) return;

    console.log('[OverviewMode] Deactivating...');
    this.isOverviewActive = false;

    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('overview:hide', {});
      }
    });
  }

  /**
   * Get all windows info
   */
  getAllWindowsInfo(): WindowInfo[] {
    return BrowserWindow.getAllWindows().map(win => ({
      id: win.id,
      title: win.getTitle(),
      bounds: win.getBounds(),
      isMinimized: win.isMinimized(),
      isMaximized: win.isMaximized(),
      isFocused: win.isFocused(),
      desktopId: this.getWindowDesktop(win.id),
    }));
  }

  /**
   * Get desktop for a window
   */
  private getWindowDesktop(windowId: number): string {
    for (const [id, desktop] of this.virtualDesktops) {
      if (desktop.windowIds.includes(windowId)) {
        return id;
      }
    }
    return this.currentDesktopId;
  }

  /**
   * Create new virtual desktop
   */
  createDesktop(name?: string): VirtualDesktop {
    const id = `desktop-${Date.now()}`;
    const index = this.virtualDesktops.size;
    
    const desktop: VirtualDesktop = {
      id,
      name: name || `Desktop ${index + 1}`,
      index,
      windowIds: [],
      isActive: false,
    };

    this.virtualDesktops.set(id, desktop);
    this.emitDesktopsUpdate();
    
    return desktop;
  }

  /**
   * Switch to desktop
   */
  switchToDesktop(desktopId: string): void {
    const desktop = this.virtualDesktops.get(desktopId);
    if (!desktop) return;

    // Deactivate current desktop
    const current = this.virtualDesktops.get(this.currentDesktopId);
    if (current) {
      current.isActive = false;
      // Hide windows on current desktop
      BrowserWindow.getAllWindows().forEach(win => {
        if (current.windowIds.includes(win.id)) {
          win.hide();
        }
      });
    }

    // Activate new desktop
    desktop.isActive = true;
    this.currentDesktopId = desktopId;

    // Show windows on new desktop
    BrowserWindow.getAllWindows().forEach(win => {
      if (desktop.windowIds.includes(win.id)) {
        win.show();
      }
    });

    this.emitDesktopsUpdate();
  }

  /**
   * Move window to desktop
   */
  moveWindowToDesktop(windowId: number, desktopId: string): void {
    // Remove from all desktops
    for (const [_, desktop] of this.virtualDesktops) {
      desktop.windowIds = desktop.windowIds.filter(id => id !== windowId);
    }

    // Add to target desktop
    const targetDesktop = this.virtualDesktops.get(desktopId);
    if (targetDesktop) {
      targetDesktop.windowIds.push(windowId);
    }

    this.emitDesktopsUpdate();
  }

  /**
   * Focus window from overview
   */
  focusWindow(windowId: number): void {
    const win = BrowserWindow.fromId(windowId);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      this.hideOverview();
    }
  }

  /**
   * Close window from overview
   */
  closeWindow(windowId: number): void {
    const win = BrowserWindow.fromId(windowId);
    if (win) {
      win.close();
    }
    this.emitDesktopsUpdate();
  }

  private emitDesktopsUpdate(): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('overview:desktops-updated', {
          desktops: Array.from(this.virtualDesktops.values()),
          currentDesktopId: this.currentDesktopId,
        });
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK PREVIEW - Instant File Preview
// ═══════════════════════════════════════════════════════════════════════════

class QuickPreviewService {
  private previewWindow: BrowserWindow | null = null;
  private currentState: QuickPreviewState = {
    isOpen: false,
    filePath: null,
    fileType: null,
    metadata: null,
  };

  // Supported file types for preview
  private supportedTypes: Record<string, string[]> = {
    image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'],
    video: ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'],
    audio: ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'],
    document: ['.pdf', '.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts'],
    archive: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    code: ['.py', '.java', '.cpp', '.c', '.h', '.rs', '.go', '.rb', '.php'],
  };

  /**
   * Toggle preview for file
   */
  togglePreview(filePath: string): void {
    if (this.currentState.isOpen && this.currentState.filePath === filePath) {
      this.closePreview();
    } else {
      this.openPreview(filePath);
    }
  }

  /**
   * Open preview for file
   */
  async openPreview(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      console.warn('[QuickPreview] File not found:', filePath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const fileType = this.getFileType(ext);
    const metadata = await this.getFileMetadata(filePath);

    this.currentState = {
      isOpen: true,
      filePath,
      fileType,
      metadata,
    };

    console.log(`[QuickPreview] Opening: ${filePath} (${fileType})`);

    // Emit preview data to renderer
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('quickpreview:open', {
          filePath,
          fileType,
          metadata,
          content: this.getPreviewContent(filePath, fileType),
        });
      }
    });
  }

  /**
   * Close preview
   */
  closePreview(): void {
    if (!this.currentState.isOpen) return;

    this.currentState = {
      isOpen: false,
      filePath: null,
      fileType: null,
      metadata: null,
    };

    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('quickpreview:close', {});
      }
    });
  }

  private getFileType(ext: string): string {
    for (const [type, extensions] of Object.entries(this.supportedTypes)) {
      if (extensions.includes(ext)) {
        return type;
      }
    }
    return 'unknown';
  }

  private async getFileMetadata(filePath: string): Promise<FileMetadata> {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const metadata: FileMetadata = {
      name: path.basename(filePath),
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      type: ext.slice(1).toUpperCase() || 'Unknown',
    };

    // Get dimensions for images
    if (this.supportedTypes.image.includes(ext)) {
      try {
        const image = nativeImage.createFromPath(filePath);
        const size = image.getSize();
        metadata.dimensions = { width: size.width, height: size.height };
      } catch {}
    }

    return metadata;
  }

  private getPreviewContent(filePath: string, fileType: string): any {
    try {
      switch (fileType) {
        case 'image':
          return { type: 'image', url: `file://${filePath}` };
        
        case 'video':
        case 'audio':
          return { type: fileType, url: `file://${filePath}` };
        
        case 'document':
        case 'code': {
          const content = fs.readFileSync(filePath, 'utf8');
          return { type: 'text', content: content.slice(0, 50000) }; // Limit to 50KB
        }
        
        default:
          return { type: 'unsupported', message: 'Preview not available for this file type' };
      }
    } catch (error) {
      return { type: 'error', message: 'Failed to load preview' };
    }
  }

  /**
   * Check if preview is open
   */
  isOpen(): boolean {
    return this.currentState.isOpen;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SMART TAGS - Advanced File Organization
// ═══════════════════════════════════════════════════════════════════════════

class SmartTagsService {
  private tags: Map<string, SmartTag> = new Map();
  private configPath: string;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'smart-tags.json');
    this.loadTags();
  }

  private loadTags(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        data.forEach((tag: SmartTag) => this.tags.set(tag.id, tag));
      }
    } catch (error) {
      console.warn('[SmartTags] Failed to load tags:', error);
    }

    // Initialize default tags if empty
    if (this.tags.size === 0) {
      this.initializeDefaultTags();
    }
  }

  private initializeDefaultTags(): void {
    const defaults: SmartTag[] = [
      { id: 'important', name: 'Important', color: '#ef4444', icon: 'star', filePaths: [] },
      { id: 'work', name: 'Work', color: '#3b82f6', icon: 'briefcase', filePaths: [] },
      { id: 'personal', name: 'Personal', color: '#22c55e', icon: 'home', filePaths: [] },
      { id: 'archive', name: 'Archive', color: '#6b7280', icon: 'archive', filePaths: [] },
      { id: 'review', name: 'To Review', color: '#f59e0b', icon: 'eye', filePaths: [] },
    ];

    defaults.forEach(tag => this.tags.set(tag.id, tag));
    this.saveTags();
  }

  private saveTags(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(Array.from(this.tags.values()), null, 2));
    } catch (error) {
      console.error('[SmartTags] Failed to save tags:', error);
    }
  }

  /**
   * Create new tag
   */
  createTag(name: string, color: string, icon: string): SmartTag {
    const id = `tag-${Date.now()}`;
    const tag: SmartTag = { id, name, color, icon, filePaths: [] };
    this.tags.set(id, tag);
    this.saveTags();
    return tag;
  }

  /**
   * Delete tag
   */
  deleteTag(tagId: string): void {
    this.tags.delete(tagId);
    this.saveTags();
  }

  /**
   * Add file to tag
   */
  tagFile(filePath: string, tagId: string): void {
    const tag = this.tags.get(tagId);
    if (tag && !tag.filePaths.includes(filePath)) {
      tag.filePaths.push(filePath);
      this.saveTags();
    }
  }

  /**
   * Remove file from tag
   */
  untagFile(filePath: string, tagId: string): void {
    const tag = this.tags.get(tagId);
    if (tag) {
      tag.filePaths = tag.filePaths.filter(p => p !== filePath);
      this.saveTags();
    }
  }

  /**
   * Get tags for file
   */
  getTagsForFile(filePath: string): SmartTag[] {
    return Array.from(this.tags.values()).filter(tag => 
      tag.filePaths.includes(filePath)
    );
  }

  /**
   * Get files for tag
   */
  getFilesForTag(tagId: string): string[] {
    const tag = this.tags.get(tagId);
    return tag ? tag.filePaths.filter(p => fs.existsSync(p)) : [];
  }

  /**
   * Get all tags
   */
  getAllTags(): SmartTag[] {
    return Array.from(this.tags.values());
  }

  /**
   * Search files by tag
   */
  searchByTags(tagIds: string[]): string[] {
    const results = new Set<string>();
    
    tagIds.forEach(id => {
      const tag = this.tags.get(id);
      if (tag) {
        tag.filePaths.forEach(p => {
          if (fs.existsSync(p)) results.add(p);
        });
      }
    });

    return Array.from(results);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC THEMES - Time-Aware Themes & Wallpapers
// ═══════════════════════════════════════════════════════════════════════════

class DynamicThemesService {
  private currentTheme: DynamicTheme | null = null;
  private themeCheckInterval: NodeJS.Timeout | null = null;
  private isDarkMode = false;

  constructor() {
    this.startThemeWatcher();
  }

  private startThemeWatcher(): void {
    // Check theme every minute
    this.themeCheckInterval = setInterval(() => {
      this.updateThemeBasedOnTime();
    }, 60000);

    // Initial check
    this.updateThemeBasedOnTime();
  }

  private updateThemeBasedOnTime(): void {
    const hour = new Date().getHours();
    
    // Determine time of day
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hour >= 6 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'night';
    }

    // Determine dark mode
    const shouldBeDark = hour >= 19 || hour < 7;
    if (shouldBeDark !== this.isDarkMode) {
      this.isDarkMode = shouldBeDark;
      this.emitThemeChange();
    }

    // Update wallpaper if theme has time-based wallpapers
    if (this.currentTheme?.wallpapers) {
      const wallpaper = this.currentTheme.wallpapers[timeOfDay];
      if (wallpaper) {
        this.emitWallpaperChange(wallpaper, timeOfDay);
      }
    }
  }

  /**
   * Set dynamic theme
   */
  setTheme(theme: DynamicTheme): void {
    this.currentTheme = theme;
    this.updateThemeBasedOnTime();
    console.log(`[DynamicThemes] Theme set: ${theme.name}`);
  }

  /**
   * Get current theme mode
   */
  getThemeMode(): 'light' | 'dark' {
    return this.isDarkMode ? 'dark' : 'light';
  }

  /**
   * Force theme mode
   */
  setThemeMode(mode: 'light' | 'dark' | 'auto'): void {
    if (mode === 'auto') {
      this.updateThemeBasedOnTime();
    } else {
      this.isDarkMode = mode === 'dark';
      this.emitThemeChange();
    }
  }

  private emitThemeChange(): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('theme:mode-changed', {
          mode: this.isDarkMode ? 'dark' : 'light',
          timestamp: Date.now(),
        });
      }
    });
  }

  private emitWallpaperChange(wallpaper: string, timeOfDay: string): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('theme:wallpaper-changed', {
          wallpaper,
          timeOfDay,
          timestamp: Date.now(),
        });
      }
    });
  }

  shutdown(): void {
    if (this.themeCheckInterval) {
      clearInterval(this.themeCheckInterval);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UX ENHANCEMENT MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class UXEnhancementManager {
  public overviewMode: OverviewModeService;
  public quickPreview: QuickPreviewService;
  public smartTags: SmartTagsService;
  public dynamicThemes: DynamicThemesService;
  private isInitialized = false;

  constructor() {
    this.overviewMode = new OverviewModeService();
    this.quickPreview = new QuickPreviewService();
    this.smartTags = new SmartTagsService();
    this.dynamicThemes = new DynamicThemesService();
  }

  /**
   * Initialize UX enhancements
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[UXEnhancement] Initializing...');

    this.registerIPCHandlers();
    this.registerGlobalShortcuts();

    this.isInitialized = true;
    console.log('[UXEnhancement] Initialized successfully');
  }

  private registerIPCHandlers(): void {
    // Overview Mode
    ipcMain.handle('overview:toggle', () => this.overviewMode.toggleOverview());
    ipcMain.handle('overview:get-windows', () => this.overviewMode.getAllWindowsInfo());
    ipcMain.handle('overview:create-desktop', (_, name?: string) => this.overviewMode.createDesktop(name));
    ipcMain.handle('overview:switch-desktop', (_, id: string) => this.overviewMode.switchToDesktop(id));
    ipcMain.handle('overview:focus-window', (_, id: number) => this.overviewMode.focusWindow(id));
    ipcMain.handle('overview:close-window', (_, id: number) => this.overviewMode.closeWindow(id));

    // Quick Preview
    ipcMain.handle('quickpreview:toggle', (_, path: string) => this.quickPreview.togglePreview(path));
    ipcMain.handle('quickpreview:open', (_, path: string) => this.quickPreview.openPreview(path));
    ipcMain.handle('quickpreview:close', () => this.quickPreview.closePreview());

    // Smart Tags
    ipcMain.handle('tags:get-all', () => this.smartTags.getAllTags());
    ipcMain.handle('tags:create', (_, name: string, color: string, icon: string) => 
      this.smartTags.createTag(name, color, icon));
    ipcMain.handle('tags:delete', (_, id: string) => this.smartTags.deleteTag(id));
    ipcMain.handle('tags:tag-file', (_, path: string, tagId: string) => 
      this.smartTags.tagFile(path, tagId));
    ipcMain.handle('tags:untag-file', (_, path: string, tagId: string) => 
      this.smartTags.untagFile(path, tagId));
    ipcMain.handle('tags:get-for-file', (_, path: string) => 
      this.smartTags.getTagsForFile(path));
    ipcMain.handle('tags:search', (_, tagIds: string[]) => 
      this.smartTags.searchByTags(tagIds));

    // Dynamic Themes
    ipcMain.handle('theme:getMode', () => this.dynamicThemes.getThemeMode());
    ipcMain.handle('theme:setMode', (_, mode: 'light' | 'dark' | 'auto') => 
      this.dynamicThemes.setThemeMode(mode));
  }

  private registerGlobalShortcuts(): void {
    // F3 or Ctrl+Up for Overview Mode (like Mission Control)
    globalShortcut.register('F3', () => {
      this.overviewMode.toggleOverview();
    });

    globalShortcut.register('CommandOrControl+Up', () => {
      this.overviewMode.toggleOverview();
    });

    // Space for Quick Preview (when file selected in Files app)
    // Note: This would need file selection context from renderer
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    console.log('[UXEnhancement] Shutting down...');
    globalShortcut.unregister('F3');
    globalShortcut.unregister('CommandOrControl+Up');
    this.dynamicThemes.shutdown();
    this.isInitialized = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const uxEnhancement = new UXEnhancementManager();

export async function initializeUXEnhancement(): Promise<void> {
  await uxEnhancement.initialize();
}

export function shutdownUXEnhancement(): void {
  uxEnhancement.shutdown();
}
