// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PII redaction for logs and crash reports (T6-046, T7-004, T7-029, T7-030).
 *
 * Pure regex-based scrubber. Catches emails, common token shapes, JWTs,
 * credit-card numbers, SSNs, IPv4 addresses, and any value of a key listed
 * in the sensitive-keys set.
 */

const PATTERNS: Array<{ name: string; re: RegExp; sub: string }> = [
  { name: 'email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, sub: '[email]' },
  { name: 'jwt', re: /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, sub: '[jwt]' },
  { name: 'bearer', re: /\bbearer\s+[a-z0-9._\-+/=]{20,}/gi, sub: 'bearer [token]' },
  { name: 'apiKey', re: /\b(sk|pk|rk|api|key|token)[-_][a-z0-9]{16,}/gi, sub: '[apikey]' },
  { name: 'cc', re: /\b(?:\d[ -]*?){13,19}\b/g, sub: '[cc]' },
  { name: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g, sub: '[ssn]' },
  { name: 'ipv4', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, sub: '[ip]' },
];

export function redactString(input: string): string {
  let out = input;
  for (const p of PATTERNS) out = out.replace(p.re, p.sub);
  return out;
}

const DEFAULT_SENSITIVE_KEYS = new Set(['password', 'pass', 'pwd', 'secret', 'token', 'apiKey', 'api_key', 'authorization', 'cookie', 'sessionId']);

/** Deep-redact an arbitrary structure. Strings are scrubbed; sensitive keys
 * are replaced wholesale. Cycles are protected via a WeakSet. */
export function redactDeep(value: unknown, sensitiveKeys: ReadonlySet<string> = DEFAULT_SENSITIVE_KEYS, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[cycle]';
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, sensitiveKeys, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeys.has(k.toLowerCase())) out[k] = '[redacted]';
    else out[k] = redactDeep(v, sensitiveKeys, seen);
  }
  return out;
}

/** Redact a crash dump payload before submit. */
export function redactCrashDump(report: unknown): unknown {
  return redactDeep(report);
}
