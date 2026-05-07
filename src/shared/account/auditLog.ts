// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Append-only audit log of security-relevant events.
 *
 * The log is the user's receipt: every sign-in, every destructive action,
 * every payment. It is local-first; cloud sync is opt-in. Events are
 * immutable and ordered.
 */

// DEX v3.8.9 - audit log

export type AuditEventKind =
  | 'sign-in' | 'sign-in-failed' | 'sign-out' | 'sign-up'
  | 'password-changed' | 'email-changed' | 'recovery-codes-rotated'
  | 'two-factor-enabled' | 'two-factor-disabled' | 'two-factor-passed' | 'two-factor-failed'
  | 'session-revoked' | 'all-sessions-revoked' | 'device-trusted'
  | 'plan-upgraded' | 'plan-downgraded' | 'plan-cancelled' | 'payment-succeeded' | 'payment-failed'
  | 'data-exported' | 'account-deleted' | 'heir-added' | 'heir-removed' | 'handover-triggered'
  | 'cloud-backup-started' | 'cloud-backup-finished' | 'cloud-restore-started'
  | 'plugin-installed' | 'plugin-uninstalled' | 'plugin-permission-granted'
  | 'security-alert';

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  ts: number;
  actor: 'user' | 'system' | 'plugin';
  pluginId?: string;
  /** Free-form structured detail; must NOT contain raw secrets or full IPs. */
  detail?: Record<string, string | number | boolean>;
  sessionId?: string;
}

export interface AuditLogState {
  events: AuditEvent[];
  /** Hard cap so a runaway plugin cannot DoS the log. */
  maxEvents: number;
}

export const DEFAULT_AUDIT_CAP = 5000;

export function createAuditLog(maxEvents: number = DEFAULT_AUDIT_CAP): AuditLogState {
  return { events: [], maxEvents };
}

let counter = 0;
function nextEventId(now: number): string {
  counter = (counter + 1) % 0xffff;
  return `${now.toString(36)}-${counter.toString(36)}`;
}

export function appendAudit(state: AuditLogState, ev: Omit<AuditEvent, 'id' | 'ts'> & { ts?: number }): AuditLogState {
  const ts = ev.ts ?? Date.now();
  const id = nextEventId(ts);
  const events = [...state.events, { ...ev, id, ts } as AuditEvent];
  // Drop oldest when we exceed the cap.
  if (events.length > state.maxEvents) events.splice(0, events.length - state.maxEvents);
  return { ...state, events };
}

export interface AuditQuery {
  kinds?: AuditEventKind[];
  sinceMs?: number;
  untilMs?: number;
  actor?: 'user' | 'system' | 'plugin';
  pluginId?: string;
  limit?: number;
}

export function queryAudit(state: AuditLogState, q: AuditQuery): AuditEvent[] {
  let out = state.events;
  if (q.kinds && q.kinds.length) out = out.filter((e) => q.kinds!.includes(e.kind));
  if (q.sinceMs !== undefined) out = out.filter((e) => e.ts >= q.sinceMs!);
  if (q.untilMs !== undefined) out = out.filter((e) => e.ts <= q.untilMs!);
  if (q.actor) out = out.filter((e) => e.actor === q.actor);
  if (q.pluginId) out = out.filter((e) => e.pluginId === q.pluginId);
  if (q.limit && q.limit > 0) out = out.slice(-q.limit);
  return out;
}

/** Plain-text export, suitable for bug-report attachment after PII scrub. */
export function formatAuditAsText(events: AuditEvent[]): string {
  const lines = events.map((e) => {
    const detail = e.detail ? Object.entries(e.detail).map(([k, v]) => `${k}=${v}`).join(' ') : '';
    const plug = e.pluginId ? ` plugin=${e.pluginId}` : '';
    return `${new Date(e.ts).toISOString()}  ${e.kind.padEnd(28)} actor=${e.actor}${plug} ${detail}`.trimEnd();
  });
  return lines.join('\n');
}

/** CSV export for spreadsheet review. */
export function formatAuditAsCsv(events: AuditEvent[]): string {
  const header = 'ts,iso,kind,actor,pluginId,sessionId,detail';
  const rows = events.map((e) => {
    const detail = e.detail ? JSON.stringify(e.detail).replace(/"/g, '""') : '';
    return [e.ts, new Date(e.ts).toISOString(), e.kind, e.actor, e.pluginId ?? '', e.sessionId ?? '', `"${detail}"`].join(',');
  });
  return [header, ...rows].join('\n');
}
