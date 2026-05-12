// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * IPC permission gate (T7-001..T7-004, T7-013, T7-033, T7-034).
 *
 * Wraps an async IPC operation with: (1) zod-style schema validation, (2)
 * per-app permission lookup, (3) per-channel rate limiting, (4) sensitive
 * arg redaction in logs. Designed to be small and dependency-free so it
 * runs in renderer + main + plugin sandbox.
 */

export interface PermissionGateOptions<TArgs, TResult> {
  /** Channel name, e.g. "files.read". Used for rate buckets + logging. */
  channel: string;
  /** Permission key required, e.g. "fs.read". */
  permission: string;
  /** Validator: return null if valid, error message if not. */
  validate?: (args: TArgs) => string | null;
  /** Max calls allowed per window (default 60). */
  rateLimit?: number;
  /** Window length ms (default 60_000). */
  windowMs?: number;
  /** Keys whose values should be redacted from log output. */
  sensitiveKeys?: readonly string[];
  /** Permission lookup. Default: read from window.dexPermissions if present. */
  hasPermission?: (perm: string) => boolean;
  /** Underlying handler. */
  handler: (args: TArgs) => Promise<TResult>;
}

interface RateBucket { count: number; resetAt: number }
const buckets = new Map<string, RateBucket>();

function defaultHasPermission(perm: string): boolean {
  const w = globalThis as unknown as { dexPermissions?: Record<string, boolean> };
  if (!w.dexPermissions) return true; // permissive when no policy attached
  return Boolean(w.dexPermissions[perm]);
}

function redact<T>(args: T, keys: readonly string[]): unknown {
  if (keys.length === 0 || args === null || typeof args !== 'object') return args;
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const k of keys) {
    if (k in out) out[k] = '<redacted>';
  }
  return out;
}

export function withPermission<TArgs, TResult>(
  options: PermissionGateOptions<TArgs, TResult>,
): (args: TArgs) => Promise<TResult> {
  const {
    channel, permission, validate, rateLimit = 60, windowMs = 60_000,
    sensitiveKeys = [], hasPermission = defaultHasPermission, handler,
  } = options;

  return async (args: TArgs): Promise<TResult> => {
    if (!hasPermission(permission)) {
      throw new Error(`[${channel}] denied: missing permission "${permission}"`);
    }
    if (validate) {
      const err = validate(args);
      if (err) throw new Error(`[${channel}] invalid args: ${err}`);
    }
    const now = Date.now();
    let bucket = buckets.get(channel);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(channel, bucket);
    }
    bucket.count++;
    if (bucket.count > rateLimit) {
      throw new Error(`[${channel}] rate limit exceeded: ${rateLimit}/${windowMs}ms`);
    }
    try {
      return await handler(args);
    } catch (err) {
      try { console.warn(`[ipc:${channel}]`, redact(args, sensitiveKeys), (err as Error).message); } catch { /* noop */ }
      throw err;
    }
  };
}

/** Reset rate buckets (test helper). */
export function _resetRateBuckets(): void {
  buckets.clear();
}
