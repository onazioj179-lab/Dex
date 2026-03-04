/**
 * DEX Snippet Manager
 * Store, organize, and quickly insert reusable text/code snippets
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface Snippet {
  id: string;
  title: string;
  content: string;
  language: string;
  tags: string[];
  folder: string;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  isFavorite: boolean;
}

export interface SnippetFolder {
  id: string;
  name: string;
  color: string;
}

export interface SnippetManagerState {
  snippets: Snippet[];
  folders: SnippetFolder[];
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-snippets';

function loadState(): SnippetManagerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    snippets: [],
    folders: [
      { id: 'general', name: 'General', color: '#3b82f6' },
      { id: 'code', name: 'Code', color: '#10b981' },
      { id: 'templates', name: 'Templates', color: '#8b5cf6' },
    ],
  };
}

function saveState(state: SnippetManagerState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ============================================================================
// LANGUAGES
// ============================================================================

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'html', 'css', 'json',
  'markdown', 'bash', 'sql', 'yaml', 'xml', 'java', 'csharp', 'go', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'dart',
];

// ============================================================================
// COMPONENT
// ============================================================================

export const SnippetManager: React.FC<{ onClose?: () => void }> = memo(({ onClose }) => {
  const [state, setState] = useState<SnippetManagerState>(loadState);
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editLanguage, setEditLanguage] = useState('plaintext');
  const [editTags, setEditTags] = useState('');
  const [editFolder, setEditFolder] = useState('general');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const persist = useCallback((s: SnippetManagerState) => { setState(s); saveState(s); }, []);

  const filteredSnippets = useMemo(() => {
    let list = state.snippets;
    if (activeFolder) list = list.filter(s => s.folder === activeFolder);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.language.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.snippets, activeFolder, search]);

  const selected = state.snippets.find(s => s.id === selectedId);

  const createSnippet = useCallback(() => {
    const id = `snip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const snippet: Snippet = {
      id, title: 'New Snippet', content: '', language: 'plaintext',
      tags: [], folder: activeFolder || 'general',
      createdAt: Date.now(), updatedAt: Date.now(), usageCount: 0, isFavorite: false,
    };
    persist({ ...state, snippets: [snippet, ...state.snippets] });
    setSelectedId(id);
    setEditMode(true);
    setEditTitle(snippet.title);
    setEditContent('');
    setEditLanguage('plaintext');
    setEditTags('');
    setEditFolder(snippet.folder);
  }, [state, activeFolder, persist]);

  const saveEdit = useCallback(() => {
    if (!selectedId) return;
    persist({
      ...state,
      snippets: state.snippets.map(s =>
        s.id === selectedId ? {
          ...s,
          title: editTitle.trim() || 'Untitled',
          content: editContent,
          language: editLanguage,
          tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
          folder: editFolder,
          updatedAt: Date.now(),
        } : s
      ),
    });
    setEditMode(false);
  }, [selectedId, state, editTitle, editContent, editLanguage, editTags, editFolder, persist]);

  const deleteSnippet = useCallback((id: string) => {
    persist({ ...state, snippets: state.snippets.filter(s => s.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }, [state, selectedId, persist]);

  const toggleFavorite = useCallback((id: string) => {
    persist({
      ...state,
      snippets: state.snippets.map(s => s.id === id ? { ...s, isFavorite: !s.isFavorite } : s),
    });
  }, [state, persist]);

  const copyToClipboard = useCallback((content: string, id: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopyFeedback(id);
      setTimeout(() => setCopyFeedback(null), 1500);
      // Track usage
      persist({
        ...state,
        snippets: state.snippets.map(s => s.id === id ? { ...s, usageCount: s.usageCount + 1 } : s),
      });
    });
  }, [state, persist]);

  const startEdit = useCallback((snippet: Snippet) => {
    setSelectedId(snippet.id);
    setEditMode(true);
    setEditTitle(snippet.title);
    setEditContent(snippet.content);
    setEditLanguage(snippet.language);
    setEditTags(snippet.tags.join(', '));
    setEditFolder(snippet.folder);
  }, []);

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Snippets</h3>
          <button onClick={createSnippet} style={styles.addBtn} aria-label="Create snippet" title="New Snippet">+</button>
        </div>

        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search snippets..." style={styles.searchInput} aria-label="Search snippets"
        />

        <div style={styles.folderList}>
          <button onClick={() => setActiveFolder(null)}
            style={{ ...styles.folderBtn, ...(activeFolder === null ? styles.folderBtnActive : {}) }}
            aria-label="All snippets" aria-pressed={activeFolder === null}>
            All ({state.snippets.length})
          </button>
          <button onClick={() => setActiveFolder('__favorites')}
            style={{ ...styles.folderBtn, ...(activeFolder === '__favorites' ? styles.folderBtnActive : {}) }}
            aria-label="Favorites" aria-pressed={activeFolder === '__favorites'}>
            Favorites ({state.snippets.filter(s => s.isFavorite).length})
          </button>
          {state.folders.map(f => (
            <button key={f.id} onClick={() => setActiveFolder(f.id)}
              style={{ ...styles.folderBtn, ...(activeFolder === f.id ? styles.folderBtnActive : {}) }}
              aria-label={`Folder: ${f.name}`} aria-pressed={activeFolder === f.id}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
              {f.name} ({state.snippets.filter(s => s.folder === f.id).length})
            </button>
          ))}
        </div>

        <div style={styles.snippetList}>
          {filteredSnippets.map(s => (
            <div key={s.id} onClick={() => { setSelectedId(s.id); setEditMode(false); }}
              style={{ ...styles.snippetItem, ...(selectedId === s.id ? styles.snippetItemActive : {}) }}
              role="option" aria-selected={selectedId === s.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={styles.snippetTitle}>{s.title}</span>
                {s.isFavorite && <span style={{ color: '#ffd60a', fontSize: 10 }}>*</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={styles.langBadge}>{s.language}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{s.usageCount}x</span>
              </div>
            </div>
          ))}
          {filteredSnippets.length === 0 && (
            <div style={styles.emptyState}>
              {search ? 'No matching snippets' : 'No snippets yet. Click + to create one.'}
            </div>
          )}
        </div>
      </div>

      {/* Detail pane */}
      <div style={styles.detail}>
        {selected && !editMode ? (
          <>
            <div style={styles.detailHeader}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selected.title}</h2>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={styles.langBadge}>{selected.language}</span>
                  {selected.tags.map(tag => (
                    <span key={tag} style={styles.tagBadge}>{tag}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => copyToClipboard(selected.content, selected.id)} style={styles.actionBtn} aria-label="Copy snippet">
                  {copyFeedback === selected.id ? 'Copied' : 'Copy'}
                </button>
                <button onClick={() => startEdit(selected)} style={styles.actionBtn} aria-label="Edit snippet">Edit</button>
                <button onClick={() => toggleFavorite(selected.id)} style={styles.actionBtn} aria-label="Toggle favorite">
                  {selected.isFavorite ? 'Unfav' : 'Fav'}
                </button>
                <button onClick={() => deleteSnippet(selected.id)} style={{ ...styles.actionBtn, color: '#ef4444' }} aria-label="Delete snippet">
                  Del
                </button>
              </div>
            </div>
            <pre style={styles.codeBlock}>{selected.content || '(empty snippet)'}</pre>
            <div style={styles.meta}>
              Created {new Date(selected.createdAt).toLocaleDateString()} | Used {selected.usageCount} times
            </div>
          </>
        ) : editMode && selectedId ? (
          <div style={styles.editForm}>
            <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
              placeholder="Snippet title" style={styles.editInput} aria-label="Snippet title" />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={editLanguage} onChange={e => setEditLanguage(e.target.value)} style={styles.editSelect} aria-label="Language">
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={editFolder} onChange={e => setEditFolder(e.target.value)} style={styles.editSelect} aria-label="Folder">
                {state.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
              placeholder="Paste or type your snippet here..." style={styles.editTextarea}
              aria-label="Snippet content" rows={15} spellCheck={false} />
            <input type="text" value={editTags} onChange={e => setEditTags(e.target.value)}
              placeholder="Tags (comma separated)" style={styles.editInput} aria-label="Tags" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveEdit} style={{ ...styles.actionBtn, background: '#3b82f6', color: '#fff' }}>Save</button>
              <button onClick={() => setEditMode(false)} style={styles.actionBtn}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={styles.emptyDetail}>
            <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 12 }}>{'{}'}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Select a snippet</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Choose a snippet from the sidebar or create a new one
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

SnippetManager.displayName = 'SnippetManager';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', height: '100%', overflow: 'hidden' },
  sidebar: { width: 260, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(0,0,0,0.1)' },
  sidebarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 12px 8px' },
  addBtn: { width: 24, height: 24, borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  searchInput: { margin: '0 12px 8px', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, outline: 'none', fontFamily: 'inherit' },
  folderList: { display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px 8px' },
  folderBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  folderBtnActive: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  snippetList: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' },
  snippetItem: { padding: '8px 10px', borderRadius: 6, cursor: 'pointer', transition: 'background 0.1s' },
  snippetItemActive: { background: 'rgba(59,130,246,0.12)' },
  snippetTitle: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  langBadge: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' },
  tagBadge: { fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  detail: { flex: 1, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  actionBtn: { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  codeBlock: { flex: 1, margin: 0, padding: 16, borderRadius: 10, background: 'rgba(0,0,0,0.3)', fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 13, lineHeight: 1.6, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text-primary)' },
  meta: { marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' },
  editForm: { display: 'flex', flexDirection: 'column', gap: 10 },
  editInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 13, fontFamily: 'inherit', outline: 'none' },
  editSelect: { flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, fontFamily: 'inherit', outline: 'none' },
  editTextarea: { padding: 12, borderRadius: 10, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(0,0,0,0.2)', color: 'inherit', fontSize: 13, fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.6, resize: 'vertical', outline: 'none' },
  emptyState: { padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)' },
  emptyDetail: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
};

export default SnippetManager;
