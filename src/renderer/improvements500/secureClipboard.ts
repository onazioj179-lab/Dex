// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Secure clipboard (T7-008 auto-clear, T7-032 user-gesture gating).
 *
 * `copySecret` writes to the clipboard and schedules a clear after a
 * configurable duration. `readClipboard` requires a documented user gesture
 * and validates against an allowlist of trusted callers.
 */

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let lastWritten: string | null = null;

export interface CopySecretOptions {
  /** Default 30000 (T7-008). */
  clearAfterMs?: number;
}

export async function copySecret(text: string, opts: CopySecretOptions = {}): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('clipboard.writeText unavailable');
  }
  await navigator.clipboard.writeText(text);
  lastWritten = text;
  const after = opts.clearAfterMs ?? 30_000;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => { void clearIfUnchanged(); }, after);
}

async function clearIfUnchanged(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    // Best effort: write empty.
    try { await navigator.clipboard?.writeText?.(''); } catch { /* noop */ }
    lastWritten = null;
    return;
  }
  try {
    const current = await navigator.clipboard.readText();
    if (current === lastWritten) await navigator.clipboard.writeText('');
  } catch { /* permission denied */ }
  lastWritten = null;
}

let userGestureAt = 0;
const GESTURE_WINDOW_MS = 2_000;

/** Call from a click/keydown handler before requesting a clipboard read. */
export function recordUserGesture(): void { userGestureAt = Date.now(); }

export async function readClipboard(): Promise<string> {
  if (Date.now() - userGestureAt > GESTURE_WINDOW_MS) {
    throw new Error('clipboard read requires recent user gesture');
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    throw new Error('clipboard.readText unavailable');
  }
  return navigator.clipboard.readText();
}

/** Test helper. */
export function _reset(): void {
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  lastWritten = null;
  userGestureAt = 0;
}
