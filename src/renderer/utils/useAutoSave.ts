// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { useEffect, useRef } from 'react';
import { sharedTick } from '../services/SharedTick';
import { resolveAutosaveInterval } from './autosavePrefs';

// Looked up per call: this module is evaluated before the Tauri bridge is
// installed (static imports run before main.tsx's body), so a module-level
// capture was always undefined and version snapshots were never written.
const getInvoke = (): ((...a: unknown[]) => Promise<unknown>) | undefined => (window as any).electron?.invoke;

// Interval for durable version-history snapshots (5 minutes)
const VERSION_SNAPSHOT_INTERVAL = 5 * 60_000;

export function useAutoSave(
  key: string,
  getData: () => unknown,
  isDirty: boolean,
  intervalMs = 30_000,
): void {
  const instanceIdRef = useRef(`autosave-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const lastVersionSave = useRef(0);
  // The user's global autosave-interval preference wins when set; otherwise the
  // call site's own value is used (so existing apps are unchanged until opt-in).
  const effectiveInterval = resolveAutosaveInterval(intervalMs);

  useEffect(() => {
    if (!isDirty) return;
    const save = () => {
      try {
        const data = getData();
        localStorage.setItem(`dex-autosave-${key}`, JSON.stringify(data));
      } catch { /* storage full or serialization error */ }
    };
    const autosaveId = `${instanceIdRef.current}-${key}`;
    const versionId = `${autosaveId}-version`;
    sharedTick.subscribe(autosaveId, save, effectiveInterval);

    const flushContinuity = (event?: Event) => {
      const current = (event as CustomEvent<{ current?: string }> | undefined)?.detail?.current;
      if (!current || current !== 'active') save();
    };
    const flushOnHidden = () => { if (document.hidden) save(); };
    window.addEventListener('dex-idle-continuity-change', flushContinuity as EventListener);
    document.addEventListener('visibilitychange', flushOnHidden);

    // Durable version-history snapshot (less frequent, survives localStorage wipe)
    const invoke = getInvoke();
    if (invoke) {
      sharedTick.subscribe(versionId, () => {
        try {
          const now = Date.now();
          if (now - lastVersionSave.current < VERSION_SNAPSHOT_INTERVAL) return;
          lastVersionSave.current = now;
          const data = getData();
          invoke('version-history:save', key, key, key, JSON.stringify(data), true).catch(() => {});
        } catch { /* IPC unavailable */ }
      }, VERSION_SNAPSHOT_INTERVAL);
    }

    return () => {
      save();
      sharedTick.unsubscribe(autosaveId);
      sharedTick.unsubscribe(versionId);
      window.removeEventListener('dex-idle-continuity-change', flushContinuity as EventListener);
      document.removeEventListener('visibilitychange', flushOnHidden);
    };
  }, [key, getData, isDirty, effectiveInterval]);
}

export function loadAutoSave<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`dex-autosave-${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearAutoSave(key: string): void {
  localStorage.removeItem(`dex-autosave-${key}`);
}
