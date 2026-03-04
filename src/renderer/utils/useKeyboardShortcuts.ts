// ═══════════════════════════════════════════════════════════════════════════
// DEX - Keyboard Shortcuts Hook
// FINAL UI FUNCTIONALITY PHASE: Global Keyboard Accessibility
// Focus always visible, no keyboard traps, full navigation
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description?: string;
  global?: boolean; // Works everywhere, even in inputs
}

interface ShortcutMap {
  [id: string]: ShortcutConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Shortcuts
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  search: {
    key: 'k',
    ctrl: true,
    meta: true,
    action: () => {}, // Placeholder, set by consumer
    description: 'Open search',
    global: true,
  },
  sidebarToggle: {
    key: 'b',
    ctrl: true,
    meta: true,
    action: () => {},
    description: 'Toggle sidebar',
    global: true,
  },
  escape: {
    key: 'Escape',
    action: () => {},
    description: 'Close dialogs/modals',
    global: true,
  },
  navigateDashboard: {
    key: '1',
    ctrl: true,
    meta: true,
    action: () => {},
    description: 'Go to Dashboard',
  },
  navigateNotes: {
    key: '2',
    ctrl: true,
    meta: true,
    action: () => {},
    description: 'Go to Notes',
  },
  navigateWorkflows: {
    key: '3',
    ctrl: true,
    meta: true,
    action: () => {},
    description: 'Go to Workflows',
  },
  navigateSettings: {
    key: ',',
    ctrl: true,
    meta: true,
    action: () => {},
    description: 'Open Settings',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useKeyboardShortcuts
// ─────────────────────────────────────────────────────────────────────────────

interface UseKeyboardShortcutsOptions {
  shortcuts?: ShortcutMap;
  enabled?: boolean;
  onSearch?: () => void;
  onToggleSidebar?: () => void;
  onEscape?: () => void;
  onNavigate?: (page: string) => void;
}

export const useKeyboardShortcuts = (options: UseKeyboardShortcutsOptions) => {
  const {
    shortcuts = {},
    enabled = true,
    onSearch,
    onToggleSidebar,
    onEscape,
    onNavigate,
  } = options;

  // Track currently pressed keys for chord detection
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // Build full shortcut map
  const fullShortcuts: ShortcutMap = {
    ...DEFAULT_SHORTCUTS,
    ...shortcuts,
  };

  // Override default actions with provided handlers
  if (onSearch) fullShortcuts.search.action = onSearch;
  if (onToggleSidebar) fullShortcuts.sidebarToggle.action = onToggleSidebar;
  if (onEscape) fullShortcuts.escape.action = onEscape;
  if (onNavigate) {
    fullShortcuts.navigateDashboard.action = () => onNavigate('dashboard');
    fullShortcuts.navigateNotes.action = () => onNavigate('notes');
    fullShortcuts.navigateWorkflows.action = () => onNavigate('workflows');
    fullShortcuts.navigateSettings.action = () => onNavigate('settings');
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Track pressed keys
      pressedKeysRef.current.add(e.key.toLowerCase());

      // Check if we're in an input element
      const target = e.target as HTMLElement;
      const isInput = 
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Find matching shortcut
      for (const [, config] of Object.entries(fullShortcuts)) {
        // Skip non-global shortcuts when in input
        if (isInput && !config.global) continue;

        // Check key match
        if (e.key.toLowerCase() !== config.key.toLowerCase()) continue;

        // Check modifier match
        const ctrlOrMeta = e.ctrlKey || e.metaKey;
        const needsCtrlOrMeta = config.ctrl || config.meta;

        if (needsCtrlOrMeta && !ctrlOrMeta) continue;
        if (!needsCtrlOrMeta && ctrlOrMeta && config.key !== 'Escape') continue;
        if (config.shift && !e.shiftKey) continue;
        if (config.alt && !e.altKey) continue;

        // Execute action
        e.preventDefault();
        e.stopPropagation();
        config.action();
        return;
      }
    },
    [enabled, fullShortcuts]
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    pressedKeysRef.current.delete(e.key.toLowerCase());
  }, []);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [enabled, handleKeyDown, handleKeyUp]);

  // Return list of shortcuts for help display
  const getShortcutList = useCallback(() => {
    return Object.entries(fullShortcuts).map(([id, config]) => ({
      id,
      description: config.description || id,
      key: config.key,
      modifiers: [
        config.ctrl || config.meta ? (window.dex?.platform?.isMac ? '⌘' : 'Ctrl') : null,
        config.shift ? 'Shift' : null,
        config.alt ? 'Alt' : null,
      ].filter(Boolean).join('+'),
    }));
  }, [fullShortcuts]);

  return { getShortcutList };
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useFocusVisible
// Ensures focus indicators are always visible for keyboard navigation
// Returns boolean indicating if user is navigating with keyboard
// ─────────────────────────────────────────────────────────────────────────────

export const useFocusVisible = (): boolean => {
  const [isKeyboardUser, setIsKeyboardUser] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setIsKeyboardUser(true);
        document.body.classList.add('using-keyboard');
      }
    };

    const handleMouseDown = () => {
      setIsKeyboardUser(false);
      document.body.classList.remove('using-keyboard');
    };

    window.addEventListener('keydown', handleKeyDown, { passive: true });
    window.addEventListener('mousedown', handleMouseDown, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  return isKeyboardUser;
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useFocusTrap
// Prevents focus from escaping modal dialogs
// ─────────────────────────────────────────────────────────────────────────────

export const useFocusTrap = (
  containerRef: React.RefObject<HTMLElement>,
  enabled: boolean = true
) => {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const focusableSelector = 
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = container.querySelectorAll<HTMLElement>(focusableSelector);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    
    // Focus first element on mount
    const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
    firstFocusable?.focus();

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, enabled]);
};

export default useKeyboardShortcuts;
