/**
 * DEX Bookmark Manager
 * Save, organize, and search website bookmarks
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useMemo, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description: string;
  favicon: string;
  tags: string[];
  folder: string;
  createdAt: number;
  visitCount: number;
  lastVisited: number | null;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface BookmarkManagerState {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-bookmarks';

function loadState(): BookmarkManagerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    bookmarks: [],
    folders: [
      { id: 'general', name: 'General', icon: 'B', color: '#3b82f6' },
      { id: 'work', name: 'Work', icon: 'W', color: '#10b981' },
      { id: 'learning', name: 'Learning', icon: 'L', color: '#8b5cf6' },
      { id: 'news', name: 'News', icon: 'N', color: '#f59e0b' },
      { id: 'tools', name: 'Tools', icon: 'T', color: '#ef4444' },
    ],
  };
}

function saveState(state: BookmarkManagerState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BookmarkManager: React.FC<{ onOpenUrl?: (url: string) => void; onClose?: () => void }> = memo(({ onOpenUrl, onClose }) => {
  const [state, setState] = useState<BookmarkManagerState>(loadState);
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formFolder, setFormFolder] = useState('general');
  const [sortBy, setSortBy] = useState<'recent' | 'alpha' | 'visits'>('recent');

  const persist = useCallback((s: BookmarkManagerState) => { setState(s); saveState(s); }, []);

  const filtered = useMemo(() => {
    let list = state.bookmarks;
    if (activeFolder) list = list.filter(b => b.folder === activeFolder);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    if (sortBy === 'alpha') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'visits') list = [...list].sort((a, b) => b.visitCount - a.visitCount);
    else list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [state.bookmarks, activeFolder, search, sortBy]);

  const resetForm = useCallback(() => {
    setFormTitle(''); setFormUrl(''); setFormDesc(''); setFormTags(''); setFormFolder('general');
    setShowAdd(false); setEditId(null);
  }, []);

  const addBookmark = useCallback(() => {
    if (!formUrl.trim()) return;
    const url = formUrl.startsWith('http') ? formUrl.trim() : `https://${formUrl.trim()}`;
    const bookmark: Bookmark = {
      id: editId || `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: formTitle.trim() || new URL(url).hostname,
      url,
      description: formDesc.trim(),
      favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`,
      tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      folder: formFolder,
      createdAt: editId ? (state.bookmarks.find(b => b.id === editId)?.createdAt || Date.now()) : Date.now(),
      visitCount: editId ? (state.bookmarks.find(b => b.id === editId)?.visitCount || 0) : 0,
      lastVisited: editId ? (state.bookmarks.find(b => b.id === editId)?.lastVisited || null) : null,
    };
    if (editId) {
      persist({ ...state, bookmarks: state.bookmarks.map(b => b.id === editId ? bookmark : b) });
    } else {
      persist({ ...state, bookmarks: [bookmark, ...state.bookmarks] });
    }
    resetForm();
  }, [formTitle, formUrl, formDesc, formTags, formFolder, editId, state, persist, resetForm]);

  const deleteBookmark = useCallback((id: string) => {
    persist({ ...state, bookmarks: state.bookmarks.filter(b => b.id !== id) });
  }, [state, persist]);

  const visitBookmark = useCallback((bookmark: Bookmark) => {
    persist({
      ...state,
      bookmarks: state.bookmarks.map(b => b.id === bookmark.id
        ? { ...b, visitCount: b.visitCount + 1, lastVisited: Date.now() }
        : b),
    });
    if (onOpenUrl) onOpenUrl(bookmark.url);
  }, [state, persist, onOpenUrl]);

  const startEdit = useCallback((b: Bookmark) => {
    setEditId(b.id);
    setFormTitle(b.title);
    setFormUrl(b.url);
    setFormDesc(b.description);
    setFormTags(b.tags.join(', '));
    setFormFolder(b.folder);
    setShowAdd(true);
  }, []);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Bookmarks</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{state.bookmarks.length} saved</p>
        </div>
        <button onClick={() => { resetForm(); setShowAdd(!showAdd); }} style={styles.addBtn}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Search + Sort */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search bookmarks..." style={{ ...styles.searchInput, flex: 1 }} aria-label="Search bookmarks" />
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={styles.sortSelect} aria-label="Sort by">
          <option value="recent">Recent</option>
          <option value="alpha">A-Z</option>
          <option value="visits">Most visited</option>
        </select>
      </div>

      {/* Folders */}
      <div style={styles.folderRow}>
        <button onClick={() => setActiveFolder(null)}
          style={{ ...styles.folderChip, ...(activeFolder === null ? styles.folderChipActive : {}) }}>
          All
        </button>
        {state.folders.map(f => (
          <button key={f.id} onClick={() => setActiveFolder(f.id)}
            style={{ ...styles.folderChip, ...(activeFolder === f.id ? styles.folderChipActive : {}) }}>
            {f.name}
          </button>
        ))}
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <div style={styles.addForm}>
          <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
            placeholder="Title" style={styles.input} aria-label="Bookmark title" />
          <input type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)}
            placeholder="URL (https://...)" style={styles.input} aria-label="URL" />
          <input type="text" value={formDesc} onChange={e => setFormDesc(e.target.value)}
            placeholder="Description (optional)" style={styles.input} aria-label="Description" />
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" value={formTags} onChange={e => setFormTags(e.target.value)}
              placeholder="Tags (comma separated)" style={{ ...styles.input, flex: 1 }} aria-label="Tags" />
            <select value={formFolder} onChange={e => setFormFolder(e.target.value)} style={styles.sortSelect} aria-label="Folder">
              {state.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <button onClick={addBookmark} disabled={!formUrl.trim()} style={styles.saveBtn}>
            {editId ? 'Update' : 'Save Bookmark'}
          </button>
        </div>
      )}

      {/* Bookmark list */}
      <div style={styles.bookmarkList}>
        {filtered.length === 0 ? (
          <div style={styles.emptyState}>{search ? 'No matching bookmarks' : 'No bookmarks yet. Add one to get started.'}</div>
        ) : (
          filtered.map(b => (
            <div key={b.id} style={styles.bookmarkCard}>
              <div style={styles.bookmarkMain} onClick={() => visitBookmark(b)} role="link" tabIndex={0} aria-label={`Open ${b.title}`}>
                <img src={b.favicon} alt="" width={16} height={16} style={{ borderRadius: 3, flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.bookmarkTitle}>{b.title}</div>
                  <div style={styles.bookmarkUrl}>{b.url}</div>
                  {b.description && <div style={styles.bookmarkDesc}>{b.description}</div>}
                  {b.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {b.tags.map(tag => <span key={tag} style={styles.tagBadge}>{tag}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div style={styles.bookmarkActions}>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{b.visitCount}x</span>
                <button onClick={() => startEdit(b)} style={styles.actionBtn} aria-label="Edit">Edit</button>
                <button onClick={() => deleteBookmark(b.id)} style={{ ...styles.actionBtn, color: '#ef4444' }} aria-label="Delete">Del</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

BookmarkManager.displayName = 'BookmarkManager';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto', gap: 10 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  addBtn: { padding: '6px 12px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  searchInput: { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, outline: 'none', fontFamily: 'inherit' },
  sortSelect: { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 11, outline: 'none' },
  folderRow: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  folderChip: { padding: '3px 10px', borderRadius: 12, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  folderChipActive: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderColor: '#3b82f6' },
  addForm: { display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  input: { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, fontFamily: 'inherit', outline: 'none' },
  saveBtn: { padding: '8px 0', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  bookmarkList: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  bookmarkCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'background 0.1s' },
  bookmarkMain: { display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 },
  bookmarkTitle: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  bookmarkUrl: { fontSize: 10, color: '#3b82f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  bookmarkDesc: { fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  tagBadge: { fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  bookmarkActions: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  actionBtn: { fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: 30, fontSize: 13, color: 'var(--color-text-muted)' },
};

export default BookmarkManager;
