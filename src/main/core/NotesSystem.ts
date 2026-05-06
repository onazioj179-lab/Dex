// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Notes System
// OS-Level notes with text, voice, media support
// Markdown, rich text, quick capture, tagging, search
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type NoteType = 'text' | 'markdown' | 'richtext' | 'voice' | 'checklist';
export type NoteStatus = 'active' | 'archived' | 'trashed';

export interface NoteAttachment {
  id: string;
  type: 'image' | 'audio' | 'video' | 'file';
  name: string;
  path: string;
  size: number;
  mimeType?: string;
  thumbnail?: string;
  duration?: number; // For audio/video
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  indent: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  type: NoteType;
  status: NoteStatus;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  tags: string[];
  color?: string;
  pinned: boolean;
  locked: boolean;
  folderId?: string;
  attachments: NoteAttachment[];
  checklist?: ChecklistItem[];
  wordCount: number;
  characterCount: number;
  metadata?: Record<string, unknown>;
}

export interface NoteFolder {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  parentId?: string;
  createdAt: number;
  noteCount: number;
}

export interface NotesConfig {
  defaultType: NoteType;
  autoSaveInterval: number;
  trashRetentionDays: number;
  maxAttachmentSize: number;
  enableVersionHistory: boolean;
  maxVersions: number;
  sortBy: 'updatedAt' | 'createdAt' | 'title' | 'accessedAt';
  sortOrder: 'asc' | 'desc';
}

export interface NoteFilter {
  type?: NoteType;
  status?: NoteStatus;
  tags?: string[];
  folderId?: string;
  pinned?: boolean;
  search?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  title: string;
  timestamp: number;
  wordCount: number;
}

export interface NotesStats {
  totalNotes: number;
  activeNotes: number;
  archivedNotes: number;
  trashedNotes: number;
  pinnedNotes: number;
  byType: Record<NoteType, number>;
  byFolder: Record<string, number>;
  totalWords: number;
  totalAttachments: number;
  recentTags: string[];
}

// ===========================================================================
// NOTES SYSTEM
// ===========================================================================

class NotesSystemClass extends EventEmitter {
  private notes: Map<string, Note> = new Map();
  private folders: Map<string, NoteFolder> = new Map();
  private versions: Map<string, NoteVersion[]> = new Map();
  private config: NotesConfig;
  private dataPath = '';
  private attachmentsPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.config = {
      defaultType: 'markdown',
      autoSaveInterval: 5000,
      trashRetentionDays: 30,
      maxAttachmentSize: 50 * 1024 * 1024, // 50MB
      enableVersionHistory: true,
      maxVersions: 50,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'notes');
    this.attachmentsPath = path.join(this.dataPath, 'attachments');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await fs.mkdir(this.attachmentsPath, { recursive: true });
      await this.loadNotes();
      await this.loadFolders();
      await this.loadConfig();
      
      // Cleanup trash
      await this.cleanupTrash();
      
      log.info(`[Notes] Initialized with ${this.notes.size} notes`);
    } catch (error) {
      log.error('[Notes] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Notes CRUD
    ipcMain.handle('notes:create', async (_event, data: Partial<Note>) => {
      return this.createNote(data);
    });

    ipcMain.handle('notes:get', (_event, id: string) => {
      return this.getNote(id);
    });

    ipcMain.handle('notes:update', async (_event, id: string, data: Partial<Note>) => {
      return this.updateNote(id, data);
    });

    ipcMain.handle('notes:delete', async (_event, id: string, permanent?: boolean) => {
      return this.deleteNote(id, permanent);
    });

    ipcMain.handle('notes:list', (_event, filter?: NoteFilter) => {
      return this.listNotes(filter);
    });

    // Quick actions
    ipcMain.handle('notes:quickCapture', async (_event, content: string, type?: NoteType) => {
      return this.quickCapture(content, type);
    });

    ipcMain.handle('notes:pin', async (_event, id: string, pinned: boolean) => {
      return this.setPinned(id, pinned);
    });

    ipcMain.handle('notes:archive', async (_event, id: string) => {
      return this.archiveNote(id);
    });

    ipcMain.handle('notes:restore', async (_event, id: string) => {
      return this.restoreNote(id);
    });

    ipcMain.handle('notes:duplicate', async (_event, id: string) => {
      return this.duplicateNote(id);
    });

    // Tags
    ipcMain.handle('notes:setTags', async (_event, id: string, tags: string[]) => {
      return this.setTags(id, tags);
    });

    ipcMain.handle('notes:getAllTags', () => {
      return this.getAllTags();
    });

    // Folders
    ipcMain.handle('notes:createFolder', async (_event, name: string, parentId?: string) => {
      return this.createFolder(name, parentId);
    });

    ipcMain.handle('notes:listFolders', () => {
      return this.listFolders();
    });

    ipcMain.handle('notes:moveToFolder', async (_event, noteId: string, folderId?: string) => {
      return this.moveToFolder(noteId, folderId);
    });

    ipcMain.handle('notes:deleteFolder', async (_event, folderId: string) => {
      return this.deleteFolder(folderId);
    });

    // Attachments
    ipcMain.handle('notes:addAttachment', async (_event, noteId: string, filePath: string) => {
      return this.addAttachment(noteId, filePath);
    });

    ipcMain.handle('notes:removeAttachment', async (_event, noteId: string, attachmentId: string) => {
      return this.removeAttachment(noteId, attachmentId);
    });

    // Checklist
    ipcMain.handle('notes:toggleCheckItem', async (_event, noteId: string, itemId: string) => {
      return this.toggleChecklistItem(noteId, itemId);
    });

    // Search
    ipcMain.handle('notes:search', (_event, query: string) => {
      return this.searchNotes(query);
    });

    // Versions
    ipcMain.handle('notes:versions', (_event, noteId: string) => {
      return this.getVersions(noteId);
    });

    ipcMain.handle('notes:restoreVersion', async (_event, noteId: string, versionId: string) => {
      return this.restoreVersion(noteId, versionId);
    });

    // Stats
    ipcMain.handle('notes:stats', () => {
      return this.getStats();
    });

    // Export
    ipcMain.handle('notes:export', async (_event, noteId: string, format: string) => {
      return this.exportNote(noteId, format);
    });

    ipcMain.handle('notes:exportAll', async (_event, format: string) => {
      return this.exportAllNotes(format);
    });

    // Config
    ipcMain.handle('notes:config', () => this.config);
    ipcMain.handle('notes:setConfig', async (_event, config: Partial<NotesConfig>) => {
      return this.setConfig(config);
    });
  }

  // -------------------------------------------------------------------------
  // NOTE OPERATIONS
  // -------------------------------------------------------------------------

  async createNote(data: Partial<Note>): Promise<Note> {
    const now = Date.now();
    const id = `note-${++this.idCounter}-${now}`;
    const content = data.content || '';

    const note: Note = {
      id,
      title: data.title || 'Untitled',
      content,
      type: data.type || this.config.defaultType,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
      tags: data.tags || [],
      color: data.color,
      pinned: data.pinned || false,
      locked: false,
      folderId: data.folderId,
      attachments: [],
      checklist: data.type === 'checklist' ? [] : undefined,
      wordCount: this.countWords(content),
      characterCount: content.length,
      metadata: data.metadata,
    };

    this.notes.set(id, note);
    await this.saveNote(note);
    
    // Update folder count
    if (note.folderId) {
      this.updateFolderCount(note.folderId);
    }

    this.emit('note:created', note);
    return note;
  }

  getNote(id: string): Note | null {
    const note = this.notes.get(id);
    if (note) {
      note.accessedAt = Date.now();
    }
    return note || null;
  }

  async updateNote(id: string, data: Partial<Note>): Promise<{ success: boolean; note?: Note }> {
    const note = this.notes.get(id);
    if (!note) {
      return { success: false };
    }

    if (note.locked) {
      return { success: false };
    }

    // Save version before updating
    if (this.config.enableVersionHistory && data.content && data.content !== note.content) {
      await this.saveVersion(note);
    }

    // Update fields
    if (data.title !== undefined) note.title = data.title;
    if (data.content !== undefined) {
      note.content = data.content;
      note.wordCount = this.countWords(data.content);
      note.characterCount = data.content.length;
    }
    if (data.type !== undefined) note.type = data.type;
    if (data.tags !== undefined) note.tags = data.tags;
    if (data.color !== undefined) note.color = data.color;
    if (data.folderId !== undefined) {
      const oldFolderId = note.folderId;
      note.folderId = data.folderId;
      if (oldFolderId) this.updateFolderCount(oldFolderId);
      if (data.folderId) this.updateFolderCount(data.folderId);
    }
    if (data.checklist !== undefined) note.checklist = data.checklist;
    if (data.metadata !== undefined) note.metadata = { ...note.metadata, ...data.metadata };

    note.updatedAt = Date.now();

    await this.saveNote(note);
    this.emit('note:updated', note);

    return { success: true, note };
  }

  async deleteNote(id: string, permanent = false): Promise<{ success: boolean }> {
    const note = this.notes.get(id);
    if (!note) {
      return { success: false };
    }

    if (permanent || note.status === 'trashed') {
      // Delete attachments
      for (const attachment of note.attachments) {
        await fs.unlink(attachment.path).catch((e: unknown) => { log.warn('[DEX]', e); });
      }

      // Delete note file
      const notePath = path.join(this.dataPath, `${id}.json`);
      await fs.unlink(notePath).catch((e: unknown) => { log.warn('[DEX]', e); });

      // Delete versions
      this.versions.delete(id);

      this.notes.delete(id);
      this.emit('note:deleted', id);
    } else {
      // Move to trash
      note.status = 'trashed';
      note.updatedAt = Date.now();
      await this.saveNote(note);
      this.emit('note:trashed', note);
    }

    // Update folder count
    if (note.folderId) {
      this.updateFolderCount(note.folderId);
    }

    return { success: true };
  }

  listNotes(filter?: NoteFilter): Note[] {
    let notes = Array.from(this.notes.values());

    // Apply filters
    if (filter) {
      if (filter.status) {
        notes = notes.filter(n => n.status === filter.status);
      } else {
        // Default: exclude trashed
        notes = notes.filter(n => n.status !== 'trashed');
      }

      if (filter.type) {
        notes = notes.filter(n => n.type === filter.type);
      }

      if (filter.folderId !== undefined) {
        notes = notes.filter(n => n.folderId === filter.folderId);
      }

      if (filter.pinned !== undefined) {
        notes = notes.filter(n => n.pinned === filter.pinned);
      }

      if (filter.tags?.length) {
        notes = notes.filter(n => filter.tags!.some(t => n.tags.includes(t)));
      }

      if (filter.dateFrom) {
        notes = notes.filter(n => n.updatedAt >= filter.dateFrom!);
      }

      if (filter.dateTo) {
        notes = notes.filter(n => n.updatedAt <= filter.dateTo!);
      }

      if (filter.search) {
        const query = filter.search.toLowerCase();
        notes = notes.filter(n =>
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query) ||
          n.tags.some(t => t.toLowerCase().includes(query))
        );
      }
    } else {
      notes = notes.filter(n => n.status !== 'trashed');
    }

    // Sort
    notes.sort((a, b) => {
      // Pinned first
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      const aVal = a[this.config.sortBy];
      const bVal = b[this.config.sortBy];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return this.config.sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      const aNum = aVal as number;
      const bNum = bVal as number;
      return this.config.sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
    });

    // Pagination
    if (filter?.offset) {
      notes = notes.slice(filter.offset);
    }
    if (filter?.limit) {
      notes = notes.slice(0, filter.limit);
    }

    return notes;
  }

  // -------------------------------------------------------------------------
  // QUICK ACTIONS
  // -------------------------------------------------------------------------

  async quickCapture(content: string, type?: NoteType): Promise<Note> {
    // Auto-detect type
    let detectedType = type || this.config.defaultType;
    
    if (!type) {
      if (content.includes('- [ ]') || content.includes('* [ ]')) {
        detectedType = 'checklist';
      } else if (content.includes('# ') || content.includes('```') || content.includes('**')) {
        detectedType = 'markdown';
      }
    }

    // Extract title from first line
    const lines = content.split('\n');
    let title = lines[0].replace(/^#+\s*/, '').substring(0, 100);
    if (!title.trim()) title = 'Quick Note';

    const note = await this.createNote({
      title,
      content,
      type: detectedType,
    });

    // Parse checklist if needed
    if (detectedType === 'checklist') {
      note.checklist = this.parseChecklist(content);
      await this.saveNote(note);
    }

    return note;
  }

  async setPinned(id: string, pinned: boolean): Promise<{ success: boolean }> {
    const note = this.notes.get(id);
    if (note) {
      note.pinned = pinned;
      note.updatedAt = Date.now();
      await this.saveNote(note);
      this.emit('note:updated', note);
      return { success: true };
    }
    return { success: false };
  }

  async archiveNote(id: string): Promise<{ success: boolean }> {
    const note = this.notes.get(id);
    if (note) {
      note.status = 'archived';
      note.updatedAt = Date.now();
      await this.saveNote(note);
      this.emit('note:archived', note);
      return { success: true };
    }
    return { success: false };
  }

  async restoreNote(id: string): Promise<{ success: boolean }> {
    const note = this.notes.get(id);
    if (note && (note.status === 'archived' || note.status === 'trashed')) {
      note.status = 'active';
      note.updatedAt = Date.now();
      await this.saveNote(note);
      this.emit('note:restored', note);
      return { success: true };
    }
    return { success: false };
  }

  async duplicateNote(id: string): Promise<Note | null> {
    const original = this.notes.get(id);
    if (!original) return null;

    return this.createNote({
      title: `${original.title} (Copy)`,
      content: original.content,
      type: original.type,
      tags: [...original.tags],
      color: original.color,
      folderId: original.folderId,
      checklist: original.checklist ? [...original.checklist] : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // TAGS
  // -------------------------------------------------------------------------

  async setTags(id: string, tags: string[]): Promise<{ success: boolean }> {
    const note = this.notes.get(id);
    if (note) {
      note.tags = tags;
      note.updatedAt = Date.now();
      await this.saveNote(note);
      this.emit('note:updated', note);
      return { success: true };
    }
    return { success: false };
  }

  getAllTags(): { tag: string; count: number }[] {
    const tagCounts = new Map<string, number>();
    
    for (const note of this.notes.values()) {
      if (note.status !== 'trashed') {
        for (const tag of note.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // -------------------------------------------------------------------------
  // FOLDERS
  // -------------------------------------------------------------------------

  async createFolder(name: string, parentId?: string): Promise<NoteFolder> {
    const id = `folder-${++this.idCounter}-${Date.now()}`;
    
    const folder: NoteFolder = {
      id,
      name,
      parentId,
      createdAt: Date.now(),
      noteCount: 0,
    };

    this.folders.set(id, folder);
    await this.saveFolders();

    this.emit('folder:created', folder);
    return folder;
  }

  listFolders(): NoteFolder[] {
    return Array.from(this.folders.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async moveToFolder(noteId: string, folderId?: string): Promise<{ success: boolean }> {
    const note = this.notes.get(noteId);
    if (note) {
      const oldFolderId = note.folderId;
      note.folderId = folderId;
      note.updatedAt = Date.now();
      
      if (oldFolderId) this.updateFolderCount(oldFolderId);
      if (folderId) this.updateFolderCount(folderId);
      
      await this.saveNote(note);
      this.emit('note:moved', { noteId, folderId });
      return { success: true };
    }
    return { success: false };
  }

  async deleteFolder(folderId: string): Promise<{ success: boolean }> {
    const folder = this.folders.get(folderId);
    if (!folder) return { success: false };

    // Move notes out of folder
    for (const note of this.notes.values()) {
      if (note.folderId === folderId) {
        note.folderId = undefined;
        await this.saveNote(note);
      }
    }

    this.folders.delete(folderId);
    await this.saveFolders();

    this.emit('folder:deleted', folderId);
    return { success: true };
  }

  private updateFolderCount(folderId: string): void {
    const folder = this.folders.get(folderId);
    if (folder) {
      folder.noteCount = Array.from(this.notes.values())
        .filter(n => n.folderId === folderId && n.status !== 'trashed')
        .length;
    }
  }

  // -------------------------------------------------------------------------
  // ATTACHMENTS
  // -------------------------------------------------------------------------

  async addAttachment(noteId: string, filePath: string): Promise<{ success: boolean; attachment?: NoteAttachment }> {
    const note = this.notes.get(noteId);
    if (!note) return { success: false };

    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.config.maxAttachmentSize) {
        return { success: false };
      }

      const ext = path.extname(filePath).toLowerCase();
      const attachmentId = crypto.randomBytes(8).toString('hex');
      const destPath = path.join(this.attachmentsPath, `${attachmentId}${ext}`);

      await fs.copyFile(filePath, destPath);

      const attachment: NoteAttachment = {
        id: attachmentId,
        type: this.getAttachmentType(ext),
        name: path.basename(filePath),
        path: destPath,
        size: stats.size,
      };

      note.attachments.push(attachment);
      note.updatedAt = Date.now();
      await this.saveNote(note);

      this.emit('attachment:added', { noteId, attachment });
      return { success: true, attachment };

    } catch (error) {
      log.error('[Notes] Failed to add attachment:', error);
      return { success: false };
    }
  }

  async removeAttachment(noteId: string, attachmentId: string): Promise<{ success: boolean }> {
    const note = this.notes.get(noteId);
    if (!note) return { success: false };

    const index = note.attachments.findIndex(a => a.id === attachmentId);
    if (index === -1) return { success: false };

    const attachment = note.attachments[index];
    await fs.unlink(attachment.path).catch((e: unknown) => { log.warn('[DEX]', e); });

    note.attachments.splice(index, 1);
    note.updatedAt = Date.now();
    await this.saveNote(note);

    this.emit('attachment:removed', { noteId, attachmentId });
    return { success: true };
  }

  private getAttachmentType(ext: string): NoteAttachment['type'] {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
    const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];

    if (imageExts.includes(ext)) return 'image';
    if (audioExts.includes(ext)) return 'audio';
    if (videoExts.includes(ext)) return 'video';
    return 'file';
  }

  // -------------------------------------------------------------------------
  // CHECKLIST
  // -------------------------------------------------------------------------

  async toggleChecklistItem(noteId: string, itemId: string): Promise<{ success: boolean }> {
    const note = this.notes.get(noteId);
    if (!note || !note.checklist) return { success: false };

    const item = note.checklist.find(i => i.id === itemId);
    if (item) {
      item.checked = !item.checked;
      note.updatedAt = Date.now();
      await this.saveNote(note);
      this.emit('note:updated', note);
      return { success: true };
    }
    return { success: false };
  }

  private parseChecklist(content: string): ChecklistItem[] {
    const items: ChecklistItem[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\s*)[-*]\s*\[([ x])\]\s*(.*)$/i);
      if (match) {
        items.push({
          id: crypto.randomBytes(4).toString('hex'),
          text: match[3],
          checked: match[2].toLowerCase() === 'x',
          indent: Math.floor(match[1].length / 2),
        });
      }
    }

    return items;
  }

  // -------------------------------------------------------------------------
  // SEARCH
  // -------------------------------------------------------------------------

  searchNotes(query: string): Note[] {
    if (!query.trim()) return this.listNotes({ limit: 50 });

    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/);

    const results = Array.from(this.notes.values())
      .filter(note => note.status !== 'trashed')
      .map(note => {
        let score = 0;
        const titleLower = note.title.toLowerCase();
        const contentLower = note.content.toLowerCase();

        for (const term of terms) {
          // Title match (highest weight)
          if (titleLower.includes(term)) score += 20;
          // Content match
          if (contentLower.includes(term)) score += 10;
          // Tag match
          if (note.tags.some(t => t.toLowerCase().includes(term))) score += 15;
        }

        // Boost pinned
        if (note.pinned) score += 5;
        // Boost recent
        const ageHours = (Date.now() - note.accessedAt) / (1000 * 60 * 60);
        if (ageHours < 24) score += 3;

        return { note, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(({ note }) => note);

    return results;
  }

  // -------------------------------------------------------------------------
  // VERSIONS
  // -------------------------------------------------------------------------

  private async saveVersion(note: Note): Promise<void> {
    if (!this.config.enableVersionHistory) return;

    const versions = this.versions.get(note.id) || [];
    
    const version: NoteVersion = {
      id: `ver-${Date.now()}`,
      noteId: note.id,
      content: note.content,
      title: note.title,
      timestamp: Date.now(),
      wordCount: note.wordCount,
    };

    versions.unshift(version);
    
    // Limit versions
    while (versions.length > this.config.maxVersions) {
      versions.pop();
    }

    this.versions.set(note.id, versions);
  }

  getVersions(noteId: string): NoteVersion[] {
    return this.versions.get(noteId) || [];
  }

  async restoreVersion(noteId: string, versionId: string): Promise<{ success: boolean }> {
    const note = this.notes.get(noteId);
    const versions = this.versions.get(noteId);
    
    if (!note || !versions) return { success: false };

    const version = versions.find(v => v.id === versionId);
    if (!version) return { success: false };

    // Save current as version first
    await this.saveVersion(note);

    note.content = version.content;
    note.title = version.title;
    note.wordCount = version.wordCount;
    note.characterCount = version.content.length;
    note.updatedAt = Date.now();

    await this.saveNote(note);
    this.emit('note:restored', note);

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): NotesStats {
    const notes = Array.from(this.notes.values());
    
    const byType: Record<NoteType, number> = {
      text: 0,
      markdown: 0,
      richtext: 0,
      voice: 0,
      checklist: 0,
    };

    const byFolder: Record<string, number> = {};
    let totalWords = 0;
    let totalAttachments = 0;

    for (const note of notes) {
      byType[note.type]++;
      totalWords += note.wordCount;
      totalAttachments += note.attachments.length;
      
      const folderId = note.folderId || 'unfiled';
      byFolder[folderId] = (byFolder[folderId] || 0) + 1;
    }

    return {
      totalNotes: notes.length,
      activeNotes: notes.filter(n => n.status === 'active').length,
      archivedNotes: notes.filter(n => n.status === 'archived').length,
      trashedNotes: notes.filter(n => n.status === 'trashed').length,
      pinnedNotes: notes.filter(n => n.pinned).length,
      byType,
      byFolder,
      totalWords,
      totalAttachments,
      recentTags: this.getAllTags().slice(0, 20).map(t => t.tag),
    };
  }

  // -------------------------------------------------------------------------
  // EXPORT
  // -------------------------------------------------------------------------

  async exportNote(noteId: string, format: string): Promise<{ success: boolean; content?: string }> {
    const note = this.notes.get(noteId);
    if (!note) return { success: false };

    let content = '';

    switch (format) {
      case 'markdown':
      case 'md':
        content = `# ${note.title}\n\n${note.content}`;
        break;
      case 'text':
      case 'txt':
        content = `${note.title}\n\n${note.content}`;
        break;
      case 'json':
        content = JSON.stringify(note, null, 2);
        break;
      case 'html':
        content = `<!DOCTYPE html>
<html>
<head><title>${note.title}</title></head>
<body>
<h1>${note.title}</h1>
<div>${note.content.replace(/\n/g, '<br>')}</div>
</body>
</html>`;
        break;
      default:
        return { success: false };
    }

    return { success: true, content };
  }

  async exportAllNotes(format: string): Promise<{ success: boolean; path?: string }> {
    const exportDir = path.join(this.dataPath, 'exports', `export-${Date.now()}`);
    await fs.mkdir(exportDir, { recursive: true });

    for (const note of this.notes.values()) {
      if (note.status !== 'trashed') {
        const result = await this.exportNote(note.id, format);
        if (result.success && result.content) {
          const ext = format === 'markdown' ? 'md' : format;
          const fileName = note.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
          await fs.writeFile(
            path.join(exportDir, `${fileName}.${ext}`),
            result.content
          );
        }
      }
    }

    return { success: true, path: exportDir };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  async setConfig(config: Partial<NotesConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadNotes(): Promise<void> {
    try {
      const files = await fs.readdir(this.dataPath);
      
      for (const file of files) {
        if (file.startsWith('note-') && file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.dataPath, file), 'utf-8');
          const note = JSON.parse(data) as Note;
          this.notes.set(note.id, note);
          
          // Extract ID counter
          const match = note.id.match(/note-(\d+)-/);
          if (match) {
            this.idCounter = Math.max(this.idCounter, parseInt(match[1]));
          }
        }
      }
    } catch (error) {
      log.error('[Notes] Failed to load notes:', error);
    }
  }

  private async saveNote(note: Note): Promise<void> {
    try {
      const notePath = path.join(this.dataPath, `${note.id}.json`);
      await fs.writeFile(notePath, JSON.stringify(note, null, 2));
    } catch (error) {
      log.error('[Notes] Failed to save note:', error);
    }
  }

  private async loadFolders(): Promise<void> {
    try {
      const foldersPath = path.join(this.dataPath, 'folders.json');
      const data = await fs.readFile(foldersPath, 'utf-8');
      const folders = JSON.parse(data) as NoteFolder[];
      
      for (const folder of folders) {
        this.folders.set(folder.id, folder);
      }
    } catch {
      // No folders yet
    }
  }

  private async saveFolders(): Promise<void> {
    try {
      const foldersPath = path.join(this.dataPath, 'folders.json');
      const folders = Array.from(this.folders.values());
      await fs.writeFile(foldersPath, JSON.stringify(folders, null, 2));
    } catch (error) {
      log.error('[Notes] Failed to save folders:', error);
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
      log.error('[Notes] Failed to save config:', error);
    }
  }

  private async cleanupTrash(): Promise<void> {
    const cutoff = Date.now() - (this.config.trashRetentionDays * 24 * 60 * 60 * 1000);
    
    for (const note of this.notes.values()) {
      if (note.status === 'trashed' && note.updatedAt < cutoff) {
        await this.deleteNote(note.id, true);
      }
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    // Clear auto-save timers
    for (const timer of this.autoSaveTimers.values()) {
      clearTimeout(timer);
    }
    
    await this.saveFolders();
    await this.saveConfig();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const NotesSystem = new NotesSystemClass();
export default NotesSystem;
