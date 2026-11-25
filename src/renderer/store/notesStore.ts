// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX Notes -- Zustand Store
// ==========================================================================
// Complete state management for the DEX Notes application.
// Communicates with NotesManager backend via window.dex.invoke('dexnotes:*')
// ==========================================================================

import { create, type StateCreator } from 'zustand';
import { createContext, useContext } from 'react';
import { DEFAULT_NOTE_TEMPLATES, findBuiltinTemplate } from './noteTemplates';
import type { NoteExportFormat } from '../DEXAPPLICATIONS/notes/notesFileFormat';
// Loaded on demand: this store sits in the core chunk, the converters in the
// Notes app chunk; a static import would make a chunk cycle.
const loadNoteFormats = () => import('../DEXAPPLICATIONS/notes/notesFileFormat');

/** Notes → Word: build the .docx here, then the native Save dialog + binary write. */
async function exportNoteAsDocx(noteId: string): Promise<string | null> {
  const note = await ipc('dexnotes:get', noteId);
  if (!note) { notesToast('error', "Couldn't export: the note wasn't found"); return null; }
  const [{ safeFileName }, model, { noteToDocx, bytesToBase64 }] = await Promise.all([
    loadNoteFormats(), import('../DEXAPPLICATIONS/notes/NotesDocumentModel'), import('../DEXAPPLICATIONS/notes/docxExport'),
  ]);
  const title = note.title || 'Untitled note';
  const bytes = noteToDocx(title, model.docToHTML(model.deserializeDoc(note.content || '')));
  const name = safeFileName(note.title, 'docx');
  const dex = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<unknown> } }).dex;
  if (!dex?.invoke) {
    // Web preview: hand the file over as a download.
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return null;
  }
  const pick = (await dex.invoke('dialog:showSaveDialog', { title: 'Export as Word', defaultPath: name, filters: [{ name: 'Word document', extensions: ['docx'] }] })) as { canceled?: boolean; filePath?: string } | null;
  if (!pick || pick.canceled || !pick.filePath) return null;
  const res = (await dex.invoke('fs:writeBase64', pick.filePath, bytesToBase64(bytes))) as { ok?: boolean; error?: string } | null;
  if (!res?.ok) { notesToast('error', `Couldn't export the note${res?.error ? `: ${res.error}` : ''}`); return null; }
  notesToast('success', `Exported "${title}" as a Word document`);
  return pick.filePath;
}

function notesToast(type: 'success' | 'error' | 'info', message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* non-DOM */ }
}

// ---------------------------------------------------------------------------
// IPC Helper (with localStorage fallback when window.dex is unavailable —
// e.g. running the renderer in a plain browser dev server, or when the
// native better-sqlite3 module fails to load in the main process.)
// ---------------------------------------------------------------------------

const FALLBACK_KEY = 'dex-notes-fallback-v1';
type FB = {
  notes: Record<string, any>;
  folders: Record<string, any>;
  tags: Record<string, string[]>;
  pane: { folders_width: number; list_width: number };
};

function fbLoad(): FB {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { notes: {}, folders: {}, tags: {}, pane: { folders_width: 220, list_width: 320 } };
}
function fbSave(s: FB) {
  try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
function fbId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function fbToList(n: any): any {
  return {
    id: n.id, title: n.title || '', plain_text: n.plain_text || '',
    word_count: n.word_count || 0, created_at: n.created_at, updated_at: n.updated_at,
    pinned: n.pinned ? 1 : 0, pin_order: n.pin_order || 0, locked: n.locked ? 1 : 0,
    color_label: n.color_label || null, folder_id: n.folder_id || null,
    is_daily_note: n.is_daily_note ? 1 : 0, is_template: 0, tags: n.tags || [],
    favorite: n.favorite ? 1 : 0,
  };
}

// Today's date as a stable "YYYY-MM-DD" title, in local time. Used as both the
// daily-note title and the key for finding an existing one. Local time (not
// toISOString) so the note matches the user's calendar day, not UTC.
function dailyNoteTitle(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fallbackInvoke(channel: string, ...args: any[]): any {
  const s = fbLoad();
  const now = Date.now();
  switch (channel) {
    case 'dexnotes:list': {
      const opts = (args[0] || {}) as { folder_id?: string | null };
      const folder = opts.folder_id;
      // Trashed notes stay in storage (so Undo / Restore can bring them back) but are not listed.
      let list = Object.values(s.notes).filter((n: any) => !n.trashed_at).map(fbToList);
      if (folder !== undefined) list = list.filter(n => n.folder_id === folder);
      list.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      return list;
    }
    case 'dexnotes:get': {
      const id = args[0] as string;
      const n = s.notes[id];
      if (!n) return null;
      return { ...fbToList(n), content: n.content || '', attachments: [], links: [], backlinks: [] };
    }
    case 'dexnotes:create': {
      const data = args[0] || {};
      const id = fbId('note');
      s.notes[id] = {
        id, title: data.title || '', content: data.content || '', plain_text: data.plain_text || '',
        folder_id: data.folder_id || null, created_at: now, updated_at: now,
        pinned: 0, pin_order: 0, locked: 0, color_label: null, tags: [],
        favorite: 0, is_daily_note: data.is_daily_note ? 1 : 0,
      };
      fbSave(s);
      return { id };
    }
    case 'dexnotes:update': {
      const id = args[0] as string;
      const updates = args[1] || {};
      if (s.notes[id]) {
        s.notes[id] = { ...s.notes[id], ...updates, updated_at: now };
        fbSave(s);
      }
      return true;
    }
    case 'dexnotes:delete': {
      // Same contract as native: move to Trash unless `permanent` (args[1]) is set.
      const id = args[0] as string;
      if (!s.notes[id]) return false;
      if (args[1]) delete s.notes[id];
      else s.notes[id] = { ...s.notes[id], trashed_at: now };
      fbSave(s);
      return true;
    }
    case 'dexnotes:restore': {
      // Was a bare `true`: Undo after a delete reported success and restored nothing.
      const id = args[0] as string;
      if (!s.notes[id] || !s.notes[id].trashed_at) return false;
      const { trashed_at: _t, ...rest } = s.notes[id];
      s.notes[id] = { ...rest, updated_at: now };
      fbSave(s);
      return true;
    }
    case 'dexnotes:duplicate': {
      const id = args[0] as string;
      const orig = s.notes[id];
      if (!orig) return null;
      const newId = fbId('note');
      s.notes[newId] = { ...orig, id: newId, title: (orig.title || 'Untitled') + ' copy', created_at: now, updated_at: now };
      fbSave(s);
      return { id: newId };
    }
    case 'dexnotes:pin': {
      const id = args[0] as string;
      const pinned = !!args[1];
      if (s.notes[id]) { s.notes[id].pinned = pinned ? 1 : 0; fbSave(s); }
      return true;
    }
    case 'dexnotes:favorite': {
      const id = args[0] as string;
      const favorite = !!args[1];
      if (s.notes[id]) { s.notes[id].favorite = favorite ? 1 : 0; fbSave(s); }
      return true;
    }
    case 'dexnotes:getDailyNote': {
      // Find (or create) a note titled with today's date, e.g. "2026-06-14".
      const title = dailyNoteTitle();
      const existing = Object.values(s.notes).find((n: any) => (n.title || '') === title);
      if (existing) return { id: (existing as any).id };
      const id = fbId('note');
      s.notes[id] = {
        id, title, content: '{"type":"doc","content":[{"type":"paragraph","content":[]}]}',
        plain_text: '', folder_id: null, created_at: now, updated_at: now,
        pinned: 0, pin_order: 0, locked: 0, color_label: null, tags: [],
        favorite: 0, is_daily_note: 1,
      };
      fbSave(s);
      return { id };
    }
    case 'dexnotes:listFolders': return Object.values(s.folders);
    case 'dexnotes:createFolder': {
      const data = args[0] || {};
      const id = fbId('folder');
      s.folders[id] = { id, name: data.name || 'Folder', parent_id: data.parent_id || null, color: null, icon: null, sort_order: 0, created_at: now, children: [] };
      fbSave(s);
      return { id };
    }
    case 'dexnotes:updateFolder': {
      const id = args[0] as string;
      const updates = args[1] || {};
      if (s.folders[id]) { s.folders[id] = { ...s.folders[id], ...updates }; fbSave(s); }
      return true;
    }
    case 'dexnotes:deleteFolder': {
      const id = args[0] as string;
      delete s.folders[id];
      fbSave(s);
      return true;
    }
    case 'dexnotes:getAllTags': {
      const set = new Set<string>();
      Object.values(s.notes).forEach((n: any) => (n.tags || []).forEach((t: string) => set.add(t)));
      return Array.from(set);
    }
    case 'dexnotes:setTags': {
      const noteId = args[0] as string;
      const tags = (args[1] as string[]) || [];
      if (s.notes[noteId]) { s.notes[noteId].tags = tags; fbSave(s); }
      return true;
    }
    case 'dexnotes:getStats': {
      const live = Object.values(s.notes).filter((n: any) => !n.trashed_at);
      const total_notes = live.length;
      const total_folders = Object.keys(s.folders).length;
      const tagSet = new Set<string>();
      let total_words = 0;
      live.forEach((n: any) => {
        (n.tags || []).forEach((t: string) => tagSet.add(t));
        total_words += n.word_count || 0;
      });
      return { total_notes, total_folders, total_tags: tagSet.size, total_attachments: 0, total_words };
    }
    case 'dexnotes:listTemplates': return [];
    case 'dexnotes:getPaneSize': return s.pane;
    case 'dexnotes:savePaneSize': {
      const size = args[0] || {};
      s.pane = { ...s.pane, ...size };
      fbSave(s);
      return true;
    }
    case 'dexnotes:search': {
      // Real cross-folder search over every note's title + plain text (the
      // fallback used to return [] so search found nothing without native FTS).
      const raw = String(args[0] ?? '').trim().toLowerCase();
      if (!raw) return [];
      const terms = raw.split(/\s+/).filter(Boolean);
      const results: NoteSearchResult[] = [];
      for (const n of Object.values(s.notes) as any[]) {
        if (n.trashed_at) continue;
        const title = (n.title || '').toLowerCase();
        const plain = n.plain_text || '';
        const body = plain.toLowerCase();
        if (!terms.every(t => title.includes(t) || body.includes(t))) continue;
        let rank = 0;
        for (const t of terms) { if (title.includes(t)) rank += 2; if (body.includes(t)) rank += 1; }
        const idx = body.indexOf(terms[0]);
        let snippet: string;
        if (idx >= 0) {
          const start = Math.max(0, idx - 30);
          snippet = (start > 0 ? '…' : '') + plain.slice(start, idx + 90).trim() + (idx + 90 < plain.length ? '…' : '');
        } else {
          snippet = plain.slice(0, 90);
        }
        results.push({ id: n.id, title: n.title || 'Untitled', snippet, rank, folder_id: n.folder_id || null, updated_at: n.updated_at || 0, tags: n.tags || [] });
      }
      results.sort((a, b) => b.rank - a.rank || b.updated_at - a.updated_at);
      return results.slice(0, 100);
    }
    case 'dexnotes:saveExport': {
      // Browser preview: no Save dialog, so hand the file to the browser.
      const a = (args[0] || {}) as { fileName?: string; text?: string };
      try {
        const url = URL.createObjectURL(new Blob([a.text || ''], { type: 'text/plain;charset=utf-8' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: a.fileName || 'note.txt' });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { success: true, path: a.fileName };
      } catch (e) { return { success: false, error: String(e) }; }
    }
    case 'dexnotes:getSuggestions': return [];
    case 'dexnotes:recordWord': return true;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Favorites overlay
// ---------------------------------------------------------------------------
// The favorite flag lives in the note row (native `notes.favorite`, or the
// fallback store). This localStorage set is legacy: favorites used to be kept
// only here, so they never reached dex.db or a backup. loadNotes moves any
// entry the backend lacks into the row and drops it from the set; the set is
// also the last resort when a backend cannot store the flag.

const FAVORITES_KEY = 'dex-notes-favorites-v1';

function favLoad(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr as string[]);
    }
  } catch { /* ignore */ }
  return new Set();
}

function favSave(set: Set<string>): void {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(set))); } catch { /* ignore */ }
}

function favSet(id: string, on: boolean): Set<string> {
  const s = favLoad();
  if (on) s.add(id); else s.delete(id);
  favSave(s);
  return s;
}

/** Favorite flag for a note: the backend's column, or a not-yet-migrated overlay entry. */
function applyFavorite<T extends { id: string; favorite?: number | boolean }>(note: T, favs: Set<string>): T {
  const stored = note.favorite === true || Number(note.favorite) === 1;
  return { ...note, favorite: stored || favs.has(note.id) ? 1 : 0 };
}

/** The backend answered a favorite write as stored ({ success: true } natively, true in the fallback). */
const favoriteStored = (r: unknown): boolean => r === true || (!!r && typeof r === 'object' && (r as { success?: unknown }).success === true);

/**
 * Favorites used to live only in the localStorage overlay (native Notes had no
 * column, so they never reached dex.db or a backup). Move any overlay entry the
 * backend does not have yet into the note row, then drop it from the overlay.
 */
async function migrateOverlayFavorites(rows: Array<{ id: string; favorite?: number | boolean }>, favs: Set<string>): Promise<void> {
  if (favs.size === 0) return;
  let changed = false;
  for (const row of rows) {
    if (!favs.has(row.id)) continue;
    const stored = row.favorite === true || Number(row.favorite) === 1;
    if (!stored) {
      const r = await ipc('dexnotes:favorite', row.id, true).catch(() => null);
      if (!favoriteStored(r)) continue;
    }
    favs.delete(row.id); changed = true;
  }
  if (changed) favSave(favs);
}

async function ipc(channel: string, ...args: any[]): Promise<any> {
  try {
    if ((window as any).dex?.invoke) {
      const result = await (window as any).dex.invoke(channel, ...args);
      // If main returns null/undefined for a critical channel, fall back so UI still works
      if (result === null || result === undefined) {
        if (channel.startsWith('dexnotes:')) return fallbackInvoke(channel, ...args);
      }
      return result;
    }
    // No IPC bridge (browser dev mode) — use localStorage fallback so Notes works
    if (channel.startsWith('dexnotes:')) return fallbackInvoke(channel, ...args);
    return null;
  } catch (err) {
    console.warn(`[notesStore] IPC ${channel} failed, using fallback:`, err);
    if (channel.startsWith('dexnotes:')) return fallbackInvoke(channel, ...args);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoteListItem {
  id: string;
  title: string;
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
  favorite: number;
  tags: string[];
}

export interface NoteFull extends NoteListItem {
  content: string;
  attachments: NoteAttachment[];
  links: NoteLink[];
  backlinks: NoteBacklink[];
}

export interface NoteAttachment {
  id: string;
  note_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: number;
}

export interface NoteLink {
  id: string;
  source_note_id: string;
  target_note_id: string;
  link_text: string;
  created_at: number;
}

export interface NoteBacklink {
  id: string;
  source_note_id: string;
  source_title: string;
  link_text: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: number;
  children: Folder[];
}

export interface NoteSearchResult {
  id: string;
  title: string;
  snippet: string;
  rank: number;
  folder_id: string | null;
  updated_at: number;
  tags: string[];
}

export interface NoteTemplate {
  id: string;
  title: string;
  content: string;
  plain_text: string;
}

export interface WordSuggestion {
  word: string;
  frequency: number;
}

export type SortField = 'updated_at' | 'created_at' | 'title' | 'word_count';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid' | 'compact';
export type EditorMode = 'edit' | 'preview' | 'split';

export interface PaneSize {
  folders_width: number;
  list_width: number;
}

// ---------------------------------------------------------------------------
// Store State
// ---------------------------------------------------------------------------

export interface NotesStoreState {
  // Data
  notes: NoteListItem[];
  folders: Folder[];
  activeNote: NoteFull | null;
  templates: NoteTemplate[];
  searchResults: NoteSearchResult[];
  wordSuggestions: WordSuggestion[];
  allTags: string[];
  stats: { total_notes: number; total_folders: number; total_tags: number; total_attachments: number; total_words: number } | null;

  // UI State
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  searchQuery: string;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  editorMode: EditorMode;
  focusMode: boolean;
  sidebarCollapsed: boolean;
  listCollapsed: boolean;
  paneSize: PaneSize;

  // Loading
  loading: boolean;
  /** True once initialize() has loaded the note list at least once. */
  initialized: boolean;
  saving: boolean;
  /** Why the last save didn't reach the database, or null when it did. */
  saveError: string | null;
  searching: boolean;

  // Actions -- Data
  loadNotes: (folderId?: string | null) => Promise<void>;
  loadFolders: () => Promise<void>;
  loadNote: (id: string) => Promise<void>;
  loadTemplates: () => Promise<void>;
  loadAllTags: () => Promise<void>;
  loadStats: () => Promise<void>;
  createNote: (folderId?: string | null) => Promise<string | null>;
  updateNote: (id: string, updates: { title?: string; content?: string; plain_text?: string; folder_id?: string | null; color_label?: string | null; locked?: number }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentlyDeleteNote: (id: string) => Promise<void>;
  duplicateNote: (id: string) => Promise<string | null>;
  togglePin: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;

  // Actions -- Folders
  createFolder: (name: string, parentId?: string | null) => Promise<string | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveNoteToFolder: (noteId: string, folderId: string | null) => Promise<void>;

  // Actions -- Tags
  addTag: (noteId: string, tag: string) => Promise<void>;
  removeTag: (noteId: string, tag: string) => Promise<void>;
  setTags: (noteId: string, tags: string[]) => Promise<void>;

  // Actions -- Search
  search: (query: string) => Promise<void>;
  clearSearch: () => void;

  // Actions -- Attachments
  addAttachment: (noteId: string, filePath: string) => Promise<void>;
  removeAttachment: (attachmentId: string) => Promise<void>;
  openAttachment: (attachmentId: string) => Promise<void>;

  // Actions -- Links
  addLink: (sourceNoteId: string, targetNoteId: string, linkText: string) => Promise<void>;
  removeLink: (linkId: string) => Promise<void>;

  // Actions -- Templates
  createFromTemplate: (templateId: string, folderId?: string | null) => Promise<string | null>;

  // Actions -- Export/Import
  exportNote: (noteId: string, format: string) => Promise<string | null>;
  importFile: (filePath: string, folderId?: string | null) => Promise<string | null>;

  // Actions -- Daily Note
  getDailyNote: () => Promise<string | null>;

  // Actions -- Word Suggestions
  recordWord: (word: string) => Promise<void>;
  getSuggestions: (prefix: string) => Promise<void>;

  // Actions -- UI
  selectFolder: (folderId: string | null) => void;
  selectNote: (noteId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSortField: (field: SortField) => void;
  setSortDirection: (direction: SortDirection) => void;
  setViewMode: (mode: ViewMode) => void;
  setEditorMode: (mode: EditorMode) => void;
  toggleFocusMode: () => void;
  toggleSidebar: () => void;
  toggleList: () => void;
  setPaneSize: (size: Partial<PaneSize>) => void;
  savePaneSize: () => Promise<void>;
  loadPaneSize: () => Promise<void>;

  // Initialization
  initialize: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------

const notesStoreInit: StateCreator<NotesStoreState> = (set, get) => ({
  // Initial state
  notes: [],
  folders: [],
  activeNote: null,
  templates: [],
  searchResults: [],
  wordSuggestions: [],
  allTags: [],
  stats: null,

  selectedFolderId: null,
  selectedNoteId: null,
  searchQuery: '',
  sortField: 'updated_at',
  sortDirection: 'desc',
  viewMode: 'list',
  editorMode: 'edit',
  focusMode: false,
  sidebarCollapsed: false,
  listCollapsed: false,
  paneSize: { folders_width: 220, list_width: 320 },

  loading: false,
  initialized: false,
  saving: false,
  saveError: null,
  searching: false,

  // -- Initialize ----------------------------------------------------------

  initialize: async () => {
    set({ loading: true });
    try {
      await Promise.all([
        get().loadFolders(),
        get().loadNotes(),
        get().loadTemplates(),
        get().loadAllTags(),
        get().loadStats(),
        get().loadPaneSize(),
      ]);
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  // -- Notes CRUD ----------------------------------------------------------

  loadNotes: async (folderId?: string | null) => {
    const folder = folderId !== undefined ? folderId : get().selectedFolderId;
    const { sortField, sortDirection } = get();
    const result = await ipc('dexnotes:list', {
      folder_id: folder,
      sort_by: sortField,
      sort_order: sortDirection,
      limit: 500,
      offset: 0,
    });
    if (result) {
      const favs = favLoad();
      set({ notes: (result as NoteListItem[]).map(n => applyFavorite(n, favs)) });
      void migrateOverlayFavorites(result as NoteListItem[], favs);
    }
  },

  loadNote: async (id: string) => {
    const result = await ipc('dexnotes:get', id);
    if (result) {
      set({ activeNote: applyFavorite(result as NoteFull, favLoad()), selectedNoteId: id });
    }
  },

  createNote: async (folderId?: string | null) => {
    const folder = folderId !== undefined ? folderId : get().selectedFolderId;
    const result = await ipc('dexnotes:create', {
      title: '',
      content: '{"type":"doc","content":[{"type":"paragraph","content":[]}]}',
      plain_text: '',
      folder_id: folder,
    });
    if (result?.id) {
      // Real user action -> Trophies "notes created" + the daily note challenge.
      try { window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'notesCreated', amount: 1 } })); } catch { /* non-DOM env */ }
      await get().loadNotes();
      await get().loadNote(result.id);
      await get().loadStats();
      return result.id;
    }
    return null;
  },

  updateNote: async (id: string, updates) => {
    set({ saving: true });
    try {
      const result = await ipc('dexnotes:update', id, updates);
      // Update local state immediately
      const { activeNote, notes } = get();
      if (result && result.success === false) {
        // The row is gone (deleted elsewhere, or never reached the database).
        // Recreate it from what's on screen so the user's text isn't lost.
        const base = activeNote?.id === id ? activeNote : notes.find(n => n.id === id);
        const full = { ...(base || {}), ...updates } as Record<string, unknown>;
        const created = await ipc('dexnotes:create', {
          id, title: full.title ?? '', content: full.content ?? full.plain_text ?? '',
          plain_text: full.plain_text, folder_id: full.folder_id ?? null,
        });
        if (!created) {
          set({ saveError: 'This note could not be saved' });
          return;
        }
      }
      set({ saveError: null });
      if (activeNote && activeNote.id === id) {
        set({ activeNote: { ...activeNote, ...updates, updated_at: Date.now() } });
      }
      set({
        notes: notes.map(n => n.id === id ? { ...n, ...updates, updated_at: Date.now() } : n),
      });
      // Fold this note into the unified native search index so global search
      // spans notes, not just files. Fire-and-forget: never block the save on it,
      // and it's a no-op outside the desktop shell.
      const merged = get().activeNote?.id === id ? get().activeNote : null;
      const title = (updates.title ?? merged?.title ?? '') as string;
      const body = (updates.plain_text ?? merged?.plain_text ?? '') as string;
      if (title || body) {
        void ipc('search:upsertDoc', id, 'note', title, body, Math.floor(Date.now() / 1000))
          .catch(() => { /* index sync is best-effort */ });
      }
    } finally {
      set({ saving: false });
    }
  },

  deleteNote: async (id: string) => {
    // Send to recycle bin before deleting
    const note = get().notes.find(n => n.id === id);
    if (note) {
      try {
        const fullNote = get().activeNote?.id === id ? get().activeNote : null;
        await ipc('recycle-bin:delete', 'notes', 'note', note.title || 'Untitled',
          JSON.stringify({ id: note.id, title: note.title, content: fullNote?.content || note.plain_text, folder_id: note.folder_id }),
          note.folder_id || 'root');
      } catch { /* best effort */ }
    }
    await ipc('dexnotes:delete', id);
    // Drop it from the unified search index too (best-effort, desktop-only).
    void ipc('search:removeDoc', id).catch(() => { /* index sync is best-effort */ });
    const { activeNote, notes, selectedNoteId } = get();
    const filtered = notes.filter(n => n.id !== id);
    set({ notes: filtered });
    if (selectedNoteId === id) {
      const next = filtered.length > 0 ? filtered[0] : null;
      if (next) {
        await get().loadNote(next.id);
      } else {
        set({ activeNote: null, selectedNoteId: null });
      }
    }
    await get().loadStats();
  },

  restoreNote: async (id: string) => {
    await ipc('dexnotes:restore', id);
    await get().loadNotes();
    await get().loadStats();
  },

  permanentlyDeleteNote: async (id: string) => {
    await ipc('dexnotes:delete', id, true);
    const { activeNote, notes, selectedNoteId } = get();
    const filtered = notes.filter(n => n.id !== id);
    set({ notes: filtered });
    if (selectedNoteId === id) {
      set({ activeNote: null, selectedNoteId: null });
    }
    await get().loadStats();
  },

  duplicateNote: async (id: string) => {
    const result = await ipc('dexnotes:duplicate', id);
    if (result?.id) {
      await get().loadNotes();
      await get().loadNote(result.id);
      return result.id;
    }
    return null;
  },

  togglePin: async (id: string) => {
    const { notes, activeNote } = get();
    const note = notes.find(n => n.id === id);
    const newPinned = note ? !note.pinned : true;
    await ipc('dexnotes:pin', id, newPinned);
    set({
      notes: notes.map(n => n.id === id ? { ...n, pinned: newPinned ? 1 : 0 } : n),
    });
    if (activeNote && activeNote.id === id) {
      set({ activeNote: { ...activeNote, pinned: newPinned ? 1 : 0 } });
    }
  },

  toggleFavorite: async (id: string) => {
    const { notes, activeNote } = get();
    const note = notes.find(n => n.id === id);
    const newFavorite = note ? !note.favorite : true;
    set({
      notes: notes.map(n => n.id === id ? { ...n, favorite: newFavorite ? 1 : 0 } : n),
    });
    if (activeNote && activeNote.id === id) {
      set({ activeNote: { ...activeNote, favorite: newFavorite ? 1 : 0 } });
    }
    // The note row is the source of truth; the overlay only covers a backend
    // that could not store it (and is cleared for this note once it can).
    const r = await ipc('dexnotes:favorite', id, newFavorite).catch(() => null);
    favSet(id, favoriteStored(r) ? false : newFavorite);
  },

  // -- Folders -------------------------------------------------------------

  loadFolders: async () => {
    const result = await ipc('dexnotes:listFolders');
    if (result) {
      set({ folders: result });
    }
  },

  createFolder: async (name: string, parentId?: string | null) => {
    const result = await ipc('dexnotes:createFolder', { name, parent_id: parentId || null });
    if (result?.id) {
      await get().loadFolders();
      await get().loadStats();
      return result.id;
    }
    return null;
  },

  renameFolder: async (id: string, name: string) => {
    await ipc('dexnotes:updateFolder', id, { name });
    await get().loadFolders();
  },

  deleteFolder: async (id: string) => {
    await ipc('dexnotes:deleteFolder', id);
    const { selectedFolderId } = get();
    if (selectedFolderId === id) {
      set({ selectedFolderId: null });
    }
    await get().loadFolders();
    await get().loadNotes();
    await get().loadStats();
  },

  moveNoteToFolder: async (noteId: string, folderId: string | null) => {
    await get().updateNote(noteId, { folder_id: folderId });
    await get().loadNotes();
  },

  // -- Tags ----------------------------------------------------------------

  loadAllTags: async () => {
    const result = await ipc('dexnotes:getAllTags');
    if (result) {
      set({ allTags: result });
    }
  },

  addTag: async (noteId: string, tag: string) => {
    const { activeNote, notes } = get();
    const currentTags = activeNote && activeNote.id === noteId ? activeNote.tags : (notes.find(n => n.id === noteId)?.tags || []);
    const newTags = [...new Set([...currentTags, tag])];
    await ipc('dexnotes:setTags', noteId, newTags);
    if (activeNote && activeNote.id === noteId) {
      set({ activeNote: { ...activeNote, tags: newTags } });
    }
    set({
      notes: notes.map(n => n.id === noteId ? { ...n, tags: newTags } : n),
    });
    await get().loadAllTags();
  },

  removeTag: async (noteId: string, tag: string) => {
    const { activeNote, notes } = get();
    const currentTags = activeNote && activeNote.id === noteId ? activeNote.tags : (notes.find(n => n.id === noteId)?.tags || []);
    const newTags = currentTags.filter(t => t !== tag);
    await ipc('dexnotes:setTags', noteId, newTags);
    if (activeNote && activeNote.id === noteId) {
      set({ activeNote: { ...activeNote, tags: newTags } });
    }
    set({
      notes: notes.map(n => n.id === noteId ? { ...n, tags: newTags } : n),
    });
    await get().loadAllTags();
  },

  setTags: async (noteId: string, tags: string[]) => {
    await ipc('dexnotes:setTags', noteId, tags);
    const { activeNote, notes } = get();
    if (activeNote && activeNote.id === noteId) {
      set({ activeNote: { ...activeNote, tags } });
    }
    set({
      notes: notes.map(n => n.id === noteId ? { ...n, tags } : n),
    });
    await get().loadAllTags();
  },

  // -- Search --------------------------------------------------------------

  search: async (query: string) => {
    set({ searching: true, searchQuery: query });
    try {
      const result = await ipc('dexnotes:search', query);
      set({ searchResults: result || [] });
    } finally {
      set({ searching: false });
    }
  },

  clearSearch: () => {
    set({ searchQuery: '', searchResults: [] });
  },

  // -- Attachments ---------------------------------------------------------

  // Native answers {success:false,error}; throw so callers can say why.
  addAttachment: async (noteId: string, filePath: string) => {
    const r = await ipc('dexnotes:addAttachment', noteId, filePath) as { success?: boolean; error?: string } | null;
    if (!r || r.success !== true) throw new Error(r?.error || "Couldn't attach the file");
    if (get().activeNote?.id === noteId) {
      await get().loadNote(noteId);
    }
  },

  removeAttachment: async (attachmentId: string) => {
    const r = await ipc('dexnotes:removeAttachment', attachmentId) as { success?: boolean; error?: string } | null;
    const { activeNote } = get();
    if (activeNote) {
      await get().loadNote(activeNote.id);
    }
    if (!r || r.success !== true) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: r?.error || "Couldn't remove the attachment" } }));
    }
  },

  openAttachment: async (attachmentId: string) => {
    const r = await ipc('dexnotes:openAttachment', attachmentId) as { success?: boolean; error?: string } | null;
    if (!r || r.success !== true) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: r?.error || "Couldn't open the attachment" } }));
    }
  },

  // -- Links ---------------------------------------------------------------

  addLink: async (sourceNoteId: string, targetNoteId: string, linkText: string) => {
    await ipc('dexnotes:addLink', sourceNoteId, targetNoteId, linkText);
    if (get().activeNote?.id === sourceNoteId) {
      await get().loadNote(sourceNoteId);
    }
  },

  removeLink: async (linkId: string) => {
    await ipc('dexnotes:removeLink', Number(linkId));
    const { activeNote } = get();
    if (activeNote) {
      await get().loadNote(activeNote.id);
    }
  },

  // -- Templates -----------------------------------------------------------

  loadTemplates: async () => {
    const result = await ipc('dexnotes:listTemplates');
    const backend: NoteTemplate[] = Array.isArray(result) ? result : [];
    // Built-in starter templates are always available; any backend-provided
    // custom templates merge in (backend wins on id collision).
    const byId = new Map<string, NoteTemplate>();
    for (const t of DEFAULT_NOTE_TEMPLATES) byId.set(t.id, t);
    for (const t of backend) if (t && t.id) byId.set(t.id, t);
    set({ templates: Array.from(byId.values()) });
  },

  loadStats: async () => {
    const result = await ipc('dexnotes:stats');
    if (result) {
      set({
        stats: {
          total_notes: result.total_notes ?? result.totalNotes ?? 0,
          total_folders: result.total_folders ?? result.totalFolders ?? 0,
          total_tags: result.total_tags ?? result.totalTags ?? 0,
          total_attachments: result.total_attachments ?? result.totalAttachments ?? 0,
          total_words: result.total_words ?? result.totalWords ?? 0,
        },
      });
    }
  },

  createFromTemplate: async (templateId: string, folderId?: string | null) => {
    const folder = folderId !== undefined ? folderId : get().selectedFolderId;
    // Built-in templates are materialized via the standard create path so they
    // work under the native backend and the browser fallback alike.
    const builtin = findBuiltinTemplate(templateId);
    if (builtin) {
      const created = await ipc('dexnotes:create', {
        title: builtin.title,
        content: builtin.content,
        plain_text: builtin.plain_text,
        folder_id: folder || null,
      });
      if (created?.id) {
        await get().loadNotes();
        await get().loadNote(created.id);
        return created.id;
      }
      return null;
    }
    const result = await ipc('dexnotes:createFromTemplate', templateId);
    if (result?.id) {
      await get().loadNotes();
      await get().loadNote(result.id);
      return result.id;
    }
    return null;
  },

  // -- Export / Import -----------------------------------------------------

  exportNote: async (noteId: string, format: string) => {
    if (format === 'docx') return exportNoteAsDocx(noteId);
    const { NOTE_EXPORT_EXT, noteToFileText, safeFileName } = await loadNoteFormats();
    const fmt = (format in NOTE_EXPORT_EXT ? format : 'markdown') as NoteExportFormat;
    const note = await ipc('dexnotes:get', noteId);
    if (!note) { notesToast('error', "Couldn't export: the note wasn't found"); return null; }
    const ext = NOTE_EXPORT_EXT[fmt];
    const res = await ipc('dexnotes:saveExport', { fileName: safeFileName(note.title, ext), ext, text: noteToFileText(note, fmt) });
    if (res?.success) {
      notesToast('success', `Exported "${note.title || 'Untitled note'}"`);
      return (res.path as string) ?? null;
    }
    if (!res?.cancelled) notesToast('error', `Couldn't export the note${res?.error ? `: ${res.error}` : ''}`);
    return null;
  },

  importFile: async (filePath: string, folderId?: string | null) => {
    const folder = folderId !== undefined ? folderId : get().selectedFolderId;
    const read = await ipc('dexnotes:readImportFile', filePath);
    if (!read?.success) {
      notesToast('error', `Couldn't import${read?.error ? `: ${read.error}` : ' the file'}`);
      return null;
    }
    const { fileToNote, serializeDoc, docToPlainText } = await loadNoteFormats();
    let imported;
    try {
      imported = fileToNote(read.name || filePath, read.text || '');
    } catch (e) {
      notesToast('error', `Couldn't import: ${(e as Error).message}`);
      return null;
    }
    const plain = docToPlainText(imported.doc);
    const created = await ipc('dexnotes:create', {
      title: imported.title, content: serializeDoc(imported.doc), plain_text: plain,
      folder_id: folder,
    });
    if (!created?.id) { notesToast('error', "Couldn't import: the note couldn't be saved"); return null; }
    void ipc('search:upsertDoc', created.id, 'note', imported.title, plain, Math.floor(Date.now() / 1000))
      .catch(() => { /* index sync is best-effort */ });
    await get().loadNotes();
    await get().loadStats();
    await get().loadNote(created.id);
    notesToast('success', `Imported "${imported.title}"`);
    return created.id as string;
  },

  // -- Daily Note ----------------------------------------------------------

  getDailyNote: async () => {
    const result = await ipc('dexnotes:getDailyNote');
    if (result?.id) {
      await get().loadNotes();
      await get().loadNote(result.id);
      return result.id;
    }
    return null;
  },

  // -- Word Suggestions ---------------------------------------------------

  recordWord: async (word: string) => {
    await ipc('dexnotes:recordWords', [word]);
  },

  getSuggestions: async (prefix: string) => {
    const result = await ipc('dexnotes:getSuggestions', prefix);
    set({ wordSuggestions: result || [] });
  },

  // -- UI State ------------------------------------------------------------

  selectFolder: (folderId: string | null) => {
    set({ selectedFolderId: folderId });
    get().loadNotes(folderId);
  },

  selectNote: (noteId: string | null) => {
    if (noteId) {
      get().loadNote(noteId);
    } else {
      set({ activeNote: null, selectedNoteId: null });
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    if (query.length >= 2) {
      get().search(query);
    } else if (query.length === 0) {
      get().clearSearch();
    }
  },

  setSortField: (field: SortField) => {
    set({ sortField: field });
    get().loadNotes();
  },

  setSortDirection: (direction: SortDirection) => {
    set({ sortDirection: direction });
    get().loadNotes();
  },

  setViewMode: (mode: ViewMode) => set({ viewMode: mode }),
  setEditorMode: (mode: EditorMode) => set({ editorMode: mode }),

  toggleFocusMode: () => set(s => ({ focusMode: !s.focusMode })),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleList: () => set(s => ({ listCollapsed: !s.listCollapsed })),

  setPaneSize: (size: Partial<PaneSize>) => {
    set(s => ({ paneSize: { ...s.paneSize, ...size } }));
  },

  savePaneSize: async () => {
    const { paneSize } = get();
    await ipc('dexnotes:setPaneSizes', paneSize.folders_width, paneSize.list_width);
  },

  loadPaneSize: async () => {
    const result = await ipc('dexnotes:getPaneSizes');
    if (result) {
      const fw = typeof result.left === 'number' && Number.isFinite(result.left) ? result.left : 220;
      const lw = typeof result.center === 'number' && Number.isFinite(result.center) ? result.center : 320;
      set({ paneSize: { folders_width: fw, list_width: lw } });
    }
  },
});

// ---------------------------------------------------------------------------
// One store per Notes window
// ---------------------------------------------------------------------------
//
// The primary store (`useNotesStore`, also used by Home widgets, Send to Notes,
// UKI, Recycle Bin restore ...) belongs to the first Notes window. Every extra
// Notes window gets its own instance through NotesStoreContext, so its open
// note, folder, search and panes are its own. All instances share the same
// native notes database; after any change one instance broadcasts
// NOTES_CHANGED and the others refresh their list and, when they show the same
// note, reload it, so two windows never keep a stale copy of a note.

export const NOTES_CHANGED_EVENT = 'dex-notes-changed';

/** Methods that change notes data (the others only read or change local UI state). */
export const NOTES_MUTATORS = [
  'createNote', 'updateNote', 'deleteNote', 'restoreNote', 'permanentlyDeleteNote', 'duplicateNote',
  'togglePin', 'toggleFavorite', 'createFolder', 'renameFolder', 'deleteFolder', 'moveNoteToFolder',
  'addTag', 'removeTag', 'setTags', 'addAttachment', 'removeAttachment', 'addLink', 'removeLink',
  'createFromTemplate', 'importFile', 'getDailyNote',
] as const;

let notesStoreSeq = 0;

export function createNotesStore() {
  const instance = ++notesStoreSeq;
  const store = create<NotesStoreState>(notesStoreInit);
  const base = store.getState() as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const name of NOTES_MUTATORS) {
    const orig = base[name];
    if (typeof orig !== 'function') continue;
    patch[name] = async (...args: unknown[]) => {
      const result = await (orig as (...a: unknown[]) => unknown)(...args);
      try {
        window.dispatchEvent(new CustomEvent(NOTES_CHANGED_EVENT, {
          detail: { origin: instance, method: name, id: typeof args[0] === 'string' ? args[0] : null },
        }));
      } catch { /* non-DOM */ }
      return result;
    };
  }
  store.setState(patch as Partial<NotesStoreState>);

  const onChanged = (e: Event) => {
    const d = (e as CustomEvent<{ origin: number; method: string; id: string | null }>).detail;
    if (!d || d.origin === instance) return;
    const st = store.getState();
    void st.loadNotes(st.selectedFolderId);
    if (d.id && st.activeNote?.id === d.id) {
      if (/delete/i.test(d.method)) store.setState({ activeNote: null, selectedNoteId: null });
      else void st.loadNote(d.id);
    }
  };
  if (typeof window !== 'undefined') window.addEventListener(NOTES_CHANGED_EVENT, onChanged);
  const dispose = () => { if (typeof window !== 'undefined') window.removeEventListener(NOTES_CHANGED_EVENT, onChanged); };
  return Object.assign(store, { instance, dispose });
}

export type NotesStoreApi = ReturnType<typeof createNotesStore>;

const primaryNotesStore = createNotesStore();

/** Set by an extra Notes window (DexNotes) for everything rendered inside it. */
export const NotesStoreContext = createContext<NotesStoreApi | null>(null);

/** The notes store of the window this component is in (the primary one outside Notes). */
export function useNotesStoreApi(): NotesStoreApi {
  return useContext(NotesStoreContext) ?? primaryNotesStore;
}

function useNotesStoreHook(...args: unknown[]): unknown {
  const store = useContext(NotesStoreContext) ?? primaryNotesStore;
  return (store as unknown as (...a: unknown[]) => unknown)(...args);
}

/**
 * Hook: reads the current window's store. Static members (getState / setState /
 * subscribe) are the PRIMARY store's, for code outside React (services, UKI).
 */
export const useNotesStore = Object.assign(useNotesStoreHook, {
  getState: primaryNotesStore.getState,
  setState: primaryNotesStore.setState,
  subscribe: primaryNotesStore.subscribe,
  getInitialState: primaryNotesStore.getInitialState,
}) as unknown as typeof primaryNotesStore;
