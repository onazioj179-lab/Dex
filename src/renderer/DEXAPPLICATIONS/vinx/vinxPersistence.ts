// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// VINX project persistence rules (pure; tests/unit/vinx-persistence.test.ts).
// The project lives in localStorage and is mirrored to DEX's native key-value
// store. Recovery is only claimed when the previous session did not close.

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface StoredProjectLike { id: string; sequences: unknown[]; modifiedAt?: number }

export function isProjectLike(x: unknown): x is StoredProjectLike {
  const o = x as StoredProjectLike | null;
  return !!o && typeof o === 'object' && typeof o.id === 'string' && !!o.id && Array.isArray(o.sequences);
}

/**
 * Read the stored project. Anything stored that is not a readable project is
 * copied aside (never overwritten by the next save) and reported.
 */
export function readStoredProject(storage: Store | null, key: string, now = Date.now()): { project: StoredProjectLike | null; movedAside: string | null } {
  let raw: string | null = null;
  try { raw = storage?.getItem(key) ?? null; } catch { return { project: null, movedAside: null }; }
  if (!raw) return { project: null, movedAside: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isProjectLike(parsed)) return { project: parsed, movedAside: null };
  } catch { /* fall through: keep the bytes */ }
  const aside = `${key}.unreadable-${now}`;
  try { storage?.setItem(aside, raw); return { project: null, movedAside: aside }; } catch { return { project: null, movedAside: null }; }
}

export type WriteOutcome = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

export function writeStoredProject(storage: Pick<Storage, 'setItem'> | null, key: string, json: string): WriteOutcome {
  if (!storage) return { ok: false, reason: 'unavailable' };
  try {
    storage.setItem(key, json);
    return { ok: true };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return { ok: false, reason: /quota/i.test(`${err?.name ?? ''} ${err?.message ?? ''}`) ? 'quota' : 'unavailable' };
  }
}

/** The copy to use when the local and native stores disagree: the more recently modified one. */
export function pickNewer<P extends StoredProjectLike>(local: P | null, native: P | null): P | null {
  if (!native) return local;
  if (!local) return native;
  return (native.modifiedAt ?? 0) > (local.modifiedAt ?? 0) ? native : local;
}

// ---------------------------------------------------------------------------
// Session marker: written while VINX is open, removed when it closes normally.
// Finding one at start means the last session ended without closing VINX
// (a crash, a killed process, power loss).
// ---------------------------------------------------------------------------

export const SESSION_KEY = 'dex-vinx-session';

export function beginSession(storage: Store | null, now = Date.now()): { uncleanSince: number | null } {
  let previous: number | null = null;
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (raw) {
      const at = Number(JSON.parse(raw)?.at);
      previous = Number.isFinite(at) ? at : 0;
    }
    storage?.setItem(SESSION_KEY, JSON.stringify({ at: now }));
  } catch { /* storage unavailable: no recovery claim either way */ }
  return { uncleanSince: previous };
}

export function endSession(storage: Store | null): void {
  try { storage?.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** The banner text, or null when there is nothing honest to say. */
export function recoveryMessage(uncleanSince: number | null, project: StoredProjectLike | null, fmt: (t: number) => string): string | null {
  if (uncleanSince === null || !project) return null;
  const saved = project.modifiedAt;
  return saved
    ? `VINX did not close normally last time. Restored the project as last saved (${fmt(saved)}); edits after that were not saved.`
    : 'VINX did not close normally last time. Restored the project as last saved; edits after that were not saved.';
}
