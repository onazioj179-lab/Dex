// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Renderer client for Xack, UKI's native action broker (src-tauri/src/xack.rs).
//
// UKI plans; Xack decides and records; apps and native services act. Every
// UKI action goes: request -> (approval, when Xack says "ask") -> decide ->
// begin -> run -> finish. Xack owns each capability's class and confirmation
// policy, and the terminal will not run without a ticket Xack issued for that
// exact command in that exact folder.
//
// Every call returns null when the native broker is absent (the web preview),
// so callers fall back to the renderer-side gate they had before.

type Invoke = (channel: string, ...args: unknown[]) => Promise<any>;

function invoke(channel: string, arg?: unknown): Promise<any> {
  const fn = (window as unknown as { dex?: { invoke?: Invoke } }).dex?.invoke;
  if (!fn) return Promise.resolve(null);
  return fn(channel, arg).catch(() => null);
}

export type XackClass = 'read' | 'modify' | 'execute' | 'external' | 'privileged';
export type XackRemember = 'once' | 'exact' | 'scope-read';

export interface XackDecision {
  decision: 'allow' | 'ask' | 'refuse';
  requestId: string | null;
  reason: string;
  class: XackClass | null;
  /** Who approved an "allow": policy (read-only), grant (the user, this session). */
  by: 'policy' | 'grant' | 'user' | 'schedule' | null;
  confirm: 'never' | 'ask' | 'always' | null;
}

export interface XackHistoryItem {
  ts: number;
  kind: 'request' | 'decision' | 'exec' | 'grant';
  requestId?: string;
  execId?: string;
  action?: string;
  app?: string;
  class?: XackClass;
  outcome: string;
  by?: string;
  summary?: string;
  scope?: string;
  detail?: string;
  durationMs?: number;
}

export interface XackGrant {
  id: string;
  action: string;
  scope: string;
  maxClass: XackClass;
  exact: boolean;
  label: string;
  createdAt: number;
  uses: number;
}

/** True when the native broker answers (desktop app). */
export async function xackAvailable(): Promise<boolean> {
  const r = await invoke('xack:grants');
  return !!r?.ok;
}

/** Ask Xack whether an action may run. null = no native broker. */
export async function xackRequest(
  action: string,
  args: Record<string, unknown>,
  opts: { summary?: string; scope?: string; class?: XackClass } = {},
): Promise<XackDecision | null> {
  const r = await invoke('xack:request', { action, args, summary: opts.summary ?? '', scope: opts.scope ?? '', class: opts.class ?? '' });
  if (!r?.ok) return null;
  return {
    decision: r.decision,
    requestId: r.requestId ?? null,
    reason: String(r.reason ?? ''),
    class: r.class ?? null,
    by: r.by ?? null,
    confirm: r.confirm ?? null,
  };
}

/** Record the approval surface's answer. Only the approval UI calls this. */
export async function xackDecide(
  requestId: string,
  approve: boolean,
  remember: XackRemember = 'once',
  via?: 'schedule',
): Promise<{ ok: boolean; error?: string }> {
  const r = await invoke('xack:decide', { requestId, approve, remember, via: via ?? '' });
  return r ? { ok: !!r.ok, error: r.error } : { ok: false, error: 'the action broker is not available' };
}

/** Start an approved action (uses its single-use ticket). */
export async function xackBegin(requestId: string, action: string, args: Record<string, unknown>): Promise<{ ok: boolean; execId?: string; error?: string }> {
  const r = await invoke('xack:begin', { requestId, action, args });
  return r ? { ok: !!r.ok, execId: r.execId, error: r.error } : { ok: false, error: 'the action broker is not available' };
}

export async function xackFinish(execId: string, outcome: 'ran' | 'failed' | 'cancelled', detail: string): Promise<void> {
  await invoke('xack:finish', { execId, outcome, detail: detail.slice(0, 300) });
}

/** Tell Xack which app actions exist (class + confirmation policy). */
export async function xackRegister(
  actions: { id: string; app: string; description: string; class: XackClass; confirm?: 'never' | 'ask' | 'always' }[],
): Promise<number> {
  if (!actions.length) return 0;
  const r = await invoke('xack:register', { actions });
  return Number(r?.registered ?? 0);
}

export async function xackHistory(limit = 200): Promise<XackHistoryItem[] | null> {
  const r = await invoke('xack:history', { limit });
  return r?.ok ? (r.items as XackHistoryItem[]) : null;
}

export async function xackClearHistory(): Promise<boolean> {
  return !!(await invoke('xack:clearHistory'))?.ok;
}

export async function xackGrants(): Promise<XackGrant[] | null> {
  const r = await invoke('xack:grants');
  return r?.ok ? (r.grants as XackGrant[]) : null;
}

export async function xackRevoke(id?: string): Promise<number> {
  const r = await invoke('xack:revoke', { id: id ?? '' });
  return Number(r?.revoked ?? 0);
}

export async function xackRunning(): Promise<XackHistoryItem[]> {
  const r = await invoke('xack:running');
  return r?.ok ? (r.running as XackHistoryItem[]) : [];
}

/** Plain words for a class, for prompts and the history view. */
export const XACK_CLASS_TEXT: Record<XackClass, string> = {
  read: 'only reads',
  modify: 'changes your data',
  execute: 'runs a program',
  external: 'sends data off this PC',
  privileged: 'needs administrator rights',
};
