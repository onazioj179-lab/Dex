// =============================================================================
// DEX Platform — Wave 3.3 Prism: brush dynamics
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Brush dynamics — converts a stream of pointer events (with pressure,
 * tilt, velocity) into discrete brush dabs with per-dab modulation of
 * size / opacity / angle / scatter.
 *
 * Pure logic — no Canvas, no DOM. The caller iterates over `dabs` and stamps
 * a brush texture onto whatever surface they own.
 */

export type DynamicSource = 'pressure' | 'tilt' | 'velocity' | 'random' | 'fade-in';

export interface BrushDynamic {
  /** Min multiplier when source is 0. */
  min: number;
  /** Max multiplier when source is 1. */
  max: number;
  /** Source. */
  source: DynamicSource;
}

export interface BrushSettings {
  /** Base diameter in pixels. */
  size: number;
  /** Spacing as fraction of size (0.05..2.0; 0.25 default). */
  spacing: number;
  /** Base opacity 0..1. */
  opacity: number;
  /** Base flow 0..1 (per-dab opacity multiplier). */
  flow: number;
  /** Hardness 0..1 (used for stamp falloff by caller). */
  hardness: number;

  /** Dynamics. */
  sizeDynamic?: BrushDynamic;
  opacityDynamic?: BrushDynamic;
  flowDynamic?: BrushDynamic;
  angleDynamic?: BrushDynamic; // angle in radians
  scatterDynamic?: BrushDynamic; // 0..1 fraction of size
}

export interface PointerSample {
  x: number; y: number;
  /** 0..1 (default 0.5 for non-pressure devices). */
  pressure: number;
  /** 0..1 (default 0). */
  tilt: number;
  /** Time in ms (monotonic). */
  t: number;
}

export interface Dab {
  x: number; y: number;
  size: number;     // diameter in px
  opacity: number;  // 0..1
  flow: number;     // 0..1
  angle: number;    // radians
}

export interface StrokeState {
  /** Total length painted (px) — used for fade-in source. */
  length: number;
  /** Last sample. */
  last?: PointerSample;
}

const FADE_IN_PX = 100;

export function newStroke(): StrokeState { return { length: 0 }; }

/**
 * Push the next pointer sample into the stroke state and emit zero or more
 * dabs along the segment from the previous sample to this one.
 */
export function processSample(
  state: StrokeState,
  s: PointerSample,
  brush: BrushSettings,
): Dab[] {
  if (!state.last) {
    state.last = s;
    state.length = 0;
    return [emitDab(s, 0, brush, state.length, 0)];
  }
  const prev = state.last;
  const dx = s.x - prev.x;
  const dy = s.y - prev.y;
  const dist = Math.hypot(dx, dy);
  const dt = Math.max(1, s.t - prev.t);
  const velocity = clamp01(dist / dt / 4); // normalize ~px/ms to 0..1

  const spacingPx = Math.max(1, brush.size * brush.spacing);
  const out: Dab[] = [];
  let traveled = 0;
  while (traveled + spacingPx <= dist) {
    traveled += spacingPx;
    const u = traveled / dist;
    const x = prev.x + dx * u;
    const y = prev.y + dy * u;
    const interpSample: PointerSample = {
      x, y,
      pressure: prev.pressure + (s.pressure - prev.pressure) * u,
      tilt: prev.tilt + (s.tilt - prev.tilt) * u,
      t: prev.t + dt * u,
    };
    state.length += spacingPx;
    out.push(emitDab(interpSample, velocity, brush, state.length, Math.atan2(dy, dx)));
  }
  state.last = s;
  return out;
}

function emitDab(s: PointerSample, velocity: number, brush: BrushSettings, length: number, angleHint: number): Dab {
  const sizeMul = applyDynamic(brush.sizeDynamic, s, velocity, length, /*defaultMul*/ 1);
  const opMul = applyDynamic(brush.opacityDynamic, s, velocity, length, 1);
  const flowMul = applyDynamic(brush.flowDynamic, s, velocity, length, 1);
  const angle = brush.angleDynamic
    ? applyDynamic(brush.angleDynamic, s, velocity, length, angleHint)
    : angleHint;
  const scatterMag = brush.scatterDynamic
    ? applyDynamic(brush.scatterDynamic, s, velocity, length, 0) * brush.size
    : 0;
  const scAng = Math.random() * Math.PI * 2;
  const scR = Math.random() * scatterMag;
  return {
    x: s.x + Math.cos(scAng) * scR,
    y: s.y + Math.sin(scAng) * scR,
    size: brush.size * sizeMul,
    opacity: clamp01(brush.opacity * opMul),
    flow: clamp01(brush.flow * flowMul),
    angle,
  };
}

function applyDynamic(
  d: BrushDynamic | undefined,
  s: PointerSample,
  velocity: number,
  length: number,
  fallback: number,
): number {
  if (!d) return fallback;
  let v = 0;
  switch (d.source) {
    case 'pressure': v = clamp01(s.pressure); break;
    case 'tilt':     v = clamp01(s.tilt); break;
    case 'velocity': v = clamp01(velocity); break;
    case 'random':   v = Math.random(); break;
    case 'fade-in':  v = clamp01(length / FADE_IN_PX); break;
  }
  return d.min + (d.max - d.min) * v;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
