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

/**
 * Resolve any color string for canvas use: `var(--token)` (optionally with a
 * fallback, `var(--token, #fff)`) becomes the live token value; anything else
 * passes through. For stored colors that may hold a theme token.
 */
export function resolveCanvasColor(color: string | undefined | null, el?: Element | null): string {
  if (!color) return '#ffffff';
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?))?\s*\)$/.exec(color.trim());
  if (!m) return color;
  const v = canvasColor(m[1], el);
  return v === '#ffffff' && m[2] && !(m[1] in FALLBACKS) ? m[2] : v;
}

/**
 * A value an `<input type="color">` accepts. The control takes ONLY lowercase
 * `#rrggbb`; anything else (`var(--token)`, `rgb()`, `#fff`, a name) is
 * rejected with a console warning and the swatch shows black, so the picker
 * opens on the wrong colour. Resolves tokens, drops alpha, expands short hex.
 */
export function colorInputValue(color: string | undefined | null, fallback = '#000000', el?: Element | null): string {
  const c = resolveCanvasColor(color || fallback, el).trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex) {
    const h = hex[1].length <= 4 ? hex[1].slice(0, 3).split('').map((d) => d + d).join('') : hex[1].slice(0, 6);
    return `#${h.toLowerCase()}`;
  }
  const rgb = /^rgba?\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)/i.exec(c);
  if (rgb) {
    return '#' + [rgb[1], rgb[2], rgb[3]].map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0')).join('');
  }
  // Named colours and anything else: let the browser parse it.
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#010203';
      ctx.fillStyle = c;
      const out = String(ctx.fillStyle);
      if (out !== '#010203' || c.toLowerCase() === '#010203') return out.startsWith('#') ? out.slice(0, 7).toLowerCase() : colorInputValue(out, fallback);
    }
  } catch { /* non-DOM environment */ }
  return c === fallback ? '#000000' : colorInputValue(fallback, '#000000');
}
