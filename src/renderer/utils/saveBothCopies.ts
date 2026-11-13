// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Creative apps keep the open project twice: in app storage (localStorage) and
// in the native key-value store (`capability:storage:set`, dex-kv.json). Apps
// fired the native write and ignored its reply (`{success:false}` on a disk
// error) and treated a full localStorage as "not saved" even when the native
// copy had been written. A save counts when either copy is written (the rule
// VINX already uses); the result says which and why not.

export interface SaveBothResult {
  ok: boolean;
  local: boolean;
  /** null when there is no native bridge (web preview). */
  native: boolean | null;
  /** Set when ok is false: a sentence the user can act on. */
  error?: string;
}

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

function nativeInvoke(): Invoke | null {
  // Looked up per call: the bridge is installed after modules load.
  const inv = (globalThis as { dex?: { invoke?: Invoke } }).dex?.invoke;
  return typeof inv === 'function' ? inv : null;
}

export async function saveBothCopies(key: string, json: string, what: string): Promise<SaveBothResult> {
  const invoke = nativeInvoke();
  // Start the native write first so a full localStorage cannot skip it.
  const nativeP: Promise<boolean> | null = invoke
    ? Promise.resolve()
        .then(() => invoke('capability:storage:set', key, json))
        .then((r) => !(r && typeof r === 'object' && (r as { success?: unknown }).success === false))
        .catch(() => false)
    : null;

  let local = true;
  try { localStorage.setItem(key, json); } catch { local = false; }

  const native = nativeP ? await nativeP : null;
  if (local || native) return { ok: true, local, native };
  return {
    ok: false,
    local,
    native,
    error: native === null
      ? `Couldn't save ${what}: app storage is full.`
      : `Couldn't save ${what}: app storage is full and the DEX data folder could not be written.`,
  };
}
