// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pen / stylus input model (T11-018..T11-023).
 *
 * Pure helpers that map PointerEvent fields to brush parameters. No DOM
 * binding so they slot into PRISM/FLUX/AXL stroke handlers directly.
 */

export interface PenStrokeSample {
  x: number;
  y: number;
  pressure: number;   // 0..1
  tiltX: number;      // -90..90
  tiltY: number;      // -90..90
  twist?: number;     // 0..359
  /** True when the barrel/side button was held during this sample. */
  barrelButton: boolean;
  /** When true, this sample is a likely palm-rejection candidate. */
  isPalm: boolean;
  ts: number;
}

export interface BrushDynamicsConfig {
  baseSize: number;
  baseOpacity: number;
  /** Multiplier for pressure → size (0 disables). Default 1. */
  pressureSize?: number;
  /** Multiplier for pressure → opacity. Default 1. */
  pressureOpacity?: number;
  /** When true, tilt drives stroke angle. */
  tiltAngle?: boolean;
}

export interface BrushDynamicsOutput {
  size: number;
  opacity: number;
  /** Radians, 0 means no rotation. */
  angle: number;
}

/** Convert a raw PointerEvent into a PenStrokeSample with palm rejection. */
export function samplePen(e: PointerEvent): PenStrokeSample {
  const isPen = e.pointerType === 'pen';
  // Heuristic palm-rejection: very large touch contact when a pen also down
  // — caller owns the "pen-active" flag; we mark probable-palm conservatively.
  const radius = Math.max(e.width || 0, e.height || 0);
  const isPalm = !isPen && radius > 25;
  return {
    x: e.clientX,
    y: e.clientY,
    pressure: e.pressure ?? (isPen ? 0.5 : 1),
    tiltX: e.tiltX ?? 0,
    tiltY: e.tiltY ?? 0,
    twist: e.twist,
    barrelButton: (e.buttons & 2) === 2 || e.button === 5,
    isPalm,
    ts: e.timeStamp,
  };
}

/** Compute brush size/opacity/angle from a sample + config. */
export function applyBrushDynamics(
  sample: PenStrokeSample,
  cfg: BrushDynamicsConfig,
): BrushDynamicsOutput {
  const ps = cfg.pressureSize ?? 1;
  const po = cfg.pressureOpacity ?? 1;
  const sizeMul = 1 - ps + ps * sample.pressure;
  const opMul = 1 - po + po * sample.pressure;
  let angle = 0;
  if (cfg.tiltAngle) {
    // Convert tilt vector to angle in radians.
    angle = Math.atan2(sample.tiltY, sample.tiltX || 0.0001);
  }
  return {
    size: cfg.baseSize * sizeMul,
    opacity: cfg.baseOpacity * opMul,
    angle,
  };
}

/** True if the sample should switch tool to eraser (barrel button held). */
export function isEraserGesture(sample: PenStrokeSample): boolean {
  return sample.barrelButton;
}
