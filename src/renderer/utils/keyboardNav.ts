// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Keyboard Navigation Utilities (Items 85-95)
 * Comprehensive keyboard shortcut management and focus trapping
 */

import { useCallback, useEffect, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  action: string;
  description: string;
  category?: string;
  global?: boolean;
  preventDefault?: boolean;
}

export interface KeyBindingGroup {
  category: string;
  bindings: KeyBinding[];
}

// ============================================================================
// Default Keybindings
// ============================================================================

export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  // Global Navigation
  { key: 'Space', ctrl: true, action: 'spotlight', description: 'Open Spotlight Search', category: 'Global', global: true },
  { key: 'Escape', action: 'close-modal', description: 'Close modal/dialog', category: 'Global' },
  { key: 'Tab', action: 'focus-next', description: 'Focus next element', category: 'Navigation' },
  { key: 'Tab', shift: true, action: 'focus-prev', description: 'Focus previous element', category: 'Navigation' },
  
  // App Switching
  { key: '1', ctrl: true, action: 'app-home', description: 'Go to Home', category: 'Apps', global: true },
  { key: '2', ctrl: true, action: 'app-settings', description: 'Open Settings', category: 'Apps', global: true },
  { key: '3', ctrl: true, action: 'app-files', description: 'Open Files', category: 'Apps', global: true },
  { key: '4', ctrl: true, action: 'app-notes', description: 'Open Notes', category: 'Apps', global: true },
  { key: '5', ctrl: true, action: 'app-tasks', description: 'Open Tasks', category: 'Apps', global: true },
  { key: '6', ctrl: true, action: 'app-browser', description: 'Open Browser', category: 'Apps', global: true },
  { key: '7', ctrl: true, action: 'app-gallery', description: 'Open Gallery', category: 'Apps', global: true },
  { key: '8', ctrl: true, action: 'app-calendar', description: 'Open Calendar', category: 'Apps', global: true },
  { key: '9', ctrl: true, action: 'app-kanban', description: 'Open Kanban', category: 'Apps', global: true },
  
  // Creative Apps
  { key: 'V', alt: true, action: 'app-vinx', description: 'Open VINX', category: 'Creative', global: true },
  { key: 'I', alt: true, action: 'app-imosion', description: 'Open Imosion', category: 'Creative', global: true },
  { key: 'R', alt: true, action: 'app-prism', description: 'Open Prism', category: 'Creative', global: true },
  { key: 'F', alt: true, action: 'app-flux', description: 'Open Flux', category: 'Creative', global: true },
  { key: 'G', alt: true, action: 'app-forge', description: 'Open Forge', category: 'Creative', global: true },
  { key: 'X', alt: true, action: 'app-axl', description: 'Open AXL', category: 'Creative', global: true },
  
  // Window Management
  { key: 'w', ctrl: true, action: 'close-window', description: 'Close current window', category: 'Window' },
  { key: 'm', ctrl: true, action: 'minimize-window', description: 'Minimize window', category: 'Window' },
  { key: 'Enter', alt: true, action: 'fullscreen', description: 'Toggle fullscreen', category: 'Window' },
  
  // Editing
  { key: 'z', ctrl: true, action: 'undo', description: 'Undo', category: 'Edit' },
  { key: 'z', ctrl: true, shift: true, action: 'redo', description: 'Redo', category: 'Edit' },
  { key: 'y', ctrl: true, action: 'redo', description: 'Redo (alternative)', category: 'Edit' },
  { key: 'a', ctrl: true, action: 'select-all', description: 'Select all', category: 'Edit' },
  { key: 'c', ctrl: true, action: 'copy', description: 'Copy', category: 'Edit' },
  { key: 'x', ctrl: true, action: 'cut', description: 'Cut', category: 'Edit' },
  { key: 'v', ctrl: true, action: 'paste', description: 'Paste', category: 'Edit' },
  { key: 's', ctrl: true, action: 'save', description: 'Save', category: 'Edit' },
  { key: 's', ctrl: true, shift: true, action: 'save-as', description: 'Save As', category: 'Edit' },
  
  // Zoom
  { key: '+', ctrl: true, action: 'zoom-in', description: 'Zoom in', category: 'View' },
  { key: '-', ctrl: true, action: 'zoom-out', description: 'Zoom out', category: 'View' },
  { key: '0', ctrl: true, action: 'zoom-reset', description: 'Reset zoom', category: 'View' },
  
  // Media (Creative Apps)
  { key: ' ', action: 'play-pause', description: 'Play/Pause', category: 'Media' },
  { key: 'ArrowLeft', action: 'seek-back', description: 'Seek backward', category: 'Media' },
  { key: 'ArrowRight', action: 'seek-forward', description: 'Seek forward', category: 'Media' },
  { key: 'Home', action: 'seek-start', description: 'Go to start', category: 'Media' },
  { key: 'End', action: 'seek-end', description: 'Go to end', category: 'Media' },
  { key: 'i', action: 'mark-in', description: 'Mark in point', category: 'Media' },
  { key: 'o', action: 'mark-out', description: 'Mark out point', category: 'Media' },
  
  // Accessibility
  { key: '?', shift: true, action: 'show-shortcuts', description: 'Show keyboard shortcuts', category: 'Help' },
  { key: 'F1', action: 'show-help', description: 'Show help', category: 'Help' },
];

// ============================================================================
// Keyboard Event Matching
// ============================================================================

export function matchesKeyBinding(event: KeyboardEvent, binding: KeyBinding): boolean {
  const keyMatch = event.key.toLowerCase() === binding.key.toLowerCase() ||
    event.code.toLowerCase() === `key${binding.key.toLowerCase()}`;
  
  const ctrlMatch = !!binding.ctrl === (event.ctrlKey || event.metaKey);
  const altMatch = !!binding.alt === event.altKey;
  const shiftMatch = !!binding.shift === event.shiftKey;
  
  return keyMatch && ctrlMatch && altMatch && shiftMatch;
}

export function findMatchingBinding(event: KeyboardEvent, bindings: KeyBinding[]): KeyBinding | null {
  for (const binding of bindings) {
    if (matchesKeyBinding(event, binding)) {
      return binding;
    }
  }
  return null;
}

// ============================================================================
// Keyboard Shortcut Hook
// ============================================================================

export function useKeyboardShortcuts(
  bindings: KeyBinding[],
  onAction: (action: string, event: KeyboardEvent) => void,
  options?: { enabled?: boolean; global?: boolean }
) {
  const { enabled = true, global = false } = options || {};

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = event.target as HTMLElement;
      if (
        !global &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const binding = findMatchingBinding(event, bindings);
      if (binding) {
        if (binding.preventDefault !== false) {
          event.preventDefault();
        }
        onAction(binding.action, event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bindings, onAction, enabled, global]);
}

// ============================================================================
// Focus Management
// ============================================================================

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
    .filter(el => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

export function focusFirstElement(container: HTMLElement): boolean {
  const elements = getFocusableElements(container);
  if (elements.length > 0) {
    elements[0].focus();
    return true;
  }
  return false;
}

export function focusLastElement(container: HTMLElement): boolean {
  const elements = getFocusableElements(container);
  if (elements.length > 0) {
    elements[elements.length - 1].focus();
    return true;
  }
  return false;
}

// ============================================================================
// Focus Trap Hook
// ============================================================================

export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, enabled = true) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const previousFocus = document.activeElement as HTMLElement;

    // Focus first element on mount
    focusFirstElement(container);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const elements = getFocusableElements(container);
      if (elements.length === 0) return;

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];

      if (event.shiftKey) {
        // Shift+Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      // Restore previous focus
      previousFocus?.focus?.();
    };
  }, [containerRef, enabled]);
}

// ============================================================================
// Arrow Key Navigation
// ============================================================================

export interface ArrowNavOptions {
  orientation?: 'horizontal' | 'vertical' | 'both';
  wrap?: boolean;
  onSelect?: (element: HTMLElement, index: number) => void;
}

export function useArrowNavigation(
  containerRef: React.RefObject<HTMLElement>,
  options: ArrowNavOptions = {}
) {
  const { orientation = 'both', wrap = true, onSelect } = options;

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const handleKeyDown = (event: KeyboardEvent) => {
      const elements = getFocusableElements(container);
      if (elements.length === 0) return;

      const currentIndex = elements.findIndex(el => el === document.activeElement);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;

      switch (event.key) {
        case 'ArrowUp':
          if (orientation === 'vertical' || orientation === 'both') {
            event.preventDefault();
            nextIndex = currentIndex - 1;
            if (nextIndex < 0) nextIndex = wrap ? elements.length - 1 : 0;
          }
          break;
        case 'ArrowDown':
          if (orientation === 'vertical' || orientation === 'both') {
            event.preventDefault();
            nextIndex = currentIndex + 1;
            if (nextIndex >= elements.length) nextIndex = wrap ? 0 : elements.length - 1;
          }
          break;
        case 'ArrowLeft':
          if (orientation === 'horizontal' || orientation === 'both') {
            event.preventDefault();
            nextIndex = currentIndex - 1;
            if (nextIndex < 0) nextIndex = wrap ? elements.length - 1 : 0;
          }
          break;
        case 'ArrowRight':
          if (orientation === 'horizontal' || orientation === 'both') {
            event.preventDefault();
            nextIndex = currentIndex + 1;
            if (nextIndex >= elements.length) nextIndex = wrap ? 0 : elements.length - 1;
          }
          break;
        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          event.preventDefault();
          nextIndex = elements.length - 1;
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          onSelect?.(elements[currentIndex], currentIndex);
          return;
        default:
          return;
      }

      if (nextIndex !== currentIndex) {
        elements[nextIndex].focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, orientation, wrap, onSelect]);
}

// ============================================================================
// Roving Tabindex
// ============================================================================

export function useRovingTabindex(
  containerRef: React.RefObject<HTMLElement>,
  itemSelector: string
) {
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));

    // Initialize tabindex
    items.forEach((item, index) => {
      item.setAttribute('tabindex', index === 0 ? '0' : '-1');
    });

    const handleFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (items.includes(target)) {
        // Update tabindex
        items.forEach(item => item.setAttribute('tabindex', '-1'));
        target.setAttribute('tabindex', '0');
        lastFocusedRef.current = target;
      }
    };

    container.addEventListener('focusin', handleFocus);
    return () => container.removeEventListener('focusin', handleFocus);
  }, [containerRef, itemSelector]);

  return lastFocusedRef;
}

// ============================================================================
// Skip Link Support
// ============================================================================

export function createSkipLink(targetId: string, label = 'Skip to main content'): HTMLElement {
  const link = document.createElement('a');
  link.href = `#${targetId}`;
  link.textContent = label;
  link.className = 'skip-link';
  link.style.cssText = `
    position: fixed;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    padding: 8px 16px;
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    border: 2px solid var(--color-accent);
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    transition: top 0.2s ease;
  `;

  link.addEventListener('focus', () => {
    link.style.top = '16px';
  });

  link.addEventListener('blur', () => {
    link.style.top = '-100px';
  });

  return link;
}

// ============================================================================
// Keyboard Shortcut Display
// ============================================================================

export function formatKeyBinding(binding: KeyBinding): string {
  const parts: string[] = [];
  
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('⌘');
  
  // Format special keys
  let keyName = binding.key;
  switch (binding.key) {
    case ' ': keyName = 'Space'; break;
    case 'ArrowUp': keyName = '↑'; break;
    case 'ArrowDown': keyName = '↓'; break;
    case 'ArrowLeft': keyName = '←'; break;
    case 'ArrowRight': keyName = '→'; break;
    case 'Escape': keyName = 'Esc'; break;
    case 'Enter': keyName = '↵'; break;
    case 'Backspace': keyName = '⌫'; break;
    case 'Delete': keyName = 'Del'; break;
  }
  
  parts.push(keyName.toUpperCase());
  
  return parts.join(' + ');
}

export function groupKeyBindings(bindings: KeyBinding[]): KeyBindingGroup[] {
  const groups = new Map<string, KeyBinding[]>();
  
  for (const binding of bindings) {
    const category = binding.category || 'Other';
    const group = groups.get(category) || [];
    group.push(binding);
    groups.set(category, group);
  }
  
  return Array.from(groups.entries()).map(([category, bindings]) => ({
    category,
    bindings,
  }));
}
