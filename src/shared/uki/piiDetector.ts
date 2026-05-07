// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PII detector for UKI prompt sanitisation.
 *
 * Catches obvious personal identifiers before a prompt is sent to a
 * cloud model. Pure pattern matching; the user is always asked to
 * confirm before redactions are applied.
 */

// DEX v3.8.9 - PII detector

export type PiiKind = 'email' | 'phone' | 'ssn' | 'credit-card' | 'ipv4' | 'ipv6';

export interface PiiFinding {
  kind: PiiKind;
  start: number;
  end: number;
  value: string;
}

const PATTERNS: Array<{ kind: PiiKind; re: RegExp }> = [
  { kind: 'email',       re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: 'phone',       re: /(?:\+?\d{1,3}[ .-]?)?(?:\(?\d{2,4}\)?[ .-]?){2,4}\d{3,4}/g },
  { kind: 'ssn',         re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: 'credit-card', re: /\b(?:\d[ -]?){13,19}\b/g },
  { kind: 'ipv4',        re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g },
  { kind: 'ipv6',        re: /\b(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}\b/g },
];

/** Luhn check used to filter false-positive credit-card hits. */
export function luhnValid(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function findPii(input: string): PiiFinding[] {
  const out: PiiFinding[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const value = m[0];
      if (kind === 'credit-card' && !luhnValid(value)) continue;
      if (kind === 'phone' && value.replace(/\D/g, '').length < 8) continue;
      out.push({ kind, start: m.index, end: m.index + value.length, value });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function redactPii(input: string, placeholder: (kind: PiiKind) => string = (k) => `[${k.toUpperCase()}]`): string {
  const findings = findPii(input);
  if (findings.length === 0) return input;
  let out = '';
  let cursor = 0;
  for (const f of findings) {
    if (f.start < cursor) continue;
    out += input.slice(cursor, f.start) + placeholder(f.kind);
    cursor = f.end;
  }
  out += input.slice(cursor);
  return out;
}
