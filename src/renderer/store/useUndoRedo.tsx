// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Global Undo/Redo System
// Phase 50: Polish - Command pattern for reversible actions
// ===========================================================================

import { create } from 'zustand';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface UndoableAction {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
  /** Data snapshot for debugging */
  snapshot?: any;
}

interface UndoRedoState {
  past: UndoableAction[];
  future: UndoableAction[];
  maxHistory: number;
  
  // Actions
  execute: (action: Omit<UndoableAction, 'id' | 'timestamp'>) => void;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  clear: () => void;
  
  // Getters
  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoDescription: () => string | null;
  getRedoDescription: () => string | null;
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const useUndoRedo = create<UndoRedoState>((set, get) => ({
  past: [],
  future: [],
  maxHistory: 50,
  
  execute: (actionDef) => {
    const action: UndoableAction = {
      ...actionDef,
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    set((state) => ({
      past: [...state.past, action].slice(-state.maxHistory),
      future: [], // Clear future when new action is executed
    }));
  },
  
  undo: async () => {
    const { past, future } = get();
    
    if (past.length === 0) {
      return false;
    }
    
    const action = past[past.length - 1];
    
    try {
      await action.undo();
      
      set((state) => ({
        past: state.past.slice(0, -1),
        future: [action, ...state.future],
      }));
      
      return true;
    } catch (_err) {
      return false;
    }
  },
  
  redo: async () => {
    const { future } = get();
    
    if (future.length === 0) {
      return false;
    }
    
    const action = future[0];
    
    try {
      await action.redo();
      
      set((state) => ({
        past: [...state.past, action],
        future: state.future.slice(1),
      }));
      
      return true;
    } catch (_err) {
      return false;
    }
  },
  
  clear: () => {
    set({ past: [], future: [] });
  },
  
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  
  getUndoDescription: () => {
    const { past } = get();
    return past.length > 0 ? past[past.length - 1].description : null;
  },
  
  getRedoDescription: () => {
    const { future } = get();
    return future.length > 0 ? future[0].description : null;
  },
}));

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Create an undoable action for data modifications
 */
export function createUndoableDataAction<T>(
  type: string,
  description: string,
  getData: () => T,
  setData: (data: T) => void | Promise<void>,
  newData: T
): Omit<UndoableAction, 'id' | 'timestamp'> {
  const oldData = getData();
  
  return {
    type,
    description,
    snapshot: { old: oldData, new: newData },
    undo: async () => {
      await setData(oldData);
    },
    redo: async () => {
      await setData(newData);
    },
  };
}

/**
 * Create an undoable action for creating items
 */
export function createUndoableCreateAction<T extends { id: string }>(
  type: string,
  itemName: string,
  createFn: () => Promise<T> | T,
  deleteFn: (id: string) => Promise<void> | void
): Omit<UndoableAction, 'id' | 'timestamp'> {
  let createdItem: T | null = null;
  
  return {
    type: `create_${type}`,
    description: `Create ${itemName}`,
    undo: async () => {
      if (createdItem) {
        await deleteFn(createdItem.id);
      }
    },
    redo: async () => {
      createdItem = await createFn();
    },
  };
}

/**
 * Create an undoable action for deleting items
 */
export function createUndoableDeleteAction<T extends { id: string }>(
  type: string,
  item: T,
  itemName: string,
  deleteFn: (id: string) => Promise<void> | void,
  restoreFn: (item: T) => Promise<void> | void
): Omit<UndoableAction, 'id' | 'timestamp'> {
  return {
    type: `delete_${type}`,
    description: `Delete ${itemName}`,
    snapshot: item,
    undo: async () => {
      await restoreFn(item);
    },
    redo: async () => {
      await deleteFn(item.id);
    },
  };
}

// -----------------------------------------------------------------------------
// Keyboard Shortcut Hook
// -----------------------------------------------------------------------------

import { useEffect } from 'react';

export function useUndoRedoShortcuts() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo();
  
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Check for Ctrl/Cmd
      const isMod = e.ctrlKey || e.metaKey;
      
      if (!isMod) return;
      
      // Undo: Ctrl/Cmd + Z
      if (e.key === 'z' && !e.shiftKey && canUndo()) {
        e.preventDefault();
        await undo();
      }
      
      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        if (canRedo()) {
          e.preventDefault();
          await redo();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);
}

// -----------------------------------------------------------------------------
// UI Components
// -----------------------------------------------------------------------------

import React from 'react';

const UndoIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
  </svg>
);

const RedoIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
  </svg>
);

export const UndoRedoButtons: React.FC = () => {
  const { undo, redo, canUndo, canRedo, getUndoDescription, getRedoDescription } = useUndoRedo();
  
  const buttonStyle = (enabled: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: enabled ? 'var(--text-secondary)' : 'var(--text-muted)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4,
    transition: 'all 100ms ease',
  });
  
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      <button
        onClick={() => canUndo() && undo()}
        disabled={!canUndo()}
        title={getUndoDescription() ? `Undo: ${getUndoDescription()}` : 'Nothing to undo'}
        style={buttonStyle(canUndo())}
        onMouseEnter={(e) => {
          if (canUndo()) {
            e.currentTarget.style.background = 'var(--glass-layer-1)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = canUndo() ? 'var(--text-secondary)' : 'var(--text-muted)';
        }}
      >
        <UndoIcon size={14} />
      </button>
      
      <button
        onClick={() => canRedo() && redo()}
        disabled={!canRedo()}
        title={getRedoDescription() ? `Redo: ${getRedoDescription()}` : 'Nothing to redo'}
        style={buttonStyle(canRedo())}
        onMouseEnter={(e) => {
          if (canRedo()) {
            e.currentTarget.style.background = 'var(--glass-layer-1)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = canRedo() ? 'var(--text-secondary)' : 'var(--text-muted)';
        }}
      >
        <RedoIcon size={14} />
      </button>
    </div>
  );
};
