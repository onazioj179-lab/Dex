// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// App checkpoints: saved versions of an app's project, kept on this device.
// Apps that can serialise their state (useAppCheckpoints) save here; Collab
// Hub's Checkpoints tab lists them and restores one by handing the data back
// to the app, launching it first if needed (a pending restore survives until
// the app mounts).
//
// Storage: a small index plus one localStorage key per checkpoint, at most
// MAX_PER_APP per app (autosaves are dropped first) and MAX_BYTES each.

export interface AppCheckpoint {
  id: string;
  appId: string;
  appName: string;
  name: string;
  timestamp: number;
  bytes: number;
  auto: boolean;
}

const INDEX_KEY = 'dex-app-checkpoints';
const DATA_PREFIX = 'dex-app-checkpoint:';
const PENDING_KEY = 'dex-app-checkpoint-pending';
export const CHECKPOINTS_CHANGED = 'dex-app-checkpoints-changed';
export const CHECKPOINT_RESTORE = 'dex-app-checkpoint-restore';
export const MAX_PER_APP = 10;
export const MAX_BYTES = 2 * 1024 * 1024;

function readIndex(): AppCheckpoint[] {
  try {
    const v = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeIndex(list: AppCheckpoint[]): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch { /* storage full/blocked */ }
  try { window.dispatchEvent(new CustomEvent(CHECKPOINTS_CHANGED)); } catch { /* no window */ }
}

/** Newest first; one app or all. */
export function listCheckpoints(appId?: string): AppCheckpoint[] {
  return readIndex()
    .filter((c) => !appId || c.appId === appId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function readCheckpointData(id: string): string | null {
  try { return localStorage.getItem(DATA_PREFIX + id); } catch { return null; }
}

export function deleteCheckpoint(id: string): void {
  try { localStorage.removeItem(DATA_PREFIX + id); } catch { /* ignore */ }
  writeIndex(readIndex().filter((c) => c.id !== id));
}

export type SaveResult = { ok: true; checkpoint: AppCheckpoint } | { ok: false; error: string };

export function saveCheckpoint(appId: string, appName: string, name: string, data: string, auto = false): SaveResult {
  const bytes = data.length * 2; // UTF-16 in localStorage
  if (bytes > MAX_BYTES) return { ok: false, error: 'Project is too large for a checkpoint' };
  const cp: AppCheckpoint = {
    id: `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    appId, appName, name: name.trim() || (auto ? 'Autosave' : 'Checkpoint'), timestamp: Date.now(), bytes, auto,
  };
  try {
    localStorage.setItem(DATA_PREFIX + cp.id, data);
  } catch {
    return { ok: false, error: 'Not enough storage for a checkpoint' };
  }
  let list = [cp, ...readIndex()];
  // Keep MAX_PER_APP for this app: drop the oldest autosaves first, then the oldest.
  const mine = list.filter((c) => c.appId === appId).sort((a, b) => b.timestamp - a.timestamp);
  const excess = mine.length - MAX_PER_APP;
  if (excess > 0) {
    const victims = [...mine.filter((c) => c.auto).reverse(), ...mine.filter((c) => !c.auto).reverse()]
      .filter((c) => c.id !== cp.id)
      .slice(0, excess);
    const drop = new Set(victims.map((c) => c.id));
    victims.forEach((c) => { try { localStorage.removeItem(DATA_PREFIX + c.id); } catch { /* ignore */ } });
    list = list.filter((c) => !drop.has(c.id));
  }
  writeIndex(list);
  return { ok: true, checkpoint: cp };
}

/** Ask the owning app to load a checkpoint. Returns the app id, or null. */
export function requestRestore(id: string): string | null {
  const cp = readIndex().find((c) => c.id === id);
  if (!cp || readCheckpointData(id) === null) return null;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ appId: cp.appId, id })); } catch { return null; }
  try { window.dispatchEvent(new CustomEvent(CHECKPOINT_RESTORE, { detail: { appId: cp.appId } })); } catch { /* no window */ }
  return cp.appId;
}

// ---- Opening Collab Hub on a project panel from another app -----------------
const OPEN_KEY = 'dex-collab-open';
export const COLLAB_OPEN = 'dex-collab-open';
export type CollabPanel = 'share' | 'chat' | 'checkpoints';

/** Launch Collab Hub showing `panel` (for `projectId` when given). */
export function openCollabHub(panel: CollabPanel, projectId?: string | null): void {
  try { sessionStorage.setItem(OPEN_KEY, JSON.stringify({ panel, projectId: projectId ?? null })); } catch { /* ignore */ }
  try {
    (window as unknown as { __dexRunningApps?: { getState: () => { launchApp: (a: { id: string; name: string; icon: string }) => void } } })
      .__dexRunningApps?.getState().launchApp({ id: 'collabhub', name: 'Collab Hub', icon: 'collabhub' });
  } catch { /* shell not ready */ }
  try { window.dispatchEvent(new CustomEvent(COLLAB_OPEN)); } catch { /* no window */ }
}

/** The pending Collab Hub request (consumed), or null. */
export function takeCollabOpen(): { panel: CollabPanel; projectId: string | null } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(OPEN_KEY) || 'null');
    sessionStorage.removeItem(OPEN_KEY);
    return v && (v.panel === 'share' || v.panel === 'chat' || v.panel === 'checkpoints') ? v : null;
  } catch {
    return null;
  }
}

/** The data of a restore waiting for `appId` (consumed), or null. */
export function takePendingRestore(appId: string): { data: string; checkpoint: AppCheckpoint } | null {
  let pending: { appId?: string; id?: string } | null = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { pending = null; }
  if (!pending || pending.appId !== appId || !pending.id) return null;
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  const data = readCheckpointData(pending.id);
  const checkpoint = readIndex().find((c) => c.id === pending!.id);
  return data !== null && checkpoint ? { data, checkpoint } : null;
}
