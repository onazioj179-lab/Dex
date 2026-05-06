// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Notes -- Zustand Store
// ==========================================================================
// Complete state management for the DEX Notes application.
// Communicates with NotesManager backend via window.dex.invoke('dexnotes:*')
// ==========================================================================

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// IPC Helper
// ---------------------------------------------------------------------------

async function ipc(channel: string, ...args: any[]): Promise<any> {
  try {
    if ((window as any).dex?.invoke) {
      return await (window as any).dex.invoke(channel, ...args);
    }
    return null;
  } catch (err) {
    console.warn(`[notesStore] IPC ${channel} failed:`, err);
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
  saving: boolean;
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

export const useNotesStore = create<NotesStoreState>((set, get) => ({
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
  saving: false,
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
      set({ loading: false });
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
      set({ notes: result });
    }
  },

  loadNote: async (id: string) => {
    const result = await ipc('dexnotes:get', id);
    if (result) {
      set({ activeNote: result, selectedNoteId: id });
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
      await ipc('dexnotes:update', id, updates);
      // Update local state immediately
      const { activeNote, notes } = get();
      if (activeNote && activeNote.id === id) {
        set({ activeNote: { ...activeNote, ...updates, updated_at: Date.now() } });
      }
      set({
        notes: notes.map(n => n.id === id ? { ...n, ...updates, updated_at: Date.now() } : n),
      });
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

  addAttachment: async (noteId: string, filePath: string) => {
    await ipc('dexnotes:addAttachment', noteId, filePath);
    if (get().activeNote?.id === noteId) {
      await get().loadNote(noteId);
    }
  },

  removeAttachment: async (attachmentId: string) => {
    await ipc('dexnotes:removeAttachment', attachmentId);
    const { activeNote } = get();
    if (activeNote) {
      await get().loadNote(activeNote.id);
    }
  },

  openAttachment: async (attachmentId: string) => {
    await ipc('dexnotes:openAttachment', attachmentId);
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
    if (result) {
      set({ templates: result });
    }
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
    return await ipc('dexnotes:export', noteId, { format });
  },

  importFile: async (filePath: string, folderId?: string | null) => {
    const _folder = folderId !== undefined ? folderId : get().selectedFolderId;
    const beforeIds = new Set(get().notes.map(note => note.id));
    const result = await ipc('dexnotes:import', [filePath]);
    if (result?.imported > 0) {
      await get().loadNotes();
      await get().loadStats();
      const importedNote = get().notes.find(note => !beforeIds.has(note.id)) || get().notes[0] || null;
      if (importedNote) {
        await get().loadNote(importedNote.id);
        return importedNote.id;
      }
    }
    return null;
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
}));
