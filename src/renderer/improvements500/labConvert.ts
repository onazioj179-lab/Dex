// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * sRGB <-> CIE Lab colour-space conversion via XYZ (D65 illuminant).
 */

export interface RGB8Lab {
  r: number;
  g: number;
  b: number;
}

export interface LabColor {
  L: number;
  a: number;
  b: number;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

function f(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t + 16 / 116;
}
function fInv(t: number): number {
  const t3 = t * t * t;
  return t3 > 216 / 24389 ? t3 : (116 * t - 16) / (24389 / 27);
}

const Xn = 0.95047;
const Yn = 1.0;
const Zn = 1.08883;

export function rgbToLab(rgb: RGB8Lab): LabColor {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  const fx = f(x / Xn);
  const fy = f(y / Yn);
  const fz = f(z / Zn);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb(lab: LabColor): RGB8Lab {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;
  const x = Xn * fInv(fx);
  const y = Yn * fInv(fy);
  const z = Zn * fInv(fz);
  const r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}
