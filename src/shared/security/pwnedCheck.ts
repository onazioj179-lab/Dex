// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pwned-Passwords k-anonymity helper.
 *
 * The renderer hashes the password with SHA-1, splits the prefix (5 chars)
 * from the suffix, ships only the prefix to the upstream service, and
 * matches the suffix against the returned list. The actual hash never
 * leaves the device. This file owns the pure parsing of the response.
 */

// DEX v3.8.9 - pwned password check

export interface PwnedResponseRow {
  suffix: string;     // hex, uppercase, 35 chars
  count: number;      // breach occurrences
}

/** Parse the upstream response. Lines look like `0018A45C4D1DEF81644B54AB7F969B88D65:3`. */
export function parsePwnedResponse(text: string): PwnedResponseRow[] {
  const out: PwnedResponseRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const suffix = line.slice(0, idx).toUpperCase();
    const count = Number(line.slice(idx + 1));
    if (!/^[0-9A-F]+$/.test(suffix)) continue;
    if (!Number.isFinite(count) || count < 0) continue;
    out.push({ suffix, count });
  }
  return out;
}

/** Look up the suffix in the parsed rows and return the breach count, or 0. */
export function pwnedCountForSuffix(rows: PwnedResponseRow[], suffix: string): number {
  const target = suffix.toUpperCase();
  const found = rows.find((r) => r.suffix === target);
  return found ? found.count : 0;
}

/** Decide severity from a breach count. */
export function pwnedSeverity(count: number): 'safe' | 'warn' | 'block' {
  if (count <= 0) return 'safe';
  if (count < 10) return 'warn';
  return 'block';
}

/** Friendly explanation for the UI. */
export function pwnedExplain(count: number): string {
  if (count <= 0) return 'This password was not found in known breaches.';
  if (count < 10) return `This password was seen ${count} time(s) in known breaches. Consider changing it.`;
  return `This password has been seen ${count.toLocaleString()} times in known breaches. Use a different one.`;
}
