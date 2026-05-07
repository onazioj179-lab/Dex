// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// DEX v3.10.0 wave R - color science (ACES, scopes, primaries)

export type RGB = readonly [number, number, number];

export function rgbToLuma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rgbToLuma2020(r: number, g: number, b: number): number {
  return 0.2627 * r + 0.6780 * g + 0.0593 * b;
}

export function rgbToYCbCr(r: number, g: number, b: number): { y: number; cb: number; cr: number } {
  const y = rgbToLuma709(r, g, b);
  const cb = (b - y) / 1.8556;
  const cr = (r - y) / 1.5748;
  return { y, cb, cr };
}

export function srgbToLinear(c: number): number {
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * (c ** (1 / 2.4)) - 0.055;
}

// ACES tone map (Narkowicz simple)
export function acesToneMap(x: number): number {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

export function applyLift(value: number, lift: number): number { return value + lift * (1 - value); }
export function applyGamma(value: number, gamma: number): number { return value <= 0 ? 0 : value ** (1 / gamma); }
export function applyGain(value: number, gain: number): number { return value * gain; }

export function liftGammaGain(rgb: RGB, lift: RGB, gamma: RGB, gain: RGB): RGB {
  return [
    applyGain(applyGamma(applyLift(rgb[0], lift[0]), gamma[0]), gain[0]),
    applyGain(applyGamma(applyLift(rgb[1], lift[1]), gamma[1]), gain[1]),
    applyGain(applyGamma(applyLift(rgb[2], lift[2]), gamma[2]), gain[2]),
  ];
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max, d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

export function buildWaveformScope(luma: readonly number[], buckets: number = 256): number[] {
  const out = new Array<number>(buckets).fill(0);
  for (const y of luma) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(y * buckets)));
    out[idx]++;
  }
  return out;
}

export function buildVectorscope(samples: readonly { cb: number; cr: number }[], size: number = 64): number[][] {
  const grid: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (const s of samples) {
    const x = Math.min(size - 1, Math.max(0, Math.floor((s.cb + 0.5) * size)));
    const y = Math.min(size - 1, Math.max(0, Math.floor((s.cr + 0.5) * size)));
    grid[y][x]++;
  }
  return grid;
}

export function buildHistogram(channel: readonly number[], buckets: number = 256): number[] {
  return buildWaveformScope(channel, buckets);
}
