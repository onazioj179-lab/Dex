// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Middle truncation (Files breadcrumbs, tab titles, long labels). Shortens a
 * string by eliding its middle ("verylongname…end.txt") so both ends stay
 * visible, with a path-aware variant that always preserves the filename. Pure:
 * no DOM, no IO.
 */

const ELLIPSIS = '…';

/** Truncate the middle of `str` to fit `max` chars (incl. the ellipsis). */
export function truncateMiddle(str: string, max: number, ellipsis = ELLIPSIS): string {
  if (max <= 0) return '';
  if (str.length <= max) return str;
  if (max <= ellipsis.length) return ellipsis.slice(0, max);

  const keep = max - ellipsis.length;
  const front = Math.ceil(keep / 2);
  const back = Math.floor(keep / 2);
  return str.slice(0, front) + ellipsis + str.slice(str.length - back);
}

/** Truncate the end of `str`, preserving the start. */
export function truncateEnd(str: string, max: number, ellipsis = ELLIPSIS): string {
  if (max <= 0) return '';
  if (str.length <= max) return str;
  if (max <= ellipsis.length) return ellipsis.slice(0, max);
  return str.slice(0, max - ellipsis.length) + ellipsis;
}

/**
 * Shorten a path while always keeping the final segment (filename). Elides
 * leading directories: "a/b/c/d/file.txt" → "a/…/file.txt".
 */
export function truncatePath(path: string, max: number, ellipsis = ELLIPSIS): string {
  const norm = path.replace(/\\/g, '/');
  if (norm.length <= max) return norm;

  const idx = norm.lastIndexOf('/');
  if (idx === -1) return truncateMiddle(norm, max, ellipsis);

  const file = norm.slice(idx + 1);
  const dir = norm.slice(0, idx);
  // If the filename alone doesn't fit, middle-truncate the whole thing.
  if (file.length + 2 + ellipsis.length >= max) return truncateMiddle(norm, max, ellipsis);

  const firstSlash = dir.indexOf('/');
  const head = firstSlash === -1 ? dir : dir.slice(0, firstSlash);
  const candidate = `${head}/${ellipsis}/${file}`;
  return candidate.length <= max ? candidate : `${ellipsis}/${file}`;
}
