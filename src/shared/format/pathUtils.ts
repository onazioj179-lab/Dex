// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cross-platform path string helpers for the renderer (Files, AssetLibrary,
 * search). Works on both '/' and '\\' separators without depending on Node's
 * `path` (renderer-safe). Pure: no DOM, no IO.
 */

/** Convert all backslashes to forward slashes. */
export function normalizeSeparators(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Last path segment (file or folder name). */
export function basename(p: string): string {
  const norm = normalizeSeparators(p).replace(/\/+$/, '');
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? norm : norm.slice(idx + 1);
}

/** Everything before the last segment ('' when none). */
export function dirname(p: string): string {
  const norm = normalizeSeparators(p).replace(/\/+$/, '');
  const idx = norm.lastIndexOf('/');
  if (idx === -1) return '';
  return idx === 0 ? '/' : norm.slice(0, idx);
}

/** Extension including the dot ('' when none). Dotfiles have no extension. */
export function extname(p: string): string {
  const base = basename(p);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

/** File name without its extension. */
export function stem(p: string): string {
  const base = basename(p);
  const ext = extname(base);
  return ext ? base.slice(0, base.length - ext.length) : base;
}

/** Join segments with '/', collapsing duplicate and trailing slashes. */
export function joinPath(...parts: string[]): string {
  const joined = parts
    .map((p) => normalizeSeparators(p))
    .filter((p) => p !== '')
    .join('/');
  // Collapse runs of '/' but keep a leading '//' → '/'. Preserve a single
  // leading slash for absolute POSIX paths.
  const collapsed = joined.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed;
}

/** Split a path into its non-empty segments. */
export function segments(p: string): string[] {
  return normalizeSeparators(p).split('/').filter((s) => s !== '');
}
