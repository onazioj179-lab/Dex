// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Shared reduced-motion + reduced-transparency awareness.
 *
 * One place to ask "should this surface animate / use glass?" so every app and
 * the shell honour the user's OS accessibility preferences identically, instead
 * of each re-implementing matchMedia. `prefersReducedMotion()` is a cheap
 * one-shot read for non-React code (canvas loops, helpers); the hooks are the
 * reactive form for components (they re-render when the OS setting flips).
 */

import { useEffect, useState } from 'react';

function mediaMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try { return window.matchMedia(query).matches; } catch { return false; }
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

/** One-shot read — safe in canvas/RAF loops and module-scope. */
export function prefersReducedMotion(): boolean {
  return mediaMatches(REDUCED_MOTION_QUERY);
}

/** One-shot read for glass/blur gating. */
export function prefersReducedTransparency(): boolean {
  return mediaMatches(REDUCED_TRANSPARENCY_QUERY);
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => mediaMatches(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let mql: MediaQueryList;
    try { mql = window.matchMedia(query); } catch { return; }
    const onChange = () => setMatches(mql.matches);
    onChange();
    // addEventListener is the modern API; addListener is the Safari fallback.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);
  return matches;
}

/** Reactive: true when the user asked the OS to reduce motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}

/** Reactive: true when the user asked the OS to reduce transparency. */
export function useReducedTransparency(): boolean {
  return useMediaQuery(REDUCED_TRANSPARENCY_QUERY);
}

/**
 * Convenience: pick an animation duration honouring reduced motion. Returns 0
 * (instant) when reduced motion is set, else the supplied milliseconds.
 */
export function motionDuration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}
