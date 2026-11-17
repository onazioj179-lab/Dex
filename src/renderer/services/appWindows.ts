// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Multiple windows per app. An app's first window keeps the plain app id
// ('notes'); further windows get a window id 'notes~2', 'notes~3'. Every
// shell lookup (definition, component, icon, default size) resolves a window
// id to its app, so window management, the Dock, geometry and lifecycle work
// per window without knowing about this. Each window mounts its own copy of
// the app component, so its open document, navigation and scroll position are
// its own; shared data stays in the shared stores and services.
//
// Only apps checked to be safe with two live copies may open more windows
// (keyboard shortcuts scoped per window, UKI hooks registered once).

import { createContext, useContext } from 'react';

export const WINDOW_SEP = '~';

/** Apps that support more than one window. */
export const MULTI_WINDOW_APPS: ReadonlySet<string> = new Set([
  'notes', 'files', 'terminal', 'calculator', 'ledger', 'dexcode', 'browser',
]);

export function baseAppId(id: string): string {
  const i = typeof id === 'string' ? id.indexOf(WINDOW_SEP) : -1;
  return i > 0 ? id.slice(0, i) : id;
}

/** 1 for the app's first window, n for 'app~n'. */
export function windowNumber(id: string): number {
  const i = id.indexOf(WINDOW_SEP);
  if (i < 0) return 1;
  const n = Number(id.slice(i + 1));
  return Number.isInteger(n) && n > 1 ? n : 1;
}

export function isExtraWindow(id: string): boolean { return windowNumber(id) > 1; }

export function supportsMultipleWindows(id: string): boolean { return MULTI_WINDOW_APPS.has(baseAppId(id)); }

/** The next free window id for `appId` given the ids already open. */
export function nextWindowId(appId: string, openIds: Iterable<string>): string {
  const base = baseAppId(appId);
  const used = new Set<number>();
  for (const id of openIds) if (baseAppId(id) === base) used.add(windowNumber(id));
  if (!used.has(1)) return base;
  let n = 2;
  while (used.has(n)) n++;
  return `${base}${WINDOW_SEP}${n}`;
}

/** Display name for a window: "Notes", "Notes 2". */
export function windowName(baseName: string, id: string): string {
  const n = windowNumber(id);
  return n > 1 ? `${baseName} ${n}` : baseName;
}

/**
 * A read-only view of a per-app map that answers window ids with their app's
 * entry (and lists only the real apps). `decorate` can adjust the value for
 * an extra window (e.g. the name "Notes 2"); results are cached per id.
 */
export function byAppId<T extends object>(map: Record<string, T>, decorate?: (value: T, windowId: string) => T): Record<string, T> {
  const cache = new Map<string, T>();
  return new Proxy(map, {
    get(target, key, recv) {
      if (typeof key !== 'string' || key in target) return Reflect.get(target, key, recv);
      const base = baseAppId(key);
      if (base === key || !(base in target)) return undefined;
      const v = target[base];
      if (!decorate || v == null) return v;
      let d = cache.get(key);
      if (!d) { d = decorate(v, key); cache.set(key, d); }
      return d;
    },
    has(target, key) {
      return typeof key === 'string' ? key in target || (baseAppId(key) !== key && baseAppId(key) in target) : key in target;
    },
  });
}

/** The window an app component is rendered in (AppManager provides it). */
export const AppWindowContext = createContext<string | null>(null);

/** This component's window id, or `fallback` (the app id) outside the shell. */
export function useAppWindowId(fallback: string): string {
  return useContext(AppWindowContext) ?? fallback;
}
