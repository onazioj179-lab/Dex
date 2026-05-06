// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Prefetch System
// Phase D: App Switching and Navigation (Items 151-185)
// Preload apps and navigation targets for instant switching
// =============================================================================

// ---------------------------------------------------------------------------
// 151-160. App Prefetch System
// ---------------------------------------------------------------------------

interface AppCacheEntry {
  id: string;
  state: unknown;
  timestamp: number;
  scrollPositions: Map<string, number>;
}

interface PrefetchOptions {
  /** Max apps to keep in memory */
  maxCached?: number;
  /** Preload on hover delay (ms) */
  hoverDelay?: number;
  /** Priority apps to always keep cached */
  priorityApps?: string[];
}

class AppPrefetchManager {
  private appCache: Map<string, AppCacheEntry> = new Map();
  private loadingApps: Set<string> = new Set();
  private maxCached: number;
  private hoverDelay: number;
  private priorityApps: Set<string>;
  private hoverTimeouts: Map<string, number> = new Map();

  constructor(options: PrefetchOptions = {}) {
    this.maxCached = options.maxCached || 5;
    this.hoverDelay = options.hoverDelay || 100;
    this.priorityApps = new Set(options.priorityApps || []);
  }

  /**
   * Cache app state for instant restore
   */
  cacheAppState(appId: string, state: unknown, scrollPositions?: Map<string, number>): void {
    // Evict oldest non-priority apps if at capacity
    if (this.appCache.size >= this.maxCached && !this.appCache.has(appId)) {
      this.evictOldest();
    }

    this.appCache.set(appId, {
      id: appId,
      state,
      timestamp: Date.now(),
      scrollPositions: scrollPositions || new Map(),
    });
  }

  /**
   * Get cached app state
   */
  getCachedState(appId: string): AppCacheEntry | null {
    return this.appCache.get(appId) || null;
  }

  /**
   * Check if app is cached
   */
  isCached(appId: string): boolean {
    return this.appCache.has(appId);
  }

  /**
   * Evict oldest non-priority app
   */
  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.appCache) {
      if (!this.priorityApps.has(id) && entry.timestamp < oldestTime) {
        oldest = id;
        oldestTime = entry.timestamp;
      }
    }

    if (oldest) {
      this.appCache.delete(oldest);
    }
  }

  /**
   * Prefetch app on hover
   */
  prefetchOnHover(appId: string, loader: () => Promise<void>): () => void {
    // Clear any existing timeout
    const existing = this.hoverTimeouts.get(appId);
    if (existing) clearTimeout(existing);

    // Start prefetch after delay
    const timeout = window.setTimeout(async () => {
      if (!this.isCached(appId) && !this.loadingApps.has(appId)) {
        this.loadingApps.add(appId);
        try {
          await loader();
        } finally {
          this.loadingApps.delete(appId);
        }
      }
    }, this.hoverDelay);

    this.hoverTimeouts.set(appId, timeout);

    // Return cancel function
    return () => {
      clearTimeout(timeout);
      this.hoverTimeouts.delete(appId);
    };
  }

  /**
   * Clear all cached apps
   */
  clear(): void {
    this.appCache.clear();
    this.hoverTimeouts.forEach(t => clearTimeout(t));
    this.hoverTimeouts.clear();
  }
}

export const appPrefetch = new AppPrefetchManager();

// ---------------------------------------------------------------------------
// 161-170. Navigation Prefetch
// ---------------------------------------------------------------------------

interface PrefetchLink {
  href: string;
  type: 'page' | 'image' | 'script' | 'style';
  priority?: 'high' | 'low' | 'auto';
}

const prefetchedUrls = new Set<string>();
const prefetchQueue: PrefetchLink[] = [];
let isPrefetching = false;

/**
 * Prefetch a URL
 */
export function prefetch(url: string, type: PrefetchLink['type'] = 'page'): void {
  if (prefetchedUrls.has(url)) return;
  
  prefetchQueue.push({ href: url, type, priority: 'auto' });
  processPrefetchQueue();
}

/**
 * Prefetch on link hover
 */
export function prefetchOnHover(element: HTMLElement, url: string): () => void {
  let timeout: number | null = null;

  const handleEnter = () => {
    timeout = window.setTimeout(() => {
      prefetch(url);
    }, 100);
  };

  const handleLeave = () => {
    if (timeout) clearTimeout(timeout);
  };

  element.addEventListener('pointerenter', handleEnter);
  element.addEventListener('pointerleave', handleLeave);

  return () => {
    element.removeEventListener('pointerenter', handleEnter);
    element.removeEventListener('pointerleave', handleLeave);
    if (timeout) clearTimeout(timeout);
  };
}

/**
 * Process prefetch queue during idle time
 */
function processPrefetchQueue(): void {
  if (isPrefetching || prefetchQueue.length === 0) return;
  isPrefetching = true;

  const runPrefetch = () => {
    const link = prefetchQueue.shift();
    if (!link) {
      isPrefetching = false;
      return;
    }

    if (prefetchedUrls.has(link.href)) {
      // Skip already prefetched
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(runPrefetch);
      } else {
        setTimeout(runPrefetch, 0);
      }
      return;
    }

    prefetchedUrls.add(link.href);

    // Create prefetch link element
    const el = document.createElement('link');
    el.rel = link.type === 'page' ? 'prefetch' : 'preload';
    el.href = link.href;
    
    if (link.type === 'script') el.as = 'script';
    else if (link.type === 'style') el.as = 'style';
    else if (link.type === 'image') el.as = 'image';

    el.onload = el.onerror = () => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(runPrefetch);
      } else {
        setTimeout(runPrefetch, 0);
      }
    };

    document.head.appendChild(el);
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(runPrefetch);
  } else {
    setTimeout(runPrefetch, 0);
  }
}

// ---------------------------------------------------------------------------
// 171-180. Navigation Transitions
// ---------------------------------------------------------------------------

interface TransitionState {
  from: string;
  to: string;
  direction: 'forward' | 'back' | 'replace';
  sharedElements: Map<string, DOMRect>;
}

let currentTransition: TransitionState | null = null;

/**
 * Start a navigation transition
 */
export function startTransition(
  from: string,
  to: string,
  direction: 'forward' | 'back' | 'replace' = 'forward'
): TransitionState {
  // Capture shared element positions
  const sharedElements = new Map<string, DOMRect>();
  document.querySelectorAll('[data-shared-element]').forEach(el => {
    const id = el.getAttribute('data-shared-element');
    if (id) {
      sharedElements.set(id, el.getBoundingClientRect());
    }
  });

  currentTransition = { from, to, direction, sharedElements };
  return currentTransition;
}

/**
 * Complete transition and animate shared elements
 */
export function completeTransition(): void {
  if (!currentTransition) return;

  const { sharedElements: fromPositions, direction } = currentTransition;

  // Find matching elements in new view
  document.querySelectorAll('[data-shared-element]').forEach(el => {
    const id = el.getAttribute('data-shared-element');
    if (!id || !fromPositions.has(id)) return;

    const fromRect = fromPositions.get(id)!;
    const toRect = el.getBoundingClientRect();

    // Calculate transform
    const translateX = fromRect.left - toRect.left;
    const translateY = fromRect.top - toRect.top;
    const scaleX = fromRect.width / toRect.width;
    const scaleY = fromRect.height / toRect.height;

    // Apply initial transform
    const htmlEl = el as HTMLElement;
    htmlEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
    htmlEl.style.transformOrigin = 'top left';
    htmlEl.style.transition = 'none';

    // Animate to final position
    requestAnimationFrame(() => {
      htmlEl.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)';
      htmlEl.style.transform = 'translate(0, 0) scale(1, 1)';

      // Cleanup after animation
      setTimeout(() => {
        htmlEl.style.transform = '';
        htmlEl.style.transformOrigin = '';
        htmlEl.style.transition = '';
      }, 300);
    });
  });

  // Apply page transition based on direction
  const main = document.querySelector('main') || document.body;
  main.classList.add(`dex-transition-${direction}`);
  
  setTimeout(() => {
    main.classList.remove(`dex-transition-${direction}`);
  }, 300);

  currentTransition = null;
}

// Inject transition styles
if (typeof document !== 'undefined' && !document.getElementById('dex-transition-styles')) {
  const style = document.createElement('style');
  style.id = 'dex-transition-styles';
  style.textContent = `
    .dex-transition-forward {
      animation: dex-slide-in-right 300ms ease-out;
    }
    .dex-transition-back {
      animation: dex-slide-in-left 300ms ease-out;
    }
    .dex-transition-replace {
      animation: dex-fade-in 200ms ease-out;
    }
    @keyframes dex-slide-in-right {
      from { transform: translateX(30px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes dex-slide-in-left {
      from { transform: translateX(-30px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes dex-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// 181-185. Scroll Position Cache
// ---------------------------------------------------------------------------

const scrollPositions = new Map<string, number>();

/**
 * Save scroll position for a route
 */
export function saveScrollPosition(routeKey: string, scrollTop?: number): void {
  const position = scrollTop ?? document.documentElement.scrollTop;
  scrollPositions.set(routeKey, position);
}

/**
 * Restore scroll position for a route
 */
export function restoreScrollPosition(routeKey: string, smooth = false): void {
  const position = scrollPositions.get(routeKey);
  if (position !== undefined) {
    window.scrollTo({
      top: position,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }
}

/**
 * Auto-manage scroll positions for navigation
 */
export function enableScrollRestoration(): () => void {
  let currentRoute = window.location.pathname;

  const handlePopState = () => {
    // Save current position
    saveScrollPosition(currentRoute);
    
    // Restore new route position after paint
    requestAnimationFrame(() => {
      restoreScrollPosition(window.location.pathname);
    });
    
    currentRoute = window.location.pathname;
  };

  window.addEventListener('popstate', handlePopState);

  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
}

// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

const windowStates = new Map<string, WindowState>();

/**
 * Cache window position
 */
export function cacheWindowPosition(windowId: string, state: WindowState): void {
  windowStates.set(windowId, state);
  
  // Persist to localStorage
  try {
    const all = JSON.parse(localStorage.getItem('dex-window-states') || '{}');
    all[windowId] = state;
    localStorage.setItem('dex-window-states', JSON.stringify(all));
  } catch {
    // Storage unavailable
  }
}

/**
 * Restore window position
 */
export function restoreWindowPosition(windowId: string): WindowState | null {
  // Check memory first
  if (windowStates.has(windowId)) {
    return windowStates.get(windowId)!;
  }

  // Check localStorage
  try {
    const all = JSON.parse(localStorage.getItem('dex-window-states') || '{}');
    if (all[windowId]) {
      windowStates.set(windowId, all[windowId]);
      return all[windowId];
    }
  } catch {
    // Storage unavailable
  }

  return null;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export { AppPrefetchManager };
export default appPrefetch;
