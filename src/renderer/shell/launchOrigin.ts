// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Origin-aware window entry: a window opened by a click (Dock tile, App Menu,
// a file) grows out of the point that was clicked instead of a fixed spot.
// The last pointer press is remembered; a window that mounts shortly after it
// takes that point as its transform-origin for the open animation.

/** A press older than this did not open the window. */
export const LAUNCH_ORIGIN_MAX_AGE_MS = 800;

let last: { x: number; y: number; t: number } | null = null;
let installed = false;

/** Remember every primary pointer press (capture phase, passive). Idempotent. */
export function installLaunchOriginTracking(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', (e) => {
    if (e.isPrimary && e.button === 0) last = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, { capture: true, passive: true });
}

/** Test hook. */
export function setLastPress(p: { x: number; y: number; t: number } | null): void { last = p; }

/**
 * Where inside `rect` the open animation should grow from, or null when the
 * window was not opened by a recent press (keyboard, UKI, session restore).
 */
export function launchOriginFor(rect: { left: number; top: number; width: number; height: number }, now = performance.now()): { x: number; y: number } | null {
  if (!last || now - last.t > LAUNCH_ORIGIN_MAX_AGE_MS || rect.width <= 0 || rect.height <= 0) return null;
  // Clamp to the window: a press on the Dock below it grows from its edge.
  const x = Math.min(Math.max(last.x - rect.left, 0), rect.width);
  const y = Math.min(Math.max(last.y - rect.top, 0), rect.height);
  return { x: Math.round(x), y: Math.round(y) };
}

/** Callback-ref helper: set the open animation's origin once, on mount. */
export function applyLaunchOrigin(el: HTMLElement | null): void {
  if (!el || el.dataset.launchOrigin) return;
  el.dataset.launchOrigin = '1';
  const o = launchOriginFor(el.getBoundingClientRect());
  if (!o) return;
  el.style.transformOrigin = `${o.x}px ${o.y}px`;
  // Grow a little further than the default entry so the origin reads.
  el.style.setProperty('--dex-open-scale', '0.9');
}
