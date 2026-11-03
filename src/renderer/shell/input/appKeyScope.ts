// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Which app a keystroke is for. Apps stay mounted in the background (keep-alive)
// and most register their shortcuts on `window`, so without this a Space typed in
// Notes toggled FLUX playback and Ctrl+Z in Notes undid FLUX layers.
//
// A key belongs to an app when the focused element is inside that app's window,
// or, when focus is on the page itself (after clicking a non-focusable canvas),
// when that app's window was the last one clicked / focused. With no such record
// the shell's current app decides.
//

import { useRunningApps } from '../../store/runningApps';

let lastApp: string | null = null;
let installed = false;

function appOf(el: EventTarget | null): string | null {
  const node = el as Element | null;
  if (!node?.closest) return null;
  const inline = node.closest('[data-app-id]') as HTMLElement | null;
  if (inline?.dataset.appId) return inline.dataset.appId;
  const floating = node.closest('[data-floating-window]') as HTMLElement | null;
  return floating?.dataset.floatingWindow || null;
}

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Capture phase: record the target before any app handler can stop propagation.
  window.addEventListener('pointerdown', (e) => { lastApp = appOf(e.target); }, true);
  window.addEventListener('focusin', (e) => { const a = appOf(e.target); if (a) lastApp = a; }, true);
}
install();

/** True when this keyboard event is meant for `appId`. */
export function keyEventForApp(e: KeyboardEvent, appId: string): boolean {
  // Rendered outside the shell (tests, a standalone mount): nothing to arbitrate.
  if (typeof document === 'undefined' || !document.querySelector(`[data-app-id="${appId}"], [data-floating-window="${appId}"]`)) return true;
  const t = e.target as Element | null;
  const onPage = !t || t === document.body || t === document.documentElement || !t.closest;
  if (!onPage) return appOf(t) === appId;
  if (lastApp) return lastApp === appId;
  return useRunningApps.getState().currentAppId === appId;
}

/** Text fields, selects and rich editors: their keys (Space, Ctrl+Z, Ctrl+A) are the field's. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
    || !!el.closest?.('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
}

/** Test hook. */
export function __setLastAppForTests(id: string | null): void { lastApp = id; }
