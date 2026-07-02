// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Theme colors for Canvas 2D.
 *
 * Canvas 2D SILENTLY IGNORES CSS custom-property colors: assigning
 * `ctx.fillStyle = 'var(--color-accent)'` leaves the previous color in place
 * (no error, no fallback), so every canvas that tried to use theme tokens was
 * painting stale/wrong colors. Resolve tokens to literal values instead.
 * Fallbacks mirror the dark theme's real values for tests/SSR.
 */

const FALLBACKS: Record<string, string> = {
  '--color-accent': '#0a84ff',
  '--color-error': '#ff453a',
  '--color-success': '#32d74b',
  '--color-warning': '#ff9f0a',
  '--color-bg-elevated': '#141416',
  '--color-bg-hover': 'rgba(255,255,255,0.07)',
  '--color-border-subtle': 'rgba(255,255,255,0.08)',
  '--color-text-primary': 'rgba(255,255,255,0.92)',
  '--color-text-secondary': 'rgba(255,255,255,0.65)',
  '--color-text-tertiary': 'rgba(255,255,255,0.45)',
};

/**
 * Resolve a theme token to a literal color usable in a canvas context.
 * Reads the live computed value (theme-aware); `el` scopes the lookup when a
 * subtree overrides tokens. getComputedStyle without layout access is cheap
 * enough for per-frame render loops.
 */
export function canvasColor(name: string, el?: Element | null): string {
  try {
    const v = getComputedStyle(el ?? document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  } catch { /* non-DOM environment */ }
  return FALLBACKS[name] ?? '#ffffff';
}
