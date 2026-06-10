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

/** DEX 6.0 reduced-glass redesign (GOAL-6D): blur -60%, applied once here so
 * every adaptiveBlur call site inherits the pass. Call sites keep their
 * historical "full strength" numbers; this is the single point of control,
 * mirroring the --blur-* token reduction in design-system.css. */
const GOAL_6D_BLUR_SCALE = 0.4;

/** Returns a scaled backdrop-filter value based on device capability */
export const adaptiveBlur = (highBlur: number, highSaturate = 200): { backdropFilter: string; WebkitBackdropFilter: string } => {
  const glassMode = (() => {
    try {
      return document.documentElement.getAttribute('data-glass-effective-mode');
    } catch {
      return null;
    }
  })();
  if (glassMode === 'off') {
    return { backdropFilter: 'none', WebkitBackdropFilter: 'none' };
  }

  const tier = _tier();
  if (tier === 'low') return { backdropFilter: 'none', WebkitBackdropFilter: 'none' };
  const reducedScale = glassMode === 'reduced' ? 0.45 : 1;
  const liquidScale = glassMode === 'liquid' ? 1.15 : 1;
  const perfScale = tier === 'mid' ? 0.3 : 1;
  const blur = Math.max(0, Math.round(highBlur * GOAL_6D_BLUR_SCALE * perfScale * reducedScale * liquidScale));
  const sat = Math.max(100, Math.round(highSaturate * (tier === 'mid' ? 0.6 : 1) * (glassMode === 'reduced' ? 0.8 : 1)));
  const v = `blur(${blur}px) saturate(${sat}%)`;
  return { backdropFilter: v, WebkitBackdropFilter: v };
};

/** Returns a scaled box-shadow value based on device capability */
export const adaptiveShadow = (highValue: string, midValue?: string): { boxShadow: string } => {
  const tier = _tier();
  if (tier === 'low') return { boxShadow: 'none' };
  if (tier === 'mid') return { boxShadow: midValue || '0 2px 8px rgba(0,0,0,0.18)' };
  return { boxShadow: highValue };
};

/** Standard glass menu/dropdown: frosted glass with rim-lit edge */
export const glassMenu: React.CSSProperties = {
  background: 'var(--color-bg-glass, rgba(28, 28, 32, 0.86))',
  ...adaptiveBlur(20, 180),
  border: '1px solid rgba(255, 255, 255, 0.10)',
  borderRadius: 10,
  // Layered drop shadow + top rim-light: the "light catches the top edge"
  // vibrancy that reads as premium fluid glass on a dark surface.
  boxShadow: '0 8px 28px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.17), inset 0 0.5px 0 rgba(255,255,255,0.10)',
};

/** Stronger panel for sidebars/cards */
export const glassPanel: React.CSSProperties = {
  background: 'var(--color-bg-surface)',
  ...adaptiveBlur(12, 150),
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 10,
  boxShadow: '0 2px 10px rgba(0,0,0,0.16), inset 0 0.5px 0 rgba(255,255,255,0.06)',
};

/** Lighter glass for toolbar-level elements */
export const glassToolbar: React.CSSProperties = {
  background: 'var(--color-bg-elevated)',
  ...adaptiveBlur(12, 150),
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  boxShadow: '0 1px 3px rgba(0,0,0,0.13), inset 0 0.5px 0 rgba(255,255,255,0.05)',
};

/** Glass overlay for modals/palettes */
export const glassOverlay: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'var(--blur-lg) saturate(150%)',
  WebkitBackdropFilter: 'var(--blur-lg) saturate(150%)',
  transition: 'opacity 0.3s cubic-bezier(0.4,0,0.2,1)',
};

/** Glass select/dropdown item styles */
export const glassSelectStyles: React.CSSProperties = {
  background: 'var(--color-bg-surface-solid)',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  color: 'var(--color-text-primary, #f5f5f7)',
  fontFamily: 'var(--font-family)',
  outline: 'none',
  cursor: 'pointer',
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

/** Hover state for glass buttons */
export const glassButtonHover: React.CSSProperties = {
  background: 'var(--color-text-tertiary)',
  borderColor: 'var(--color-text-tertiary)',
};

/** Liquid glass dock -- frosted glass with strong blur. Background uses the
 * runtime CSS variable `--dex-glass-bg` (set by shellPreferencesStore) so the
 * user can tune Liquid-Glass tint and opacity from Settings. */
export const liquidGlassDock: React.CSSProperties = {
  background: 'var(--dex-glass-bg, rgba(26, 26, 30, 0.73))',
  ...adaptiveBlur(38, 190),
  border: '1px solid rgba(255, 255, 255, 0.10)',
  borderRadius: 9999,
  boxShadow: '0 14px 48px rgba(0,0,0,0.25), 0 4px 14px rgba(0,0,0,0.17), inset 0 1px 0 rgba(255,255,255,0.10)',
};

/** Liquid glass for interactive buttons */
export const liquidGlassButton: React.CSSProperties = {
  background: 'var(--color-border)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  boxShadow: '0 1px 4px rgba(0,0,0,0.11), inset 0 0.5px 0 var(--color-border)',
  color: 'var(--color-text-primary, #f5f5f7)',
  cursor: 'pointer',
  transition: 'background 0.25s cubic-bezier(0.4,0,0.2,1), border-color 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.2s cubic-bezier(0.23,1,0.32,1)',
};

/** Liquid glass button hover state */
export const liquidGlassButtonHover: React.CSSProperties = {
  background: 'var(--color-text-tertiary)',
  borderColor: 'var(--color-text-tertiary)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.11), 0 0 8px rgba(74,158,255,0.08), inset 0 0.5px 0 var(--color-border)',
};

/** Liquid glass input / text field */
export const liquidGlassInput: React.CSSProperties = {
  background: 'var(--color-bg-hover)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.07)',
  color: 'var(--color-text-primary, #f5f5f7)',
  transition: 'border-color 0.2s cubic-bezier(0,0,0.2,1), background 0.2s cubic-bezier(0,0,0.2,1)',
};

/** Liquid glass card */
export const liquidGlassCard: React.CSSProperties = {
  background: 'var(--color-bg-hover)',
  border: '1px solid var(--color-border)',
  borderRadius: 14,
  boxShadow: '0 2px 8px rgba(0,0,0,0.11), 0 8px 24px rgba(0,0,0,0.11), inset 0 0.5px 0 var(--color-border)',
  transition: 'border-color 0.25s cubic-bezier(0,0,0.2,1), box-shadow 0.25s cubic-bezier(0,0,0.2,1)',
};

/** Liquid glass app menu */
export const liquidGlassAppMenu: React.CSSProperties = {
  background: 'var(--color-bg-glass-strong, rgba(20, 20, 22, 0.93))',
  ...adaptiveBlur(24, 190),
  border: '1px solid var(--color-border)',
  borderRadius: 22,
  boxShadow: '0 12px 40px rgba(0,0,0,0.26), 0 0 0 0.5px var(--color-bg-hover), inset 0 0.5px 0 var(--color-border-subtle)',
};

/** Glass notification banner -- for toasts, alerts */
export const glassNotification: React.CSSProperties = {
  background: 'var(--color-bg-glass-strong, rgba(22, 22, 24, 0.94))',
  ...adaptiveBlur(20, 180),
  border: '1px solid var(--color-border)',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0,0,0,0.23), inset 0 0.5px 0 var(--color-border)',
  transition: 'transform 0.4s cubic-bezier(0.23,1,0.32,1), opacity 0.4s cubic-bezier(0.23,1,0.32,1)',
};

/** Glass tooltip -- compact, sharp */
export const glassTooltip: React.CSSProperties = {
  background: 'var(--color-bg-glass-strong, rgba(22, 22, 24, 0.96))',
  ...adaptiveBlur(16, 160),
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.21), inset 0 0.5px 0 var(--color-border-subtle)',
  padding: '5px 10px',
  fontSize: 11,
  color: 'var(--color-text-primary)',
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
  background: 'var(--color-bg-glass-strong, rgba(20, 20, 22, 0.96))',
  ...adaptiveBlur(28, 200),
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 16,
  boxShadow: '0 16px 64px rgba(0,0,0,0.33), 0 4px 16px rgba(0,0,0,0.18), inset 0 0.5px 0 rgba(255,255,255,0.06)',
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
  borderRadius: 12,
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
  padding: '8px 12px',
  minHeight: 44,
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

/** Premium glass overlay backdrop. */
export const premiumGlassOverlay: React.CSSProperties = {
  background: 'rgba(0,0,0,0.55)',
  ...adaptiveBlur(18, 160),
};

/** Glass tab bar -- for tab navigation containers */
export const glassTabBar: React.CSSProperties = {
  background: 'var(--color-bg-glass, rgba(22, 22, 24, 0.90))',
  ...adaptiveBlur(16, 180),
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  boxShadow: 'inset 0 0.5px 0 var(--color-bg-hover)',
};

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
    radius: 14,
  },
  heavy: {
    bg: 'var(--color-border)',
    blur: 48, sat: 220,
    border: '1px solid var(--color-text-tertiary)',
    highlight: 'inset 0 1px 0 var(--color-text-tertiary), inset 0 -0.5px 0 rgba(0,0,0,0.05)',
    shadow: '0 8px 32px rgba(0,0,0,0.15), 0 0 0 0.5px var(--color-border-subtle)',
    radius: 18,
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
  const tier = _tier();

  // Low: fall back to solid dark background
  if (tier === 'low') {
    return {
      background: 'var(--color-bg-surface-solid)',
      border: p.border,
      borderRadius: p.radius,
      boxShadow: p.highlight,
      ...overrides,
    };
  }

  const goal6dBlur = p.blur * GOAL_6D_BLUR_SCALE;
  const blur = Math.round(tier === 'mid' ? goal6dBlur * 0.4 : goal6dBlur);
  const sat = tier === 'mid' ? Math.round(p.sat * 0.6) : p.sat;
  const filterVal = `blur(${blur}px) saturate(${sat}%) brightness(1.05)`;

  return {
    background: p.bg,
    backdropFilter: filterVal,
    WebkitBackdropFilter: filterVal,
    border: p.border,
    borderRadius: p.radius,
    boxShadow: `${p.shadow}, ${p.highlight}`,
    transition: 'background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
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

export default {
  glassMenu,
  glassPanel,
  glassToolbar,
  glassOverlay,
  glassSelectStyles,
  glassButton,
  glassButtonHover,
  liquidGlassDock,
  liquidGlassButton,
  liquidGlassButtonHover,
  liquidGlassInput,
  liquidGlassCard,
  liquidGlassAppMenu,
  glassNotification,
  glassTooltip,
  glassSidebar,
  glassModal,
  glassTabBar,
  liquidGlass,
  glassIconBox,
};
