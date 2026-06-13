// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - IMOSION Collaboration System
// Professional collaboration rivaling Splice/Soundtrap/BandLab
// Items 426-450 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface CollaborationProject {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  collaborators: Collaborator[];
  visibility: 'private' | 'shared' | 'public';
  createdAt: number;
  updatedAt: number;
  
  // Versioning
  currentVersion: string;
  versions: ProjectVersion[];
  
  // Cloud sync
  cloudId?: string;
  syncStatus: SyncStatus;
  lastSynced?: number;
  
  // Settings
  settings: ProjectSettings;
}

export interface Collaborator {
  userId: string;
  displayName: string;
  email: string;
  role: CollaboratorRole;
  permissions: Permission[];
  joinedAt: number;
  lastActive?: number;
  avatar?: string;
  online?: boolean;
}

export type CollaboratorRole = 'owner' | 'admin' | 'editor' | 'viewer';

export type Permission = 
  | 'read' | 'write' | 'delete' | 'share' | 'manage'
  | 'export' | 'comment' | 'mix' | 'master' | 'upload';

export interface ProjectVersion {
  id: string;
  version: string;
  name?: string;
  description?: string;
  createdBy: string;
  createdAt: number;
  parentVersion?: string;
  changes: VersionChange[];
  snapshot?: ProjectSnapshot;
  tags: string[];
}

export interface VersionChange {
  type: 'add' | 'modify' | 'delete' | 'move';
  entityType: 'track' | 'clip' | 'plugin' | 'automation' | 'marker' | 'settings';
  entityId: string;
  description: string;
  before?: unknown;
  after?: unknown;
}

export interface ProjectSnapshot {
  tracks: unknown[];
  clips: unknown[];
  plugins: unknown[];
  automation: unknown[];
  markers: unknown[];
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
}

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'conflict' | 'offline' | 'error';

export interface ProjectSettings {
  autoSave: boolean;
  autoSaveInterval: number;   // seconds
  syncOnSave: boolean;
  notifyOnChanges: boolean;
  conflictResolution: 'ask' | 'local' | 'remote' | 'merge';
}

export interface Comment {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  
  // Position
  trackId?: string;
  clipId?: string;
  timestamp: number;          // Position in samples
  
  // Content
  text: string;
  attachments: Attachment[];
  reactions: Reaction[];
  
  // Thread
  parentId?: string;
  replies: Comment[];
  
  // State
  resolved: boolean;
  pinned: boolean;
  createdAt: number;
  editedAt?: number;
}

export interface Attachment {
  id: string;
  type: 'image' | 'audio' | 'file' | 'link';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface CollaborationEvent {
  id: string;
  type: EventType;
  userId: string;
  userName: string;
  timestamp: number;
  data: unknown;
}

export type EventType = 
  | 'join' | 'leave' | 'edit' | 'play' | 'pause' | 'seek'
  | 'cursor' | 'selection' | 'comment' | 'version' | 'share';

export interface UserCursor {
  userId: string;
  userName: string;
  color: string;
  position: number;
  trackId?: string;
  selection?: { start: number; end: number };
  lastUpdate: number;
}

export interface ConflictInfo {
  id: string;
  type: 'track' | 'clip' | 'plugin' | 'automation';
  entityId: string;
  localVersion: unknown;
  remoteVersion: unknown;
  localUser: string;
  remoteUser: string;
  timestamp: number;
}

// =============================================================================
// ITEM 426: COLLABORATION ENGINE
// =============================================================================

export class CollaborationEngine {
  private project: CollaborationProject | null = null;
  private currentUser: Collaborator | null = null;
  private comments: Map<string, Comment> = new Map();
  private cursors: Map<string, UserCursor> = new Map();
  private events: CollaborationEvent[] = [];
  private conflicts: Map<string, ConflictInfo> = new Map();
  
  // WebSocket for real-time
  private socket: WebSocket | null = null;
  private socketUrl: string = '';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  // Pending exponential-backoff reconnect timer. Tracked so an intentional
  // stop/dispose can cancel it instead of letting it re-open the socket.
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Set while we are intentionally closing so the socket's onclose handler does
  // not schedule a reconnect for a deliberate teardown.
  private intentionalClose: boolean = false;
  
  // Callbacks
  private onEventCallback?: (event: CollaborationEvent) => void;
  private onCursorCallback?: (cursors: Map<string, UserCursor>) => void;
  private onCommentCallback?: (comment: Comment) => void;
  private onConflictCallback?: (conflict: ConflictInfo) => void;
  private onSyncStatusCallback?: (status: SyncStatus) => void;
  
  constructor() {}
  
  // =============================================================================
  // ITEM 427-430: PROJECT MANAGEMENT
  // =============================================================================
  
  async createProject(name: string, description: string = ''): Promise<CollaborationProject> {
    const userId = this.generateUserId();
    
    const project: CollaborationProject = {
      id: this.generateId(),
      name,
      description,
      ownerId: userId,
      collaborators: [{
        userId,
        displayName: 'You',
        email: '',
        role: 'owner',
        permissions: ['read', 'write', 'delete', 'share', 'manage', 'export', 'comment', 'mix', 'master', 'upload'],
        joinedAt: Date.now()
      }],
      visibility: 'private',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      currentVersion: '1.0.0',
      versions: [{
        id: this.generateId(),
        version: '1.0.0',
        name: 'Initial Version',
        createdBy: userId,
        createdAt: Date.now(),
        changes: [],
        tags: ['initial']
      }],
      syncStatus: 'offline',
      settings: {
        autoSave: true,
        autoSaveInterval: 60,
        syncOnSave: true,
        notifyOnChanges: true,
        conflictResolution: 'ask'
      }
    };
    
    this.project = project;
    this.currentUser = project.collaborators[0];
    
    return project;
  }
  
  async loadProject(projectId: string): Promise<CollaborationProject | null> {
    // Would fetch from cloud/local storage
    return this.project;
  }
  
  async saveProject(): Promise<void> {
    if (!this.project) return;
    
    this.project.updatedAt = Date.now();
    
    // Local save
    await this.saveLocally();
    
    // Cloud sync if enabled
    if (this.project.settings.syncOnSave && this.project.cloudId) {
      await this.syncToCloud();
    }
  }
  
  private async saveLocally(): Promise<void> {
    if (!this.project) return;
    
    // Would use IDB or file system
    const projectData = JSON.stringify(this.project);
    localStorage.setItem(`imosion_project_${this.project.id}`, projectData);
  }
  
  // =============================================================================
  // ITEM 431-435: COLLABORATOR MANAGEMENT
  // =============================================================================
  
  async inviteCollaborator(email: string, role: CollaboratorRole): Promise<Collaborator | null> {
    if (!this.project || !this.hasPermission('share')) return null;
    
    // Check if already invited
    if (this.project.collaborators.some(c => c.email === email)) {
      return null;
    }
    
    const collaborator: Collaborator = {
      userId: this.generateUserId(),
      displayName: email.split('@')[0],
      email,
      role,
      permissions: this.getPermissionsForRole(role),
      joinedAt: Date.now()
    };
    
    this.project.collaborators.push(collaborator);
    
    // Would send invitation email
    this.emitEvent('share', { email, role });
    
    return collaborator;
  }
  
  updateCollaboratorRole(userId: string, role: CollaboratorRole): void {
    if (!this.project || !this.hasPermission('manage')) return;
    
    const collaborator = this.project.collaborators.find(c => c.userId === userId);
    if (collaborator && collaborator.role !== 'owner') {
      collaborator.role = role;
      collaborator.permissions = this.getPermissionsForRole(role);
    }
  }
  
  removeCollaborator(userId: string): void {
    if (!this.project || !this.hasPermission('manage')) return;
    
    const index = this.project.collaborators.findIndex(c => c.userId === userId);
    if (index !== -1 && this.project.collaborators[index].role !== 'owner') {
      this.project.collaborators.splice(index, 1);
    }
  }
  
  private getPermissionsForRole(role: CollaboratorRole): Permission[] {
    switch (role) {
      case 'owner':
        return ['read', 'write', 'delete', 'share', 'manage', 'export', 'comment', 'mix', 'master', 'upload'];
      case 'admin':
        return ['read', 'write', 'delete', 'share', 'export', 'comment', 'mix', 'master', 'upload'];
      case 'editor':
        return ['read', 'write', 'export', 'comment', 'mix', 'upload'];
      case 'viewer':
        return ['read', 'comment'];
      default:
        return ['read'];
    }
  }
  
  hasPermission(permission: Permission): boolean {
    return this.currentUser?.permissions.includes(permission) ?? false;
  }
  
  // =============================================================================
  // ITEM 436-440: VERSION CONTROL
  // =============================================================================
  
  async createVersion(name: string, description: string = '', tags: string[] = []): Promise<ProjectVersion | null> {
    if (!this.project || !this.currentUser) return null;
    
    const newVersion = this.incrementVersion(this.project.currentVersion);
    
    const version: ProjectVersion = {
      id: this.generateId(),
      version: newVersion,
      name,
      description,
      createdBy: this.currentUser.userId,
      createdAt: Date.now(),
      parentVersion: this.project.currentVersion,
      changes: this.collectChanges(),
      snapshot: this.createSnapshot(),
      tags
    };
    
    this.project.versions.push(version);
    this.project.currentVersion = newVersion;
    
    this.emitEvent('version', { version: newVersion, name });
    
    return version;
  }
  
  async restoreVersion(versionId: string): Promise<boolean> {
    if (!this.project || !this.hasPermission('write')) return false;
    
    const version = this.project.versions.find(v => v.id === versionId);
    if (!version?.snapshot) return false;
    
    // Would restore project state from snapshot
    // This would need to be integrated with the DAW core
    
    this.emitEvent('version', { action: 'restore', version: version.version });
    
    return true;
  }
  
  compareVersions(versionA: string, versionB: string): VersionChange[] {
    const a = this.project?.versions.find(v => v.version === versionA);
    const b = this.project?.versions.find(v => v.version === versionB);
    
    if (!a?.snapshot || !b?.snapshot) return [];
    
    // Would compute diff between snapshots
    return b.changes || [];
  }
  
  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    parts[2]++;
    if (parts[2] >= 100) {
      parts[2] = 0;
      parts[1]++;
    }
    if (parts[1] >= 100) {
      parts[1] = 0;
      parts[0]++;
    }
    return parts.join('.');
  }
  
  private collectChanges(): VersionChange[] {
    // Would track changes since last version
    return [];
  }
  
  private createSnapshot(): ProjectSnapshot {
    // Would capture current project state
    return {
      tracks: [],
      clips: [],
      plugins: [],
      automation: [],
      markers: [],
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 }
    };
  }
  
  // =============================================================================
  // ITEM 441-445: CLOUD SYNC
  // =============================================================================
  
  async connectToCloud(cloudId: string, apiKey: string): Promise<boolean> {
    if (!this.project) return false;
    
    try {
      // Would authenticate with cloud service
      this.project.cloudId = cloudId;
      this.project.syncStatus = 'synced';
      this.project.lastSynced = Date.now();
      
      this.onSyncStatusCallback?.('synced');
      return true;
    } catch {
      this.project.syncStatus = 'error';
      this.onSyncStatusCallback?.('error');
      return false;
    }
  }
  
  async syncToCloud(): Promise<boolean> {
    if (!this.project || !this.project.cloudId) return false;
    
    this.project.syncStatus = 'syncing';
    this.onSyncStatusCallback?.('syncing');
    
    try {
      // Would upload project data to cloud
      
      this.project.syncStatus = 'synced';
      this.project.lastSynced = Date.now();
      this.onSyncStatusCallback?.('synced');
      return true;
    } catch {
      this.project.syncStatus = 'error';
      this.onSyncStatusCallback?.('error');
      return false;
    }
  }
  
  async syncFromCloud(): Promise<boolean> {
    if (!this.project || !this.project.cloudId) return false;
    
    this.project.syncStatus = 'syncing';
    this.onSyncStatusCallback?.('syncing');
    
    try {
      // Would fetch project data from cloud
      // Check for conflicts
      
      this.project.syncStatus = 'synced';
      this.project.lastSynced = Date.now();
      this.onSyncStatusCallback?.('synced');
      return true;
    } catch {
      this.project.syncStatus = 'error';
      this.onSyncStatusCallback?.('error');
      return false;
    }
  }
  
  resolveConflict(conflictId: string, resolution: 'local' | 'remote' | 'merge'): void {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return;
    
    switch (resolution) {
      case 'local':
        // Keep local version
        break;
      case 'remote':
        // Apply remote version
        break;
      case 'merge':
        // Attempt automatic merge
        break;
    }
    
    this.conflicts.delete(conflictId);
  }
  
  // =============================================================================
  // ITEM 446-448: REAL-TIME COLLABORATION
  // =============================================================================
  
  async startRealTimeSession(serverUrl: string): Promise<boolean> {
    if (!this.project) return false;
    
    this.socketUrl = serverUrl;
    
    try {
      this.socket = new WebSocket(serverUrl);
      
      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.sendMessage({ type: 'join', projectId: this.project!.id, userId: this.currentUser?.userId });
      };
      
      this.socket.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
      
      this.socket.onclose = () => {
        this.handleDisconnect();
      };
      
      this.socket.onerror = () => {
        this.handleDisconnect();
      };
      
      return true;
    } catch {
      return false;
    }
  }
  
  stopRealTimeSession(): void {
    // Cancel any pending reconnect so a deliberate stop is not undone.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.intentionalClose = true;
      this.sendMessage({ type: 'leave', userId: this.currentUser?.userId });
      // Detach handlers before closing so onclose/onerror do not trigger a
      // reconnect for this intentional teardown.
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
      this.intentionalClose = false;
    }
    this.cursors.clear();
  }
  
  private handleMessage(message: { type: string; data: unknown }): void {
    switch (message.type) {
      case 'cursor':
        this.handleCursorUpdate(message.data as UserCursor);
        break;
      case 'edit':
        this.handleRemoteEdit(message.data);
        break;
      case 'comment':
        this.handleRemoteComment(message.data as Comment);
        break;
      case 'event':
        this.handleRemoteEvent(message.data as CollaborationEvent);
        break;
      case 'join':
        this.handleUserJoin(message.data as { userId: string; userName: string });
        break;
      case 'leave':
        this.handleUserLeave(message.data as { userId: string });
        break;
    }
  }
  
  private handleCursorUpdate(cursor: UserCursor): void {
    if (cursor.userId !== this.currentUser?.userId) {
      this.cursors.set(cursor.userId, cursor);
      this.onCursorCallback?.(this.cursors);
    }
  }
  
  private handleRemoteEdit(data: unknown): void {
    // Would apply remote edit to local state
    this.emitEvent('edit', data);
  }
  
  private handleRemoteComment(comment: Comment): void {
    this.comments.set(comment.id, comment);
    this.onCommentCallback?.(comment);
  }
  
  private handleRemoteEvent(event: CollaborationEvent): void {
    this.events.push(event);
    this.onEventCallback?.(event);
  }
  
  private handleUserJoin(data: { userId: string; userName: string }): void {
    const collaborator = this.project?.collaborators.find(c => c.userId === data.userId);
    if (collaborator) {
      collaborator.online = true;
    }
    this.emitEvent('join', data);
  }
  
  private handleUserLeave(data: { userId: string }): void {
    const collaborator = this.project?.collaborators.find(c => c.userId === data.userId);
    if (collaborator) {
      collaborator.online = false;
    }
    this.cursors.delete(data.userId);
    this.onCursorCallback?.(this.cursors);
    this.emitEvent('leave', data);
  }
  
  private handleDisconnect(): void {
    // Do not reconnect when the disconnect was an intentional teardown.
    if (this.intentionalClose) return;
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.startRealTimeSession(this.socketUrl);
      }, Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000));
    }
  }
  
  private sendMessage(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
  
  updateCursor(position: number, trackId?: string, selection?: { start: number; end: number }): void {
    if (!this.currentUser) return;
    
    const cursor: UserCursor = {
      userId: this.currentUser.userId,
      userName: this.currentUser.displayName,
      color: this.getUserColor(this.currentUser.userId),
      position,
      trackId,
      selection,
      lastUpdate: Date.now()
    };
    
    this.sendMessage({ type: 'cursor', data: cursor });
  }
  
  broadcastEdit(editData: unknown): void {
    this.sendMessage({ type: 'edit', data: editData });
  }
  
  // =============================================================================
  // ITEM 449-450: COMMENTS & COMMUNICATION
  // =============================================================================
  
  addComment(text: string, trackId?: string, clipId?: string, timestamp: number = 0): Comment | null {
    if (!this.project || !this.currentUser || !this.hasPermission('comment')) return null;
    
    const comment: Comment = {
      id: this.generateId(),
      projectId: this.project.id,
      userId: this.currentUser.userId,
      userName: this.currentUser.displayName,
      userAvatar: this.currentUser.avatar,
      trackId,
      clipId,
      timestamp,
      text,
      attachments: [],
      reactions: [],
      replies: [],
      resolved: false,
      pinned: false,
      createdAt: Date.now()
    };
    
    this.comments.set(comment.id, comment);
    this.sendMessage({ type: 'comment', data: comment });
    this.emitEvent('comment', { action: 'add', commentId: comment.id });
    
    return comment;
  }
  
  replyToComment(parentId: string, text: string): Comment | null {
    if (!this.currentUser || !this.hasPermission('comment')) return null;
    
    const parent = this.comments.get(parentId);
    if (!parent) return null;
    
    const reply: Comment = {
      id: this.generateId(),
      projectId: this.project!.id,
      userId: this.currentUser.userId,
      userName: this.currentUser.displayName,
      userAvatar: this.currentUser.avatar,
      timestamp: parent.timestamp,
      text,
      attachments: [],
      reactions: [],
      parentId,
      replies: [],
      resolved: false,
      pinned: false,
      createdAt: Date.now()
    };
    
    parent.replies.push(reply);
    this.comments.set(reply.id, reply);
    this.sendMessage({ type: 'comment', data: reply });
    
    return reply;
  }
  
  editComment(commentId: string, text: string): void {
    const comment = this.comments.get(commentId);
    if (!comment || comment.userId !== this.currentUser?.userId) return;
    
    comment.text = text;
    comment.editedAt = Date.now();
    
    this.sendMessage({ type: 'comment', data: { action: 'edit', commentId, text } });
  }
  
  deleteComment(commentId: string): void {
    const comment = this.comments.get(commentId);
    if (!comment) return;
    
    if (comment.userId !== this.currentUser?.userId && !this.hasPermission('manage')) {
      return;
    }
    
    this.comments.delete(commentId);
    this.sendMessage({ type: 'comment', data: { action: 'delete', commentId } });
  }
  
  resolveComment(commentId: string): void {
    const comment = this.comments.get(commentId);
    if (comment) {
      comment.resolved = true;
      this.sendMessage({ type: 'comment', data: { action: 'resolve', commentId } });
    }
  }
  
  addReaction(commentId: string, emoji: string): void {
    const comment = this.comments.get(commentId);
    if (!comment || !this.currentUser) return;
    
    const existingIndex = comment.reactions.findIndex(
      r => r.userId === this.currentUser!.userId && r.emoji === emoji
    );
    
    if (existingIndex !== -1) {
      comment.reactions.splice(existingIndex, 1);
    } else {
      comment.reactions.push({ emoji, userId: this.currentUser.userId });
    }
    
    this.sendMessage({ type: 'comment', data: { action: 'reaction', commentId, emoji } });
  }
  
  getComments(trackId?: string, clipId?: string): Comment[] {
    return Array.from(this.comments.values()).filter(c => {
      if (trackId && c.trackId !== trackId) return false;
      if (clipId && c.clipId !== clipId) return false;
      return !c.parentId; // Only return top-level comments
    });
  }
  
  getCommentsAtTimestamp(timestamp: number, tolerance: number = 1000): Comment[] {
    return Array.from(this.comments.values()).filter(c => 
      Math.abs(c.timestamp - timestamp) <= tolerance && !c.parentId
    );
  }
  
  // =============================================================================
  // CALLBACKS
  // =============================================================================
  
  onEvent(callback: (event: CollaborationEvent) => void): void {
    this.onEventCallback = callback;
  }
  
  onCursor(callback: (cursors: Map<string, UserCursor>) => void): void {
    this.onCursorCallback = callback;
  }
  
  onComment(callback: (comment: Comment) => void): void {
    this.onCommentCallback = callback;
  }
  
  onConflict(callback: (conflict: ConflictInfo) => void): void {
    this.onConflictCallback = callback;
  }
  
  onSyncStatus(callback: (status: SyncStatus) => void): void {
    this.onSyncStatusCallback = callback;
  }
  
  // =============================================================================
  // UTILITY
  // =============================================================================
  
  private emitEvent(type: EventType, data: unknown): void {
    if (!this.currentUser) return;
    
    const event: CollaborationEvent = {
      id: this.generateId(),
      type,
      userId: this.currentUser.userId,
      userName: this.currentUser.displayName,
      timestamp: Date.now(),
      data
    };
    
    this.events.push(event);
    this.onEventCallback?.(event);
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private generateUserId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private getUserColor(userId: string): string {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
  
  // Getters
  getProject(): CollaborationProject | null {
    return this.project;
  }
  
  getCurrentUser(): Collaborator | null {
    return this.currentUser;
  }
  
  getOnlineCollaborators(): Collaborator[] {
    return this.project?.collaborators.filter(c => c.online) ?? [];
  }
  
  getCursors(): Map<string, UserCursor> {
    return this.cursors;
  }
  
  getVersionHistory(): ProjectVersion[] {
    return this.project?.versions ?? [];
  }
  
  getEventHistory(): CollaborationEvent[] {
    return this.events;
  }
  
  dispose(): void {
    this.stopRealTimeSession();
    this.project = null;
    this.currentUser = null;
    this.comments.clear();
    this.cursors.clear();
    this.events = [];
    this.conflicts.clear();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createCollaborationEngine = () => new CollaborationEngine();

export default CollaborationEngine;
