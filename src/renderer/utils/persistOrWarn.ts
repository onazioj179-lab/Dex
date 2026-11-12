// =============================================================================
// DEX Platform — save to app storage, and say so when it fails
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Many apps keep the user's work in localStorage. When that store is full the
// write throws, and most call sites swallowed it, so edits were silently lost
// on the next start. persistOrWarn() writes, returns whether it worked, and
// shows ONE warning per storage key until a later write to that key succeeds.

const failing = new Set<string>();

export function persistOrWarn(key: string, value: string, what: string): boolean {
  try {
    localStorage.setItem(key, value);
    failing.delete(key);
    return true;
  } catch (e) {
    console.warn(`[DEX] couldn't save ${what}:`, e);
    if (!failing.has(key)) {
      failing.add(key);
      try {
        window.dispatchEvent(new CustomEvent('dex-toast', {
          detail: { type: 'error', message: `Couldn't save ${what}: app storage is full. Export or remove large items so your latest changes aren't lost.` },
        }));
      } catch { /* non-DOM */ }
    }
    return false;
  }
}

/** Test helper. */
export function __resetPersistOrWarn(): void {
  failing.clear();
}
