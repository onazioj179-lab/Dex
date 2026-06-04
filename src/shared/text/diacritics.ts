// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Diacritic-insensitive text normalization (search, sorting, matching). Strips
 * accents so "café" matches "cafe" and "naïve" matches "naive". Pure: no DOM.
 */

/** Remove combining diacritical marks (é → e, ñ → n). */
export function removeDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Normalize for search/matching: lowercase, accent-stripped, collapsed spaces. */
export function normalizeForSearch(s: string): string {
  return removeDiacritics(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Accent- and case-insensitive equality. */
export function looseEquals(a: string, b: string): boolean {
  return normalizeForSearch(a) === normalizeForSearch(b);
}

/** Accent- and case-insensitive substring test. */
export function looseIncludes(haystack: string, needle: string): boolean {
  return normalizeForSearch(haystack).includes(normalizeForSearch(needle));
}
