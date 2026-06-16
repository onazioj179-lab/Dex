// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- Control math helpers
// Pure, DOM-free value math shared by the sharp micro-controls (RangeSlider,
// NumberStepper). Kept tiny and side-effect-free so each piece is trivially
// unit-testable and reusable. No React, no tokens, no globals.
// ===========================================================================

/** Clamp `value` into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    // Tolerate swapped bounds rather than returning nonsense.
    const t = min; min = max; max = t;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Snap `value` to the nearest multiple of `step`, anchored at `min` so the
 * grid lines up with the control's start instead of zero. A non-finite or
 * non-positive `step` leaves the value untouched (continuous mode).
 */
export function snapToStep(value: number, step: number, min = 0): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  const snapped = min + Math.round((value - min) / step) * step;
  // Round away binary float drift (e.g. 0.1 + 0.2) to the step's precision.
  return roundToStepPrecision(snapped, step);
}

/**
 * Convert a value to a 0..100 percentage of the `[min, max]` track. A zero-
 * width range collapses to 0 to avoid dividing by zero. The result is clamped
 * so out-of-range values still map onto the visible track.
 */
export function valueToPercent(value: number, min: number, max: number): number {
  const span = max - min;
  if (span === 0) return 0;
  return clamp(((value - min) / span) * 100, 0, 100);
}

/**
 * Inverse of `valueToPercent`: map a 0..1 track ratio back to a stepped,
 * clamped value. Used when translating a pointer position into a value.
 */
export function ratioToValue(
  ratio: number,
  min: number,
  max: number,
  step: number,
): number {
  const raw = min + clamp(ratio, 0, 1) * (max - min);
  return clamp(snapToStep(raw, step, min), min, max);
}

/**
 * Round a value to the decimal precision implied by `step` (e.g. step 0.25 ->
 * 2 decimals). Keeps displayed and emitted values free of float noise.
 */
export function roundToStepPrecision(value: number, step: number): number {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(step) || step <= 0) return value;
  const decimals = stepDecimals(step);
  if (decimals === 0) return Math.round(value);
  // Decimal-string rounding (toFixed) instead of `Math.round(value*10^n)/10^n`:
  // the latter trips on float drift (2.005*100 -> 200.50000000000003 -> 2.01),
  // while toFixed reads the true stored value (2.00499... -> "2.00"). Both clean
  // drift; only this one is stable on half-way decimals.
  return Number(value.toFixed(decimals));
}

/** Number of decimal places a step implies (capped to keep it sane). */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0 || Number.isInteger(step)) return 0;
  const s = String(step);
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  return Math.min(s.length - dot - 1, 10);
}
