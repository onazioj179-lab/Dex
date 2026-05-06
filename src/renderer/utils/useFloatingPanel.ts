// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * useFloatingPanel — shared hook for floating panel management.
 * Provides ESC-to-close, click-outside-to-close, and z-index stacking.
 */

import { useEffect, useRef, useCallback } from 'react';

// Global panel stack for z-index management and ESC ordering
let panelStack: Array<{ id: string; close: () => void }> = [];
let nextZIndex = 500;

/** Register a panel and get its z-index. Returns cleanup function. */
function registerPanel(id: string, close: () => void): { zIndex: number; unregister: () => void } {
  // Remove if already registered (re-open)
  panelStack = panelStack.filter(p => p.id !== id);
  const zIndex = nextZIndex++;
  panelStack.push({ id, close });
  return {
    zIndex,
    unregister: () => {
      panelStack = panelStack.filter(p => p.id !== id);
    },
  };
}

/** Close the topmost panel (called on ESC) */
function closeTopmost(): boolean {
  if (panelStack.length === 0) return false;
  const top = panelStack[panelStack.length - 1];
  top.close();
  panelStack = panelStack.filter(p => p.id !== top.id);
  return true;
}

// Global ESC listener (installed once)
let escListenerInstalled = false;
function installEscListener() {
  if (escListenerInstalled) return;
  escListenerInstalled = true;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (closeTopmost()) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  });
}

/**
 * Hook for a floating panel.
 * @param isOpen - whether this panel is currently visible
 * @param onClose - setter to close the panel
 * @param panelId - unique string id for this panel
 * @param clickOutsideToClose - if true, clicking outside the panel ref closes it (default true)
 */
export function useFloatingPanel(
  isOpen: boolean,
  onClose: () => void,
  panelId: string,
  clickOutsideToClose = true,
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const zIndexRef = useRef(500);

  useEffect(() => {
    installEscListener();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const { zIndex, unregister } = registerPanel(panelId, onClose);
    zIndexRef.current = zIndex;
    return unregister;
  }, [isOpen, panelId, onClose]);

  // Click-outside handler
  useEffect(() => {
    if (!isOpen || !clickOutsideToClose) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing on the same click that opened
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handler);
    };
  }, [isOpen, onClose, clickOutsideToClose]);

  return { panelRef, zIndex: zIndexRef.current };
}
