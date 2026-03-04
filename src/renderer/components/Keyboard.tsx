/**
 * DEX Keyboard Shortcuts Manager
 * Keyboard shortcut handling and display
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';

// ==================== TYPES ====================

interface Shortcut {
  id: string;
  keys: string[];
  description: string;
  action: () => void;
  category?: string;
  global?: boolean;
  disabled?: boolean;
}

interface KeyboardContextType {
  shortcuts: Shortcut[];
  registerShortcut: (shortcut: Shortcut) => void;
  unregisterShortcut: (id: string) => void;
  enableShortcut: (id: string) => void;
  disableShortcut: (id: string) => void;
  isShortcutEnabled: (id: string) => boolean;
}

interface KeyboardProviderProps {
  children: React.ReactNode;
  preventDefault?: boolean;
}

interface ShortcutBadgeProps {
  keys: string[];
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outlined' | 'minimal';
}

interface ShortcutListProps {
  shortcuts: Shortcut[];
  grouped?: boolean;
  searchable?: boolean;
}

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: Shortcut[];
}

// ==================== CONTEXT ====================

const KeyboardContext = createContext<KeyboardContextType | undefined>(undefined);

export const useKeyboard = () => {
  const context = useContext(KeyboardContext);
  if (!context) {
    throw new Error('useKeyboard must be used within a KeyboardProvider');
  }
  return context;
};

// ==================== KEYBOARD PROVIDER ====================

export const KeyboardProvider: React.FC<KeyboardProviderProps> = ({
  children,
  preventDefault = true,
}) => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const activeElementRef = useRef<Element | null>(null);

  const registerShortcut = useCallback((shortcut: Shortcut) => {
    setShortcuts(prev => {
      const existing = prev.find(s => s.id === shortcut.id);
      if (existing) {
        return prev.map(s => (s.id === shortcut.id ? shortcut : s));
      }
      return [...prev, shortcut];
    });
  }, []);

  const unregisterShortcut = useCallback((id: string) => {
    setShortcuts(prev => prev.filter(s => s.id !== id));
  }, []);

  const enableShortcut = useCallback((id: string) => {
    setShortcuts(prev =>
      prev.map(s => (s.id === id ? { ...s, disabled: false } : s))
    );
  }, []);

  const disableShortcut = useCallback((id: string) => {
    setShortcuts(prev =>
      prev.map(s => (s.id === id ? { ...s, disabled: true } : s))
    );
  }, []);

  const isShortcutEnabled = useCallback((id: string) => {
    const shortcut = shortcuts.find(s => s.id === id);
    return shortcut ? !shortcut.disabled : false;
  }, [shortcuts]);

  const parseKeyString = useCallback((keys: string[]): Set<string> => {
    const normalized = new Set<string>();
    keys.forEach(key => {
      const lower = key.toLowerCase();
      if (lower === 'ctrl' || lower === 'control') {
        normalized.add('control');
      } else if (lower === 'cmd' || lower === 'meta' || lower === 'command') {
        normalized.add('meta');
      } else if (lower === 'alt' || lower === 'option') {
        normalized.add('alt');
      } else if (lower === 'shift') {
        normalized.add('shift');
      } else {
        normalized.add(lower);
      }
    });
    return normalized;
  }, []);

  const matchesShortcut = useCallback((
    e: KeyboardEvent,
    shortcutKeys: string[]
  ): boolean => {
    const expected = parseKeyString(shortcutKeys);
    const pressed = new Set<string>();

    if (e.ctrlKey) pressed.add('control');
    if (e.metaKey) pressed.add('meta');
    if (e.altKey) pressed.add('alt');
    if (e.shiftKey) pressed.add('shift');
    pressed.add(e.key.toLowerCase());

    if (expected.size !== pressed.size) return false;
    for (const key of expected) {
      if (!pressed.has(key)) return false;
    }
    return true;
  }, [parseKeyString]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input field unless shortcut is global
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        if (shortcut.disabled) continue;
        if (isInput && !shortcut.global) continue;

        if (matchesShortcut(e, shortcut.keys)) {
          if (preventDefault) {
            e.preventDefault();
            e.stopPropagation();
          }
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, matchesShortcut, preventDefault]);

  return (
    <KeyboardContext.Provider
      value={{
        shortcuts,
        registerShortcut,
        unregisterShortcut,
        enableShortcut,
        disableShortcut,
        isShortcutEnabled,
      }}
    >
      {children}
    </KeyboardContext.Provider>
  );
};

// ==================== SHORTCUT BADGE ====================

export const ShortcutBadge: React.FC<ShortcutBadgeProps> = ({
  keys,
  size = 'md',
  variant = 'default',
}) => {
  const sizeConfig = {
    sm: { fontSize: 10, padding: '2px 4px', gap: 2 },
    md: { fontSize: 11, padding: '3px 6px', gap: 3 },
    lg: { fontSize: 12, padding: '4px 8px', gap: 4 },
  };

  const config = sizeConfig[size];

  const formatKey = (key: string): string => {
    const keyMap: Record<string, string> = {
      ctrl: '⌃',
      control: '⌃',
      cmd: '⌘',
      meta: '⌘',
      command: '⌘',
      alt: '⌥',
      option: '⌥',
      shift: '⇧',
      enter: '↵',
      return: '↵',
      backspace: '⌫',
      delete: '⌦',
      escape: 'Esc',
      esc: 'Esc',
      tab: '⇥',
      arrowup: 'arrow-up',
      arrowdown: 'arrow-down',
      arrowleft: 'arrow-left',
      arrowright: 'arrow-right',
      space: '␣',
    };

    const lower = key.toLowerCase();
    return keyMap[lower] || key.toUpperCase();
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'outlined':
        return {
          background: 'transparent',
          border: '1px solid var(--color-border)',
        };
      case 'minimal':
        return {
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--color-text-muted)',
        };
      default:
        return {
          background: 'var(--color-bg-tertiary)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 1px 0 rgba(0, 0, 0, 0.1)',
        };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: config.gap,
    },
    key: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 16,
      padding: config.padding,
      borderRadius: 4,
      fontSize: config.fontSize,
      fontWeight: 500,
      fontFamily: 'system-ui',
      color: 'var(--color-text-secondary)',
      ...getVariantStyles(),
    },
    separator: {
      fontSize: config.fontSize,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <span style={styles.container}>
      {keys.map((key, index) => (
        <React.Fragment key={key + index}>
          <span style={styles.key}>{formatKey(key)}</span>
          {variant === 'minimal' && index < keys.length - 1 && (
            <span style={styles.separator}>+</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
};

// ==================== SHORTCUT LIST ====================

export const ShortcutList: React.FC<ShortcutListProps> = ({
  shortcuts,
  grouped = true,
  searchable = true,
}) => {
  const [search, setSearch] = useState('');

  const filteredShortcuts = shortcuts.filter(s =>
    s.description.toLowerCase().includes(search.toLowerCase()) ||
    s.keys.some(k => k.toLowerCase().includes(search.toLowerCase()))
  );

  const groupedShortcuts = grouped
    ? filteredShortcuts.reduce((acc, shortcut) => {
        const category = shortcut.category || 'General';
        if (!acc[category]) acc[category] = [];
        acc[category].push(shortcut);
        return acc;
      }, {} as Record<string, Shortcut[]>)
    : { All: filteredShortcuts };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    search: {
      padding: '10px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text)',
      outline: 'none',
    },
    group: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    groupTitle: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: 4,
    },
    shortcut: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      borderRadius: 6,
    },
    description: {
      fontSize: 13,
      color: 'var(--color-text)',
    },
    disabled: {
      opacity: 0.5,
    },
    noResults: {
      textAlign: 'center',
      padding: 32,
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
  };

  return (
    <div style={styles.container}>
      {searchable && (
        <input
          style={styles.search}
          type="text"
          placeholder="Search shortcuts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      {Object.entries(groupedShortcuts).map(([category, items]) => (
        <div key={category} style={styles.group}>
          {grouped && <h4 style={styles.groupTitle}>{category}</h4>}
          {items.map(shortcut => (
            <div
              key={shortcut.id}
              style={{
                ...styles.shortcut,
                ...(shortcut.disabled ? styles.disabled : {}),
              }}
            >
              <span style={styles.description}>{shortcut.description}</span>
              <ShortcutBadge keys={shortcut.keys} />
            </div>
          ))}
        </div>
      ))}

      {filteredShortcuts.length === 0 && (
        <div style={styles.noResults}>No shortcuts found</div>
      )}
    </div>
  );
};

// ==================== SHORTCUT HELP MODAL ====================

export const ShortcutHelp: React.FC<ShortcutHelpProps> = ({
  isOpen,
  onClose,
  shortcuts,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modal: {
      background: 'var(--color-bg-primary)',
      borderRadius: 12,
      width: '100%',
      maxWidth: 600,
      maxHeight: '80vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottom: '1px solid var(--color-border)',
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    closeButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      background: 'transparent',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 18,
      color: 'var(--color-text-muted)',
    },
    content: {
      padding: 20,
      overflowY: 'auto',
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 20px',
      borderTop: '1px solid var(--color-border)',
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Keyboard Shortcuts</h2>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>
        <div style={styles.content}>
          <ShortcutList shortcuts={shortcuts} grouped searchable />
        </div>
        <div style={styles.footer}>
          <span>Press <ShortcutBadge keys={['?']} size="sm" /> to toggle this help</span>
          <span>{shortcuts.length} shortcuts</span>
        </div>
      </div>
    </div>
  );
};

// ==================== USE SHORTCUT HOOK ====================

export const useShortcut = (
  keys: string[],
  action: () => void,
  options: {
    id?: string;
    description?: string;
    category?: string;
    global?: boolean;
    disabled?: boolean;
  } = {}
) => {
  const shortcutRef = useRef<Shortcut | null>(null);

  useEffect(() => {
    const id = options.id || `shortcut-${keys.join('-')}-${Date.now()}`;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (options.disabled) return;

      // Check if in input
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInput && !options.global) return;

      // Match shortcut
      const pressed = new Set<string>();
      if (e.ctrlKey) pressed.add('ctrl');
      if (e.metaKey) pressed.add('cmd');
      if (e.altKey) pressed.add('alt');
      if (e.shiftKey) pressed.add('shift');
      pressed.add(e.key.toLowerCase());

      const expected = new Set(keys.map(k => k.toLowerCase()));
      
      if (pressed.size === expected.size) {
        let match = true;
        for (const k of expected) {
          if (!pressed.has(k)) {
            match = false;
            break;
          }
        }
        if (match) {
          e.preventDefault();
          action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keys, action, options]);

  return shortcutRef.current;
};

// ==================== KEYBOARD EVENT DISPLAY ====================

interface KeyboardEventDisplayProps {
  showModifiers?: boolean;
  className?: string;
}

export const KeyboardEventDisplay: React.FC<KeyboardEventDisplayProps> = ({
  showModifiers = true,
}) => {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const newKeys: string[] = [];
      if (showModifiers) {
        if (e.ctrlKey) newKeys.push('Ctrl');
        if (e.metaKey) newKeys.push('Cmd');
        if (e.altKey) newKeys.push('Alt');
        if (e.shiftKey) newKeys.push('Shift');
      }
      newKeys.push(e.key);
      setKeys(newKeys);

      // Clear after a delay
      setTimeout(() => setKeys([]), 1000);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModifiers]);

  if (keys.length === 0) return null;

  const styles: React.CSSProperties = {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 20px',
    background: 'var(--color-bg-elevated)',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
    zIndex: 9999,
  };

  return (
    <div style={styles}>
      <ShortcutBadge keys={keys} size="lg" />
    </div>
  );
};

export default KeyboardProvider;
