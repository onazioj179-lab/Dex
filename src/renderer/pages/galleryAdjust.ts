// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Gallery's photo adjustments as real pixel math (no CSS-filter stand-ins), so
// the live preview and the saved copy are the same image. Every control runs
// -100..100 with 0 = unchanged. Order: white balance (temperature, tint),
// exposure (in linear light, ±2 stops), highlights / shadows (luminance
// weighted), brightness (midtone gamma), contrast, saturation.
// The original file is never touched: edits are parameters, applied on export.
// Pure; unit-tested in tests/unit/gallery-adjust.test.ts.

export interface Adjustments {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  temperature: number;
  tint: number;
}

export const NEUTRAL: Adjustments = Object.freeze({
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, temperature: 0, tint: 0,
}) as Adjustments;

export const ADJUSTMENT_KEYS = Object.keys(NEUTRAL) as (keyof Adjustments)[];

export function isNeutral(a: Adjustments): boolean {
  return ADJUSTMENT_KEYS.every((k) => !a[k]);
}

/** Read stored adjustments; older saves used {e, c, s, t}. Unknown/junk -> 0. */
export function normalizeAdjustments(raw: unknown): Adjustments {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-100, Math.min(100, Math.round(v))) : 0);
  return {
    exposure: num(r.exposure ?? r.e),
    brightness: num(r.brightness),
    contrast: num(r.contrast ?? r.c),
    highlights: num(r.highlights),
    shadows: num(r.shadows),
    saturation: num(r.saturation ?? r.s),
    temperature: num(r.temperature ?? r.t),
    tint: num(r.tint),
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** Apply `a` to RGBA pixels in place (alpha untouched). */
export function applyAdjustments(px: Uint8ClampedArray, a: Adjustments): void {
  if (isNeutral(a)) return;
  // White balance gains (warm: more red, less blue; tint: magenta vs green).
  const t = a.temperature / 100;
  const g = a.tint / 100;
  const gainR = 1 + 0.18 * t + 0.05 * g;
  const gainG = 1 - 0.1 * g;
  const gainB = 1 - 0.18 * t + 0.05 * g;
  const expGain = Math.pow(2, a.exposure / 50);
  // Per-channel 0..255 -> 0..1 tables for the stages that act per channel.
  const lut = new Float32Array(256 * 3);
  const gains = [gainR, gainG, gainB];
  for (let c = 0; c < 3; c++) {
    for (let v = 0; v < 256; v++) {
      lut[c * 256 + v] = clamp01(toSrgb(clamp01(toLinear(v / 255) * gains[c] * expGain)));
    }
  }
  const hi = a.highlights / 100;
  const sh = a.shadows / 100;
  const gamma = Math.pow(2, -a.brightness / 100);
  const k = a.contrast >= 0 ? 1 + a.contrast / 100 : 1 + a.contrast / 125;
  const sat = 1 + a.saturation / 100;
  const tonal = hi !== 0 || sh !== 0;

  for (let i = 0; i < px.length; i += 4) {
    let r = lut[px[i]];
    let gg = lut[256 + px[i + 1]];
    let b = lut[512 + px[i + 2]];
    if (tonal) {
      const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      // Highlights move bright tones only; shadows move dark tones only.
      const target = L + hi * 0.3 * smooth(0.45, 1, L) * (hi < 0 ? L : 1 - L) + sh * 0.35 * (1 - smooth(0, 0.55, L)) * (sh > 0 ? 1 - L : L);
      const ratio = L > 0.002 ? target / L : 1;
      const add = L > 0.002 ? 0 : target - L;
      r = r * ratio + add; gg = gg * ratio + add; b = b * ratio + add;
    }
    if (gamma !== 1) { r = Math.pow(clamp01(r), gamma); gg = Math.pow(clamp01(gg), gamma); b = Math.pow(clamp01(b), gamma); }
    if (k !== 1) { r = (r - 0.5) * k + 0.5; gg = (gg - 0.5) * k + 0.5; b = (b - 0.5) * k + 0.5; }
    if (sat !== 1) {
      const y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      r = y + (r - y) * sat; gg = y + (gg - y) * sat; b = y + (b - y) * sat;
    }
    px[i] = clamp01(r) * 255 + 0.5;
    px[i + 1] = clamp01(gg) * 255 + 0.5;
    px[i + 2] = clamp01(b) * 255 + 0.5;
  }
}

/** Bounded undo/redo of edit snapshots (adjustments + geometry). */
export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private present: T, private readonly limit = 100) {}
  get current(): T { return this.present; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  /** Record a new state (no-op if equal to the current one). */
  push(next: T): void {
    if (JSON.stringify(next) === JSON.stringify(this.present)) return;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = next;
    this.future = [];
  }
  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.present);
    this.present = prev;
    return prev;
  }
  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.present);
    this.present = next;
    return next;
  }
  /** Start over from `state` (a different photo). */
  reset(state: T): void { this.past = []; this.future = []; this.present = state; }
}
