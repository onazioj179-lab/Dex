// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Secret redactor.
 *
 * Scans free-form text for things that look like API keys, tokens, JWTs,
 * private keys, or AWS-style credentials. Used before any UKI prompt is
 * shipped to a cloud model, before any crash report is uploaded, and
 * before any audit log line is written.
 */

// DEX v3.8.9 - secret redactor

export interface SecretFinding {
  kind: 'aws-access-key' | 'aws-secret' | 'github-token' | 'slack-token'
       | 'stripe-key' | 'jwt' | 'private-key-block' | 'generic-high-entropy';
  start: number;
  end: number;
  preview: string;          // first/last 4 chars only
}

const PATTERNS: Array<{ kind: SecretFinding['kind']; re: RegExp }> = [
  { kind: 'aws-access-key',     re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'aws-secret',         re: /\b(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}\b/g },
  { kind: 'github-token',       re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { kind: 'slack-token',        re: /\bxox[abprs]-[A-Za-z0-9-]{10,72}\b/g },
  { kind: 'stripe-key',         re: /\b(?:sk|pk)_(?:test|live)_[A-Za-z0-9]{24,99}\b/g },
  { kind: 'jwt',                re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: 'private-key-block',  re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
];

function preview(secret: string): string {
  if (secret.length <= 8) return '***';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

/** Find every matching secret. Overlapping matches collapse to highest priority. */
export function findSecrets(input: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      findings.push({ kind, start: m.index, end: m.index + m[0].length, preview: preview(m[0]) });
    }
  }
  // Optional: catch generic high-entropy tokens that escaped the pattern set.
  for (const m of input.matchAll(/\b[A-Za-z0-9_-]{32,}\b/g)) {
    const value = m[0];
    if (findings.some((f) => f.start <= (m.index ?? 0) && f.end >= (m.index ?? 0) + value.length)) continue;
    if (looksHighEntropy(value)) {
      findings.push({ kind: 'generic-high-entropy', start: m.index ?? 0, end: (m.index ?? 0) + value.length, preview: preview(value) });
    }
  }
  return findings.sort((a, b) => a.start - b.start);
}

function looksHighEntropy(s: string): boolean {
  // Cheap shannon-style heuristic: ratio of unique chars and digit/letter mix.
  if (s.length < 32) return false;
  const unique = new Set(s).size;
  if (unique < 16) return false;
  const hasUpper = /[A-Z]/.test(s);
  const hasLower = /[a-z]/.test(s);
  const hasDigit = /\d/.test(s);
  return Number(hasUpper) + Number(hasLower) + Number(hasDigit) >= 2;
}

/** Replace each found secret with a stable placeholder. */
export function redactSecrets(input: string, placeholder: (kind: SecretFinding['kind']) => string = (k) => `[REDACTED:${k}]`): string {
  const findings = findSecrets(input);
  if (findings.length === 0) return input;
  let out = '';
  let cursor = 0;
  for (const f of findings) {
    if (f.start < cursor) continue;     // overlapping, keep prior coverage
    out += input.slice(cursor, f.start) + placeholder(f.kind);
    cursor = f.end;
  }
  out += input.slice(cursor);
  return out;
}

/** True if the input contains anything secret. */
export function containsSecret(input: string): boolean {
  return findSecrets(input).length > 0;
}
