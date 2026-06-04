// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Name initials (avatar placeholders, Nexus People view, collaboration chips).
 * Derives 1–2 uppercase initials from a name or email, robust to extra spaces
 * and punctuation. Pure: no DOM, no IO.
 */

/** Up to `max` uppercase initials from a display name. */
export function initials(name: string, max = 2): string {
  const cleaned = name.trim();
  if (cleaned === '') return '?';

  // Email → use the local part.
  const base = cleaned.includes('@') ? cleaned.split('@')[0] : cleaned;

  const words = base
    .split(/[\s._-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 0);

  if (words.length === 0) return '?';
  if (words.length === 1) {
    return words[0].slice(0, Math.max(1, Math.min(max, 2))).toUpperCase();
  }
  return words.slice(0, max).map((w) => w[0]).join('').toUpperCase();
}

/** A deterministic hue (0–359) from a name, for avatar background colors. */
export function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
