/**
 * DEX Global Search
 * Search across all apps, files, settings, and content
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// Icons
const Icons = {
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  app: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  settings: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  command: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>,
  note: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// Searchable items
interface SearchItem {
  id: string;
  type: 'app' | 'file' | 'setting' | 'command' | 'note';
  title: string;
  description: string;
  icon?: React.ReactNode;
  color?: string;
  action?: () => void;
}

// All searchable apps
const SEARCHABLE_APPS: SearchItem[] = [
  { id: 'home', type: 'app', title: 'Home', description: 'Dashboard and overview', color: '#6366f1' },
  { id: 'files', type: 'app', title: 'Files', description: 'File manager and browser', color: '#3b82f6' },
  { id: 'notes', type: 'app', title: 'Notes', description: 'Quick notes and documents', color: '#f59e0b' },
  { id: 'tasks', type: 'app', title: 'Tasks', description: 'Task and project management', color: '#10b981' },
  { id: 'calendar', type: 'app', title: 'Calendar', description: 'Events and scheduling', color: '#ef4444' },
  { id: 'browser', type: 'app', title: 'Browser', description: 'Web browser', color: '#6366f1' },
  { id: 'calculator', type: 'app', title: 'Calculator', description: 'Math calculations', color: '#64748b' },
  { id: 'password', type: 'app', title: 'Password Generator', description: 'Generate secure passwords', color: '#22c55e' },
  { id: 'settings', type: 'app', title: 'Settings', description: 'System preferences', color: '#71717a' },
  { id: 'imosion', type: 'app', title: 'Imosion', description: 'Professional digital audio workstation', color: '#a855f7' },
  { id: 'videoeditor', type: 'app', title: 'VINX Video Editor', description: 'Professional video editing', color: '#f43f5e' },
  { id: 'prism', type: 'app', title: 'Prism', description: 'Advanced image editor', color: '#ec4899' },
  { id: 'flux', type: 'app', title: 'Flux', description: 'Motion graphics and animation', color: '#f97316' },
  { id: 'forge', type: 'app', title: 'Forge', description: 'Media encoder and converter', color: '#14b8a6' },
  { id: 'gallery', type: 'app', title: 'Gallery', description: 'Photo and media gallery', color: '#8b5cf6' },
  { id: 'audio', type: 'app', title: 'Audio Player', description: 'Music and audio playback', color: '#ec4899' },
  { id: 'video', type: 'app', title: 'Video Player', description: 'Video playback', color: '#f43f5e' },
  { id: 'workflows', type: 'app', title: 'Workflows', description: 'Automation and workflows', color: '#0ea5e9' },
  { id: 'terminal', type: 'app', title: 'Terminal', description: 'Command line interface', color: '#22c55e' },
];

// All searchable settings
const SEARCHABLE_SETTINGS: SearchItem[] = [
  { id: 'theme', type: 'setting', title: 'Theme', description: 'Change dark or light mode', color: '#6366f1' },
  { id: 'accent-color', type: 'setting', title: 'Accent Color', description: 'Change system accent color', color: '#3b82f6' },
  { id: 'shortcuts', type: 'setting', title: 'Keyboard Shortcuts', description: 'Customize keyboard shortcuts', color: '#f59e0b' },
  { id: 'notifications', type: 'setting', title: 'Notifications', description: 'Notification preferences', color: '#ef4444' },
  { id: 'display', type: 'setting', title: 'Display', description: 'Display and appearance settings', color: '#10b981' },
  { id: 'performance', type: 'setting', title: 'Performance', description: 'Performance and optimization', color: '#f97316' },
  { id: 'storage', type: 'setting', title: 'Storage', description: 'Storage management', color: '#8b5cf6' },
  { id: 'privacy', type: 'setting', title: 'Privacy', description: 'Privacy and security settings', color: '#22c55e' },
];

// All searchable commands
const SEARCHABLE_COMMANDS: SearchItem[] = [
  { id: 'cmd-new-file', type: 'command', title: 'New File', description: 'Create a new file', color: '#3b82f6' },
  { id: 'cmd-new-folder', type: 'command', title: 'New Folder', description: 'Create a new folder', color: '#3b82f6' },
  { id: 'cmd-new-note', type: 'command', title: 'New Note', description: 'Create a new note', color: '#f59e0b' },
  { id: 'cmd-new-task', type: 'command', title: 'New Task', description: 'Create a new task', color: '#10b981' },
  { id: 'cmd-toggle-theme', type: 'command', title: 'Toggle Theme', description: 'Switch between dark and light mode', color: '#6366f1' },
  { id: 'cmd-open-terminal', type: 'command', title: 'Open Terminal', description: 'Open command line terminal', color: '#22c55e' },
  { id: 'cmd-take-screenshot', type: 'command', title: 'Take Screenshot', description: 'Capture screen', color: '#ec4899' },
  { id: 'cmd-lock-screen', type: 'command', title: 'Lock Screen', description: 'Lock the screen', color: '#ef4444' },
  { id: 'cmd-export', type: 'command', title: 'Quick Export', description: 'Export current project', color: '#14b8a6' },
  { id: 'cmd-reload', type: 'command', title: 'Reload', description: 'Reload current app', color: '#f97316' },
];

// All searchable items combined
const ALL_SEARCHABLE_ITEMS: SearchItem[] = [
  ...SEARCHABLE_APPS,
  ...SEARCHABLE_SETTINGS,
  ...SEARCHABLE_COMMANDS,
];

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApp?: (appId: string) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose, onOpenApp }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dex-recent-searches');
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch { /* search failed */ }
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search results
  const results = useMemo<SearchItem[]>(() => {
    const q = query.toLowerCase().trim();
    
    if (!q) {
      // Show recent searches or popular items
      return SEARCHABLE_APPS.slice(0, 6);
    }
    
    // Search all items
    return ALL_SEARCHABLE_ITEMS
      .filter(item => 
        item.title.toLowerCase().includes(q) || 
        item.description.toLowerCase().includes(q) ||
        item.type.includes(q)
      )
      .slice(0, 10);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
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
  const executeResult = useCallback((item: SearchItem) => {
    // Save to recent searches
    if (query.trim()) {
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 10);
      localStorage.setItem('dex-recent-searches', JSON.stringify(updated));
    }
    
    if (item.type === 'app') {
      onOpenApp?.(item.id);
    } else if (item.type === 'setting') {
      onOpenApp?.('settings');
    } else if (item.type === 'command') {
      // Execute command
      if (item.id === 'cmd-toggle-theme') {
        const isDark = document.body.classList.contains('dark-mode');
        if (isDark) {
          document.documentElement.setAttribute('data-theme', 'light');
          document.body.classList.remove('dark-mode');
          localStorage.setItem('dex-dark-mode', 'false');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          document.body.classList.add('dark-mode');
          localStorage.setItem('dex-dark-mode', 'true');
        }
      } else if (item.id === 'cmd-new-note') {
        onOpenApp?.('notes');
      } else if (item.id === 'cmd-new-task') {
        onOpenApp?.('tasks');
      } else if (item.id === 'cmd-open-terminal') {
        onOpenApp?.('terminal');
      }
    }
    
    onClose();
  }, [query, recentSearches, onOpenApp, onClose]);

  // Get icon for item type
  const getIcon = (item: SearchItem) => {
    switch (item.type) {
      case 'app': return Icons.app;
      case 'file': return Icons.file;
      case 'setting': return Icons.settings;
      case 'command': return Icons.command;
      case 'note': return Icons.note;
      default: return Icons.file;
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={e => e.stopPropagation()}>
        {/* Search Input */}
        <div style={styles.inputWrapper}>
          <span style={styles.searchIcon}>{Icons.search}</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search apps, files, settings, commands..."
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={onClose} style={styles.closeBtn}>{Icons.x}</button>
        </div>

        {/* Results */}
        <div style={styles.results}>
          {results.length === 0 ? (
            <div style={styles.noResults}>No results found for "{query}"</div>
          ) : (
            <>
              {!query && <div style={styles.sectionTitle}>Suggested</div>}
              {results.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    ...styles.resultItem,
                    background: index === selectedIndex ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  }}
                  onClick={() => executeResult(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div style={{ ...styles.resultIcon, background: `${item.color || '#6366f1'}20` }}>
                    <span style={{ color: item.color || '#6366f1' }}>{getIcon(item)}</span>
                  </div>
                  <div style={styles.resultContent}>
                    <div style={styles.resultTitle}>{item.title}</div>
                    <div style={styles.resultDesc}>{item.description}</div>
                  </div>
                  <div style={styles.resultType}>{item.type}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.footerHint}>
            <kbd style={styles.kbd}>Tab</kbd> to navigate
            <kbd style={styles.kbd}>Enter</kbd> to select
            <kbd style={styles.kbd}>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '12vh',
    zIndex: 99999,
  },
  container: {
    width: 'min(640px, 92vw)',
    maxHeight: '500px',
    background: 'var(--color-bg-primary, #18181b)',
    borderRadius: '12px',
    border: '1px solid var(--color-border, #27272a)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border, #27272a)',
    gap: '12px',
  },
  searchIcon: {
    color: '#71717a',
    display: 'flex',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: '16px',
    color: 'var(--color-text-primary, #fafafa)',
    fontFamily: 'inherit',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
  },
  results: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  sectionTitle: {
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 500,
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  noResults: {
    padding: '32px',
    textAlign: 'center',
    color: '#71717a',
    fontSize: '13px',
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    gap: '12px',
    transition: 'background 0.1s',
  },
  resultIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultContent: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-primary, #fafafa)',
    marginBottom: '2px',
  },
  resultDesc: {
    fontSize: '11px',
    color: '#71717a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resultType: {
    fontSize: '10px',
    color: '#52525b',
    textTransform: 'capitalize',
    padding: '2px 8px',
    background: 'var(--color-bg-secondary, #111113)',
    borderRadius: '4px',
  },
  footer: {
    padding: '10px 20px',
    borderTop: '1px solid var(--color-border, #27272a)',
    background: 'var(--color-bg-secondary, #111113)',
  },
  footerHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '11px',
    color: '#52525b',
  },
  kbd: {
    padding: '2px 6px',
    background: 'var(--color-bg-tertiary, #27272a)',
    borderRadius: '3px',
    fontSize: '10px',
    color: '#a1a1aa',
    fontFamily: 'monospace',
    marginRight: '4px',
  },
};

export default GlobalSearch;
