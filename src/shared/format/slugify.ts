// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Slugify (project ids, asset names, shareable URLs, stable keys). Converts a
 * display name to a lowercase hyphen-separated slug, and can ensure uniqueness
 * against an existing set. Pure: no DOM, no IO.
 */

// Combining diacritical marks (U+0300–U+036F), escaped for portability.
const DIACRITICS = /[̀-ͯ]/g;

/** Convert text to a URL/id-safe slug ("My File 2!" → "my-file-2"). */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanumerics → hyphen
    .replace(/-{2,}/g, '-')          // collapse runs
    .replace(/^-+|-+$/g, '');        // trim hyphens
}

/**
 * A slug guaranteed not to collide with `existing`. Appends "-2", "-3", … if
 * needed. Empty input falls back to `fallback`.
 */
export function uniqueSlug(text: string, existing: Iterable<string>, fallback = 'item'): string {
  const taken = existing instanceof Set ? existing : new Set(existing);
  const base = slugify(text) || fallback;
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
