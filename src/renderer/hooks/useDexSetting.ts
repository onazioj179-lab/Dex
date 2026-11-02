// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Read one Settings value (localStorage `dex-settings`) and re-render when the
// Settings page saves (`dex-settings-changed`) or another window writes it.
//
import { useEffect, useState } from 'react';

export function readDexSetting<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem('dex-settings') || '{}')[key];
    return v === undefined ? fallback : (v as T);
  } catch {
    return fallback;
  }
}

/**
 * Write one Settings value from outside the Settings page (e.g. the Browser's
 * privacy panel). Persists to localStorage and the native store the Settings
 * page loads from, then notifies every reader, including an open Settings page.
 */
export function writeDexSetting(key: string, value: unknown): void {
  let all: Record<string, unknown> = {};
  try { all = JSON.parse(localStorage.getItem('dex-settings') || '{}') || {}; } catch { /* corrupt: start over */ }
  all[key] = value;
  try { localStorage.setItem('dex-settings', JSON.stringify(all)); } catch { /* storage blocked */ }
  try { void (window as any).electron?.invoke?.('capability:storage:set', 'dex-settings', all); } catch { /* bridge absent */ }
  try { window.dispatchEvent(new CustomEvent('dex-settings-changed', { detail: { source: key } })); } catch { /* noop */ }
}

export function useDexSetting<T>(key: string, fallback: T): T {
  const [value, setValue] = useState<T>(() => readDexSetting(key, fallback));
  useEffect(() => {
    const sync = () => setValue(readDexSetting(key, fallback));
    window.addEventListener('dex-settings-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('dex-settings-changed', sync);
      window.removeEventListener('storage', sync);
    };
    // fallback is a literal at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}
