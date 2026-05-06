// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - Progressive Loading System
// Phase C: Optimistic UI (Items 121-135)
// Show cached data immediately, fetch fresh in background
// =============================================================================

// ---------------------------------------------------------------------------
// 121-125. Cache-First Loading
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  stale: boolean;
}

interface CacheOptions {
  /** Max age in milliseconds before data is considered stale */
  maxAge?: number;
  /** Storage key prefix */
  prefix?: string;
  /** Use localStorage instead of memory */
  persistent?: boolean;
}

class ProgressiveCache {
  private memory: Map<string, CacheEntry<unknown>> = new Map();
  private prefix: string;
  private maxAge: number;
  private persistent: boolean;

  constructor(options: CacheOptions = {}) {
    this.prefix = options.prefix || 'dex-cache';
    this.maxAge = options.maxAge || 5 * 60 * 1000; // 5 minutes default
    this.persistent = options.persistent || false;
  }

  /**
   * Get cached data (memory first, then localStorage)
   */
  get<T>(key: string): CacheEntry<T> | null {
    const fullKey = `${this.prefix}-${key}`;
    
    // Check memory first
    const memEntry = this.memory.get(fullKey) as CacheEntry<T> | undefined;
    if (memEntry) {
      memEntry.stale = Date.now() - memEntry.timestamp > this.maxAge;
      return memEntry;
    }

    // Check localStorage if persistent
    if (this.persistent && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(fullKey);
        if (stored) {
          const entry = JSON.parse(stored) as CacheEntry<T>;
          entry.stale = Date.now() - entry.timestamp > this.maxAge;
          // Warm memory cache
          this.memory.set(fullKey, entry);
          return entry;
        }
      } catch {
        // Invalid cache entry
      }
    }

    return null;
  }

  /**
   * Set cache entry
   */
  set<T>(key: string, data: T): void {
    const fullKey = `${this.prefix}-${key}`;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      stale: false,
    };

    // Always cache in memory
    this.memory.set(fullKey, entry);

    // Persist if enabled
    if (this.persistent && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(fullKey, JSON.stringify(entry));
      } catch {
        // Storage full or unavailable
      }
    }
  }

  /**
   * Delete cache entry
   */
  delete(key: string): void {
    const fullKey = `${this.prefix}-${key}`;
    this.memory.delete(fullKey);
    if (this.persistent && typeof localStorage !== 'undefined') {
      localStorage.removeItem(fullKey);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.memory.clear();
    if (this.persistent && typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
      keys.forEach(k => localStorage.removeItem(k));
    }
  }
}

// Default cache instance
export const progressiveCache = new ProgressiveCache({ persistent: true });

// ---------------------------------------------------------------------------
// 126-130. Stale-While-Revalidate Pattern
// ---------------------------------------------------------------------------

export interface LoaderState<T> {
  data: T | null;
  isLoading: boolean;
  isValidating: boolean;
  error: Error | null;
  isStale: boolean;
}

export interface LoaderOptions<T> {
  /** Cache key */
  key: string;
  /** Fetch function */
  fetcher: () => Promise<T>;
  /** Initial/fallback data */
  fallback?: T;
  /** Revalidate on mount */
  revalidateOnMount?: boolean;
  /** Revalidate on focus */
  revalidateOnFocus?: boolean;
  /** Revalidate interval (ms) */
  revalidateInterval?: number;
  /** On success callback */
  onSuccess?: (data: T) => void;
  /** On error callback */
  onError?: (error: Error) => void;
}

/**
 * Load data with stale-while-revalidate pattern
 * Shows cached data immediately, fetches fresh in background
 */
export async function loadWithSWR<T>(
  options: LoaderOptions<T>,
  onUpdate: (state: LoaderState<T>) => void
): Promise<T> {
  const { key, fetcher, fallback, onSuccess, onError } = options;

  // Check cache first
  const cached = progressiveCache.get<T>(key);
  
  if (cached) {
    // Return cached data immediately
    onUpdate({
      data: cached.data,
      isLoading: false,
      isValidating: cached.stale,
      error: null,
      isStale: cached.stale,
    });

    // If stale, revalidate in background
    if (cached.stale) {
      try {
        const fresh = await fetcher();
        progressiveCache.set(key, fresh);
        onUpdate({
          data: fresh,
          isLoading: false,
          isValidating: false,
          error: null,
          isStale: false,
        });
        onSuccess?.(fresh);
        return fresh;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onError?.(err);
        // Keep showing stale data on error
        return cached.data;
      }
    }

    return cached.data;
  }

  // No cache - show loading and fetch
  onUpdate({
    data: fallback || null,
    isLoading: true,
    isValidating: false,
    error: null,
    isStale: false,
  });

  try {
    const data = await fetcher();
    progressiveCache.set(key, data);
    onUpdate({
      data,
      isLoading: false,
      isValidating: false,
      error: null,
      isStale: false,
    });
    onSuccess?.(data);
    return data;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onUpdate({
      data: fallback || null,
      isLoading: false,
      isValidating: false,
      error: err,
      isStale: false,
    });
    onError?.(err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 131-135. Progressive Image Loading
// ---------------------------------------------------------------------------

export interface ProgressiveImageState {
  src: string;
  isLoading: boolean;
  isBlurred: boolean;
  error: boolean;
}

/**
 * Load image progressively: placeholder -> low quality -> full quality
 */
export async function loadImageProgressively(
  fullSrc: string,
  options: {
    placeholder?: string;
    lowQualitySrc?: string;
    onUpdate: (state: ProgressiveImageState) => void;
  }
): Promise<void> {
  const { placeholder, lowQualitySrc, onUpdate } = options;

  // Start with placeholder
  onUpdate({
    src: placeholder || '',
    isLoading: true,
    isBlurred: true,
    error: false,
  });

  // Load low quality first if available
  if (lowQualitySrc) {
    try {
      await preloadImage(lowQualitySrc);
      onUpdate({
        src: lowQualitySrc,
        isLoading: true,
        isBlurred: true,
        error: false,
      });
    } catch {
      // Continue to full quality
    }
  }

  // Load full quality
  try {
    await preloadImage(fullSrc);
    onUpdate({
      src: fullSrc,
      isLoading: false,
      isBlurred: false,
      error: false,
    });
  } catch {
    onUpdate({
      src: placeholder || '',
      isLoading: false,
      isBlurred: false,
      error: true,
    });
  }
}

/**
 * Preload an image
 */
export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Generate a dominant color placeholder
 */
export function getDominantColorPlaceholder(color: string): string {
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="${encodeURIComponent(color)}" width="1" height="1"/></svg>`;
}

/**
 * Generate a blur placeholder from image
 */
export async function generateBlurPlaceholder(
  src: string,
  size = 10
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = Math.round(size * (img.height / img.width));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.1));
    };
    img.onerror = reject;
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Streaming Data Loading
// ---------------------------------------------------------------------------

export interface StreamOptions<T> {
  /** Parse each chunk */
  parseChunk: (chunk: string) => T[];
  /** Called for each parsed item */
  onItem: (item: T) => void;
  /** Called on completion */
  onComplete?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Stream data from a URL, parsing and delivering items as they arrive
 */
export async function streamData<T>(
  url: string,
  options: StreamOptions<T>
): Promise<void> {
  const { parseChunk, onItem, onComplete, onError } = options;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Process remaining buffer
        if (buffer.trim()) {
          const items = parseChunk(buffer);
          items.forEach(onItem);
        }
        onComplete?.();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      
      // Try to parse complete items from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          const items = parseChunk(line);
          items.forEach(onItem);
        }
      }
    }
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export { ProgressiveCache };
export default progressiveCache;
