/**
 * DEX Command Palette
 * Quick actions via Ctrl+K / Cmd+K
 * Universal search and action launcher
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRunningApps } from '../store/runningApps';

// ==================== TYPES ====================

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  category: 'app' | 'action' | 'navigation' | 'settings' | 'recent';
  action: () => void;
  keywords?: string[];
  shortcut?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

// ==================== ICONS ====================

const Icons = {
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  files: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  notes: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  tasks: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  browser: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  gallery: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  audio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  video: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  calculator: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  password: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  workflows: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  theme: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  newNote: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>,
  newTask: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>,
};

// ==================== COMPONENT ====================

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { setCurrentApp } = useRunningApps();

  // Build command list
  const commands: Command[] = useMemo(() => [
    // Apps
    { id: 'home', title: 'Go to Home', icon: Icons.home, category: 'app', action: () => setCurrentApp('home'), keywords: ['dashboard', 'main'] },
    { id: 'files', title: 'Open Files', icon: Icons.files, category: 'app', action: () => setCurrentApp('files'), keywords: ['folder', 'documents'] },
    { id: 'notes', title: 'Open Notes', icon: Icons.notes, category: 'app', action: () => setCurrentApp('notes'), keywords: ['write', 'text'] },
    { id: 'tasks', title: 'Open Tasks', icon: Icons.tasks, category: 'app', action: () => setCurrentApp('tasks'), keywords: ['todo', 'reminders'] },
    { id: 'browser', title: 'Open Browser', icon: Icons.browser, category: 'app', action: () => setCurrentApp('browser'), keywords: ['web', 'internet'] },
    { id: 'gallery', title: 'Open Gallery', icon: Icons.gallery, category: 'app', action: () => setCurrentApp('gallery'), keywords: ['photos', 'images'] },
    { id: 'audio', title: 'Open Audio', icon: Icons.audio, category: 'app', action: () => setCurrentApp('audio'), keywords: ['music', 'player'] },
    { id: 'video', title: 'Open Video', icon: Icons.video, category: 'app', action: () => setCurrentApp('video'), keywords: ['movies', 'player'] },
    { id: 'settings', title: 'Open Settings', icon: Icons.settings, category: 'app', action: () => setCurrentApp('settings'), keywords: ['preferences', 'config'], shortcut: 'Ctrl+,' },
    { id: 'calculator', title: 'Open Calculator', icon: Icons.calculator, category: 'app', action: () => setCurrentApp('calculator'), keywords: ['math', 'calc'] },
    { id: 'calendar', title: 'Open Calendar', icon: Icons.calendar, category: 'app', action: () => setCurrentApp('calendar'), keywords: ['events', 'schedule'] },
    { id: 'password', title: 'Open Password Manager', icon: Icons.password, category: 'app', action: () => setCurrentApp('password'), keywords: ['vault', 'security'] },
    { id: 'workflows', title: 'Open Workflows', icon: Icons.workflows, category: 'app', action: () => setCurrentApp('workflows'), keywords: ['automation', 'shortcuts'] },
    
    // Actions
    { id: 'new-note', title: 'Create New Note', subtitle: 'Start a new note', icon: Icons.newNote, category: 'action', action: () => { setCurrentApp('notes'); }, keywords: ['add', 'create'] },
    { id: 'new-task', title: 'Create New Task', subtitle: 'Add a new task', icon: Icons.newTask, category: 'action', action: () => { setCurrentApp('tasks'); }, keywords: ['add', 'todo'] },
    
    // Settings
    { id: 'toggle-theme', title: 'Toggle Dark/Light Theme', subtitle: 'Switch appearance', icon: Icons.theme, category: 'settings', action: () => {
      const current = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
      localStorage.setItem('dex-theme', current === 'dark' ? 'light' : 'dark');
    }, keywords: ['dark', 'light', 'appearance'] },
  ], [setCurrentApp]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd => 
      cmd.title.toLowerCase().includes(q) ||
      cmd.subtitle?.toLowerCase().includes(q) ||
      cmd.keywords?.some(k => k.includes(q))
    );
  }, [commands, query]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredCommands, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '15vh',
    },
    container: {
      width: '100%',
      maxWidth: '560px',
      background: 'var(--color-bg-elevated)',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      overflow: 'hidden',
    },
    inputWrapper: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px',
      borderBottom: '1px solid var(--color-border)',
    },
    searchIcon: {
      color: 'var(--color-text-muted)',
      flexShrink: 0,
    },
    input: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: '16px',
      color: 'var(--color-text-primary)',
      fontFamily: 'inherit',
    },
    shortcut: {
      padding: '4px 8px',
      background: 'var(--color-bg-glass)',
      borderRadius: '4px',
      fontSize: '11px',
      color: 'var(--color-text-muted)',
      fontFamily: 'monospace',
    },
    list: {
      maxHeight: '400px',
      overflow: 'auto',
      padding: '8px',
    },
    category: {
      fontSize: '11px',
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      padding: '8px 12px 4px',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 12px',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    itemSelected: {
      background: 'var(--color-accent)',
    },
    itemIcon: {
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-glass)',
      borderRadius: '8px',
      color: 'var(--color-text-secondary)',
    },
    itemContent: {
      flex: 1,
    },
    itemTitle: {
      fontSize: '14px',
      fontWeight: 500,
      color: 'var(--color-text-primary)',
    },
    itemSubtitle: {
      fontSize: '12px',
      color: 'var(--color-text-muted)',
      marginTop: '2px',
    },
    itemShortcut: {
      fontSize: '11px',
      color: 'var(--color-text-muted)',
      fontFamily: 'monospace',
      padding: '2px 6px',
      background: 'var(--color-bg-glass)',
      borderRadius: '4px',
    },
    empty: {
      padding: '32px',
      textAlign: 'center',
      color: 'var(--color-text-muted)',
    },
  };

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  const categoryLabels: Record<string, string> = {
    app: 'Apps',
    action: 'Quick Actions',
    navigation: 'Navigation',
    settings: 'Settings',
    recent: 'Recent',
  };

  let itemIndex = -1;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={e => e.stopPropagation()}>
        <div style={styles.inputWrapper}>
          <span style={styles.searchIcon}>{Icons.search}</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            style={styles.input}
          />
          <span style={styles.shortcut}>ESC</span>
        </div>
        
        <div style={styles.list} ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div style={styles.empty}>No commands found</div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category}>
                <div style={styles.category}>{categoryLabels[category] || category}</div>
                {cmds.map(cmd => {
                  itemIndex++;
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      style={{
                        ...styles.item,
                        ...(isSelected ? styles.itemSelected : {}),
                        color: isSelected ? '#fff' : undefined,
                      }}
                      onClick={() => { cmd.action(); onClose(); }}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                    >
                      <div style={{
                        ...styles.itemIcon,
                        background: isSelected ? 'rgba(255,255,255,0.2)' : styles.itemIcon.background,
                        color: isSelected ? '#fff' : styles.itemIcon.color,
                      }}>
                        {cmd.icon}
                      </div>
                      <div style={styles.itemContent}>
                        <div style={{
                          ...styles.itemTitle,
                          color: isSelected ? '#fff' : styles.itemTitle.color,
                        }}>{cmd.title}</div>
                        {cmd.subtitle && (
                          <div style={{
                            ...styles.itemSubtitle,
                            color: isSelected ? 'rgba(255,255,255,0.7)' : styles.itemSubtitle.color,
                          }}>{cmd.subtitle}</div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <span style={{
                          ...styles.itemShortcut,
                          background: isSelected ? 'rgba(255,255,255,0.2)' : styles.itemShortcut.background,
                          color: isSelected ? '#fff' : styles.itemShortcut.color,
                        }}>{cmd.shortcut}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== HOOK ====================

export const useCommandPalette = (enabled: boolean = true) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Use Ctrl+Shift+P for command palette (Ctrl+K reserved for global search)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  useEffect(() => {
    if (!enabled && isOpen) {
      setIsOpen(false);
    }
  }, [enabled, isOpen]);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
};

export default CommandPalette;
