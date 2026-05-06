// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - FILES Manager - Core Engine
// File operations, multi-pane navigation, and preview
// Items 851-875 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// ITEM 851-855: FILE SYSTEM TYPES
// =============================================================================

export interface FileEntry {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  type: FileType;
  mimeType: string;
  size: number;
  created: number;
  modified: number;
  accessed: number;
  permissions: FilePermissions;
  isHidden: boolean;
  isSystem: boolean;
  isSymlink: boolean;
  symlinkTarget?: string;
  icon?: string;
  thumbnail?: string;
  metadata?: FileMetadata;
}

export type FileType = 
  | 'file' | 'directory' | 'symlink' | 'socket'
  | 'block' | 'character' | 'fifo' | 'unknown';

export interface FilePermissions {
  readable: boolean;
  writable: boolean;
  executable: boolean;
  owner: string;
  group: string;
  mode: number;
}

export interface FileMetadata {
  // Image
  width?: number;
  height?: number;
  dpi?: number;
  colorSpace?: string;
  // Audio/Video
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  // Document
  pageCount?: number;
  author?: string;
  title?: string;
  // Archive
  compressedSize?: number;
  fileCount?: number;
  // Tags
  tags?: string[];
  rating?: number;
  comment?: string;
}

export const FILE_TYPE_ICONS: Record<string, string> = {
  'directory': 'folder',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'file-image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'music',
  'audio/wav': 'music',
  'audio/ogg': 'music',
  'application/pdf': 'file-pdf',
  'application/zip': 'archive',
  'application/x-rar': 'archive',
  'application/x-7z-compressed': 'archive',
  'text/plain': 'file-text',
  'text/html': 'file-code',
  'text/css': 'file-code',
  'text/javascript': 'file-code',
  'application/json': 'file-code',
  'application/x-executable': 'terminal',
  'default': 'file'
};

export const MIME_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar',
  '.7z': 'application/x-7z-compressed',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.json': 'application/json',
  '.md': 'text/markdown'
};

// =============================================================================
// ITEM 856-860: NAVIGATION & VIEWS
// =============================================================================

export interface FilePane {
  id: string;
  path: string;
  entries: FileEntry[];
  selectedIds: Set<string>;
  sortBy: SortField;
  sortDirection: 'asc' | 'desc';
  viewMode: ViewMode;
  filter: FileFilter;
  history: string[];
  historyIndex: number;
  isLoading: boolean;
}

export type ViewMode = 'icons' | 'list' | 'columns' | 'gallery' | 'details';

export type SortField = 'name' | 'size' | 'type' | 'modified' | 'created';

export interface FileFilter {
  search: string;
  types: FileType[];
  extensions: string[];
  sizeMin?: number;
  sizeMax?: number;
  dateAfter?: number;
  dateBefore?: number;
  showHidden: boolean;
}

export interface ColumnConfig {
  field: string;
  label: string;
  width: number;
  visible: boolean;
  sortable: boolean;
}

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { field: 'name', label: 'Name', width: 300, visible: true, sortable: true },
  { field: 'size', label: 'Size', width: 100, visible: true, sortable: true },
  { field: 'type', label: 'Kind', width: 150, visible: true, sortable: true },
  { field: 'modified', label: 'Modified', width: 150, visible: true, sortable: true },
  { field: 'created', label: 'Created', width: 150, visible: false, sortable: true },
  { field: 'permissions', label: 'Permissions', width: 100, visible: false, sortable: false }
];

// =============================================================================
// ITEM 861-865: FILE OPERATIONS
// =============================================================================

export interface FileOperation {
  id: string;
  type: OperationType;
  sources: string[];
  destination?: string;
  status: OperationStatus;
  progress: number;
  bytesTotal: number;
  bytesCopied: number;
  filesTotal: number;
  filesDone: number;
  currentFile?: string;
  startTime: number;
  endTime?: number;
  error?: string;
  conflicts: FileConflict[];
}

export type OperationType = 'copy' | 'move' | 'delete' | 'rename' | 'compress' | 'extract';

export type OperationStatus = 'pending' | 'running' | 'paused' | 'complete' | 'error' | 'cancelled';

export interface FileConflict {
  id: string;
  sourcePath: string;
  destPath: string;
  sourceEntry: FileEntry;
  destEntry: FileEntry;
  resolution?: ConflictResolution;
}

export type ConflictResolution = 'overwrite' | 'skip' | 'rename' | 'merge' | 'keep-both';

// =============================================================================
// ITEM 866-870: PREVIEW
// =============================================================================

export interface PreviewState {
  isOpen: boolean;
  entry?: FileEntry;
  content?: PreviewContent;
  isLoading: boolean;
  zoom: number;
  rotation: number;
  page: number;
  totalPages: number;
}

export type PreviewContent = 
  | { type: 'image'; dataUrl: string; width: number; height: number }
  | { type: 'video'; url: string; duration: number }
  | { type: 'audio'; url: string; duration: number }
  | { type: 'text'; content: string; language: string }
  | { type: 'pdf'; url: string; pageCount: number }
  | { type: 'markdown'; html: string }
  | { type: 'unsupported'; message: string };

export const PREVIEWABLE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/markdown',
  'application/json', 'application/pdf'
];

// =============================================================================
// ITEM 871-875: FILES CORE ENGINE
// =============================================================================

export class FilesEngine {
  private panes: Map<string, FilePane> = new Map();
  private operations: Map<string, FileOperation> = new Map();
  private clipboard: { mode: 'copy' | 'cut'; paths: string[] } | null = null;
  private preview: PreviewState;
  private favorites: string[] = [];
  private recentPaths: string[] = [];
  private listeners: Map<string, Set<(event: FilesEvent) => void>> = new Map();
  private columnConfig: ColumnConfig[] = [...DEFAULT_COLUMNS];
  
  constructor() {
    this.preview = {
      isOpen: false,
      isLoading: false,
      zoom: 100,
      rotation: 0,
      page: 1,
      totalPages: 1
    };
    
    // Create default pane
    this.createPane('/');
  }
  
  // Pane management
  createPane(path: string): FilePane {
    const pane: FilePane = {
      id: this.generateId('pane'),
      path,
      entries: [],
      selectedIds: new Set(),
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      filter: {
        search: '',
        types: [],
        extensions: [],
        showHidden: false
      },
      history: [path],
      historyIndex: 0,
      isLoading: false
    };
    
    this.panes.set(pane.id, pane);
    this.loadDirectory(pane.id, path);
    
    this.emit('pane-created', { pane });
    return pane;
  }
  
  closePane(paneId: string): void {
    if (this.panes.size <= 1) return;
    
    this.panes.delete(paneId);
    this.emit('pane-closed', { paneId });
  }
  
  getPane(paneId: string): FilePane | undefined {
    return this.panes.get(paneId);
  }
  
  getAllPanes(): FilePane[] {
    return Array.from(this.panes.values());
  }
  
  // Navigation
  navigate(paneId: string, path: string, addToHistory: boolean = true): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    if (addToHistory) {
      // Truncate forward history
      pane.history = pane.history.slice(0, pane.historyIndex + 1);
      pane.history.push(path);
      pane.historyIndex = pane.history.length - 1;
    }
    
    pane.path = path;
    pane.selectedIds.clear();
    
    this.addToRecent(path);
    this.loadDirectory(paneId, path);
    
    this.emit('navigated', { paneId, path });
  }
  
  goBack(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane || pane.historyIndex <= 0) return;
    
    pane.historyIndex--;
    this.navigate(paneId, pane.history[pane.historyIndex], false);
  }
  
  goForward(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane || pane.historyIndex >= pane.history.length - 1) return;
    
    pane.historyIndex++;
    this.navigate(paneId, pane.history[pane.historyIndex], false);
  }
  
  goUp(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    const parentPath = pane.path.split('/').slice(0, -1).join('/') || '/';
    this.navigate(paneId, parentPath);
  }
  
  goHome(paneId: string): void {
    this.navigate(paneId, '~');
  }
  
  refresh(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (pane) {
      this.loadDirectory(paneId, pane.path);
    }
  }
  
  private loadDirectory(paneId: string, path: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    pane.isLoading = true;
    this.emit('loading-started', { paneId });
    
    // Simulate loading directory entries
    setTimeout(() => {
      pane.entries = this.generateMockEntries(path);
      pane.isLoading = false;
      this.applyFilterAndSort(paneId);
      this.emit('loading-complete', { paneId, entries: pane.entries });
    }, 100);
  }
  
  private generateMockEntries(path: string): FileEntry[] {
    const entries: FileEntry[] = [];
    const now = Date.now();
    
    // Generate some mock directories
    for (let i = 0; i < 5; i++) {
      entries.push({
        id: this.generateId('dir'),
        name: `Folder ${i + 1}`,
        path: `${path}/Folder ${i + 1}`,
        parentPath: path,
        type: 'directory',
        mimeType: 'inode/directory',
        size: 0,
        created: now - Math.random() * 10000000000,
        modified: now - Math.random() * 1000000000,
        accessed: now,
        permissions: { readable: true, writable: true, executable: true, owner: 'user', group: 'users', mode: 0o755 },
        isHidden: false,
        isSystem: false,
        isSymlink: false
      });
    }
    
    // Generate some mock files
    const fileTypes = ['.txt', '.jpg', '.mp3', '.pdf', '.zip', '.html'];
    for (let i = 0; i < 10; i++) {
      const ext = fileTypes[Math.floor(Math.random() * fileTypes.length)];
      const name = `File ${i + 1}${ext}`;
      entries.push({
        id: this.generateId('file'),
        name,
        path: `${path}/${name}`,
        parentPath: path,
        type: 'file',
        mimeType: MIME_TYPE_MAP[ext] || 'application/octet-stream',
        size: Math.floor(Math.random() * 10000000),
        created: now - Math.random() * 10000000000,
        modified: now - Math.random() * 1000000000,
        accessed: now,
        permissions: { readable: true, writable: true, executable: false, owner: 'user', group: 'users', mode: 0o644 },
        isHidden: Math.random() > 0.9,
        isSystem: false,
        isSymlink: false
      });
    }
    
    return entries;
  }
  
  // Selection
  select(paneId: string, entryId: string, multi: boolean = false): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    if (!multi) {
      pane.selectedIds.clear();
    }
    
    pane.selectedIds.add(entryId);
    this.emit('selection-changed', { paneId, selectedIds: Array.from(pane.selectedIds) });
  }
  
  deselect(paneId: string, entryId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    pane.selectedIds.delete(entryId);
    this.emit('selection-changed', { paneId, selectedIds: Array.from(pane.selectedIds) });
  }
  
  selectAll(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    pane.selectedIds = new Set(pane.entries.map(e => e.id));
    this.emit('selection-changed', { paneId, selectedIds: Array.from(pane.selectedIds) });
  }
  
  selectNone(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    pane.selectedIds.clear();
    this.emit('selection-changed', { paneId, selectedIds: [] });
  }
  
  invertSelection(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    const newSelection = new Set<string>();
    for (const entry of pane.entries) {
      if (!pane.selectedIds.has(entry.id)) {
        newSelection.add(entry.id);
      }
    }
    pane.selectedIds = newSelection;
    this.emit('selection-changed', { paneId, selectedIds: Array.from(pane.selectedIds) });
  }
  
  getSelection(paneId: string): FileEntry[] {
    const pane = this.panes.get(paneId);
    if (!pane) return [];
    
    return pane.entries.filter(e => pane.selectedIds.has(e.id));
  }
  
  // View settings
  setViewMode(paneId: string, mode: ViewMode): void {
    const pane = this.panes.get(paneId);
    if (pane) {
      pane.viewMode = mode;
      this.emit('view-mode-changed', { paneId, mode });
    }
  }
  
  setSorting(paneId: string, field: SortField, direction?: 'asc' | 'desc'): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    if (pane.sortBy === field) {
      pane.sortDirection = direction || (pane.sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      pane.sortBy = field;
      pane.sortDirection = direction || 'asc';
    }
    
    this.applyFilterAndSort(paneId);
    this.emit('sorting-changed', { paneId, field: pane.sortBy, direction: pane.sortDirection });
  }
  
  setFilter(paneId: string, filter: Partial<FileFilter>): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    pane.filter = { ...pane.filter, ...filter };
    this.applyFilterAndSort(paneId);
    this.emit('filter-changed', { paneId, filter: pane.filter });
  }
  
  private applyFilterAndSort(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    // Filter
    let filtered = pane.entries.filter(entry => {
      if (!pane.filter.showHidden && entry.isHidden) return false;
      if (pane.filter.search && !entry.name.toLowerCase().includes(pane.filter.search.toLowerCase())) return false;
      if (pane.filter.types.length > 0 && !pane.filter.types.includes(entry.type)) return false;
      if (pane.filter.extensions.length > 0) {
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (!ext || !pane.filter.extensions.includes(`.${ext}`)) return false;
      }
      if (pane.filter.sizeMin !== undefined && entry.size < pane.filter.sizeMin) return false;
      if (pane.filter.sizeMax !== undefined && entry.size > pane.filter.sizeMax) return false;
      if (pane.filter.dateAfter !== undefined && entry.modified < pane.filter.dateAfter) return false;
      if (pane.filter.dateBefore !== undefined && entry.modified > pane.filter.dateBefore) return false;
      return true;
    });
    
    // Sort (directories first)
    filtered.sort((a, b) => {
      // Directories always first
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      
      let comparison = 0;
      switch (pane.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'type':
          comparison = a.mimeType.localeCompare(b.mimeType);
          break;
        case 'modified':
          comparison = a.modified - b.modified;
          break;
        case 'created':
          comparison = a.created - b.created;
          break;
      }
      
      return pane.sortDirection === 'asc' ? comparison : -comparison;
    });
    
    pane.entries = filtered;
  }
  
  // File operations
  copy(paths: string[]): void {
    this.clipboard = { mode: 'copy', paths };
    this.emit('clipboard-changed', { mode: 'copy', paths });
  }
  
  cut(paths: string[]): void {
    this.clipboard = { mode: 'cut', paths };
    this.emit('clipboard-changed', { mode: 'cut', paths });
  }
  
  paste(destinationPath: string): FileOperation | null {
    if (!this.clipboard) return null;
    
    const operation = this.createOperation(
      this.clipboard.mode === 'copy' ? 'copy' : 'move',
      this.clipboard.paths,
      destinationPath
    );
    
    if (this.clipboard.mode === 'cut') {
      this.clipboard = null;
    }
    
    this.runOperation(operation.id);
    return operation;
  }
  
  delete(paths: string[], permanent: boolean = false): FileOperation {
    const operation = this.createOperation('delete', paths);
    this.runOperation(operation.id);
    this.emit('delete-started', { paths, permanent });
    return operation;
  }
  
  rename(path: string, newName: string): FileOperation {
    const operation = this.createOperation('rename', [path], newName);
    this.runOperation(operation.id);
    return operation;
  }
  
  createFolder(paneId: string, name: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    const newFolder: FileEntry = {
      id: this.generateId('dir'),
      name,
      path: `${pane.path}/${name}`,
      parentPath: pane.path,
      type: 'directory',
      mimeType: 'inode/directory',
      size: 0,
      created: Date.now(),
      modified: Date.now(),
      accessed: Date.now(),
      permissions: { readable: true, writable: true, executable: true, owner: 'user', group: 'users', mode: 0o755 },
      isHidden: false,
      isSystem: false,
      isSymlink: false
    };
    
    pane.entries.unshift(newFolder);
    this.applyFilterAndSort(paneId);
    this.emit('folder-created', { paneId, folder: newFolder });
  }
  
  createFile(paneId: string, name: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    
    const ext = name.split('.').pop() || '';
    const newFile: FileEntry = {
      id: this.generateId('file'),
      name,
      path: `${pane.path}/${name}`,
      parentPath: pane.path,
      type: 'file',
      mimeType: MIME_TYPE_MAP[`.${ext}`] || 'application/octet-stream',
      size: 0,
      created: Date.now(),
      modified: Date.now(),
      accessed: Date.now(),
      permissions: { readable: true, writable: true, executable: false, owner: 'user', group: 'users', mode: 0o644 },
      isHidden: name.startsWith('.'),
      isSystem: false,
      isSymlink: false
    };
    
    pane.entries.push(newFile);
    this.applyFilterAndSort(paneId);
    this.emit('file-created', { paneId, file: newFile });
  }
  
  private createOperation(type: OperationType, sources: string[], destination?: string): FileOperation {
    const operation: FileOperation = {
      id: this.generateId('op'),
      type,
      sources,
      destination,
      status: 'pending',
      progress: 0,
      bytesTotal: 0,
      bytesCopied: 0,
      filesTotal: sources.length,
      filesDone: 0,
      startTime: Date.now(),
      conflicts: []
    };
    
    this.operations.set(operation.id, operation);
    this.emit('operation-created', { operation });
    return operation;
  }
  
  private runOperation(operationId: string): void {
    const operation = this.operations.get(operationId);
    if (!operation) return;
    
    operation.status = 'running';
    this.emit('operation-started', { operationId });
    
    // Simulate operation progress
    const interval = setInterval(() => {
      const op = this.operations.get(operationId);
      if (!op || op.status !== 'running') {
        clearInterval(interval);
        return;
      }
      
      op.progress += 10;
      op.filesDone = Math.floor(op.filesTotal * (op.progress / 100));
      
      this.emit('operation-progress', { operationId, progress: op.progress });
      
      if (op.progress >= 100) {
        clearInterval(interval);
        op.status = 'complete';
        op.endTime = Date.now();
        this.emit('operation-complete', { operationId });
      }
    }, 100);
  }
  
  pauseOperation(operationId: string): void {
    const operation = this.operations.get(operationId);
    if (operation && operation.status === 'running') {
      operation.status = 'paused';
      this.emit('operation-paused', { operationId });
    }
  }
  
  resumeOperation(operationId: string): void {
    const operation = this.operations.get(operationId);
    if (operation && operation.status === 'paused') {
      operation.status = 'running';
      this.runOperation(operationId);
      this.emit('operation-resumed', { operationId });
    }
  }
  
  cancelOperation(operationId: string): void {
    const operation = this.operations.get(operationId);
    if (operation && operation.status !== 'complete') {
      operation.status = 'cancelled';
      operation.endTime = Date.now();
      this.emit('operation-cancelled', { operationId });
    }
  }
  
  getOperation(operationId: string): FileOperation | undefined {
    return this.operations.get(operationId);
  }
  
  getActiveOperations(): FileOperation[] {
    return Array.from(this.operations.values())
      .filter(op => op.status === 'running' || op.status === 'paused');
  }
  
  // Preview
  openPreview(entry: FileEntry): void {
    this.preview = {
      isOpen: true,
      entry,
      isLoading: true,
      zoom: 100,
      rotation: 0,
      page: 1,
      totalPages: 1
    };
    
    this.emit('preview-opened', { entry });
    
    // Load preview content
    setTimeout(() => {
      if (entry.mimeType.startsWith('image/')) {
        this.preview.content = { type: 'image', dataUrl: '', width: 800, height: 600 };
      } else if (entry.mimeType.startsWith('video/')) {
        this.preview.content = { type: 'video', url: entry.path, duration: 120 };
      } else if (entry.mimeType.startsWith('audio/')) {
        this.preview.content = { type: 'audio', url: entry.path, duration: 180 };
      } else if (entry.mimeType.startsWith('text/')) {
        this.preview.content = { type: 'text', content: 'Sample file content...', language: 'plaintext' };
      } else if (entry.mimeType === 'application/pdf') {
        this.preview.content = { type: 'pdf', url: entry.path, pageCount: 10 };
        this.preview.totalPages = 10;
      } else {
        this.preview.content = { type: 'unsupported', message: 'Preview not available for this file type' };
      }
      
      this.preview.isLoading = false;
      this.emit('preview-loaded', { content: this.preview.content });
    }, 200);
  }
  
  closePreview(): void {
    this.preview.isOpen = false;
    this.preview.entry = undefined;
    this.preview.content = undefined;
    this.emit('preview-closed', {});
  }
  
  setPreviewZoom(zoom: number): void {
    this.preview.zoom = Math.max(25, Math.min(400, zoom));
    this.emit('preview-zoom-changed', { zoom: this.preview.zoom });
  }
  
  setPreviewRotation(rotation: number): void {
    this.preview.rotation = rotation % 360;
    this.emit('preview-rotation-changed', { rotation: this.preview.rotation });
  }
  
  setPreviewPage(page: number): void {
    this.preview.page = Math.max(1, Math.min(this.preview.totalPages, page));
    this.emit('preview-page-changed', { page: this.preview.page });
  }
  
  getPreviewState(): PreviewState {
    return { ...this.preview };
  }
  
  // Favorites & Recent
  addToFavorites(path: string): void {
    if (!this.favorites.includes(path)) {
      this.favorites.push(path);
      this.emit('favorites-changed', { favorites: this.favorites });
    }
  }
  
  removeFromFavorites(path: string): void {
    this.favorites = this.favorites.filter(p => p !== path);
    this.emit('favorites-changed', { favorites: this.favorites });
  }
  
  getFavorites(): string[] {
    return [...this.favorites];
  }
  
  private addToRecent(path: string): void {
    this.recentPaths = this.recentPaths.filter(p => p !== path);
    this.recentPaths.unshift(path);
    
    if (this.recentPaths.length > 20) {
      this.recentPaths.pop();
    }
  }
  
  getRecentPaths(): string[] {
    return [...this.recentPaths];
  }
  
  // Columns
  getColumnConfig(): ColumnConfig[] {
    return [...this.columnConfig];
  }
  
  setColumnConfig(config: ColumnConfig[]): void {
    this.columnConfig = config;
    this.emit('columns-changed', { columns: this.columnConfig });
  }
  
  // Event handling
  on(event: string, callback: (event: FilesEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: FilesEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const filesEvent: FilesEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(filesEvent));
    }
  }
  
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface FilesEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createFilesEngine = () => new FilesEngine();

export default { FilesEngine, createFilesEngine };
