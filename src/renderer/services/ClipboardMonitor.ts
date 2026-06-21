// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Omni Clipboard -- Background Monitor
 * -----------------------------------------------------------------------------
 * Continuously feeds the clipboard history store so the Omni Clipboard already
 * holds what you copied while working -- not just whatever happens to be on the
 * clipboard at the instant you open the panel (the old behaviour, which made
 * the history almost always empty).
 *
 * Two capture paths funnel into the same store (deduped there):
 *   1. The `copy`/`cut` DOM events -- instant capture of in-app copies, with
 *      accurate source-app attribution.
 *   2. A SharedTick poll -- catches copies made in OTHER apps while DEX is
 *      focused (SharedTick already pauses while the window is hidden, and we
 *      additionally gate on document focus so we never spam clipboard reads).
 *
 * Capture is silent and opt-out-able; the panel itself stays user-invoked
 * (Ctrl+Shift+V), consistent with DEX's "never nag" shell philosophy.
 */

import { sharedTick } from './SharedTick';
import { useClipboardStore, migrateLegacyClipboard } from '../store/clipboardStore';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { contextEngine } from '../../shared/uki/contextEngine';

const TICK_ID = 'clipboard-monitor';
const POLL_MS = 4000;

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
function ingest(text: string | null | undefined): void {
  if (!text) return;
  if (text === lastSeen) return;
  lastSeen = text;
  const entry = useClipboardStore.getState().add(text, currentSource());
  if (entry) { try { contextEngine.recordActivity('clip', entry.preview); } catch { /* optional */ } }
}

async function readClipboard(): Promise<void> {
  // Reading requires focus + a secure context; bail quietly otherwise.
  if (typeof document !== 'undefined' && !document.hasFocus()) return;
  try {
    const text = await navigator.clipboard.readText();
    ingest(text);
  } catch {
    /* permission denied / not focused / unsupported -- the copy-event path still works */
  }
}

function onFocus(): void {
  void readClipboard();
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
  // Programmatic copies expose nothing synchronously -- poll once shortly after.
  setTimeout(() => { void readClipboard(); }, 0);
}

/** Start background clipboard capture. Idempotent. */
export function startClipboardMonitor(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  migrateLegacyClipboard();

  window.addEventListener('copy', onCopyEvent as EventListener, true);
  window.addEventListener('cut', onCopyEvent as EventListener, true);
  // Capture the current clipboard once on focus return (cheap, focus-gated).
  window.addEventListener('focus', onFocus);

  sharedTick.subscribe(TICK_ID, () => { void readClipboard(); }, POLL_MS);
  void readClipboard();
}

/** Stop background capture (used in teardown/tests). */
export function stopClipboardMonitor(): void {
  if (!started) return;
  started = false;
  sharedTick.unsubscribe(TICK_ID);
  window.removeEventListener('copy', onCopyEvent as EventListener, true);
  window.removeEventListener('cut', onCopyEvent as EventListener, true);
  window.removeEventListener('focus', onFocus);
}
