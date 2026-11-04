// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Give an app saved versions of its project (services/appCheckpoints.ts):
// a manual "Save checkpoint", an autosave when the project changed, and
// restores requested from Collab Hub (including one waiting from before the
// app opened).
//
import { useCallback, useEffect, useRef } from 'react';
import { saveCheckpoint, takePendingRestore, CHECKPOINT_RESTORE, type SaveResult } from '../services/appCheckpoints';

interface Options {
  appId: string;
  appName: string;
  /** Serialised project, or null when there is nothing to save. */
  getSnapshot: () => string | null;
  /** Load a serialised project produced by getSnapshot. Throw if it is unusable. */
  onRestore: (data: string, name: string) => void;
  /** Autosave interval; 0 turns autosave off. */
  autoIntervalMs?: number;
}

export function useAppCheckpoints({ appId, appName, getSnapshot, onRestore, autoIntervalMs = 5 * 60_000 }: Options) {
  const snap = useRef(getSnapshot);
  const restore = useRef(onRestore);
  snap.current = getSnapshot;
  restore.current = onRestore;
  const lastSaved = useRef<string | null>(null);

  const applyPending = useCallback(() => {
    const pending = takePendingRestore(appId);
    if (!pending) return;
    try {
      restore.current(pending.data, pending.checkpoint.name);
      lastSaved.current = pending.data;
    } catch (e) {
      console.warn(`[${appName}] checkpoint restore failed:`, e);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'That checkpoint could not be opened' } }));
    }
  }, [appId, appName]);

  // A restore requested while closed waits in storage; one requested while
  // open arrives as an event.
  useEffect(() => {
    applyPending();
    const onRequest = (e: Event) => { if ((e as CustomEvent).detail?.appId === appId) applyPending(); };
    window.addEventListener(CHECKPOINT_RESTORE, onRequest);
    return () => window.removeEventListener(CHECKPOINT_RESTORE, onRequest);
  }, [appId, applyPending]);

  // Autosave only when the project actually changed since the last save.
  useEffect(() => {
    if (!autoIntervalMs) return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      const data = snap.current();
      if (!data || data === lastSaved.current) return;
      if (lastSaved.current === null) { lastSaved.current = data; return; } // baseline, not a change
      const res = saveCheckpoint(appId, appName, 'Autosave', data, true);
      if (res.ok) lastSaved.current = data;
    }, autoIntervalMs);
    return () => window.clearInterval(t);
  }, [appId, appName, autoIntervalMs]);

  const saveNow = useCallback((name?: string): SaveResult => {
    const data = snap.current();
    if (!data) return { ok: false, error: 'Nothing to save yet' };
    const res = saveCheckpoint(appId, appName, name || `Checkpoint ${new Date().toLocaleString()}`, data, false);
    if (res.ok) lastSaved.current = data;
    return res;
  }, [appId, appName]);

  return { saveNow };
}
