// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Small string helpers shared across main + renderer. These were each
// re-implemented inline in a few places with slight drift (truncate guarded vs
// unguarded input; escapeHtml escaping 4 vs 5 characters). This is the single
// source of truth -- consolidation audit, 2026-06-16. Pure: no DOM, no IO.

/**
 * Truncate `s` to at most `n` characters, appending an ellipsis when clipped.
 * Coerces null/undefined to '' so callers never need to pre-guard.
 */
export function truncate(s: string, n: number): string {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/** Escape the five HTML-significant characters (& < > " ') for safe interpolation. */
export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
