// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Geometry for Gallery's Crop & Rotate "Save Copy": 90° turns, a straighten
// angle (cropped to the largest upright rectangle so no empty corners show),
// then a centred crop to the chosen aspect ratio. Pure; unit-tested.
//

export type CropRatio = 'free' | '16:9' | '4:3' | '1:1' | '3:2';

/** Largest axis-aligned rectangle inside a w×h rectangle rotated by `angleRad`. */
export function largestUprightRect(w: number, h: number, angleRad: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const sinA = Math.abs(Math.sin(angleRad));
  const cosA = Math.abs(Math.cos(angleRad));
  const widthIsLonger = w >= h;
  const long = widthIsLonger ? w : h;
  const short = widthIsLonger ? h : w;
  if (short <= 2 * sinA * cosA * long || Math.abs(sinA - cosA) < 1e-10) {
    // Half-constrained: two corners of the crop touch the longer side.
    const x = 0.5 * short;
    return widthIsLonger ? { w: x / sinA, h: x / cosA } : { w: x / cosA, h: x / sinA };
  }
  const cos2a = cosA * cosA - sinA * sinA;
  return { w: (w * cosA - h * sinA) / cos2a, h: (h * cosA - w * sinA) / cos2a };
}

/** Centred crop of w×h to `ratio` (width:height). */
export function cropToRatio(w: number, h: number, ratio: CropRatio): { w: number; h: number } {
  if (ratio === 'free') return { w, h };
  const [a, b] = ratio.split(':').map(Number);
  const target = a / b;
  return w / h > target ? { w: h * target, h } : { w, h: w / target };
}

/**
 * Output canvas size for an image of `imgW`×`imgH` after a 90°-step rotation
 * (`rotation`), a straighten angle in degrees, and a ratio crop.
 */
export function editedCanvasSize(imgW: number, imgH: number, rotation: number, straightenDeg: number, ratio: CropRatio): { w: number; h: number } {
  const quarter = ((Math.round(rotation / 90) % 4) + 4) % 4;
  const [bw, bh] = quarter % 2 === 1 ? [imgH, imgW] : [imgW, imgH];
  const upright = straightenDeg === 0 ? { w: bw, h: bh } : largestUprightRect(bw, bh, (straightenDeg * Math.PI) / 180);
  const out = cropToRatio(upright.w, upright.h, ratio);
  return { w: Math.max(1, Math.floor(out.w)), h: Math.max(1, Math.floor(out.h)) };
}
