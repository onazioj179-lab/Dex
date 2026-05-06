// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * useUnsavedGuard – warns the user before navigating away from unsaved work.
 *
 * Usage:
 *   useUnsavedGuard(isDirty);
 *
 * Sets a `beforeunload` handler while `isDirty` is truthy, so the browser /
 * Electron will show a confirmation prompt before the window is closed or
 * refreshed.  Also dispatches a custom 'dex-dirty-state' event that the
 * shell can read (e.g. to show a dot on the dock icon).
 */
import { useEffect } from 'react';

export function useUnsavedGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    window.dispatchEvent(new CustomEvent('dex-dirty-state', { detail: { dirty: true } }));

    return () => {
      window.removeEventListener('beforeunload', handler);
      window.dispatchEvent(new CustomEvent('dex-dirty-state', { detail: { dirty: false } }));
    };
  }, [isDirty]);
}
