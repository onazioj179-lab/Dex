// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * String slug + filename sanitizer. Used by Files exports, share links,
 * and any user-supplied name that must round-trip through a filesystem
 * or URL.
 */

const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function slugify(input: string, opts: { maxLength?: number } = {}): string {
  const max = opts.maxLength ?? 80;
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

/** Cross-platform safe filename. Strips path separators and reserved
 * Windows names; collapses runs of whitespace; trims dots/spaces from
 * the end. */
export function sanitizeFilename(input: string, opts: { maxLength?: number; replacement?: string } = {}): string {
  const max = opts.maxLength ?? 200;
  const rep = opts.replacement ?? '_';
  let out = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, rep)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (RESERVED_WIN.test(out)) out = `${out}_`;
  if (out.length === 0) out = 'untitled';
  return out.slice(0, max);
}

export function ensureUniqueName(desired: string, existing: ReadonlySet<string>): string {
  if (!existing.has(desired)) return desired;
  const dot = desired.lastIndexOf('.');
  const base = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : '';
  let n = 2;
  while (existing.has(`${base} (${n})${ext}`)) n++;
  return `${base} (${n})${ext}`;
}
