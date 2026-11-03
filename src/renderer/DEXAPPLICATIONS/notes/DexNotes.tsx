// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX Notes -- Main Application Component
// ==========================================================================
// Three-pane layout: Folder sidebar | Note list | Editor
// With resizable dividers, focus mode, collapsed sidebar/list,
// keyboard shortcuts, and full lifecycle management.
// ==========================================================================

import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import { useNotesStore, type NoteListItem } from '../../store/notesStore';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { NotesEditor, injectEditorCSS } from './NotesEditor';
import SendToMenu, { useCreativeInbox } from '../../components/SendToMenu';
import {
  FolderTree,
  NoteListPanel,
  NoteToolbar,
  FindReplace,
  TagEditor,
  AttachmentPanel,
  TemplateSelector,
  NoteStats,
  TitleInput,
  TableOfContents,
} from './NotesComponents';
import {
  SuggestionBar,
  useWordSuggestions,
  populateTrieFromBackend,
} from './WordSuggestions';
import { deserializeDoc, extractHeadings } from './NotesDocumentModel';
import { keyEventForApp } from '../../shell/input/appKeyScope';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    background: 'var(--color-bg-base, #161618)',
    color: 'var(--color-text-primary, #e0e0e0)',
    fontFamily: 'var(--dex-font-ui)',
    overflow: 'hidden',
    position: 'relative',
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-inset)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px var(--space-3) var(--space-2)',
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.1px',
  },
  sidebarBody: {
    flex: 1,
    overflow: 'auto',
  },
  sidebarFooter: {
    padding: '6px 10px',
    borderTop: '1px solid var(--color-border-subtle)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  listPane: {
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-overlay)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  editorPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  resizer: {
    width: 3,
    cursor: 'col-resize',
    background: 'transparent',
    flexShrink: 0,
    zIndex: 10,
    transition: 'background 0.12s',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    color: 'var(--color-text-tertiary)',
  },
  footerBtn: {
    background: 'var(--color-bg-hover)',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 4,
    transition: 'background 0.1s, color 0.1s',
    fontWeight: 500,
  },
  rightPanel: {
    width: 240,
    borderLeft: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-inset)',
    overflow: 'auto',
    flexShrink: 0,
  },
  rightPanelHeader: {
    padding: '10px var(--space-3)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    borderBottom: '1px solid var(--color-bg-hover)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
  },
};

// ---------------------------------------------------------------------------
// Resizer Hook
// ---------------------------------------------------------------------------

function useResizer(
  initialWidth: number,
  minWidth: number,
  maxWidth: number,
  onResize: (width: number) => void,
) {
  const [width, setWidth] = useState(initialWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const rafId = useRef<number>(0);
  // Track active listeners so an unmount mid-drag can tear them down.
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setWidth(initialWidth);
  }, [initialWidth]);

  // Safety net: cancel any pending RAF and detach drag listeners on unmount.
  useEffect(() => () => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    teardownRef.current?.();
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    e.preventDefault();

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      const newW = Math.min(maxWidth, Math.max(minWidth, startW.current + delta));
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => setWidth(newW));
    };

    const onMouseUp = () => {
      dragging.current = false;
      onResize(width);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      teardownRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    teardownRef.current = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [width, minWidth, maxWidth, onResize]);

  return { width, onMouseDown };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const DexNotes: React.FC = () => {
  // -- Store ------------------------------------------------------------

  const store = useNotesStore();
  const {
    notes, folders, activeNote, templates, allTags, stats,
    selectedFolderId, selectedNoteId, searchQuery, searchResults,
    sortField, sortDirection, viewMode, editorMode, focusMode,
    sidebarCollapsed, listCollapsed, paneSize,
    loading, saving, saveError, searching, initialized,
  } = store;

  // UKI app-action: create a note (mutating -> confirm-gated). A ref keeps the
  // handler reading the live store/folder without re-registering each render.
  const notesCreateRef = useRef({ store, selectedFolderId });
  notesCreateRef.current = { store, selectedFolderId };
  useEffect(() => {
    registerUkiAppAction('notes', {
      id: 'notes.createNote',
      description: 'create a new note with the given title.',
      args: [{ name: 'title', type: 'string' }],
      example: '{"title": "Meeting notes"}',
      mutates: true,
    }, async (args) => {
      const title = String(args.title ?? '').trim() || 'Untitled';
      const { store: s, selectedFolderId: folder } = notesCreateRef.current;
      const id = await s.createNote(folder || undefined);
      if (!id) return 'Could not create the note.';
      s.updateNote(id, { title });
      return `Created note "${title}".`;
    });
    return () => unregisterUkiAppAction('notes.createNote');
  }, []);

  // -- Refs -------------------------------------------------------------

  const editorAreaRef = useRef<HTMLDivElement>(null);

  // -- State ------------------------------------------------------------

  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  // Inline #tag filter: when set, the list narrows to notes containing the tag.
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Local "New from template" menu (Meeting / Standup / Retro / Blank).
  const [showDocTemplateMenu, setShowDocTemplateMenu] = useState(false);
  const [initFailed, setInitFailed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteToast, setDeleteToast] = useState<{ title: string; visible: boolean } | null>(null);
  const deleteToastTimer = useRef<ReturnType<typeof setTimeout>>();

  // -- Word Suggestions -------------------------------------------------

  const wordSuggestions = useWordSuggestions(
    store.recordWord,
    store.getSuggestions,
  );

  // -- Resizers ---------------------------------------------------------

  const sidebarResizer = useResizer(
    paneSize.folders_width,
    140,
    400,
    (w) => store.setPaneSize({ folders_width: w }),
  );

  const listResizer = useResizer(
    paneSize.list_width,
    200,
    500,
    (w) => store.setPaneSize({ list_width: w }),
  );

  // -- Initialize -------------------------------------------------------

  useCreativeInbox('notes', useCallback((asset: { name: string; sourceApp: string; data?: string; kind?: string }) => {
    // When receiving an asset from another app, create a new note with reference
    store.createNote(selectedFolderId || 'default').then((noteId) => {
      if (noteId) {
        const content = asset.kind === 'image'
          ? `![${asset.name}](${asset.data || ''})` 
          : `Received ${asset.kind || 'file'}: ${asset.name}\n\nSource: ${asset.sourceApp}${asset.data ? `\nPath: ${asset.data}` : ''}`;
        store.updateNote(noteId, {
          title: `${asset.name} (from ${asset.sourceApp})`,
          content,
        });
      }
    });
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Created note from "${asset.name}"` } }));
  }, [selectedFolderId, store]));

  useEffect(() => {
    injectEditorCSS();
    // Notes uses an IPC backend with a localStorage fallback (see notesStore.ts).
    // The fallback guarantees initialize() always succeeds, so no error screen.
    store.initialize();
    populateTrieFromBackend(wordSuggestions.trie, wordSuggestions.bigram);
  }, []);

  // -- Auto-open: always have a note ready to type ----------------------

  const createAttempted = useRef(false);

  useEffect(() => {
    // Wait for the first real load: before it, `notes` is [] and `loading` is
    // still false, so this used to create a blank note on every first open.
    if (loading || initFailed || !initialized) return;
    if (!activeNote) {
      if (notes.length > 0) {
        store.selectNote(notes[0].id);
      } else if (!createAttempted.current) {
        createAttempted.current = true;
        store.createNote().then(id => {
          // Fallback always returns an id, so this branch is defensive only.
          if (!id) console.warn('[DexNotes] createNote returned null');
        });
      }
    }
  }, [loading, activeNote, notes.length, initFailed]);

  // -- Sync title -------------------------------------------------------

  useEffect(() => {
    if (activeNote) {
      setTitleValue(activeNote.title || '');
    }
  }, [activeNote?.id, activeNote?.title]);

  // -- Auto-title: derive name from first line of content ----------------

  const autoTitleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleEditorChangeWithAutoTitle = useCallback((content: string, plainText: string, wordCount: number) => {
    if (!activeNote) return;

    const currentTitle = activeNote.title || '';
    const isUntitled = !currentTitle || currentTitle === 'Untitled' || currentTitle === 'New Note' || currentTitle.startsWith('Daily Note');

    if (isUntitled && plainText.trim()) {
      const firstLine = plainText.split('\n')[0].trim().slice(0, 60);
      if (firstLine && firstLine !== currentTitle) {
        if (autoTitleTimerRef.current) clearTimeout(autoTitleTimerRef.current);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        autoTitleTimerRef.current = setTimeout(() => {
          setTitleValue(firstLine);
          store.updateNote(activeNote.id, { title: firstLine, content, plain_text: plainText });
        }, 500);
        return;
      }
    }

    // Debounce content-only saves — avoid an IPC call on every keystroke.
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      store.updateNote(activeNote.id, { content, plain_text: plainText });
    }, 500);
  }, [activeNote, store]);

  // -- Auto-save pane sizes ---------------------------------------------

  useEffect(() => {
    return () => {
      if (autoTitleTimerRef.current) clearTimeout(autoTitleTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => store.savePaneSize(), 1000);
    return () => clearTimeout(timer);
  }, [paneSize.folders_width, paneSize.list_width]);

  // -- Keyboard Shortcuts -----------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'notes')) return; // key meant for another app
      const ctrl = e.ctrlKey || e.metaKey;

      // New note: Ctrl+N
      if (ctrl && e.key === 'n') {
        e.preventDefault();
        store.createNote();
        return;
      }

      // Find: Ctrl+F
      if (ctrl && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(v => !v);
        return;
      }

      // Toggle sidebar: Ctrl+\
      if (ctrl && e.key === '\\') {
        e.preventDefault();
        store.toggleSidebar();
        return;
      }

      // Focus mode: Ctrl+Shift+F
      if (ctrl && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        store.toggleFocusMode();
        return;
      }

      // Daily note: Ctrl+D
      if (ctrl && e.key === 'd') {
        e.preventDefault();
        store.getDailyNote();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store]);

  // -- Editor Callbacks -------------------------------------------------

  const handleEditorChange = useCallback((content: string, plainText: string, wordCount: number) => {
    handleEditorChangeWithAutoTitle(content, plainText, wordCount);
    // Trigger word suggestions based on current caret position
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.anchorNode) {
        // Get text content up to cursor from the editable container
        const range = sel.getRangeAt(0);
        const preRange = document.createRange();
        const editorEl = document.querySelector('[contenteditable="true"]');
        if (editorEl) {
          preRange.selectNodeContents(editorEl);
          preRange.setEnd(range.startContainer, range.startOffset);
          const textBeforeCursor = preRange.toString();
          wordSuggestions.handleTextChange(textBeforeCursor, textBeforeCursor.length);
        }
      }
    } catch { /* ignore if selection APIs fail */ }
  }, [handleEditorChangeWithAutoTitle, wordSuggestions]);

  const handleSave = useCallback(() => {
    // Already auto-saving, but force save on Ctrl+S
    if (!activeNote) return;
    store.updateNote(activeNote.id, {
      content: activeNote.content,
      plain_text: activeNote.plain_text,
    });
  }, [activeNote, store]);

  const handleTitleChange = useCallback((title: string) => {
    setTitleValue(title);
    if (activeNote) {
      store.updateNote(activeNote.id, { title });
    }
  }, [activeNote, store]);

  // -- Delete with confirmation -----------------------------------------
  const handleDeleteWithConfirm = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const confirmDelete = useCallback(() => {
    if (confirmDeleteId) {
      const note = notes.find(n => n.id === confirmDeleteId);
      store.deleteNote(confirmDeleteId);
      setConfirmDeleteId(null);
      // Show "Moved to Trash" toast
      if (note) {
        if (deleteToastTimer.current) clearTimeout(deleteToastTimer.current);
        setDeleteToast({ title: note.title || 'Untitled', visible: true });
        deleteToastTimer.current = setTimeout(() => setDeleteToast(null), 3500);
      }
    }
  }, [confirmDeleteId, store, notes]);

  const cancelDelete = useCallback(() => {
    setConfirmDeleteId(null);
  }, []);

  const handleAddAttachment = useCallback(async () => {
    if (!activeNote) return;
    // Use file dialog through IPC
    try {
      const dex = (window as any).dex;
      if (dex?.invoke) {
        const result = await dex.invoke('dexnotes:pick-attachment-file');
        if (result?.filePath) {
          await store.addAttachment(activeNote.id, result.filePath);
        }
      }
    } catch (_e) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'File picker not available' } }));
    }
  }, [activeNote, store]);

  // -- Drag-drop attachments onto the editor ----------------------------
  // Electron exposes the absolute path on the dropped File (same pattern the
  // dock uses in AppManager). Falls back to a toast if no path is available.
  const handleDropFiles = useCallback(async (files: FileList) => {
    if (!activeNote) return;
    let added = 0;
    for (const file of Array.from(files)) {
      const filePath = (file as File & { path?: string }).path;
      if (filePath) {
        try {
          await store.addAttachment(activeNote.id, filePath);
          added++;
        } catch { /* skip files that fail to attach */ }
      }
    }
    if (added > 0) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Attached ${added} file${added !== 1 ? 's' : ''}` } }));
    } else {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'Could not attach dropped file' } }));
    }
  }, [activeNote, store]);

  // -- [[wiki-link]] navigation: open the note whose title matches ------
  const handleWikiLinkClick = useCallback((title: string) => {
    const target = title.trim().toLowerCase();
    const match = notes.find(n => (n.title || '').trim().toLowerCase() === target);
    if (match) {
      store.selectNote(match.id);
    } else {
      // No such note yet -- create one with that title so the link resolves.
      store.createNote(selectedFolderId || undefined).then(id => {
        if (id) store.updateNote(id, { title: title.trim() });
      });
    }
  }, [notes, store, selectedFolderId]);

  // -- Note titles for the [[wiki-link]] autocomplete -------------------
  const noteTitles = React.useMemo(
    () => notes.map(n => (n.title || '').trim()).filter(Boolean),
    [notes],
  );

  // -- In-notes search: filter the visible list as the user types -------
  // The store's setSearchQuery also fires a backend full-text search, but the
  // list pane renders this `notes` array, so a live client-side filter is what
  // actually narrows what the user sees -- instant, no IPC round-trip, and it
  // matches across title, preview text, and tags. Empty query => full list.
  // Fire the backend cross-folder search whenever the query changes, so matches
  // from OTHER folders are available (the list itself is folder-scoped).
  useEffect(() => {
    const q = searchQuery.trim();
    if (q) store.search(q);
    // store.search is a stable zustand action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const visibleNotes = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Inline-tag filter: keep notes whose title/body contains the active #tag
    // as a whole token (so "#design" doesn't match "#designer").
    const tagRe = activeTag
      ? new RegExp(`#${activeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i')
      : null;
    const matchesTag = (n: NoteListItem) =>
      !tagRe || tagRe.test(`${n.title || ''}\n${n.plain_text || ''}`);

    if (!q) return tagRe ? notes.filter(matchesTag) : notes;
    // Support multi-term AND search ("project todo" matches notes with both).
    const terms = q.split(/\s+/);
    const localMatches = notes.filter(n => {
      if (!matchesTag(n)) return false;
      const haystack = `${n.title || ''}\n${n.plain_text || ''}\n${(n.tags || []).join(' ')}`.toLowerCase();
      return terms.every(t => haystack.includes(t));
    });
    // Append cross-folder hits from the backend search, de-duped by id, so search
    // spans the whole vault rather than just the selected folder.
    const seen = new Set(localMatches.map(n => n.id));
    const crossFolder = (searchResults || [])
      .filter(r => !seen.has(r.id))
      .map<NoteListItem>(r => ({
        id: r.id, title: r.title, plain_text: r.snippet, word_count: 0,
        created_at: r.updated_at, updated_at: r.updated_at, pinned: 0, pin_order: 0,
        locked: 0, color_label: null, folder_id: r.folder_id, is_daily_note: 0,
        is_template: 0, favorite: 0, tags: r.tags || [],
      }))
      .filter(matchesTag);
    return [...localMatches, ...crossFolder];
  }, [notes, searchQuery, searchResults, activeTag]);

  // -- Inline #tags: distinct tokens scanned from titles + body ----------
  // Detects `#tag` tokens across the in-folder notes and exposes them as
  // clickable filter chips. Sorted by frequency so the most-used tags lead.
  const inlineTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    const re = /#([\w][\w-]*)/g;
    for (const n of notes) {
      const text = `${n.title || ''}\n${n.plain_text || ''}`;
      const localSeen = new Set<string>();
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        const tag = m[1].toLowerCase();
        // Skip pure-number tokens (e.g. "#1") -- those are rarely real tags.
        if (/^\d+$/.test(tag)) continue;
        if (localSeen.has(tag)) continue; // count each tag once per note
        localSeen.add(tag);
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
  }, [notes]);

  // If the active tag disappears from the corpus, clear the filter.
  useEffect(() => {
    if (activeTag && !inlineTags.some(t => t.tag === activeTag)) {
      setActiveTag(null);
    }
  }, [inlineTags, activeTag]);

  // -- Note templates: pre-filled doc-JSON bodies ------------------------
  // Mirrors the store's doc-JSON content shape so the editor renders them
  // immediately. Each builds via createNote() then updateNote(id, {...}).
  const docTemplates = React.useMemo(() => {
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const doc = (content: any[]) => JSON.stringify({ type: 'doc', content });
    const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
    const p = (text = '') => (text
      ? { type: 'paragraph', content: [{ type: 'text', text }] }
      : { type: 'paragraph' });

    return [
      {
        id: 'blank',
        label: 'Blank',
        title: 'Untitled',
        plain_text: '',
        content: doc([p()]),
      },
      {
        id: 'meeting',
        label: 'Meeting',
        title: `Meeting Notes - ${today}`,
        plain_text: `Meeting Notes - ${today}\nAttendees:\nAgenda:\nDiscussion:\nAction Items:`,
        content: doc([
          h(1, `Meeting Notes - ${today}`),
          h(2, 'Attendees'),
          p(),
          h(2, 'Agenda'),
          p(),
          h(2, 'Discussion'),
          p(),
          h(2, 'Action Items'),
          p(),
        ]),
      },
      {
        id: 'standup',
        label: 'Standup',
        title: `Standup - ${today}`,
        plain_text: `Standup - ${today}\nYesterday:\nToday:\nBlockers:`,
        content: doc([
          h(1, `Standup - ${today}`),
          h(2, 'Yesterday'),
          p(),
          h(2, 'Today'),
          p(),
          h(2, 'Blockers'),
          p(),
        ]),
      },
      {
        id: 'retro',
        label: 'Retro',
        title: `Retrospective - ${today}`,
        plain_text: `Retrospective - ${today}\nWhat went well:\nWhat could improve:\nAction items:`,
        content: doc([
          h(1, `Retrospective - ${today}`),
          h(2, 'What went well'),
          p(),
          h(2, 'What could improve'),
          p(),
          h(2, 'Action items'),
          p(),
        ]),
      },
    ];
  }, []);

  const createFromDocTemplate = useCallback((tmplId: string) => {
    const tmpl = docTemplates.find(t => t.id === tmplId);
    if (!tmpl) return;
    setShowDocTemplateMenu(false);
    store.createNote(selectedFolderId || undefined).then(id => {
      if (!id) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: 'Could not create note' } }));
        return;
      }
      store.updateNote(id, { title: tmpl.title, content: tmpl.content, plain_text: tmpl.plain_text });
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Created "${tmpl.label}" note` } }));
    });
  }, [docTemplates, selectedFolderId, store]);

  // -- Outline / table of contents --------------------------------------
  const headings = React.useMemo(() => {
    if (!activeNote?.content) return [];
    try {
      return extractHeadings(deserializeDoc(activeNote.content));
    } catch {
      return [];
    }
  }, [activeNote?.content]);

  // Scroll the editor to the Nth heading (matches extractHeadings order).
  const handleJumpToHeading = useCallback((index: number) => {
    const editorEl = editorAreaRef.current?.querySelector('.dexnotes-editable, .dexnotes-preview');
    if (!editorEl) return;
    const hs = editorEl.querySelectorAll('h1, h2, h3');
    const target = hs[index] as HTMLElement | undefined;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // -- Autosave indicator state -----------------------------------------
  // Derives a save state from the store's `saving` flag and remembers when the
  // last successful save landed, so the header pill reads "Saved Xs ago".
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const wasSaving = useRef(false);
  useEffect(() => {
    if (saving) {
      wasSaving.current = true;
    } else if (wasSaving.current) {
      wasSaving.current = false;
      if (!useNotesStore.getState().saveError) setLastSavedAt(Date.now());
    }
  }, [saving]);

  // -- Render -----------------------------------------------------------

  if (loading) {
    return (
      <div style={S.root}>
        <div style={{ ...S.emptyState, width: '100%' }}>
          <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>Loading notes...</div>
        </div>
      </div>
    );
  }

  if (initFailed) {
    return (
      <div style={S.root}>
        <div style={{ ...S.emptyState, width: '100%' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,69,58,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center', maxWidth: 320 }}>
            Notes database could not be initialized.
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', maxWidth: 320 }}>
            The notes database didn't respond. Your notes are not deleted; try again.
          </div>
          <button
            onClick={() => { setInitFailed(false); createAttempted.current = false; store.initialize(); }}
            style={{ padding: '6px var(--space-4)', background: 'var(--color-accent-light, rgba(10,132,255,0.15))', border: '1px solid var(--color-accent-muted, rgba(10,132,255,0.3))', borderRadius: 4, color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Focus mode: only show editor
  if (focusMode && activeNote) {
    return (
      <div style={S.root}>
        <div style={S.editorPane}>
          <NoteToolbar
            note={activeNote}
            editorMode={editorMode}
            onEditorModeChange={store.setEditorMode}
            onTogglePin={() => store.togglePin(activeNote.id)}
            onDuplicate={() => store.duplicateNote(activeNote.id)}
            onDelete={() => handleDeleteWithConfirm(activeNote.id)}
            onExport={(fmt) => store.exportNote(activeNote.id, fmt)}
            onToggleFocus={store.toggleFocusMode}
            onToggleLock={() => store.updateNote(activeNote.id, { locked: activeNote.locked ? 0 : 1 })}
            onColorLabel={(c) => store.updateNote(activeNote.id, { color_label: c })}
            focusMode={focusMode}
            saving={saving}
            lastSavedAt={lastSavedAt}
            saveError={saveError}
          />
          <TitleInput title={titleValue} onChange={handleTitleChange} />
          <NotesEditor
            content={activeNote.content}
            onChange={handleEditorChange}
            onSave={handleSave}
            editorMode={editorMode}
            focusMode
            readOnly={!!activeNote.locked}
            noteTitles={noteTitles}
            onWikiLinkClick={handleWikiLinkClick}
            onDropFiles={handleDropFiles}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={S.root} className="dexnotes-app">
      <style>{`
        /* === DEXNOTES - UI HOVER === */
        .dexnotes-app button { font-family: inherit; transition: all 0.12s ease; }
        .dexnotes-app button:active { transform: scale(0.97); }
        .dexnotes-app .dn-footer button:hover { background: var(--color-accent-light, rgba(10,132,255,0.12)) !important; color: var(--color-accent, #0a84ff) !important; }
        .dexnotes-app .dn-tree-acts:hover { opacity: 1 !important; }
        .dexnotes-app .dn-tree-acts button:hover { background: var(--color-bg-hover, rgba(255,255,255,0.08)) !important; border-radius: 3px; }
        .dexnotes-app .dn-swatch { transition: transform 0.12s ease; }
        .dexnotes-app .dn-swatch:hover { transform: scale(1.15); }
        /* Favorite star: hidden until the note row is hovered; always shown once on. */
        .dexnotes-app .dn-star { opacity: 0; transition: opacity 0.12s ease, transform 0.12s ease; }
        .dexnotes-app .dn-note-item:hover .dn-star { opacity: 0.55; }
        .dexnotes-app .dn-star.dn-star-on { opacity: 1; }
        .dexnotes-app .dn-star:hover { opacity: 1 !important; transform: scale(1.15); }
        .dexnotes-app * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        .dexnotes-app ::-webkit-scrollbar { width: 6px; height: 6px; }
        .dexnotes-app ::-webkit-scrollbar-track { background: transparent; }
        .dexnotes-app ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        .dexnotes-app ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
      `}</style>
      {/* -- Folder Sidebar ------------------------------------------ */}
      {!sidebarCollapsed && (
        <>
          <div style={{ ...S.sidebar, width: sidebarResizer.width }}>
            <div style={S.sidebarHeader}>
              <span style={S.sidebarTitle}>DEX Notes</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SendToMenu sourceApp="notes" assetKind="document" getAsset={() => ({ name: `${activeNote?.title || 'Note'}.md`, data: activeNote?.content || '', mimeType: 'text/markdown' })} />
                <button
                  aria-label="Collapse sidebar"
                  onClick={store.toggleSidebar}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}
                  title="Collapse sidebar"
                >
                  {'<'}
                </button>

              </div>
            </div>
            <div className="dex-scroll-fade-y" style={S.sidebarBody}>
              <FolderTree
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelect={store.selectFolder}
                onCreate={(name, parentId) => store.createFolder(name, parentId)}
                onRename={store.renameFolder}
                onDelete={store.deleteFolder}
              />
            </div>
            <div style={S.sidebarFooter} className="dn-footer">
              <button
                aria-label="Import file"
                onClick={async () => {
                  try {
                    const dex = (window as any).dex;
                    if (dex?.invoke) {
                      const result = await dex.invoke('dexnotes:pick-import-file');
                      if (result?.filePath) {
                        await store.importFile(result.filePath);
                      }
                    }
                  } catch { /* picker cancelled */ }
                }}
                style={{ ...S.footerBtn, display: 'flex', alignItems: 'center', gap: 4 }}
                title="Import file"
              ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2"/></svg>Import</button>
              <button
                aria-label="Open daily note"
                onClick={() => store.getDailyNote()}
                style={{ ...S.footerBtn, display: 'flex', alignItems: 'center', gap: 4 }}
                title="Open daily note"
              ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12"/><path d="M5 2v2M11 2v2"/></svg>Daily</button>
              <button
                aria-label="Open templates"
                onClick={() => setShowTemplates(true)}
                style={{ ...S.footerBtn, display: 'flex', alignItems: 'center', gap: 4 }}
                title="Templates"
              ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6 2v12M2 6h12"/></svg>Templates</button>
              <button
                aria-label="View statistics"
                onClick={() => setShowStats(true)}
                style={{ ...S.footerBtn, display: 'flex', alignItems: 'center', gap: 4 }}
                title="Statistics"
              ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="3" y="8" width="2" height="6"/><rect x="7" y="4" width="2" height="10"/><rect x="11" y="2" width="2" height="12"/></svg>Stats</button>
              <button
                aria-label="Open Trash"
                onClick={() => {
                  const dex = (window as any).dex;
                  if (dex?.invoke) dex.invoke('app:launch', 'recyclebin');
                }}
                style={{ ...S.footerBtn, display: 'flex', alignItems: 'center', gap: 4 }}
                title="Open Trash"
              ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><polyline points="2 4 3.5 4 14 4"/><path d="M12.5 4l-.7 9.3a1.3 1.3 0 0 1-1.3 1.2H5.5a1.3 1.3 0 0 1-1.3-1.2L3.5 4"/><path d="M6.5 7v4M9.5 7v4"/><path d="M5.5 4V2.7a.7.7 0 0 1 .7-.7h3.6a.7.7 0 0 1 .7.7V4"/></svg>Trash</button>
            </div>
          </div>
          {/* Sidebar resizer */}
          <div
            style={S.resizer}
            onMouseDown={sidebarResizer.onMouseDown}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,210,255,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          />
        </>
      )}

      {/* Collapsed sidebar toggle */}
      {sidebarCollapsed && (
        <div
          style={{
            width: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 'var(--space-3)',
            gap: 'var(--space-2)',
            flexShrink: 0,
            borderRight: '1px solid var(--color-border-subtle)',
          }}
        >
          <button
            aria-label="Show sidebar"
            onClick={store.toggleSidebar}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }}
            title="Show sidebar"
          >
            {'>'}
          </button>

        </div>
      )}

      {/* -- Note List ----------------------------------------------- */}
      {!listCollapsed && (
        <>
          <div style={{ ...S.listPane, width: listResizer.width }}>
            {/* Inline #tag filter chips + "New from template" menu. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px var(--space-2) 4px', flexShrink: 0,
              borderBottom: '1px solid var(--color-border-subtle)',
            }}>
                {inlineTags.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', flex: 1 }}>
                    {inlineTags.map(({ tag, count }) => {
                      const on = activeTag === tag;
                      return (
                        <button
                          key={tag}
                          aria-label={`Filter by #${tag}`}
                          aria-pressed={on}
                          title={`${count} note${count !== 1 ? 's' : ''} tagged #${tag}`}
                          onClick={() => setActiveTag(on ? null : tag)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                            fontSize: 11, fontWeight: 500, cursor: 'pointer',
                            padding: '2px 8px', borderRadius: 10,
                            border: `1px solid ${on ? '#64d2ff' : 'var(--color-border-subtle)'}`,
                            background: on ? 'rgba(100,210,255,0.18)' : 'transparent',
                            color: on ? '#64d2ff' : 'var(--color-text-tertiary)',
                            transition: 'all 0.12s ease',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          #{tag}
                          <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Add <span style={{ color: '#64d2ff' }}>#tags</span> in notes to filter here
                  </div>
                )}
                {/* New-from-template menu */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    aria-label="New note from template"
                    aria-expanded={showDocTemplateMenu}
                    title="New from template"
                    onClick={() => setShowDocTemplateMenu(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                      border: '1px solid var(--color-border-subtle)', background: 'transparent',
                      color: 'var(--color-text-tertiary)', transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#64d2ff'; e.currentTarget.style.borderColor = '#64d2ff'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>
                    Template
                  </button>
                  {showDocTemplateMenu && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-max)' }} onClick={() => setShowDocTemplateMenu(false)} />
                      <div role="menu" style={{
                        position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                        minWidth: 150, padding: '4px 0', borderRadius: 6,
                        background: 'var(--color-bg-elevated, rgba(35,35,35,0.98))',
                        border: '1px solid var(--color-bg-hover)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                        zIndex: 'var(--z-max)',
                      }}>
                        <div className="dex-label-caps" style={{ padding: '4px var(--space-3) 6px' }}>New from template</div>
                        {docTemplates.map(t => (
                          <div
                            key={t.id}
                            role="menuitem"
                            onClick={() => createFromDocTemplate(t.id)}
                            style={{ padding: '6px var(--space-3)', fontSize: 13, color: 'var(--color-text-primary)', cursor: 'pointer', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-border-subtle)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {t.label}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            <NoteListPanel
              notes={visibleNotes}
              selectedNoteId={selectedNoteId}
              onSelect={store.selectNote}
              onCreate={() => store.createNote()}
              onCreateFromTemplate={(id) => store.createFromTemplate(id)}
              templates={templates}
              onDelete={handleDeleteWithConfirm}
              onTogglePin={store.togglePin}
              onToggleFavorite={store.toggleFavorite}
              onSetColor={(id, color) => store.updateNote(id, { color_label: color })}
              sortField={sortField}
              sortDirection={sortDirection}
              onSortFieldChange={store.setSortField}
              onSortDirectionChange={store.setSortDirection}
              viewMode={viewMode}
              onViewModeChange={store.setViewMode}
              searchQuery={searchQuery}
              onSearchChange={store.setSearchQuery}
            />
          </div>
          {/* List resizer */}
          <div
            style={S.resizer}
            onMouseDown={listResizer.onMouseDown}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,210,255,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          />
        </>
      )}

      {/* -- Editor Area --------------------------------------------- */}
      <div style={S.editorPane} ref={editorAreaRef}>
        {activeNote ? (
          <>
            <NoteToolbar
              note={activeNote}
              editorMode={editorMode}
              onEditorModeChange={store.setEditorMode}
              onTogglePin={() => store.togglePin(activeNote.id)}
              onDuplicate={() => store.duplicateNote(activeNote.id)}
              onDelete={() => handleDeleteWithConfirm(activeNote.id)}
              onExport={(fmt) => store.exportNote(activeNote.id, fmt)}
              onToggleFocus={store.toggleFocusMode}
              onToggleLock={() => store.updateNote(activeNote.id, { locked: activeNote.locked ? 0 : 1 })}
              onColorLabel={(c) => store.updateNote(activeNote.id, { color_label: c })}
              focusMode={focusMode}
              saving={saving}
              lastSavedAt={lastSavedAt}
            saveError={saveError}
            />
            {(() => {
              // Folder breadcrumb: walk the selected folder up to the root so the
              // user always sees where the current note lives, and can jump back.
              if (!selectedFolderId) return null;
              const byId = new Map(folders.map(f => [f.id, f]));
              const path: typeof folders = [];
              let cur = byId.get(selectedFolderId);
              let guard = 0;
              while (cur && guard++ < 30) { path.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
              if (!path.length) return null;
              const crumb: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 500 };
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', padding: '6px var(--space-4) 0' }}>
                  <button style={crumb} onClick={() => store.selectFolder(null)}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>All Notes</button>
                  {path.map(f => (
                    <React.Fragment key={f.id}>
                      <span style={{ opacity: 0.4, fontSize: 11 }}>/</span>
                      <button style={crumb} onClick={() => store.selectFolder(f.id)}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>{f.name}</button>
                    </React.Fragment>
                  ))}
                </div>
              );
            })()}
            <TitleInput
              title={titleValue}
              onChange={handleTitleChange}
              readOnly={!!activeNote.locked}
            />
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <NotesEditor
                content={activeNote.content}
                onChange={handleEditorChange}
                onSave={handleSave}
                editorMode={editorMode}
                readOnly={!!activeNote.locked}
                noteTitles={noteTitles}
                onWikiLinkClick={handleWikiLinkClick}
                onDropFiles={handleDropFiles}
              />
              <FindReplace
                visible={showFindReplace}
                onClose={() => setShowFindReplace(false)}
                editorRef={editorAreaRef}
              />
              <SuggestionBar
                suggestions={wordSuggestions.suggestions}
                onSelect={(word) => {
                  // Calculate the part of the word already typed (prefix)
                  const sel = window.getSelection();
                  if (sel && sel.rangeCount > 0 && sel.anchorNode) {
                    try {
                      const range = sel.getRangeAt(0);
                      const editorEl = document.querySelector('[contenteditable="true"]');
                      if (editorEl) {
                        const preRange = document.createRange();
                        preRange.selectNodeContents(editorEl);
                        preRange.setEnd(range.startContainer, range.startOffset);
                        const textBefore = preRange.toString();
                        // Extract the partial word the user has typed
                        const match = textBefore.match(/(\w+)$/);
                        const typed = match ? match[1] : '';
                        const remaining = word.startsWith(typed.toLowerCase()) ? word.slice(typed.length) : word;
                        document.execCommand('insertText', false, remaining);
                      }
                    } catch { /* fall through */ }
                  }
                  wordSuggestions.acceptSuggestion(word);
                }}
                visible={wordSuggestions.suggestionsVisible}
                position={wordSuggestions.suggestionsPosition}
              />
            </div>
          </>
        ) : (
          <div style={S.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Select or create a note</div>
            <button
              onClick={() => { createAttempted.current = false; store.createNote(); }}
              style={{ padding: '6px var(--space-4)', background: 'var(--color-accent-light, rgba(10,132,255,0.12))', border: '1px solid var(--color-accent-soft, rgba(10,132,255,0.2))', borderRadius: 4, color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
            >New Note</button>
          </div>
        )}
      </div>

      {/* -- Right Panel (Tags, Attachments, Links) ------------------ */}
      {showRightPanel && activeNote && (
        <div className="dex-scroll-fade-y" style={S.rightPanel}>
          <div style={S.rightPanelHeader}>Note Details</div>
          <TableOfContents headings={headings} onJump={handleJumpToHeading} />
          <div style={{ height: 1, background: 'var(--color-bg-hover)' }} />
          <TagEditor
            tags={activeNote.tags}
            allTags={allTags}
            onAdd={(tag) => store.addTag(activeNote.id, tag)}
            onRemove={(tag) => store.removeTag(activeNote.id, tag)}
          />
          <div style={{ height: 1, background: 'var(--color-bg-hover)' }} />
          <AttachmentPanel
            attachments={activeNote.attachments || []}
            onAdd={handleAddAttachment}
            onRemove={store.removeAttachment}
            onOpen={store.openAttachment}
          />
          <div style={{ height: 1, background: 'var(--color-bg-hover)' }} />
          {/* Backlinks */}
          {activeNote.backlinks && activeNote.backlinks.length > 0 && (
            <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                Backlinks ({activeNote.backlinks.length})
              </div>
              {activeNote.backlinks.map(bl => (
                <div
                  key={bl.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open backlink: ${bl.source_title || 'Untitled'}`}
                  style={{
                    fontSize: 12,
                    color: '#64d2ff',
                    cursor: 'pointer',
                    padding: '3px 0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => store.selectNote(bl.source_note_id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.selectNote(bl.source_note_id); } }}
                >
                  {bl.source_title || 'Untitled'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -- Right panel toggle -------------------------------------- */}
      {activeNote && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: showRightPanel ? 248 : 8,
            zIndex: 20,
          }}
        >
          <button
            aria-label={showRightPanel ? 'Hide details panel' : 'Show details panel'}
            onClick={() => setShowRightPanel(v => !v)}
            style={{
              background: 'var(--color-bg-inset, rgba(0,0,0,0.3))',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 4,
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '4px var(--space-2)',
            }}
            title={showRightPanel ? 'Hide details' : 'Show details'}
          >
            {showRightPanel ? '>' : '<'}
          </button>
        </div>
      )}

      {/* -- Modals --------------------------------------------------- */}
      <TemplateSelector
        templates={templates}
        onSelect={(id) => store.createFromTemplate(id)}
        onClose={() => setShowTemplates(false)}
        visible={showTemplates}
      />
      <NoteStats
        stats={stats}
        visible={showStats}
        onClose={() => setShowStats(false)}
      />

      {/* Delete Confirmation Dialog */}
      {confirmDeleteId && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-max)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)',
        }} onClick={cancelDelete}>
          <div style={{
            background: 'var(--color-bg-elevated)', borderRadius: 10,
            padding: 'var(--space-6) 28px', maxWidth: 340, width: '90%',
            border: '1px solid var(--color-border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' }}>
              Move to Trash?
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)', lineHeight: 1.5 }}>
              &ldquo;{notes.find(n => n.id === confirmDeleteId)?.title || 'Untitled'}&rdquo; will be moved to Trash and automatically deleted after 30 days.
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <button onClick={cancelDelete} style={{
                padding: '7px var(--space-4)', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                background: 'var(--color-border-subtle)', color: 'var(--color-text-primary)', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={confirmDelete} style={{
                padding: '7px var(--space-4)', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                background: 'rgba(255,69,58,0.2)', color: 'var(--color-error)', cursor: 'pointer',
              }}>Move to Trash</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Toast */}
      {deleteToast?.visible && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 'var(--z-notification)', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px var(--space-4)', borderRadius: 10,
          background: 'var(--color-bg-surface-solid, #2C2C2E)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--pg-shadow-panel)',
          fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'nowrap',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>&ldquo;{deleteToast.title}&rdquo; moved to Trash</span>
        </div>
      )}
    </div>
  );
};

DexNotes.displayName = 'DexNotes';

export default memo(DexNotes);
