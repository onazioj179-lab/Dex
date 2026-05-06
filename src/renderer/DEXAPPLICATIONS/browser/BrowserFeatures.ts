// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - BROWSER App - Features Engine
// Bookmarks, downloads, privacy, and extensions
// Items 826-850 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// ITEM 826-830: BOOKMARKS
// =============================================================================

export interface Bookmark {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded: number;
  dateModified: number;
  isFolder: boolean;
  children?: Bookmark[];
  favicon?: string;
  tags: string[];
  description?: string;
  sortOrder: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  parentId?: string;
  children: (Bookmark | BookmarkFolder)[];
  isExpanded: boolean;
  sortOrder: number;
}

export const DEFAULT_BOOKMARK_FOLDERS = [
  { id: 'bookmarks-bar', name: 'Bookmarks Bar', isSystem: true },
  { id: 'other-bookmarks', name: 'Other Bookmarks', isSystem: true },
  { id: 'mobile-bookmarks', name: 'Mobile Bookmarks', isSystem: true }
];

export interface BookmarkSearchQuery {
  text?: string;
  url?: string;
  folderId?: string;
  tags?: string[];
  dateAfter?: number;
  dateBefore?: number;
}

// =============================================================================
// ITEM 831-835: DOWNLOADS
// =============================================================================

export interface Download {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  mimeType: string;
  fileSize: number;
  bytesReceived: number;
  state: DownloadState;
  startTime: number;
  endTime?: number;
  speed: number;
  paused: boolean;
  canResume: boolean;
  error?: DownloadError;
  referrer?: string;
  danger?: DangerType;
}

export type DownloadState = 
  | 'pending' | 'in_progress' | 'complete' 
  | 'cancelled' | 'interrupted' | 'paused';

export type DownloadError =
  | 'network_failed' | 'network_timeout' | 'server_failed'
  | 'file_failed' | 'file_access_denied' | 'file_no_space'
  | 'file_name_too_long' | 'file_too_large' | 'file_virus_infected'
  | 'file_transient_error' | 'file_blocked' | 'file_security_check_failed'
  | 'user_cancelled' | 'user_shutdown' | 'crash';

export type DangerType =
  | 'file' | 'url' | 'content' | 'host'
  | 'uncommon' | 'potentially_unwanted' | 'whitelisted_by_policy';

export interface DownloadSettings {
  defaultPath: string;
  askBeforeDownload: boolean;
  showDownloadPanel: boolean;
  autoOpenSafe: boolean;
  removeCompletedAfter: number;
  maxConcurrentDownloads: number;
  bandwidthLimit?: number;
}

// =============================================================================
// ITEM 836-840: PRIVACY & SECURITY
// =============================================================================

export interface PrivacySettings {
  doNotTrack: boolean;
  blockThirdPartyCookies: boolean;
  blockTrackers: boolean;
  httpsOnly: boolean;
  blockMixedContent: boolean;
  clearOnExit: ClearOnExitOptions;
  sendUsageStats: boolean;
  safeBrowsing: SafeBrowsingLevel;
}

export interface ClearOnExitOptions {
  enabled: boolean;
  browsing: boolean;
  download: boolean;
  cookies: boolean;
  cache: boolean;
  passwords: boolean;
  autofill: boolean;
  siteSettings: boolean;
}

export type SafeBrowsingLevel = 'off' | 'standard' | 'enhanced';

export interface ContentSettings {
  javascript: ContentPermission;
  images: ContentPermission;
  popups: ContentPermission;
  cookies: ContentPermission;
  location: ContentPermission;
  camera: ContentPermission;
  microphone: ContentPermission;
  notifications: ContentPermission;
  midi: ContentPermission;
  usb: ContentPermission;
  clipboard: ContentPermission;
  autoplay: ContentPermission;
}

export type ContentPermission = 'allow' | 'block' | 'ask';

export interface SiteException {
  id: string;
  pattern: string;
  setting: string;
  permission: ContentPermission;
  createdAt: number;
}

export interface TrackerBlocked {
  url: string;
  domain: string;
  type: 'tracker' | 'ad' | 'cookie' | 'fingerprint';
  timestamp: number;
}

// =============================================================================
// ITEM 841-845: EXTENSIONS
// =============================================================================

export interface Extension {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepageUrl?: string;
  iconUrl?: string;
  permissions: ExtensionPermission[];
  hostPermissions: string[];
  isEnabled: boolean;
  isBuiltIn: boolean;
  installType: ExtensionInstallType;
  installDate: number;
  updateUrl?: string;
  type: ExtensionType;
}

export type ExtensionPermission =
  | 'tabs' | 'bookmarks' | 'history' | 'downloads'
  | 'cookies' | 'storage' | 'notifications'
  | 'contextMenus' | 'webRequest' | 'webRequestBlocking'
  | 'activeTab' | 'clipboardRead' | 'clipboardWrite'
  | 'geolocation' | 'unlimitedStorage' | 'management';

export type ExtensionInstallType =
  | 'admin' | 'development' | 'normal' | 'sideload' | 'other';

export type ExtensionType =
  | 'extension' | 'theme' | 'app' | 'hosted_app' | 'packaged_app';

export interface ExtensionSettings {
  allowFromStore: boolean;
  allowDeveloperMode: boolean;
  blockedExtensions: string[];
  forceInstalledExtensions: string[];
  allowedPermissions: ExtensionPermission[];
}

// =============================================================================
// ITEM 846-850: BROWSER FEATURES ENGINE
// =============================================================================

export class BrowserFeaturesEngine {
  private bookmarks: Map<string, Bookmark> = new Map();
  private downloads: Map<string, Download> = new Map();
  private extensions: Map<string, Extension> = new Map();
  private siteExceptions: Map<string, SiteException> = new Map();
  private blockedTrackers: TrackerBlocked[] = [];
  private downloadSettings: DownloadSettings;
  private privacySettings: PrivacySettings;
  private contentSettings: ContentSettings;
  private extensionSettings: ExtensionSettings;
  private listeners: Map<string, Set<(event: FeaturesEvent) => void>> = new Map();
  
  constructor() {
    // Initialize default bookmark folders
    for (const folder of DEFAULT_BOOKMARK_FOLDERS) {
      this.bookmarks.set(folder.id, {
        id: folder.id,
        title: folder.name,
        isFolder: true,
        dateAdded: Date.now(),
        dateModified: Date.now(),
        tags: [],
        sortOrder: 0
      });
    }
    
    this.downloadSettings = {
      defaultPath: '~/Downloads',
      askBeforeDownload: false,
      showDownloadPanel: true,
      autoOpenSafe: false,
      removeCompletedAfter: 0,
      maxConcurrentDownloads: 5
    };
    
    this.privacySettings = {
      doNotTrack: true,
      blockThirdPartyCookies: true,
      blockTrackers: true,
      httpsOnly: false,
      blockMixedContent: true,
      sendUsageStats: false,
      safeBrowsing: 'standard',
      clearOnExit: {
        enabled: false,
        browsing: false,
        download: false,
        cookies: false,
        cache: false,
        passwords: false,
        autofill: false,
        siteSettings: false
      }
    };
    
    this.contentSettings = {
      javascript: 'allow',
      images: 'allow',
      popups: 'block',
      cookies: 'allow',
      location: 'ask',
      camera: 'ask',
      microphone: 'ask',
      notifications: 'ask',
      midi: 'ask',
      usb: 'ask',
      clipboard: 'ask',
      autoplay: 'block'
    };
    
    this.extensionSettings = {
      allowFromStore: true,
      allowDeveloperMode: true,
      blockedExtensions: [],
      forceInstalledExtensions: [],
      allowedPermissions: ['storage', 'tabs', 'activeTab']
    };
  }
  
  // Bookmark management
  createBookmark(title: string, url?: string, parentId: string = 'bookmarks-bar'): Bookmark {
    const bookmark: Bookmark = {
      id: this.generateId('bm'),
      parentId,
      title,
      url,
      dateAdded: Date.now(),
      dateModified: Date.now(),
      isFolder: !url,
      tags: [],
      sortOrder: this.getMaxSortOrder(parentId) + 1
    };
    
    this.bookmarks.set(bookmark.id, bookmark);
    this.emit('bookmark-created', { bookmark });
    return bookmark;
  }
  
  createBookmarkFolder(name: string, parentId: string = 'bookmarks-bar'): Bookmark {
    return this.createBookmark(name, undefined, parentId);
  }
  
  updateBookmark(bookmarkId: string, updates: Partial<Bookmark>): Bookmark | null {
    const bookmark = this.bookmarks.get(bookmarkId);
    if (!bookmark) return null;
    
    Object.assign(bookmark, updates, { dateModified: Date.now() });
    this.emit('bookmark-updated', { bookmark });
    return bookmark;
  }
  
  deleteBookmark(bookmarkId: string): void {
    const bookmark = this.bookmarks.get(bookmarkId);
    if (!bookmark) return;
    
    // Recursively delete children if folder
    if (bookmark.isFolder) {
      for (const [id, bm] of this.bookmarks) {
        if (bm.parentId === bookmarkId) {
          this.deleteBookmark(id);
        }
      }
    }
    
    this.bookmarks.delete(bookmarkId);
    this.emit('bookmark-deleted', { bookmarkId });
  }
  
  moveBookmark(bookmarkId: string, newParentId: string, index?: number): void {
    const bookmark = this.bookmarks.get(bookmarkId);
    if (!bookmark) return;
    
    bookmark.parentId = newParentId;
    bookmark.sortOrder = index ?? this.getMaxSortOrder(newParentId) + 1;
    bookmark.dateModified = Date.now();
    
    this.emit('bookmark-moved', { bookmarkId, newParentId, index });
  }
  
  searchBookmarks(query: BookmarkSearchQuery): Bookmark[] {
    let results = Array.from(this.bookmarks.values()).filter(b => !b.isFolder);
    
    if (query.text) {
      const text = query.text.toLowerCase();
      results = results.filter(b => 
        b.title.toLowerCase().includes(text) || 
        (b.url && b.url.toLowerCase().includes(text))
      );
    }
    
    if (query.url) {
      results = results.filter(b => b.url === query.url);
    }
    
    if (query.folderId) {
      results = this.getBookmarksInFolder(query.folderId);
    }
    
    if (query.tags && query.tags.length > 0) {
      results = results.filter(b => 
        query.tags!.every(t => b.tags.includes(t))
      );
    }
    
    if (query.dateAfter) {
      results = results.filter(b => b.dateAdded >= query.dateAfter!);
    }
    
    if (query.dateBefore) {
      results = results.filter(b => b.dateAdded <= query.dateBefore!);
    }
    
    return results;
  }
  
  getBookmarksInFolder(folderId: string): Bookmark[] {
    return Array.from(this.bookmarks.values())
      .filter(b => b.parentId === folderId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  
  getBookmarkTree(): Bookmark[] {
    const buildTree = (parentId?: string): Bookmark[] => {
      return Array.from(this.bookmarks.values())
        .filter(b => b.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(b => ({
          ...b,
          children: b.isFolder ? buildTree(b.id) : undefined
        }));
    };
    
    return DEFAULT_BOOKMARK_FOLDERS.map(f => ({
      ...this.bookmarks.get(f.id)!,
      children: buildTree(f.id)
    }));
  }
  
  isBookmarked(url: string): Bookmark | undefined {
    return Array.from(this.bookmarks.values()).find(b => b.url === url);
  }
  
  private getMaxSortOrder(parentId: string): number {
    const children = this.getBookmarksInFolder(parentId);
    return children.length > 0 ? Math.max(...children.map(c => c.sortOrder)) : 0;
  }
  
  // Download management
  startDownload(url: string, filename?: string): Download {
    const download: Download = {
      id: this.generateId('dl'),
      url,
      filename: filename || this.extractFilename(url),
      savePath: `${this.downloadSettings.defaultPath}/${filename || this.extractFilename(url)}`,
      mimeType: this.guessMimeType(url),
      fileSize: 0,
      bytesReceived: 0,
      state: 'pending',
      startTime: Date.now(),
      speed: 0,
      paused: false,
      canResume: true
    };
    
    this.downloads.set(download.id, download);
    this.emit('download-started', { download });
    
    // Simulate download progress
    this.simulateDownload(download.id);
    
    return download;
  }
  
  pauseDownload(downloadId: string): void {
    const download = this.downloads.get(downloadId);
    if (download && download.state === 'in_progress') {
      download.state = 'paused';
      download.paused = true;
      this.emit('download-paused', { downloadId });
    }
  }
  
  resumeDownload(downloadId: string): void {
    const download = this.downloads.get(downloadId);
    if (download && download.paused && download.canResume) {
      download.state = 'in_progress';
      download.paused = false;
      this.emit('download-resumed', { downloadId });
      this.simulateDownload(downloadId);
    }
  }
  
  cancelDownload(downloadId: string): void {
    const download = this.downloads.get(downloadId);
    if (download && download.state !== 'complete') {
      download.state = 'cancelled';
      download.endTime = Date.now();
      this.emit('download-cancelled', { downloadId });
    }
  }
  
  retryDownload(downloadId: string): Download | null {
    const download = this.downloads.get(downloadId);
    if (!download) return null;
    
    return this.startDownload(download.url, download.filename);
  }
  
  removeDownload(downloadId: string): void {
    this.downloads.delete(downloadId);
    this.emit('download-removed', { downloadId });
  }
  
  clearDownloads(state?: DownloadState): void {
    for (const [id, download] of this.downloads) {
      if (!state || download.state === state) {
        this.downloads.delete(id);
      }
    }
    this.emit('downloads-cleared', { state });
  }
  
  getDownloads(state?: DownloadState): Download[] {
    let results = Array.from(this.downloads.values());
    if (state) {
      results = results.filter(d => d.state === state);
    }
    return results.sort((a, b) => b.startTime - a.startTime);
  }
  
  getDownload(downloadId: string): Download | undefined {
    return this.downloads.get(downloadId);
  }
  
  private simulateDownload(downloadId: string): void {
    const download = this.downloads.get(downloadId);
    if (!download) return;
    
    download.state = 'in_progress';
    download.fileSize = Math.floor(Math.random() * 100000000) + 1000000;
    
    const interval = setInterval(() => {
      const dl = this.downloads.get(downloadId);
      if (!dl || dl.paused || dl.state !== 'in_progress') {
        clearInterval(interval);
        return;
      }
      
      dl.speed = Math.floor(Math.random() * 5000000) + 500000;
      dl.bytesReceived += dl.speed / 10;
      
      this.emit('download-progress', { 
        downloadId, 
        progress: dl.bytesReceived / dl.fileSize,
        speed: dl.speed
      });
      
      if (dl.bytesReceived >= dl.fileSize) {
        clearInterval(interval);
        dl.state = 'complete';
        dl.bytesReceived = dl.fileSize;
        dl.endTime = Date.now();
        this.emit('download-complete', { downloadId });
      }
    }, 100);
  }
  
  private extractFilename(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      const filename = path.split('/').pop() || 'download';
      return decodeURIComponent(filename);
    } catch {
      return 'download';
    }
  }
  
  private guessMimeType(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'txt': 'text/plain',
      'html': 'text/html',
      'json': 'application/json',
      'exe': 'application/x-msdownload',
      'dmg': 'application/x-apple-diskimage'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
  
  // Privacy settings
  getPrivacySettings(): PrivacySettings {
    return { ...this.privacySettings };
  }
  
  updatePrivacySettings(settings: Partial<PrivacySettings>): void {
    this.privacySettings = { ...this.privacySettings, ...settings };
    this.emit('privacy-settings-updated', { settings: this.privacySettings });
  }
  
  getContentSettings(): ContentSettings {
    return { ...this.contentSettings };
  }
  
  updateContentSettings(settings: Partial<ContentSettings>): void {
    this.contentSettings = { ...this.contentSettings, ...settings };
    this.emit('content-settings-updated', { settings: this.contentSettings });
  }
  
  // Site exceptions
  addSiteException(pattern: string, setting: string, permission: ContentPermission): SiteException {
    const exception: SiteException = {
      id: this.generateId('exc'),
      pattern,
      setting,
      permission,
      createdAt: Date.now()
    };
    
    this.siteExceptions.set(exception.id, exception);
    this.emit('site-exception-added', { exception });
    return exception;
  }
  
  removeSiteException(exceptionId: string): void {
    this.siteExceptions.delete(exceptionId);
    this.emit('site-exception-removed', { exceptionId });
  }
  
  getSiteExceptions(setting?: string): SiteException[] {
    let results = Array.from(this.siteExceptions.values());
    if (setting) {
      results = results.filter(e => e.setting === setting);
    }
    return results;
  }
  
  getPermissionForSite(url: string, setting: keyof ContentSettings): ContentPermission {
    try {
      const hostname = new URL(url).hostname;
      
      // Check site exceptions
      for (const exception of this.siteExceptions.values()) {
        if (exception.setting === setting) {
          if (this.matchPattern(hostname, exception.pattern)) {
            return exception.permission;
          }
        }
      }
    } catch {
      // Invalid URL
    }
    
    return this.contentSettings[setting];
  }
  
  private matchPattern(hostname: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.startsWith('*.')) {
      const domain = pattern.slice(2);
      return hostname === domain || hostname.endsWith('.' + domain);
    }
    return hostname === pattern;
  }
  
  // Tracker blocking
  blockTracker(url: string, type: TrackerBlocked['type']): void {
    try {
      const domain = new URL(url).hostname;
      const blocked: TrackerBlocked = {
        url,
        domain,
        type,
        timestamp: Date.now()
      };
      
      this.blockedTrackers.push(blocked);
      // Cap blocked trackers to prevent unbounded memory growth
      if (this.blockedTrackers.length > 5000) {
        this.blockedTrackers = this.blockedTrackers.slice(-2500);
      }
      this.emit('tracker-blocked', { blocked });
    } catch {
      // Invalid URL
    }
  }
  
  getBlockedTrackers(domain?: string): TrackerBlocked[] {
    if (domain) {
      return this.blockedTrackers.filter(t => t.domain === domain);
    }
    return [...this.blockedTrackers];
  }
  
  getBlockedTrackerStats(): { total: number; byType: Record<string, number>; byDomain: Record<string, number> } {
    const stats = {
      total: this.blockedTrackers.length,
      byType: {} as Record<string, number>,
      byDomain: {} as Record<string, number>
    };
    
    for (const tracker of this.blockedTrackers) {
      stats.byType[tracker.type] = (stats.byType[tracker.type] || 0) + 1;
      stats.byDomain[tracker.domain] = (stats.byDomain[tracker.domain] || 0) + 1;
    }
    
    return stats;
  }
  
  clearBlockedTrackers(): void {
    this.blockedTrackers = [];
    this.emit('trackers-cleared', {});
  }
  
  // Extension management
  installExtension(extension: Omit<Extension, 'id' | 'installDate'>): Extension {
    const ext: Extension = {
      ...extension,
      id: this.generateId('ext'),
      installDate: Date.now()
    };
    
    this.extensions.set(ext.id, ext);
    this.emit('extension-installed', { extension: ext });
    return ext;
  }
  
  uninstallExtension(extensionId: string): void {
    const extension = this.extensions.get(extensionId);
    if (!extension || extension.isBuiltIn) return;
    
    this.extensions.delete(extensionId);
    this.emit('extension-uninstalled', { extensionId });
  }
  
  enableExtension(extensionId: string): void {
    const extension = this.extensions.get(extensionId);
    if (extension) {
      extension.isEnabled = true;
      this.emit('extension-enabled', { extensionId });
    }
  }
  
  disableExtension(extensionId: string): void {
    const extension = this.extensions.get(extensionId);
    if (extension) {
      extension.isEnabled = false;
      this.emit('extension-disabled', { extensionId });
    }
  }
  
  getExtensions(enabled?: boolean): Extension[] {
    let results = Array.from(this.extensions.values());
    if (enabled !== undefined) {
      results = results.filter(e => e.isEnabled === enabled);
    }
    return results;
  }
  
  getExtension(extensionId: string): Extension | undefined {
    return this.extensions.get(extensionId);
  }
  
  hasPermission(extensionId: string, permission: ExtensionPermission): boolean {
    const extension = this.extensions.get(extensionId);
    return extension?.permissions.includes(permission) ?? false;
  }
  
  // Download settings
  getDownloadSettings(): DownloadSettings {
    return { ...this.downloadSettings };
  }
  
  updateDownloadSettings(settings: Partial<DownloadSettings>): void {
    this.downloadSettings = { ...this.downloadSettings, ...settings };
    this.emit('download-settings-updated', { settings: this.downloadSettings });
  }
  
  // Extension settings
  getExtensionSettings(): ExtensionSettings {
    return { ...this.extensionSettings };
  }
  
  updateExtensionSettings(settings: Partial<ExtensionSettings>): void {
    this.extensionSettings = { ...this.extensionSettings, ...settings };
    this.emit('extension-settings-updated', { settings: this.extensionSettings });
  }
  
  // Event handling
  on(event: string, callback: (event: FeaturesEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: FeaturesEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const featuresEvent: FeaturesEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(featuresEvent));
    }
  }
  
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface FeaturesEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createBrowserFeaturesEngine = () => new BrowserFeaturesEngine();

export default { BrowserFeaturesEngine, createBrowserFeaturesEngine };
