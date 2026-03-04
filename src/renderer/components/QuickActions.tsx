/**
 * QUICK ACTIONS - Command Palette
 * Fast access to any action in DEX
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'navigation' | 'action' | 'file' | 'system';
  shortcut?: string;
  action: () => void;
}

interface QuickActionsProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: string) => void;
}

// Icons
const Icons = {
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  ),
  home: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    </svg>
  ),
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  note: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  ),
  task: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
  browser: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  ),
  gallery: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
  ),
  audio: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  video: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M10 8l6 4-6 4V8z"/>
    </svg>
  ),
  workflow: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  sun: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  ),
  moon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  ),
  upload: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
    </svg>
  ),
};

export const QuickActions: React.FC<QuickActionsProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Define all available actions
  const allActions: QuickAction[] = [
    // Navigation
    { id: 'nav-home', title: 'Go to Home', description: 'Open the home page', icon: Icons.home, category: 'navigation', shortcut: 'Ctrl+1', action: () => onNavigate('home') },
    { id: 'nav-files', title: 'Go to Files', description: 'Browse your files', icon: Icons.folder, category: 'navigation', shortcut: 'Ctrl+2', action: () => onNavigate('files') },
    { id: 'nav-notes', title: 'Go to Notes', description: 'View and edit notes', icon: Icons.note, category: 'navigation', shortcut: 'Ctrl+3', action: () => onNavigate('notes') },
    { id: 'nav-tasks', title: 'Go to Tasks', description: 'Manage your tasks', icon: Icons.task, category: 'navigation', shortcut: 'Ctrl+4', action: () => onNavigate('tasks') },
    { id: 'nav-browser', title: 'Go to Browser', description: 'Secure web browsing', icon: Icons.browser, category: 'navigation', shortcut: 'Ctrl+5', action: () => onNavigate('browser') },
    { id: 'nav-gallery', title: 'Go to Gallery', description: 'View images', icon: Icons.gallery, category: 'navigation', shortcut: 'Ctrl+6', action: () => onNavigate('gallery') },
    { id: 'nav-audio', title: 'Go to Audio', description: 'Play music', icon: Icons.audio, category: 'navigation', shortcut: 'Ctrl+7', action: () => onNavigate('audio') },
    { id: 'nav-video', title: 'Go to Video', description: 'Watch videos', icon: Icons.video, category: 'navigation', shortcut: 'Ctrl+8', action: () => onNavigate('video') },
    { id: 'nav-workflows', title: 'Go to Workflows', description: 'Automation workflows', icon: Icons.workflow, category: 'navigation', shortcut: 'Ctrl+9', action: () => onNavigate('workflows') },
    { id: 'nav-settings', title: 'Go to Settings', description: 'App settings', icon: Icons.settings, category: 'navigation', shortcut: 'Ctrl+0', action: () => onNavigate('settings') },
    
    // Quick Actions
    { id: 'action-new-note', title: 'New Note', description: 'Create a new note', icon: Icons.plus, category: 'action', action: () => { onNavigate('notes'); window.dispatchEvent(new CustomEvent('dex:new-note')); } },
    { id: 'action-new-task', title: 'New Task', description: 'Create a new task', icon: Icons.plus, category: 'action', action: () => { onNavigate('tasks'); window.dispatchEvent(new CustomEvent('dex:new-task')); } },
    
    // System
    { id: 'sys-toggle-theme', title: 'Toggle Dark Mode', description: 'Switch between light and dark theme', icon: Icons.moon, category: 'system', action: () => {
      const current = localStorage.getItem('darkMode');
      localStorage.setItem('darkMode', current === 'true' ? 'false' : 'true');
      window.location.reload();
    }},
    { id: 'sys-clear-cache', title: 'Clear Cache', description: 'Clear application cache', icon: Icons.trash, category: 'system', action: () => {
      localStorage.removeItem('browser_bookmarks');
      localStorage.removeItem('gallery_favorites');
      localStorage.removeItem('audio_playlist');
      /* Cache cleared successfully */
    }},
    { id: 'sys-refresh', title: 'Refresh App', description: 'Reload the application', icon: Icons.refresh, category: 'system', action: () => window.location.reload() },
    
    // File Operations
    { id: 'file-open-folder', title: 'Open Downloads', description: 'Open Downloads folder', icon: Icons.download, category: 'file', action: async () => {
      try {
        if (window.electron?.shell?.openPath) {
          await window.electron.shell.openPath(require('os').homedir() + '/Downloads');
        }
      } catch { /* action failed */ }
    }},
    { id: 'file-open-documents', title: 'Open Documents', description: 'Open Documents folder', icon: Icons.folder, category: 'file', action: async () => {
      try {
        if (window.electron?.shell?.openPath) {
          await window.electron.shell.openPath(require('os').homedir() + '/Documents');
        }
      } catch { /* action failed */ }
    }},
  ];

  // Filter actions based on query
  const filteredActions = allActions.filter(action => {
    const searchStr = `${action.title} ${action.description} ${action.category}`.toLowerCase();
    return searchStr.includes(query.toLowerCase());
  });

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredActions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredActions[selectedIndex]) {
          filteredActions[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredActions, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={e => e.stopPropagation()}>
        {/* Search Input */}
        <div style={styles.searchContainer}>
          <span style={styles.searchIcon}>{Icons.search}</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search actions..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.searchInput}
          />
          <span style={styles.shortcutHint}>esc to close</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={styles.results}>
          {filteredActions.length === 0 ? (
            <div style={styles.noResults}>No actions found</div>
          ) : (
            filteredActions.map((action, index) => (
              <button
                key={action.id}
                style={{
                  ...styles.actionItem,
                  background: index === selectedIndex ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                }}
                onClick={() => {
                  action.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span style={styles.actionIcon}>{action.icon}</span>
                <div style={styles.actionInfo}>
                  <span style={styles.actionTitle}>{action.title}</span>
                  <span style={styles.actionDesc}>{action.description}</span>
                </div>
                {action.shortcut && (
                  <span style={styles.actionShortcut}>{action.shortcut}</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerHint}>
            <kbd style={styles.kbd}>Enter</kbd> to select
            <kbd style={styles.kbd}>Arrow</kbd> to navigate
          </span>
        </div>
      </div>
    </div>
  );
};

// Styles
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '100px',
    zIndex: 9999,
  },
  container: {
    width: '560px',
    maxHeight: '480px',
    background: '#1c1c1e',
    borderRadius: '12px',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    borderBottom: '1px solid var(--color-border-default)',
    gap: '12px',
  },
  searchIcon: {
    color: 'var(--color-text-muted)',
    display: 'flex',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '16px',
    outline: 'none',
  },
  shortcutHint: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  results: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  noResults: {
    padding: '32px',
    textAlign: 'center',
    color: 'var(--color-text-muted)',
  },
  actionItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
  },
  actionIcon: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    background: 'var(--color-bg-hover)',
    color: '#0a84ff',
  },
  actionInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  actionTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  actionDesc: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  actionShortcut: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    padding: '4px 8px',
    background: 'var(--color-bg-hover)',
    borderRadius: '4px',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid var(--color-border-default)',
    display: 'flex',
    justifyContent: 'center',
  },
  footerHint: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    display: 'flex',
    gap: '16px',
  },
  kbd: {
    display: 'inline-block',
    padding: '2px 6px',
    background: 'var(--color-bg-hover)',
    borderRadius: '4px',
    fontSize: '11px',
    marginRight: '4px',
  },
};

export default QuickActions;
