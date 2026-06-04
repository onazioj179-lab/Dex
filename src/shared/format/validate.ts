// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lightweight input validators (Settings, Nexus People, collaboration, provider
 * key entry). Pragmatic checks — not RFC-exhaustive, but enough to gate form
 * input and avoid obviously-bad values. Pure: no DOM, no IO.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Basic email shape check. */
export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Valid http(s) URL check (uses URL when available). */
export function isUrl(value: string): boolean {
  const v = value.trim();
  if (v === '') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 3/6/8-digit hex color, with or without leading '#'. */
export function isHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/** True when the string is non-empty after trimming. */
export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/** Clamp/validate a value is within an inclusive numeric range. */
export function inNumericRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}
