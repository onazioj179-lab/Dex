// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Phase 31: Keyboard Navigation System
// Central keyboard shortcut management and navigation
// ===========================================================================

import { useEffect, useCallback, useRef } from 'react';

// -----------------------------------------------------------------------------
// KEYBOARD SHORTCUTS
// -----------------------------------------------------------------------------

export interface KeyboardShortcut {
  id: string;
  key: string;
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
  description: string;
  category: 'navigation' | 'actions' | 'editing' | 'view' | 'help';
  handler: () => void;
  when?: () => boolean;
}

// Registry of all keyboard shortcuts
const shortcutRegistry = new Map<string, KeyboardShortcut>();
let shortcutsEnabled = true;

/**
 * Register a keyboard shortcut
 */
export function registerShortcut(shortcut: KeyboardShortcut): () => void {
  shortcutRegistry.set(shortcut.id, shortcut);
  return () => shortcutRegistry.delete(shortcut.id);
}

/**
 * Unregister a keyboard shortcut
 */
export function unregisterShortcut(id: string): void {
  shortcutRegistry.delete(id);
}

/**
 * Get all registered shortcuts
 */
export function getAllShortcuts(): KeyboardShortcut[] {
  return Array.from(shortcutRegistry.values());
}

/**
 * Get shortcuts by category
 */
export function getShortcutsByCategory(category: string): KeyboardShortcut[] {
  return getAllShortcuts().filter(s => s.category === category);
}

/**
 * Enable/disable all shortcuts (for when typing in inputs)
 */
export function setShortcutsEnabled(enabled: boolean): void {
  shortcutsEnabled = enabled;
}

// -----------------------------------------------------------------------------
// DEFAULT SHORTCUTS
// -----------------------------------------------------------------------------

export const DEFAULT_SHORTCUTS: Omit<KeyboardShortcut, 'handler'>[] = [
  // Navigation
  {
    id: 'command-palette',
    key: 'p',
    modifiers: ['ctrl', 'shift'],
    description: 'Open Command Palette',
    category: 'navigation',
  },
  {
    id: 'search',
    key: 'f',
    modifiers: ['ctrl'],
    description: 'Focus Search',
    category: 'navigation',
  },
  {
    id: 'toggle-sidebar',
    key: 'b',
    modifiers: ['ctrl'],
    description: 'Toggle Sidebar',
    category: 'navigation',
  },
  {
    id: 'toggle-panel',
    key: 'j',
    modifiers: ['ctrl'],
    description: 'Toggle Panel',
    category: 'navigation',
  },
  {
    id: 'focus-activity-bar',
    key: '1',
    modifiers: ['ctrl'],
    description: 'Focus Activity Bar',
    category: 'navigation',
  },
  {
    id: 'focus-sidebar',
    key: '2',
    modifiers: ['ctrl'],
    description: 'Focus Sidebar',
    category: 'navigation',
  },
  {
    id: 'focus-editor',
    key: '3',
    modifiers: ['ctrl'],
    description: 'Focus Editor Area',
    category: 'navigation',
  },
  {
    id: 'focus-panel',
    key: '4',
    modifiers: ['ctrl'],
    description: 'Focus Panel',
    category: 'navigation',
  },
  
  // Actions
  {
    id: 'new-item',
    key: 'n',
    modifiers: ['ctrl'],
    description: 'Create New Item',
    category: 'actions',
  },
  {
    id: 'save',
    key: 's',
    modifiers: ['ctrl'],
    description: 'Save',
    category: 'actions',
  },
  {
    id: 'delete',
    key: 'Delete',
    description: 'Delete Selected',
    category: 'actions',
  },
  {
    id: 'undo',
    key: 'z',
    modifiers: ['ctrl'],
    description: 'Undo',
    category: 'actions',
  },
  {
    id: 'redo',
    key: 'z',
    modifiers: ['ctrl', 'shift'],
    description: 'Redo',
    category: 'actions',
  },
  
  // View
  {
    id: 'zoom-in',
    key: '=',
    modifiers: ['ctrl'],
    description: 'Zoom In',
    category: 'view',
  },
  {
    id: 'zoom-out',
    key: '-',
    modifiers: ['ctrl'],
    description: 'Zoom Out',
    category: 'view',
  },
  {
    id: 'zoom-reset',
    key: '0',
    modifiers: ['ctrl'],
    description: 'Reset Zoom',
    category: 'view',
  },
  {
    id: 'toggle-fullscreen',
    key: 'F11',
    description: 'Toggle Fullscreen',
    category: 'view',
  },
  
  // Help
  {
    id: 'show-shortcuts',
    key: '/',
    modifiers: ['ctrl'],
    description: 'Show Keyboard Shortcuts',
    category: 'help',
  },
];

// -----------------------------------------------------------------------------
// KEY EVENT MATCHING
// -----------------------------------------------------------------------------

/**
 * Check if a keyboard event matches a shortcut
 */
function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const modifiers = shortcut.modifiers || [];
  
  // Check modifiers
  const ctrlRequired = modifiers.includes('ctrl') || modifiers.includes('meta');
  const altRequired = modifiers.includes('alt');
  const shiftRequired = modifiers.includes('shift');

  const ctrlPressed = event.ctrlKey || event.metaKey;
  const altPressed = event.altKey;
  const shiftPressed = event.shiftKey;

  if (ctrlRequired !== ctrlPressed) return false;
  if (altRequired !== altPressed) return false;
  if (shiftRequired !== shiftPressed) return false;

  // Check key
  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}

/**
 * Format shortcut for display
 */
export function formatShortcut(shortcut: KeyboardShortcut | Omit<KeyboardShortcut, 'handler'>): string {
  const parts: string[] = [];
  const modifiers = shortcut.modifiers || [];
  const _p = (navigator as any).userAgentData?.platform || navigator.platform || '';
  const _isMac = /Mac|macOS/i.test(_p);

  if (modifiers.includes('ctrl') || modifiers.includes('meta')) {
    parts.push(_isMac ? '' : 'Ctrl');
  }
  if (modifiers.includes('alt')) {
    parts.push(_isMac ? '' : 'Alt');
  }
  if (modifiers.includes('shift')) {
    parts.push('Shift');
  }

  // Format key nicely
  let key = shortcut.key;
  if (key.length === 1) {
    key = key.toUpperCase();
  } else {
    // Special keys
    const keyMap: Record<string, string> = {
      'ArrowUp': 'arrow-up',
      'ArrowDown': 'arrow-down',
      'ArrowLeft': 'arrow-left',
      'ArrowRight': 'arrow-right',
      'Enter': '',
      'Escape': 'Esc',
      'Delete': 'Del',
      'Backspace': '',
      ' ': 'Space',
    };
    key = keyMap[key] || key;
  }
  parts.push(key);

  return parts.join(_isMac ? '' : '+');
}

// -----------------------------------------------------------------------------
// GLOBAL KEYBOARD HANDLER
// -----------------------------------------------------------------------------

let globalHandlerAttached = false;

/**
 * Initialize global keyboard handler
 */
export function initKeyboardNavigation(): () => void {
  if (globalHandlerAttached) return () => {};

  const handleKeyDown = (event: KeyboardEvent) => {
    // Skip if shortcuts are disabled
    if (!shortcutsEnabled) return;

    // Skip if typing in an input field (unless it's Escape)
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable;

    if (isInput && event.key !== 'Escape') return;

    // Find matching shortcut
    for (const shortcut of shortcutRegistry.values()) {
      if (matchesShortcut(event, shortcut)) {
        // Check condition
        if (shortcut.when && !shortcut.when()) continue;

        event.preventDefault();
        event.stopPropagation();
        shortcut.handler();
        return;
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown, { capture: true });
  globalHandlerAttached = true;

  return () => {
    document.removeEventListener('keydown', handleKeyDown, { capture: true });
    globalHandlerAttached = false;
  };
}

// -----------------------------------------------------------------------------
// REACT HOOKS
// -----------------------------------------------------------------------------

/**
 * Hook to register a keyboard shortcut
 */
export function useKeyboardShortcut(
  id: string,
  key: string,
  handler: () => void,
  options: {
    modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
    description?: string;
    category?: KeyboardShortcut['category'];
    when?: () => boolean;
  } = {}
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const shortcut: KeyboardShortcut = {
      id,
      key,
      modifiers: options.modifiers,
      description: options.description || id,
      category: options.category || 'actions',
      when: options.when,
      handler: () => handlerRef.current(),
    };

    return registerShortcut(shortcut);
  }, [id, key, options.modifiers?.join(','), options.category]);
}

/**
 * Hook to register multiple shortcuts at once
 */
export function useKeyboardShortcuts(
  shortcuts: Array<{
    id: string;
    key: string;
    modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
    description?: string;
    category?: KeyboardShortcut['category'];
    handler: () => void;
    when?: () => boolean;
  }>
): void {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const cleanups = shortcutsRef.current.map(s => 
      registerShortcut({
        id: s.id,
        key: s.key,
        modifiers: s.modifiers,
        description: s.description || s.id,
        category: s.category || 'actions',
        when: s.when,
        handler: s.handler,
      })
    );

    return () => cleanups.forEach(c => c());
  }, [shortcuts.map(s => s.id).join(',')]);
}

/**
 * Hook to initialize keyboard navigation system
 */
export function useKeyboardNavigation(): void {
  useEffect(() => {
    return initKeyboardNavigation();
  }, []);
}

// -----------------------------------------------------------------------------
// FOCUS ZONE COMPONENT HELPERS
// -----------------------------------------------------------------------------

export type FocusZone = 'activity-bar' | 'sidebar' | 'editor' | 'panel' | 'command-palette';

let currentFocusZone: FocusZone | null = null;
const focusZoneElements = new Map<FocusZone, HTMLElement>();

/**
 * Register a focus zone element
 */
export function registerFocusZone(zone: FocusZone, element: HTMLElement | null): void {
  if (element) {
    focusZoneElements.set(zone, element);
  } else {
    focusZoneElements.delete(zone);
  }
}

/**
 * Focus a specific zone
 */
export function focusZone(zone: FocusZone): boolean {
  const element = focusZoneElements.get(zone);
  if (element) {
    element.focus();
    currentFocusZone = zone;
    return true;
  }
  return false;
}

/**
 * Get current focus zone
 */
export function getCurrentFocusZone(): FocusZone | null {
  return currentFocusZone;
}

/**
 * Set current focus zone
 */
export function setCurrentFocusZone(zone: FocusZone | null): void {
  currentFocusZone = zone;
}

/**
 * Hook to register a focus zone
 */
export function useFocusZone(zone: FocusZone) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    registerFocusZone(zone, ref.current);
    return () => registerFocusZone(zone, null);
  }, [zone]);

  const handleFocus = useCallback(() => {
    setCurrentFocusZone(zone);
  }, [zone]);

  return { ref, onFocus: handleFocus };
}
