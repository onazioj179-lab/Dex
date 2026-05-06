// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Global Undo Manager -- Central Command-Pattern Undo System
 * Single source of truth for all app undo/redo.
 * Session-only (cleared on app restart).
 * 100-command stack, Ctrl+Z / Ctrl+Shift+Z.
 */

// ==================== TYPES ====================
export interface UndoCommand {
  id: string;
  appName: string;
  description: string;
  timestamp: number;
  execute: () => void;
  undo: () => void;
}

export interface UndoManagerState {
  stack: UndoCommand[];
  index: number;
  maxStack: number;
}

type UndoListener = (state: UndoManagerState) => void;

// ==================== GLOBAL UNDO MANAGER ====================
class GlobalUndoManager {
  private stack: UndoCommand[] = [];
  private index: number = -1;
  private maxStack: number = 100;
  private listeners: Set<UndoListener> = new Set();
  private shortcutsRegistered: boolean = false;

  constructor() {
    this.registerShortcuts();
  }

  private generateId(): string {
    return `undo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
  }

  /**
   * Push a new undoable command onto the stack.
   * Executes the command immediately.
   */
  push(cmd: Omit<UndoCommand, 'id' | 'timestamp'>): void {
    // Trim any redo history beyond current index
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }

    const entry: UndoCommand = {
      ...cmd,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.stack.push(entry);
    this.index = this.stack.length - 1;

    // Enforce max stack
    if (this.stack.length > this.maxStack) {
      const excess = this.stack.length - this.maxStack;
      this.stack = this.stack.slice(excess);
      this.index -= excess;
    }

    this.notify();
  }

  /**
   * Push a command without executing it (for wrapping already-executed actions).
   */
  record(cmd: Omit<UndoCommand, 'id' | 'timestamp'>): void {
    this.push(cmd);
  }

  /**
   * Undo the last command.
   */
  undo(): boolean {
    if (!this.canUndo()) return false;
    const cmd = this.stack[this.index];
    cmd.undo();
    this.index--;
    this.notify();
    return true;
  }

  /**
   * Redo the next command.
   */
  redo(): boolean {
    if (!this.canRedo()) return false;
    this.index++;
    const cmd = this.stack[this.index];
    cmd.execute();
    this.notify();
    return true;
  }

  /**
   * Undo all commands back to (and including) targetIndex+1.
   * The command at targetIndex stays applied.
   */
  undoToPoint(targetIndex: number): boolean {
    if (targetIndex < -1 || targetIndex >= this.index) return false;
    while (this.index > targetIndex) {
      if (!this.undo()) break;
    }
    return true;
  }

  canUndo(): boolean {
    return this.index >= 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  getState(): UndoManagerState {
    return {
      stack: [...this.stack],
      index: this.index,
      maxStack: this.maxStack,
    };
  }

  /**
   * Get last N entries for display in history panel.
   */
  getRecentHistory(count: number = 20): UndoCommand[] {
    const start = Math.max(0, this.stack.length - count);
    return this.stack.slice(start);
  }

  getCurrentIndex(): number {
    return this.index;
  }

  clear(): void {
    this.stack = [];
    this.index = -1;
    this.notify();
  }

  subscribe(listener: UndoListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private registerShortcuts(): void {
    if (this.shortcutsRegistered) return;
    if (typeof window === 'undefined') return;
    this.shortcutsRegistered = true;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this.redo();
      } else if (mod && e.key === 'y') {
        e.preventDefault();
        this.redo();
      }
    });
  }
}

// ==================== SINGLETON ====================
export const undoManager = new GlobalUndoManager();

// ==================== REACT HOOK ====================
import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to integrate any app with the global undo manager.
 * Returns push/undo/redo and current state.
 */
export function useGlobalUndo(appName: string) {
  const [state, setState] = useState<UndoManagerState>(undoManager.getState());

  useEffect(() => {
    return undoManager.subscribe(setState);
  }, []);

  const push = useCallback(
    (description: string, execute: () => void, undo: () => void) => {
      undoManager.record({ appName, description, execute, undo });
    },
    [appName]
  );

  const pushAndExecute = useCallback(
    (description: string, execute: () => void, undo: () => void) => {
      execute();
      undoManager.record({ appName, description, execute, undo });
    },
    [appName]
  );

  return {
    push,
    pushAndExecute,
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
    undoToPoint: (idx: number) => undoManager.undoToPoint(idx),
    canUndo: state.index >= 0,
    canRedo: state.index < state.stack.length - 1,
    history: state.stack,
    currentIndex: state.index,
    recentHistory: undoManager.getRecentHistory(20),
    clear: () => undoManager.clear(),
  };
}

export default undoManager;
