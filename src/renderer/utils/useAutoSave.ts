// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { useEffect, useRef } from 'react';

const invoke = (window as any).electron?.invoke;

// Interval for durable version-history snapshots (5 minutes)
const VERSION_SNAPSHOT_INTERVAL = 5 * 60_000;

export function useAutoSave(
  key: string,
  getData: () => unknown,
  isDirty: boolean,
  intervalMs = 30_000,
): void {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const versionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVersionSave = useRef(0);

  useEffect(() => {
    if (!isDirty) return;
    const save = () => {
      try {
        const data = getData();
        localStorage.setItem(`dex-autosave-${key}`, JSON.stringify(data));
      } catch { /* storage full or serialization error */ }
    };
    timerRef.current = setInterval(save, intervalMs);

    // Durable version-history snapshot (less frequent, survives localStorage wipe)
    if (invoke) {
      versionTimerRef.current = setInterval(() => {
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
      if (timerRef.current) clearInterval(timerRef.current);
      if (versionTimerRef.current) clearInterval(versionTimerRef.current);
    };
  }, [key, getData, isDirty, intervalMs]);
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
