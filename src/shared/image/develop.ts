// =============================================================================
// DEX Platform — Wave 3.4 Prism: Camera-Raw style develop module
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Develop module — Camera-Raw / Lightroom-style global tone + color controls.
 *
 * All operations are normalized to 0..1 RGB scene space before grading and
 * re-clamped to 0..1 on output. The order is intentional and matches the
 * conventional photo pipeline:
 *
 *   1. White balance (temp/tint)
 *   2. Exposure (linear gain in EV)
 *   3. Contrast (sigmoidal pivot at mid-gray)
 *   4. Highlights / Shadows (selective tone curve)
 *   5. Whites / Blacks (endpoint stretch)
 *   6. Clarity (local contrast — approximated as midtone unsharp)
 *   7. Dehaze (low-frequency subtraction)
 *   8. Vibrance (saturation weighted by current chroma)
 *   9. Saturation (HSL global)
 *
 * All on CPU; suitable for thumbnails, batch process, or fallback. The
 * renderer ships a WebGPU shader equivalent for the live editor.
 */

export interface DevelopSettings {
  temperature: number; // -100..+100
  tint: number;        // -100..+100
  exposure: number;    // EV stops -5..+5
  contrast: number;    // -100..+100
  highlights: number;  // -100..+100
  shadows: number;     // -100..+100
  whites: number;      // -100..+100
  blacks: number;      // -100..+100
  clarity: number;     // -100..+100
  dehaze: number;      // -100..+100
  vibrance: number;    // -100..+100
  saturation: number;  // -100..+100
}

export const DEFAULT_DEVELOP: DevelopSettings = {
  temperature: 0, tint: 0, exposure: 0, contrast: 0,
  highlights: 0, shadows: 0, whites: 0, blacks: 0,
  clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
};

/** Apply develop pipeline to a single normalized RGB pixel. */
export function develop(
  r: number, g: number, b: number,
  s: DevelopSettings,
): [number, number, number] {
  // 1. White balance — multiplicative shift
  const t = s.temperature / 100;
  const ti = s.tint / 100;
  r = r * (1 + 0.2 * t);
  b = b * (1 - 0.2 * t);
  g = g * (1 - 0.1 * ti);
  r = r + 0.05 * ti;

  // 2. Exposure — gain by 2^EV
  const gain = Math.pow(2, s.exposure);
  r *= gain; g *= gain; b *= gain;

  // 3. Contrast — sigmoidal pivot at 0.5
  const c = s.contrast / 100;
  if (c !== 0) {
    const k = 4 * c;
    r = sigmoid(r, k);
    g = sigmoid(g, k);
    b = sigmoid(b, k);
  }

  // 4. Highlights / shadows — selective tone curve weighted by luminance bands
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const hi = clamp01(lum) > 0.5 ? (lum - 0.5) * 2 : 0;
  const sh = clamp01(lum) < 0.5 ? (0.5 - lum) * 2 : 0;
  const hiAdj = (s.highlights / 100) * hi;
  const shAdj = (s.shadows / 100) * sh;
  r = clamp01(r + hiAdj * 0.4 + shAdj * 0.3);
  g = clamp01(g + hiAdj * 0.4 + shAdj * 0.3);
  b = clamp01(b + hiAdj * 0.4 + shAdj * 0.3);

  // 5. Whites / blacks — endpoint stretch
  const wAdj = s.whites / 100;
  const bAdj = s.blacks / 100;
  r = endpointStretch(r, wAdj, bAdj);
  g = endpointStretch(g, wAdj, bAdj);
  b = endpointStretch(b, wAdj, bAdj);

  // 6. Clarity — pull midtones toward the local average. Without a real local
  // operator on a single pixel, we approximate with a midtone S-curve scaled.
  const cl = s.clarity / 100;
  if (cl !== 0) {
    const midR = midContrast(r, cl);
    const midG = midContrast(g, cl);
    const midB = midContrast(b, cl);
    r = midR; g = midG; b = midB;
  }

  // 7. Dehaze — coarse low-frequency subtraction. Per-pixel only: shift dark
  // toward zero based on dehaze sign.
  const dh = s.dehaze / 100;
  if (dh > 0) {
    r = clamp01(r - dh * 0.1);
    g = clamp01(g - dh * 0.1);
    b = clamp01(b - dh * 0.1);
  } else if (dh < 0) {
    const lift = -dh * 0.1;
    r = clamp01(r + lift); g = clamp01(g + lift); b = clamp01(b + lift);
  }

  // 8. Vibrance — saturation weighted by inverse current saturation
  const v = s.vibrance / 100;
  if (v !== 0) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const w = 1 - sat;
    [r, g, b] = scaleSat(r, g, b, 1 + v * w);
  }

  // 9. Saturation — global
  const sg = s.saturation / 100;
  if (sg !== 0) {
    [r, g, b] = scaleSat(r, g, b, 1 + sg);
  }

  return [clamp01(r), clamp01(g), clamp01(b)];
}

function sigmoid(v: number, k: number): number {
  // Smooth contrast around 0.5 pivot
  if (k === 0) return v;
  const x = (v - 0.5) * 2; // -1..1
  const y = x / (1 + Math.abs(x) / (Math.abs(k) + 0.0001));
  return 0.5 + (k > 0 ? y * (Math.abs(k) + 1) / 2 : x * 0.5 / (Math.abs(k) + 1));
}

function endpointStretch(v: number, whites: number, blacks: number): number {
  // whites > 0 lifts highlights, blacks > 0 lifts shadows; signs invert.
  const blackPoint = -blacks * 0.2;       // negative blacks crushes shadows
  const whitePoint = 1 + whites * 0.2;    // positive whites lifts highlights
  if (whitePoint === blackPoint) return v;
  return clamp01((v - blackPoint) / (whitePoint - blackPoint));
}

function midContrast(v: number, amount: number): number {
  const x = (v - 0.5) * 2;
  const sign = Math.sign(x);
  const mag = Math.abs(x);
  const adj = mag + amount * 0.5 * (1 - mag) * mag * 4;
  return clamp01(0.5 + sign * adj * 0.5);
}

function scaleSat(r: number, g: number, b: number, k: number): [number, number, number] {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [
    lum + (r - lum) * k,
    lum + (g - lum) * k,
    lum + (b - lum) * k,
  ];
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
