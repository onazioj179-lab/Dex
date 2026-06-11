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
import { useNotesStore } from '../../store/notesStore';
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
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
    padding: '10px 12px 8px',
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
    padding: '10px 12px',
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

  useEffect(() => {
    setWidth(initialWidth);
  }, [initialWidth]);

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
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
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
    selectedFolderId, selectedNoteId, searchQuery,
    sortField, sortDirection, viewMode, editorMode, focusMode,
    sidebarCollapsed, listCollapsed, paneSize,
    loading, saving, searching,
  } = store;

  // -- Refs -------------------------------------------------------------

  const editorAreaRef = useRef<HTMLDivElement>(null);

  // -- State ------------------------------------------------------------

  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [titleValue, setTitleValue] = useState('');
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
    if (loading || initFailed) return;
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
      setLastSavedAt(Date.now());
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
            The better-sqlite3 module may need to be rebuilt for this Electron version.
          </div>
          <button
            onClick={() => { setInitFailed(false); createAttempted.current = false; store.initialize(); }}
            style={{ padding: '6px 16px', background: 'rgba(10,132,255,0.15)', border: '1px solid rgba(10,132,255,0.3)', borderRadius: 4, color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
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
        .dexnotes-app .dn-footer button:hover { background: rgba(10,132,255,0.12) !important; color: #0a84ff !important; }
        .dexnotes-app .dn-tree-acts:hover { opacity: 1 !important; }
        .dexnotes-app .dn-tree-acts button:hover { background: rgba(255,255,255,0.08) !important; border-radius: 3px; }
        .dexnotes-app .dn-swatch { transition: transform 0.12s ease; }
        .dexnotes-app .dn-swatch:hover { transform: scale(1.15); }
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
            <div style={S.sidebarBody}>
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
            paddingTop: 12,
            gap: 8,
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
            <NoteListPanel
              notes={notes}
              selectedNoteId={selectedNoteId}
              onSelect={store.selectNote}
              onCreate={() => store.createNote()}
              onDelete={handleDeleteWithConfirm}
              onTogglePin={store.togglePin}
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
            />
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
              style={{ padding: '6px 16px', background: 'rgba(10,132,255,0.12)', border: '1px solid rgba(10,132,255,0.2)', borderRadius: 4, color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
            >New Note</button>
          </div>
        )}
      </div>

      {/* -- Right Panel (Tags, Attachments, Links) ------------------ */}
      {showRightPanel && activeNote && (
        <div style={S.rightPanel}>
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
            <div style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                Backlinks ({activeNote.backlinks.length})
              </div>
              {activeNote.backlinks.map(bl => (
                <div
                  key={bl.id}
                  style={{
                    fontSize: 12,
                    color: '#64d2ff',
                    cursor: 'pointer',
                    padding: '3px 0',
                  }}
                  onClick={() => store.selectNote(bl.source_note_id)}
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
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 3,
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '4px 8px',
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
            background: 'rgba(44,44,46,0.96)', borderRadius: 10,
            padding: '24px 28px', maxWidth: 340, width: '90%',
            border: '1px solid var(--color-border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e5e5ea', marginBottom: 8 }}>
              Move to Trash?
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
              &ldquo;{notes.find(n => n.id === confirmDeleteId)?.title || 'Untitled'}&rdquo; will be moved to Trash and automatically deleted after 30 days.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={cancelDelete} style={{
                padding: '7px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                background: 'var(--color-border-subtle)', color: '#e5e5ea', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={confirmDelete} style={{
                padding: '7px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
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
          padding: '10px 16px', borderRadius: 8,
          background: 'var(--color-bg-surface-solid, #2C2C2E)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--pg-shadow-panel)',
          fontSize: 13, color: '#e5e5ea', whiteSpace: 'nowrap',
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
