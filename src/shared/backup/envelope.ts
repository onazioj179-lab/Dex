// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Backup envelope.
 *
 * A small, dependency-free format the user can save to disk to keep a
 * copy of their DEX work (notes, tasks, projects, workflows, settings,
 * etc.) and later import back into a fresh install. The envelope is a
 * single JSON object:
 *
 *   {
 *     "kind":        "dex.backup.v1",
 *     "createdAt":   1747700000000,
 *     "appVersion":  "4.1.8",
 *     "data":        { ...arbitrary payload... },
 *     "integrity":   "sha256:<hex>"   // sha256 over the canonical JSON of `data`
 *   }
 *
 * `integrity` is a self-check, not a signature -- DEX uses it on import
 * to refuse silently-corrupted files. It is NOT cryptographic protection
 * against a hostile editor; for that we'd need a publisher key, which we
 * intentionally don't have here (backups are user-owned).
 *
 * This module is pure and runs in either the main or renderer. The
 * caller supplies the sha256 implementation so we don't pull node:crypto
 * into the renderer bundle.
 */

export type Sha256Hex = (input: string) => string;

export interface BackupPayload {
  /** Free-form key/value tree. Keys should be stable (e.g. 'notes', 'tasks'). */
  [section: string]: unknown;
}

export interface BackupEnvelope {
  kind: 'dex.backup.v1';
  createdAt: number;
  appVersion: string;
  data: BackupPayload;
  integrity: string;
}

export interface ParseResult {
  ok: boolean;
  envelope?: BackupEnvelope;
  /** Reason envelope was rejected. */
  reason?: string;
}

/** Stable JSON: object keys sorted recursively, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const k of keys) out[k] = sortKeys((value as Record<string, unknown>)[k]);
  return out;
}

/** Build a backup envelope. `appVersion` is stamped verbatim (no validation). */
export function buildEnvelope(data: BackupPayload, appVersion: string, sha256: Sha256Hex, now: number = Date.now()): BackupEnvelope {
  const canonical = canonicalJson(data);
  return {
    kind: 'dex.backup.v1',
    createdAt: now,
    appVersion,
    data,
    integrity: `sha256:${sha256(canonical)}`,
  };
}

/** Validate an arbitrary value and return the typed envelope if it passes. */
export function parseEnvelope(raw: unknown, sha256: Sha256Hex): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'Backup must be a JSON object.' };
  const env = raw as Partial<BackupEnvelope>;
  if (env.kind !== 'dex.backup.v1') return { ok: false, reason: 'Unknown backup format. Expected dex.backup.v1.' };
  if (typeof env.createdAt !== 'number' || !Number.isFinite(env.createdAt)) return { ok: false, reason: 'Backup is missing a valid createdAt timestamp.' };
  if (typeof env.appVersion !== 'string' || env.appVersion.length === 0) return { ok: false, reason: 'Backup is missing an appVersion.' };
  if (!env.data || typeof env.data !== 'object' || Array.isArray(env.data)) return { ok: false, reason: 'Backup data section is missing or malformed.' };
  if (typeof env.integrity !== 'string' || !env.integrity.startsWith('sha256:')) return { ok: false, reason: 'Backup is missing a sha256 integrity hash.' };
  const expected = `sha256:${sha256(canonicalJson(env.data))}`;
  if (expected !== env.integrity) return { ok: false, reason: 'Backup integrity check failed: the data has been modified.' };
  return { ok: true, envelope: env as BackupEnvelope };
}

/**
 * Merge an imported payload into a current store snapshot.
 *
 * Strategy: shallow per-section, preferring the imported value for
 * scalar/object sections; for array sections, dedup by `id` field when
 * present, falling back to JSON-string equality. Returns a NEW object;
 * inputs are not mutated.
 *
 * The caller decides which sections to import (so we never overwrite,
 * say, telemetry tokens). Pass `sections` to opt-in.
 */
export function mergePayload(current: BackupPayload, incoming: BackupPayload, sections: readonly string[]): BackupPayload {
  const out: BackupPayload = { ...current };
  for (const key of sections) {
    if (!(key in incoming)) continue;
    const cur = current[key];
    const inc = incoming[key];
    if (Array.isArray(cur) && Array.isArray(inc)) {
      out[key] = mergeArrays(cur, inc);
    } else {
      out[key] = inc;
    }
  }
  return out;
}

function mergeArrays(current: readonly unknown[], incoming: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  const push = (item: unknown) => {
    const key = idKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  };
  for (const item of current) push(item);
  for (const item of incoming) push(item);
  return result;
}

function idKey(item: unknown): string {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const id = (item as Record<string, unknown>).id;
    if (typeof id === 'string' || typeof id === 'number') return `id:${id}`;
  }
  return `j:${canonicalJson(item)}`;
}

/** A short, file-system-safe filename for a backup created at the given time. */
export function defaultFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const h = now.getHours().toString().padStart(2, '0');
  const mi = now.getMinutes().toString().padStart(2, '0');
  return `dex-backup-${y}${m}${d}-${h}${mi}.json`;
}
