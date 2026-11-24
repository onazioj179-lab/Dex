// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Glass Menu Utility
 * Shared transparent glass-effect styles for dropdowns, menus, popovers, and overlays.
 * Use these instead of hardcoded opaque backgrounds.
 * 
 * Adaptive: reduces backdrop-filter intensity on low-end hardware via
 * data-perf-tier attribute on the document root.
 */

import type React from 'react';

// ---------------------------------------------------------------------------
// Perf-Tier Aware Backdrop Helper
// ---------------------------------------------------------------------------
// Reads `data-perf-tier` from the document root and returns an appropriate
// blur + saturate string (or 'none' on low-end devices).
const _tier = (): 'low' | 'mid' | 'high' | 'ultra' => {
  try {
    const t = document.documentElement.getAttribute('data-perf-tier');
    if (t === 'low' || t === 'mid' || t === 'high' || t === 'ultra') return t;
  } catch { /* SSR safe */ }
  return 'high';
};

/** Backdrop-filter helper. Master overhaul (real liquid glass): every glass
 * preset and call site shares ONE adaptive backdrop blur so the whole shell --
 * menus, dropdowns, popovers, sidebars, toolbars, modals, the floating chrome --
 * reads as the same frosted material. The blur radius scales with the device
 * perf tier so weak hardware isn't asked to composite a 32px blur every frame:
 *   low   -> none  (also stripped platform-wide by the universal low-tier rule)
 *   mid   -> 60% radius
 *   high  -> full radius
 *   ultra -> full radius + a touch more saturation for extra "lensing"
 * Pair the returned filter with a TRANSLUCENT background (the --color-bg-glass /
 * --glass-bg tokens) or the blur has nothing to show through. */
export const adaptiveBlur = (highBlur: number, highSaturate = 200): { backdropFilter: string; WebkitBackdropFilter: string } => {
  const tier = _tier();
  if (tier === 'low') return { backdropFilter: 'none', WebkitBackdropFilter: 'none' };
  const radius = tier === 'mid' ? Math.round(highBlur * 0.6) : highBlur;
  const sat = tier === 'ultra' ? Math.min(highSaturate + 20, 240) : highSaturate;
  const value = `blur(${radius}px) saturate(${sat}%)`;
  return { backdropFilter: value, WebkitBackdropFilter: value };
};

/** Returns a scaled box-shadow value based on device capability */
export const adaptiveShadow = (highValue: string, midValue?: string): { boxShadow: string } => {
  const tier = _tier();
  // Depth on EVERY tier. A static box-shadow is cheap (unlike a GPU backdrop blur),
  // so the old "low tier = no shadow" left windows and panels dead-flat for no real
  // perf win. Low/mid use a caller-supplied lighter shadow when one is given,
  // otherwise they keep the full layered shadow so the UI always has hierarchy.
  if (tier === 'low' || tier === 'mid') return { boxShadow: midValue ?? highValue };
  return { boxShadow: highValue };
};

/** Standard glass menu/dropdown: frosted glass with rim-lit edge */
// Menus use the shared glass material tokens (design-tokens.css) and the live
// --glass-blur from applyGlassVars, so they follow the theme, the Interface
// Transparency slider and Reduce Transparency. The old literals were dark-only:
// a white 10% edge that vanished on light glass, blur fixed at import time.
export const glassMenu: React.CSSProperties = {
  background: 'var(--color-bg-glass)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--glass-edge)',
  borderRadius: 10,
  boxShadow: 'var(--glass-shadow), var(--glass-rim)',
};

/** Stronger panel for sidebars/cards */
export const glassPanel: React.CSSProperties = {
  background: 'var(--color-bg-surface)',
  ...adaptiveBlur(12, 150),
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 10,
  boxShadow: 'var(--dex-popup-shadow)',
};

/** Glass overlay for modals/palettes */
export const glassOverlay: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'var(--blur-lg) saturate(150%)',
  WebkitBackdropFilter: 'var(--blur-lg) saturate(150%)',
  transition: 'opacity 0.3s cubic-bezier(0.4,0,0.2,1)',
};

/** Glass button -- flat with border */
export const glassButton: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  color: 'var(--color-text-primary, #f5f5f7)',
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
  transition: 'all 0.1s ease',
};

/** Glass sidebar -- for app sidebars, navigation panels */
export const glassSidebar: React.CSSProperties = {
  background: 'var(--color-bg-glass, rgba(22, 22, 22, 0.90))',
  ...adaptiveBlur(20, 180),
  borderRight: '1px solid var(--color-border)',
  boxShadow: 'inset -0.5px 0 0 var(--color-bg-hover)',
};

/** Glass modal -- strong glass for dialogs, confirmation panels */
export const glassModal: React.CSSProperties = {
  background: 'var(--color-bg-glass-strong)',
  ...adaptiveBlur(28, 200),
  border: '1px solid var(--glass-edge)',
  borderRadius: 10,
  boxShadow: 'var(--glass-shadow), var(--glass-rim)',
};

// ---------------------------------------------------------------------------
// Premium Glass v1 -- sharp dark translucent UI primitives (polish pass)
// Used by the standardized GlassSidebar / GlassNavItem / GlassToolbar / etc.
// ---------------------------------------------------------------------------

/** Premium glass panel: large surface, subtle gloss, layered shadow. */
export const premiumGlassPanel: React.CSSProperties = {
  background: 'var(--pg-surface)',
  ...adaptiveBlur(24, 180),
  border: '1px solid var(--pg-border)',
  borderRadius: 10,
  boxShadow: 'var(--pg-shadow-panel), var(--pg-gloss-top)',
};

/** Premium glass sidebar: vertical nav strip; flush left, hairline divider. */
export const premiumGlassSidebar: React.CSSProperties = {
  background: 'var(--pg-sidebar)',
  ...adaptiveBlur(28, 180),
  borderRight: '1px solid var(--pg-border)',
  boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.02)',
  width: 'var(--pg-sidebar-width)',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  height: '100%',
};

/** Premium glass toolbar: compact horizontal strip used as window/page header. */
export const premiumGlassToolbar: React.CSSProperties = {
  background: 'var(--pg-toolbar)',
  ...adaptiveBlur(20, 170),
  borderBottom: '1px solid var(--pg-border)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  minHeight: 40,
};

/** Premium glass card: small contained surface for stats/info blocks. */
export const premiumGlassCard: React.CSSProperties = {
  background: 'var(--pg-surface)',
  ...adaptiveBlur(18, 170),
  border: '1px solid var(--pg-border)',
  borderRadius: 10,
  boxShadow: 'var(--pg-shadow-card), var(--pg-gloss-top)',
};

/** Premium glass row: list/nav item base style; pair with active state. */
export const premiumGlassRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  height: 'var(--pg-row-height)',
  padding: '0 10px',
  borderRadius: 'var(--pg-row-radius)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  transition: 'background 120ms ease, color 120ms ease',
  userSelect: 'none',
};

/** Premium glass row -- active variant. Apply alongside premiumGlassRow. */
export const premiumGlassRowActive: React.CSSProperties = {
  background: 'var(--pg-row-active)',
  color: 'var(--color-text-primary)',
  boxShadow: 'inset 0 0 0 1px var(--pg-border-active)',
};

/** Tab bar -- for tab navigation containers.
 * DEX Sharp (v5.5): tab strips are a "placed" chrome surface, like a native OS
 * tab bar — solid and crisp, NOT floating glass. No backdrop-filter (it blurred
 * content scrolling underneath and softened tab edges); an opaque elevated
 * surface with a hairline base border reads sharper and costs no GPU compositing. */

// ---------------------------------------------------------------------------
// Liquid Glass Material System — macOS Tahoe
// ---------------------------------------------------------------------------
// Dynamic glass with refraction-like tint shifting, 3 intensity levels,
// and perf-tier fallback.

type GlassIntensity = 'subtle' | 'medium' | 'heavy';

const GLASS_PRESETS: Record<GlassIntensity, {
  bg: string; blur: number; sat: number; border: string;
  highlight: string; shadow: string; radius: number;
}> = {
  subtle: {
    bg: 'var(--color-bg-hover)',
    blur: 20, sat: 160,
    border: '1px solid var(--color-border)',
    highlight: 'inset 0 0.5px 0 var(--color-border)',
    shadow: '0 2px 8px rgba(0,0,0,0.07)',
    radius: 10,
  },
  medium: {
    bg: 'var(--color-border-subtle)',
    blur: 32, sat: 190,
    border: '1px solid var(--color-border)',
    highlight: 'inset 0 0.5px 0 var(--color-text-tertiary), inset 0 -0.5px 0 rgba(0,0,0,0.04)',
    shadow: '0 4px 16px rgba(0,0,0,0.11)',
    radius: 10,
  },
  heavy: {
    bg: 'var(--color-border)',
    blur: 48, sat: 220,
    border: '1px solid var(--color-text-tertiary)',
    highlight: 'inset 0 1px 0 var(--color-text-tertiary), inset 0 -0.5px 0 rgba(0,0,0,0.05)',
    shadow: '0 8px 32px rgba(0,0,0,0.15), 0 0 0 0.5px var(--color-border-subtle)',
    radius: 10,
  },
};

/**
 * Generate a complete Liquid Glass material style object.
 * Automatically degrades on low-end hardware via perf-tier.
 * 
 * @param intensity — 'subtle' | 'medium' | 'heavy'
 * @param overrides — optional CSS property overrides (borderRadius, etc.)
 */
export function liquidGlass(
  intensity: GlassIntensity = 'medium',
  overrides?: Partial<React.CSSProperties>,
): React.CSSProperties {
  const p = GLASS_PRESETS[intensity];
  // Master overhaul (real liquid glass): a translucent fill over the adaptive
  // backdrop blur, so intensity scales the see-through material -- not just the
  // shadow depth. Degrades to solid on weak GPUs / reduced-transparency via the
  // shared token + universal low-tier rules.
  return {
    background: 'var(--color-bg-glass, rgba(22,22,26,0.74))',
    ...adaptiveBlur(p.blur, p.sat),
    border: p.border,
    borderRadius: p.radius,
    boxShadow: `${p.shadow}, ${p.highlight}`,
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    ...overrides,
  };
}

/** Quick glass icon container — for dock/launchpad app icon backgrounds */
export function glassIconBox(size = 20, radius = 6, tint = 'var(--color-bg-hover)'): React.CSSProperties {
  const tier = _tier();
  return {
    width: size, height: size, borderRadius: radius,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: tier === 'low' ? 'rgba(40,40,42,0.9)' : tint,
    border: '0.5px solid var(--color-border-subtle)',
    boxShadow: 'inset 0 0.5px 0 var(--color-border)',
  };
}
