// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Parse short human duration strings ("1h30m", "45s", "2d 3h") into
 * milliseconds. Supports d/h/m/s/ms units. Whitespace is ignored.
 */

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDuration(input: string): number {
  const cleaned = input.replace(/\s+/g, '');
  if (cleaned.length === 0) throw new Error('parseDuration: empty input');
  // Token format: <number><unit>, scanning left-to-right
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/gi;
  let total = 0;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    const value = parseFloat(match[1]!);
    const unit = match[2]!.toLowerCase();
    total += value * UNIT_MS[unit]!;
    consumed += match[0].length;
  }
  if (consumed !== cleaned.length) {
    throw new Error(`parseDuration: invalid duration string "${input}"`);
  }
  return total;
}

/** Format milliseconds back into a compact "1d2h3m4s" string. */
export function formatDurationShort(ms: number): string {
  if (ms === 0) return '0s';
  const sign = ms < 0 ? '-' : '';
  let v = Math.abs(ms);
  const parts: string[] = [];
  const days = Math.floor(v / 86_400_000); v -= days * 86_400_000; if (days) parts.push(`${days}d`);
  const hours = Math.floor(v / 3_600_000); v -= hours * 3_600_000; if (hours) parts.push(`${hours}h`);
  const mins = Math.floor(v / 60_000); v -= mins * 60_000; if (mins) parts.push(`${mins}m`);
  const secs = Math.floor(v / 1000); v -= secs * 1000; if (secs) parts.push(`${secs}s`);
  if (v > 0) parts.push(`${v}ms`);
  return sign + parts.join('');
}
