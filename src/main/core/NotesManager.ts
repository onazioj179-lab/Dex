// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Notes -- Full Backend Manager (SQLite)
// ==========================================================================
// Complete note-taking backend with SQLite + FTS5 full-text search,
// document model storage, word suggestion history, bidirectional links,
// folder hierarchy, attachments, templates, and export/import.
// Replaces existing NotesSystem with a proper database-backed implementation.
// ==========================================================================

import log from 'electron-log';
import { ipcMain, app, BrowserWindow, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotesDbNote {
  id: string;
  title: string;
  content: string;
  plain_text: string;
  word_count: number;
  created_at: number;
  updated_at: number;
  pinned: number;
  pin_order: number;
  locked: number;
  color_label: string | null;
  folder_id: string | null;
  is_daily_note: number;
  is_template: number;
  deleted: number;
  deleted_at: number | null;
}

export interface NotesDbFolder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: number;
}

export interface NotesDbTag {
  note_id: string;
  tag_id: string;
}

export interface NotesDbAttachment {
  id: string;
  note_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  thumbnail_path: string | null;
  created_at: number;
}

export interface NotesDbLink {
  id?: number;
  source_note_id: string;
  target_note_id: string;
  context_text: string;
  created_at: number;
}

export interface NotesDbWordSuggestion {
  id?: number;
  word: string;
  frequency: number;
  last_used: number;
}

export interface NoteListItem {
  id: string;
  title: string;
  plain_text: string;
  word_count: number;
  created_at: number;
  updated_at: number;
  pinned: boolean;
  pin_order: number;
  locked: boolean;
  color_label: string | null;
  folder_id: string | null;
  is_daily_note: boolean;
  is_template: boolean;
  tags: string[];
}

export interface NoteFull extends NoteListItem {
  content: string;
  attachments: NotesDbAttachment[];
  links: { noteId: string; title: string; contextText: string }[];
  backlinks: { noteId: string; title: string; contextText: string }[];
}

export interface FolderTreeItem extends NotesDbFolder {
  note_count: number;
  children: FolderTreeItem[];
}

export interface NoteSearchResult {
  id: string;
  title: string;
  snippet: string;
  rank: number;
  updated_at: number;
  folder_id: string | null;
  pinned: boolean;
}

export interface NoteExportOptions {
  format: 'plaintext' | 'markdown' | 'html' | 'json' | 'pdf' | 'rtf' | 'docx';
  includeAttachments: boolean;
  includeMetadata: boolean;
  filenameTemplate: string;
}

export interface NotePaneSize {
  left: number;
  center: number;
}

// ---------------------------------------------------------------------------
// NotesManager
// ---------------------------------------------------------------------------

export class NotesManager extends EventEmitter {
  private db: any = null;
  private dataPath: string;
  private attachmentsPath: string;
  private mainWindow: BrowserWindow | null = null;
  private logger: any;
  private initialized: boolean = false;
  private ipcRegistered: boolean = false;
  private initializationError: string | null = null;
  // JSON-file fallback when SQLite/better-sqlite3 is unavailable
  private jsonFallbackPath: string = '';
  private jsonStore: { notes: NotesDbNote[]; folders: NotesDbFolder[]; tags: NotesDbTag[]; paneSize: NotePaneSize; words: { word: string; frequency: number }[] } | null = null;

  constructor(logger?: any) {
    super();
    this.logger = logger || console;
    this.dataPath = path.join(app.getPath('userData'), 'notes-data');
    this.attachmentsPath = path.join(this.dataPath, 'attachments');
  }

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    this.mainWindow = mainWindow || null;

    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    if (!fs.existsSync(this.attachmentsPath)) {
      fs.mkdirSync(this.attachmentsPath, { recursive: true });
    }

    this.setupIPC();

    try {
      const Database = require('better-sqlite3');
      this.db = new Database(path.join(this.dataPath, 'dex-notes.db'));
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
      this.createTables();
      this.initializationError = null;
      this.initialized = true;
      this.log('NotesManager initialized');
    } catch (err) {
      this.initializationError = (err as Error).message;
      this.initialized = true;
      this.log('NotesManager SQLite unavailable, using JSON fallback: ' + this.initializationError);
      this.initJsonFallback();
    }
  }

  private log(msg: string): void {
    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info('[NotesManager] ' + msg);
    } else {
      log.info('[NotesManager] ' + msg);
    }
  }

  isReady(): boolean {
    return this.initialized && !!this.db;
  }

  exportAllNotes(): NoteFull[] {
    if (!this.db) return [];
    const rows = this.db.prepare('SELECT id FROM notes ORDER BY updated_at DESC').all() as Array<{ id: string }>;
    return rows
      .map(row => this.getNote(row.id))
      .filter((note): note is NoteFull => note !== null);
  }

  private unavailableMessage(): string {
    return this.initializationError
      ? `Notes database unavailable: ${this.initializationError}`
      : 'Notes database unavailable';
  }

  // -------------------------------------------------------------------------
  // JSON Fallback Storage (when better-sqlite3 is unavailable)
  // -------------------------------------------------------------------------

  private initJsonFallback(): void {
    this.jsonFallbackPath = path.join(this.dataPath, 'notes-fallback.json');
    try {
      if (fs.existsSync(this.jsonFallbackPath)) {
        const raw = fs.readFileSync(this.jsonFallbackPath, 'utf-8');
        this.jsonStore = JSON.parse(raw);
      }
    } catch { /* corrupt file — start fresh */ }
    if (!this.jsonStore) {
      this.jsonStore = { notes: [], folders: [], tags: [], paneSize: { left: 220, center: 320 }, words: [] };
    }
    this.saveJsonStore();
  }

  private saveJsonStore(): void {
    if (!this.jsonStore) return;
    try {
      fs.writeFileSync(this.jsonFallbackPath, JSON.stringify(this.jsonStore, null, 2), 'utf-8');
    } catch (e) { this.log('JSON fallback save error: ' + (e as Error).message); }
  }

  private jsonCreateNote(data: Partial<NotesDbNote> & { tags?: string[] }): NotesDbNote {
    const now = Date.now();
    const note: NotesDbNote = {
      id: data.id || crypto.randomUUID(),
      title: (data.title || '').slice(0, 1000),
      content: data.content || '',
      plain_text: data.plain_text || this.extractPlainText(data.content || ''),
      word_count: data.word_count ?? this.countWords(data.plain_text || ''),
      created_at: now, updated_at: now,
      pinned: data.pinned ? 1 : 0, pin_order: data.pin_order || 0,
      locked: data.locked ? 1 : 0, color_label: data.color_label || null,
      folder_id: data.folder_id || null,
      is_daily_note: data.is_daily_note ? 1 : 0, is_template: data.is_template ? 1 : 0,
      deleted: 0, deleted_at: null,
    };
    this.jsonStore!.notes.push(note);
    if (data.tags) {
      for (const t of data.tags) this.jsonStore!.tags.push({ note_id: note.id, tag_id: t });
    }
    this.saveJsonStore();
    return note;
  }

  private jsonGetNote(id: string): NoteFull | null {
    const note = this.jsonStore!.notes.find(n => n.id === id);
    if (!note) return null;
    const tags = this.jsonStore!.tags.filter(t => t.note_id === id).map(t => t.tag_id);
    return { ...note, pinned: note.pinned === 1, locked: note.locked === 1, is_daily_note: note.is_daily_note === 1, is_template: note.is_template === 1, tags, attachments: [], links: [], backlinks: [] } as any;
  }

  private jsonUpdateNote(id: string, data: Partial<NotesDbNote> & { tags?: string[] }): { success: boolean; note?: NotesDbNote } {
    const idx = this.jsonStore!.notes.findIndex(n => n.id === id);
    if (idx < 0) return { success: false };
    const note = this.jsonStore!.notes[idx];
    if (data.title !== undefined) note.title = data.title;
    if (data.content !== undefined) {
      note.content = data.content;
      note.plain_text = data.plain_text || this.extractPlainText(data.content);
      note.word_count = data.word_count ?? this.countWords(note.plain_text);
    }
    if (data.pinned !== undefined) note.pinned = data.pinned ? 1 : 0;
    if (data.pin_order !== undefined) note.pin_order = data.pin_order;
    if (data.locked !== undefined) note.locked = data.locked ? 1 : 0;
    if (data.color_label !== undefined) note.color_label = data.color_label;
    if (data.folder_id !== undefined) note.folder_id = data.folder_id;
    note.updated_at = Date.now();
    if (data.tags) {
      this.jsonStore!.tags = this.jsonStore!.tags.filter(t => t.note_id !== id);
      for (const t of data.tags) this.jsonStore!.tags.push({ note_id: id, tag_id: t });
    }
    this.jsonStore!.notes[idx] = note;
    this.saveJsonStore();
    return { success: true, note };
  }

  private jsonDeleteNote(id: string, permanent?: boolean): { success: boolean } {
    if (permanent) {
      this.jsonStore!.notes = this.jsonStore!.notes.filter(n => n.id !== id);
      this.jsonStore!.tags = this.jsonStore!.tags.filter(t => t.note_id !== id);
    } else {
      const note = this.jsonStore!.notes.find(n => n.id === id);
      if (note) { note.deleted = 1; note.deleted_at = Date.now(); }
    }
    this.saveJsonStore();
    return { success: true };
  }

  private jsonListNotes(opts?: any): NoteListItem[] {
    let notes = this.jsonStore!.notes.filter(n => !n.deleted);
    if (opts?.deleted) notes = this.jsonStore!.notes.filter(n => n.deleted === 1);
    if (opts?.folder_id) notes = notes.filter(n => n.folder_id === opts.folder_id);
    if (opts?.is_template) notes = notes.filter(n => n.is_template === 1);
    if (opts?.is_daily_note) notes = notes.filter(n => n.is_daily_note === 1);
    notes.sort((a, b) => b.updated_at - a.updated_at);
    const pinned = notes.filter(n => n.pinned === 1).sort((a, b) => (a.pin_order || 0) - (b.pin_order || 0));
    const unpinned = notes.filter(n => n.pinned !== 1);
    const sorted = [...pinned, ...unpinned];
    const offset = opts?.offset || 0;
    const limit = opts?.limit || 200;
    return sorted.slice(offset, offset + limit).map(n => ({
      ...n,
      pinned: !!n.pinned,
      locked: !!n.locked,
      is_daily_note: !!n.is_daily_note,
      is_template: !!n.is_template,
      tags: this.jsonStore!.tags.filter(t => t.note_id === n.id).map(t => t.tag_id),
    }));
  }

  private jsonRestoreNote(id: string): { success: boolean } {
    const note = this.jsonStore!.notes.find(n => n.id === id);
    if (note) { note.deleted = 0; note.deleted_at = null; this.saveJsonStore(); }
    return { success: !!note };
  }

  private jsonDuplicateNote(id: string): NotesDbNote | null {
    const src = this.jsonStore!.notes.find(n => n.id === id);
    if (!src) return null;
    return this.jsonCreateNote({ ...src, id: crypto.randomUUID(), title: src.title + ' (Copy)' });
  }

  private jsonSearchNotes(query: string): NoteListItem[] {
    if (!query) return [];
    const q = query.toLowerCase();
    return this.jsonStore!.notes
      .filter(n => !n.deleted && (n.title.toLowerCase().includes(q) || n.plain_text.toLowerCase().includes(q)))
      .map(n => ({ ...n, pinned: !!n.pinned, locked: !!n.locked, is_daily_note: !!n.is_daily_note, is_template: !!n.is_template, tags: this.jsonStore!.tags.filter(t => t.note_id === n.id).map(t => t.tag_id) }));
  }

  private jsonCreateFolder(data: Partial<NotesDbFolder>): NotesDbFolder {
    const folder: NotesDbFolder = {
      id: crypto.randomUUID(), name: data.name || 'New Folder',
      parent_id: data.parent_id || null, color: data.color || null,
      icon: data.icon || null, sort_order: data.sort_order || 0,
      created_at: Date.now(),
    };
    this.jsonStore!.folders.push(folder);
    this.saveJsonStore();
    return folder;
  }

  private jsonGetStats() {
    const notes = this.jsonStore!.notes;
    return {
      totalNotes: notes.filter(n => !n.deleted).length,
      totalFolders: this.jsonStore!.folders.length,
      totalAttachments: 0,
      totalWords: notes.filter(n => !n.deleted).reduce((s, n) => s + n.word_count, 0),
      totalTags: new Set(this.jsonStore!.tags.map(t => t.tag_id)).size,
      trashCount: notes.filter(n => n.deleted === 1).length,
      pinnedCount: notes.filter(n => n.pinned === 1 && !n.deleted).length,
      lockedCount: notes.filter(n => n.locked === 1 && !n.deleted).length,
      templateCount: notes.filter(n => n.is_template === 1).length,
    };
  }

  // -------------------------------------------------------------------------
  // Database Schema
  // -------------------------------------------------------------------------

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        plain_text TEXT NOT NULL DEFAULT '',
        word_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER DEFAULT 0,
        pin_order INTEGER DEFAULT 0,
        locked INTEGER DEFAULT 0,
        color_label TEXT,
        folder_id TEXT,
        is_daily_note INTEGER DEFAULT 0,
        is_template INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0,
        deleted_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        color TEXT,
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note_tags (
        note_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (note_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS note_attachments (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL DEFAULT 'file',
        file_size INTEGER DEFAULT 0,
        thumbnail_path TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_note_id TEXT NOT NULL,
        target_note_id TEXT NOT NULL,
        context_text TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS word_suggestions_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL UNIQUE,
        frequency INTEGER DEFAULT 1,
        last_used INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note_pane_sizes (
        key TEXT PRIMARY KEY,
        left_width INTEGER DEFAULT 220,
        center_width INTEGER DEFAULT 320
      );

      CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
      CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
      CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at);
      CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted);
      CREATE INDEX IF NOT EXISTS idx_notes_daily ON notes(is_daily_note);
      CREATE INDEX IF NOT EXISTS idx_notes_template ON notes(is_template);
      CREATE INDEX IF NOT EXISTS idx_notes_locked ON notes(locked);
      CREATE INDEX IF NOT EXISTS idx_notes_color ON notes(color_label);
      CREATE INDEX IF NOT EXISTS idx_tags_note ON note_tags(note_id);
      CREATE INDEX IF NOT EXISTS idx_tags_tag ON note_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_note ON note_attachments(note_id);
      CREATE INDEX IF NOT EXISTS idx_links_source ON note_links(source_note_id);
      CREATE INDEX IF NOT EXISTS idx_links_target ON note_links(target_note_id);
      CREATE INDEX IF NOT EXISTS idx_words_word ON word_suggestions_history(word);
      CREATE INDEX IF NOT EXISTS idx_words_freq ON word_suggestions_history(frequency DESC);
    `);

    // FTS5 virtual table for full text search
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
          title, plain_text, content='notes', content_rowid='rowid',
          tokenize='porter unicode61'
        );
      `);
    } catch (_e) {
      // FTS5 may already exist
    }

    // Triggers to keep FTS5 in sync
    try {
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
          INSERT INTO notes_fts(rowid, title, plain_text)
          VALUES (new.rowid, new.title, new.plain_text);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, title, plain_text)
          VALUES ('delete', old.rowid, old.title, old.plain_text);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, title, plain_text)
          VALUES ('delete', old.rowid, old.title, old.plain_text);
          INSERT INTO notes_fts(rowid, title, plain_text)
          VALUES (new.rowid, new.title, new.plain_text);
        END;
      `);
    } catch (_e) {
      // Triggers may already exist
    }

    // Ensure pane sizes row exists
    const existing = this.db.prepare('SELECT key FROM note_pane_sizes WHERE key = ?').get('default');
    if (!existing) {
      this.db.prepare('INSERT INTO note_pane_sizes (key, left_width, center_width) VALUES (?, ?, ?)').run('default', 220, 320);
    }
  }

  // -------------------------------------------------------------------------
  // IPC Handlers
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    if (this.ipcRegistered) return;
    this.ipcRegistered = true;

    const handle = <TArgs extends any[], TResult>(
      channel: string,
      action: (...args: TArgs) => TResult | Promise<TResult>,
      fallback: TResult,
      jsonAction?: (...args: TArgs) => TResult,
    ) => {
      ipcMain.handle(channel, async (_e, ...args: TArgs): Promise<TResult> => {
        if (!this.db) {
          if (jsonAction && this.jsonStore) return jsonAction(...args);
          this.log(this.unavailableMessage());
          return fallback;
        }
        return await action(...args);
      });
    };

    // === Note CRUD ===
    handle('dexnotes:create', (data: Partial<NotesDbNote> & { tags?: string[] }) => this.createNote(data), null as NotesDbNote | null,
      (data: any) => this.jsonCreateNote(data));

    handle('dexnotes:get', (id: string) => this.getNote(id), null as NoteFull | null,
      (id: string) => this.jsonGetNote(id));

    handle('dexnotes:update', (id: string, data: Partial<NotesDbNote> & { tags?: string[] }) => this.updateNote(id, data), { success: false } as { success: boolean; note?: NotesDbNote },
      (id: string, data: any) => this.jsonUpdateNote(id, data));

    handle('dexnotes:delete', (id: string, permanent?: boolean) => this.deleteNote(id, permanent), { success: false },
      (id: string, permanent?: boolean) => this.jsonDeleteNote(id, permanent));

    handle('dexnotes:list', (opts?: {
      folder_id?: string | null;
      deleted?: boolean;
      pinned?: boolean;
      locked?: boolean;
      is_daily_note?: boolean;
      is_template?: boolean;
      sort_by?: string;
      sort_order?: string;
      limit?: number;
      offset?: number;
    }) => this.listNotes(opts), [] as NoteListItem[],
      (opts?: any) => this.jsonListNotes(opts));

    handle('dexnotes:restore', (id: string) => this.restoreNote(id), { success: false },
      (id: string) => this.jsonRestoreNote(id));

    handle('dexnotes:duplicate', (id: string) => this.duplicateNote(id), null as NotesDbNote | null,
      (id: string) => this.jsonDuplicateNote(id));

    handle('dexnotes:pin', (id: string, pinned: boolean) => this.pinNote(id, pinned), { success: false },
      (id: string, pinned: boolean) => {
        const note = this.jsonStore!.notes.find(n => n.id === id);
        if (note) { note.pinned = pinned ? 1 : 0; this.saveJsonStore(); }
        return { success: !!note };
      });

    handle('dexnotes:lock', (id: string, locked: boolean) => this.lockNote(id, locked), { success: false },
      (id: string, locked: boolean) => {
        const note = this.jsonStore!.notes.find(n => n.id === id);
        if (note) { note.locked = locked ? 1 : 0; this.saveJsonStore(); }
        return { success: !!note };
      });

    handle('dexnotes:setColor', (id: string, color: string | null) => this.setNoteColor(id, color), { success: false },
      (id: string, color: string | null) => {
        const note = this.jsonStore!.notes.find(n => n.id === id);
        if (note) { note.color_label = color; this.saveJsonStore(); }
        return { success: !!note };
      });

    handle('dexnotes:moveToFolder', (id: string, folderId: string | null) => this.moveToFolder(id, folderId), { success: false },
      (id: string, folderId: string | null) => {
        const note = this.jsonStore!.notes.find(n => n.id === id);
        if (note) { note.folder_id = folderId; this.saveJsonStore(); }
        return { success: !!note };
      });

    handle('dexnotes:emptyTrash', () => this.emptyTrash(), { success: false, count: 0 },
      () => {
        const count = this.jsonStore!.notes.filter(n => n.deleted === 1).length;
        this.jsonStore!.notes = this.jsonStore!.notes.filter(n => n.deleted !== 1);
        this.saveJsonStore();
        return { success: true, count };
      });

    // === Tags ===
    handle('dexnotes:setTags', (noteId: string, tags: string[]) => this.setTags(noteId, tags), { success: false },
      (noteId: string, tags: string[]) => {
        this.jsonStore!.tags = this.jsonStore!.tags.filter(t => t.note_id !== noteId);
        for (const t of tags) this.jsonStore!.tags.push({ note_id: noteId, tag_id: t });
        this.saveJsonStore();
        return { success: true };
      });

    handle('dexnotes:getAllTags', () => this.getAllTags(), [] as { tag: string; count: number }[],
      () => {
        const counts = new Map<string, number>();
        for (const t of this.jsonStore!.tags) counts.set(t.tag_id, (counts.get(t.tag_id) || 0) + 1);
        return Array.from(counts.entries()).map(([tag, count]) => ({ tag, count }));
      });

    // === Folders ===
    handle('dexnotes:createFolder', (data: Partial<NotesDbFolder>) => this.createFolder(data), null as NotesDbFolder | null,
      (data: any) => this.jsonCreateFolder(data));

    handle('dexnotes:listFolders', () => this.listFolders(), [] as FolderTreeItem[],
      () => this.jsonStore!.folders.map(f => ({ ...f, children: [] })) as any);

    handle('dexnotes:updateFolder', (id: string, data: Partial<NotesDbFolder>) => this.updateFolder(id, data), { success: false },
      (id: string, data: Partial<NotesDbFolder>) => {
        const f = this.jsonStore!.folders.find(f => f.id === id);
        if (f && data.name) { f.name = data.name; this.saveJsonStore(); }
        return { success: !!f };
      });

    handle('dexnotes:deleteFolder', (id: string) => this.deleteFolder(id), { success: false },
      (id: string) => {
        this.jsonStore!.folders = this.jsonStore!.folders.filter(f => f.id !== id);
        this.jsonStore!.notes.forEach(n => { if (n.folder_id === id) n.folder_id = null; });
        this.saveJsonStore();
        return { success: true };
      });

    // === Attachments ===
    handle('dexnotes:addAttachment', (noteId: string, filePath: string) => this.addAttachment(noteId, filePath), null as NotesDbAttachment | null);

    handle('dexnotes:removeAttachment', (attachmentId: string) => this.removeAttachment(attachmentId), { success: false });

    handle('dexnotes:getAttachments', (noteId: string) => this.getAttachments(noteId), [] as NotesDbAttachment[]);

    handle('dexnotes:openAttachment', (attachmentId: string) => this.openAttachment(attachmentId), { success: false });

    // === Links ===
    handle('dexnotes:addLink', (sourceId: string, targetId: string, context: string) => this.addLink(sourceId, targetId, context), { success: false, id: undefined as number | undefined });

    handle('dexnotes:removeLink', (linkId: number) => this.removeLink(linkId), { success: false });

    handle('dexnotes:getLinks', (noteId: string) => this.getLinks(noteId), [] as { id: number; noteId: string; title: string; contextText: string }[]);

    handle('dexnotes:getBacklinks', (noteId: string) => this.getBacklinks(noteId), [] as { id: number; noteId: string; title: string; contextText: string }[]);

    // === Search ===
    handle('dexnotes:search', (query: string, opts?: { limit?: number }) => this.searchNotes(query, opts?.limit), [] as NoteSearchResult[],
      (query: string) => this.jsonSearchNotes(query) as any);

    handle('dexnotes:advancedSearch', (query: string) => this.advancedSearch(query), [] as NoteSearchResult[],
      (query: string) => this.jsonSearchNotes(query) as any);

    // === Word Suggestions ===
    handle('dexnotes:recordWords', (words: string[]) => this.recordWords(words), { success: false },
      (words: string[]) => {
        for (const w of words) {
          const existing = this.jsonStore!.words.find(x => x.word === w);
          if (existing) existing.frequency++;
          else this.jsonStore!.words.push({ word: w, frequency: 1 });
        }
        this.saveJsonStore();
        return { success: true };
      });

    handle('dexnotes:getSuggestions', (prefix: string, limit?: number) => this.getWordSuggestions(prefix, limit), [] as string[],
      (prefix: string, limit?: number) => {
        const p = prefix.toLowerCase();
        return this.jsonStore!.words
          .filter(w => w.word.toLowerCase().startsWith(p))
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, limit || 10)
          .map(w => w.word);
      });

    handle('dexnotes:getBigrams', (lastWord: string, limit?: number) => this.getBigramSuggestions(lastWord, limit), [] as string[]);

    handle('dexnotes:addCustomWord', (word: string) => this.addCustomWord(word), { success: false },
      (word: string) => {
        if (!this.jsonStore!.words.find(w => w.word === word)) {
          this.jsonStore!.words.push({ word, frequency: 1 });
          this.saveJsonStore();
        }
        return { success: true };
      });

    // === Templates ===
    handle('dexnotes:listTemplates', () => this.listTemplates(), [] as NoteListItem[],
      () => this.jsonListNotes({ is_template: true }));

    handle('dexnotes:createFromTemplate', (templateId: string) => this.createFromTemplate(templateId), null as NotesDbNote | null,
      (templateId: string) => {
        const tmpl = this.jsonStore!.notes.find(n => n.id === templateId);
        if (!tmpl) return null;
        return this.jsonCreateNote({ ...tmpl, id: crypto.randomUUID(), is_template: 0, title: tmpl.title.replace(' (Template)', '') });
      });

    handle('dexnotes:saveAsTemplate', (noteId: string) => this.saveAsTemplate(noteId), { success: false },
      (noteId: string) => {
        const note = this.jsonStore!.notes.find(n => n.id === noteId);
        if (note) { note.is_template = 1; this.saveJsonStore(); }
        return { success: !!note };
      });

    // === Export / Import ===
    handle('dexnotes:export', (noteId: string, opts: NoteExportOptions) => this.exportNote(noteId, opts), { success: false, filePath: undefined as string | undefined });

    handle('dexnotes:import', (filePaths: string[]) => this.importNotes(filePaths), { imported: 0, errors: [this.unavailableMessage()] });

    // === Stats ===
    handle('dexnotes:stats', () => this.getStats(), {
      totalNotes: 0, totalFolders: 0, totalAttachments: 0, totalWords: 0,
      totalTags: 0, trashCount: 0, pinnedCount: 0, lockedCount: 0, templateCount: 0,
    }, () => this.jsonGetStats());

    // === Pane sizes ===
    handle('dexnotes:getPaneSizes', () => this.getPaneSizes(), { left: 220, center: 320 },
      () => this.jsonStore!.paneSize);

    handle('dexnotes:setPaneSizes', (left: number, center: number) => this.setPaneSizes(left, center), { success: false },
      (left: number, center: number) => {
        this.jsonStore!.paneSize = { left, center };
        this.saveJsonStore();
        return { success: true };
      });

    // === Daily note ===
    handle('dexnotes:getDailyNote', () => this.getOrCreateDailyNote(), null as NotesDbNote | null,
      () => {
        const today = new Date().toISOString().slice(0, 10);
        const title = `Daily Note – ${today}`;
        const existing = this.jsonStore!.notes.find(n => n.is_daily_note === 1 && n.title === title);
        if (existing) return existing;
        return this.jsonCreateNote({ title, is_daily_note: 1 as any });
      });
  }

  // -------------------------------------------------------------------------
  // Note CRUD
  // -------------------------------------------------------------------------

  createNote(data: Partial<NotesDbNote> & { tags?: string[] }): NotesDbNote {
    const now = Date.now();
    const id = data.id || crypto.randomUUID();
    const title = (data.title || '').slice(0, 1000);
    const content = data.content || '';
    const plainText = data.plain_text || this.extractPlainText(content);
    const wordCount = data.word_count ?? this.countWords(plainText);

    this.db.prepare(`
      INSERT INTO notes (id, title, content, plain_text, word_count, created_at, updated_at,
        pinned, pin_order, locked, color_label, folder_id, is_daily_note, is_template, deleted, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
    `).run(
      id, title, content, plainText, wordCount, now, now,
      data.pinned ? 1 : 0, data.pin_order || 0, data.locked ? 1 : 0,
      data.color_label || null, data.folder_id || null,
      data.is_daily_note ? 1 : 0, data.is_template ? 1 : 0
    );

    if (data.tags && data.tags.length > 0) {
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)');
      const batch = this.db.transaction((tags: string[]) => {
        for (const tag of tags) {
          insertTag.run(id, tag);
        }
      });
      batch(data.tags);
    }

    const note = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NotesDbNote;
    this.emit('note:created', note);
    return note;
  }

  getNote(id: string): NoteFull | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NotesDbNote | undefined;
    if (!row) return null;

    const tags = this.db.prepare('SELECT tag_id FROM note_tags WHERE note_id = ?').all(id)
      .map((r: any) => r.tag_id);
    const attachments = this.db.prepare('SELECT * FROM note_attachments WHERE note_id = ?').all(id) as NotesDbAttachment[];
    const links = this.db.prepare(`
      SELECT nl.*, n.title FROM note_links nl
      JOIN notes n ON n.id = nl.target_note_id
      WHERE nl.source_note_id = ?
    `).all(id).map((r: any) => ({ noteId: r.target_note_id, title: r.title, contextText: r.context_text }));
    const backlinks = this.db.prepare(`
      SELECT nl.*, n.title FROM note_links nl
      JOIN notes n ON n.id = nl.source_note_id
      WHERE nl.target_note_id = ?
    `).all(id).map((r: any) => ({ noteId: r.source_note_id, title: r.title, contextText: r.context_text }));

    return {
      ...row,
      pinned: row.pinned === 1,
      locked: row.locked === 1,
      is_daily_note: row.is_daily_note === 1,
      is_template: row.is_template === 1,
      tags,
      attachments,
      links,
      backlinks,
    };
  }

  updateNote(id: string, data: Partial<NotesDbNote> & { tags?: string[] }): { success: boolean; note?: NotesDbNote } {
    const existing = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NotesDbNote | undefined;
    if (!existing) return { success: false };

    const now = Date.now();
    const updates: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title.slice(0, 1000));
    }
    if (data.content !== undefined) {
      updates.push('content = ?');
      values.push(data.content);
      const plainText = data.plain_text || this.extractPlainText(data.content);
      updates.push('plain_text = ?');
      values.push(plainText);
      updates.push('word_count = ?');
      values.push(data.word_count ?? this.countWords(plainText));
    }
    if (data.color_label !== undefined) {
      updates.push('color_label = ?');
      values.push(data.color_label);
    }
    if (data.folder_id !== undefined) {
      updates.push('folder_id = ?');
      values.push(data.folder_id);
    }
    if (data.locked !== undefined) {
      updates.push('locked = ?');
      values.push(data.locked ? 1 : 0);
    }
    if (data.pinned !== undefined) {
      updates.push('pinned = ?');
      values.push(data.pinned ? 1 : 0);
    }
    if (data.pin_order !== undefined) {
      updates.push('pin_order = ?');
      values.push(data.pin_order);
    }

    if (updates.length === 0) return { success: true, note: existing };

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    this.db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    if (data.tags !== undefined) {
      this.setTags(id, data.tags);
    }

    const note = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NotesDbNote;
    this.emit('note:updated', note);
    return { success: true, note };
  }

  deleteNote(id: string, permanent?: boolean): { success: boolean } {
    const existing = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NotesDbNote | undefined;
    if (!existing) return { success: false };

    if (permanent || existing.deleted === 1) {
      // Permanently delete
      const attachments = this.db.prepare('SELECT * FROM note_attachments WHERE note_id = ?').all(id) as NotesDbAttachment[];
      for (const att of attachments) {
        try { fs.unlinkSync(att.file_path); } catch (_e) { /* ignore */ }
      }
      this.db.prepare('DELETE FROM note_attachments WHERE note_id = ?').run(id);
      this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id);
      this.db.prepare('DELETE FROM note_links WHERE source_note_id = ? OR target_note_id = ?').run(id, id);
      this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
      this.emit('note:deleted', id);
    } else {
      // Move to trash
      const now = Date.now();
      this.db.prepare('UPDATE notes SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
      this.emit('note:trashed', id);
    }
    return { success: true };
  }

  restoreNote(id: string): { success: boolean } {
    const now = Date.now();
    this.db.prepare('UPDATE notes SET deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
    this.emit('note:restored', id);
    return { success: true };
  }

  duplicateNote(id: string): NotesDbNote | null {
    const original = this.getNote(id);
    if (!original) return null;

    return this.createNote({
      title: original.title + ' (copy)',
      content: original.content,
      plain_text: original.plain_text,
      folder_id: original.folder_id,
      color_label: original.color_label,
      tags: original.tags,
    });
  }

  pinNote(id: string, pinned: boolean): { success: boolean } {
    if (pinned) {
      // Enforce 20 pin limit
      const pinnedCount = this.db.prepare('SELECT COUNT(*) as cnt FROM notes WHERE pinned = 1 AND deleted = 0').get() as { cnt: number };
      if (pinnedCount.cnt >= 20) return { success: false };

      const maxOrder = this.db.prepare('SELECT MAX(pin_order) as m FROM notes WHERE pinned = 1').get() as { m: number | null };
      const newOrder = (maxOrder.m || 0) + 1;
      this.db.prepare('UPDATE notes SET pinned = 1, pin_order = ?, updated_at = ? WHERE id = ?').run(newOrder, Date.now(), id);
    } else {
      this.db.prepare('UPDATE notes SET pinned = 0, pin_order = 0, updated_at = ? WHERE id = ?').run(Date.now(), id);
    }
    return { success: true };
  }

  lockNote(id: string, locked: boolean): { success: boolean } {
    this.db.prepare('UPDATE notes SET locked = ?, updated_at = ? WHERE id = ?').run(locked ? 1 : 0, Date.now(), id);
    return { success: true };
  }

  setNoteColor(id: string, color: string | null): { success: boolean } {
    this.db.prepare('UPDATE notes SET color_label = ?, updated_at = ? WHERE id = ?').run(color, Date.now(), id);
    return { success: true };
  }

  moveToFolder(id: string, folderId: string | null): { success: boolean } {
    this.db.prepare('UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ?').run(folderId, Date.now(), id);
    this.emit('note:moved', { noteId: id, folderId });
    return { success: true };
  }

  listNotes(opts?: {
    folder_id?: string | null;
    deleted?: boolean;
    pinned?: boolean;
    locked?: boolean;
    is_daily_note?: boolean;
    is_template?: boolean;
    sort_by?: string;
    sort_order?: string;
    limit?: number;
    offset?: number;
  }): NoteListItem[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (opts?.deleted) {
      conditions.push('n.deleted = 1');
    } else {
      conditions.push('n.deleted = 0');
    }

    if (opts?.folder_id !== undefined) {
      if (opts.folder_id === null) {
        conditions.push('n.folder_id IS NULL');
      } else {
        conditions.push('n.folder_id = ?');
        params.push(opts.folder_id);
      }
    }
    if (opts?.pinned !== undefined) {
      conditions.push('n.pinned = ?');
      params.push(opts.pinned ? 1 : 0);
    }
    if (opts?.locked !== undefined) {
      conditions.push('n.locked = ?');
      params.push(opts.locked ? 1 : 0);
    }
    if (opts?.is_daily_note !== undefined) {
      conditions.push('n.is_daily_note = ?');
      params.push(opts.is_daily_note ? 1 : 0);
    }
    if (opts?.is_template !== undefined) {
      conditions.push('n.is_template = ?');
      params.push(opts.is_template ? 1 : 0);
    }

    const sortCol = opts?.sort_by || 'updated_at';
    const allowedSorts = ['updated_at', 'created_at', 'title', 'word_count', 'pin_order'];
    const safeSortCol = allowedSorts.includes(sortCol) ? sortCol : 'updated_at';
    const sortOrder = opts?.sort_order === 'asc' ? 'ASC' : 'DESC';

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = opts?.limit ? Math.min(opts.limit, 1000) : 200;
    const offset = opts?.offset || 0;

    const sql = `
      SELECT n.* FROM notes n
      ${where}
      ORDER BY n.pinned DESC, n.pin_order DESC, n.${safeSortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);
    const rows = this.db.prepare(sql).all(...params) as NotesDbNote[];

    // Batch load tags
    const noteIds = rows.map(r => r.id);
    const tagMap = new Map<string, string[]>();
    if (noteIds.length > 0) {
      const placeholders = noteIds.map(() => '?').join(',');
      const tagRows = this.db.prepare(`SELECT note_id, tag_id FROM note_tags WHERE note_id IN (${placeholders})`).all(...noteIds) as NotesDbTag[];
      for (const tr of tagRows) {
        if (!tagMap.has(tr.note_id)) tagMap.set(tr.note_id, []);
        tagMap.get(tr.note_id)!.push(tr.tag_id);
      }
    }

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      plain_text: row.plain_text,
      word_count: row.word_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      pinned: row.pinned === 1,
      pin_order: row.pin_order,
      locked: row.locked === 1,
      color_label: row.color_label,
      folder_id: row.folder_id,
      is_daily_note: row.is_daily_note === 1,
      is_template: row.is_template === 1,
      tags: tagMap.get(row.id) || [],
    }));
  }

  emptyTrash(): { success: boolean; count: number } {
    const trashed = this.db.prepare('SELECT id FROM notes WHERE deleted = 1').all() as { id: string }[];
    for (const row of trashed) {
      this.deleteNote(row.id, true);
    }
    return { success: true, count: trashed.length };
  }

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------

  setTags(noteId: string, tags: string[]): { success: boolean } {
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
    const stmt = this.db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)');
    const batch = this.db.transaction((ts: string[]) => {
      for (const tag of ts) {
        stmt.run(noteId, tag.trim().toLowerCase());
      }
    });
    batch(tags);
    return { success: true };
  }

  getAllTags(): { tag: string; count: number }[] {
    return this.db.prepare(`
      SELECT tag_id as tag, COUNT(*) as count FROM note_tags
      GROUP BY tag_id ORDER BY count DESC
    `).all() as { tag: string; count: number }[];
  }

  // -------------------------------------------------------------------------
  // Folders
  // -------------------------------------------------------------------------

  createFolder(data: Partial<NotesDbFolder>): NotesDbFolder {
    const id = data.id || crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO folders (id, name, parent_id, color, icon, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name || 'New Folder', data.parent_id || null, data.color || null, data.icon || null, data.sort_order || 0, now);

    const folder = this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as NotesDbFolder;
    this.emit('folder:created', folder);
    return folder;
  }

  listFolders(): FolderTreeItem[] {
    const folders = this.db.prepare('SELECT * FROM folders ORDER BY sort_order ASC, name ASC').all() as NotesDbFolder[];
    const counts = this.db.prepare(`
      SELECT folder_id, COUNT(*) as cnt FROM notes
      WHERE deleted = 0 AND folder_id IS NOT NULL
      GROUP BY folder_id
    `).all() as { folder_id: string; cnt: number }[];

    const countMap = new Map<string, number>();
    for (const c of counts) {
      countMap.set(c.folder_id, c.cnt);
    }

    const buildTree = (parentId: string | null): FolderTreeItem[] => {
      return folders
        .filter(f => f.parent_id === parentId)
        .map(f => ({
          ...f,
          note_count: countMap.get(f.id) || 0,
          children: buildTree(f.id),
        }));
    };

    return buildTree(null);
  }

  updateFolder(id: string, data: Partial<NotesDbFolder>): { success: boolean } {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.parent_id !== undefined) { updates.push('parent_id = ?'); values.push(data.parent_id); }
    if (data.color !== undefined) { updates.push('color = ?'); values.push(data.color); }
    if (data.icon !== undefined) { updates.push('icon = ?'); values.push(data.icon); }
    if (data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(data.sort_order); }

    if (updates.length === 0) return { success: true };

    values.push(id);
    this.db.prepare(`UPDATE folders SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  }

  deleteFolder(id: string): { success: boolean } {
    // Move notes out of folder first
    this.db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(id);
    // Move child folders to root
    this.db.prepare('UPDATE folders SET parent_id = NULL WHERE parent_id = ?').run(id);
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    this.emit('folder:deleted', id);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------

  addAttachment(noteId: string, sourcePath: string): NotesDbAttachment | null {
    if (!fs.existsSync(sourcePath)) return null;

    const stats = fs.statSync(sourcePath);
    if (stats.size > 50 * 1024 * 1024) return null; // 50MB limit

    const ext = path.extname(sourcePath).toLowerCase();
    const fileName = path.basename(sourcePath);
    const attId = crypto.randomUUID();
    const destPath = path.join(this.attachmentsPath, attId + ext);

    fs.copyFileSync(sourcePath, destPath);

    const fileType = this.detectFileType(ext);
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO note_attachments (id, note_id, file_path, file_name, file_type, file_size, thumbnail_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(attId, noteId, destPath, fileName, fileType, stats.size, now);

    this.db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(now, noteId);

    return this.db.prepare('SELECT * FROM note_attachments WHERE id = ?').get(attId) as NotesDbAttachment;
  }

  removeAttachment(attachmentId: string): { success: boolean } {
    const att = this.db.prepare('SELECT * FROM note_attachments WHERE id = ?').get(attachmentId) as NotesDbAttachment | undefined;
    if (!att) return { success: false };

    try { fs.unlinkSync(att.file_path); } catch (_e) { /* ignore - file may already be gone */ }
    this.db.prepare('DELETE FROM note_attachments WHERE id = ?').run(attachmentId);
    this.db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(Date.now(), att.note_id);
    return { success: true };
  }

  getAttachments(noteId: string): NotesDbAttachment[] {
    return this.db.prepare('SELECT * FROM note_attachments WHERE note_id = ? ORDER BY created_at ASC').all(noteId) as NotesDbAttachment[];
  }

  openAttachment(attachmentId: string): { success: boolean } {
    const att = this.db.prepare('SELECT * FROM note_attachments WHERE id = ?').get(attachmentId) as NotesDbAttachment | undefined;
    if (!att || !fs.existsSync(att.file_path)) return { success: false };
    shell.openPath(att.file_path);
    return { success: true };
  }

  private detectFileType(ext: string): string {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
    const pdfExts = ['.pdf'];
    const docExts = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (pdfExts.includes(ext)) return 'pdf';
    if (docExts.includes(ext)) return 'document';
    return 'file';
  }

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------

  addLink(sourceId: string, targetId: string, context: string): { success: boolean; id?: number } {
    const now = Date.now();
    const result = this.db.prepare(`
      INSERT INTO note_links (source_note_id, target_note_id, context_text, created_at)
      VALUES (?, ?, ?, ?)
    `).run(sourceId, targetId, context, now);
    return { success: true, id: result.lastInsertRowid as number };
  }

  removeLink(linkId: number): { success: boolean } {
    this.db.prepare('DELETE FROM note_links WHERE id = ?').run(linkId);
    return { success: true };
  }

  getLinks(noteId: string): { id: number; noteId: string; title: string; contextText: string }[] {
    return this.db.prepare(`
      SELECT nl.id, nl.target_note_id as noteId, n.title, nl.context_text as contextText
      FROM note_links nl
      JOIN notes n ON n.id = nl.target_note_id
      WHERE nl.source_note_id = ?
    `).all(noteId) as any[];
  }

  getBacklinks(noteId: string): { id: number; noteId: string; title: string; contextText: string }[] {
    return this.db.prepare(`
      SELECT nl.id, nl.source_note_id as noteId, n.title, nl.context_text as contextText
      FROM note_links nl
      JOIN notes n ON n.id = nl.source_note_id
      WHERE nl.target_note_id = ?
    `).all(noteId) as any[];
  }

  // -------------------------------------------------------------------------
  // Search (FTS5)
  // -------------------------------------------------------------------------

  searchNotes(query: string, limit?: number): NoteSearchResult[] {
    if (!query || query.trim().length === 0) return [];
    const safeLimit = Math.min(limit || 50, 200);

    // Sanitize FTS5 query - escape special characters
    const sanitized = query.replace(/['"*()]/g, '').trim();
    if (sanitized.length === 0) return [];

    try {
      const results = this.db.prepare(`
        SELECT n.id, n.title, n.folder_id, n.pinned, n.updated_at,
          snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
          rank
        FROM notes_fts f
        JOIN notes n ON n.rowid = f.rowid
        WHERE notes_fts MATCH ? AND n.deleted = 0
        ORDER BY rank
        LIMIT ?
      `).all(sanitized + '*', safeLimit);

      return results.map((r: any) => ({
        id: r.id,
        title: r.title,
        snippet: r.snippet || '',
        rank: r.rank,
        updated_at: r.updated_at,
        folder_id: r.folder_id,
        pinned: r.pinned === 1,
      }));
    } catch (_e) {
      // Fallback to LIKE search if FTS fails
      return this.db.prepare(`
        SELECT id, title, folder_id, pinned, updated_at, '' as snippet, 0 as rank
        FROM notes
        WHERE deleted = 0 AND (title LIKE ? OR plain_text LIKE ?)
        ORDER BY updated_at DESC
        LIMIT ?
      `).all('%' + sanitized + '%', '%' + sanitized + '%', safeLimit).map((r: any) => ({
        id: r.id,
        title: r.title,
        snippet: '',
        rank: 0,
        updated_at: r.updated_at,
        folder_id: r.folder_id,
        pinned: r.pinned === 1,
      }));
    }
  }

  advancedSearch(query: string): NoteSearchResult[] {
    // Parse advanced operators:
    // title:xxx, tag:xxx, folder:xxx, before:xxx, after:xxx,
    // has:attachment, has:checklist, has:table, has:code, is:pinned, is:locked
    const conditions: string[] = ['n.deleted = 0'];
    const params: any[] = [];
    let ftsQuery = '';

    const tokens = query.match(/\S+/g) || [];
    const plainTerms: string[] = [];

    for (const token of tokens) {
      const colonIdx = token.indexOf(':');
      if (colonIdx > 0) {
        const op = token.slice(0, colonIdx).toLowerCase();
        const val = token.slice(colonIdx + 1);

        switch (op) {
          case 'title':
            conditions.push('n.title LIKE ?');
            params.push('%' + val + '%');
            break;
          case 'tag':
            conditions.push('EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?)');
            params.push(val.toLowerCase());
            break;
          case 'folder':
            conditions.push('EXISTS (SELECT 1 FROM folders f WHERE f.id = n.folder_id AND f.name LIKE ?)');
            params.push('%' + val + '%');
            break;
          case 'before':
            try {
              const d = new Date(val).getTime();
              if (!isNaN(d)) { conditions.push('n.created_at < ?'); params.push(d); }
            } catch (_e) { /* ignore invalid date */ }
            break;
          case 'after':
            try {
              const d = new Date(val).getTime();
              if (!isNaN(d)) { conditions.push('n.created_at > ?'); params.push(d); }
            } catch (_e) { /* ignore invalid date */ }
            break;
          case 'has':
            if (val === 'attachment') {
              conditions.push('EXISTS (SELECT 1 FROM note_attachments na WHERE na.note_id = n.id)');
            } else if (val === 'checklist') {
              conditions.push("n.plain_text LIKE '%[ ]%'");
            } else if (val === 'table') {
              conditions.push("n.content LIKE '%\"table\"%'");
            } else if (val === 'code') {
              conditions.push("n.content LIKE '%\"codeblock\"%'");
            }
            break;
          case 'is':
            if (val === 'pinned') { conditions.push('n.pinned = 1'); }
            else if (val === 'locked') { conditions.push('n.locked = 1'); }
            break;
          default:
            plainTerms.push(token);
        }
      } else {
        plainTerms.push(token);
      }
    }

    const where = conditions.join(' AND ');

    if (plainTerms.length > 0) {
      const termStr = plainTerms.join(' ').replace(/['"*()]/g, '').trim();
      if (termStr.length > 0) {
        try {
          return this.db.prepare(`
            SELECT n.id, n.title, n.folder_id, n.pinned, n.updated_at,
              snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
              rank
            FROM notes_fts f
            JOIN notes n ON n.rowid = f.rowid
            WHERE ${where} AND notes_fts MATCH ?
            ORDER BY rank
            LIMIT 50
          `).all(...params, termStr + '*').map((r: any) => ({
            id: r.id, title: r.title, snippet: r.snippet || '', rank: r.rank,
            updated_at: r.updated_at, folder_id: r.folder_id, pinned: r.pinned === 1,
          }));
        } catch (_e) {
          // Fall through to plain query
        }
      }
    }

    return this.db.prepare(`
      SELECT n.id, n.title, n.folder_id, n.pinned, n.updated_at, '' as snippet, 0 as rank
      FROM notes n
      WHERE ${where}
      ORDER BY n.updated_at DESC
      LIMIT 50
    `).all(...params).map((r: any) => ({
      id: r.id, title: r.title, snippet: '', rank: 0,
      updated_at: r.updated_at, folder_id: r.folder_id, pinned: r.pinned === 1,
    }));
  }

  // -------------------------------------------------------------------------
  // Word Suggestions
  // -------------------------------------------------------------------------

  recordWords(words: string[]): { success: boolean } {
    const now = Date.now();
    const upsert = this.db.prepare(`
      INSERT INTO word_suggestions_history (word, frequency, last_used)
      VALUES (?, 1, ?)
      ON CONFLICT(word) DO UPDATE SET frequency = frequency + 1, last_used = ?
    `);
    const batch = this.db.transaction((ws: string[]) => {
      for (const w of ws) {
        const clean = w.toLowerCase().replace(/[^a-z0-9'-]/gi, '');
        if (clean.length >= 2) {
          upsert.run(clean, now, now);
        }
      }
    });
    batch(words);
    return { success: true };
  }

  getWordSuggestions(prefix: string, limit?: number): string[] {
    const clean = prefix.toLowerCase().replace(/[^a-z0-9'-]/gi, '');
    if (clean.length < 1) return [];

    const results = this.db.prepare(`
      SELECT word FROM word_suggestions_history
      WHERE word LIKE ?
      ORDER BY frequency DESC
      LIMIT ?
    `).all(clean + '%', limit || 10) as { word: string }[];

    return results.map(r => r.word);
  }

  getBigramSuggestions(lastWord: string, limit?: number): string[] {
    // Simple frequency-based next word prediction from recorded words
    // Uses word_suggestions_history as a fallback for common words
    const words = this.db.prepare(`
      SELECT word FROM word_suggestions_history
      WHERE word != ?
      ORDER BY frequency DESC
      LIMIT ?
    `).all(lastWord.toLowerCase(), limit || 5) as { word: string }[];

    return words.map(r => r.word);
  }

  addCustomWord(word: string): { success: boolean } {
    const clean = word.toLowerCase().replace(/[^a-z0-9'-]/gi, '');
    if (clean.length < 2) return { success: false };

    this.db.prepare(`
      INSERT INTO word_suggestions_history (word, frequency, last_used)
      VALUES (?, 1000, ?)
      ON CONFLICT(word) DO UPDATE SET frequency = MAX(frequency, 1000)
    `).run(clean, Date.now());

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  listTemplates(): NoteListItem[] {
    const builtIn = this.getBuiltInTemplates();
    const custom = this.listNotes({ is_template: true });
    return [...builtIn, ...custom];
  }

  createFromTemplate(templateId: string): NotesDbNote | null {
    // Check custom templates first
    const custom = this.getNote(templateId);
    if (custom) {
      return this.createNote({
        title: custom.title.replace(' (Template)', ''),
        content: custom.content,
        plain_text: custom.plain_text,
      });
    }

    // Built-in templates
    const template = this.getBuiltInTemplateContent(templateId);
    if (template) {
      return this.createNote({
        title: template.title,
        content: template.content,
        plain_text: template.plainText,
      });
    }

    return null;
  }

  saveAsTemplate(noteId: string): { success: boolean } {
    const note = this.getNote(noteId);
    if (!note) return { success: false };

    this.db.prepare('UPDATE notes SET is_template = 1 WHERE id = ?').run(noteId);
    if (!note.title.includes('(Template)')) {
      this.db.prepare('UPDATE notes SET title = ? WHERE id = ?').run(note.title + ' (Template)', noteId);
    }
    return { success: true };
  }

  private getBuiltInTemplates(): NoteListItem[] {
    const now = Date.now();
    const templates: NoteListItem[] = [
      { id: 'tpl-daily-journal', title: 'Daily Journal', plain_text: 'Daily journal template', word_count: 0, created_at: now, updated_at: now, pinned: false, pin_order: 0, locked: false, color_label: null, folder_id: null, is_daily_note: false, is_template: true, tags: ['template'] },
      { id: 'tpl-meeting-notes', title: 'Meeting Notes', plain_text: 'Meeting notes template', word_count: 0, created_at: now, updated_at: now, pinned: false, pin_order: 0, locked: false, color_label: null, folder_id: null, is_daily_note: false, is_template: true, tags: ['template'] },
      { id: 'tpl-project-brief', title: 'Project Brief', plain_text: 'Project brief template', word_count: 0, created_at: now, updated_at: now, pinned: false, pin_order: 0, locked: false, color_label: null, folder_id: null, is_daily_note: false, is_template: true, tags: ['template'] },
      { id: 'tpl-technical-spec', title: 'Technical Spec', plain_text: 'Technical spec template', word_count: 0, created_at: now, updated_at: now, pinned: false, pin_order: 0, locked: false, color_label: null, folder_id: null, is_daily_note: false, is_template: true, tags: ['template'] },
      { id: 'tpl-weekly-review', title: 'Weekly Review', plain_text: 'Weekly review template', word_count: 0, created_at: now, updated_at: now, pinned: false, pin_order: 0, locked: false, color_label: null, folder_id: null, is_daily_note: false, is_template: true, tags: ['template'] },
      { id: 'tpl-reading-notes', title: 'Reading Notes', plain_text: 'Reading notes template', word_count: 0, created_at: now, updated_at: now, pinned: false, pin_order: 0, locked: false, color_label: null, folder_id: null, is_daily_note: false, is_template: true, tags: ['template'] },
      { id: 'tpl-recipe', title: 'Recipe', plain_text: 'Recipe template', word_count: 0, created_at: now, updated_at: now, pinned: false, pin_order: 0, locked: false, color_label: null, folder_id: null, is_daily_note: false, is_template: true, tags: ['template'] },
      { id: 'tpl-blank', title: 'Blank', plain_text: '', word_count: 0, created_at: now, updated_at: now, pinned: false, pin_order: 0, locked: false, color_label: null, folder_id: null, is_daily_note: false, is_template: true, tags: ['template'] },
    ];
    return templates;
  }

  private getBuiltInTemplateContent(templateId: string): { title: string; content: string; plainText: string } | null {
    const templates: Record<string, { title: string; content: string; plainText: string }> = {
      'tpl-daily-journal': {
        title: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        content: JSON.stringify({
          type: 'document',
          children: [
            { type: 'heading1', children: [{ type: 'text', text: new Date().toLocaleDateString() }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Mood' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
            { type: 'heading2', children: [{ type: 'text', text: "Today's Goals" }] },
            { type: 'checklist', children: [
              { type: 'checklistitem', checked: false, children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Notes' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Reflection' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
          ],
        }),
        plainText: 'Daily journal entry',
      },
      'tpl-meeting-notes': {
        title: 'Meeting Notes',
        content: JSON.stringify({
          type: 'document',
          children: [
            { type: 'heading1', children: [{ type: 'text', text: 'Meeting Notes' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Attendees' }] },
            { type: 'bulletlist', children: [
              { type: 'listitem', children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Agenda' }] },
            { type: 'checklist', children: [
              { type: 'checklistitem', checked: false, children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Discussion Notes' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Action Items' }] },
            { type: 'checklist', children: [
              { type: 'checklistitem', checked: false, children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Next Steps' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
          ],
        }),
        plainText: 'Meeting notes template',
      },
      'tpl-project-brief': {
        title: 'Project Brief',
        content: JSON.stringify({
          type: 'document',
          children: [
            { type: 'heading1', children: [{ type: 'text', text: 'Project Brief' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Overview' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Goals' }] },
            { type: 'checklist', children: [
              { type: 'checklistitem', checked: false, children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Timeline' }] },
            { type: 'table', children: [
              { type: 'tablerow', children: [
                { type: 'tablecell', children: [{ type: 'text', text: 'Phase' }] },
                { type: 'tablecell', children: [{ type: 'text', text: 'Start' }] },
                { type: 'tablecell', children: [{ type: 'text', text: 'End' }] },
                { type: 'tablecell', children: [{ type: 'text', text: 'Status' }] },
              ]},
              { type: 'tablerow', children: [
                { type: 'tablecell', children: [{ type: 'text', text: '' }] },
                { type: 'tablecell', children: [{ type: 'text', text: '' }] },
                { type: 'tablecell', children: [{ type: 'text', text: '' }] },
                { type: 'tablecell', children: [{ type: 'text', text: '' }] },
              ]},
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Team' }] },
            { type: 'bulletlist', children: [
              { type: 'listitem', children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Resources' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
          ],
        }),
        plainText: 'Project brief template',
      },
      'tpl-technical-spec': {
        title: 'Technical Spec',
        content: JSON.stringify({
          type: 'document',
          children: [
            { type: 'heading1', children: [{ type: 'text', text: 'Technical Specification' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Summary' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Requirements' }] },
            { type: 'numberedlist', children: [
              { type: 'listitem', children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Implementation Notes' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Code' }] },
            { type: 'codeblock', language: 'typescript', children: [{ type: 'text', text: '' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Open Questions' }] },
            { type: 'bulletlist', children: [
              { type: 'listitem', children: [{ type: 'text', text: '' }] },
            ]},
          ],
        }),
        plainText: 'Technical specification template',
      },
      'tpl-weekly-review': {
        title: 'Weekly Review',
        content: JSON.stringify({
          type: 'document',
          children: [
            { type: 'heading1', children: [{ type: 'text', text: 'Weekly Review' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Wins' }] },
            { type: 'bulletlist', children: [{ type: 'listitem', children: [{ type: 'text', text: '' }] }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Challenges' }] },
            { type: 'bulletlist', children: [{ type: 'listitem', children: [{ type: 'text', text: '' }] }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Next Week Priorities' }] },
            { type: 'checklist', children: [
              { type: 'checklistitem', checked: false, children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Focus Areas' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
          ],
        }),
        plainText: 'Weekly review template',
      },
      'tpl-reading-notes': {
        title: 'Reading Notes',
        content: JSON.stringify({
          type: 'document',
          children: [
            { type: 'heading1', children: [{ type: 'text', text: 'Reading Notes' }] },
            { type: 'paragraph', children: [
              { type: 'text', text: 'Author: ', marks: [{ type: 'bold' }] },
              { type: 'text', text: '' },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Key Takeaways' }] },
            { type: 'numberedlist', children: [{ type: 'listitem', children: [{ type: 'text', text: '' }] }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Favorite Quotes' }] },
            { type: 'blockquote', children: [{ type: 'paragraph', children: [{ type: 'text', text: '' }] }] },
            { type: 'heading2', children: [{ type: 'text', text: 'My Thoughts' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
          ],
        }),
        plainText: 'Reading notes template',
      },
      'tpl-recipe': {
        title: 'Recipe',
        content: JSON.stringify({
          type: 'document',
          children: [
            { type: 'heading1', children: [{ type: 'text', text: 'Recipe Name' }] },
            { type: 'heading2', children: [{ type: 'text', text: 'Ingredients' }] },
            { type: 'checklist', children: [
              { type: 'checklistitem', checked: false, children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Instructions' }] },
            { type: 'numberedlist', children: [
              { type: 'listitem', children: [{ type: 'text', text: '' }] },
            ]},
            { type: 'heading2', children: [{ type: 'text', text: 'Notes' }] },
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
          ],
        }),
        plainText: 'Recipe template',
      },
      'tpl-blank': {
        title: '',
        content: JSON.stringify({
          type: 'document',
          children: [
            { type: 'paragraph', children: [{ type: 'text', text: '' }] },
          ],
        }),
        plainText: '',
      },
    };

    return templates[templateId] || null;
  }

  // -------------------------------------------------------------------------
  // Daily Notes
  // -------------------------------------------------------------------------

  getOrCreateDailyNote(): NotesDbNote {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const titleStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Check if today's daily note exists
    const existing = this.db.prepare(
      "SELECT * FROM notes WHERE is_daily_note = 1 AND deleted = 0 AND title LIKE ? ORDER BY created_at DESC LIMIT 1"
    ).get(dateStr + '%') as NotesDbNote | undefined;

    if (existing) return existing;

    // Create new daily note
    return this.createNote({
      title: dateStr + ' - ' + titleStr,
      content: JSON.stringify({
        type: 'document',
        children: [
          { type: 'heading1', children: [{ type: 'text', text: titleStr }] },
          { type: 'paragraph', children: [{ type: 'text', text: '' }] },
        ],
      }),
      plain_text: titleStr,
      is_daily_note: 1 as any,
    });
  }

  // -------------------------------------------------------------------------
  // Export / Import
  // -------------------------------------------------------------------------

  async exportNote(noteId: string, opts: NoteExportOptions): Promise<{ success: boolean; filePath?: string }> {
    const note = this.getNote(noteId);
    if (!note) return { success: false };

    const exportDir = path.join(this.dataPath, 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filename = this.buildExportFilename(note.title, opts);

    switch (opts.format) {
      case 'plaintext': {
        const filePath = path.join(exportDir, filename + '.txt');
        fs.writeFileSync(filePath, note.plain_text, 'utf-8');
        return { success: true, filePath };
      }
      case 'markdown': {
        const md = this.documentToMarkdown(note.content);
        const filePath = path.join(exportDir, filename + '.md');
        fs.writeFileSync(filePath, md, 'utf-8');
        return { success: true, filePath };
      }
      case 'html': {
        const html = this.documentToHTML(note.content, note.title);
        const filePath = path.join(exportDir, filename + '.html');
        fs.writeFileSync(filePath, html, 'utf-8');
        return { success: true, filePath };
      }
      case 'json': {
        const json = JSON.stringify({ ...note, exportedAt: Date.now() }, null, 2);
        const filePath = path.join(exportDir, filename + '.json');
        fs.writeFileSync(filePath, json, 'utf-8');
        return { success: true, filePath };
      }
      case 'pdf': {
        if (this.mainWindow) {
          const html = this.documentToHTML(note.content, note.title);
          const filePath = path.join(exportDir, filename + '.pdf');
          const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
          await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          const pdfData = await win.webContents.printToPDF({
            pageSize: 'A4',
            printBackground: true,
            margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
          });
          fs.writeFileSync(filePath, pdfData);
          win.destroy();
          return { success: true, filePath };
        }
        return { success: false };
      }
      default:
        return { success: false };
    }
  }

  async importNotes(filePaths: string[]): Promise<{ imported: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    for (const fp of filePaths) {
      try {
        if (!fs.existsSync(fp)) {
          errors.push('File not found: ' + fp);
          continue;
        }
        const ext = path.extname(fp).toLowerCase();
        const content = fs.readFileSync(fp, 'utf-8');
        const baseName = path.basename(fp, ext);

        switch (ext) {
          case '.txt': {
            this.createNote({
              title: baseName,
              content: JSON.stringify({
                type: 'document',
                children: content.split('\n').map(line => ({
                  type: 'paragraph',
                  children: [{ type: 'text', text: line }],
                })),
              }),
              plain_text: content,
            });
            imported++;
            break;
          }
          case '.md': {
            this.createNote({
              title: baseName,
              content: JSON.stringify({
                type: 'document',
                children: this.markdownToDocNodes(content),
              }),
              plain_text: content.replace(/[#*`\[\]()]/g, ' ').replace(/\s+/g, ' ').trim(),
            });
            imported++;
            break;
          }
          case '.json': {
            const data = JSON.parse(content);
            if (data.content && data.title !== undefined) {
              this.createNote({
                title: data.title,
                content: typeof data.content === 'string' ? data.content : JSON.stringify(data.content),
                plain_text: data.plain_text || '',
                tags: data.tags,
              });
              imported++;
            }
            break;
          }
          case '.html': {
            this.createNote({
              title: baseName,
              content: JSON.stringify({
                type: 'document',
                children: [{ type: 'paragraph', children: [{ type: 'text', text: content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() }] }],
              }),
              plain_text: content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
            });
            imported++;
            break;
          }
          default:
            errors.push('Unsupported format: ' + ext);
        }
      } catch (err) {
        errors.push('Error importing ' + fp + ': ' + (err as Error).message);
      }
    }

    return { imported, errors };
  }

  private buildExportFilename(title: string, opts: NoteExportOptions): string {
    const safe = (title || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    const date = new Date().toISOString().split('T')[0];
    if (opts.filenameTemplate) {
      return opts.filenameTemplate
        .replace('{title}', safe)
        .replace('{date}', date);
    }
    return safe + '_' + date;
  }

  // -------------------------------------------------------------------------
  // Document Conversion Helpers
  // -------------------------------------------------------------------------

  private extractPlainText(contentJson: string): string {
    try {
      const doc = JSON.parse(contentJson);
      return this.walkTextNodes(doc).join(' ').replace(/\s+/g, ' ').trim();
    } catch (_e) {
      return contentJson.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  private walkTextNodes(node: any): string[] {
    const results: string[] = [];
    if (node.text !== undefined) {
      results.push(node.text);
    }
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        results.push(...this.walkTextNodes(child));
      }
    }
    return results;
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  private documentToMarkdown(contentJson: string): string {
    try {
      const doc = JSON.parse(contentJson);
      return this.nodeToMarkdown(doc);
    } catch (_e) {
      return contentJson;
    }
  }

  private nodeToMarkdown(node: any, depth: number = 0): string {
    if (!node) return '';
    if (node.text !== undefined) {
      let text = node.text;
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'bold') text = '**' + text + '**';
          if (mark.type === 'italic') text = '*' + text + '*';
          if (mark.type === 'code') text = '`' + text + '`';
          if (mark.type === 'strikethrough') text = '~~' + text + '~~';
          if (mark.type === 'link') text = '[' + text + '](' + (mark.href || '') + ')';
        }
      }
      return text;
    }

    const childText = (node.children || []).map((c: any) => this.nodeToMarkdown(c, depth)).join('');

    switch (node.type) {
      case 'document': return childText;
      case 'heading1': return '# ' + childText + '\n\n';
      case 'heading2': return '## ' + childText + '\n\n';
      case 'heading3': return '### ' + childText + '\n\n';
      case 'paragraph': return childText + '\n\n';
      case 'blockquote': return '> ' + childText.replace(/\n/g, '\n> ') + '\n\n';
      case 'codeblock': return '```' + (node.language || '') + '\n' + childText + '\n```\n\n';
      case 'bulletlist': return (node.children || []).map((c: any) => '- ' + this.nodeToMarkdown(c, depth + 1)).join('\n') + '\n\n';
      case 'numberedlist': return (node.children || []).map((c: any, i: number) => (i + 1) + '. ' + this.nodeToMarkdown(c, depth + 1)).join('\n') + '\n\n';
      case 'checklist': return (node.children || []).map((c: any) => {
        const checked = c.checked ? 'x' : ' ';
        return '- [' + checked + '] ' + this.nodeToMarkdown(c, depth + 1);
      }).join('\n') + '\n\n';
      case 'listitem': return childText;
      case 'checklistitem': return childText;
      case 'divider': return '---\n\n';
      case 'table': {
        const rows = (node.children || []).map((row: any) =>
          '| ' + (row.children || []).map((cell: any) => this.nodeToMarkdown(cell, depth + 1)).join(' | ') + ' |'
        );
        if (rows.length > 0) {
          const colCount = (node.children?.[0]?.children || []).length;
          const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
          rows.splice(1, 0, sep);
        }
        return rows.join('\n') + '\n\n';
      }
      case 'tablecell': return childText;
      default: return childText;
    }
  }

  private documentToHTML(contentJson: string, title: string): string {
    let body = '';
    try {
      const doc = JSON.parse(contentJson);
      body = this.nodeToHTML(doc);
    } catch (_e) {
      body = '<p>' + contentJson + '</p>';
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${this.escapeHtml(title)}</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 820px;
    margin: 40px auto;
    padding: 0 20px;
    line-height: 1.6;
    color: #1a1a1a;
    background: #ffffff;
  }
  h1 { font-size: 2em; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.25em; font-style: italic; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 4px; overflow-x: auto; }
  code { font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; }
  blockquote { border-left: 3px solid #0066ff; padding-left: 16px; margin-left: 0; color: #666; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 24px 0; }
  img { max-width: 100%; }
  .checklist-item { list-style: none; padding-left: 4px; }
  .checklist-item input { margin-right: 8px; }
  .checked { text-decoration: line-through; color: #888; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  }

  private nodeToHTML(node: any): string {
    if (!node) return '';
    if (node.text !== undefined) {
      let text = this.escapeHtml(node.text);
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case 'bold': text = '<strong>' + text + '</strong>'; break;
            case 'italic': text = '<em>' + text + '</em>'; break;
            case 'underline': text = '<u>' + text + '</u>'; break;
            case 'strikethrough': text = '<s>' + text + '</s>'; break;
            case 'code': text = '<code>' + text + '</code>'; break;
            case 'highlight': text = '<mark>' + text + '</mark>'; break;
            case 'link': text = '<a href="' + this.escapeHtml(mark.href || '') + '">' + text + '</a>'; break;
          }
        }
      }
      return text;
    }

    const children = (node.children || []).map((c: any) => this.nodeToHTML(c)).join('');

    switch (node.type) {
      case 'document': return children;
      case 'heading1': return '<h1>' + children + '</h1>';
      case 'heading2': return '<h2>' + children + '</h2>';
      case 'heading3': return '<h3>' + children + '</h3>';
      case 'paragraph': return '<p>' + children + '</p>';
      case 'blockquote': return '<blockquote>' + children + '</blockquote>';
      case 'codeblock': return '<pre><code>' + children + '</code></pre>';
      case 'bulletlist': return '<ul>' + children + '</ul>';
      case 'numberedlist': return '<ol>' + children + '</ol>';
      case 'listitem': return '<li>' + children + '</li>';
      case 'checklist': return '<ul style="list-style:none;padding-left:4px">' + children + '</ul>';
      case 'checklistitem': {
        const checked = node.checked ? ' checked' : '';
        const cls = node.checked ? ' class="checked"' : '';
        return '<li class="checklist-item"><input type="checkbox" disabled' + checked + '><span' + cls + '>' + children + '</span></li>';
      }
      case 'divider': return '<hr>';
      case 'table': return '<table>' + children + '</table>';
      case 'tablerow': return '<tr>' + children + '</tr>';
      case 'tablecell': return '<td>' + children + '</td>';
      default: return children;
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private markdownToDocNodes(md: string): any[] {
    const lines = md.split('\n');
    const nodes: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('# ')) {
        nodes.push({ type: 'heading1', children: [{ type: 'text', text: line.slice(2) }] });
      } else if (line.startsWith('## ')) {
        nodes.push({ type: 'heading2', children: [{ type: 'text', text: line.slice(3) }] });
      } else if (line.startsWith('### ')) {
        nodes.push({ type: 'heading3', children: [{ type: 'text', text: line.slice(4) }] });
      } else if (line.startsWith('```')) {
        const lang = line.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        nodes.push({ type: 'codeblock', language: lang, children: [{ type: 'text', text: codeLines.join('\n') }] });
      } else if (line.startsWith('> ')) {
        nodes.push({ type: 'blockquote', children: [{ type: 'paragraph', children: [{ type: 'text', text: line.slice(2) }] }] });
      } else if (/^- \[[ x]\] /.test(line)) {
        const checked = line[3] === 'x';
        nodes.push({ type: 'checklist', children: [{ type: 'checklistitem', checked, children: [{ type: 'text', text: line.slice(6) }] }] });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        nodes.push({ type: 'bulletlist', children: [{ type: 'listitem', children: [{ type: 'text', text: line.slice(2) }] }] });
      } else if (/^\d+\.\s/.test(line)) {
        const text = line.replace(/^\d+\.\s/, '');
        nodes.push({ type: 'numberedlist', children: [{ type: 'listitem', children: [{ type: 'text', text }] }] });
      } else if (line === '---' || line === '***') {
        nodes.push({ type: 'divider' });
      } else if (line.trim().length > 0) {
        nodes.push({ type: 'paragraph', children: this.parseInlineMarkdown(line) });
      }
    }

    if (nodes.length === 0) {
      nodes.push({ type: 'paragraph', children: [{ type: 'text', text: '' }] });
    }

    return nodes;
  }

  private parseInlineMarkdown(text: string): any[] {
    const runs: any[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
      if (boldMatch) {
        runs.push({ type: 'text', text: boldMatch[1], marks: [{ type: 'bold' }] });
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      // Italic
      const italicMatch = remaining.match(/^\*(.+?)\*/);
      if (italicMatch) {
        runs.push({ type: 'text', text: italicMatch[1], marks: [{ type: 'italic' }] });
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      // Code
      const codeMatch = remaining.match(/^`(.+?)`/);
      if (codeMatch) {
        runs.push({ type: 'text', text: codeMatch[1], marks: [{ type: 'code' }] });
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }
      // Link
      const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
      if (linkMatch) {
        runs.push({ type: 'text', text: linkMatch[1], marks: [{ type: 'link', href: linkMatch[2] }] });
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }
      // Plain text until next special char
      const nextSpecial = remaining.search(/[\*`\[]/);
      if (nextSpecial > 0) {
        runs.push({ type: 'text', text: remaining.slice(0, nextSpecial) });
        remaining = remaining.slice(nextSpecial);
      } else {
        runs.push({ type: 'text', text: remaining });
        break;
      }
    }

    if (runs.length === 0) {
      runs.push({ type: 'text', text: '' });
    }

    return runs;
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats(): {
    totalNotes: number;
    totalFolders: number;
    totalAttachments: number;
    totalWords: number;
    totalTags: number;
    trashCount: number;
    pinnedCount: number;
    lockedCount: number;
    templateCount: number;
  } {
    const totalNotes = (this.db.prepare('SELECT COUNT(*) as cnt FROM notes WHERE deleted = 0 AND is_template = 0').get() as any).cnt;
    const totalFolders = (this.db.prepare('SELECT COUNT(*) as cnt FROM folders').get() as any).cnt;
    const totalAttachments = (this.db.prepare('SELECT COUNT(*) as cnt FROM note_attachments').get() as any).cnt;
    const totalWords = (this.db.prepare('SELECT COALESCE(SUM(word_count), 0) as cnt FROM notes WHERE deleted = 0').get() as any).cnt;
    const totalTags = (this.db.prepare('SELECT COUNT(DISTINCT tag_id) as cnt FROM note_tags').get() as any).cnt;
    const trashCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM notes WHERE deleted = 1').get() as any).cnt;
    const pinnedCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM notes WHERE pinned = 1 AND deleted = 0').get() as any).cnt;
    const lockedCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM notes WHERE locked = 1 AND deleted = 0').get() as any).cnt;
    const templateCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM notes WHERE is_template = 1 AND deleted = 0').get() as any).cnt;

    return { totalNotes, totalFolders, totalAttachments, totalWords, totalTags, trashCount, pinnedCount, lockedCount, templateCount };
  }

  // -------------------------------------------------------------------------
  // Pane Sizes
  // -------------------------------------------------------------------------

  getPaneSizes(): NotePaneSize {
    const row = this.db.prepare('SELECT left_width, center_width FROM note_pane_sizes WHERE key = ?').get('default') as any;
    return { left: row?.left_width || 220, center: row?.center_width || 320 };
  }

  setPaneSizes(left: number, center: number): { success: boolean } {
    this.db.prepare('UPDATE note_pane_sizes SET left_width = ?, center_width = ? WHERE key = ?').run(
      Math.max(180, Math.min(400, left)),
      Math.max(240, Math.min(600, center)),
      'default'
    );
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  destroy(): void {
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
    }
    this.removeAllListeners();
  }
}

export const notesManager = new NotesManager();
