// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Keyboard Shortcuts Manager
 * 
 * Centralized keyboard shortcut handling for the entire app.
 * Features:
 * - Conflict detection
 * - Scope-based activation
 * - macOS/Windows key mapping
 * - Visual shortcut hints
 */

import { useCallback, useEffect, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta';
export type KeyCode = string;

export interface Shortcut {
  /** Unique identifier */
  id: string;
  /** Key combination (e.g., 'ctrl+s', 'meta+shift+z') */
  keys: string;
  /** Human-readable description */
  description: string;
  /** Callback when triggered */
  action: (e: KeyboardEvent) => void;
  /** Scope where shortcut is active (default: global) */
  scope?: string;
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean;
  /** Whether to stop event propagation */
  stopPropagation?: boolean;
  /** Enabled state */
  enabled?: boolean;
}

export interface ParsedShortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// ---------------------------------------------------------------------------
// Key Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a shortcut string into its components
 * Supports: ctrl, alt, shift, meta (or cmd), plus any key
 */
export const parseShortcut = (keys: string): ParsedShortcut => {
  const parts = keys.toLowerCase().split('+');
  
  return {
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    alt: parts.includes('alt') || parts.includes('option'),
    shift: parts.includes('shift'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
    key: parts.find(p => !['ctrl', 'control', 'alt', 'option', 'shift', 'meta', 'cmd', 'command'].includes(p)) || '',
  };
};

/**
 * Check if a keyboard event matches a parsed shortcut
 */
export const matchesShortcut = (e: KeyboardEvent, parsed: ParsedShortcut): boolean => {
  const eventKey = e.key.toLowerCase();
  const eventCode = e.code.toLowerCase();
  
  // Check modifiers
  if (parsed.ctrl !== (e.ctrlKey || (isMac && e.metaKey && !parsed.meta))) return false;
  if (parsed.alt !== e.altKey) return false;
  if (parsed.shift !== e.shiftKey) return false;
  if (parsed.meta !== e.metaKey) return false;
  
  // Check key
  const keyMatches = eventKey === parsed.key || 
                     eventCode === parsed.key ||
                     eventCode === `key${parsed.key}` ||
                     eventCode === `digit${parsed.key}`;
  
  return keyMatches;
};

// ---------------------------------------------------------------------------
// Format for Display
// ---------------------------------------------------------------------------

/**
 * Format a shortcut for display (platform-specific symbols)
 */
export const formatShortcut = (keys: string): string => {
  const parsed = parseShortcut(keys);
  const parts: string[] = [];
  
  if (isMac) {
    if (parsed.ctrl) parts.push('\u2303'); // Control symbol
    if (parsed.alt) parts.push('\u2325');  // Option symbol
    if (parsed.shift) parts.push('\u21E7'); // Shift symbol
    if (parsed.meta) parts.push('\u2318');  // Command symbol
  } else {
    if (parsed.ctrl) parts.push('Ctrl');
    if (parsed.alt) parts.push('Alt');
    if (parsed.shift) parts.push('Shift');
    if (parsed.meta) parts.push('Win');
  }
  
  // Format key
  const keyDisplay = parsed.key
    .replace('arrowup', '\u2191')
    .replace('arrowdown', '\u2193')
    .replace('arrowleft', '\u2190')
    .replace('arrowright', '\u2192')
    .replace('backspace', '\u232B')
    .replace('delete', '\u2326')
    .replace('enter', '\u21B5')
    .replace('escape', 'Esc')
    .replace('tab', '\u21E5')
    .replace('space', 'Space')
    .toUpperCase();
  
  parts.push(keyDisplay);
  
  return isMac ? parts.join('') : parts.join('+');
};

// ---------------------------------------------------------------------------
// Shortcut Manager Class
// ---------------------------------------------------------------------------

class ShortcutManager {
  private shortcuts = new Map<string, Shortcut>();
  private activeScopes = new Set<string>(['global']);
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
    }
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    this.shortcuts.clear();
    this.listeners.clear();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Skip if target is an input element (unless it's a global shortcut)
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable;

    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.enabled === false) continue;
      
      const scope = shortcut.scope || 'global';
      if (!this.activeScopes.has(scope) && scope !== 'global') continue;
      
      // Skip non-global shortcuts if focused on input
      if (isInput && scope !== 'global') continue;
      
      const parsed = parseShortcut(shortcut.keys);
      if (matchesShortcut(e, parsed)) {
        if (shortcut.preventDefault !== false) {
          e.preventDefault();
        }
        if (shortcut.stopPropagation) {
          e.stopPropagation();
        }
        shortcut.action(e);
        return;
      }
    }
  };

  register(shortcut: Shortcut): () => void {
    // Check for conflicts
    const existing = this.shortcuts.get(shortcut.id);
    if (existing) {
      console.warn(`[Shortcuts] Overwriting existing shortcut: ${shortcut.id}`);
    }

    // Check for key conflicts in same scope
    for (const [id, s] of this.shortcuts) {
      if (id !== shortcut.id && 
          s.keys.toLowerCase() === shortcut.keys.toLowerCase() &&
          (s.scope || 'global') === (shortcut.scope || 'global')) {
        console.warn(`[Shortcuts] Key conflict: ${shortcut.keys} is already used by ${id}`);
      }
    }

    this.shortcuts.set(shortcut.id, shortcut);
    this.notifyListeners();

    return () => {
      this.shortcuts.delete(shortcut.id);
      this.notifyListeners();
    };
  }

  unregister(id: string): void {
    this.shortcuts.delete(id);
    this.notifyListeners();
  }

  enable(id: string): void {
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      shortcut.enabled = true;
      this.notifyListeners();
    }
  }

  disable(id: string): void {
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      shortcut.enabled = false;
      this.notifyListeners();
    }
  }

  activateScope(scope: string): void {
    this.activeScopes.add(scope);
    this.notifyListeners();
  }

  deactivateScope(scope: string): void {
    this.activeScopes.delete(scope);
    this.notifyListeners();
  }

  getShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  getShortcutsByScope(scope: string): Shortcut[] {
    return this.getShortcuts().filter(s => (s.scope || 'global') === scope);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }
}

// Singleton instance
export const shortcutManager = new ShortcutManager();

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

/**
 * Register a keyboard shortcut
 */
export const useShortcut = (
  keys: string,
  action: (e: KeyboardEvent) => void,
  options?: {
    id?: string;
    description?: string;
    scope?: string;
    preventDefault?: boolean;
    enabled?: boolean;
  }
) => {
  const id = options?.id || `shortcut-${keys}`;
  
  useEffect(() => {
    const unregister = shortcutManager.register({
      id,
      keys,
      description: options?.description || '',
      action,
      scope: options?.scope,
      preventDefault: options?.preventDefault,
      enabled: options?.enabled,
    });
    
    return unregister;
  }, [id, keys, action, options?.description, options?.scope, options?.preventDefault, options?.enabled]);
};

/**
 * Register multiple shortcuts at once
 */
export const useShortcuts = (shortcuts: Omit<Shortcut, 'action'>[], scope?: string) => {
  useEffect(() => {
    const unregisters = shortcuts.map(s => 
      shortcutManager.register({
        ...s,
        scope: s.scope || scope,
        action: () => {}, // Placeholder - real action should be provided
      })
    );
    
    return () => unregisters.forEach(u => u());
  }, [shortcuts, scope]);
};

/**
 * Activate a scope while component is mounted
 */
export const useShortcutScope = (scope: string) => {
  useEffect(() => {
    shortcutManager.activateScope(scope);
    return () => shortcutManager.deactivateScope(scope);
  }, [scope]);
};

/**
 * Get all registered shortcuts
 */
export const useShortcutList = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  
  useEffect(() => {
    setShortcuts(shortcutManager.getShortcuts());
    return shortcutManager.subscribe(() => {
      setShortcuts(shortcutManager.getShortcuts());
    });
  }, []);
  
  return shortcuts;
};

// Import for hook
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Common Shortcuts Presets
// ---------------------------------------------------------------------------

export const COMMON_SHORTCUTS = {
  // File operations
  NEW: 'ctrl+n',
  OPEN: 'ctrl+o',
  SAVE: 'ctrl+s',
  SAVE_AS: 'ctrl+shift+s',
  CLOSE: 'ctrl+w',
  
  // Edit operations
  UNDO: 'ctrl+z',
  REDO: 'ctrl+shift+z',
  CUT: 'ctrl+x',
  COPY: 'ctrl+c',
  PASTE: 'ctrl+v',
  SELECT_ALL: 'ctrl+a',
  FIND: 'ctrl+f',
  REPLACE: 'ctrl+h',
  
  // View operations
  ZOOM_IN: 'ctrl+=',
  ZOOM_OUT: 'ctrl+-',
  ZOOM_RESET: 'ctrl+0',
  FULLSCREEN: 'f11',
  
  // Navigation
  GO_BACK: 'alt+arrowleft',
  GO_FORWARD: 'alt+arrowright',
  
  // App
  SETTINGS: 'ctrl+,',
  HELP: 'f1',
  QUIT: 'ctrl+q',
} as const;

export default shortcutManager;
