// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - DEX v3.10.0 wave U - image AI + non-destructive primitives
// =============================================================================

export type RGB = readonly [number, number, number];

// ---- smart object: edit chain ----
export interface SmartFilter { id: string; kind: string; params: Readonly<Record<string, number>> }
export interface SmartObject { sourceId: string; filters: readonly SmartFilter[] }
export function appendFilter(obj: SmartObject, f: SmartFilter): SmartObject {
  return { sourceId: obj.sourceId, filters: [...obj.filters, f] };
}
export function removeFilter(obj: SmartObject, id: string): SmartObject {
  return { sourceId: obj.sourceId, filters: obj.filters.filter((f) => f.id !== id) };
}

// ---- camera raw ----
export interface RawAdjust { exposure: number; contrast: number; highlights: number; shadows: number; whites: number; blacks: number; vibrance: number; saturation: number; temperature: number; tint: number; clarity: number; dehaze: number; sharpness: number; noiseReduction: number }

export function applyRawAdjust(rgb: RGB, a: Partial<RawAdjust>): RGB {
  let [r, g, b] = rgb;
  if (a.exposure) { const k = 2 ** a.exposure; r *= k; g *= k; b *= k; }
  if (a.temperature) { r += a.temperature * 0.005; b -= a.temperature * 0.005; }
  if (a.tint) { g += a.tint * 0.005; }
  if (a.contrast) {
    const c = 1 + a.contrast;
    r = (r - 0.5) * c + 0.5; g = (g - 0.5) * c + 0.5; b = (b - 0.5) * c + 0.5;
  }
  if (a.saturation !== undefined) {
    const luma = 0.299*r + 0.587*g + 0.114*b;
    const s = 1 + a.saturation;
    r = luma + (r - luma) * s; g = luma + (g - luma) * s; b = luma + (b - luma) * s;
  }
  return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
}

// ---- curves: piecewise linear ----
export interface CurvePoint { input: number; output: number }
export function applyCurve(value: number, points: readonly CurvePoint[]): number {
  if (points.length === 0) return value;
  const sorted = [...points].sort((a, b) => a.input - b.input);
  if (value <= sorted[0].input) return sorted[0].output;
  if (value >= sorted[sorted.length - 1].input) return sorted[sorted.length - 1].output;
  for (let i = 1; i < sorted.length; i++) {
    if (value <= sorted[i].input) {
      const lo = sorted[i - 1], hi = sorted[i];
      const t = (value - lo.input) / (hi.input - lo.input);
      return lo.output + t * (hi.output - lo.output);
    }
  }
  return value;
}

// ---- frequency separation ----
export function separateFrequencies(image: readonly number[], blurRadius: number): { low: number[]; high: number[] } {
  const low: number[] = [];
  for (let i = 0; i < image.length; i++) {
    let s = 0; let c = 0;
    for (let j = -blurRadius; j <= blurRadius; j++) {
      const k = i + j;
      if (k < 0 || k >= image.length) continue;
      s += image[k]; c++;
    }
    low.push(s / c);
  }
  const high = image.map((v, i) => v - low[i]);
  return { low, high };
}

// ---- perspective warp: bilinear forward ----
export function perspectiveTransform(p: readonly [number, number], h: readonly number[]): [number, number] {
  const [x, y] = p;
  const denom = h[6] * x + h[7] * y + h[8];
  if (denom === 0) return [0, 0];
  return [(h[0] * x + h[1] * y + h[2]) / denom, (h[3] * x + h[4] * y + h[5]) / denom];
}

// ---- sky replace tone match: scale luma ----
export function toneMatchScale(sourceLuma: number, targetLuma: number): number {
  if (sourceLuma <= 0) return 1;
  return Math.max(0.1, Math.min(10, targetLuma / sourceLuma));
}

// ---- refine edge: simple feather ----
export function featherMask(mask: readonly number[], radius: number): number[] {
  const out: number[] = new Array(mask.length).fill(0);
  for (let i = 0; i < mask.length; i++) {
    let s = 0; let c = 0;
    for (let j = -radius; j <= radius; j++) {
      const k = i + j;
      if (k < 0 || k >= mask.length) continue;
      s += mask[k]; c++;
    }
    out[i] = s / c;
  }
  return out;
}

// ---- HDR merge: weighted average by exposure ----
export function mergeHdr(samples: readonly { value: number; ev: number }[]): number {
  let sum = 0; let weight = 0;
  for (const s of samples) {
    const w = 1 / (1 + Math.abs(s.ev));
    sum += (s.value * 2 ** -s.ev) * w;
    weight += w;
  }
  return weight === 0 ? 0 : sum / weight;
}

// ---- focus stacking: pick highest-contrast sample ----
export function focusStack(samples: readonly { value: number; sharpness: number }[]): number {
  let best = samples[0]?.value ?? 0;
  let bestS = -Infinity;
  for (const s of samples) if (s.sharpness > bestS) { bestS = s.sharpness; best = s.value; }
  return best;
}

// ---- median image stack (star/noise reduction) ----
export function medianStack(stacks: readonly (readonly number[])[]): number[] {
  if (stacks.length === 0) return [];
  const len = stacks[0].length;
  const out: number[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const col = stacks.map((s) => s[i]).sort((a, b) => a - b);
    out[i] = col[Math.floor(col.length / 2)];
  }
  return out;
}

// ---- gaussian blur kernel ----
export function gaussianKernel1d(radius: number, sigma: number): number[] {
  const k: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v); sum += v;
  }
  return k.map((v) => v / sum);
}

export function applyKernel1d(image: readonly number[], kernel: readonly number[]): number[] {
  const r = (kernel.length - 1) / 2;
  const out: number[] = new Array(image.length).fill(0);
  for (let i = 0; i < image.length; i++) {
    let s = 0;
    for (let j = -r; j <= r; j++) {
      const k = Math.max(0, Math.min(image.length - 1, i + j));
      s += image[k] * kernel[j + r];
    }
    out[i] = s;
  }
  return out;
}

// ---- type system: variable font axis interp ----
export function interpolateFontAxis(min: number, max: number, t: number): number {
  return min + (max - min) * Math.max(0, Math.min(1, t));
}

// ---- action recorder ----
export interface Action { kind: string; params: Readonly<Record<string, unknown>> }
export interface ActionRecording { steps: readonly Action[] }
export function recordAction(rec: ActionRecording, step: Action): ActionRecording {
  return { steps: [...rec.steps, step] };
}
export function batchProcess<T>(items: readonly T[], rec: ActionRecording, apply: (item: T, step: Action) => T): T[] {
  return items.map((it) => rec.steps.reduce((acc, step) => apply(acc, step), it));
}

// ---- content-aware fill toy: hole interpolation ----
export function patchMatchFill(image: number[], holes: readonly number[]): number[] {
  const out = image.slice();
  const hs = new Set(holes);
  for (const h of holes) {
    let left = h - 1; while (left >= 0 && hs.has(left)) left--;
    let right = h + 1; while (right < image.length && hs.has(right)) right++;
    const lv = left >= 0 ? out[left] : 0;
    const rv = right < image.length ? out[right] : 0;
    out[h] = (lv + rv) / 2;
  }
  return out;
}
