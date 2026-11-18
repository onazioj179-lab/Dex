// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Background tasks, in one inspectable list: Browser downloads, DDrop transfers and UKI
// commands (src-tauri/src/uki_terminal.rs). Routine work runs quietly; this is
// where the user sees what is running, what finished or failed, and cancels.
// Event-driven: the store updates from native events, it does not poll.

import { create } from 'zustand';

export type BgKind = 'download' | 'uki-command' | 'ddrop';
export type BgStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'timed-out' | 'interrupted';

export interface BgTask {
  id: string;
  kind: BgKind;
  title: string;
  detail?: string;
  status: BgStatus;
  /** 0-100 when known. */
  progress?: number;
  startedAt: number;
  endedAt?: number;
  error?: string;
  /** Present when the task can be stopped. */
  cancel?: () => void;
}

interface BgState {
  tasks: Record<string, BgTask>;
  upsert: (t: BgTask) => void;
  patch: (id: string, p: Partial<BgTask>) => void;
  remove: (id: string) => void;
}

export const useBackgroundTasks = create<BgState>((set) => ({
  tasks: {},
  upsert: (t) => set((s) => ({ tasks: { ...s.tasks, [t.id]: t } })),
  patch: (id, p) => set((s) => (s.tasks[id] ? { tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...p } } } : s)),
  remove: (id) => set((s) => { const { [id]: _gone, ...rest } = s.tasks; return { tasks: rest }; }),
}));

/** Newest first; running tasks on top. */
export function sortedTasks(tasks: Record<string, BgTask>): BgTask[] {
  return Object.values(tasks).sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.startedAt - a.startedAt);
}

// ---- UKI commands: native history + live events ------------------------------

type Dex = { invoke?: (c: string, ...a: unknown[]) => Promise<any>; on?: (c: string, cb: (p: any) => void) => unknown; off?: (c: string, cb: (p: any) => void) => unknown };
const dex = (): Dex | undefined => (window as unknown as { dex?: Dex }).dex;

const fromNative = (t: any): BgTask => ({
  id: `uki:${t.id}`,
  kind: 'uki-command',
  title: t.label || t.command,
  detail: `${t.command} — ${t.cwd}`,
  status: (['running', 'completed', 'failed', 'cancelled', 'timed-out', 'interrupted'].includes(t.status) ? t.status : 'failed') as BgStatus,
  startedAt: Number(t.startedAt) || Date.now(),
  endedAt: t.endedAt ?? undefined,
  error: t.status === 'failed' && t.exitCode != null ? `exit code ${t.exitCode}` : undefined,
  cancel: t.status === 'running' ? () => { void dex()?.invoke?.('ukiterm:cancel', t.id); } : undefined,
});

// ---- DDrop transfers (src-tauri/src/dtp_transfer.rs events) -------------------

let ddropWired = false;
/** Mirror DDrop sends/receives into the list, with Cancel while they run. */
export function wireDdropTasks(): void {
  if (ddropWired || typeof window === 'undefined' || !dex()?.on) return;
  ddropWired = true;
  const key = (id: string) => `ddrop:${id}`;
  const on = (ch: string, cb: (p: any) => void) => dex()!.on!(ch, cb);
  on('dtp:transfer-progress', (p) => {
    if (!p?.transferId) return;
    const s = useBackgroundTasks.getState();
    const id = key(p.transferId);
    const existing = s.tasks[id];
    const recv = p.direction === 'receive';
    s.upsert({
      id, kind: 'ddrop',
      title: `${recv ? 'Receiving from' : 'Sending to'} ${p.deviceName || 'a nearby device'}`,
      detail: typeof p.totalBytes === 'number' ? `${(p.totalBytes / 1048576).toFixed(1)} MB` : undefined,
      status: p.status === 'complete' ? 'completed' : 'running',
      progress: typeof p.progress === 'number' ? p.progress : existing?.progress,
      startedAt: existing?.startedAt ?? Date.now(),
      endedAt: p.status === 'complete' ? Date.now() : undefined,
      cancel: p.status === 'complete' ? undefined : () => { void dex()?.invoke?.(recv ? 'dtp:cancelReceive' : 'dtp:cancelSend', p.transferId); },
    });
  });
  const finish = (status: BgStatus) => (p: any) => {
    if (!p?.transferId) return;
    const s = useBackgroundTasks.getState();
    const id = key(p.transferId);
    if (!s.tasks[id]) s.upsert({ id, kind: 'ddrop', title: `DDrop ${p.deviceName ? `with ${p.deviceName}` : 'transfer'}`, status, startedAt: Date.now() });
    s.patch(id, {
      status: p.cancelled || p.declined ? 'cancelled' : status, endedAt: Date.now(), cancel: undefined,
      progress: status === 'completed' ? 100 : s.tasks[id]?.progress,
      error: status === 'failed' && !p.cancelled && !p.declined ? String(p.error || 'failed') : undefined,
    });
  };
  on('dtp:transfer-complete', finish('completed'));
  on('dtp:send-complete', finish('completed'));
  on('dtp:transfer-error', finish('failed'));
}

const STATUS_WORD: Record<string, string> ={ failed: 'failed', cancelled: 'was cancelled', 'timed-out': 'timed out' };

let wired = false;
/** Start listening for UKI command events (idempotent; call once from the shell). */
export function wireUkiCommandTasks(): void {
  if (wired || typeof window === 'undefined' || !dex()?.invoke) return;
  wired = true;
  const store = useBackgroundTasks.getState();
  void dex()!.invoke!('ukiterm:list').then((r: any) => {
    for (const t of r?.tasks ?? []) store.upsert(fromNative(t));
  }).catch(() => { /* broker unavailable */ });
  dex()!.on?.('ukiterm:event', (p: any) => {
    if (!p?.id) return;
    if (p.kind === 'started' || p.kind === 'done') {
      void dex()!.invoke!('ukiterm:get', p.id).then((g: any) => {
        if (!g?.task) return;
        useBackgroundTasks.getState().upsert(fromNative(g.task));
        // One quiet notice when a command ends (not a window per task).
        if (p.kind === 'done') {
          const ok = g.task.status === 'completed';
          const name = String(g.task.label || g.task.command).slice(0, 60);
          window.dispatchEvent(new CustomEvent('dex-toast', { detail: {
            type: ok ? 'success' : g.task.status === 'cancelled' ? 'info' : 'error',
            message: ok ? `UKI command finished: ${name}` : `UKI command ${STATUS_WORD[g.task.status] ?? 'ended'}: ${name}`,
          } }));
        }
      });
    }
  });
}
