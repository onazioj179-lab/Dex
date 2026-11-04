// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Omni Clipboard -- Capture
 * -----------------------------------------------------------------------------
 * Feeds the clipboard history store so the Omni Clipboard already holds what you
 * copied while working.
 *
 *   1. `copy`/`cut` DOM events -- instant capture of copies made inside DEX, with
 *      source-app attribution. Needs no permission.
 *   2. Copies made in OTHER programs -- only when the user turns on "Include
 *      copies from other apps". Read once when DEX regains focus, through the
 *      native clipboard channel.
 *
 * There is no background polling, and this module never calls
 * `navigator.clipboard.readText()`: in WebView2 every such read shows a
 * "wants to see text and images copied to the clipboard" prompt.
 */

import { useClipboardStore, migrateLegacyClipboard } from '../store/clipboardStore';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { contextEngine } from '../../shared/uki/contextEngine';

let started = false;
let lastSeen = '';

/** Current foreground DEX app, for source attribution. */
function currentSource(): { sourceAppId?: string; sourceAppName?: string } {
  try {
    const id = useRunningApps.getState().currentAppId;
    if (!id) return {};
    const def = APP_DEFINITIONS[id];
    return { sourceAppId: id, sourceAppName: def?.name ?? id };
  } catch {
    return {};
  }
}

/** Route a candidate string into the store (the store handles dedupe/typing) and
 *  feed the Context Engine so copies surface in the "Now" activity stream. */
function ingest(text: string | null | undefined, source = currentSource()): void {
  if (!text) return;
  if (text === lastSeen) return;
  lastSeen = text;
  const entry = useClipboardStore.getState().add(text, source);
  if (entry) { try { contextEngine.recordActivity('clip', entry.preview); } catch { /* optional */ } }
}

/** Native clipboard read (`clipboard:readText`); null outside the installed app. */
async function readNativeClipboard(): Promise<string | null> {
  const native = (window as unknown as { dex?: { clipboard?: { readText?: () => Promise<unknown> } } }).dex?.clipboard;
  if (!native?.readText) return null;
  try {
    const text = await native.readText();
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

function onFocus(): void {
  if (!useClipboardStore.getState().captureOtherApps) return;
  // Copied while DEX was in the background, so not from a DEX app.
  void readNativeClipboard().then(t => ingest(t, { sourceAppName: 'Other app' }));
}

function onCopyEvent(e: ClipboardEvent): void {
  // Images first: if the copied payload carries an image (e.g. from Gallery /
  // Prism), capture it as a data URL so the Omni Clipboard can hold images too.
  const items = e.clipboardData?.items;
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            const url = String(reader.result || '');
            if (url) {
              const entry = useClipboardStore.getState().add(url, { ...currentSource(), kind: 'image' });
              if (entry) { try { contextEngine.recordActivity('clip', entry.preview); } catch { /* optional */ } }
            }
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  }

  // Prefer the exact data the app placed on the clipboard; fall back to the
  // live selection. Read on the next tick so the browser has committed the copy.
  const fromEvent = e.clipboardData?.getData('text/plain');
  if (fromEvent && fromEvent.trim()) {
    ingest(fromEvent);
    return;
  }
  const sel = typeof window !== 'undefined' ? window.getSelection()?.toString() : '';
  if (sel && sel.trim()) {
    ingest(sel);
    return;
  }
  // Programmatic copies expose nothing synchronously -- read DEX's own copy once
  // it has been committed (native read only, so no permission prompt).
  setTimeout(() => { void readNativeClipboard().then(t => ingest(t)); }, 0);
}

/** Start clipboard capture. Idempotent. */
export function startClipboardMonitor(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  migrateLegacyClipboard();

  window.addEventListener('copy', onCopyEvent as EventListener, true);
  window.addEventListener('cut', onCopyEvent as EventListener, true);
  // Copies from other programs: one read when DEX regains focus, if enabled.
  window.addEventListener('focus', onFocus);
}

/** Stop background capture (used in teardown/tests). */
export function stopClipboardMonitor(): void {
  if (!started) return;
  started = false;
  window.removeEventListener('copy', onCopyEvent as EventListener, true);
  window.removeEventListener('cut', onCopyEvent as EventListener, true);
  window.removeEventListener('focus', onFocus);
}
