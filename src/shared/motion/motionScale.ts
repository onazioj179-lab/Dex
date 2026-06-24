// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Size-proportional motion durations (DEX_FEATURE_BACKLOG 05, P1).
 *
 * Fluent 2 motion guidance, verified: "Give larger elements more time to animate
 * than smaller elements." This maps a UI element's size to an animation duration
 * on a small, bounded scale so a full-screen window transition feels weightier
 * than a tooltip — instead of one flat duration everywhere. Reduced-motion
 * (WCAG 2.3.3 / the shell "no motion" toggle) collapses every duration to ~0.
 *
 * Pure: no DOM, no CSS — returns milliseconds the caller applies. The renderer's
 * design-tokens already expose `--dex-motion-*` + a `prefers-reduced-motion`
 * override; this is the JS-side companion for animations driven in code.
 *
 * Source: https://fluent2.microsoft.design/motion (3-vote verified).
 */

/** Duration band for a UI element, smallest to largest. */
export type MotionSize = 'micro' | 'small' | 'medium' | 'large' | 'fullscreen';

/** Base durations in ms per band (Fluent-aligned: ~100ms small → ~400ms large). */
const BAND_MS: Record<MotionSize, number> = {
  micro: 80,
  small: 130,
  medium: 200,
  large: 300,
  fullscreen: 400,
};

export interface MotionOptions {
  /** Honour reduced motion — collapses to ~0ms (a single frame). */
  reducedMotion?: boolean;
  /** Global speed multiplier (e.g. a "snappy" preference). Default 1. */
  scale?: number;
}

/** The reduced-motion floor — one frame, not literally 0 so transitionend fires. */
const REDUCED_MS = 1;

export function motionDuration(size: MotionSize, opts: MotionOptions = {}): number {
  if (opts.reducedMotion) return REDUCED_MS;
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;
  return Math.round(BAND_MS[size] * scale);
}

/**
 * Classify an element's largest dimension (px) into a motion band, so callers can
 * derive a duration directly from measured size — the literal Fluent rule
 * ("larger elements animate longer"). Thresholds chosen so chips/buttons land in
 * micro/small, panels in medium, windows in large, and the full work area in
 * fullscreen.
 */
export function bandForSize(largestDimPx: number): MotionSize {
  if (largestDimPx <= 48) return 'micro';
  if (largestDimPx <= 160) return 'small';
  if (largestDimPx <= 480) return 'medium';
  if (largestDimPx <= 1024) return 'large';
  return 'fullscreen';
}

/** Convenience: measured size → duration in one call. */
export function motionDurationForSize(largestDimPx: number, opts: MotionOptions = {}): number {
  return motionDuration(bandForSize(largestDimPx), opts);
}

/** Detect the OS reduced-motion preference (renderer; safe default false). */
export function prefersReducedMotion(
  mql: { matches: boolean } | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null,
): boolean {
  return mql?.matches ?? false;
}
