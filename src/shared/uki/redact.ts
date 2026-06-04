// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Prompt secret/PII redaction (UKI-020). Before any text is sent to an external
 * LLM provider, scrub the obvious secrets — emails, API keys / bearer tokens,
 * and credit-card numbers — replacing them with typed placeholders. Upholds the
 * UKI privacy principle ("never exfiltrate secrets without consent") at the
 * orchestrator boundary.
 *
 * Conservative by design: only high-confidence patterns (card numbers are
 * Luhn-validated) so normal prose is left intact. Pure: no DOM, no IO.
 */

export type RedactionKind = 'email' | 'apiKey' | 'card';

export interface RedactionResult {
  text: string;
  counts: Record<RedactionKind, number>;
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Common key/token shapes: sk-/pk-/ghp_/xoxb-/AKIA…, or "Bearer <token>".
const API_KEY_RE = /\b(?:sk|pk|rk)-[A-Za-z0-9]{16,}\b|\bghp_[A-Za-z0-9]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+[A-Za-z0-9._-]{16,}\b/g;
// Candidate card numbers: 13–16 digits, optional space/dash grouping.
const CARD_CANDIDATE_RE = /\b(?:\d[ -]?){13,16}\b/g;

/** Luhn checksum — validates a candidate card number to cut false positives. */
export function luhnValid(digits: string): boolean {
  const d = digits.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Redact emails, API keys, and Luhn-valid card numbers from text. */
export function redactSecrets(input: string): RedactionResult {
  const counts: Record<RedactionKind, number> = { email: 0, apiKey: 0, card: 0 };

  let text = input.replace(API_KEY_RE, () => { counts.apiKey++; return '[redacted:apiKey]'; });
  text = text.replace(EMAIL_RE, () => { counts.email++; return '[redacted:email]'; });
  text = text.replace(CARD_CANDIDATE_RE, (m) => {
    if (luhnValid(m)) { counts.card++; return '[redacted:card]'; }
    return m;
  });

  return { text, counts };
}

/** True when the text contains at least one detectable secret. */
export function hasSecrets(input: string): boolean {
  const { counts } = redactSecrets(input);
  return counts.email + counts.apiKey + counts.card > 0;
}
