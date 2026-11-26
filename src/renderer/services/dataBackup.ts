// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// The interface's half of a DEX backup.
//
// Most settings and app data are kept by the interface (localStorage), which the
// native backup cannot read. This mirrors them to a native file that every
// backup (manual, automatic, before-restore) packs, and puts them back after a
// restore. Secrets are never copied.

import { sharedDebouncedStorage } from '../utils/debouncedStorage';

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
const nativeInvoke = (): Invoke | null =>
  (window as unknown as { dex?: { invoke?: Invoke } }).dex?.invoke ?? null;

const SYNC_EVERY_MS = 15 * 60_000;
const FIRST_SYNC_MS = 20_000;

/**
 * Keys that stay on this machine, outside backups: credentials, the account
 * session, copied text, and privacy grants (a restore must never switch the
 * camera back on or take DEX back online).
 */
const LEFT_OUT = /keystore|keychain|uki-key|secret|(auth|access|session)[-_.]?token|api[-_.]?key|password|passphrase|vault|credential|^dex\.account|clipboard|^dex-permissions$|^dex-network-mode$/i;

/** localStorage here is DEX's own origin, so everything else is DEX data. */
export function isBackedUpKey(key: string): boolean {
  return !LEFT_OUT.test(key);
}

export function interfaceState(storage: Storage = localStorage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !isBackedUpKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

let lastSynced = '';

/** Send the current state to the native mirror. False = it could not be saved. */
export async function syncInterfaceState(): Promise<boolean> {
  const invoke = nativeInvoke();
  if (!invoke) return false;
  try {
    sharedDebouncedStorage.flush();
    const text = JSON.stringify(interfaceState());
    if (text === lastSynced) return true;
    const res = await invoke('backup:saveRendererState', text) as { success?: boolean } | null;
    if (!res?.success) return false;
    lastSynced = text;
    return true;
  } catch {
    return false;
  }
}

/**
 * Make `storage` match a restored state: keys in it are written, backed-up keys
 * it lacks are removed, everything else (secrets included) is left alone.
 */
export function applyInterfaceState(state: Record<string, string>, storage: Storage = localStorage): void {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isBackedUpKey(key) && !(key in state)) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
  for (const [key, value] of Object.entries(state)) {
    if (isBackedUpKey(key) && typeof value === 'string') storage.setItem(key, value);
  }
}

/**
 * After a restore: load the restored state and reload DEX. Open apps still hold
 * the old data and save it while the page unloads, so writes are shut off first.
 */
export async function applyRestoredStateAndReload(reload: () => void = () => window.location.reload()): Promise<void> {
  const invoke = nativeInvoke();
  const text = invoke ? await invoke('backup:rendererState').catch(() => null) : null;
  if (typeof text === 'string') {
    try {
      const state = JSON.parse(text) as Record<string, string>;
      sharedDebouncedStorage.flush();
      applyInterfaceState(state);
      Storage.prototype.setItem = () => undefined;
      Storage.prototype.removeItem = () => undefined;
    } catch { /* unreadable state: the database restore still stands */ }
  }
  reload();
}

let started = false;

/** Keep the mirror fresh so automatic backups are complete. */
export function startInterfaceStateMirror(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const sync = () => { void syncInterfaceState(); };
  setTimeout(sync, FIRST_SYNC_MS);
  setInterval(sync, SYNC_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sync(); });
}
