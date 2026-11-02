// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Accent family derivation (DEX Sharp 2.0).
 * -----------------------------------------------------------------------------
 * The app exposes a single accent colour to the user, but a coherent UI needs
 * the whole `--color-accent-*` family — base, hover (lighter), dark (pressed),
 * light (14% tint), soft (8% tint). Historically the boot path and the live
 * Settings path each set only `--color-accent`/`--accent-color`, so accent-tint
 * surfaces (hovers, active pills, soft backgrounds) stayed blue regardless of
 * the chosen colour. This module is the single place that expands one colour
 * into the full family, used by both App.tsx (boot + OS accent) and Settings.tsx
 * (live change), so the accent stays consistent everywhere off one input.
 *
 * `parseAccentColor` / `deriveAccentFamily` are pure (testable); `applyAccentFamily`
 * touches the DOM and is a no-op without one.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface AccentFamily {
  base: string;
  hover: string;
  dark: string;
  light: string;
  soft: string;
  /** Legacy alias used by some surfaces as `var(--color-accent-muted, ...)`. */
  muted: string;
}

/** Parse `#rgb`, `#rrggbb`, `rgb(...)` or `rgba(...)` into channels, else null. */
export function parseAccentColor(raw: string): RGB | null {
  const s = String(raw).trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const rgb = s.match(/^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/i);
  if (rgb) {
    return {
      r: Math.min(255, Number(rgb[1])),
      g: Math.min(255, Number(rgb[2])),
      b: Math.min(255, Number(rgb[3])),
    };
  }
  return null;
}

const mix = (ch: number, target: number, amt: number): number =>
  Math.round(ch + (target - ch) * amt);

/** Expand a base accent colour into the full token family, or null if unparseable. */
export function deriveAccentFamily(raw: string): AccentFamily | null {
  const c = parseAccentColor(raw);
  if (!c) return null;
  return {
    base: `rgb(${c.r}, ${c.g}, ${c.b})`,
    hover: `rgb(${mix(c.r, 255, 0.22)}, ${mix(c.g, 255, 0.22)}, ${mix(c.b, 255, 0.22)})`,
    dark: `rgb(${mix(c.r, 0, 0.22)}, ${mix(c.g, 0, 0.22)}, ${mix(c.b, 0, 0.22)})`,
    light: `rgba(${c.r}, ${c.g}, ${c.b}, 0.14)`,
    soft: `rgba(${c.r}, ${c.g}, ${c.b}, 0.08)`,
    muted: `rgba(${c.r}, ${c.g}, ${c.b}, 0.08)`,
  };
}

/**
 * Resolve a leading `var(--token)` reference to its current computed literal so
 * accent swatches expressed as CSS variables (e.g. `var(--color-success)`) can
 * be expanded too. Non-var input and unresolved vars pass through unchanged.
 */
function resolveCssColor(raw: string): string {
  const s = String(raw).trim();
  const m = s.match(/^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/);
  // Self-referential accent tokens are the "system default" sentinel: resolving
  // them against the computed value would re-apply whatever override is live,
  // making default unreachable. Fail the parse so the caller clears overrides.
  if (m && (m[1] === '--color-accent' || m[1] === '--accent-color')) return '';
  if (m && typeof document !== 'undefined' && document.documentElement && typeof getComputedStyle === 'function') {
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
    if (resolved) return resolved;
  }
  return s;
}

/**
 * Apply the derived family to <html> as the `--color-accent-*` custom properties.
 * Returns true if applied, false if the colour could not be parsed (DOM left
 * untouched). Safe to call without a DOM.
 */
export function applyAccentFamily(raw: string): boolean {
  if (typeof document === 'undefined' || !document.documentElement) return false;
  const fam = deriveAccentFamily(resolveCssColor(raw));
  if (!fam) return false;
  const rs = document.documentElement.style;
  rs.setProperty('--color-accent', fam.base);
  // Lets CSS tell a custom accent from the stylesheet default without an
  // :root[style*=...] selector (those recompute whole subtrees on every
  // inline-style write anywhere in the document).
  document.documentElement.setAttribute('data-dex-custom-accent', '');
  rs.setProperty('--accent-color', fam.base);
  // A chosen accent drives filled surfaces too (the baseline blue uses a darker
  // fill for AA white text; a custom colour is the user's explicit choice).
  rs.setProperty('--color-accent-fill', fam.base);
  rs.setProperty('--color-accent-hover', fam.hover);
  rs.setProperty('--color-accent-dark', fam.dark);
  rs.setProperty('--color-accent-light', fam.light);
  rs.setProperty('--color-accent-soft', fam.soft);
  rs.setProperty('--color-accent-muted', fam.muted);
  return true;
}
