// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Email canonicalisation + honeypot spam detection.
 *
 * - Canonicalisation collapses `User+tag@Example.com` to `user@example.com`
 *   so abuse trackers cannot be sidestepped with plus-tags or case.
 * - Honeypot detection: bots tend to fill every visible field; the
 *   form ships with one zero-width hidden field that humans never touch.
 */

// DEX v3.8.9 - email + honeypot

export function canonicaliseEmail(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed.toLowerCase();
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  // Strip plus-tag (`u+anything@x` -> `u@x`).
  const cleanLocal = local.split('+')[0].toLowerCase();
  // Gmail canonical: dots in local part are ignored.
  const isGmail = domain === 'gmail.com' || domain === 'googlemail.com';
  const finalLocal = isGmail ? cleanLocal.replace(/\./g, '') : cleanLocal;
  const finalDomain = isGmail ? 'gmail.com' : domain;
  return `${finalLocal}@${finalDomain}`;
}

export interface HoneypotInput {
  /** The honeypot field. Should be empty when a human submits. */
  trapField: string;
  /** Time spent on the form, in ms. Bots submit too fast. */
  formDwellMs?: number;
  /** Total keypress count across the form. */
  keypresses?: number;
}

export function detectHoneypot(input: HoneypotInput, opts: { minDwellMs?: number; minKeypresses?: number } = {}): { isBot: boolean; reason?: string } {
  const minDwell = opts.minDwellMs ?? 1200;
  const minKeys = opts.minKeypresses ?? 6;
  if (input.trapField && input.trapField.trim().length > 0) {
    return { isBot: true, reason: 'trap field filled' };
  }
  if (input.formDwellMs !== undefined && input.formDwellMs < minDwell) {
    return { isBot: true, reason: 'submitted too quickly' };
  }
  if (input.keypresses !== undefined && input.keypresses < minKeys) {
    return { isBot: true, reason: 'too few keystrokes' };
  }
  return { isBot: false };
}
