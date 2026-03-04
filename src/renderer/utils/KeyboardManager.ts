// ═══════════════════════════════════════════════════════════════════════════
// DEX - Keyboard Navigation Manager
// Phase 10: Full keyboard accessibility for power users
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useCallback, useRef } from 'react';

// Global keyboard shortcuts
export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

// Hook for global keyboard shortcuts
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow Escape to work even in inputs
        if (e.key !== 'Escape') return;
      }

      for (const shortcut of shortcuts) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;

        if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
          e.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

// Hook for arrow key navigation within a list
export function useListNavigation<T>(
  items: T[],
  selectedIndex: number,
  setSelectedIndex: (index: number) => void,
  onSelect?: (item: T) => void,
  options?: {
    wrap?: boolean;
    horizontal?: boolean;
  }
): {
  handleKeyDown: (e: React.KeyboardEvent) => void;
  containerRef: React.RefObject<HTMLDivElement>;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const { wrap = true, horizontal = false } = options || {};

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const upKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const downKey = horizontal ? 'ArrowRight' : 'ArrowDown';

    switch (e.key) {
      case upKey: {
        e.preventDefault();
        let newIndex = selectedIndex - 1;
        if (newIndex < 0) {
          newIndex = wrap ? items.length - 1 : 0;
        }
        setSelectedIndex(newIndex);
        break;
      }
      case downKey: {
        e.preventDefault();
        let newIndex = selectedIndex + 1;
        if (newIndex >= items.length) {
          newIndex = wrap ? 0 : items.length - 1;
        }
        setSelectedIndex(newIndex);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (items[selectedIndex] && onSelect) {
          onSelect(items[selectedIndex]);
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        setSelectedIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setSelectedIndex(items.length - 1);
        break;
      }
    }
  }, [items, selectedIndex, setSelectedIndex, onSelect, wrap, horizontal]);

  // Scroll selected item into view
  useEffect(() => {
    if (containerRef.current) {
      const selectedEl = containerRef.current.querySelector('[data-selected="true"]');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  return { handleKeyDown, containerRef };
}

// Hook for focus trap (modal dialogs)
export function useFocusTrap(isActive: boolean): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element on open
    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

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
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return containerRef;
}

// Hook for command palette / quick search
export function useCommandPalette(
  commands: Array<{ id: string; label: string; action: () => void; category?: string }>,
  isOpen: boolean,
  onClose: () => void
): {
  query: string;
  setQuery: (q: string) => void;
  filteredCommands: typeof commands;
  selectedIndex: number;
  handleKeyDown: (e: React.KeyboardEvent) => void;
} {
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const filteredCommands = React.useMemo(() => {
    if (!query) return commands;
    const lowerQuery = query.toLowerCase();
    return commands.filter(
      cmd => 
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.category?.toLowerCase().includes(lowerQuery)
    );
  }, [commands, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset when closing
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % filteredCommands.length);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) {
          cmd.action();
          onClose();
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        onClose();
        break;
      }
    }
  }, [filteredCommands, selectedIndex, onClose]);

  return { query, setQuery, filteredCommands, selectedIndex, handleKeyDown };
}

// Import React for hooks
import React from 'react';

// Default shortcuts for the app
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'k', ctrl: true, action: () => {}, description: 'Open command palette' },
  { key: '/', ctrl: true, action: () => {}, description: 'Focus search' },
  { key: 'n', ctrl: true, action: () => {}, description: 'New item' },
  { key: 's', ctrl: true, action: () => {}, description: 'Save' },
  { key: 'Escape', action: () => {}, description: 'Close/Cancel' },
  { key: '1', ctrl: true, action: () => {}, description: 'Go to Dashboard' },
  { key: '2', ctrl: true, action: () => {}, description: 'Go to Operations' },
  { key: '3', ctrl: true, action: () => {}, description: 'Go to Workflows' },
];
