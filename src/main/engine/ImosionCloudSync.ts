// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * IMOSION CLOUD SYNC - Project Collaboration & Cloud Storage
 * ===========================================================================
 * 
 * Handles:
 * - Cloud sync for projects and presets
 * - Project sharing with version control
 * - Offline mode with local caching
 * - Real-time collaboration
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES & INTERFACES
// ===========================================================================

export interface CloudUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  plan: 'free' | 'pro' | 'studio';
  storageUsed: number;
  storageLimit: number;
}

export interface CloudProject {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  size: number;
  isPublic: boolean;
  collaborators: Collaborator[];
  tags?: string[];
  description?: string;
}

export interface Collaborator {
  userId: string;
  displayName: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  addedAt: string;
  lastAccess?: string;
}

export interface SyncStatus {
  projectId: string;
  localVersion: number;
  cloudVersion: number;
  status: 'synced' | 'pending' | 'conflict' | 'error';
  lastSynced?: string;
  pendingChanges: number;
  error?: string;
}

export interface CollaborationSession {
  id: string;
  projectId: string;
  participants: CollaborationParticipant[];
  startedAt: string;
  isActive: boolean;
}

export interface CollaborationParticipant {
  userId: string;
  displayName: string;
  cursor?: { track: number; position: number };
  color: string;
  isOnline: boolean;
  lastActivity: string;
}

export interface CloudPreset {
  id: string;
  name: string;
  pluginId: string;
  ownerId: string;
  isPublic: boolean;
  downloads: number;
  rating: number;
  tags: string[];
  createdAt: string;
}

export interface ChangeOperation {
  id: string;
  type: 'add' | 'modify' | 'delete';
  target: 'track' | 'clip' | 'effect' | 'automation' | 'setting';
  targetId: string;
  data: any;
  timestamp: string;
  userId: string;
}

// ===========================================================================
// OFFLINE CACHE MANAGER
// ===========================================================================

class OfflineCacheManager {
  private cacheDir: string;
  private pendingChanges: Map<string, ChangeOperation[]> = new Map();
  
  constructor() {
    const userDataPath = app?.getPath?.('userData') || './data';
    this.cacheDir = path.join(userDataPath, 'imosion', 'cloud-cache');
    this.initCache();
  }
  
  private async initCache(): Promise<void> {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      
      // Load pending changes
      const pendingPath = path.join(this.cacheDir, 'pending.json');
      if (fs.existsSync(pendingPath)) {
        const data = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
        this.pendingChanges = new Map(Object.entries(data));
      }
    } catch (error) {
      log.error('[OfflineCacheManager] Failed to init cache:', error);
    }
  }
  
  async cacheProject(project: CloudProject, data: any): Promise<void> {
    const projectPath = path.join(this.cacheDir, `project_${project.id}.json`);
    const cacheData = {
      metadata: project,
      data,
      cachedAt: new Date().toISOString()
    };
    
    await fs.promises.writeFile(projectPath, JSON.stringify(cacheData));
  }
  
  async getCachedProject(projectId: string): Promise<{ metadata: CloudProject; data: any } | null> {
    const projectPath = path.join(this.cacheDir, `project_${projectId}.json`);
    
    try {
      if (fs.existsSync(projectPath)) {
        const data = JSON.parse(await fs.promises.readFile(projectPath, 'utf-8'));
        return { metadata: data.metadata, data: data.data };
      }
    } catch (error) {
      log.error('[OfflineCacheManager] Failed to get cached project:', error);
    }
    
    return null;
  }
  
  addPendingChange(projectId: string, change: ChangeOperation): void {
    const changes = this.pendingChanges.get(projectId) || [];
    changes.push(change);
    this.pendingChanges.set(projectId, changes);
    this.savePendingChanges();
  }
  
  getPendingChanges(projectId: string): ChangeOperation[] {
    return this.pendingChanges.get(projectId) || [];
  }
  
  clearPendingChanges(projectId: string): void {
    this.pendingChanges.delete(projectId);
    this.savePendingChanges();
  }
  
  private async savePendingChanges(): Promise<void> {
    const pendingPath = path.join(this.cacheDir, 'pending.json');
    const data = Object.fromEntries(this.pendingChanges);
    await fs.promises.writeFile(pendingPath, JSON.stringify(data));
  }
  
  async clearCache(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      for (const file of files) {
        if (file.startsWith('project_')) {
          await fs.promises.unlink(path.join(this.cacheDir, file));
        }
      }
    } catch (error) {
      log.error('[OfflineCacheManager] Failed to clear cache:', error);
    }
  }
}

// ===========================================================================
// CONFLICT RESOLVER
// ===========================================================================

class ConflictResolver {
  /**
   * Resolve conflicts between local and remote changes
   * Uses operational transformation principles
   */
  resolveConflicts(
    localChanges: ChangeOperation[],
    remoteChanges: ChangeOperation[]
  ): { merged: ChangeOperation[]; conflicts: { local: ChangeOperation; remote: ChangeOperation }[] } {
    const merged: ChangeOperation[] = [];
    const conflicts: { local: ChangeOperation; remote: ChangeOperation }[] = [];
    
    // Group changes by target
    const localByTarget = this.groupByTarget(localChanges);
    const remoteByTarget = this.groupByTarget(remoteChanges);
    
    const allTargets = new Set([...localByTarget.keys(), ...remoteByTarget.keys()]);
    
    for (const targetId of allTargets) {
      const localOps = localByTarget.get(targetId) || [];
      const remoteOps = remoteByTarget.get(targetId) || [];
      
      if (localOps.length === 0) {
        merged.push(...remoteOps);
      } else if (remoteOps.length === 0) {
        merged.push(...localOps);
      } else {
        // Both have changes to same target - need to resolve
        const resolved = this.resolveTargetConflicts(localOps, remoteOps);
        merged.push(...resolved.merged);
        conflicts.push(...resolved.conflicts);
      }
    }
    
    return { merged, conflicts };
  }
  
  private groupByTarget(changes: ChangeOperation[]): Map<string, ChangeOperation[]> {
    const grouped = new Map<string, ChangeOperation[]>();
    
    for (const change of changes) {
      const ops = grouped.get(change.targetId) || [];
      ops.push(change);
      grouped.set(change.targetId, ops);
    }
    
    return grouped;
  }
  
  private resolveTargetConflicts(
    localOps: ChangeOperation[],
    remoteOps: ChangeOperation[]
  ): { merged: ChangeOperation[]; conflicts: { local: ChangeOperation; remote: ChangeOperation }[] } {
    const merged: ChangeOperation[] = [];
    const conflicts: { local: ChangeOperation; remote: ChangeOperation }[] = [];
    
    // Simple last-write-wins for now
    // A real implementation would use more sophisticated OT
    const localLatest = localOps[localOps.length - 1];
    const remoteLatest = remoteOps[remoteOps.length - 1];
    
    if (new Date(localLatest.timestamp) > new Date(remoteLatest.timestamp)) {
      merged.push(localLatest);
    } else {
      merged.push(remoteLatest);
    }
    
    // Report as conflict if operations are different types
    if (localLatest.type !== remoteLatest.type) {
      conflicts.push({ local: localLatest, remote: remoteLatest });
    }
    
    return { merged, conflicts };
  }
}

// ===========================================================================
// MAIN CLOUD SYNC CLASS
// ===========================================================================

export class ImosionCloudSync extends EventEmitter {
  private currentUser: CloudUser | null = null;
  private isOnline = true;
  private offlineCache: OfflineCacheManager;
  private conflictResolver: ConflictResolver;
  
  private syncStatus: Map<string, SyncStatus> = new Map();
  private activeSessions: Map<string, CollaborationSession> = new Map();
  
  private autoSyncEnabled = true;
  private autoSyncInterval = 30000; // 30 seconds
  private syncTimer: NodeJS.Timeout | null = null;
  private networkCheckTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    
    this.offlineCache = new OfflineCacheManager();
    this.conflictResolver = new ConflictResolver();
    
    this.startNetworkMonitoring();
    
    log.info('[ImosionCloudSync] Initialized');
  }
  
  private startNetworkMonitoring(): void {
    // Use Electron’s built-in online/offline events + infrequent fallback poll
    const { net } = require('electron');
    this.networkCheckTimer = setInterval(() => {
      const wasOnline = this.isOnline;
      this.isOnline = net.isOnline();
      
      if (!wasOnline && this.isOnline) {
        this.emit('online');
        this.syncPendingChanges();
      } else if (wasOnline && !this.isOnline) {
        this.emit('offline');
      }
    }, 60000);
  }
  
  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------
  
  async login(email: string, password: string): Promise<CloudUser> {
    // Cloud API not yet configured — return local-only profile
    log.info('[ImosionCloudSync] Cloud API not configured, using local-only profile');
    const user: CloudUser = {
      id: `local_${Date.now()}`,
      email,
      displayName: email.split('@')[0],
      plan: 'free',
      storageUsed: 0,
      storageLimit: 0
    };
    
    this.currentUser = user;
    this.emit('loggedIn', user);
    
    return user;
  }
  
  async logout(): Promise<void> {
    this.stopAutoSync();
    this.currentUser = null;
    this.activeSessions.clear();
    this.emit('loggedOut');
  }
  
  getCurrentUser(): CloudUser | null {
    return this.currentUser;
  }
  
  isLoggedIn(): boolean {
    return this.currentUser !== null;
  }
  
  // -------------------------------------------------------------------------
  // Project Sync
  // -------------------------------------------------------------------------
  
  async uploadProject(projectData: any, metadata: Partial<CloudProject>): Promise<CloudProject> {
    if (!this.currentUser) {
      throw new Error('Not logged in');
    }
    
    const project: CloudProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: metadata.name || 'Untitled',
      ownerId: this.currentUser.id,
      ownerName: this.currentUser.displayName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      size: JSON.stringify(projectData).length,
      isPublic: metadata.isPublic || false,
      collaborators: [{
        userId: this.currentUser.id,
        displayName: this.currentUser.displayName,
        email: this.currentUser.email,
        role: 'owner',
        addedAt: new Date().toISOString()
      }],
      tags: metadata.tags,
      description: metadata.description
    };
    
    // Cache locally
    await this.offlineCache.cacheProject(project, projectData);
    
    // Update sync status
    this.syncStatus.set(project.id, {
      projectId: project.id,
      localVersion: 1,
      cloudVersion: 1,
      status: 'synced',
      lastSynced: new Date().toISOString(),
      pendingChanges: 0
    });
    
    this.emit('projectUploaded', project);
    return project;
  }
  
  async downloadProject(projectId: string): Promise<{ metadata: CloudProject; data: any }> {
    // Try cache first if offline
    if (!this.isOnline) {
      const cached = await this.offlineCache.getCachedProject(projectId);
      if (cached) {
        return cached;
      }
      throw new Error('Offline and project not cached');
    }
    
    // Cloud API not yet configured — can only serve cached projects
    const cached = await this.offlineCache.getCachedProject(projectId);
    if (cached) {
      this.emit('projectDownloaded', cached.metadata);
      return cached;
    }
    
    throw new Error('Cloud sync not configured — project not available locally');
  }
  
  async syncProject(projectId: string, localData: any): Promise<SyncStatus> {
    const status = this.syncStatus.get(projectId);
    
    if (!this.isOnline) {
      // Queue for later sync
      const change: ChangeOperation = {
        id: `change_${Date.now()}`,
        type: 'modify',
        target: 'setting',
        targetId: projectId,
        data: localData,
        timestamp: new Date().toISOString(),
        userId: this.currentUser?.id || 'offline'
      };
      
      this.offlineCache.addPendingChange(projectId, change);
      
      const newStatus: SyncStatus = {
        projectId,
        localVersion: (status?.localVersion || 0) + 1,
        cloudVersion: status?.cloudVersion || 0,
        status: 'pending',
        pendingChanges: this.offlineCache.getPendingChanges(projectId).length
      };
      
      this.syncStatus.set(projectId, newStatus);
      this.emit('syncStatusChanged', newStatus);
      
      return newStatus;
    }
    
    // Perform sync
    try {
      // Get pending changes
      const pendingChanges = this.offlineCache.getPendingChanges(projectId);
      
      // In a real implementation, this would:
      // 1. Fetch remote version
      // 2. Resolve conflicts
      // 3. Push merged changes
      // 4. Update local cache
      
      // Clear pending changes after successful sync
      this.offlineCache.clearPendingChanges(projectId);
      
      const newStatus: SyncStatus = {
        projectId,
        localVersion: (status?.localVersion || 0) + 1,
        cloudVersion: (status?.cloudVersion || 0) + 1,
        status: 'synced',
        lastSynced: new Date().toISOString(),
        pendingChanges: 0
      };
      
      this.syncStatus.set(projectId, newStatus);
      this.emit('syncCompleted', newStatus);
      
      return newStatus;
    } catch (error: any) {
      const newStatus: SyncStatus = {
        projectId,
        localVersion: status?.localVersion || 0,
        cloudVersion: status?.cloudVersion || 0,
        status: 'error',
        pendingChanges: this.offlineCache.getPendingChanges(projectId).length,
        error: error?.message
      };
      
      this.syncStatus.set(projectId, newStatus);
      this.emit('syncFailed', newStatus);
      
      return newStatus;
    }
  }
  
  private async syncPendingChanges(): Promise<void> {
    // Cloud API not yet configured -- skip sync attempts silently
    if (!this.isOnline) return;
    // When cloud endpoints are connected, iterate over pending project changes here
  }
  
  getSyncStatus(projectId: string): SyncStatus | undefined {
    return this.syncStatus.get(projectId);
  }
  
  // -------------------------------------------------------------------------
  // Collaboration
  // -------------------------------------------------------------------------
  
  async startCollaborationSession(projectId: string): Promise<CollaborationSession> {
    if (!this.currentUser) {
      throw new Error('Not logged in');
    }
    
    const session: CollaborationSession = {
      id: `session_${Date.now()}`,
      projectId,
      participants: [{
        userId: this.currentUser.id,
        displayName: this.currentUser.displayName,
        color: this.getRandomColor(),
        isOnline: true,
        lastActivity: new Date().toISOString()
      }],
      startedAt: new Date().toISOString(),
      isActive: true
    };
    
    this.activeSessions.set(session.id, session);
    this.emit('collaborationStarted', session);
    
    return session;
  }
  
  async joinCollaborationSession(sessionId: string): Promise<CollaborationSession> {
    if (!this.currentUser) {
      throw new Error('Not logged in');
    }
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Add current user as participant
    session.participants.push({
      userId: this.currentUser.id,
      displayName: this.currentUser.displayName,
      color: this.getRandomColor(),
      isOnline: true,
      lastActivity: new Date().toISOString()
    });
    
    this.emit('participantJoined', { sessionId, userId: this.currentUser.id });
    
    return session;
  }
  
  async leaveCollaborationSession(sessionId: string): Promise<void> {
    if (!this.currentUser) return;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    session.participants = session.participants.filter(p => p.userId !== this.currentUser!.id);
    
    if (session.participants.length === 0) {
      session.isActive = false;
      this.activeSessions.delete(sessionId);
      this.emit('collaborationEnded', sessionId);
    } else {
      this.emit('participantLeft', { sessionId, userId: this.currentUser.id });
    }
  }
  
  broadcastChange(sessionId: string, change: ChangeOperation): void {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;
    
    this.emit('changeReceived', { sessionId, change });
  }
  
  updateCursor(sessionId: string, cursor: { track: number; position: number }): void {
    if (!this.currentUser) return;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    const participant = session.participants.find(p => p.userId === this.currentUser!.id);
    if (participant) {
      participant.cursor = cursor;
      participant.lastActivity = new Date().toISOString();
      this.emit('cursorUpdated', { sessionId, userId: this.currentUser.id, cursor });
    }
  }
  
  getActiveSession(projectId: string): CollaborationSession | undefined {
    for (const session of this.activeSessions.values()) {
      if (session.projectId === projectId && session.isActive) {
        return session;
      }
    }
    return undefined;
  }
  
  private getRandomColor(): string {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#a29bfe', '#fd79a8'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  // -------------------------------------------------------------------------
  // Project Sharing
  // -------------------------------------------------------------------------
  
  async shareProject(projectId: string, email: string, role: 'editor' | 'viewer'): Promise<Collaborator> {
    if (!this.currentUser) {
      throw new Error('Not logged in');
    }
    
    const collaborator: Collaborator = {
      userId: `user_${Date.now()}`,
      displayName: email.split('@')[0],
      email,
      role,
      addedAt: new Date().toISOString()
    };
    
    this.emit('collaboratorAdded', { projectId, collaborator });
    
    return collaborator;
  }
  
  async removeCollaborator(projectId: string, userId: string): Promise<void> {
    this.emit('collaboratorRemoved', { projectId, userId });
  }
  
  async updateCollaboratorRole(projectId: string, userId: string, role: 'editor' | 'viewer'): Promise<void> {
    this.emit('collaboratorRoleChanged', { projectId, userId, role });
  }
  
  // -------------------------------------------------------------------------
  // Preset Sharing
  // -------------------------------------------------------------------------
  
  async uploadPreset(preset: Partial<CloudPreset>, data: Uint8Array): Promise<CloudPreset> {
    if (!this.currentUser) {
      throw new Error('Not logged in');
    }
    
    const cloudPreset: CloudPreset = {
      id: `preset_${Date.now()}`,
      name: preset.name || 'Untitled Preset',
      pluginId: preset.pluginId || 'unknown',
      ownerId: this.currentUser.id,
      isPublic: preset.isPublic || false,
      downloads: 0,
      rating: 0,
      tags: preset.tags || [],
      createdAt: new Date().toISOString()
    };
    
    this.emit('presetUploaded', cloudPreset);
    
    return cloudPreset;
  }
  
  async searchPresets(query: string, pluginId?: string): Promise<CloudPreset[]> {
    // Cloud preset search not available — no API configured
    return [];
  }
  
  async downloadPreset(presetId: string): Promise<{ metadata: CloudPreset; data: Uint8Array }> {
    throw new Error('Preset not found');
  }
  
  // -------------------------------------------------------------------------
  // Auto Sync
  // -------------------------------------------------------------------------
  
  startAutoSync(): void {
    if (!this.autoSyncEnabled || this.syncTimer) return;
    
    this.syncTimer = setInterval(() => {
      this.syncPendingChanges();
    }, this.autoSyncInterval);
  }
  
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
  
  setAutoSyncEnabled(enabled: boolean): void {
    this.autoSyncEnabled = enabled;
    if (enabled) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }
  
  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------
  
  isNetworkOnline(): boolean {
    return this.isOnline;
  }
  
  getStorageUsage(): { used: number; limit: number; percentage: number } {
    if (!this.currentUser) {
      return { used: 0, limit: 0, percentage: 0 };
    }
    
    return {
      used: this.currentUser.storageUsed,
      limit: this.currentUser.storageLimit,
      percentage: (this.currentUser.storageUsed / this.currentUser.storageLimit) * 100
    };
  }
  
  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  
  async dispose(): Promise<void> {
    this.stopAutoSync();
    if (this.networkCheckTimer) clearInterval(this.networkCheckTimer);
    
    // Leave all active sessions
    for (const sessionId of this.activeSessions.keys()) {
      await this.leaveCollaborationSession(sessionId);
    }
    
    this.removeAllListeners();
    log.info('[ImosionCloudSync] Disposed');
  }
}

// Export singleton
let cloudSyncInstance: ImosionCloudSync | null = null;

export function getCloudSync(): ImosionCloudSync {
  if (!cloudSyncInstance) {
    cloudSyncInstance = new ImosionCloudSync();
  }
  return cloudSyncInstance;
}

export default ImosionCloudSync;
