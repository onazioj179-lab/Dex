/**
 * NOTES - macOS Notes Style App
 * Clean, minimal note-taking with proper organization
 * Connected to real file system via NotesSystem backend
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import DOMPurify from 'dompurify';
import { useAppTracking } from '../services/usePatternLearning';

// ===============================================================================
// TYPES
// ===============================================================================

interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  folderId?: string;
  created: Date;
  modified: Date;
  createdAt?: number;
  updatedAt?: number;
  pinned: boolean;
  status?: 'active' | 'archived' | 'trashed';
  tags?: string[];
}

interface Folder {
  id: string;
  name: string;
  icon: string;
  count: number;
}

// Save status indicator
type SaveStatus = 'saved' | 'saving' | 'error';

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  allNotes: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  ),
  pin: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 4v4l2 2v2l-4.5-1.5-4.5 1.5V10l2-2V4h5zm0-2h-5c-1.1 0-2 .9-2 2v3.17l-.83.83c-.38.38-.59.89-.59 1.41V12c0 .55.45 1 1 1h3l-3 8h2l3-8h3c.55 0 1-.45 1-1V9.41c0-.52-.21-1.03-.59-1.41L16 7.17V4c0-1.1-.9-2-2-2z"/>
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  format: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_FOLDERS: Folder[] = [
  { id: 'all', name: 'All Notes', icon: 'allNotes', count: 0 },
  { id: 'personal', name: 'Personal', icon: 'folder', count: 0 },
  { id: 'work', name: 'Work', icon: 'folder', count: 0 },
  { id: 'ideas', name: 'Ideas', icon: 'folder', count: 0 },
];

// ═══════════════════════════════════════════════════════════════════════════
// DATA PERSISTENCE - Real File System via IPC
// ═══════════════════════════════════════════════════════════════════════════

const loadNotesFromBackend = async (): Promise<Note[]> => {
  try {
    if (window.electron?.invoke) {
      const backendNotes = await window.electron.invoke('notes:list', { status: 'active' });
      if (backendNotes && Array.isArray(backendNotes)) {
        return backendNotes.map((n: { id: string; title?: string; content?: string; folderId?: string; createdAt?: number; updatedAt?: number; pinned?: boolean; tags?: string[] }) => ({
          id: n.id,
          title: n.title || 'Untitled',
          content: n.content || '',
          folder: n.folderId || 'personal',
          folderId: n.folderId,
          created: new Date(n.createdAt || Date.now()),
          modified: new Date(n.updatedAt || Date.now()),
          pinned: n.pinned || false,
          tags: n.tags || [],
        }));
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Notes] Backend unavailable, using localStorage');
  }
  // Fallback to localStorage
  return loadNotesFromStorage();
};

const loadNotesFromStorage = (): Note[] => {
  try {
    const saved = localStorage.getItem('dex-notes');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((n: Omit<Note, 'created' | 'modified'> & { created: string; modified: string }) => ({
        ...n,
        created: new Date(n.created),
        modified: new Date(n.modified),
      }));
    }
  } catch { /* localStorage unavailable */ }
  return [];
};

const saveNoteToBackend = async (note: Note): Promise<boolean> => {
  try {
    if (window.electron?.invoke) {
      await window.electron.invoke('notes:update', note.id, {
        title: note.title,
        content: note.content,
        folderId: note.folder,
        pinned: note.pinned,
      });
      return true;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Notes] Backend save failed, using localStorage');
  }
  return false;
};

const createNoteInBackend = async (note: Partial<Note>): Promise<Note | null> => {
  try {
    if (window.electron?.invoke) {
      const created = await window.electron.invoke('notes:create', {
        title: note.title || 'New Note',
        content: note.content || '',
        folderId: note.folder,
        type: 'markdown',
      });
      if (created) {
        return {
          id: created.id,
          title: created.title,
          content: created.content,
          folder: created.folderId || 'personal',
          created: new Date(created.createdAt),
          modified: new Date(created.updatedAt),
          pinned: created.pinned || false,
        };
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Notes] Backend create failed');
  }
  return null;
};

const deleteNoteFromBackend = async (noteId: string): Promise<boolean> => {
  try {
    if (window.electron?.invoke) {
      await window.electron.invoke('notes:delete', noteId);
      return true;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Notes] Backend delete failed');
  }
  return false;
};

const saveNotesToStorage = (notes: Note[]) => {
  localStorage.setItem('dex-notes', JSON.stringify(notes));
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const Notes: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('notes');

  const [notes, setNotes] = useState<Note[]>([]);
  const [folders] = useState<Folder[]>(DEFAULT_FOLDERS);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isLoading, setIsLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  // Formatting helpers - insert markdown syntax around selection
  const insertFormat = useCallback((prefix: string, suffix: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = editContent.substring(start, end);
    const before = editContent.substring(0, start);
    const after = editContent.substring(end);
    const newText = `${before}${prefix}${selected}${suffix || prefix}${after}`;
    setEditContent(newText);
    // Restore cursor after insertion
    setTimeout(() => {
      ta.focus();
      const newPos = start + prefix.length + selected.length + (suffix || prefix).length;
      ta.selectionStart = start + prefix.length;
      ta.selectionEnd = start + prefix.length + selected.length;
    }, 0);
  }, [editContent]);

  const insertLinePrefix = useCallback((prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    // Find the beginning of the current line
    const lineStart = editContent.lastIndexOf('\n', start - 1) + 1;
    const before = editContent.substring(0, lineStart);
    const after = editContent.substring(lineStart);
    const newText = `${before}${prefix}${after}`;
    setEditContent(newText);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + prefix.length;
    }, 0);
  }, [editContent]);

  // Simple markdown to HTML renderer for preview
  const renderMarkdown = useCallback((text: string): string => {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:600;margin:12px 0 4px">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:600;margin:12px 0 4px">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size:22px;font-weight:700;margin:12px 0 4px">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:3px;font-family:monospace;font-size:13px">$1</code>')
      .replace(/^- (.+)$/gm, '<li style="margin-left:16px">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal">$2</li>')
      .replace(/\n/g, '<br/>');
  }, []);

  // Load notes from backend on mount
  useEffect(() => {
    const loadNotes = async () => {
      setIsLoading(true);
      const loadedNotes = await loadNotesFromBackend();
      setNotes(loadedNotes);
      setIsLoading(false);
    };
    loadNotes();
  }, []);

  // Also save to localStorage as backup
  useEffect(() => {
    if (notes.length > 0) {
      saveNotesToStorage(notes);
    }
  }, [notes]);

  useEffect(() => {
    if (selectedNote) {
      setEditContent(selectedNote.content);
      setEditTitle(selectedNote.title);
    }
  }, [selectedNote]);

  const filteredNotes = useMemo(() => notes.filter(note => {
    const matchesFolder = selectedFolder === 'all' || note.folder === selectedFolder;
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  }), [notes, selectedFolder, searchQuery]);

  const sortedNotes = useMemo(() => [...filteredNotes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.modified.getTime() - a.modified.getTime();
  }), [filteredNotes]);

  const createNote = async () => {
    const noteData = {
      title: 'New Note',
      content: '',
      folder: selectedFolder === 'all' ? 'personal' : selectedFolder,
    };
    
    // Try to create in backend first
    const backendNote = await createNoteInBackend(noteData);
    
    const newNote: Note = backendNote || {
      id: Date.now().toString(),
      title: 'New Note',
      content: '',
      folder: selectedFolder === 'all' ? 'personal' : selectedFolder,
      created: new Date(),
      modified: new Date(),
      pinned: false,
    };
    
    setNotes([newNote, ...notes]);
    setSelectedNote(newNote);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'notesCreated', amount: 1 } }));
  };

  const updateNote = async () => {
    if (!selectedNote) return;
    
    setSaveStatus('saving');
    
    const updatedNote = { 
      ...selectedNote, 
      title: editTitle, 
      content: editContent, 
      modified: new Date() 
    };
    
    // Save to backend
    const savedToBackend = await saveNoteToBackend(updatedNote);
    
    // Update local state
    const updated = notes.map(n => 
      n.id === selectedNote.id ? updatedNote : n
    );
    setNotes(updated);
    setSelectedNote(updatedNote);
    
    setSaveStatus(savedToBackend ? 'saved' : 'error');
    
    // Reset status after delay — store ref for cleanup
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('saved'), 2000);
  };

  const deleteNote = async () => {
    if (!selectedNote) return;
    
    // Delete from backend
    await deleteNoteFromBackend(selectedNote.id);
    
    // Update local state
    const remaining = notes.filter(n => n.id !== selectedNote.id);
    setNotes(remaining);
    setSelectedNote(remaining[0] || null);
  };

  const togglePin = async () => {
    if (!selectedNote) return;
    
    const newPinned = !selectedNote.pinned;
    
    // Update backend
    try {
      if (window.electron?.invoke) {
        await window.electron.invoke('notes:pin', selectedNote.id, newPinned);
      }
    } catch { /* IPC unavailable */ }
    
    // Update local state
    const updated = notes.map(n => 
      n.id === selectedNote.id ? { ...n, pinned: newPinned } : n
    );
    setNotes(updated);
    setSelectedNote({ ...selectedNote, pinned: newPinned });
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getPreview = (content: string): string => {
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(0, 2).join(' ').substring(0, 80) || 'No content';
  };

  return (
    <div style={styles.container}>
      {/* Sidebar - Folders */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Notes</span>
        </div>
        
        <div style={styles.folderList}>
          {folders.map(folder => (
            <button
              key={folder.id}
              aria-label={`Select ${folder.name} folder`}
              style={{
                ...styles.folderItem,
                background: selectedFolder === folder.id ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: selectedFolder === folder.id ? '#0a84ff' : 'rgba(255,255,255,0.85)',
              }}
              onClick={() => setSelectedFolder(folder.id)}
            >
              {folder.id === 'all' ? Icons.allNotes : Icons.folder}
              <span style={{ flex: 1 }}>{folder.name}</span>
              <span style={styles.folderCount}>{folder.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Note List */}
      <div style={styles.noteList}>
        <div style={styles.noteListHeader}>
          <div style={styles.searchBox}>
            {Icons.search}
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <button style={styles.addBtn} onClick={createNote} aria-label="Create new note">
            {Icons.plus}
          </button>
        </div>
        
        <div style={styles.noteItems}>
          {sortedNotes.map(note => (
            <div
              key={note.id}
              style={{
                ...styles.noteItem,
                background: selectedNote?.id === note.id ? 'rgba(10, 132, 255, 0.15)' : 'transparent',
                borderLeft: selectedNote?.id === note.id ? '3px solid #0a84ff' : '3px solid transparent',
              }}
              onClick={() => setSelectedNote(note)}
            >
              <div style={styles.noteItemHeader}>
                <span style={styles.noteItemTitle}>{note.title}</span>
                {note.pinned && <span style={styles.pinIcon}>{Icons.pin}</span>}
              </div>
              <div style={styles.noteItemMeta}>
                <span>{formatDate(note.modified)}</span>
                <span style={styles.noteItemPreview}>{getPreview(note.content)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div style={styles.editor}>
        {selectedNote ? (
          <>
            <div style={styles.editorToolbar}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={updateNote}
                style={styles.titleInput}
                placeholder="Note title"
              />
              <div style={styles.editorActions}>
                <button 
                  style={{...styles.toolbarBtn, color: selectedNote.pinned ? '#ffd60a' : 'rgba(255,255,255,0.6)'}} 
                  onClick={togglePin}
                  title="Pin note"
                >
                  {Icons.pin}
                </button>
                <button style={styles.toolbarBtn} onClick={deleteNote} title="Delete note">
                  {Icons.trash}
                </button>
              </div>
            </div>
            
            <div style={styles.editorMeta}>
              <span>Modified {formatDate(selectedNote.modified)}</span>
              <span style={{
                ...styles.saveIndicator,
                color: saveStatus === 'saving' ? '#ff9f0a' : saveStatus === 'error' ? '#ff453a' : '#30d158',
              }}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
              </span>
            </div>

            {/* Formatting Toolbar */}
            <div style={styles.formatToolbar}>
              <button style={styles.formatBtn} onClick={() => insertFormat('**')} title="Bold (Ctrl+B)">
                <strong>B</strong>
              </button>
              <button style={styles.formatBtn} onClick={() => insertFormat('*')} title="Italic (Ctrl+I)">
                <em>I</em>
              </button>
              <button style={styles.formatBtn} onClick={() => insertLinePrefix('# ')} title="Heading 1">
                H1
              </button>
              <button style={styles.formatBtn} onClick={() => insertLinePrefix('## ')} title="Heading 2">
                H2
              </button>
              <button style={styles.formatBtn} onClick={() => insertLinePrefix('### ')} title="Heading 3">
                H3
              </button>
              <button style={styles.formatBtn} onClick={() => insertLinePrefix('- ')} title="Bullet List">
                • List
              </button>
              <button style={styles.formatBtn} onClick={() => insertFormat('`')} title="Inline Code">
                {'</>'}
              </button>
              <button style={styles.formatBtn} onClick={() => insertFormat('\n```\n', '\n```\n')} title="Code Block">
                {'{ }'}
              </button>
              <div style={{ flex: 1 }} />
              <button
                style={{...styles.formatBtn, background: previewMode ? 'rgba(10,132,255,0.25)' : undefined, color: previewMode ? '#0a84ff' : undefined}}
                onClick={() => setPreviewMode(!previewMode)}
                title="Toggle Preview"
              >
                {previewMode ? 'Edit' : 'Preview'}
              </button>
            </div>
            
            {previewMode ? (
              <div
                style={{...styles.contentArea, overflow: 'auto', cursor: 'default'}}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(editContent)) }}
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onBlur={updateNote}
                onKeyDown={(e) => {
                  // Ctrl+B = bold, Ctrl+I = italic
                  if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'b') { e.preventDefault(); insertFormat('**'); }
                    if (e.key === 'i') { e.preventDefault(); insertFormat('*'); }
                  }
                }}
                style={styles.contentArea}
                placeholder="Start writing... (Supports Markdown)"
              />
            )}
          </>
        ) : (
          <div style={styles.noNote}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ffd60a" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ marginTop: '16px' }}>Select a note or create a new one</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '13px',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  
  // Sidebar
  sidebar: {
    width: '180px',
    background: 'var(--color-bg-secondary)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  sidebarTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  folderList: {
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  folderItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  folderCount: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  
  // Note List
  noteList: {
    width: '280px',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-secondary)',
  },
  noteListHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    borderBottom: '1px solid var(--color-border)',
  },
  searchBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--color-bg-hover)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-accent)',
    color: 'var(--color-accent-text)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  noteItems: {
    flex: 1,
    overflow: 'auto',
  },
  noteItem: {
    padding: '12px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--color-border-subtle)',
    transition: 'background 0.1s',
  },
  noteItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  noteItemTitle: {
    flex: 1,
    fontWeight: 500,
    fontSize: '14px',
    color: 'var(--color-text-primary)',
  },
  pinIcon: {
    color: 'var(--color-warning)',
  },
  noteItemMeta: {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  noteItemPreview: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  
  // Editor
  editor: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-base)',
  },
  editorToolbar: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid var(--color-border)',
    gap: '12px',
  },
  titleInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '20px',
    fontWeight: 600,
    outline: 'none',
  },
  editorActions: {
    display: 'flex',
    gap: '8px',
  },
  toolbarBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-bg-glass)',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  editorMeta: {
    padding: '8px 20px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saveIndicator: {
    fontSize: '11px',
    fontWeight: 500,
    padding: '2px 8px',
    background: 'var(--color-bg-glass)',
    borderRadius: '4px',
  },
  contentArea: {
    flex: 1,
    padding: '20px',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    lineHeight: 1.6,
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit',
  },
  formatToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 20px',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-secondary)',
  },
  formatBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '28px',
    padding: '0 10px',
    borderRadius: '5px',
    border: 'none',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  noNote: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },
};

Notes.displayName = 'Notes';
export default memo(Notes);
