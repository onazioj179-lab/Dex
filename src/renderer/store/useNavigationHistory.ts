// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Navigation History Store
// Desktop-grade back/forward navigation with state preservation
// ===========================================================================

import { create } from 'zustand';

export interface NavigationEntry {
  page: string;
  scrollPosition?: number;
  timestamp: number;
  state?: Record<string, unknown>;
}

interface NavigationHistoryState {
  // History stack
  history: NavigationEntry[];
  currentIndex: number;
  
  // Actions
  push: (page: string, state?: Record<string, unknown>) => void;
  goBack: () => NavigationEntry | null;
  goForward: () => NavigationEntry | null;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  
  // State preservation
  updateScrollPosition: (position: number) => void;
  updateState: (state: Record<string, unknown>) => void;
  
  // Get current entry
  getCurrentEntry: () => NavigationEntry | null;
  
  // Get full history
  getHistory: () => NavigationEntry[];
  
  // Clear history
  clear: () => void;
}

export const useNavigationHistory = create<NavigationHistoryState>((set, get) => ({
  history: [],
  currentIndex: -1,
  
  push: (page: string, state?: Record<string, unknown>) => {
    const { history, currentIndex } = get();
    
    // Don't push duplicate consecutive pages
    const currentEntry = history[currentIndex];
    if (currentEntry?.page === page) {
      return;
    }
    
    // Truncate forward history when pushing new entry
    const newHistory = history.slice(0, currentIndex + 1);
    
    const newEntry: NavigationEntry = {
      page,
      scrollPosition: 0,
      timestamp: Date.now(),
      state,
    };
    
    // Limit history to 50 entries
    const limitedHistory = [...newHistory, newEntry].slice(-50);
    
    set({
      history: limitedHistory,
      currentIndex: limitedHistory.length - 1,
    });
  },
  
  goBack: () => {
    const { history, currentIndex } = get();
    
    if (currentIndex <= 0) {
      return null;
    }
    
    const newIndex = currentIndex - 1;
    set({ currentIndex: newIndex });
    
    return history[newIndex];
  },
  
  goForward: () => {
    const { history, currentIndex } = get();
    
    if (currentIndex >= history.length - 1) {
      return null;
    }
    
    const newIndex = currentIndex + 1;
    set({ currentIndex: newIndex });
    
    return history[newIndex];
  },
  
  canGoBack: () => {
    const { currentIndex } = get();
    return currentIndex > 0;
  },
  
  canGoForward: () => {
    const { history, currentIndex } = get();
    return currentIndex < history.length - 1;
  },
  
  updateScrollPosition: (position: number) => {
    const { history, currentIndex } = get();
    
    if (currentIndex < 0 || currentIndex >= history.length) {
      return;
    }
    
    const newHistory = [...history];
    newHistory[currentIndex] = {
      ...newHistory[currentIndex],
      scrollPosition: position,
    };
    
    set({ history: newHistory });
  },
  
  updateState: (state: Record<string, unknown>) => {
    const { history, currentIndex } = get();
    
    if (currentIndex < 0 || currentIndex >= history.length) {
      return;
    }
    
    const newHistory = [...history];
    newHistory[currentIndex] = {
      ...newHistory[currentIndex],
      state: { ...newHistory[currentIndex].state, ...state },
    };
    
    set({ history: newHistory });
  },
  
  getCurrentEntry: () => {
    const { history, currentIndex } = get();
    return history[currentIndex] || null;
  },
  
  getHistory: () => {
    const { history } = get();
    return history;
  },
  
  clear: () => {
    set({ history: [], currentIndex: -1 });
  },
}));

// Hook for keyboard shortcuts
export const useNavigationShortcuts = (
  onNavigate: (page: string) => void
) => {
  const { goBack, goForward, canGoBack, canGoForward } = useNavigationHistory();
  
  const handleKeyDown = (e: KeyboardEvent) => {
    // Alt+Left for Back, Alt+Right for Forward (Windows/Linux)
    // Cmd+[ for Back, Cmd+] for Forward (macOS)
    const isMac = navigator.platform.toLowerCase().includes('mac');
    
    if (isMac) {
      if (e.metaKey && e.key === '[' && canGoBack()) {
        e.preventDefault();
        const entry = goBack();
        if (entry) onNavigate(entry.page);
      } else if (e.metaKey && e.key === ']' && canGoForward()) {
        e.preventDefault();
        const entry = goForward();
        if (entry) onNavigate(entry.page);
      }
    } else {
      if (e.altKey && e.key === 'ArrowLeft' && canGoBack()) {
        e.preventDefault();
        const entry = goBack();
        if (entry) onNavigate(entry.page);
      } else if (e.altKey && e.key === 'ArrowRight' && canGoForward()) {
        e.preventDefault();
        const entry = goForward();
        if (entry) onNavigate(entry.page);
      }
    }
  };
  
  return handleKeyDown;
};
