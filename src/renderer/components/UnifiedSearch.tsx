// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * UNIFIED SEARCH - Global Search Component
 * Searches across files, notes, tasks, and system
 * Keyboard: Ctrl+K or /
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ======================================================================
// TYPES
// ======================================================================

interface SearchResult {
  id: string;
  type: 'note' | 'task' | 'file' | 'folder' | 'setting' | 'page' | 'action';
  title: string;
  subtitle?: string;
  icon: string;
  score: number;
  path?: string;
  action?: {
    type: 'navigate' | 'open' | 'execute';
    target: string;
  };
}

interface UnifiedSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (page: string) => void;
}

// ======================================================================
// ICONS
// ======================================================================

const Icons = {
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  ),
  note: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  task: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
  file: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
      <polyline points="13 2 13 9 20 9"/>
    </svg>
  ),
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  page: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <path d="M3 9h18"/>
    </svg>
  ),
  action: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  ),
};

const getIcon = (type: string) => {
  switch (type) {
    case 'note': return Icons.note;
    case 'task': return Icons.task;
    case 'file': return Icons.file;
    case 'folder': return Icons.folder;
    case 'setting': return Icons.settings;
    case 'page': return Icons.page;
    case 'action': return Icons.action;
    default: return Icons.file;
  }
};

// ======================================================================
// COMPONENT
// ======================================================================

export const UnifiedSearch: React.FC<UnifiedSearchProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search function
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const searchResults: SearchResult[] = [];

    try {
      // Search via backend IPC
      if (window.dex?.invoke) {
        const backendResults = await window.dex?.invoke?.('search:query', searchQuery, {
          limit: 20,
          scopes: { dex: true, computer: false }
        });
        
        if (backendResults && Array.isArray(backendResults)) {
          searchResults.push(...backendResults.map((r: any) => ({
            id: r.id,
            type: r.type as SearchResult['type'],
            title: r.title,
            subtitle: r.subtitle || r.description,
            icon: r.icon || r.type,
            score: r.score || 0,
            path: r.path,
            action: r.action,
          })));
        }
      }
    } catch (err) {
      console.warn('Backend search failed, using local search');
    }

    // Local fallback: Search localStorage data
    if (searchResults.length === 0) {
      const lowerQuery = searchQuery.toLowerCase();

      // Search notes
      try {
        const notesData = localStorage.getItem('dex-notes-data');
        if (notesData) {
          const notes = JSON.parse(notesData);
          notes.forEach((note: any) => {
            if (note.title?.toLowerCase().includes(lowerQuery) ||
                note.content?.toLowerCase().includes(lowerQuery)) {
              searchResults.push({
                id: note.id,
                type: 'note',
                title: note.title || 'Untitled Note',
                subtitle: note.content?.substring(0, 60) + '...',
                icon: 'note',
                score: note.title?.toLowerCase().includes(lowerQuery) ? 100 : 50,
                action: { type: 'navigate', target: 'notes' }
              });
            }
          });
        }
      } catch { /* search failed */ }

      // Search tasks
      try {
        const tasksData = localStorage.getItem('dex-tasks-data');
        if (tasksData) {
          const data = JSON.parse(tasksData);
          (data.tasks || []).forEach((task: any) => {
            if (task.title?.toLowerCase().includes(lowerQuery) ||
                task.notes?.toLowerCase().includes(lowerQuery)) {
              searchResults.push({
                id: task.id,
                type: 'task',
                title: task.title || 'Untitled Task',
                subtitle: task.list || 'Tasks',
                icon: 'task',
                score: task.title?.toLowerCase().includes(lowerQuery) ? 100 : 50,
                action: { type: 'navigate', target: 'tasks' }
              });
            }
          });
        }
      } catch { /* search failed */ }

      // Add page navigation results
      const pages = [
        { id: 'home', title: 'Home', subtitle: 'Dashboard and overview' },
        { id: 'files', title: 'Files', subtitle: 'File browser and manager' },
        { id: 'notes', title: 'Notes', subtitle: 'Text notes and documents' },
        { id: 'tasks', title: 'Tasks', subtitle: 'Task lists and todos' },
        { id: 'browser', title: 'Browser', subtitle: 'Web browser' },
        { id: 'gallery', title: 'Gallery', subtitle: 'Photos and images' },
        { id: 'audio', title: 'Music', subtitle: 'Audio player' },
        { id: 'video', title: 'Video', subtitle: 'Video player' },
        { id: 'workflows', title: 'Automation', subtitle: 'Workflows and scripts' },
        { id: 'settings', title: 'Settings', subtitle: 'App preferences' },
        { id: 'dashboard', title: 'Dashboard', subtitle: 'App launcher with widgets' },
        { id: 'transfers', title: 'Transfers', subtitle: 'File sharing and AirDrop' },
        { id: 'power', title: 'Power', subtitle: 'System power and energy' },
        { id: 'calculator', title: 'Calculator', subtitle: 'Math and conversions' },
        { id: 'calendar', title: 'Calendar', subtitle: 'Events and scheduling' },
        { id: 'passwordgenerator', title: 'Passwords', subtitle: 'Password generator and vault' },
        { id: 'rewind', title: 'Rewind', subtitle: 'Activity journal and timeline' },
        { id: 'kanban', title: 'Kanban', subtitle: 'Project boards and cards' },
        { id: 'achievements', title: 'Achievements', subtitle: 'Trophies and milestones' },
        { id: 'videoeditor', title: 'Video Editor', subtitle: 'Cut, trim and edit videos' },
        { id: 'imosion', title: 'Imosion', subtitle: 'DAW and music production' },
        { id: 'prism', title: 'Prism', subtitle: 'Photo editing and filters' },
        { id: 'flux', title: 'Flux', subtitle: 'Design and prototyping' },
        { id: 'forge', title: 'Forge', subtitle: 'Code editor and IDE' },
      ];

      pages.forEach(page => {
        if (page.title.toLowerCase().includes(lowerQuery) ||
            page.subtitle.toLowerCase().includes(lowerQuery)) {
          searchResults.push({
            id: `page-${page.id}`,
            type: 'page',
            title: page.title,
            subtitle: page.subtitle,
            icon: 'page',
            score: page.title.toLowerCase().startsWith(lowerQuery) ? 150 : 80,
            action: { type: 'navigate', target: page.id }
          });
        }
      });
    }

    // Sort by score
    searchResults.sort((a, b) => b.score - a.score);
    setResults(searchResults.slice(0, 15));
    setSelectedIndex(0);
    setIsLoading(false);

    // Notify engagement tracker
    if (searchResults.length > 0) {
      window.dispatchEvent(new CustomEvent('dex-search-performed'));
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          executeResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, selectedIndex, onClose]);

  // Execute selected result
  const executeResult = useCallback((result: SearchResult) => {
    if (result.action?.type === 'navigate' && onNavigate) {
      onNavigate(result.action.target);
    } else if (result.action?.type === 'open' && result.path) {
      window.dex?.shell?.openPath?.(result.path);
    }
    onClose();
  }, [onNavigate, onClose]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={e => e.stopPropagation()}>
        {/* Search Input */}
        <div style={styles.inputContainer}>
          <span style={styles.searchIcon}>{Icons.search}</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes, tasks, files, pages..."
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          <span style={styles.hint}>Esc to close</span>
        </div>

        {/* Results */}
        {(results.length > 0 || isLoading) && (
          <div style={styles.results} ref={listRef}>
            {isLoading && results.length === 0 && (
              <div style={styles.loading}>Searching...</div>
            )}
            {results.map((result, index) => (
              <div
                key={result.id}
                style={{
                  ...styles.resultItem,
                  background: index === selectedIndex ? 'var(--color-border-subtle)' : 'transparent',
                }}
                onClick={() => executeResult(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span style={styles.resultIcon}>{getIcon(result.type)}</span>
                <div style={styles.resultContent}>
                  <div style={styles.resultTitle}>{result.title}</div>
                  {result.subtitle && (
                    <div style={styles.resultSubtitle}>{result.subtitle}</div>
                  )}
                </div>
                <span style={styles.resultType}>{result.type}</span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query && results.length === 0 && !isLoading && (
          <div style={styles.empty}>
            No results found for "{query}"
          </div>
        )}

        {/* Shortcuts hint */}
        {!query && (
          <div style={styles.shortcuts}>
            <div style={styles.shortcutRow}>
              <span style={styles.shortcutKey}>Enter</span>
              <span>to select</span>
            </div>
            <div style={styles.shortcutRow}>
              <span style={styles.shortcutKey}>Up/Down</span>
              <span>to navigate</span>
            </div>
            <div style={styles.shortcutRow}>
              <span style={styles.shortcutKey}>Esc</span>
              <span>to close</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ======================================================================
// STYLES
// ======================================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.80)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '15vh',
    zIndex: 'var(--z-overlay)' as any,
  },
  modal: {
    width: '100%',
    maxWidth: 560,
    background: 'var(--color-bg-surface)',
    borderRadius: 12,
    border: '1px solid var(--color-border-default)',
    boxShadow: 'var(--shadow-float)',
    overflow: 'hidden',
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border-subtle)',
    gap: 12,
  },
  searchIcon: {
    color: 'var(--color-text-muted)',
    display: 'flex',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text-primary)',
    fontSize: 16,
    fontFamily: 'inherit',
  },
  hint: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    padding: '3px 6px',
    background: 'var(--color-bg-hover)',
    borderRadius: 4,
  },
  results: {
    maxHeight: 400,
    overflowY: 'auto',
    padding: '4px 0',
  },
  loading: {
    padding: '20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: 13,
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    cursor: 'pointer',
    gap: 12,
    transition: 'background 0.1s',
  },
  resultIcon: {
    color: 'var(--color-text-tertiary)',
    display: 'flex',
  },
  resultContent: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    color: 'var(--color-text-primary)',
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  resultSubtitle: {
    color: 'var(--color-text-muted)',
    fontSize: 12,
    marginTop: 2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  resultType: {
    fontSize: 10,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    padding: '2px 6px',
    background: 'var(--color-bg-hover)',
    borderRadius: 4,
  },
  empty: {
    padding: '30px 20px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
    fontSize: 13,
  },
  shortcuts: {
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    borderTop: '1px solid var(--color-border-subtle)',
  },
  shortcutRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
  },
  shortcutKey: {
    padding: '2px 6px',
    background: 'var(--color-border-subtle)',
    borderRadius: 4,
    fontSize: 10,
    color: 'var(--color-text-secondary)',
  },
};

export default UnifiedSearch;
