// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - System Apps Snappy UX
// Phase F: System Apps Snappiness (Items 301-375)
// App-specific optimizations for Files, Browser, Notes, Settings, Terminal
// =============================================================================

import { appPrefetch, saveScrollPosition, restoreScrollPosition } from '../utils/prefetch';
import { progressiveCache, loadWithSWR } from '../utils/progressive-loader';
import { createVirtualScroll, inputPriority } from './InputPriority';
import { workerPool } from './WorkerPool';

// ---------------------------------------------------------------------------
// 301-320. Files App Snappiness
// ---------------------------------------------------------------------------

interface FileEntry {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number;
  modified: number;
  thumbnail?: string;
}

/**
 * Create virtual file list for large directories
 */
export function createVirtualFileList(
  container: HTMLElement,
  files: FileEntry[],
  onRenderItem: (file: FileEntry, element: HTMLElement) => void,
  itemHeight = 32
): {
  update: (newFiles: FileEntry[]) => void;
  scrollTo: (fileId: string) => void;
  cleanup: () => void;
} {
  const virtualScroll = createVirtualScroll(container, files.length, { itemHeight });

  // Handle custom rendering
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement && node.classList.contains('file-item')) {
          const fileId = node.dataset.id;
          const file = files.find(f => f.id === fileId);
          if (file) onRenderItem(file, node);
        }
      }
    }
  });

  observer.observe(container, { childList: true, subtree: true });

  return {
    update: (newFiles: FileEntry[]) => {
      files = newFiles;
      virtualScroll.updateTotalItems(newFiles.length);
    },
    scrollTo: (fileId: string) => {
      const index = files.findIndex(f => f.id === fileId);
      if (index >= 0) {
        container.scrollTop = index * itemHeight;
      }
    },
    cleanup: () => {
      observer.disconnect();
      virtualScroll.cleanup();
    },
  };
}

/**
 * File thumbnail generator with caching
 */
export function createFileThumbnailCache(): {
  get: (filePath: string) => string | null;
  generate: (filePath: string, type: string) => Promise<string | null>;
  preload: (files: FileEntry[]) => void;
} {
  const cache = new Map<string, string>();
  const pendingLoads = new Set<string>();

  return {
    get: (filePath: string) => cache.get(filePath) || null,
    
    generate: async (filePath: string, type: string) => {
      if (cache.has(filePath)) return cache.get(filePath)!;
      if (pendingLoads.has(filePath)) return null;

      pendingLoads.add(filePath);

      try {
        // For images, create thumbnail
        if (type.startsWith('image/')) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          return new Promise((resolve) => {
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const size = 64;
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext('2d')!;
              
              // Center crop
              const aspect = img.width / img.height;
              let sx = 0, sy = 0, sw = img.width, sh = img.height;
              if (aspect > 1) {
                sx = (img.width - img.height) / 2;
                sw = img.height;
              } else {
                sy = (img.height - img.width) / 2;
                sh = img.width;
              }
              
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              cache.set(filePath, dataUrl);
              pendingLoads.delete(filePath);
              resolve(dataUrl);
            };
            img.onerror = () => {
              pendingLoads.delete(filePath);
              resolve(null);
            };
            img.src = filePath;
          });
        }

        // For other types, return type icon
        pendingLoads.delete(filePath);
        return null;
      } catch {
        pendingLoads.delete(filePath);
        return null;
      }
    },
    
    preload: (files: FileEntry[]) => {
      // Preload visible thumbnails during idle
      const imageFiles = files.filter(f => 
        f.type === 'file' && 
        /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f.name)
      ).slice(0, 20); // Limit to first 20

      const loadNext = (index: number) => {
        if (index >= imageFiles.length) return;
        
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => {
            const file = imageFiles[index];
            if (file && !cache.has(file.path)) {
              // Trigger load but don't await
              void cache; // Using cache variable for type check
            }
            loadNext(index + 1);
          });
        }
      };

      loadNext(0);
    },
  };
}

/**
 * Instant file preview
 */
export function createFilePreviewManager(): {
  preview: (file: FileEntry) => void;
  closePreview: () => void;
  isOpen: () => boolean;
} {
  let previewElement: HTMLElement | null = null;
  let isPreviewOpen = false;

  return {
    preview: (file: FileEntry) => {
      if (!previewElement) {
        previewElement = document.createElement('div');
        previewElement.className = 'dex-file-preview';
        previewElement.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) scale(0.9);
          opacity: 0;
          transition: transform 150ms ease-out, opacity 150ms ease-out;
          z-index: var(--z-drag-overlay);
          background: var(--color-bg-elevated);
          border-radius: 8px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
          padding: 20px;
        `;
        document.body.appendChild(previewElement);
      }

      previewElement.textContent = `Preview: ${file.name}`;
      
      // Animate in
      requestAnimationFrame(() => {
        if (previewElement) {
          previewElement.style.transform = 'translate(-50%, -50%) scale(1)';
          previewElement.style.opacity = '1';
        }
      });

      isPreviewOpen = true;
    },
    
    closePreview: () => {
      if (previewElement) {
        previewElement.style.transform = 'translate(-50%, -50%) scale(0.9)';
        previewElement.style.opacity = '0';
        
        setTimeout(() => {
          if (previewElement) {
            previewElement.remove();
            previewElement = null;
          }
        }, 150);
      }
      isPreviewOpen = false;
    },
    
    isOpen: () => isPreviewOpen,
  };
}

// ---------------------------------------------------------------------------
// 321-340. Browser Snappiness
// ---------------------------------------------------------------------------

/**
 * Tab state caching for instant switching
 */
export function createTabStateCache(): {
  save: (tabId: string, state: { scrollY: number; formData: Record<string, string>; url: string }) => void;
  restore: (tabId: string) => { scrollY: number; formData: Record<string, string>; url: string } | null;
  clear: (tabId: string) => void;
} {
  const cache = new Map<string, { scrollY: number; formData: Record<string, string>; url: string }>();

  return {
    save: (tabId, state) => {
      cache.set(tabId, state);
    },
    restore: (tabId) => cache.get(tabId) || null,
    clear: (tabId) => {
      cache.delete(tabId);
    },
  };
}

/**
 * Prefetch links on hover
 */
export function createLinkPrefetcher(): {
  observe: (element: HTMLElement) => void;
  unobserve: (element: HTMLElement) => void;
} {
  const prefetched = new Set<string>();
  const observers = new Map<HTMLElement, () => void>();

  return {
    observe: (element: HTMLElement) => {
      const links = element.querySelectorAll('a[href]');
      
      links.forEach(link => {
        const anchor = link as HTMLAnchorElement;
        const href = anchor.href;
        
        if (!href || prefetched.has(href)) return;
        
        const handleHover = () => {
          if (prefetched.has(href)) return;
          prefetched.add(href);
          
          // Create prefetch link
          const prefetchLink = document.createElement('link');
          prefetchLink.rel = 'prefetch';
          prefetchLink.href = href;
          document.head.appendChild(prefetchLink);
        };

        anchor.addEventListener('pointerenter', handleHover, { once: true });
      });
    },
    unobserve: (element: HTMLElement) => {
      const cleanup = observers.get(element);
      if (cleanup) {
        cleanup();
        observers.delete(element);
      }
    },
  };
}

/**
 * Smooth navigation transitions
 */
export function createBrowserTransitions(): {
  startNavigation: (fromUrl: string, toUrl: string) => void;
  completeNavigation: () => void;
  cancelNavigation: () => void;
} {
  let transitioning = false;
  let transitionOverlay: HTMLElement | null = null;

  return {
    startNavigation: (fromUrl: string, toUrl: string) => {
      transitioning = true;
      
      // Create subtle loading overlay
      transitionOverlay = document.createElement('div');
      transitionOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, var(--color-accent), transparent);
        z-index: var(--z-drag-overlay);
        animation: browserLoading 1s infinite;
      `;
      
      // Add animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes browserLoading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `;
      transitionOverlay.appendChild(style);
      document.body.appendChild(transitionOverlay);
    },
    
    completeNavigation: () => {
      if (transitionOverlay) {
        transitionOverlay.style.opacity = '0';
        transitionOverlay.style.transition = 'opacity 200ms';
        setTimeout(() => {
          transitionOverlay?.remove();
          transitionOverlay = null;
        }, 200);
      }
      transitioning = false;
    },
    
    cancelNavigation: () => {
      transitionOverlay?.remove();
      transitionOverlay = null;
      transitioning = false;
    },
  };
}

// ---------------------------------------------------------------------------
// 341-360. Notes App Snappiness
// ---------------------------------------------------------------------------

/**
 * Note list with virtual scrolling
 */
export function createNoteListOptimizer(
  container: HTMLElement,
  notes: Array<{ id: string; title: string; preview: string; modified: number }>
): {
  update: (newNotes: typeof notes) => void;
  scrollToNote: (noteId: string) => void;
  cleanup: () => void;
} {
  const itemHeight = 72; // Note card height
  const virtualScroll = createVirtualScroll(container, notes.length, { itemHeight });

  return {
    update: (newNotes) => {
      notes = newNotes;
      virtualScroll.updateTotalItems(newNotes.length);
    },
    scrollToNote: (noteId: string) => {
      const index = notes.findIndex(n => n.id === noteId);
      if (index >= 0) {
        container.scrollTop = index * itemHeight;
      }
    },
    cleanup: () => virtualScroll.cleanup(),
  };
}

/**
 * Instant note search
 */
export function createNoteSearcher(): {
  index: (notes: Array<{ id: string; title: string; content: string }>) => void;
  search: (query: string) => Array<{ id: string; title: string; snippet: string }>;
} {
  let indexed: Array<{ id: string; title: string; content: string; titleLower: string; contentLower: string }> = [];

  return {
    index: (notes) => {
      indexed = notes.map(n => ({
        ...n,
        titleLower: n.title.toLowerCase(),
        contentLower: n.content.toLowerCase(),
      }));
    },
    search: (query) => {
      if (!query.trim()) return [];
      
      const q = query.toLowerCase();
      const results: Array<{ id: string; title: string; snippet: string; score: number }> = [];

      for (const note of indexed) {
        let score = 0;
        let snippet = '';

        // Title match (higher weight)
        if (note.titleLower.includes(q)) {
          score += 10;
          snippet = note.title;
        }

        // Content match
        const contentIndex = note.contentLower.indexOf(q);
        if (contentIndex >= 0) {
          score += 5;
          // Extract snippet around match
          const start = Math.max(0, contentIndex - 30);
          const end = Math.min(note.content.length, contentIndex + query.length + 30);
          snippet = (start > 0 ? '...' : '') + 
                    note.content.slice(start, end) + 
                    (end < note.content.length ? '...' : '');
        }

        if (score > 0) {
          results.push({ id: note.id, title: note.title, snippet, score });
        }
      }

      // Sort by score
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, 20).map(({ id, title, snippet }) => ({ id, title, snippet }));
    },
  };
}

/**
 * Autosave with debouncing
 */
export function createNoteAutosave(
  saveFunction: (noteId: string, content: string) => Promise<void>,
  debounceMs = 1000
): {
  queueSave: (noteId: string, content: string) => void;
  flushAll: () => Promise<void>;
} {
  const pending = new Map<string, { content: string; timeout: number }>();

  return {
    queueSave: (noteId: string, content: string) => {
      const existing = pending.get(noteId);
      if (existing) {
        clearTimeout(existing.timeout);
      }

      const timeout = window.setTimeout(async () => {
        pending.delete(noteId);
        try {
          await saveFunction(noteId, content);
        } catch (error) {
          console.error('Failed to save note:', error);
        }
      }, debounceMs);

      pending.set(noteId, { content, timeout });
    },
    
    flushAll: async () => {
      const saves: Promise<void>[] = [];
      for (const [noteId, { content, timeout }] of pending) {
        clearTimeout(timeout);
        saves.push(saveFunction(noteId, content));
      }
      pending.clear();
      await Promise.all(saves);
    },
  };
}

// ---------------------------------------------------------------------------
// 361-375. Settings & System Snappiness
// ---------------------------------------------------------------------------

/**
 * Settings panel with instant navigation
 */
export function createSettingsNavigator(): {
  navigateTo: (section: string) => void;
  getCurrentSection: () => string;
  registerSection: (id: string, element: HTMLElement) => void;
} {
  const sections = new Map<string, HTMLElement>();
  let currentSection = '';

  return {
    navigateTo: (section: string) => {
      const element = sections.get(section);
      if (!element) return;

      // Instant scroll with no animation for snappiness
      element.scrollIntoView({ behavior: 'auto', block: 'start' });
      currentSection = section;

      // Highlight current section
      sections.forEach((el, id) => {
        el.classList.toggle('dex-settings-active', id === section);
      });
    },
    getCurrentSection: () => currentSection,
    registerSection: (id: string, element: HTMLElement) => {
      sections.set(id, element);
    },
  };
}

/**
 * System preferences caching
 */
export function createPreferencesCache(): {
  get: <T>(key: string, defaultValue: T) => T;
  set: <T>(key: string, value: T) => void;
  subscribe: (key: string, callback: (value: unknown) => void) => () => void;
} {
  const cache = new Map<string, unknown>();
  const subscribers = new Map<string, Set<(value: unknown) => void>>();
  
  // Load from localStorage
  try {
    const stored = localStorage.getItem('dex-preferences');
    if (stored) {
      const parsed = JSON.parse(stored);
      for (const [key, value] of Object.entries(parsed)) {
        cache.set(key, value);
      }
    }
  } catch {
    // Storage unavailable
  }

  return {
    get: <T>(key: string, defaultValue: T): T => {
      return (cache.has(key) ? cache.get(key) : defaultValue) as T;
    },
    
    set: <T>(key: string, value: T) => {
      cache.set(key, value);
      
      // Notify subscribers
      const subs = subscribers.get(key);
      if (subs) {
        subs.forEach(cb => cb(value));
      }

      // Persist
      try {
        const obj: Record<string, unknown> = {};
        cache.forEach((v, k) => { obj[k] = v; });
        localStorage.setItem('dex-preferences', JSON.stringify(obj));
      } catch {
        // Storage full
      }
    },
    
    subscribe: (key: string, callback: (value: unknown) => void) => {
      if (!subscribers.has(key)) {
        subscribers.set(key, new Set());
      }
      subscribers.get(key)!.add(callback);
      
      return () => {
        subscribers.get(key)?.delete(callback);
      };
    },
  };
}

/**
 * Terminal output optimization
 */
export function createTerminalOptimizer(): {
  appendLine: (line: string) => void;
  getLines: () => string[];
  clear: () => void;
  scrollToBottom: () => void;
} {
  const lines: string[] = [];
  const maxLines = 10000;
  let container: HTMLElement | null = null;

  return {
    appendLine: (line: string) => {
      lines.push(line);
      
      // Trim old lines
      if (lines.length > maxLines) {
        lines.splice(0, lines.length - maxLines);
      }
    },
    
    getLines: () => [...lines],
    
    clear: () => {
      lines.length = 0;
    },
    
    scrollToBottom: () => {
      if (container) {
        (container as HTMLElement).scrollTop = (container as HTMLElement).scrollHeight;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// All exports are at declaration
