/**
 * DEX Shortcut Components
 * Keyboard shortcut management and display
 */

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface Shortcut {
  id: string;
  keys: string[];
  label: string;
  description?: string;
  category?: string;
  action: () => void;
  enabled?: boolean;
}

interface ShortcutContextType {
  shortcuts: Shortcut[];
  registerShortcut: (shortcut: Shortcut) => void;
  unregisterShortcut: (id: string) => void;
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

interface ShortcutProviderProps {
  children: React.ReactNode;
  enabled?: boolean;
}

interface ShortcutDisplayProps {
  keys: string[];
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled' | 'outline';
}

interface ShortcutListProps {
  shortcuts: Shortcut[];
  searchable?: boolean;
  groupByCategory?: boolean;
}

// ==================== CONTEXT ====================

const ShortcutContext = createContext<ShortcutContextType | null>(null);

export const useShortcuts = () => {
  const context = useContext(ShortcutContext);
  if (!context) throw new Error('useShortcuts must be used within ShortcutProvider');
  return context;
};

// ==================== PROVIDER ====================

export const ShortcutProvider: React.FC<ShortcutProviderProps> = ({
  children,
  enabled: initialEnabled = true,
}) => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [isEnabled, setEnabled] = useState(initialEnabled);

  const registerShortcut = useCallback((shortcut: Shortcut) => {
    setShortcuts(prev => {
      const existing = prev.find(s => s.id === shortcut.id);
      if (existing) {
        return prev.map(s => s.id === shortcut.id ? shortcut : s);
      }
      return [...prev, shortcut];
    });
  }, []);

  const unregisterShortcut = useCallback((id: string) => {
    setShortcuts(prev => prev.filter(s => s.id !== id));
  }, []);

  // Key mapping for display
  const getKeyCode = (key: string): string => {
    const keyMap: Record<string, string> = {
      ctrl: 'Control',
      cmd: 'Meta',
      alt: 'Alt',
      shift: 'Shift',
      enter: 'Enter',
      escape: 'Escape',
      esc: 'Escape',
      tab: 'Tab',
      space: ' ',
      backspace: 'Backspace',
      delete: 'Delete',
      arrowup: 'ArrowUp',
      arrowdown: 'ArrowDown',
      arrowleft: 'ArrowLeft',
      arrowright: 'ArrowRight',
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    };

    return keyMap[key.toLowerCase()] || key;
  };

  // Handle keyboard events
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Find matching shortcut
      for (const shortcut of shortcuts) {
        if (shortcut.enabled === false) continue;

        const requiredKeys = shortcut.keys.map(k => getKeyCode(k).toLowerCase());
        const pressedKeys: string[] = [];

        if (e.ctrlKey) pressedKeys.push('control');
        if (e.metaKey) pressedKeys.push('meta');
        if (e.altKey) pressedKeys.push('alt');
        if (e.shiftKey) pressedKeys.push('shift');
        pressedKeys.push(e.key.toLowerCase());

        // Check if all required keys are pressed
        const allRequired = requiredKeys.every(k => pressedKeys.includes(k));
        const noExtra = pressedKeys.every(k =>
          requiredKeys.includes(k) ||
          (k === 'control' && requiredKeys.includes('ctrl')) ||
          (k === 'meta' && requiredKeys.includes('cmd'))
        );

        if (allRequired && noExtra) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, isEnabled]);

  return (
    <ShortcutContext.Provider
      value={{
        shortcuts,
        registerShortcut,
        unregisterShortcut,
        isEnabled,
        setEnabled,
      }}
    >
      {children}
    </ShortcutContext.Provider>
  );
};

// ==================== SHORTCUT DISPLAY ====================

export const ShortcutDisplay: React.FC<ShortcutDisplayProps> = ({
  keys,
  size = 'md',
  variant = 'default',
}) => {
  const sizes = {
    sm: { padding: '2px 4px', fontSize: 10, gap: 2 },
    md: { padding: '3px 6px', fontSize: 11, gap: 4 },
    lg: { padding: '4px 8px', fontSize: 12, gap: 6 },
  };

  const variants = {
    default: {
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border)',
      color: 'var(--color-text)',
    },
    filled: {
      background: 'var(--color-text-muted)',
      border: 'none',
      color: 'var(--color-bg-primary)',
    },
    outline: {
      background: 'transparent',
      border: '1px solid var(--color-border)',
      color: 'var(--color-text-muted)',
    },
  };

  const displayKey = (key: string): string => {
    const displayMap: Record<string, string> = {
      ctrl: '⌃',
      cmd: '⌘',
      alt: '⌥',
      shift: '⇧',
      enter: '↵',
      escape: 'Esc',
      esc: 'Esc',
      backspace: '⌫',
      delete: '⌦',
      tab: '⇥',
      space: '␣',
      arrowup: 'arrow-up',
      arrowdown: 'arrow-down',
      arrowleft: 'arrow-left',
      arrowright: 'arrow-right',
      up: 'arrow-up',
      down: 'arrow-down',
      left: 'arrow-left',
      right: 'arrow-right',
    };

    const lowerKey = key.toLowerCase();
    return displayMap[lowerKey] || key.toUpperCase();
  };

  const s = sizes[size];
  const v = variants[variant];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: s.gap,
    },
    key: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 20,
      padding: s.padding,
      borderRadius: 4,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: s.fontSize,
      fontWeight: 500,
      ...v,
    },
    separator: {
      fontSize: s.fontSize,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <span style={styles.container}>
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          <kbd style={styles.key}>{displayKey(key)}</kbd>
          {index < keys.length - 1 && (
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
  searchable = true,
  groupByCategory = true,
}) => {
  const [search, setSearch] = useState('');

  const filteredShortcuts = shortcuts.filter(s =>
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase()) ||
    s.keys.some(k => k.toLowerCase().includes(search.toLowerCase()))
  );

  const groupedShortcuts = groupByCategory
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
      padding: '10px 14px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      fontSize: 14,
      color: 'var(--color-text)',
      outline: 'none',
    },
    category: {
      marginBottom: 16,
    },
    categoryTitle: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: 12,
      paddingBottom: 8,
      borderBottom: '1px solid var(--color-border)',
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      borderRadius: 8,
      transition: 'background 0.15s',
    },
    itemContent: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
    label: {
      fontSize: 14,
      color: 'var(--color-text)',
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    empty: {
      padding: 24,
      textAlign: 'center',
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
  };

  return (
    <div style={styles.container as any}>
      {searchable && (
        <input
          type="text"
          placeholder="Search shortcuts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.search}
        />
      )}

      {Object.entries(groupedShortcuts).map(([category, items]) => (
        <div key={category} style={styles.category}>
          {groupByCategory && (
            <div style={styles.categoryTitle}>{category}</div>
          )}

          <div style={styles.list as any}>
            {items.map(shortcut => (
              <div
                key={shortcut.id}
                style={styles.item}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <div style={styles.itemContent as any}>
                  <span style={styles.label}>{shortcut.label}</span>
                  {shortcut.description && (
                    <span style={styles.description}>{shortcut.description}</span>
                  )}
                </div>
                <ShortcutDisplay keys={shortcut.keys} size="sm" />
              </div>
            ))}
          </div>
        </div>
      ))}

      {filteredShortcuts.length === 0 && (
        <div style={styles.empty as any}>No shortcuts found</div>
      )}
    </div>
  );
};

// ==================== USE SHORTCUT HOOK ====================

export const useShortcut = (
  keys: string[],
  action: () => void,
  options?: {
    enabled?: boolean;
    id?: string;
    label?: string;
    description?: string;
    category?: string;
  }
) => {
  const { registerShortcut, unregisterShortcut } = useShortcuts();

  const id = options?.id || keys.join('-');

  useEffect(() => {
    registerShortcut({
      id,
      keys,
      label: options?.label || keys.join(' + '),
      description: options?.description,
      category: options?.category,
      action,
      enabled: options?.enabled ?? true,
    });

    return () => unregisterShortcut(id);
  }, [id, keys, action, options?.enabled, options?.label, options?.description, options?.category]);
};

// ==================== SHORTCUT RECORDER ====================

interface ShortcutRecorderProps {
  value: string[];
  onChange: (keys: string[]) => void;
  placeholder?: string;
  maxKeys?: number;
}

export const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({
  value,
  onChange,
  placeholder = 'Press keys to record shortcut...',
  maxKeys = 4,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const key = e.key;
      const keys: string[] = [];

      if (e.ctrlKey && key !== 'Control') keys.push('Ctrl');
      if (e.metaKey && key !== 'Meta') keys.push('Cmd');
      if (e.altKey && key !== 'Alt') keys.push('Alt');
      if (e.shiftKey && key !== 'Shift') keys.push('Shift');

      if (!['Control', 'Meta', 'Alt', 'Shift'].includes(key)) {
        keys.push(key.length === 1 ? key.toUpperCase() : key);
      }

      if (keys.length > 0 && keys.length <= maxKeys) {
        setRecordedKeys(keys);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (recordedKeys.length > 0) {
        onChange(recordedKeys);
        setIsRecording(false);
        setRecordedKeys([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecording, recordedKeys, maxKeys, onChange]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    recorder: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      padding: '10px 14px',
      background: isRecording
        ? 'rgba(59, 130, 246, 0.1)'
        : 'var(--color-bg-secondary)',
      border: `2px solid ${isRecording ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 8,
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    placeholder: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
    },
    clearButton: {
      padding: '8px 12px',
      background: 'none',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 13,
    },
  };

  return (
    <div style={styles.container}>
      <div
        style={styles.recorder}
        onClick={() => setIsRecording(true)}
        onBlur={() => {
          setIsRecording(false);
          setRecordedKeys([]);
        }}
        tabIndex={0}
      >
        {isRecording && recordedKeys.length > 0 ? (
          <ShortcutDisplay keys={recordedKeys} />
        ) : value.length > 0 ? (
          <ShortcutDisplay keys={value} />
        ) : (
          <span style={styles.placeholder}>
            {isRecording ? 'Recording...' : placeholder}
          </span>
        )}
      </div>

      {value.length > 0 && (
        <button
          style={styles.clearButton}
          onClick={() => onChange([])}
        >
          Clear
        </button>
      )}
    </div>
  );
};

// ==================== KEYBOARD HINTS ====================

interface KeyboardHintsProps {
  hints: Array<{
    keys: string[];
    label: string;
  }>;
  position?: 'bottom' | 'top';
}

export const KeyboardHints: React.FC<KeyboardHintsProps> = ({
  hints,
  position = 'bottom',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 16,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      borderTop: position === 'bottom' ? '1px solid var(--color-border)' : undefined,
      borderBottom: position === 'top' ? '1px solid var(--color-border)' : undefined,
    },
    hint: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    label: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={styles.container as any}>
      {hints.map((hint, index) => (
        <div key={index} style={styles.hint}>
          <ShortcutDisplay keys={hint.keys} size="sm" />
          <span style={styles.label}>{hint.label}</span>
        </div>
      ))}
    </div>
  );
};

export default ShortcutDisplay;
