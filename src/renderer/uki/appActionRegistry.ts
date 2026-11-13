// =============================================================================
// DEX 6.0 — uki app-action registry (renderer singleton)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Process-wide instance of the shared app-action registry
// (src/shared/uki/appActions.ts). Apps register CALLABLE actions on mount (next
// to their context resolver); the agent loop discovers the actions of currently
// RUNNING apps and invokes them as dynamic tools. Read-only actions run freely;
// document-changing (mutating) actions require explicit user confirmation via a
// host-supplied confirm handler, so UKI can never silently mutate an app.

import {
  createAppActionRegistry,
  registerAppAction,
  unregisterAppAction,
  getAppAction,
  listAppActions,
  actionToToolSpec,
  type AppActionEntry,
  type AppActionHandler,
  type AppActionSpec,
} from '../../shared/uki/appActions';
import type { ToolSpec } from '../../shared/uki/toolValidation';
import { useRunningApps } from '../store/runningApps';

const registry = createAppActionRegistry();

/** Asks the user to approve a mutating action; resolves true to proceed. */
export type ActionConfirmHandler = (
  entry: AppActionEntry,
  args: Record<string, unknown>,
) => Promise<boolean> | boolean;

let confirmHandler: ActionConfirmHandler | null = null;

/** Wire (or clear) the confirmation surface for mutating actions. */
export function setUkiActionConfirmHandler(fn: ActionConfirmHandler | null): void {
  confirmHandler = fn;
}

// ---------------------------------------------------------------------------
// Audit trail — every UKI action invocation is recorded for traceability, so a
// security-conscious user (or a Defender / audit view) can see exactly what the
// assistant did: which app, redacted args, whether it was allowed, and when.
// Bounded ring buffer + a `dex-uki-action-audit` event per entry.
// ---------------------------------------------------------------------------

export type UkiActionOutcome = 'ran' | 'denied' | 'failed' | 'blocked' | 'cancelled';

export interface UkiActionAuditEntry {
  id: string;
  appId: string;
  mutates: boolean;
  args: Record<string, unknown>;
  outcome: UkiActionOutcome;
  result: string;
  ts: number;
  /** Risk level from the assistant policy (core tools); absent on old entries. */
  risk?: 'low' | 'medium' | 'high';
}

const AUDIT_MAX = 500;
// Persisted (bounded) so the trail survives a restart: "what did the assistant
// do yesterday" must be answerable. Args are already truncated by redactArgs.
const AUDIT_KEY = 'dex-uki-audit';
const AUDIT_PERSIST_MAX = 300;

function loadPersistedAudit(): UkiActionAuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-AUDIT_PERSIST_MAX) : [];
  } catch {
    return [];
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog.slice(-AUDIT_PERSIST_MAX))); } catch { /* quota/unavailable */ }
  }, 500);
}

const auditLog: UkiActionAuditEntry[] = loadPersistedAudit();

/** Truncate string args so the audit never stores unbounded/sensitive payloads. */
function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = typeof v === 'string' && v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  return out;
}

function recordAudit(e: Omit<UkiActionAuditEntry, 'ts'>): void {
  const entry: UkiActionAuditEntry = { ...e, ts: Date.now() };
  auditLog.push(entry);
  if (auditLog.length > AUDIT_MAX) auditLog.shift();
  schedulePersist();
  try {
    window.dispatchEvent(new CustomEvent('dex-uki-action-audit', { detail: entry }));
  } catch {
    /* non-DOM context */
  }
}

/** The UKI action audit trail (oldest first, most recent last). */
export function getUkiActionAudit(): readonly UkiActionAuditEntry[] {
  return auditLog;
}

/** Record a core-tool call (open_app, read_file, ...) in the same audit trail. */
export function recordUkiToolAudit(e: {
  tool: string;
  args: Record<string, unknown>;
  outcome: UkiActionOutcome;
  result: string;
  risk: 'low' | 'medium' | 'high';
  mutates: boolean;
}): void {
  recordAudit({ id: e.tool, appId: 'uki', mutates: e.mutates, args: redactArgs(e.args), outcome: e.outcome, result: e.result.slice(0, 300), risk: e.risk });
}

/** Clear the audit trail (user control in Security Center). */
export function clearUkiActionAudit(): void {
  auditLog.length = 0;
  try { localStorage.removeItem(AUDIT_KEY); } catch { /* unavailable */ }
  try { window.dispatchEvent(new CustomEvent('dex-uki-action-audit', { detail: null })); } catch { /* non-DOM */ }
}

/** Register (or replace) an action for an app. Call from the component's effect. */
export function registerUkiAppAction(
  appId: string,
  spec: AppActionSpec,
  handler: AppActionHandler,
): void {
  registerAppAction(registry, { appId, spec, handler });
}

/** Remove an action (call from effect cleanup). */
export function unregisterUkiAppAction(id: string): void {
  unregisterAppAction(registry, id);
}

function runningAppIds(): Set<string> {
  try {
    return new Set(useRunningApps.getState().runningApps.map((a) => a.id));
  } catch {
    return new Set();
  }
}

/** Actions whose owning app is currently running — the agent's discovery scope. */
export function listRunnableUkiActions(): AppActionEntry[] {
  const running = runningAppIds();
  return listAppActions(registry).filter((e) => running.has(e.appId));
}

/** Runnable actions adapted to agent ToolSpecs (merge via createToolCatalog). */
export function runnableActionToolSpecs(): ToolSpec[] {
  return listRunnableUkiActions().map((e) => actionToToolSpec(e.spec));
}

/** Every registered action, running app or not (for choosing one to schedule). */
export function listKnownUkiActions(): AppActionEntry[] {
  return listAppActions(registry);
}

/** The registered entry for an action id, if any. */
export function getUkiAppAction(id: string): AppActionEntry | undefined {
  return getAppAction(registry, id) ?? undefined;
}

/** True when the app that owns `id` is running and the action is registered. */
export function isUkiActionReady(id: string): boolean {
  const e = getAppAction(registry, id);
  return !!e && runningAppIds().has(e.appId);
}

/** True if `id` is a registered app action (vs. a core tool). */
export function isUkiAppAction(id: string): boolean {
  return !!getAppAction(registry, id);
}

/**
 * Run a registered action by id. Returns a model-facing RESULT string and never
 * throws — errors, missing apps and denied confirmations all come back as a
 * RESULT the agent can read and recover from.
 */
export async function runUkiAction(
  id: string,
  args: Record<string, unknown>,
  /** preApproved: the user approved this exact call ahead of time (a scheduled task). */
  opts: { preApproved?: boolean } = {},
): Promise<string> {
  const entry = getAppAction(registry, id);
  if (!entry) return `Unknown app action "${id}".`;
  const redacted = redactArgs(args);
  if (!runningAppIds().has(entry.appId)) {
    const result = `${entry.appId} is not running — open it first with open_app, then retry.`;
    recordAudit({ id, appId: entry.appId, mutates: entry.spec.mutates, args: redacted, outcome: 'blocked', result });
    return result;
  }
  if (entry.spec.mutates && !opts.preApproved) {
    let allowed = false;
    if (confirmHandler) {
      try {
        allowed = await confirmHandler(entry, args);
      } catch {
        allowed = false;
      }
    }
    if (!allowed) {
      const result = `"${id}" changes ${entry.appId} and needs the user's confirmation, which was not given. Not performed.`;
      recordAudit({ id, appId: entry.appId, mutates: true, args: redacted, outcome: 'denied', result });
      return result;
    }
  }
  try {
    const out = await entry.handler(args);
    const text = typeof out === 'string' && out.trim() ? out : 'Done.';
    const result = entry.spec.mutates && opts.preApproved ? `${text} (approved when scheduled)` : text;
    recordAudit({ id, appId: entry.appId, mutates: entry.spec.mutates, args: redacted, outcome: 'ran', result });
    return result;
  } catch (e) {
    const result = `Action "${id}" failed: ${(e as Error)?.message || 'error'}`;
    recordAudit({ id, appId: entry.appId, mutates: entry.spec.mutates, args: redacted, outcome: 'failed', result });
    return result;
  }
}
