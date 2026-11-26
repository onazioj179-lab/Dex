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
 * the shell honour the user's accessibility preferences identically, instead
 * of each re-implementing matchMedia. `prefersReducedMotion()` is a cheap
 * one-shot read for non-React code (canvas loops, helpers); the hooks are the
 * reactive form for components (they re-render when the OS setting flips).
 */

import { useEffect, useState } from 'react';
import { useAppAppearance } from './appAppearanceContext';

function mediaMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try { return window.matchMedia(query).matches; } catch { return false; }
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';
export const REDUCED_MOTION_CHANGE = 'dex-reduced-motion-changed';
const MOTION_KEY = 'dex-reduced-motion';

export function readReducedMotionPreference(): boolean {
  try {
    const current = localStorage.getItem(MOTION_KEY);
    if (current === 'on' || current === 'off') return current === 'on';
    const settings = JSON.parse(localStorage.getItem('dex-settings') ?? 'null');
    const legacy = localStorage.getItem('dex-reduce-motion');
    return legacy === 'true' || settings?.reduceMotion === true;
  } catch { return false; }
}

export function setReducedMotionPreference(reduce: boolean): void {
  try { localStorage.setItem(MOTION_KEY, reduce ? 'on' : 'off'); } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new Event(REDUCED_MOTION_CHANGE));
}

export function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || [MOTION_KEY, 'dex-reduce-motion', 'dex-settings'].includes(event.key)) onChange();
  };
  window.addEventListener(REDUCED_MOTION_CHANGE, onChange);
  window.addEventListener('storage', onStorage);
  if (media?.addEventListener) media.addEventListener('change', onChange);
  else media?.addListener?.(onChange);
  return () => {
    window.removeEventListener(REDUCED_MOTION_CHANGE, onChange);
    window.removeEventListener('storage', onStorage);
    if (media?.removeEventListener) media.removeEventListener('change', onChange);
    else media?.removeListener?.(onChange);
  };
}

/** One-shot read — safe in canvas/RAF loops and module-scope. */
export function prefersReducedMotion(): boolean {
  return mediaMatches(REDUCED_MOTION_QUERY) || readReducedMotionPreference();
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

/** Reactive: true when motion is reduced in DEX or at OS level. */
export function useReducedMotion(): boolean {
  const appearance = useAppAppearance();
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const refresh = () => setReduced(prefersReducedMotion());
    refresh();
    return subscribeToReducedMotion(refresh);
  }, []);
  return reduced || appearance['data-app-motion'] === 'reduced';
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
