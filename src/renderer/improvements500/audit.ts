// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Audit log (T7-010 vault audit; reusable for any sensitive subsystem).
 *
 * Append-only ring buffer in localStorage, capped at MAX entries.
 */

const STORAGE_PREFIX = 'dex:audit:';
const MAX_ENTRIES = 500;

export interface AuditEntry {
  ts: number;
  actor?: string;
  action: string;
  target?: string;
  outcome: 'success' | 'denied' | 'error';
  meta?: Record<string, unknown>;
}

function isBrowser(): boolean {
  return typeof localStorage !== 'undefined';
}

function key(channel: string): string { return STORAGE_PREFIX + channel; }

function read(channel: string): AuditEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key(channel));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as AuditEntry[]) : [];
  } catch { return []; }
}

function write(channel: string, list: AuditEntry[]): void {
  if (!isBrowser()) return;
  const trimmed = list.length > MAX_ENTRIES ? list.slice(list.length - MAX_ENTRIES) : list;
  try { localStorage.setItem(key(channel), JSON.stringify(trimmed)); } catch { /* quota */ }
}

export function audit(channel: string, entry: Omit<AuditEntry, 'ts'>): void {
  const list = read(channel);
  list.push({ ts: Date.now(), ...entry });
  write(channel, list);
}

export function listAudit(channel: string): AuditEntry[] {
  return read(channel).slice().reverse(); // newest first
}

export function clearAudit(channel: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(key(channel));
}
