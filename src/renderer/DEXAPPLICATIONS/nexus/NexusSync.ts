// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - NEXUS Cloud - Sync Engine
// Cloud synchronization with version control and conflict resolution
// Items 701-725 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface SyncConfig {
  provider: CloudProvider;
  endpoint: string;
  apiKey?: string;
  autoSync: boolean;
  syncInterval: number;
  conflictResolution: ConflictStrategy;
  compression: boolean;
  encryption: boolean;
  bandwidth: 'low' | 'normal' | 'unlimited';
  offlineMode: boolean;
  maxVersions: number;
}

export type CloudProvider = 'nexus' | 'aws' | 'gcp' | 'azure' | 'dropbox' | 'gdrive' | 'onedrive' | 'custom';

export type ConflictStrategy = 'local-wins' | 'remote-wins' | 'newest-wins' | 'merge' | 'manual';

export interface SyncState {
  status: SyncStatus;
  lastSync: number;
  pendingChanges: number;
  progress: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  errors: SyncError[];
}

export type SyncStatus = 'idle' | 'syncing' | 'paused' | 'offline' | 'error' | 'conflict';

export interface SyncError {
  code: string;
  message: string;
  file?: string;
  timestamp: number;
  recoverable: boolean;
}

// =============================================================================
// ITEM 701-705: FILE SYNC
// =============================================================================

export interface SyncedFile {
  id: string;
  path: string;
  localPath: string;
  remotePath: string;
  size: number;
  hash: string;
  mimeType: string;
  version: number;
  localModified: number;
  remoteModified: number;
  syncStatus: FileSyncStatus;
  conflictState?: ConflictState;
}

export type FileSyncStatus = 
  | 'synced' | 'modified-local' | 'modified-remote' | 'modified-both'
  | 'new-local' | 'new-remote' | 'deleted-local' | 'deleted-remote'
  | 'syncing' | 'error' | 'conflict' | 'ignored';

export interface ConflictState {
  localVersion: FileVersion;
  remoteVersion: FileVersion;
  baseVersion?: FileVersion;
  resolution?: ConflictResolution;
}

export interface ConflictResolution {
  strategy: ConflictStrategy;
  resolvedAt: number;
  resolvedBy?: string;
  mergedContent?: string;
}

export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  hash: string;
  size: number;
  content?: ArrayBuffer;
  author?: string;
  message?: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

// =============================================================================
// ITEM 706-710: VERSION CONTROL
// =============================================================================

export interface VersionHistory {
  fileId: string;
  versions: FileVersion[];
  current: number;
  maxVersions: number;
}

export interface Commit {
  id: string;
  parentId?: string;
  message: string;
  author: string;
  timestamp: number;
  changes: FileChange[];
  hash: string;
  tags?: string[];
}

export interface FileChange {
  fileId: string;
  path: string;
  type: 'add' | 'modify' | 'delete' | 'rename' | 'move';
  oldPath?: string;
  beforeHash?: string;
  afterHash?: string;
  diff?: string;
}

export interface Branch {
  name: string;
  headCommit: string;
  isDefault: boolean;
  protected: boolean;
  created: number;
  lastCommit: number;
}

export interface DiffResult {
  file: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  isBinary: boolean;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

// =============================================================================
// ITEM 711-715: CONFLICT RESOLUTION
// =============================================================================

export interface MergeResult {
  success: boolean;
  conflicts: MergeConflict[];
  mergedContent?: string;
  stats: {
    additions: number;
    deletions: number;
    conflictMarkers: number;
  };
}

export interface MergeConflict {
  id: string;
  file: string;
  start: number;
  end: number;
  localContent: string;
  remoteContent: string;
  baseContent?: string;
  resolved: boolean;
  resolution?: 'local' | 'remote' | 'both' | 'custom';
  customResolution?: string;
}

// =============================================================================
// ITEM 716-720: SYNC QUEUE & OPERATIONS
// =============================================================================

export interface SyncOperation {
  id: string;
  type: 'upload' | 'download' | 'delete' | 'move' | 'conflict-resolve';
  fileId: string;
  path: string;
  priority: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  size: number;
  bytesTransferred: number;
  startTime?: number;
  endTime?: number;
  retries: number;
  maxRetries: number;
  error?: SyncError;
}

export interface SyncQueue {
  operations: SyncOperation[];
  maxConcurrent: number;
  paused: boolean;
  totalBytes: number;
  transferredBytes: number;
}

// =============================================================================
// ITEM 721-725: SYNC ENGINE
// =============================================================================

export class SyncEngine {
  private config: SyncConfig;
  private state: SyncState;
  private files: Map<string, SyncedFile> = new Map();
  private versions: Map<string, VersionHistory> = new Map();
  private commits: Map<string, Commit> = new Map();
  private branches: Map<string, Branch> = new Map();
  private queue: SyncQueue;
  private currentBranch: string = 'main';
  private listeners: Map<string, Set<(event: SyncEvent) => void>> = new Map();
  
  constructor(config?: Partial<SyncConfig>) {
    this.config = {
      provider: 'nexus',
      endpoint: 'https://api.nexus.dex.app',
      autoSync: true,
      syncInterval: 30000,
      conflictResolution: 'manual',
      compression: true,
      encryption: true,
      bandwidth: 'normal',
      offlineMode: true,
      maxVersions: 50,
      ...config
    };
    
    this.state = {
      status: 'idle',
      lastSync: 0,
      pendingChanges: 0,
      progress: 0,
      bytesUploaded: 0,
      bytesDownloaded: 0,
      errors: []
    };
    
    this.queue = {
      operations: [],
      maxConcurrent: 3,
      paused: false,
      totalBytes: 0,
      transferredBytes: 0
    };
    
    // Initialize default branch
    this.branches.set('main', {
      name: 'main',
      headCommit: '',
      isDefault: true,
      protected: false,
      created: Date.now(),
      lastCommit: Date.now()
    });
    
    if (this.config.autoSync) {
      this.startAutoSync();
    }
  }
  
  // File tracking
  trackFile(path: string, localPath: string): SyncedFile {
    const id = this.generateId();
    const file: SyncedFile = {
      id,
      path,
      localPath,
      remotePath: path,
      size: 0,
      hash: '',
      mimeType: this.getMimeType(path),
      version: 1,
      localModified: Date.now(),
      remoteModified: 0,
      syncStatus: 'new-local'
    };
    
    this.files.set(id, file);
    this.emit('file-tracked', { file });
    
    return file;
  }
  
  untrackFile(fileId: string): void {
    const file = this.files.get(fileId);
    if (file) {
      this.files.delete(fileId);
      this.versions.delete(fileId);
      this.emit('file-untracked', { file });
    }
  }
  
  updateFileHash(fileId: string, hash: string, size: number): void {
    const file = this.files.get(fileId);
    if (file) {
      const oldHash = file.hash;
      file.hash = hash;
      file.size = size;
      file.localModified = Date.now();
      
      if (oldHash && oldHash !== hash) {
        file.syncStatus = 'modified-local';
        this.state.pendingChanges++;
        this.addVersion(fileId, hash, size);
      }
      
      this.emit('file-changed', { file, oldHash, newHash: hash });
    }
  }
  
  // Version control
  private addVersion(fileId: string, hash: string, size: number): void {
    let history = this.versions.get(fileId);
    
    if (!history) {
      history = {
        fileId,
        versions: [],
        current: 0,
        maxVersions: this.config.maxVersions
      };
      this.versions.set(fileId, history);
    }
    
    const version: FileVersion = {
      id: this.generateId(),
      fileId,
      version: history.versions.length + 1,
      hash,
      size,
      timestamp: Date.now(),
      metadata: {}
    };
    
    history.versions.push(version);
    history.current = history.versions.length - 1;
    
    // Prune old versions
    if (history.versions.length > history.maxVersions) {
      history.versions.shift();
      history.current--;
    }
  }
  
  getVersionHistory(fileId: string): VersionHistory | undefined {
    return this.versions.get(fileId);
  }
  
  restoreVersion(fileId: string, versionIndex: number): FileVersion | null {
    const history = this.versions.get(fileId);
    if (!history || versionIndex < 0 || versionIndex >= history.versions.length) {
      return null;
    }
    
    const version = history.versions[versionIndex];
    history.current = versionIndex;
    
    const file = this.files.get(fileId);
    if (file) {
      file.hash = version.hash;
      file.size = version.size;
      file.localModified = Date.now();
      file.syncStatus = 'modified-local';
    }
    
    this.emit('version-restored', { fileId, version });
    return version;
  }
  
  // Commits
  commit(message: string, author: string, files?: string[]): Commit {
    const changes: FileChange[] = [];
    const filesToCommit = files || Array.from(this.files.keys());
    
    for (const fileId of filesToCommit) {
      const file = this.files.get(fileId);
      if (!file) continue;
      
      if (file.syncStatus === 'new-local') {
        changes.push({
          fileId,
          path: file.path,
          type: 'add',
          afterHash: file.hash
        });
      } else if (file.syncStatus === 'modified-local' || file.syncStatus === 'modified-both') {
        const history = this.versions.get(fileId);
        const prevVersion = history?.versions[history.versions.length - 2];
        changes.push({
          fileId,
          path: file.path,
          type: 'modify',
          beforeHash: prevVersion?.hash,
          afterHash: file.hash
        });
      } else if (file.syncStatus === 'deleted-local') {
        changes.push({
          fileId,
          path: file.path,
          type: 'delete',
          beforeHash: file.hash
        });
      }
    }
    
    if (changes.length === 0) {
      throw new Error('No changes to commit');
    }
    
    const branch = this.branches.get(this.currentBranch)!;
    
    const commit: Commit = {
      id: this.generateId(),
      parentId: branch.headCommit || undefined,
      message,
      author,
      timestamp: Date.now(),
      changes,
      hash: this.generateHash(changes)
    };
    
    this.commits.set(commit.id, commit);
    branch.headCommit = commit.id;
    branch.lastCommit = Date.now();
    
    // Update file statuses
    for (const change of changes) {
      const file = this.files.get(change.fileId);
      if (file && change.type !== 'delete') {
        file.syncStatus = 'synced';
      }
    }
    
    this.state.pendingChanges = 0;
    this.emit('commit', { commit });
    
    return commit;
  }
  
  // Branch management
  createBranch(name: string, fromBranch?: string): Branch {
    if (this.branches.has(name)) {
      throw new Error(`Branch "${name}" already exists`);
    }
    
    const sourceBranch = this.branches.get(fromBranch || this.currentBranch)!;
    
    const branch: Branch = {
      name,
      headCommit: sourceBranch.headCommit,
      isDefault: false,
      protected: false,
      created: Date.now(),
      lastCommit: sourceBranch.lastCommit
    };
    
    this.branches.set(name, branch);
    this.emit('branch-created', { branch });
    
    return branch;
  }
  
  switchBranch(name: string): void {
    if (!this.branches.has(name)) {
      throw new Error(`Branch "${name}" does not exist`);
    }
    
    const oldBranch = this.currentBranch;
    this.currentBranch = name;
    
    this.emit('branch-switched', { oldBranch, newBranch: name });
  }
  
  deleteBranch(name: string): void {
    const branch = this.branches.get(name);
    if (!branch) {
      throw new Error(`Branch "${name}" does not exist`);
    }
    
    if (branch.protected) {
      throw new Error(`Branch "${name}" is protected`);
    }
    
    if (name === this.currentBranch) {
      throw new Error('Cannot delete current branch');
    }
    
    this.branches.delete(name);
    this.emit('branch-deleted', { branch });
  }
  
  // Conflict resolution
  detectConflicts(fileId: string): ConflictState | null {
    const file = this.files.get(fileId);
    if (!file || file.syncStatus !== 'modified-both') {
      return null;
    }
    
    const history = this.versions.get(fileId);
    if (!history || history.versions.length < 2) {
      return null;
    }
    
    return {
      localVersion: history.versions[history.current],
      remoteVersion: {
        id: this.generateId(),
        fileId,
        version: history.current + 1,
        hash: 'remote-' + file.hash,
        size: file.size,
        timestamp: file.remoteModified,
        metadata: {}
      },
      baseVersion: history.versions[history.current - 1]
    };
  }
  
  resolveConflict(fileId: string, resolution: ConflictResolution): void {
    const file = this.files.get(fileId);
    if (!file || !file.conflictState) return;
    
    file.conflictState.resolution = resolution;
    
    switch (resolution.strategy) {
      case 'local-wins':
        // Keep local version, upload to remote
        file.syncStatus = 'modified-local';
        break;
      case 'remote-wins':
        // Download remote version
        file.syncStatus = 'modified-remote';
        break;
      case 'merge':
        // Apply merged content
        if (resolution.mergedContent) {
          file.hash = this.generateHash(resolution.mergedContent);
          file.syncStatus = 'modified-local';
        }
        break;
      case 'newest-wins':
        if (file.localModified > file.remoteModified) {
          file.syncStatus = 'modified-local';
        } else {
          file.syncStatus = 'modified-remote';
        }
        break;
    }
    
    file.conflictState = undefined;
    this.emit('conflict-resolved', { file, resolution });
  }
  
  // Three-way merge
  threeWayMerge(base: string, local: string, remote: string): MergeResult {
    const baseLines = base.split('\n');
    const localLines = local.split('\n');
    const remoteLines = remote.split('\n');
    
    const conflicts: MergeConflict[] = [];
    const mergedLines: string[] = [];
    let additions = 0;
    let deletions = 0;
    
    const maxLines = Math.max(baseLines.length, localLines.length, remoteLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const baseLine = baseLines[i];
      const localLine = localLines[i];
      const remoteLine = remoteLines[i];
      
      if (localLine === remoteLine) {
        // Both same, use either
        if (localLine !== undefined) {
          mergedLines.push(localLine);
        }
      } else if (localLine === baseLine) {
        // Local unchanged, use remote
        if (remoteLine !== undefined) {
          mergedLines.push(remoteLine);
          if (baseLine === undefined) additions++;
        } else {
          deletions++;
        }
      } else if (remoteLine === baseLine) {
        // Remote unchanged, use local
        if (localLine !== undefined) {
          mergedLines.push(localLine);
          if (baseLine === undefined) additions++;
        } else {
          deletions++;
        }
      } else {
        // Conflict
        conflicts.push({
          id: this.generateId(),
          file: '',
          start: i,
          end: i + 1,
          localContent: localLine || '',
          remoteContent: remoteLine || '',
          baseContent: baseLine,
          resolved: false
        });
        
        // Add conflict markers
        mergedLines.push('<<<<<<< LOCAL');
        if (localLine !== undefined) mergedLines.push(localLine);
        mergedLines.push('=======');
        if (remoteLine !== undefined) mergedLines.push(remoteLine);
        mergedLines.push('>>>>>>> REMOTE');
      }
    }
    
    return {
      success: conflicts.length === 0,
      conflicts,
      mergedContent: mergedLines.join('\n'),
      stats: {
        additions,
        deletions,
        conflictMarkers: conflicts.length
      }
    };
  }
  
  // Sync operations
  async sync(): Promise<void> {
    if (this.state.status === 'syncing') return;
    
    this.state.status = 'syncing';
    this.state.progress = 0;
    this.emit('sync-start', {});
    
    try {
      // Check for remote changes
      await this.fetchRemoteChanges();
      
      // Queue uploads for local changes
      for (const file of this.files.values()) {
        if (file.syncStatus === 'new-local' || file.syncStatus === 'modified-local') {
          this.queueOperation({
            id: this.generateId(),
            type: 'upload',
            fileId: file.id,
            path: file.path,
            priority: 1,
            status: 'pending',
            progress: 0,
            size: file.size,
            bytesTransferred: 0,
            retries: 0,
            maxRetries: 3
          });
        } else if (file.syncStatus === 'new-remote' || file.syncStatus === 'modified-remote') {
          this.queueOperation({
            id: this.generateId(),
            type: 'download',
            fileId: file.id,
            path: file.path,
            priority: 1,
            status: 'pending',
            progress: 0,
            size: file.size,
            bytesTransferred: 0,
            retries: 0,
            maxRetries: 3
          });
        } else if (file.syncStatus === 'modified-both') {
          file.conflictState = this.detectConflicts(file.id) || undefined;
          this.emit('conflict-detected', { file });
        }
      }
      
      // Process queue
      await this.processQueue();
      
      this.state.status = 'idle';
      this.state.lastSync = Date.now();
      this.state.progress = 100;
      
      this.emit('sync-complete', { 
        uploaded: this.state.bytesUploaded,
        downloaded: this.state.bytesDownloaded
      });
    } catch (error) {
      this.state.status = 'error';
      const syncError: SyncError = {
        code: 'SYNC_FAILED',
        message: error instanceof Error ? error.message : 'Sync failed',
        timestamp: Date.now(),
        recoverable: true
      };
      this.state.errors.push(syncError);
      this.emit('sync-error', { error: syncError });
    }
  }
  
  private async fetchRemoteChanges(): Promise<void> {
    // Simulated remote fetch
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  private queueOperation(operation: SyncOperation): void {
    this.queue.operations.push(operation);
    this.queue.totalBytes += operation.size;
    this.queue.operations.sort((a, b) => b.priority - a.priority);
  }
  
  private async processQueue(): Promise<void> {
    const concurrent: Promise<void>[] = [];
    
    for (const operation of this.queue.operations) {
      if (operation.status !== 'pending') continue;
      
      if (concurrent.length >= this.queue.maxConcurrent) {
        await Promise.race(concurrent);
      }
      
      const promise = this.executeOperation(operation);
      concurrent.push(promise);
    }
    
    await Promise.all(concurrent);
  }
  
  private async executeOperation(operation: SyncOperation): Promise<void> {
    operation.status = 'in-progress';
    operation.startTime = Date.now();
    
    try {
      // Simulated transfer
      const chunkSize = operation.size / 10;
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        operation.bytesTransferred += chunkSize;
        operation.progress = (operation.bytesTransferred / operation.size) * 100;
        
        if (operation.type === 'upload') {
          this.state.bytesUploaded += chunkSize;
        } else {
          this.state.bytesDownloaded += chunkSize;
        }
        
        this.queue.transferredBytes += chunkSize;
        this.state.progress = (this.queue.transferredBytes / this.queue.totalBytes) * 100;
      }
      
      operation.status = 'completed';
      operation.endTime = Date.now();
      
      // Update file status
      const file = this.files.get(operation.fileId);
      if (file) {
        file.syncStatus = 'synced';
        file.remoteModified = Date.now();
      }
      
      this.emit('operation-complete', { operation });
    } catch (error) {
      operation.retries++;
      
      if (operation.retries < operation.maxRetries) {
        operation.status = 'pending';
      } else {
        operation.status = 'failed';
        operation.error = {
          code: 'OPERATION_FAILED',
          message: error instanceof Error ? error.message : 'Operation failed',
          file: operation.path,
          timestamp: Date.now(),
          recoverable: false
        };
      }
      
      this.emit('operation-error', { operation, error });
    }
  }
  
  // Auto sync
  private autoSyncInterval?: ReturnType<typeof setInterval>;
  
  private startAutoSync(): void {
    this.autoSyncInterval = setInterval(() => {
      if (this.state.pendingChanges > 0 && this.state.status === 'idle') {
        this.sync();
      }
    }, this.config.syncInterval);
  }
  
  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }
  }
  
  // Diff generation
  generateDiff(oldContent: string, newContent: string): DiffResult {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const hunks: DiffHunk[] = [];
    let additions = 0;
    let deletions = 0;
    
    let i = 0, j = 0;
    
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        // Lines match, advance both
        i++;
        j++;
      } else {
        // Found a difference, create a hunk
        const hunk: DiffHunk = {
          oldStart: i + 1,
          oldLines: 0,
          newStart: j + 1,
          newLines: 0,
          lines: []
        };
        
        // Add context before (up to 3 lines)
        const contextStart = Math.max(0, i - 3);
        for (let c = contextStart; c < i; c++) {
          hunk.lines.push({
            type: 'context',
            content: oldLines[c],
            oldLineNumber: c + 1,
            newLineNumber: c + 1
          });
        }
        
        // Find how many lines differ
        while (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
          hunk.lines.push({
            type: 'delete',
            content: oldLines[i],
            oldLineNumber: i + 1
          });
          hunk.oldLines++;
          deletions++;
          i++;
        }
        
        while (j < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[j])) {
          hunk.lines.push({
            type: 'add',
            content: newLines[j],
            newLineNumber: j + 1
          });
          hunk.newLines++;
          additions++;
          j++;
        }
        
        if (hunk.lines.length > 0) {
          hunks.push(hunk);
        }
      }
    }
    
    return {
      file: '',
      hunks,
      additions,
      deletions,
      isBinary: false
    };
  }
  
  // Event handling
  on(event: string, callback: (event: SyncEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: SyncEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const syncEvent: SyncEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(syncEvent));
    }
  }
  
  // State access
  getState(): SyncState {
    return { ...this.state };
  }
  
  getFiles(): SyncedFile[] {
    return Array.from(this.files.values());
  }
  
  getFile(fileId: string): SyncedFile | undefined {
    return this.files.get(fileId);
  }
  
  getBranches(): Branch[] {
    return Array.from(this.branches.values());
  }
  
  getCurrentBranch(): Branch | undefined {
    return this.branches.get(this.currentBranch);
  }
  
  getCommits(branchName?: string): Commit[] {
    const branch = this.branches.get(branchName || this.currentBranch);
    if (!branch) return [];
    
    const commits: Commit[] = [];
    let commitId = branch.headCommit;
    
    while (commitId) {
      const commit = this.commits.get(commitId);
      if (commit) {
        commits.push(commit);
        commitId = commit.parentId || '';
      } else {
        break;
      }
    }
    
    return commits;
  }
  
  // Utilities
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private generateHash(data: unknown): string {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
  
  private getMimeType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'text/javascript',
      'ts': 'text/typescript',
      'json': 'application/json',
      'xml': 'application/xml',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface SyncEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createSyncEngine = (config?: Partial<SyncConfig>) => new SyncEngine(config);

export default { SyncEngine, createSyncEngine };
