// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Command-palette scope resolution. Turns a raw query into the residual search
 * text plus the set of palette categories it's scoped to ("in:apps prism" →
 * {text:'prism', categories:{app}}). Composes `parseSearchScope` and maps the
 * unified-search kinds onto the palette's own categories. Pure: no DOM, no IO.
 */

import { parseSearchScope } from './searchScope';

/** The Command Palette's command categories. */
export type PaletteCategory = 'app' | 'action' | 'navigation' | 'settings' | 'recent';

// Unified-search kind → palette category. Kinds with no palette equivalent
// (note/file/…) intentionally map to nothing and fall back to an unscoped search.
const SCOPE_TO_CATEGORY: Record<string, PaletteCategory> = {
  app: 'app',
  action: 'action',
  command: 'action',
  setting: 'settings',
};

export interface ScopedQuery {
  /** Residual search text after stripping any scope prefix. */
  text: string;
  /** Categories the query is scoped to, or null when unscoped. */
  allowedCategories: Set<PaletteCategory> | null;
}

/** Resolve a raw palette query into residual text + an optional category filter. */
export function scopedQuery(raw: string): ScopedQuery {
  const scope = parseSearchScope(raw);
  const mapped = (scope.kinds ?? [])
    .map((k) => SCOPE_TO_CATEGORY[k])
    .filter((c): c is PaletteCategory => Boolean(c));
  return {
    text: scope.text,
    allowedCategories: mapped.length > 0 ? new Set(mapped) : null,
  };
}
