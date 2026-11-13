// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// View transitions for whole-view swaps (theme flips, page swaps).
//
// The browser snapshots the old frame once, runs `update`, and cross-fades to
// the new frame on the compositor: one bitmap fade instead of thousands of
// per-element colour transitions. Falls back to a plain synchronous update when
// the engine lacks the API, the window is hidden, or Reduce Motion is on.
// Timing lives in design-system.css (`::view-transition-*`).

import { isReduceMotion } from './MotionController';

type DocWithVT = Document & {
  startViewTransition?: (update: () => void) => { finished?: Promise<unknown> };
};

function prefersReducedMotion(): boolean {
  try {
    if (isReduceMotion()) return true;
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** True when `withViewTransition` would actually animate. */
export function canViewTransition(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as DocWithVT;
  return typeof doc.startViewTransition === 'function'
    && document.visibilityState === 'visible'
    && !prefersReducedMotion();
}

/**
 * Run `update` inside a view transition when possible. `update` always runs
 * exactly once, synchronously when there is no transition.
 */
export function withViewTransition(update: () => void): void {
  if (!canViewTransition()) { update(); return; }
  let ran = false;
  const once = () => { if (!ran) { ran = true; update(); } };
  try {
    const t = (document as DocWithVT).startViewTransition!(once);
    // A skipped/aborted transition still runs the callback, but never lose
    // the update if the engine rejects before calling it.
    t?.finished?.catch(() => once());
  } catch {
    once();
  }
}
