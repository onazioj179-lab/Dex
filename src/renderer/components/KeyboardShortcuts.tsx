/**
 * DEX Keyboard Shortcuts Manager
 * Global keyboard shortcut handling with customization support
 */
import React, { useState, useEffect } from 'react';

// Default keyboard shortcuts
export const DEFAULT_SHORTCUTS: Record<string, ShortcutConfig> = {
  // Global

  'toggle-theme': { key: 'T', modifiers: ['ctrl', 'shift'], description: 'Toggle Dark/Light Mode', category: 'Global' },
  'global-search': { key: 'F', modifiers: ['ctrl', 'shift'], description: 'Global Search', category: 'Global' },
  'close-app': { key: 'W', modifiers: ['ctrl'], description: 'Close Current App', category: 'Global' },
  'settings': { key: ',', modifiers: ['ctrl'], description: 'Open Settings', category: 'Global' },
  'reload': { key: 'R', modifiers: ['ctrl', 'shift'], description: 'Reload App', category: 'Global' },
  'fullscreen': { key: 'F11', modifiers: [], description: 'Toggle Fullscreen', category: 'Global' },
  
  // Navigation
  'home': { key: 'H', modifiers: ['ctrl', 'shift'], description: 'Go to Home', category: 'Navigation' },
  'files': { key: 'E', modifiers: ['ctrl'], description: 'Open Files', category: 'Navigation' },
  'next-app': { key: 'Tab', modifiers: ['ctrl'], description: 'Next App', category: 'Navigation' },
  'prev-app': { key: 'Tab', modifiers: ['ctrl', 'shift'], description: 'Previous App', category: 'Navigation' },
  
  // Editor Common
  'save': { key: 'S', modifiers: ['ctrl'], description: 'Save', category: 'Editor' },
  'save-as': { key: 'S', modifiers: ['ctrl', 'shift'], description: 'Save As', category: 'Editor' },
  'undo': { key: 'Z', modifiers: ['ctrl'], description: 'Undo', category: 'Editor' },
  'redo': { key: 'Y', modifiers: ['ctrl'], description: 'Redo', category: 'Editor' },
  'cut': { key: 'X', modifiers: ['ctrl'], description: 'Cut', category: 'Editor' },
  'copy': { key: 'C', modifiers: ['ctrl'], description: 'Copy', category: 'Editor' },
  'paste': { key: 'V', modifiers: ['ctrl'], description: 'Paste', category: 'Editor' },
  'select-all': { key: 'A', modifiers: ['ctrl'], description: 'Select All', category: 'Editor' },
  'delete': { key: 'Delete', modifiers: [], description: 'Delete', category: 'Editor' },
  'duplicate': { key: 'D', modifiers: ['ctrl'], description: 'Duplicate', category: 'Editor' },
  
  // Imosion DAW
  'daw-play': { key: 'Space', modifiers: [], description: 'Play/Pause', category: 'Imosion' },
  'daw-stop': { key: 'Space', modifiers: ['shift'], description: 'Stop', category: 'Imosion' },
  'daw-record': { key: 'R', modifiers: ['ctrl'], description: 'Record', category: 'Imosion' },
  'daw-loop': { key: 'L', modifiers: ['ctrl'], description: 'Toggle Loop', category: 'Imosion' },
  'daw-metronome': { key: 'M', modifiers: ['ctrl'], description: 'Toggle Metronome', category: 'Imosion' },
  'daw-zoom-in': { key: '=', modifiers: ['ctrl'], description: 'Zoom In', category: 'Imosion' },
  'daw-zoom-out': { key: '-', modifiers: ['ctrl'], description: 'Zoom Out', category: 'Imosion' },
  'daw-add-track': { key: 'T', modifiers: ['ctrl'], description: 'Add Track', category: 'Imosion' },
  'daw-split': { key: 'B', modifiers: [], description: 'Split Clip', category: 'Imosion' },
  'daw-delete-clip': { key: 'Delete', modifiers: [], description: 'Delete Clip', category: 'Imosion' },
  
  // Video Editor
  'video-play': { key: 'Space', modifiers: [], description: 'Play/Pause', category: 'Video' },
  'video-razor': { key: 'C', modifiers: [], description: 'Razor Tool', category: 'Video' },
  'video-select': { key: 'V', modifiers: [], description: 'Selection Tool', category: 'Video' },
  'video-ripple': { key: 'B', modifiers: [], description: 'Ripple Delete', category: 'Video' },
  'video-in': { key: 'I', modifiers: [], description: 'Mark In', category: 'Video' },
  'video-out': { key: 'O', modifiers: [], description: 'Mark Out', category: 'Video' },
  'video-export': { key: 'E', modifiers: ['ctrl', 'shift'], description: 'Export', category: 'Video' },
  
  // Prism Image Editor
  'prism-brush': { key: 'B', modifiers: [], description: 'Brush Tool', category: 'Prism' },
  'prism-eraser': { key: 'E', modifiers: [], description: 'Eraser Tool', category: 'Prism' },
  'prism-move': { key: 'V', modifiers: [], description: 'Move Tool', category: 'Prism' },
  'prism-zoom': { key: 'Z', modifiers: [], description: 'Zoom Tool', category: 'Prism' },
  'prism-crop': { key: 'C', modifiers: [], description: 'Crop Tool', category: 'Prism' },
  'prism-text': { key: 'T', modifiers: [], description: 'Text Tool', category: 'Prism' },
  'prism-new-layer': { key: 'N', modifiers: ['ctrl', 'shift'], description: 'New Layer', category: 'Prism' },
  
  // Flux Motion Graphics
  'flux-preview': { key: 'Space', modifiers: [], description: 'Preview', category: 'Flux' },
  'flux-keyframe': { key: 'K', modifiers: [], description: 'Add Keyframe', category: 'Flux' },
  'flux-ease': { key: 'F9', modifiers: [], description: 'Easy Ease', category: 'Flux' },
};

interface ShortcutConfig {
  key: string;
  modifiers: ('ctrl' | 'shift' | 'alt' | 'meta')[];
  description: string;
  category: string;
}

// Get custom shortcuts from localStorage
export const getShortcuts = (): Record<string, ShortcutConfig> => {
  try {
    const saved = localStorage.getItem('dex-shortcuts');
    if (saved) {
      return { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) };
    }
  } catch { /* shortcut registration failed */ }
  return { ...DEFAULT_SHORTCUTS };
};

// Save custom shortcut
export const saveShortcut = (id: string, config: ShortcutConfig) => {
  const current = getShortcuts();
  current[id] = config;
  localStorage.setItem('dex-shortcuts', JSON.stringify(current));
};

// Reset shortcuts to default
export const resetShortcuts = () => {
  localStorage.removeItem('dex-shortcuts');
};

// Format shortcut for display
export const formatShortcut = (config: ShortcutConfig): string => {
  const parts = [];
  if (config.modifiers.includes('ctrl')) parts.push('Ctrl');
  if (config.modifiers.includes('shift')) parts.push('Shift');
  if (config.modifiers.includes('alt')) parts.push('Alt');
  if (config.modifiers.includes('meta')) parts.push('Cmd');
  parts.push(config.key);
  return parts.join('+');
};

// Check if keyboard event matches shortcut
export const matchesShortcut = (e: KeyboardEvent, config: ShortcutConfig): boolean => {
  const keyMatch = e.key.toLowerCase() === config.key.toLowerCase() || e.code === `Key${config.key}`;
  const ctrlMatch = config.modifiers.includes('ctrl') === (e.ctrlKey || e.metaKey);
  const shiftMatch = config.modifiers.includes('shift') === e.shiftKey;
  const altMatch = config.modifiers.includes('alt') === e.altKey;
  return keyMatch && ctrlMatch && shiftMatch && altMatch;
};

// Keyboard Shortcuts Editor Component
interface ShortcutEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutEditor: React.FC<ShortcutEditorProps> = ({ isOpen, onClose }) => {
  const [shortcuts, setShortcuts] = useState<Record<string, ShortcutConfig>>(getShortcuts());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = ['All', ...new Set(Object.values(shortcuts).map(s => s.category))];

  const filteredShortcuts = Object.entries(shortcuts).filter(([id, config]) => {
    const matchesCategory = filterCategory === 'All' || config.category === filterCategory;
    const matchesSearch = searchQuery === '' || 
      config.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleKeyCapture = (e: React.KeyboardEvent, id: string) => {
    if (editingId !== id) return;
    e.preventDefault();
    
    if (e.key === 'Escape') {
      setEditingId(null);
      return;
    }
    
    const modifiers: ('ctrl' | 'shift' | 'alt' | 'meta')[] = [];
    if (e.ctrlKey || e.metaKey) modifiers.push('ctrl');
    if (e.shiftKey) modifiers.push('shift');
    if (e.altKey) modifiers.push('alt');
    
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      const newConfig = { ...shortcuts[id], key: e.key, modifiers };
      saveShortcut(id, newConfig);
      setShortcuts(prev => ({ ...prev, [id]: newConfig }));
      setEditingId(null);
    }
  };

  const handleReset = () => {
    resetShortcuts();
    setShortcuts(getShortcuts());
  };

  if (!isOpen) return null;

  return (
    <div style={editorStyles.overlay} onClick={onClose}>
      <div style={editorStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={editorStyles.header}>
          <h2 style={editorStyles.title}>Keyboard Shortcuts</h2>
          <button onClick={onClose} style={editorStyles.closeBtn}>X</button>
        </div>

        <div style={editorStyles.toolbar}>
          <input
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={editorStyles.searchInput}
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={editorStyles.categorySelect}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button onClick={handleReset} style={editorStyles.resetBtn}>Reset All</button>
        </div>

        <div style={editorStyles.list}>
          {filteredShortcuts.map(([id, config]) => (
            <div
              key={id}
              style={{
                ...editorStyles.item,
                background: editingId === id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              }}
            >
              <div style={editorStyles.itemInfo}>
                <span style={editorStyles.itemDesc}>{config.description}</span>
                <span style={editorStyles.itemCategory}>{config.category}</span>
              </div>
              <div
                tabIndex={0}
                onClick={() => setEditingId(id)}
                onKeyDown={e => handleKeyCapture(e, id)}
                style={{
                  ...editorStyles.shortcutBadge,
                  borderColor: editingId === id ? '#3b82f6' : 'var(--color-border, #27272a)',
                }}
              >
                {editingId === id ? 'Press keys...' : formatShortcut(config)}
              </div>
            </div>
          ))}
        </div>

        <div style={editorStyles.footer}>
          <span style={editorStyles.hint}>Click on a shortcut and press new keys to change it</span>
        </div>
      </div>
    </div>
  );
};

const editorStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  modal: {
    width: 'min(600px, 92vw)',
    maxHeight: '70vh',
    background: 'var(--color-bg-primary, #18181b)',
    borderRadius: '12px',
    border: '1px solid var(--color-border, #27272a)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary, #fafafa)',
    margin: 0,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    cursor: 'pointer',
    fontSize: '16px',
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--color-border, #27272a)',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    background: 'var(--color-bg-secondary, #111113)',
    border: '1px solid var(--color-border, #27272a)',
    borderRadius: '6px',
    color: 'var(--color-text-primary, #fafafa)',
    fontSize: '13px',
    outline: 'none',
  },
  categorySelect: {
    padding: '8px 12px',
    background: 'var(--color-bg-secondary, #111113)',
    border: '1px solid var(--color-border, #27272a)',
    borderRadius: '6px',
    color: 'var(--color-text-primary, #fafafa)',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
  },
  resetBtn: {
    padding: '8px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    color: '#ef4444',
    fontSize: '12px',
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 12px',
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '6px',
    marginBottom: '4px',
  },
  itemInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  itemDesc: {
    fontSize: '13px',
    color: 'var(--color-text-primary, #fafafa)',
  },
  itemCategory: {
    fontSize: '11px',
    color: '#71717a',
  },
  shortcutBadge: {
    padding: '6px 12px',
    background: 'var(--color-bg-secondary, #111113)',
    border: '1px solid var(--color-border, #27272a)',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'monospace',
    color: '#a1a1aa',
    cursor: 'pointer',
    minWidth: '100px',
    textAlign: 'center',
    outline: 'none',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid var(--color-border, #27272a)',
    background: 'var(--color-bg-secondary, #111113)',
  },
  hint: {
    fontSize: '11px',
    color: '#71717a',
  },
};

export default ShortcutEditor;
