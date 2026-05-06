// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Productivity Apps Complete - All features for Notes, Browser, Files, Nexus
// ===========================================================================

// Browser-compatible EventEmitter
class EventEmitter {
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return false;
    handlers.forEach(handler => handler(...args));
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

// ===========================================================================
// NOTES - DOCUMENT EDITOR COMPLETE
// ===========================================================================

export interface NotesDocument {
  id: string;
  title: string;
  content: DocumentContent;
  created: number;
  modified: number;
  folder?: string;
  tags: string[];
  starred: boolean;
  locked: boolean;
  metadata: Record<string, unknown>;
}

export interface DocumentContent {
  type: 'doc';
  content: ContentNode[];
}

export interface ContentNode {
  type: NodeType;
  attrs?: Record<string, unknown>;
  content?: ContentNode[];
  text?: string;
  marks?: Mark[];
}

export type NodeType = 
  | 'paragraph' | 'heading' | 'blockquote' | 'codeBlock'
  | 'text'
  | 'bulletList' | 'orderedList' | 'listItem' | 'taskList' | 'taskItem'
  | 'table' | 'tableRow' | 'tableCell' | 'tableHeader'
  | 'image' | 'video' | 'audio' | 'file'
  | 'horizontalRule' | 'hardBreak'
  | 'callout' | 'toggle' | 'columns' | 'embed'
  | 'math' | 'diagram' | 'drawing';

export interface Mark {
  type: MarkType;
  attrs?: Record<string, unknown>;
}

export type MarkType = 
  | 'bold' | 'italic' | 'underline' | 'strike' | 'code'
  | 'link' | 'highlight' | 'textColor' | 'subscript' | 'superscript';

export interface NotesFolder {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  parentId?: string;
  created: number;
}

export interface NotesTemplate {
  id: string;
  name: string;
  description: string;
  content: DocumentContent;
  category: string;
  builtIn: boolean;
}

export class NotesComplete extends EventEmitter {
  private documents: Map<string, NotesDocument> = new Map();
  private folders: Map<string, NotesFolder> = new Map();
  private activeDocument: string | null = null;
  private templates: NotesTemplate[] = [];

  // Built-in templates
  readonly builtInTemplates: Omit<NotesTemplate, 'id'>[] = [
    {
      name: 'Blank',
      description: 'Start with a blank document',
      category: 'Basic',
      builtIn: true,
      content: { type: 'doc', content: [{ type: 'paragraph' }] }
    },
    {
      name: 'Meeting Notes',
      description: 'Template for meeting notes',
      category: 'Work',
      builtIn: true,
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Meeting Notes' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Date: ' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Attendees: ' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Discussion' }] },
          { type: 'paragraph' },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Action Items' }] },
          { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }
        ]
      }
    },
    {
      name: 'Project Plan',
      description: 'Plan a project with goals and tasks',
      category: 'Work',
      builtIn: true,
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Plan' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
          { type: 'paragraph' },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goals' }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Timeline' }] },
          { type: 'table', content: [] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tasks' }] },
          { type: 'taskList', content: [] }
        ]
      }
    },
    {
      name: 'Daily Journal',
      description: 'Daily reflection and planning',
      category: 'Personal',
      builtIn: true,
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Journal Entry' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Today I am grateful for' }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goals for today' }] },
          { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Reflection' }] },
          { type: 'paragraph' }
        ]
      }
    },
    {
      name: 'Code Documentation',
      description: 'Document code with examples',
      category: 'Development',
      builtIn: true,
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Documentation' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
          { type: 'paragraph' },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Installation' }] },
          { type: 'codeBlock', attrs: { language: 'bash' } },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Usage' }] },
          { type: 'codeBlock', attrs: { language: 'typescript' } },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'API Reference' }] },
          { type: 'paragraph' }
        ]
      }
    }
  ];

  constructor() {
    super();
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    this.templates = this.builtInTemplates.map((t, i) => ({
      id: `template-${i}`,
      ...t
    }));
  }

  createDocument(title: string, template?: string): NotesDocument {
    const templateContent = template 
      ? this.templates.find(t => t.id === template)?.content 
      : { type: 'doc' as const, content: [{ type: 'paragraph' as const }] };

    const doc: NotesDocument = {
      id: this.generateId(),
      title,
      content: templateContent || { type: 'doc', content: [{ type: 'paragraph' }] },
      created: Date.now(),
      modified: Date.now(),
      tags: [],
      starred: false,
      locked: false,
      metadata: {}
    };

    this.documents.set(doc.id, doc);
    this.activeDocument = doc.id;
    this.emit('document:created', doc);
    return doc;
  }

  openDocument(id: string): NotesDocument | null {
    const doc = this.documents.get(id);
    if (doc) {
      this.activeDocument = id;
      this.emit('document:opened', doc);
    }
    return doc || null;
  }

  saveDocument(id: string, content: DocumentContent): void {
    const doc = this.documents.get(id);
    if (doc) {
      doc.content = content;
      doc.modified = Date.now();
      this.emit('document:saved', doc);
    }
  }

  deleteDocument(id: string): boolean {
    const deleted = this.documents.delete(id);
    if (deleted) {
      this.emit('document:deleted', { id });
    }
    return deleted;
  }

  // Folder operations
  createFolder(name: string, parentId?: string): NotesFolder {
    const folder: NotesFolder = {
      id: this.generateId(),
      name,
      parentId,
      created: Date.now()
    };

    this.folders.set(folder.id, folder);
    this.emit('folder:created', folder);
    return folder;
  }

  moveDocument(docId: string, folderId?: string): void {
    const doc = this.documents.get(docId);
    if (doc) {
      doc.folder = folderId;
      this.emit('document:moved', { docId, folderId });
    }
  }

  // Search
  search(query: string): NotesDocument[] {
    const results: NotesDocument[] = [];
    const lowerQuery = query.toLowerCase();

    for (const doc of this.documents.values()) {
      if (doc.title.toLowerCase().includes(lowerQuery)) {
        results.push(doc);
      }
    }

    this.emit('search:complete', { query, results: results.length });
    return results;
  }

  // Tags
  addTag(docId: string, tag: string): void {
    const doc = this.documents.get(docId);
    if (doc && !doc.tags.includes(tag)) {
      doc.tags.push(tag);
      this.emit('tag:added', { docId, tag });
    }
  }

  removeTag(docId: string, tag: string): void {
    const doc = this.documents.get(docId);
    if (doc) {
      doc.tags = doc.tags.filter(t => t !== tag);
      this.emit('tag:removed', { docId, tag });
    }
  }

  // Export
  exportDocument(id: string, format: 'md' | 'html' | 'pdf' | 'docx' | 'txt'): void {
    this.emit('document:export', { id, format });
  }

  // AI Features
  summarize(id: string): void {
    this.emit('ai:summarize', { id });
  }

  expand(id: string, selection: string): void {
    this.emit('ai:expand', { id, selection });
  }

  translate(id: string, language: string): void {
    this.emit('ai:translate', { id, language });
  }

  generateOutline(id: string): void {
    this.emit('ai:outline', { id });
  }

  improveWriting(id: string, selection: string): void {
    this.emit('ai:improve', { id, selection });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ===========================================================================
// BROWSER - WEB BROWSER COMPLETE
// ===========================================================================

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  secureConnection: boolean;
  muted: boolean;
  pinned: boolean;
  lastAccessed: number;
}

export interface BrowserBookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  folderId?: string;
  created: number;
}

export interface BrowserHistory {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  visitTime: number;
  visitCount: number;
}

export interface BrowserDownload {
  id: string;
  url: string;
  filename: string;
  path: string;
  size: number;
  downloaded: number;
  status: 'pending' | 'downloading' | 'paused' | 'complete' | 'failed';
  startTime: number;
}

export interface BrowserSettings {
  homepage: string;
  searchEngine: string;
  downloadPath: string;
  blockAds: boolean;
  blockTrackers: boolean;
  doNotTrack: boolean;
  javascriptEnabled: boolean;
  cookiesEnabled: boolean;
  autoplayMedia: 'allow' | 'block' | 'ask';
  notifications: 'allow' | 'block' | 'ask';
  darkMode: boolean;
  fontSize: number;
}

export class BrowserComplete extends EventEmitter {
  private tabs: Map<string, BrowserTab> = new Map();
  private activeTab: string | null = null;
  private bookmarks: Map<string, BrowserBookmark> = new Map();
  private history: BrowserHistory[] = [];
  private downloads: Map<string, BrowserDownload> = new Map();
  private settings: BrowserSettings;

  constructor() {
    super();
    this.settings = {
      homepage: 'https://dex.search',
      searchEngine: 'https://dex.search/search?q=',
      downloadPath: '~/Downloads',
      blockAds: true,
      blockTrackers: true,
      doNotTrack: true,
      javascriptEnabled: true,
      cookiesEnabled: true,
      autoplayMedia: 'block',
      notifications: 'ask',
      darkMode: true,
      fontSize: 16
    };
  }

  // Tab management
  createTab(url?: string): BrowserTab {
    const tab: BrowserTab = {
      id: this.generateId(),
      url: url || this.settings.homepage,
      title: 'New Tab',
      loading: !!url,
      canGoBack: false,
      canGoForward: false,
      secureConnection: url?.startsWith('https://') || false,
      muted: false,
      pinned: false,
      lastAccessed: Date.now()
    };

    this.tabs.set(tab.id, tab);
    this.activeTab = tab.id;
    this.emit('tab:created', tab);

    if (url) {
      this.navigate(tab.id, url);
    }

    return tab;
  }

  closeTab(tabId: string): void {
    this.tabs.delete(tabId);
    
    if (this.activeTab === tabId) {
      const remaining = Array.from(this.tabs.keys());
      this.activeTab = remaining[remaining.length - 1] || null;
    }
    
    this.emit('tab:closed', { tabId });
  }

  switchTab(tabId: string): void {
    if (this.tabs.has(tabId)) {
      this.activeTab = tabId;
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.lastAccessed = Date.now();
      }
      this.emit('tab:switched', { tabId });
    }
  }

  pinTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.pinned = !tab.pinned;
      this.emit('tab:pinned', { tabId, pinned: tab.pinned });
    }
  }

  muteTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.muted = !tab.muted;
      this.emit('tab:muted', { tabId, muted: tab.muted });
    }
  }

  duplicateTab(tabId: string): BrowserTab | null {
    const tab = this.tabs.get(tabId);
    if (tab) {
      return this.createTab(tab.url);
    }
    return null;
  }

  // Navigation
  navigate(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Handle search queries
    if (!url.includes('://') && !url.includes('.')) {
      url = this.settings.searchEngine + encodeURIComponent(url);
    } else if (!url.includes('://')) {
      url = 'https://' + url;
    }

    tab.url = url;
    tab.loading = true;
    tab.secureConnection = url.startsWith('https://');
    
    this.addToHistory(url, tab.title);
    this.emit('navigation:started', { tabId, url });
  }

  goBack(tabId: string): void {
    this.emit('navigation:back', { tabId });
  }

  goForward(tabId: string): void {
    this.emit('navigation:forward', { tabId });
  }

  reload(tabId: string, hard: boolean = false): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.loading = true;
      this.emit('navigation:reload', { tabId, hard });
    }
  }

  stop(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.loading = false;
      this.emit('navigation:stopped', { tabId });
    }
  }

  // Bookmarks
  addBookmark(url: string, title: string, folderId?: string): BrowserBookmark {
    const bookmark: BrowserBookmark = {
      id: this.generateId(),
      url,
      title,
      folderId,
      created: Date.now()
    };

    this.bookmarks.set(bookmark.id, bookmark);
    this.emit('bookmark:added', bookmark);
    return bookmark;
  }

  removeBookmark(bookmarkId: string): void {
    this.bookmarks.delete(bookmarkId);
    this.emit('bookmark:removed', { bookmarkId });
  }

  getBookmarks(folderId?: string): BrowserBookmark[] {
    return Array.from(this.bookmarks.values())
      .filter(b => b.folderId === folderId);
  }

  isBookmarked(url: string): boolean {
    return Array.from(this.bookmarks.values()).some(b => b.url === url);
  }

  // History
  addToHistory(url: string, title: string): void {
    const existing = this.history.find(h => h.url === url);
    
    if (existing) {
      existing.visitTime = Date.now();
      existing.visitCount++;
      existing.title = title;
    } else {
      this.history.push({
        id: this.generateId(),
        url,
        title,
        visitTime: Date.now(),
        visitCount: 1
      });
    }

    this.emit('history:added', { url, title });
  }

  searchHistory(query: string): BrowserHistory[] {
    const lowerQuery = query.toLowerCase();
    return this.history.filter(h => 
      h.url.toLowerCase().includes(lowerQuery) ||
      h.title.toLowerCase().includes(lowerQuery)
    );
  }

  clearHistory(since?: number): void {
    if (since) {
      this.history = this.history.filter(h => h.visitTime < since);
    } else {
      this.history = [];
    }
    this.emit('history:cleared');
  }

  // Downloads
  startDownload(url: string, filename: string): BrowserDownload {
    const download: BrowserDownload = {
      id: this.generateId(),
      url,
      filename,
      path: `${this.settings.downloadPath}/${filename}`,
      size: 0,
      downloaded: 0,
      status: 'pending',
      startTime: Date.now()
    };

    this.downloads.set(download.id, download);
    this.emit('download:started', download);
    return download;
  }

  pauseDownload(downloadId: string): void {
    const download = this.downloads.get(downloadId);
    if (download && download.status === 'downloading') {
      download.status = 'paused';
      this.emit('download:paused', { downloadId });
    }
  }

  resumeDownload(downloadId: string): void {
    const download = this.downloads.get(downloadId);
    if (download && download.status === 'paused') {
      download.status = 'downloading';
      this.emit('download:resumed', { downloadId });
    }
  }

  cancelDownload(downloadId: string): void {
    this.downloads.delete(downloadId);
    this.emit('download:cancelled', { downloadId });
  }

  getDownloads(): BrowserDownload[] {
    return Array.from(this.downloads.values());
  }

  // Find in page
  findInPage(tabId: string, query: string): void {
    this.emit('find:started', { tabId, query });
  }

  findNext(tabId: string): void {
    this.emit('find:next', { tabId });
  }

  findPrevious(tabId: string): void {
    this.emit('find:previous', { tabId });
  }

  closeFindBar(tabId: string): void {
    this.emit('find:closed', { tabId });
  }

  // Developer tools
  openDevTools(tabId: string): void {
    this.emit('devtools:open', { tabId });
  }

  closeDevTools(tabId: string): void {
    this.emit('devtools:close', { tabId });
  }

  // Print
  print(tabId: string): void {
    this.emit('print:started', { tabId });
  }

  // Screenshot
  captureScreenshot(tabId: string, fullPage: boolean = false): void {
    this.emit('screenshot:capture', { tabId, fullPage });
  }

  // Settings
  updateSettings(settings: Partial<BrowserSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.emit('settings:updated', this.settings);
  }

  getSettings(): BrowserSettings {
    return { ...this.settings };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ===========================================================================
// FILES - FILE MANAGER COMPLETE
// ===========================================================================

export interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  created: number;
  modified: number;
  accessed: number;
  permissions: string;
  owner: string;
  group: string;
  hidden: boolean;
  readonly: boolean;
  extension?: string;
  mimeType?: string;
  thumbnail?: string;
}

export interface FileOperation {
  id: string;
  type: 'copy' | 'move' | 'delete' | 'compress' | 'extract';
  source: string[];
  destination?: string;
  progress: number;
  status: 'pending' | 'running' | 'paused' | 'complete' | 'failed' | 'cancelled';
  startTime: number;
  error?: string;
}

export interface FilesViewOptions {
  view: 'list' | 'grid' | 'columns' | 'gallery';
  sortBy: 'name' | 'size' | 'type' | 'modified' | 'created';
  sortOrder: 'asc' | 'desc';
  showHidden: boolean;
  groupBy?: 'type' | 'date' | 'size';
}

export interface QuickAccess {
  id: string;
  name: string;
  path: string;
  icon: string;
  pinned: boolean;
}

export class FilesComplete extends EventEmitter {
  private currentPath: string = '/';
  private selectedItems: Set<string> = new Set();
  private clipboard: { items: string[]; operation: 'copy' | 'cut' } | null = null;
  private operations: Map<string, FileOperation> = new Map();
  private viewOptions: FilesViewOptions;
  private quickAccess: QuickAccess[] = [];
  private recentFiles: string[] = [];
  private searchResults: FileEntry[] = [];

  constructor() {
    super();
    this.viewOptions = {
      view: 'list',
      sortBy: 'name',
      sortOrder: 'asc',
      showHidden: false
    };

    this.initializeQuickAccess();
  }

  private initializeQuickAccess(): void {
    this.quickAccess = [
      { id: '1', name: 'Home', path: '~', icon: 'home', pinned: true },
      { id: '2', name: 'Desktop', path: '~/Desktop', icon: 'desktop', pinned: true },
      { id: '3', name: 'Documents', path: '~/Documents', icon: 'file', pinned: true },
      { id: '4', name: 'Downloads', path: '~/Downloads', icon: 'download', pinned: true },
      { id: '5', name: 'Pictures', path: '~/Pictures', icon: 'image', pinned: true },
      { id: '6', name: 'Music', path: '~/Music', icon: 'audio', pinned: true },
      { id: '7', name: 'Videos', path: '~/Videos', icon: 'video', pinned: true }
    ];
  }

  // Navigation
  navigate(path: string): void {
    this.currentPath = path;
    this.selectedItems.clear();
    this.emit('navigation:changed', { path });
  }

  goUp(): void {
    const parentPath = this.currentPath.split('/').slice(0, -1).join('/') || '/';
    this.navigate(parentPath);
  }

  goBack(): void {
    this.emit('navigation:back');
  }

  goForward(): void {
    this.emit('navigation:forward');
  }

  refresh(): void {
    this.emit('navigation:refresh');
  }

  // Selection
  select(paths: string[]): void {
    for (const path of paths) {
      this.selectedItems.add(path);
    }
    this.emit('selection:changed', { selected: Array.from(this.selectedItems) });
  }

  deselect(paths: string[]): void {
    for (const path of paths) {
      this.selectedItems.delete(path);
    }
    this.emit('selection:changed', { selected: Array.from(this.selectedItems) });
  }

  selectAll(): void {
    this.emit('selection:all');
  }

  clearSelection(): void {
    this.selectedItems.clear();
    this.emit('selection:cleared');
  }

  getSelected(): string[] {
    return Array.from(this.selectedItems);
  }

  // File operations
  createFolder(name: string): void {
    const path = `${this.currentPath}/${name}`;
    this.emit('folder:create', { path });
  }

  createFile(name: string): void {
    const path = `${this.currentPath}/${name}`;
    this.emit('file:create', { path });
  }

  rename(oldPath: string, newName: string): void {
    const newPath = oldPath.split('/').slice(0, -1).join('/') + '/' + newName;
    this.emit('item:rename', { oldPath, newPath });
  }

  copy(paths: string[]): void {
    this.clipboard = { items: paths, operation: 'copy' };
    this.emit('clipboard:copy', { paths });
  }

  cut(paths: string[]): void {
    this.clipboard = { items: paths, operation: 'cut' };
    this.emit('clipboard:cut', { paths });
  }

  paste(): void {
    if (!this.clipboard) return;

    const operation: FileOperation = {
      id: this.generateId(),
      type: this.clipboard.operation === 'cut' ? 'move' : 'copy',
      source: this.clipboard.items,
      destination: this.currentPath,
      progress: 0,
      status: 'pending',
      startTime: Date.now()
    };

    this.operations.set(operation.id, operation);
    this.emit('operation:started', operation);

    if (this.clipboard.operation === 'cut') {
      this.clipboard = null;
    }
  }

  delete(paths: string[], permanent: boolean = false): void {
    const operation: FileOperation = {
      id: this.generateId(),
      type: 'delete',
      source: paths,
      progress: 0,
      status: 'pending',
      startTime: Date.now()
    };

    this.operations.set(operation.id, operation);
    this.emit('operation:started', { ...operation, permanent });
  }

  compress(paths: string[], archiveName: string, format: 'zip' | 'tar' | 'tar.gz' | '7z' = 'zip'): void {
    const operation: FileOperation = {
      id: this.generateId(),
      type: 'compress',
      source: paths,
      destination: `${this.currentPath}/${archiveName}.${format}`,
      progress: 0,
      status: 'pending',
      startTime: Date.now()
    };

    this.operations.set(operation.id, operation);
    this.emit('operation:started', { ...operation, format });
  }

  extract(archivePath: string, destination?: string): void {
    const operation: FileOperation = {
      id: this.generateId(),
      type: 'extract',
      source: [archivePath],
      destination: destination || this.currentPath,
      progress: 0,
      status: 'pending',
      startTime: Date.now()
    };

    this.operations.set(operation.id, operation);
    this.emit('operation:started', operation);
  }

  // Operation control
  pauseOperation(operationId: string): void {
    const op = this.operations.get(operationId);
    if (op && op.status === 'running') {
      op.status = 'paused';
      this.emit('operation:paused', { operationId });
    }
  }

  resumeOperation(operationId: string): void {
    const op = this.operations.get(operationId);
    if (op && op.status === 'paused') {
      op.status = 'running';
      this.emit('operation:resumed', { operationId });
    }
  }

  cancelOperation(operationId: string): void {
    const op = this.operations.get(operationId);
    if (op && (op.status === 'running' || op.status === 'paused')) {
      op.status = 'cancelled';
      this.emit('operation:cancelled', { operationId });
    }
  }

  // Search
  search(query: string, options?: { 
    recursive?: boolean; 
    type?: 'all' | 'files' | 'folders';
    dateRange?: { from: number; to: number };
    sizeRange?: { min: number; max: number };
  }): void {
    this.emit('search:started', { query, options, path: this.currentPath });
  }

  // Properties
  getProperties(path: string): void {
    this.emit('properties:get', { path });
  }

  setPermissions(path: string, permissions: string): void {
    this.emit('permissions:set', { path, permissions });
  }

  // Preview
  preview(path: string): void {
    this.emit('preview:open', { path });
  }

  // Quick Access
  addToQuickAccess(path: string, name: string): void {
    const item: QuickAccess = {
      id: this.generateId(),
      name,
      path,
      icon: 'folder',
      pinned: true
    };
    this.quickAccess.push(item);
    this.emit('quickAccess:added', item);
  }

  removeFromQuickAccess(id: string): void {
    this.quickAccess = this.quickAccess.filter(q => q.id !== id);
    this.emit('quickAccess:removed', { id });
  }

  // View options
  setViewOptions(options: Partial<FilesViewOptions>): void {
    this.viewOptions = { ...this.viewOptions, ...options };
    this.emit('view:changed', this.viewOptions);
  }

  getViewOptions(): FilesViewOptions {
    return { ...this.viewOptions };
  }

  // Terminal
  openTerminal(path?: string): void {
    this.emit('terminal:open', { path: path || this.currentPath });
  }

  // Open with
  openWith(path: string, app?: string): void {
    this.emit('open:with', { path, app });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ===========================================================================
// NEXUS - CLOUD SYNC COMPLETE
// ===========================================================================

export interface CloudAccount {
  id: string;
  provider: CloudProvider;
  email: string;
  name: string;
  avatar?: string;
  quota: { used: number; total: number };
  connected: boolean;
  lastSync: number;
}

export type CloudProvider = 'nexus' | 'google-drive' | 'onedrive' | 'dropbox' | 'icloud' | 's3' | 'webdav';

export interface SyncFolder {
  id: string;
  localPath: string;
  remotePath: string;
  accountId: string;
  enabled: boolean;
  syncMode: 'two-way' | 'upload-only' | 'download-only';
  conflictResolution: 'local' | 'remote' | 'newest' | 'ask';
  excludePatterns: string[];
  lastSync: number;
  status: SyncStatus;
}

export type SyncStatus = 'idle' | 'syncing' | 'paused' | 'error' | 'offline';

export interface SyncConflict {
  id: string;
  path: string;
  localVersion: { modified: number; size: number };
  remoteVersion: { modified: number; size: number };
  status: 'pending' | 'resolved';
}

export interface SharedItem {
  id: string;
  path: string;
  sharedWith: ShareRecipient[];
  shareLink?: string;
  permissions: SharePermissions;
  created: number;
  expires?: number;
}

export interface ShareRecipient {
  email: string;
  name?: string;
  permissions: SharePermissions;
}

export interface SharePermissions {
  view: boolean;
  edit: boolean;
  share: boolean;
  download: boolean;
}

export interface SyncActivity {
  id: string;
  type: 'upload' | 'download' | 'delete' | 'conflict' | 'error';
  path: string;
  timestamp: number;
  accountId: string;
  details?: string;
}

export class NexusComplete extends EventEmitter {
  private accounts: Map<string, CloudAccount> = new Map();
  private syncFolders: Map<string, SyncFolder> = new Map();
  private conflicts: Map<string, SyncConflict> = new Map();
  private sharedItems: Map<string, SharedItem> = new Map();
  private activities: SyncActivity[] = [];
  private globalStatus: SyncStatus = 'idle';

  // Account management
  addAccount(provider: CloudProvider): void {
    this.emit('account:authorize', { provider });
  }

  removeAccount(accountId: string): void {
    this.accounts.delete(accountId);
    // Remove associated sync folders
    for (const [id, folder] of this.syncFolders) {
      if (folder.accountId === accountId) {
        this.syncFolders.delete(id);
      }
    }
    this.emit('account:removed', { accountId });
  }

  getAccounts(): CloudAccount[] {
    return Array.from(this.accounts.values());
  }

  getAccount(accountId: string): CloudAccount | undefined {
    return this.accounts.get(accountId);
  }

  refreshQuota(accountId: string): void {
    this.emit('quota:refresh', { accountId });
  }

  // Sync folder management
  addSyncFolder(folder: Omit<SyncFolder, 'id' | 'lastSync' | 'status'>): SyncFolder {
    const syncFolder: SyncFolder = {
      id: this.generateId(),
      ...folder,
      lastSync: 0,
      status: 'idle'
    };

    this.syncFolders.set(syncFolder.id, syncFolder);
    this.emit('syncFolder:added', syncFolder);
    return syncFolder;
  }

  removeSyncFolder(folderId: string): void {
    this.syncFolders.delete(folderId);
    this.emit('syncFolder:removed', { folderId });
  }

  updateSyncFolder(folderId: string, updates: Partial<SyncFolder>): void {
    const folder = this.syncFolders.get(folderId);
    if (folder) {
      Object.assign(folder, updates);
      this.emit('syncFolder:updated', folder);
    }
  }

  getSyncFolders(): SyncFolder[] {
    return Array.from(this.syncFolders.values());
  }

  // Sync control
  syncNow(folderId?: string): void {
    if (folderId) {
      const folder = this.syncFolders.get(folderId);
      if (folder) {
        folder.status = 'syncing';
        this.emit('sync:started', { folderId });
      }
    } else {
      this.globalStatus = 'syncing';
      for (const folder of this.syncFolders.values()) {
        folder.status = 'syncing';
      }
      this.emit('sync:started', { all: true });
    }
  }

  pauseSync(folderId?: string): void {
    if (folderId) {
      const folder = this.syncFolders.get(folderId);
      if (folder) {
        folder.status = 'paused';
        this.emit('sync:paused', { folderId });
      }
    } else {
      this.globalStatus = 'paused';
      for (const folder of this.syncFolders.values()) {
        folder.status = 'paused';
      }
      this.emit('sync:paused', { all: true });
    }
  }

  resumeSync(folderId?: string): void {
    if (folderId) {
      const folder = this.syncFolders.get(folderId);
      if (folder && folder.status === 'paused') {
        folder.status = 'syncing';
        this.emit('sync:resumed', { folderId });
      }
    } else {
      if (this.globalStatus === 'paused') {
        this.globalStatus = 'syncing';
        for (const folder of this.syncFolders.values()) {
          if (folder.status === 'paused') {
            folder.status = 'syncing';
          }
        }
        this.emit('sync:resumed', { all: true });
      }
    }
  }

  getStatus(): { global: SyncStatus; folders: Record<string, SyncStatus> } {
    const folders: Record<string, SyncStatus> = {};
    for (const [id, folder] of this.syncFolders) {
      folders[id] = folder.status;
    }
    return { global: this.globalStatus, folders };
  }

  // Conflict resolution
  getConflicts(): SyncConflict[] {
    return Array.from(this.conflicts.values()).filter(c => c.status === 'pending');
  }

  resolveConflict(conflictId: string, resolution: 'local' | 'remote' | 'both'): void {
    const conflict = this.conflicts.get(conflictId);
    if (conflict) {
      conflict.status = 'resolved';
      this.emit('conflict:resolved', { conflictId, resolution });
    }
  }

  // Sharing
  shareItem(path: string, recipients: ShareRecipient[], permissions: SharePermissions): SharedItem {
    const shared: SharedItem = {
      id: this.generateId(),
      path,
      sharedWith: recipients,
      permissions,
      created: Date.now()
    };

    this.sharedItems.set(shared.id, shared);
    this.emit('share:created', shared);
    return shared;
  }

  createShareLink(path: string, permissions: SharePermissions, expires?: number): SharedItem {
    const shared: SharedItem = {
      id: this.generateId(),
      path,
      sharedWith: [],
      shareLink: `https://nexus.dex/share/${this.generateId()}`,
      permissions,
      created: Date.now(),
      expires
    };

    this.sharedItems.set(shared.id, shared);
    this.emit('shareLink:created', shared);
    return shared;
  }

  updateShare(shareId: string, updates: Partial<SharedItem>): void {
    const share = this.sharedItems.get(shareId);
    if (share) {
      Object.assign(share, updates);
      this.emit('share:updated', share);
    }
  }

  removeShare(shareId: string): void {
    this.sharedItems.delete(shareId);
    this.emit('share:removed', { shareId });
  }

  getSharedItems(): SharedItem[] {
    return Array.from(this.sharedItems.values());
  }

  // Activity
  getActivity(limit: number = 50): SyncActivity[] {
    return this.activities.slice(-limit).reverse();
  }

  clearActivity(): void {
    this.activities = [];
    this.emit('activity:cleared');
  }

  // File versions
  getVersions(path: string): void {
    this.emit('versions:get', { path });
  }

  restoreVersion(path: string, versionId: string): void {
    this.emit('version:restore', { path, versionId });
  }

  // Selective sync
  setSelectiveSync(folderId: string, paths: string[]): void {
    this.emit('selectiveSync:set', { folderId, paths });
  }

  // Bandwidth
  setBandwidthLimit(uploadKbps: number, downloadKbps: number): void {
    this.emit('bandwidth:set', { uploadKbps, downloadKbps });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ===========================================================================
// EXPORTS
// ===========================================================================

export const createNotesComplete = () => new NotesComplete();
export const createBrowserComplete = () => new BrowserComplete();
export const createFilesComplete = () => new FilesComplete();
export const createNexusComplete = () => new NexusComplete();

export default {
  NotesComplete,
  BrowserComplete,
  FilesComplete,
  NexusComplete
};
