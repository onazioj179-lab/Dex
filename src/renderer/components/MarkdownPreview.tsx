/**
 * DEX Markdown Preview
 * Live markdown editor with split-pane preview
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';

// ============================================================================
// TYPES
// ============================================================================

export interface MarkdownDocument {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// MARKDOWN PARSER (lightweight, no dependencies)
// ============================================================================

function parseMarkdown(md: string): string {
  let html = md;
  // Escape HTML entities
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Code blocks (triple backtick)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="md-code-block"><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // Headers
  html = html.replace(/^######\s(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s(.+)$/gm, '<h1>$1</h1>');
  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Blockquotes
  html = html.replace(/^&gt;\s(.+)$/gm, '<blockquote>$1</blockquote>');
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');
  // Unordered list items
  html = html.replace(/^[\-\*]\s(.+)$/gm, '<li>$1</li>');
  // Ordered list items
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');
  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%;border-radius:6px;" />');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#3b82f6;">$1</a>');
  // Checkboxes
  html = html.replace(/\[x\]/gi, '&#9745;');
  html = html.replace(/\[\s?\]/g, '&#9744;');
  // Line breaks (double newline = paragraph)
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;
  // Remove empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  return html;
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-markdown-docs';

function loadDocs(): MarkdownDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [{
    id: 'welcome',
    title: 'Welcome',
    content: '# Welcome to DEX Markdown\n\nStart writing your notes in **Markdown**.\n\n## Features\n\n- Live preview\n- Multiple documents\n- Full formatting support\n- `Inline code` and code blocks\n\n```js\nconst greeting = "Hello, DEX!";\nconsole.log(greeting);\n```\n\n> Tip: Use the toolbar for quick formatting.\n\n---\n\nHappy writing!',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }];
}

function saveDocs(docs: MarkdownDocument[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(docs)); } catch {}
}

// ============================================================================
// TOOLBAR
// ============================================================================

interface ToolbarAction {
  label: string;
  icon: string;
  prefix: string;
  suffix: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: 'Bold', icon: 'B', prefix: '**', suffix: '**' },
  { label: 'Italic', icon: 'I', prefix: '*', suffix: '*' },
  { label: 'Strikethrough', icon: 'S', prefix: '~~', suffix: '~~' },
  { label: 'Code', icon: '< >', prefix: '`', suffix: '`' },
  { label: 'Heading', icon: 'H', prefix: '## ', suffix: '' },
  { label: 'Link', icon: 'Lk', prefix: '[', suffix: '](url)' },
  { label: 'List', icon: 'Li', prefix: '- ', suffix: '' },
  { label: 'Quote', icon: '"', prefix: '> ', suffix: '' },
  { label: 'HR', icon: '--', prefix: '\n---\n', suffix: '' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const MarkdownPreview: React.FC = memo(() => {
  const [docs, setDocs] = useState<MarkdownDocument[]>(loadDocs);
  const [activeDocId, setActiveDocId] = useState<string>(docs[0]?.id || '');
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const activeDoc = useMemo(() => docs.find(d => d.id === activeDocId), [docs, activeDocId]);
  const rendered = useMemo(() => activeDoc ? parseMarkdown(activeDoc.content) : '', [activeDoc?.content]);

  const persist = useCallback((updated: MarkdownDocument[]) => { setDocs(updated); saveDocs(updated); }, []);

  const updateContent = useCallback((content: string) => {
    persist(docs.map(d => d.id === activeDocId ? { ...d, content, updatedAt: Date.now() } : d));
  }, [docs, activeDocId, persist]);

  const updateTitle = useCallback((title: string) => {
    persist(docs.map(d => d.id === activeDocId ? { ...d, title, updatedAt: Date.now() } : d));
  }, [docs, activeDocId, persist]);

  const newDoc = useCallback(() => {
    const doc: MarkdownDocument = {
      id: `md-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: 'Untitled',
      content: '# New Document\n\nStart writing here...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persist([doc, ...docs]);
    setActiveDocId(doc.id);
  }, [docs, persist]);

  const deleteDoc = useCallback((id: string) => {
    const next = docs.filter(d => d.id !== id);
    persist(next);
    if (activeDocId === id) setActiveDocId(next[0]?.id || '');
  }, [docs, activeDocId, persist]);

  const insertToolbar = useCallback((action: ToolbarAction) => {
    const el = editorRef.current;
    if (!el || !activeDoc) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = activeDoc.content.slice(start, end) || action.label.toLowerCase();
    const newContent = activeDoc.content.slice(0, start) + action.prefix + selected + action.suffix + activeDoc.content.slice(end);
    updateContent(newContent);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + action.prefix.length, start + action.prefix.length + selected.length);
    });
  }, [activeDoc, updateContent]);

  // Word/char count
  const wordCount = useMemo(() => {
    if (!activeDoc) return { words: 0, chars: 0, lines: 0 };
    const words = activeDoc.content.trim().split(/\s+/).filter(Boolean).length;
    return { words, chars: activeDoc.content.length, lines: activeDoc.content.split('\n').length };
  }, [activeDoc?.content]);

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Documents</span>
          <button onClick={newDoc} style={styles.newBtn} aria-label="New document">+</button>
        </div>
        <div style={styles.docList}>
          {docs.map(d => (
            <div key={d.id} onClick={() => setActiveDocId(d.id)}
              style={{ ...styles.docItem, ...(d.id === activeDocId ? styles.docItemActive : {}) }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                {new Date(d.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div style={styles.main}>
        {activeDoc ? (
          <>
            {/* Title + controls */}
            <div style={styles.topBar}>
              <input value={activeDoc.title} onChange={e => updateTitle(e.target.value)}
                style={styles.titleInput} aria-label="Document title" />
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {(['edit', 'split', 'preview'] as const).map(m => (
                  <button key={m} onClick={() => setViewMode(m)}
                    style={{ ...styles.viewBtn, ...(viewMode === m ? styles.viewBtnActive : {}) }}>
                    {m === 'edit' ? 'Edit' : m === 'split' ? 'Split' : 'Preview'}
                  </button>
                ))}
                <button onClick={() => deleteDoc(activeDoc.id)} style={{ ...styles.viewBtn, color: '#ef4444' }}
                  aria-label="Delete document">Del</button>
              </div>
            </div>

            {/* Toolbar */}
            {viewMode !== 'preview' && (
              <div style={styles.toolbar}>
                {TOOLBAR_ACTIONS.map(a => (
                  <button key={a.label} onClick={() => insertToolbar(a)} style={styles.toolBtn}
                    title={a.label} aria-label={a.label}>{a.icon}</button>
                ))}
              </div>
            )}

            {/* Editor + Preview */}
            <div style={styles.editorContainer}>
              {viewMode !== 'preview' && (
                <textarea ref={editorRef} value={activeDoc.content}
                  onChange={e => updateContent(e.target.value)}
                  style={{ ...styles.editor, flex: viewMode === 'split' ? 1 : 1 }}
                  spellCheck={false} aria-label="Markdown editor" />
              )}
              {viewMode !== 'edit' && (
                <div style={{ ...styles.preview, flex: 1 }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rendered) }} />
              )}
            </div>

            {/* Status bar */}
            <div style={styles.statusBar}>
              <span>{wordCount.words} words</span>
              <span>{wordCount.chars} chars</span>
              <span>{wordCount.lines} lines</span>
            </div>
          </>
        ) : (
          <div style={styles.emptyState}>Create a new document to get started.</div>
        )}
      </div>
    </div>
  );
});

MarkdownPreview.displayName = 'MarkdownPreview';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', overflow: 'hidden' },
  sidebar: { width: 180, flexShrink: 0, borderRight: '1px solid var(--color-border, rgba(255,255,255,0.06))', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)' },
  sidebarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 10px 8px' },
  newBtn: { width: 24, height: 24, borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  docList: { flex: 1, overflow: 'auto', padding: '0 6px 6px' },
  docItem: { padding: '6px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, transition: 'background 0.1s' },
  docItemActive: { background: 'rgba(59,130,246,0.12)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  titleInput: { fontSize: 15, fontWeight: 700, background: 'none', border: 'none', color: 'inherit', outline: 'none', fontFamily: 'inherit', flex: 1, marginRight: 8 },
  viewBtn: { padding: '3px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  viewBtnActive: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  toolbar: { display: 'flex', gap: 2, padding: '4px 12px', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.04))' },
  toolBtn: { width: 28, height: 24, borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  editorContainer: { flex: 1, display: 'flex', overflow: 'hidden' },
  editor: { padding: 12, background: 'transparent', border: 'none', color: 'inherit', fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.6, resize: 'none', outline: 'none', overflow: 'auto' },
  preview: { padding: 16, overflow: 'auto', fontSize: 13, lineHeight: 1.7, borderLeft: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  statusBar: { display: 'flex', gap: 12, padding: '4px 12px', borderTop: '1px solid var(--color-border, rgba(255,255,255,0.04))', fontSize: 10, color: 'var(--color-text-muted)' },
  emptyState: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontSize: 14, color: 'var(--color-text-muted)' },
};

export default MarkdownPreview;
