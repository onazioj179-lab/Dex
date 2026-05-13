// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lazy image loader using IntersectionObserver. Sets `src` from `data-src`
 * (and optional `srcset` from `data-srcset`) only when the element enters
 * the viewport. Falls back to immediate load when IO is unavailable.
 */

export interface LazyImageOptions {
  rootMargin?: string;
  threshold?: number;
}

export interface LazyImageController {
  observe(el: HTMLImageElement): void;
  unobserve(el: HTMLImageElement): void;
  disconnect(): void;
}

function loadElement(el: HTMLImageElement): void {
  const src = el.getAttribute('data-src');
  const srcset = el.getAttribute('data-srcset');
  if (src) {
    el.src = src;
    el.removeAttribute('data-src');
  }
  if (srcset) {
    el.srcset = srcset;
    el.removeAttribute('data-srcset');
  }
}

export function createLazyImageLoader(options: LazyImageOptions = {}): LazyImageController {
  const hasIO = typeof IntersectionObserver !== 'undefined';
  if (!hasIO) {
    return {
      observe(el) { loadElement(el); },
      unobserve() { /* no-op */ },
      disconnect() { /* no-op */ },
    };
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = entry.target as HTMLImageElement;
      loadElement(target);
      io.unobserve(target);
    }
  }, {
    rootMargin: options.rootMargin ?? '200px',
    threshold: options.threshold ?? 0,
  });
  return {
    observe(el) { io.observe(el); },
    unobserve(el) { io.unobserve(el); },
    disconnect() { io.disconnect(); },
  };
}
