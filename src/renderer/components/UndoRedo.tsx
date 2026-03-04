/**
 * DEX Undo/Redo System Component
 * History management for undo/redo operations
 */

import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { UndoIcon, RedoIcon } from '../utils/icons';

// ==================== TYPES ====================

interface HistoryState<T> {
  data: T;
  timestamp: number;
  label?: string;
}

interface HistoryOptions {
  maxHistory?: number;
  debounceMs?: number;
}

interface UndoRedoContextType<T> {
  state: T;
  setState: (newState: T, label?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  historyLength: number;
  futureLength: number;
  clear: () => void;
  goTo: (index: number) => void;
  history: HistoryState<T>[];
}

interface UndoRedoProviderProps<T> {
  initialState: T;
  maxHistory?: number;
  debounceMs?: number;
  children: React.ReactNode;
  onChange?: (state: T) => void;
}

interface UndoRedoControlsProps {
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  showHistory?: boolean;
}

interface HistoryListProps<T> {
  renderItem?: (state: HistoryState<T>, index: number, isCurrent: boolean) => React.ReactNode;
  maxVisible?: number;
}

// ==================== CONTEXT ====================

const UndoRedoContext = createContext<UndoRedoContextType<any> | undefined>(undefined);

export function useUndoRedo<T>(): UndoRedoContextType<T> {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error('useUndoRedo must be used within an UndoRedoProvider');
  }
  return context;
}

// ==================== PROVIDER ====================

export function UndoRedoProvider<T>({
  initialState,
  maxHistory = 50,
  debounceMs = 0,
  children,
  onChange,
}: UndoRedoProviderProps<T>) {
  const [history, setHistory] = useState<HistoryState<T>[]>([
    { data: initialState, timestamp: Date.now() },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const state = history[currentIndex]?.data ?? initialState;
  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const setState = useCallback((newState: T, label?: string) => {
    const pushState = () => {
      setHistory(prev => {
        // Remove any future states when new state is added
        const newHistory = prev.slice(0, currentIndex + 1);
        
        // Add new state
        newHistory.push({
          data: newState,
          timestamp: Date.now(),
          label,
        });

        // Trim history if exceeds max
        if (newHistory.length > maxHistory) {
          newHistory.shift();
          return newHistory;
        }

        return newHistory;
      });

      setCurrentIndex(prev => Math.min(prev + 1, maxHistory - 1));
      onChange?.(newState);
    };

    if (debounceMs > 0) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(pushState, debounceMs);
    } else {
      pushState();
    }
  }, [currentIndex, maxHistory, debounceMs, onChange]);

  const undo = useCallback(() => {
    if (canUndo) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      onChange?.(history[newIndex].data);
    }
  }, [canUndo, currentIndex, history, onChange]);

  const redo = useCallback(() => {
    if (canRedo) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      onChange?.(history[newIndex].data);
    }
  }, [canRedo, currentIndex, history, onChange]);

  const clear = useCallback(() => {
    setHistory([{ data: state, timestamp: Date.now() }]);
    setCurrentIndex(0);
  }, [state]);

  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < history.length) {
      setCurrentIndex(index);
      onChange?.(history[index].data);
    }
  }, [history, onChange]);

  const contextValue: UndoRedoContextType<T> = {
    state,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    historyLength: currentIndex,
    futureLength: history.length - currentIndex - 1,
    clear,
    goTo,
    history,
  };

  return (
    <UndoRedoContext.Provider value={contextValue}>
      {children}
    </UndoRedoContext.Provider>
  );
}

// ==================== CONTROLS ====================

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({
  size = 'md',
  showLabels = false,
  showHistory = false,
}) => {
  const { undo, redo, canUndo, canRedo, historyLength, futureLength } = useUndoRedo();
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const sizes = {
    sm: { button: 28, icon: 12, gap: 4 },
    md: { button: 36, icon: 16, gap: 8 },
    lg: { button: 44, icon: 20, gap: 12 },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: s.gap,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      width: showLabels ? 'auto' : s.button,
      height: s.button,
      padding: showLabels ? '0 12px' : 0,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      cursor: 'pointer',
      color: 'var(--color-text)',
      fontSize: s.icon,
      transition: 'all 0.15s',
    },
    buttonDisabled: {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
    label: {
      fontSize: 12,
      fontWeight: 500,
    },
    divider: {
      width: 1,
      height: s.button - 8,
      background: 'var(--color-border)',
    },
    badge: {
      fontSize: 10,
      padding: '2px 6px',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 10,
      color: 'var(--color-text-muted)',
    },
    historyButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: s.button,
      height: s.button,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: s.icon - 2,
    },
  };

  return (
    <div style={styles.container}>
      <button
        style={{
          ...styles.button,
          ...(!canUndo ? styles.buttonDisabled : {}),
        }}
        onClick={undo}
        disabled={!canUndo}
        title={`Undo (${historyLength} available)`}
      >
        <UndoIcon size={14} />
        {showLabels && <span style={styles.label}>Undo</span>}
      </button>

      <button
        style={{
          ...styles.button,
          ...(!canRedo ? styles.buttonDisabled : {}),
        }}
        onClick={redo}
        disabled={!canRedo}
        title={`Redo (${futureLength} available)`}
      >
        <RedoIcon size={14} />
        {showLabels && <span style={styles.label}>Redo</span>}
      </button>

      {showHistory && (
        <>
          <div style={styles.divider} />
          <button
            style={styles.historyButton}
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            title="View History"
          >
            clipboard
          </button>
          <span style={styles.badge}>
            {historyLength + futureLength + 1}
          </span>
        </>
      )}
    </div>
  );
};

// ==================== HISTORY LIST ====================

export function HistoryList<T>({
  renderItem,
  maxVisible = 20,
}: HistoryListProps<T>) {
  const { history, goTo } = useUndoRedo<T>();
  const [currentIndex, setCurrentIndex] = useState(
    history.length - 1
  );

  // Get the actual current index from context
  React.useEffect(() => {
    // Find current index by checking which state matches
    const ctx = useUndoRedo<T>();
    // This would need to be tracked separately in a real implementation
  }, []);

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const visibleHistory = history.slice(-maxVisible);
  const offset = Math.max(0, history.length - maxVisible);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: 8,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      maxHeight: 300,
      overflow: 'auto',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 12px',
      background: 'transparent',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'background 0.15s',
      width: '100%',
    },
    itemCurrent: {
      background: 'rgba(var(--color-accent-rgb), 0.1)',
    },
    index: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      fontFamily: 'monospace',
      width: 24,
    },
    label: {
      flex: 1,
      fontSize: 13,
      color: 'var(--color-text)',
    },
    time: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    indicator: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--color-accent)',
    },
    empty: {
      padding: 20,
      textAlign: 'center',
      color: 'var(--color-text-muted)',
      fontSize: 13,
    },
  };

  if (history.length === 0) {
    return <div style={styles.empty}>No history yet</div>;
  }

  return (
    <div style={styles.container}>
      {visibleHistory.map((state, i) => {
        const actualIndex = i + offset;
        const isCurrent = actualIndex === currentIndex;

        if (renderItem) {
          return renderItem(state, actualIndex, isCurrent);
        }

        return (
          <button
            key={actualIndex}
            style={{
              ...styles.item,
              ...(isCurrent ? styles.itemCurrent : {}),
            }}
            onClick={() => goTo(actualIndex)}
          >
            <span style={styles.index}>#{actualIndex + 1}</span>
            <span style={styles.label}>
              {state.label || 'State change'}
            </span>
            <span style={styles.time}>{formatTime(state.timestamp)}</span>
            {isCurrent && <div style={styles.indicator} />}
          </button>
        );
      })}
    </div>
  );
}

// ==================== USE HISTORY HOOK ====================

export function useHistory<T>(
  initialState: T,
  options: HistoryOptions = {}
) {
  const { maxHistory = 50, debounceMs = 0 } = options;

  const [history, setHistory] = useState<HistoryState<T>[]>([
    { data: initialState, timestamp: Date.now() },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const state = history[currentIndex]?.data ?? initialState;
  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const set = useCallback((newState: T | ((prev: T) => T), label?: string) => {
    const pushState = (resolvedState: T) => {
      setHistory(prev => {
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push({
          data: resolvedState,
          timestamp: Date.now(),
          label,
        });

        if (newHistory.length > maxHistory) {
          newHistory.shift();
          return newHistory;
        }

        return newHistory;
      });

      setCurrentIndex(prev => Math.min(prev + 1, maxHistory - 1));
    };

    const resolvedState = typeof newState === 'function'
      ? (newState as (prev: T) => T)(state)
      : newState;

    if (debounceMs > 0) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => pushState(resolvedState), debounceMs);
    } else {
      pushState(resolvedState);
    }
  }, [currentIndex, maxHistory, debounceMs, state]);

  const undo = useCallback(() => {
    if (canUndo) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [canRedo]);

  const reset = useCallback(() => {
    setHistory([{ data: initialState, timestamp: Date.now() }]);
    setCurrentIndex(0);
  }, [initialState]);

  const clear = useCallback(() => {
    setHistory([{ data: state, timestamp: Date.now() }]);
    setCurrentIndex(0);
  }, [state]);

  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < history.length) {
      setCurrentIndex(index);
    }
  }, [history.length]);

  return {
    state,
    set,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    clear,
    goTo,
    history,
    historyLength: currentIndex,
    futureLength: history.length - currentIndex - 1,
  };
}

// ==================== KEYBOARD SHORTCUTS ====================

interface UndoRedoShortcutsProps {
  children: React.ReactNode;
}

export const UndoRedoShortcuts: React.FC<UndoRedoShortcutsProps> = ({ children }) => {
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }

      if ((modifier && e.shiftKey && e.key === 'z') ||
          (modifier && e.key === 'y')) {
        e.preventDefault();
        if (canRedo) redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  return <>{children}</>;
};

// ==================== UNDO REDO TOOLBAR ====================

interface UndoRedoToolbarProps {
  position?: 'top' | 'bottom';
  align?: 'left' | 'center' | 'right';
}

export const UndoRedoToolbar: React.FC<UndoRedoToolbarProps> = ({
  position = 'top',
  align = 'left',
}) => {
  const { undo, redo, canUndo, canRedo, historyLength, futureLength, clear } = useUndoRedo();

  const styles: Record<string, React.CSSProperties> = {
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: 8,
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
    },
    group: {
      display: 'flex',
      gap: 2,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      padding: '8px 12px',
      background: 'var(--color-bg-tertiary)',
      border: 'none',
      fontSize: 13,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    buttonFirst: {
      borderTopLeftRadius: 6,
      borderBottomLeftRadius: 6,
    },
    buttonLast: {
      borderTopRightRadius: 6,
      borderBottomRightRadius: 6,
    },
    buttonDisabled: {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
    divider: {
      width: 1,
      height: 24,
      background: 'var(--color-border)',
      margin: '0 4px',
    },
    status: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      padding: '0 8px',
    },
    clearButton: {
      padding: '6px 10px',
      background: 'none',
      border: 'none',
      fontSize: 12,
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.toolbar}>
      <div style={styles.group}>
        <button
          style={{
            ...styles.button,
            ...styles.buttonFirst,
            ...(!canUndo ? styles.buttonDisabled : {}),
          }}
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <UndoIcon size={14} /> Undo
        </button>
        <button
          style={{
            ...styles.button,
            ...styles.buttonLast,
            ...(!canRedo ? styles.buttonDisabled : {}),
          }}
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          Redo <RedoIcon size={14} />
        </button>
      </div>

      <div style={styles.divider} />

      <span style={styles.status}>
        {historyLength} undo · {futureLength} redo
      </span>

      {(historyLength > 0 || futureLength > 0) && (
        <button style={styles.clearButton} onClick={clear}>
          Clear
        </button>
      )}
    </div>
  );
};

export default UndoRedoProvider;
