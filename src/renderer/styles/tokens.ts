// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Design Tokens v3.7.3
 * 
 * Single source of truth for spacing, sizes, colors, and component styling.
 * Use these tokens instead of hardcoded values for consistency.
 * 
 * Mirrors design-system.css custom properties for use in inline styles.
 */

// ---------------------------------------------------------------------------
// Spacing Scale (4px base grid)
// ---------------------------------------------------------------------------
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// Common padding/gap presets
export const padding = {
  button: { sm: '6px 12px', md: '8px 16px', lg: '10px 20px' },
  input: { sm: '6px 10px', md: '8px 12px', lg: '10px 16px' },
  card: { sm: space[2], md: space[4], lg: space[6] },
  modal: space[6],
} as const;

export const gap = {
  xs: space[1],
  sm: space[2],
  md: space[3],
  lg: space[4],
  xl: space[6],
} as const;

// ---------------------------------------------------------------------------
// Border Radius — JS mirror of the ONE canonical scale (--radius-* in
// design-system.css). Keep these values identical to that scale; never add
// ad-hoc rungs here.
// ---------------------------------------------------------------------------
export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 11,
  xl: 14,
  '2xl': 18,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Font Sizes — JS mirror of THE text scale (--text-* in design-system.css).
// Keep values identical to that scale; `md` is a legacy alias of `base`.
// ---------------------------------------------------------------------------
export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
} as const;

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

// ---------------------------------------------------------------------------
// Icon Sizes (standardized)
// ---------------------------------------------------------------------------
export const iconSize = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
  '2xl': 32,
} as const;

// ---------------------------------------------------------------------------
// Z-Index Scale — Unified Shell Layering
// Mirrors design-system.css and utils/zIndexTokens.ts
// 
// Layer architecture:
//   Base (0-99)        — In-app content stacking
//   Windows (100-4990) — Floating window depth (managed by WindowDepthManager)
//   Shell (5000-9999)  — Dock, modals, overlays, menus, toasts
//   Emergency (10000+) — Screen guard, crash recovery, gesture debug
// ---------------------------------------------------------------------------
export const zIndex = {
  // Base layers (in-app content)
  base: 0,
  panel: 10,
  toolbar: 20,
  sidebar: 30,
  sticky: 50,
  
  // Floating window range (managed by WindowDepthManager)
  windowMin: 100,
  windowMax: 4990,
  
  // Shell layers
  dock: 5000,
  launchpad: 5200,
  stageManager: 5400,
  modalBackdrop: 5500,
  modal: 6000,
  sheet: 6500,
  overlay: 7000,
  notification: 8000,
  spotlight: 8500,
  dropdown: 9000,
  popover: 9200,
  tooltip: 9400,
  menu: 9500,
  contextMenu: 9700,
  toast: 9900,
  max: 9999,
  
  // Emergency layers (above all shell UI)
  dragOverlay: 10000,
  screenGuard: 20000,
  gestureDebug: 30000,
  crashRecovery: 40000,
  emergency: 50000,
} as const;

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------
export const transition = {
  fast: '100ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  spring: '200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

// ---------------------------------------------------------------------------
// Native chrome tokens (mirror design-tokens.css — keep in sync)
// ---------------------------------------------------------------------------

/** System font stack for app chrome — never a web font. SF Pro / Segoe UI Variable. */
export const fontStack = {
  ui: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  mono: '"SF Mono", "Cascadia Code", "Berkeley Mono", ui-monospace, "Roboto Mono", monospace',
} as const;

/** OS-feel motion: 150–220ms, standard ease, NO bounce, NO slow fades. */
export const motion = {
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '180ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '220ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/** Hairline borders at low opacity — kill heavy drop shadows. */
export const hairline = {
  default: '1px solid rgba(255, 255, 255, 0.08)',
  strong: '1px solid rgba(255, 255, 255, 0.14)',
} as const;

/** Keyboard-accessible focus ring (use on :focus-visible only). Monochrome +
 *  theme-aware, matching --dex-focus-ring in design-tokens.css (owner direction:
 *  focus is WHITE on dark / near-black on light, distinct from the blue accent). */
export const focusRing = '0 0 0 2px var(--dex-bg, #0c0c0e), 0 0 0 4px var(--dex-focus-color, #ffffff)';

// ---------------------------------------------------------------------------
// Colors — theme-aware. Each value is a CSS custom property (which flips with
// [data-theme="light"]) with the original dark literal as the fallback, so:
//   - inline styles applied to the DOM now respond to light mode automatically;
//   - if a var ever fails to resolve, behavior is identical to the old literal.
// Verified safe: no consumer feeds these to a <canvas> fillStyle, concatenates
// an alpha hex onto them, or compares them by equality (all of which would
// break with a var()). Use literal hex directly for canvas, not this object.
// ---------------------------------------------------------------------------
export const colors = {
  bg: {
    base: 'var(--color-bg-base, #0C0C0E)',
    surface: 'var(--color-bg-surface, #161618)',
    inset: 'var(--color-bg-inset, #101012)',
    hover: 'var(--color-bg-hover, #1E1E22)',
    active: 'var(--color-bg-active, #252528)',
    elevated: 'var(--color-bg-elevated, #1A1A1E)',
  },
  text: {
    primary: 'var(--color-text-primary, #FFFFFF)',
    secondary: 'var(--color-text-secondary, #B8B8BD)',
    tertiary: 'var(--color-text-tertiary, #8E8E93)',
    muted: 'var(--color-text-muted, #A0A0A5)',
    disabled: 'var(--color-text-disabled, #58585D)',
  },
  accent: {
    default: 'var(--color-accent, #4A9EFF)',
    hover: 'var(--color-accent-hover, #6CB2FF)',
    light: 'var(--color-accent-light, rgba(74, 158, 255, 0.14))',
    soft: 'var(--color-accent-soft, rgba(74, 158, 255, 0.08))',
  },
  semantic: {
    success: 'var(--color-success, #34C759)',
    successMuted: 'var(--color-success-muted, rgba(52, 199, 89, 0.14))',
    warning: 'var(--color-warning, #FF9F0A)',
    warningMuted: 'var(--color-warning-muted, rgba(255, 159, 10, 0.14))',
    error: 'var(--color-error, #FF453A)',
    errorMuted: 'var(--color-error-muted, rgba(255, 69, 58, 0.14))',
  },
  border: {
    default: 'var(--color-border, rgba(255, 255, 255, 0.14))',
    subtle: 'var(--color-border-subtle, rgba(255, 255, 255, 0.08))',
    strong: 'var(--color-border-strong, rgba(255, 255, 255, 0.22))',
  },
} as const;

// ---------------------------------------------------------------------------
// Component Defaults
// ---------------------------------------------------------------------------
export const button = {
  height: { sm: 28, md: 32, lg: 40 },
  minWidth: { sm: 64, md: 80, lg: 100 },
  iconGap: space[2],
} as const;

export const input = {
  height: { sm: 28, md: 32, lg: 40 },
} as const;

export const modal = {
  width: { sm: 400, md: 520, lg: 680, xl: 900 },
  maxHeight: '85vh',
  padding: space[6],
  borderRadius: radius.xl,
  zIndex: zIndex.modal,
  backdropColor: 'rgba(0, 0, 0, 0.5)',
} as const;

export const emptyState = {
  iconSize: 56,
  iconRadius: radius.lg,
  iconBgOpacity: 0.06,
  gap: space[4],
} as const;

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------
export type Space = keyof typeof space;
export type Radius = keyof typeof radius;
export type FontSize = keyof typeof fontSize;
export type IconSize = keyof typeof iconSize;
export type ZIndex = keyof typeof zIndex;
