// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Universal Undo/Redo System
 * Non-destructive editing with history management
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================
export interface HistoryEntry<T = any> {
  id: string;
  timestamp: number;
  label: string;
  state: T;
  prevState: T;
}

export interface HistoryState<T = any> {
  entries: HistoryEntry<T>[];
  currentIndex: number;
  maxEntries: number;
}

export interface HistoryOptions {
  maxEntries?: number;
  debounceMs?: number;
  onChange?: (canUndo: boolean, canRedo: boolean) => void;
}

// ==================== HISTORY MANAGER CLASS ====================
export class HistoryManager<T = any> {
  private entries: HistoryEntry<T>[] = [];
  private currentIndex: number = -1;
  private maxEntries: number;
  private debounceMs: number;
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastPushTime: number = 0;
  private onChange?: (canUndo: boolean, canRedo: boolean) => void;

  constructor(options: HistoryOptions = {}) {
    this.maxEntries = options.maxEntries || 100;
    this.debounceMs = options.debounceMs || 300;
    this.onChange = options.onChange;
  }

  private generateId(): string {
    return `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private notifyChange() {
    if (this.onChange) {
      this.onChange(this.canUndo(), this.canRedo());
    }
  }

  /**
   * Push a new state onto the history stack
   */
  push(state: T, label: string = 'Change'): void {
    const now = Date.now();
    
    // Debounce rapid changes
    if (now - this.lastPushTime < this.debounceMs && this.entries.length > 0) {
      // Update the last entry instead of creating new one
      const lastEntry = this.entries[this.currentIndex];
      if (lastEntry) {
        lastEntry.state = state;
        lastEntry.timestamp = now;
        this.notifyChange();
        return;
      }
    }
    
    this.lastPushTime = now;

    // Remove any redo entries when pushing new state
    if (this.currentIndex < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.currentIndex + 1);
    }

    const prevState = this.currentIndex >= 0 
      ? this.entries[this.currentIndex].state 
      : state;

    const entry: HistoryEntry<T> = {
      id: this.generateId(),
      timestamp: now,
      label,
      state,
      prevState,
    };

    this.entries.push(entry);
    this.currentIndex = this.entries.length - 1;

    // Trim old entries if exceeding max
    if (this.entries.length > this.maxEntries) {
      const trimCount = this.entries.length - this.maxEntries;
      this.entries = this.entries.slice(trimCount);
      this.currentIndex -= trimCount;
    }

    this.notifyChange();
  }

  /**
   * Undo to the previous state
   */
  undo(): T | null {
    if (!this.canUndo()) return null;
    
    this.currentIndex--;
    this.notifyChange();
    
    return this.currentIndex >= 0 
      ? this.entries[this.currentIndex].state 
      : null;
  }

  /**
   * Redo to the next state
   */
  redo(): T | null {
    if (!this.canRedo()) return null;
    
    this.currentIndex++;
    this.notifyChange();
    
    return this.entries[this.currentIndex].state;
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.currentIndex < this.entries.length - 1;
  }

  /**
   * Get current state
   */
  getCurrent(): T | null {
    if (this.currentIndex < 0 || this.entries.length === 0) return null;
    return this.entries[this.currentIndex].state;
  }

  /**
   * Get history entries for display
   */
  getHistory(): HistoryEntry<T>[] {
    return [...this.entries];
  }

  /**
   * Get current index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Jump to a specific history entry
   */
  jumpTo(index: number): T | null {
    if (index < 0 || index >= this.entries.length) return null;
    
    this.currentIndex = index;
    this.notifyChange();
    
    return this.entries[this.currentIndex].state;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.entries = [];
    this.currentIndex = -1;
    this.notifyChange();
  }

  /**
   * Get summary stats
   */
  getStats(): { total: number; current: number; undoCount: number; redoCount: number } {
    return {
      total: this.entries.length,
      current: this.currentIndex,
      undoCount: this.currentIndex,
      redoCount: this.entries.length - 1 - this.currentIndex,
    };
  }
}

// ==================== REACT HOOK ====================
export function useHistory<T>(
  initialState: T,
  options: HistoryOptions = {}
): {
  state: T;
  setState: (newState: T, label?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  history: HistoryEntry<T>[];
  currentIndex: number;
  jumpTo: (index: number) => void;
  clear: () => void;
} {
  const [state, setStateInternal] = useState<T>(initialState);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry<T>[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const managerRef = useRef<HistoryManager<T>>(
    new HistoryManager<T>({
      ...options,
      onChange: (canU, canR) => {
        setCanUndo(canU);
        setCanRedo(canR);
      },
    })
  );

  // Initialize with initial state
  useEffect(() => {
    managerRef.current.push(initialState, 'Initial');
    setHistoryEntries(managerRef.current.getHistory());
    setCurrentIndex(managerRef.current.getCurrentIndex());
  }, []);

  const setState = useCallback((newState: T, label: string = 'Change') => {
    setStateInternal(newState);
    managerRef.current.push(newState, label);
    setHistoryEntries(managerRef.current.getHistory());
    setCurrentIndex(managerRef.current.getCurrentIndex());
  }, []);

  const undo = useCallback(() => {
    const prevState = managerRef.current.undo();
    if (prevState !== null) {
      setStateInternal(prevState);
      setHistoryEntries(managerRef.current.getHistory());
      setCurrentIndex(managerRef.current.getCurrentIndex());
    }
  }, []);

  const redo = useCallback(() => {
    const nextState = managerRef.current.redo();
    if (nextState !== null) {
      setStateInternal(nextState);
      setHistoryEntries(managerRef.current.getHistory());
      setCurrentIndex(managerRef.current.getCurrentIndex());
    }
  }, []);

  const jumpTo = useCallback((index: number) => {
    const targetState = managerRef.current.jumpTo(index);
    if (targetState !== null) {
      setStateInternal(targetState);
      setHistoryEntries(managerRef.current.getHistory());
      setCurrentIndex(managerRef.current.getCurrentIndex());
    }
  }, []);

  const clear = useCallback(() => {
    managerRef.current.clear();
    setHistoryEntries([]);
    setCurrentIndex(-1);
  }, []);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    history: historyEntries,
    currentIndex,
    jumpTo,
    clear,
  };
}

// ==================== KEYBOARD SHORTCUT INTEGRATION ====================
export function useUndoRedoShortcuts(
  undo: () => void,
  redo: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const _p = (navigator as any).userAgentData?.platform || navigator.platform || '';
      const isMac = /Mac|macOS/i.test(_p);
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (modifier && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (modifier && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, enabled]);
}

// ==================== HISTORY PANEL COMPONENT ====================
interface HistoryPanelProps<T> {
  history: HistoryEntry<T>[];
  currentIndex: number;
  onJumpTo: (index: number) => void;
  onClear?: () => void;
  style?: React.CSSProperties;
}

export function HistoryPanel<T>({
  history,
  currentIndex,
  onJumpTo,
  onClear,
  style,
}: HistoryPanelProps<T>): JSX.Element {
  return (
    <div style={{ ...panelStyles.container, ...style }}>
      <div style={panelStyles.header}>
        <span style={panelStyles.title}>History</span>
        <span style={panelStyles.count}>{history.length} states</span>
        {onClear && (
          <button 
            onClick={onClear} 
            style={panelStyles.clearBtn}
            title="Clear History"
          >
            Clear
          </button>
        )}
      </div>
      <div style={panelStyles.list}>
        {history.map((entry, index) => (
          <div
            key={entry.id}
            onClick={() => onJumpTo(index)}
            style={{
              ...panelStyles.item,
              ...(index === currentIndex ? panelStyles.itemActive : {}),
              ...(index > currentIndex ? panelStyles.itemFuture : {}),
            }}
          >
            <span style={panelStyles.itemLabel}>{entry.label}</span>
            <span style={panelStyles.itemTime}>
              {formatTime(entry.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const formatTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 1000) return 'now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-secondary, #1e1e1e)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '10px var(--space-3)',
    borderBottom: '1px solid var(--color-border, var(--color-border))',
  },
  title: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-primary, #fff)',
    flex: 1,
  },
  count: {
    fontSize: 11,
    color: 'var(--color-text-tertiary, #777)',
  },
  clearBtn: {
    padding: '2px var(--space-2)',
    fontSize: 11,
    background: 'transparent',
    border: '1px solid var(--color-border, var(--color-text-tertiary))',
    borderRadius: 4,
    color: 'var(--color-text-secondary, #999)',
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    maxHeight: 300,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-3)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    borderBottom: '1px solid var(--color-border-subtle, var(--color-bg-hover))',
  },
  itemActive: {
    background: 'var(--color-accent, #007aff)',
    color: 'var(--color-text-inverse)',
  },
  itemFuture: {
    opacity: 0.5,
  },
  itemLabel: {
    fontSize: 12,
    color: 'inherit',
  },
  itemTime: {
    fontSize: 10,
    color: 'var(--color-text-tertiary, #777)',
  },
};

export default {
  HistoryManager,
  useHistory,
  useUndoRedoShortcuts,
  HistoryPanel,
};
