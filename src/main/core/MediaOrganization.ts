// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Media Organization System
// User-driven tagging, grouping, and project linking for media files
// No auto-organization, drag-drop into notes/projects support
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type MediaOrgType = 'audio' | 'video' | 'image' | 'document' | 'any';
export type GroupType = 'album' | 'project' | 'collection' | 'folder' | 'custom';

export interface MediaTag {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  mediaTypes: MediaOrgType[];
  createdAt: number;
  usageCount: number;
}

export interface MediaGroup {
  id: string;
  name: string;
  description?: string;
  type: GroupType;
  coverImage?: string;
  color?: string;
  icon?: string;
  items: string[]; // Media item IDs
  tags: string[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
  isLocked: boolean;
  sortOrder: number;
}

export interface ProjectLink {
  id: string;
  mediaId: string;
  projectId: string;
  projectType: 'note' | 'document' | 'task' | 'workflow';
  linkType: 'embed' | 'reference' | 'attachment';
  position?: number; // Position in document
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface OrganizedMedia {
  id: string;
  path: string;
  type: MediaOrgType;
  tags: string[];
  groups: string[];
  projects: string[];
  rating?: number;
  notes?: string;
  customFields: Record<string, string>;
  createdAt: number;
  modifiedAt: number;
}

export interface MediaFilter {
  types?: MediaOrgType[];
  tags?: string[];
  groups?: string[];
  projects?: string[];
  rating?: number;
  dateRange?: { start: number; end: number };
  search?: string;
  hasNotes?: boolean;
  untagged?: boolean;
  ungrouped?: boolean;
}

export interface OrganizationStats {
  totalMedia: number;
  byType: Record<MediaOrgType, number>;
  totalTags: number;
  totalGroups: number;
  totalLinks: number;
  untaggedCount: number;
  ungroupedCount: number;
  topTags: { tag: MediaTag; count: number }[];
  recentlyTagged: OrganizedMedia[];
}

export interface OrganizationConfig {
  defaultGroupType: GroupType;
  suggestTags: boolean;
  maxSuggestions: number;
  autoCreateTags: boolean;
  showUnorganized: boolean;
  groupSortBy: 'name' | 'date' | 'itemCount';
  tagSortBy: 'name' | 'usage' | 'date';
}

// ===========================================================================
// PREDEFINED TAG COLORS
// ===========================================================================

export const TAG_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#FF8C42', // Orange
  '#98D8C8', // Mint
  '#A8A8A8', // Gray
  '#F7DC6F', // Gold
];

// ===========================================================================
// MEDIA ORGANIZATION SYSTEM
// ===========================================================================

class MediaOrganizationClass extends EventEmitter {
  private media: Map<string, OrganizedMedia> = new Map();
  private tags: Map<string, MediaTag> = new Map();
  private groups: Map<string, MediaGroup> = new Map();
  private links: Map<string, ProjectLink> = new Map();
  private config: OrganizationConfig;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;

  constructor() {
    super();
    
    this.config = {
      defaultGroupType: 'collection',
      suggestTags: true,
      maxSuggestions: 5,
      autoCreateTags: false,
      showUnorganized: true,
      groupSortBy: 'date',
      tagSortBy: 'usage',
    };
    
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'media-org');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadData();
      await this.loadConfig();
      
      log.info(`[MediaOrg] Initialized with ${this.media.size} items, ${this.tags.size} tags, ${this.groups.size} groups`);
    } catch (error) {
      log.error('[MediaOrg] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Tag operations
    ipcMain.handle('mediaorg:createTag', async (_event, name: string, options?: Partial<MediaTag>) => {
      return this.createTag(name, options);
    });
    
    ipcMain.handle('mediaorg:updateTag', async (_event, tagId: string, updates: Partial<MediaTag>) => {
      return this.updateTag(tagId, updates);
    });
    
    ipcMain.handle('mediaorg:deleteTag', async (_event, tagId: string) => {
      return this.deleteTag(tagId);
    });
    
    ipcMain.handle('mediaorg:getTags', () => this.getTags());
    ipcMain.handle('mediaorg:getTag', (_event, tagId: string) => this.getTag(tagId));
    ipcMain.handle('mediaorg:suggestTags', (_event, mediaId: string) => this.suggestTags(mediaId));

    // Group operations
    ipcMain.handle('mediaorg:createGroup', async (_event, name: string, type?: GroupType) => {
      return this.createGroup(name, type);
    });
    
    ipcMain.handle('mediaorg:updateGroup', async (_event, groupId: string, updates: Partial<MediaGroup>) => {
      return this.updateGroup(groupId, updates);
    });
    
    ipcMain.handle('mediaorg:deleteGroup', async (_event, groupId: string) => {
      return this.deleteGroup(groupId);
    });
    
    ipcMain.handle('mediaorg:getGroups', (_event, type?: GroupType) => this.getGroups(type));
    ipcMain.handle('mediaorg:getGroup', (_event, groupId: string) => this.getGroup(groupId));
    
    ipcMain.handle('mediaorg:addToGroup', async (_event, groupId: string, mediaIds: string[]) => {
      return this.addToGroup(groupId, mediaIds);
    });
    
    ipcMain.handle('mediaorg:removeFromGroup', async (_event, groupId: string, mediaIds: string[]) => {
      return this.removeFromGroup(groupId, mediaIds);
    });

    // Media item operations
    ipcMain.handle('mediaorg:registerMedia', async (_event, filePath: string, type: MediaOrgType) => {
      return this.registerMedia(filePath, type);
    });
    
    ipcMain.handle('mediaorg:unregisterMedia', async (_event, mediaId: string) => {
      return this.unregisterMedia(mediaId);
    });
    
    ipcMain.handle('mediaorg:getMedia', (_event, mediaId: string) => this.getMedia(mediaId));
    ipcMain.handle('mediaorg:getAllMedia', (_event, filter?: MediaFilter) => this.getAllMedia(filter));
    
    ipcMain.handle('mediaorg:tagMedia', async (_event, mediaId: string, tagIds: string[]) => {
      return this.tagMedia(mediaId, tagIds);
    });
    
    ipcMain.handle('mediaorg:untagMedia', async (_event, mediaId: string, tagIds: string[]) => {
      return this.untagMedia(mediaId, tagIds);
    });
    
    ipcMain.handle('mediaorg:setRating', async (_event, mediaId: string, rating: number) => {
      return this.setRating(mediaId, rating);
    });
    
    ipcMain.handle('mediaorg:setNotes', async (_event, mediaId: string, notes: string) => {
      return this.setNotes(mediaId, notes);
    });
    
    ipcMain.handle('mediaorg:setCustomField', async (_event, mediaId: string, field: string, value: string) => {
      return this.setCustomField(mediaId, field, value);
    });

    // Project linking
    ipcMain.handle('mediaorg:linkToProject', async (_event, mediaId: string, projectId: string, projectType: string, linkType?: string) => {
      return this.linkToProject(mediaId, projectId, projectType as ProjectLink['projectType'], linkType as ProjectLink['linkType']);
    });
    
    ipcMain.handle('mediaorg:unlinkFromProject', async (_event, linkId: string) => {
      return this.unlinkFromProject(linkId);
    });
    
    ipcMain.handle('mediaorg:getProjectLinks', (_event, mediaId: string) => this.getProjectLinks(mediaId));
    ipcMain.handle('mediaorg:getMediaForProject', (_event, projectId: string) => this.getMediaForProject(projectId));

    // Drag and drop support
    ipcMain.handle('mediaorg:prepareDrop', (_event, mediaIds: string[]) => {
      return this.prepareDrop(mediaIds);
    });

    // Search and filter
    ipcMain.handle('mediaorg:search', (_event, query: string, filter?: MediaFilter) => {
      return this.search(query, filter);
    });

    // Stats and config
    ipcMain.handle('mediaorg:getStats', () => this.getStats());
    ipcMain.handle('mediaorg:getConfig', () => this.config);
    ipcMain.handle('mediaorg:updateConfig', async (_event, updates: Partial<OrganizationConfig>) => {
      return this.updateConfig(updates);
    });

    // Batch operations
    ipcMain.handle('mediaorg:batchTag', async (_event, mediaIds: string[], tagIds: string[]) => {
      return this.batchTag(mediaIds, tagIds);
    });
    
    ipcMain.handle('mediaorg:batchUntag', async (_event, mediaIds: string[], tagIds: string[]) => {
      return this.batchUntag(mediaIds, tagIds);
    });
    
    ipcMain.handle('mediaorg:batchAddToGroup', async (_event, mediaIds: string[], groupId: string) => {
      return this.addToGroup(groupId, mediaIds);
    });
  }

  // -------------------------------------------------------------------------
  // TAG OPERATIONS
  // -------------------------------------------------------------------------

  async createTag(name: string, options?: Partial<MediaTag>): Promise<MediaTag> {
    const tag: MediaTag = {
      id: this.generateId(),
      name: name.trim(),
      color: options?.color || this.getNextTagColor(),
      icon: options?.icon,
      mediaTypes: options?.mediaTypes || ['any'],
      createdAt: Date.now(),
      usageCount: 0,
    };
    
    this.tags.set(tag.id, tag);
    await this.saveData();
    
    this.emit('tagCreated', tag);
    log.info(`[MediaOrg] Created tag: ${tag.name}`);
    
    return tag;
  }

  async updateTag(tagId: string, updates: Partial<MediaTag>): Promise<MediaTag | null> {
    const tag = this.tags.get(tagId);
    if (!tag) return null;
    
    if (updates.name) tag.name = updates.name.trim();
    if (updates.color) tag.color = updates.color;
    if (updates.icon !== undefined) tag.icon = updates.icon;
    if (updates.mediaTypes) tag.mediaTypes = updates.mediaTypes;
    
    await this.saveData();
    this.emit('tagUpdated', tag);
    
    return tag;
  }

  async deleteTag(tagId: string): Promise<boolean> {
    const tag = this.tags.get(tagId);
    if (!tag) return false;
    
    // Remove tag from all media
    for (const media of this.media.values()) {
      const idx = media.tags.indexOf(tagId);
      if (idx !== -1) {
        media.tags.splice(idx, 1);
      }
    }
    
    this.tags.delete(tagId);
    await this.saveData();
    
    this.emit('tagDeleted', tagId);
    log.info(`[MediaOrg] Deleted tag: ${tag.name}`);
    
    return true;
  }

  getTag(tagId: string): MediaTag | null {
    return this.tags.get(tagId) || null;
  }

  getTags(): MediaTag[] {
    const tags = Array.from(this.tags.values());
    
    switch (this.config.tagSortBy) {
      case 'name':
        return tags.sort((a, b) => a.name.localeCompare(b.name));
      case 'usage':
        return tags.sort((a, b) => b.usageCount - a.usageCount);
      case 'date':
        return tags.sort((a, b) => b.createdAt - a.createdAt);
      default:
        return tags;
    }
  }

  suggestTags(mediaId: string): MediaTag[] {
    if (!this.config.suggestTags) return [];
    
    const media = this.media.get(mediaId);
    if (!media) return [];
    
    // Find commonly co-occurring tags
    const cooccurrence = new Map<string, number>();
    
    for (const existingTag of media.tags) {
      // Find other media with this tag
      for (const otherMedia of this.media.values()) {
        if (otherMedia.id === mediaId) continue;
        if (!otherMedia.tags.includes(existingTag)) continue;
        
        // Count other tags from that media
        for (const otherTag of otherMedia.tags) {
          if (!media.tags.includes(otherTag)) {
            cooccurrence.set(otherTag, (cooccurrence.get(otherTag) || 0) + 1);
          }
        }
      }
    }
    
    // Also suggest based on type
    const suggestions: MediaTag[] = [];
    
    for (const tag of this.tags.values()) {
      if (media.tags.includes(tag.id)) continue;
      
      if (tag.mediaTypes.includes(media.type) || tag.mediaTypes.includes('any')) {
        const score = cooccurrence.get(tag.id) || 0;
        suggestions.push({ ...tag, usageCount: score });
      }
    }
    
    return suggestions
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, this.config.maxSuggestions);
  }

  private getNextTagColor(): string {
    const usedColors = new Set(Array.from(this.tags.values()).map(t => t.color));
    for (const color of TAG_COLORS) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    return TAG_COLORS[this.tags.size % TAG_COLORS.length];
  }

  // -------------------------------------------------------------------------
  // GROUP OPERATIONS
  // -------------------------------------------------------------------------

  async createGroup(name: string, type?: GroupType): Promise<MediaGroup> {
    const group: MediaGroup = {
      id: this.generateId(),
      name: name.trim(),
      type: type || this.config.defaultGroupType,
      items: [],
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {},
      isLocked: false,
      sortOrder: this.groups.size,
    };
    
    this.groups.set(group.id, group);
    await this.saveData();
    
    this.emit('groupCreated', group);
    log.info(`[MediaOrg] Created group: ${group.name}`);
    
    return group;
  }

  async updateGroup(groupId: string, updates: Partial<MediaGroup>): Promise<MediaGroup | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;
    
    if (updates.name) group.name = updates.name.trim();
    if (updates.description !== undefined) group.description = updates.description;
    if (updates.type) group.type = updates.type;
    if (updates.coverImage !== undefined) group.coverImage = updates.coverImage;
    if (updates.color !== undefined) group.color = updates.color;
    if (updates.icon !== undefined) group.icon = updates.icon;
    if (updates.tags) group.tags = updates.tags;
    if (updates.metadata) group.metadata = { ...group.metadata, ...updates.metadata };
    if (updates.isLocked !== undefined) group.isLocked = updates.isLocked;
    if (updates.sortOrder !== undefined) group.sortOrder = updates.sortOrder;
    
    group.updatedAt = Date.now();
    
    await this.saveData();
    this.emit('groupUpdated', group);
    
    return group;
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (!group || group.isLocked) return false;
    
    // Remove group reference from all media
    for (const media of this.media.values()) {
      const idx = media.groups.indexOf(groupId);
      if (idx !== -1) {
        media.groups.splice(idx, 1);
      }
    }
    
    this.groups.delete(groupId);
    await this.saveData();
    
    this.emit('groupDeleted', groupId);
    log.info(`[MediaOrg] Deleted group: ${group.name}`);
    
    return true;
  }

  getGroup(groupId: string): MediaGroup | null {
    return this.groups.get(groupId) || null;
  }

  getGroups(type?: GroupType): MediaGroup[] {
    let groups = Array.from(this.groups.values());
    
    if (type) {
      groups = groups.filter(g => g.type === type);
    }
    
    switch (this.config.groupSortBy) {
      case 'name':
        return groups.sort((a, b) => a.name.localeCompare(b.name));
      case 'date':
        return groups.sort((a, b) => b.updatedAt - a.updatedAt);
      case 'itemCount':
        return groups.sort((a, b) => b.items.length - a.items.length);
      default:
        return groups.sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }

  async addToGroup(groupId: string, mediaIds: string[]): Promise<MediaGroup | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;
    
    for (const mediaId of mediaIds) {
      const media = this.media.get(mediaId);
      if (!media) continue;
      
      if (!group.items.includes(mediaId)) {
        group.items.push(mediaId);
      }
      
      if (!media.groups.includes(groupId)) {
        media.groups.push(groupId);
      }
    }
    
    group.updatedAt = Date.now();
    
    // Set first item as cover if none
    if (!group.coverImage && group.items.length > 0) {
      const firstMedia = this.media.get(group.items[0]);
      if (firstMedia && firstMedia.type === 'image') {
        group.coverImage = firstMedia.path;
      }
    }
    
    await this.saveData();
    this.emit('groupUpdated', group);
    
    return group;
  }

  async removeFromGroup(groupId: string, mediaIds: string[]): Promise<MediaGroup | null> {
    const group = this.groups.get(groupId);
    if (!group) return null;
    
    for (const mediaId of mediaIds) {
      const media = this.media.get(mediaId);
      
      // Remove from group
      const groupIdx = group.items.indexOf(mediaId);
      if (groupIdx !== -1) {
        group.items.splice(groupIdx, 1);
      }
      
      // Remove group reference from media
      if (media) {
        const mediaGroupIdx = media.groups.indexOf(groupId);
        if (mediaGroupIdx !== -1) {
          media.groups.splice(mediaGroupIdx, 1);
        }
      }
    }
    
    group.updatedAt = Date.now();
    await this.saveData();
    this.emit('groupUpdated', group);
    
    return group;
  }

  // -------------------------------------------------------------------------
  // MEDIA REGISTRATION
  // -------------------------------------------------------------------------

  async registerMedia(filePath: string, type: MediaOrgType): Promise<OrganizedMedia> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    
    // Check if already registered
    for (const media of this.media.values()) {
      if (media.path === absolutePath) {
        return media;
      }
    }
    
    const media: OrganizedMedia = {
      id: this.generateId(),
      path: absolutePath,
      type,
      tags: [],
      groups: [],
      projects: [],
      customFields: {},
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    
    this.media.set(media.id, media);
    await this.saveData();
    
    this.emit('mediaRegistered', media);
    return media;
  }

  async unregisterMedia(mediaId: string): Promise<boolean> {
    const media = this.media.get(mediaId);
    if (!media) return false;
    
    // Remove from all groups
    for (const groupId of media.groups) {
      const group = this.groups.get(groupId);
      if (group) {
        const idx = group.items.indexOf(mediaId);
        if (idx !== -1) {
          group.items.splice(idx, 1);
        }
      }
    }
    
    // Update tag usage counts
    for (const tagId of media.tags) {
      const tag = this.tags.get(tagId);
      if (tag) {
        tag.usageCount = Math.max(0, tag.usageCount - 1);
      }
    }
    
    // Remove project links
    for (const [linkId, link] of this.links) {
      if (link.mediaId === mediaId) {
        this.links.delete(linkId);
      }
    }
    
    this.media.delete(mediaId);
    await this.saveData();
    
    this.emit('mediaUnregistered', mediaId);
    return true;
  }

  getMedia(mediaId: string): OrganizedMedia | null {
    return this.media.get(mediaId) || null;
  }

  getAllMedia(filter?: MediaFilter): OrganizedMedia[] {
    let results = Array.from(this.media.values());
    
    if (filter) {
      results = this.applyFilter(results, filter);
    }
    
    return results;
  }

  // -------------------------------------------------------------------------
  // TAGGING
  // -------------------------------------------------------------------------

  async tagMedia(mediaId: string, tagIds: string[]): Promise<OrganizedMedia | null> {
    const media = this.media.get(mediaId);
    if (!media) return null;
    
    for (const tagId of tagIds) {
      const tag = this.tags.get(tagId);
      if (!tag) {
        // Auto-create tag if enabled
        if (this.config.autoCreateTags) {
          await this.createTag(tagId);
        } else {
          continue;
        }
      }
      
      if (!media.tags.includes(tagId)) {
        media.tags.push(tagId);
        
        // Update usage count
        const t = this.tags.get(tagId);
        if (t) t.usageCount++;
      }
    }
    
    media.modifiedAt = Date.now();
    await this.saveData();
    
    this.emit('mediaTagged', { mediaId, tagIds });
    return media;
  }

  async untagMedia(mediaId: string, tagIds: string[]): Promise<OrganizedMedia | null> {
    const media = this.media.get(mediaId);
    if (!media) return null;
    
    for (const tagId of tagIds) {
      const idx = media.tags.indexOf(tagId);
      if (idx !== -1) {
        media.tags.splice(idx, 1);
        
        // Update usage count
        const tag = this.tags.get(tagId);
        if (tag) tag.usageCount = Math.max(0, tag.usageCount - 1);
      }
    }
    
    media.modifiedAt = Date.now();
    await this.saveData();
    
    this.emit('mediaUntagged', { mediaId, tagIds });
    return media;
  }

  async batchTag(mediaIds: string[], tagIds: string[]): Promise<number> {
    let count = 0;
    
    for (const mediaId of mediaIds) {
      const result = await this.tagMedia(mediaId, tagIds);
      if (result) count++;
    }
    
    return count;
  }

  async batchUntag(mediaIds: string[], tagIds: string[]): Promise<number> {
    let count = 0;
    
    for (const mediaId of mediaIds) {
      const result = await this.untagMedia(mediaId, tagIds);
      if (result) count++;
    }
    
    return count;
  }

  // -------------------------------------------------------------------------
  // MEDIA METADATA
  // -------------------------------------------------------------------------

  async setRating(mediaId: string, rating: number): Promise<boolean> {
    const media = this.media.get(mediaId);
    if (!media) return false;
    
    media.rating = Math.max(0, Math.min(5, rating));
    media.modifiedAt = Date.now();
    
    await this.saveData();
    this.emit('mediaUpdated', media);
    
    return true;
  }

  async setNotes(mediaId: string, notes: string): Promise<boolean> {
    const media = this.media.get(mediaId);
    if (!media) return false;
    
    media.notes = notes;
    media.modifiedAt = Date.now();
    
    await this.saveData();
    this.emit('mediaUpdated', media);
    
    return true;
  }

  async setCustomField(mediaId: string, field: string, value: string): Promise<boolean> {
    const media = this.media.get(mediaId);
    if (!media) return false;
    
    media.customFields[field] = value;
    media.modifiedAt = Date.now();
    
    await this.saveData();
    this.emit('mediaUpdated', media);
    
    return true;
  }

  // -------------------------------------------------------------------------
  // PROJECT LINKING
  // -------------------------------------------------------------------------

  async linkToProject(
    mediaId: string,
    projectId: string,
    projectType: ProjectLink['projectType'],
    linkType: ProjectLink['linkType'] = 'reference'
  ): Promise<ProjectLink | null> {
    const media = this.media.get(mediaId);
    if (!media) return null;
    
    const link: ProjectLink = {
      id: this.generateId(),
      mediaId,
      projectId,
      projectType,
      linkType,
      createdAt: Date.now(),
      metadata: {},
    };
    
    this.links.set(link.id, link);
    
    if (!media.projects.includes(projectId)) {
      media.projects.push(projectId);
    }
    
    await this.saveData();
    this.emit('projectLinked', link);
    
    return link;
  }

  async unlinkFromProject(linkId: string): Promise<boolean> {
    const link = this.links.get(linkId);
    if (!link) return false;
    
    const media = this.media.get(link.mediaId);
    if (media) {
      // Check if there are other links to the same project
      const otherLinks = Array.from(this.links.values()).filter(
        l => l.mediaId === link.mediaId && l.projectId === link.projectId && l.id !== linkId
      );
      
      if (otherLinks.length === 0) {
        const idx = media.projects.indexOf(link.projectId);
        if (idx !== -1) {
          media.projects.splice(idx, 1);
        }
      }
    }
    
    this.links.delete(linkId);
    await this.saveData();
    this.emit('projectUnlinked', linkId);
    
    return true;
  }

  getProjectLinks(mediaId: string): ProjectLink[] {
    return Array.from(this.links.values()).filter(l => l.mediaId === mediaId);
  }

  getMediaForProject(projectId: string): OrganizedMedia[] {
    const mediaIds = new Set<string>();
    
    for (const link of this.links.values()) {
      if (link.projectId === projectId) {
        mediaIds.add(link.mediaId);
      }
    }
    
    return Array.from(mediaIds).map(id => this.media.get(id)).filter(Boolean) as OrganizedMedia[];
  }

  // -------------------------------------------------------------------------
  // DRAG AND DROP
  // -------------------------------------------------------------------------

  prepareDrop(mediaIds: string[]): { paths: string[]; ids: string[]; type: string } {
    const paths: string[] = [];
    const validIds: string[] = [];
    
    for (const id of mediaIds) {
      const media = this.media.get(id);
      if (media) {
        paths.push(media.path);
        validIds.push(id);
      }
    }
    
    return {
      paths,
      ids: validIds,
      type: 'dex-media',
    };
  }

  // -------------------------------------------------------------------------
  // SEARCH & FILTER
  // -------------------------------------------------------------------------

  search(query: string, filter?: MediaFilter): OrganizedMedia[] {
    let results = Array.from(this.media.values());
    
    if (query) {
      const lowerQuery = query.toLowerCase();
      
      results = results.filter(media => {
        // Search in path/filename
        if (media.path.toLowerCase().includes(lowerQuery)) return true;
        
        // Search in notes
        if (media.notes?.toLowerCase().includes(lowerQuery)) return true;
        
        // Search in tags
        for (const tagId of media.tags) {
          const tag = this.tags.get(tagId);
          if (tag?.name.toLowerCase().includes(lowerQuery)) return true;
        }
        
        // Search in groups
        for (const groupId of media.groups) {
          const group = this.groups.get(groupId);
          if (group?.name.toLowerCase().includes(lowerQuery)) return true;
        }
        
        // Search in custom fields
        for (const value of Object.values(media.customFields)) {
          if (value.toLowerCase().includes(lowerQuery)) return true;
        }
        
        return false;
      });
    }
    
    if (filter) {
      results = this.applyFilter(results, filter);
    }
    
    return results;
  }

  private applyFilter(media: OrganizedMedia[], filter: MediaFilter): OrganizedMedia[] {
    return media.filter(m => {
      if (filter.types && filter.types.length > 0) {
        if (!filter.types.includes(m.type)) return false;
      }
      
      if (filter.tags && filter.tags.length > 0) {
        if (!filter.tags.some(t => m.tags.includes(t))) return false;
      }
      
      if (filter.groups && filter.groups.length > 0) {
        if (!filter.groups.some(g => m.groups.includes(g))) return false;
      }
      
      if (filter.projects && filter.projects.length > 0) {
        if (!filter.projects.some(p => m.projects.includes(p))) return false;
      }
      
      if (filter.rating !== undefined) {
        if (!m.rating || m.rating < filter.rating) return false;
      }
      
      if (filter.dateRange) {
        if (m.createdAt < filter.dateRange.start || m.createdAt > filter.dateRange.end) {
          return false;
        }
      }
      
      if (filter.hasNotes !== undefined) {
        const hasNotes = !!m.notes && m.notes.trim().length > 0;
        if (filter.hasNotes !== hasNotes) return false;
      }
      
      if (filter.untagged) {
        if (m.tags.length > 0) return false;
      }
      
      if (filter.ungrouped) {
        if (m.groups.length > 0) return false;
      }
      
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): OrganizationStats {
    const allMedia = Array.from(this.media.values());
    const byType: Record<MediaOrgType, number> = {
      audio: 0, video: 0, image: 0, document: 0, any: 0,
    };
    
    let untagged = 0;
    let ungrouped = 0;
    
    for (const media of allMedia) {
      byType[media.type]++;
      if (media.tags.length === 0) untagged++;
      if (media.groups.length === 0) ungrouped++;
    }
    
    const topTags = this.getTags()
      .slice(0, 10)
      .map(tag => ({ tag, count: tag.usageCount }));
    
    const recentlyTagged = allMedia
      .filter(m => m.tags.length > 0)
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, 10);
    
    return {
      totalMedia: allMedia.length,
      byType,
      totalTags: this.tags.size,
      totalGroups: this.groups.size,
      totalLinks: this.links.size,
      untaggedCount: untagged,
      ungroupedCount: ungrouped,
      topTags,
      recentlyTagged,
    };
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

  async updateConfig(updates: Partial<OrganizationConfig>): Promise<OrganizationConfig> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    this.emit('configUpdated', this.config);
    return this.config;
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadData(): Promise<void> {
    const dataPath = path.join(this.dataPath, 'organization.json');
    
    try {
      const data = await fs.readFile(dataPath, 'utf-8');
      const saved = JSON.parse(data);
      
      if (saved.media) {
        this.media = new Map(saved.media.map((m: OrganizedMedia) => [m.id, m]));
      }
      if (saved.tags) {
        this.tags = new Map(saved.tags.map((t: MediaTag) => [t.id, t]));
      }
      if (saved.groups) {
        this.groups = new Map(saved.groups.map((g: MediaGroup) => [g.id, g]));
      }
      if (saved.links) {
        this.links = new Map(saved.links.map((l: ProjectLink) => [l.id, l]));
      }
    } catch {
      // Start fresh
    }
  }

  private async saveData(): Promise<void> {
    const dataPath = path.join(this.dataPath, 'organization.json');
    
    const data = {
      media: Array.from(this.media.values()),
      tags: Array.from(this.tags.values()),
      groups: Array.from(this.groups.values()),
      links: Array.from(this.links.values()),
    };
    
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    await this.saveData();
    await this.saveConfig();
    log.info('[MediaOrg] Shutdown complete');
  }
}

// ===========================================================================
// EXPORT
// ===========================================================================

export const MediaOrganization = new MediaOrganizationClass();
export default MediaOrganization;
