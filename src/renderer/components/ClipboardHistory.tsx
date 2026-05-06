// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Clipboard History
 * Access past clipboard items with search
 * Ctrl+Shift+V to open
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';

// ==================== TYPES ====================

interface ClipboardItem {
  id: string;
  content: string;
  type: 'text' | 'image' | 'file';
  timestamp: number;
  preview?: string;
}

interface ClipboardHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (content: string) => void;
}

// ==================== ICONS ====================

const Icons = {
  clipboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  text: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>,
  image: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  copy: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 17v5M9 11V6a3 3 0 016 0v5M5 11h14l-1 6H6l-1-6z"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
};

// ==================== STORAGE ====================

const STORAGE_KEY = 'dex-clipboard-history';
const MAX_ITEMS = 50;

const loadHistory = (): ClipboardItem[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const saveHistory = (items: ClipboardItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch { /* clipboard unavailable */ }
};

// ==================== COMPONENT ====================

export const ClipboardHistory: React.FC<ClipboardHistoryProps> = ({ isOpen, onClose, onSelect }) => {
  const [history, setHistory] = useState<ClipboardItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pinnedItems, setPinnedItems] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
    try {
      const savedPins = localStorage.getItem('dex-clipboard-pinned');
      if (savedPins) setPinnedItems(new Set(JSON.parse(savedPins)));
    } catch { /* ignore corrupted pins */ }
  }, []);

  // Monitor clipboard
  useEffect(() => {
    if (!isOpen) return;

    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setHistory(prev => {
            // Don't add duplicates
            if (prev[0]?.content === text) return prev;
            const newItem: ClipboardItem = {
              id: `clip-${Date.now()}`,
              content: text,
              type: 'text',
              timestamp: Date.now(),
              preview: text.slice(0, 100),
            };
            const updated = [newItem, ...prev.filter(i => i.content !== text)].slice(0, MAX_ITEMS);
            saveHistory(updated);
            return updated;
          });
        }
      } catch { /* clipboard unavailable */ }
    };

    checkClipboard();
    const interval = setInterval(checkClipboard, 5000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter items
  const filteredItems = useMemo(() => query.trim()
    ? history.filter(item => item.content.toLowerCase().includes(query.toLowerCase()))
    : history, [query, history]);

  // Sort: pinned first
  const sortedItems = useMemo(() => [...filteredItems].sort((a, b) => {
    const aPinned = pinnedItems.has(a.id);
    const bPinned = pinnedItems.has(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  }), [filteredItems, pinnedItems]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, sortedItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (sortedItems[selectedIndex]) {
          handleSelect(sortedItems[selectedIndex].content);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Delete':
        if (e.shiftKey && sortedItems[selectedIndex]) {
          handleDelete(sortedItems[selectedIndex].id);
        }
        break;
    }
  }, [sortedItems, selectedIndex, onClose]);

  const handleSelect = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      onSelect(content);
      onClose();
    } catch { /* clipboard unavailable */ }
  };

  const handleDelete = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(i => i.id !== id);
      saveHistory(updated);
      return updated;
    });
  };

  const handlePin = (id: string) => {
    setPinnedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      localStorage.setItem('dex-clipboard-pinned', JSON.stringify([...newSet]));
      return newSet;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'var(--color-bg-elevated)',
      zIndex: 'var(--z-modal)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '15vh',
    },
    container: {
      width: '100%',
      maxWidth: '480px',
      background: 'var(--color-bg-elevated)',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px',
      borderBottom: '1px solid var(--color-border)',
    },
    headerIcon: {
      color: 'var(--color-text-muted)',
    },
    title: {
      flex: 1,
      fontSize: '14px',
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
    clearBtn: {
      padding: '4px 8px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '4px',
      fontSize: '11px',
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
    },
    searchWrapper: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 16px',
      borderBottom: '1px solid var(--color-border)',
    },
    searchIcon: {
      color: 'var(--color-text-muted)',
    },
    searchInput: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: '14px',
      color: 'var(--color-text-primary)',
    },
    list: {
      maxHeight: '360px',
      overflow: 'auto',
    },
    item: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '12px 16px',
      cursor: 'pointer',
      borderBottom: '1px solid var(--color-border-subtle)',
      transition: 'background 0.1s',
    },
    itemSelected: {
      background: 'var(--color-accent)',
    },
    itemIcon: {
      width: '28px',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-glass)',
      borderRadius: '6px',
      color: 'var(--color-text-muted)',
      flexShrink: 0,
    },
    itemContent: {
      flex: 1,
      minWidth: 0,
    },
    itemPreview: {
      fontSize: '13px',
      color: 'var(--color-text-primary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    itemMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '4px',
    },
    itemTime: {
      fontSize: '11px',
      color: 'var(--color-text-muted)',
    },
    itemPinned: {
      fontSize: '10px',
      color: 'var(--color-accent)',
      fontWeight: 500,
    },
    itemActions: {
      display: 'flex',
      gap: '4px',
      opacity: 0,
      transition: 'opacity 0.15s',
    },
    actionBtn: {
      padding: '4px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: {
      padding: '48px 24px',
      textAlign: 'center',
      color: 'var(--color-text-muted)',
    },
    emptyIcon: {
      marginBottom: '12px',
      opacity: 0.5,
    },
  };

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={styles.container} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.headerIcon}>{Icons.clipboard}</span>
          <span style={styles.title}>Clipboard History</span>
          {history.length > 0 && (
            <button style={styles.clearBtn} onClick={clearHistory} aria-label="Clear clipboard history">Clear All</button>
          )}
        </div>

        <div style={styles.searchWrapper}>
          <span style={styles.searchIcon}>{Icons.search}</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search clipboard..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.list}>
          {sortedItems.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>{Icons.clipboard}</div>
              <div>No clipboard items</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                Copy something to see it here
              </div>
            </div>
          ) : (
            sortedItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const isPinned = pinnedItems.has(item.id);
              return (
                <div
                  key={item.id}
                  style={{
                    ...styles.item,
                    ...(isSelected ? styles.itemSelected : {}),
                  }}
                  onClick={() => handleSelect(item.content)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div style={{
                    ...styles.itemIcon,
                    background: isSelected ? 'var(--color-text-tertiary)' : styles.itemIcon.background,
                    color: isSelected ? '#fff' : styles.itemIcon.color,
                  }}>
                    {item.type === 'text' ? Icons.text : item.type === 'image' ? Icons.image : Icons.file}
                  </div>
                  <div style={styles.itemContent}>
                    <div style={{
                      ...styles.itemPreview,
                      color: isSelected ? '#fff' : styles.itemPreview.color,
                    }}>
                      {item.preview || item.content}
                    </div>
                    <div style={styles.itemMeta}>
                      <span style={{
                        ...styles.itemTime,
                        color: isSelected ? 'var(--color-text-secondary)' : styles.itemTime.color,
                      }}>{formatTime(item.timestamp)}</span>
                      {isPinned && <span style={styles.itemPinned}>Pinned</span>}
                    </div>
                  </div>
                  <div style={{
                    ...styles.itemActions,
                    opacity: isSelected ? 1 : 0,
                  }}>
                    <button
                      style={{
                        ...styles.actionBtn,
                        color: isPinned ? 'var(--color-accent)' : styles.actionBtn.color,
                      }}
                      onClick={e => { e.stopPropagation(); handlePin(item.id); }}
                      title="Pin"
                    >
                      {Icons.pin}
                    </button>
                    <button
                      style={styles.actionBtn}
                      onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                      title="Delete"
                    >
                      {Icons.trash}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== HOOK ====================

export const useClipboardHistory = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
};

export default memo(ClipboardHistory);
