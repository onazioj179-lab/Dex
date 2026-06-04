// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Text case conversion (UI labels, settings keys → human titles, command
 * names). Pure: no DOM, no IO.
 */

/** Capitalize the first letter; leave the rest unchanged. */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Title Case Each Word. */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Sentence case: first letter up, the rest lowercased. */
export function sentenceCase(s: string): string {
  const t = s.trim();
  return t.length === 0 ? t : t[0].toUpperCase() + t.slice(1).toLowerCase();
}

/** Split camelCase / PascalCase into space-separated words ("helloWorld" → "hello world"). */
export function camelToWords(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

/** Convert kebab/snake identifiers into a human Title ("user_id" → "User Id"). */
export function humanize(s: string): string {
  return titleCase(s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim());
}
