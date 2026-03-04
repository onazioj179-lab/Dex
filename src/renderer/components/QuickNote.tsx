/**
 * DEX Quick Note Overlay
 * Global floating note capture triggered by keyboard shortcut
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface QuickNoteEntry {
  id: string;
  content: string;
  createdAt: number;
  color: string;
  pinned: boolean;
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-quick-notes';

function loadNotes(): QuickNoteEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveNotes(notes: QuickNoteEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch {}
}

// ============================================================================
// HOOK: useQuickNote
// ============================================================================

export function useQuickNote() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+N or Cmd+Shift+N to toggle quick note
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        // Note: SystemFeatures also uses Ctrl+Shift+N for "New Note"
        // This provides the global overlay version
      }
      // Alt+Q for quick note (unique shortcut)
      if (e.altKey && e.key === 'q') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false), toggle: () => setIsOpen(p => !p) };
}

// ============================================================================
// NOTE COLORS
// ============================================================================

const NOTE_COLORS = [
  { name: 'Yellow', value: '#fef3c7' },
  { name: 'Green', value: '#d1fae5' },
  { name: 'Blue', value: '#dbeafe' },
  { name: 'Pink', value: '#fce7f3' },
  { name: 'Purple', value: '#ede9fe' },
  { name: 'Orange', value: '#fed7aa' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const QuickNoteOverlay: React.FC<{ isOpen: boolean; onClose: () => void }> = memo(({ isOpen, onClose }) => {
  const [notes, setNotes] = useState<QuickNoteEntry[]>(loadNotes);
  const [content, setContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0].value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const persist = useCallback((n: QuickNoteEntry[]) => { setNotes(n); saveNotes(n); }, []);

  const addNote = useCallback(() => {
    if (!content.trim()) return;
    const note: QuickNoteEntry = {
      id: `qn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: content.trim(),
      createdAt: Date.now(),
      color: selectedColor,
      pinned: false,
    };
    persist([note, ...notes]);
    setContent('');
  }, [content, selectedColor, notes, persist]);

  const deleteNote = useCallback((id: string) => {
    persist(notes.filter(n => n.id !== id));
  }, [notes, persist]);

  const togglePin = useCallback((id: string) => {
    persist(notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  }, [notes, persist]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      addNote();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [addNote, onClose]);

  if (!isOpen) return null;

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <div style={styles.backdrop} onClick={onClose} role="dialog" aria-label="Quick Note" aria-modal="true">
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Quick Note</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{notes.length} notes</span>
            <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Input area */}
        <div style={styles.inputArea}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a quick note... (Ctrl+Enter to save)"
            style={styles.textarea}
            aria-label="Quick note content"
            rows={3}
          />
          <div style={styles.inputFooter}>
            <div style={{ display: 'flex', gap: 4 }}>
              {NOTE_COLORS.map(c => (
                <button key={c.value} onClick={() => setSelectedColor(c.value)}
                  style={{
                    width: 16, height: 16, borderRadius: '50%', background: c.value, border: 'none', cursor: 'pointer',
                    outline: selectedColor === c.value ? '2px solid #3b82f6' : 'none', outlineOffset: 2,
                  }}
                  aria-label={`${c.name} color`} />
              ))}
            </div>
            <button onClick={addNote} disabled={!content.trim()} style={{ ...styles.saveBtn, opacity: content.trim() ? 1 : 0.5 }}>
              Save
            </button>
          </div>
        </div>

        {/* Notes list */}
        <div style={styles.notesList}>
          {sortedNotes.length === 0 ? (
            <div style={styles.emptyState}>No notes yet. Quick notes are perfect for capturing ideas fast.</div>
          ) : (
            sortedNotes.map(note => (
              <div key={note.id} style={{ ...styles.noteCard, background: `${note.color}15`, borderLeft: `3px solid ${note.color}` }}>
                <div style={styles.noteContent}>{note.content}</div>
                <div style={styles.noteFooter}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    {new Date(note.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => navigator.clipboard.writeText(note.content)} style={styles.noteAction} aria-label="Copy note">
                      Copy
                    </button>
                    <button onClick={() => togglePin(note.id)} style={styles.noteAction} aria-label={note.pinned ? 'Unpin' : 'Pin'}>
                      {note.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button onClick={() => deleteNote(note.id)} style={{ ...styles.noteAction, color: '#ef4444' }} aria-label="Delete note">
                      Del
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

QuickNoteOverlay.displayName = 'QuickNoteOverlay';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'flex-end', padding: 16,
  },
  panel: {
    width: 340, maxHeight: '100%', borderRadius: 16,
    background: 'var(--color-surface, #1c1c1e)', border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 14px', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.06))',
  },
  closeBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2, display: 'flex' },
  inputArea: { padding: '10px 14px', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  textarea: {
    width: '100%', padding: '8px 0', border: 'none', outline: 'none', resize: 'none',
    background: 'transparent', color: 'inherit', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5,
  },
  inputFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  saveBtn: { padding: '4px 12px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  notesList: { flex: 1, overflow: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  noteCard: { padding: '8px 10px', borderRadius: 8 },
  noteContent: { fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  noteFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  noteAction: { fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px' },
  emptyState: { textAlign: 'center', padding: 20, fontSize: 12, color: 'var(--color-text-muted)' },
};

export default QuickNoteOverlay;
