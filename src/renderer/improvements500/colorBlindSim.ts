// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Color blindness simulation matrices for the three common dichromacies.
 * Operates on linear-light sRGB or perceptual sRGB approximately.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export type ColorBlindKind = 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface CbRgb {
  r: number;
  g: number;
  b: number;
}

const MATRICES: Record<ColorBlindKind, [number, number, number, number, number, number, number, number, number]> = {
  protanopia: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
};

export function simulateColorBlind(rgb: CbRgb, kind: ColorBlindKind): CbRgb {
  const m = MATRICES[kind];
  return {
    r: m[0] * rgb.r + m[1] * rgb.g + m[2] * rgb.b,
    g: m[3] * rgb.r + m[4] * rgb.g + m[5] * rgb.b,
    b: m[6] * rgb.r + m[7] * rgb.g + m[8] * rgb.b,
  };
}
