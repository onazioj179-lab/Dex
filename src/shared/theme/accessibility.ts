// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Theme accessibility helpers: high-contrast palette, color-blind safe
 * palettes, density scale.
 */

// DEX v3.8.9 - theme accessibility

export interface Palette {
  bg: string;
  fg: string;
  accent: string;
  warn: string;
  danger: string;
  ok: string;
  muted: string;
  border: string;
}

export const HIGH_CONTRAST_LIGHT: Palette = {
  bg: '#ffffff', fg: '#000000', accent: '#0000ee', warn: '#a05a00',
  danger: '#a00000', ok: '#005a00', muted: '#444444', border: '#000000',
};

export const HIGH_CONTRAST_DARK: Palette = {
  bg: '#000000', fg: '#ffffff', accent: '#62b8ff', warn: '#ffd166',
  danger: '#ff6b6b', ok: '#7be37b', muted: '#bbbbbb', border: '#ffffff',
};

/** Color-blind safe accent sets (Wong palette inspired). */
export const COLORBLIND_PALETTES = {
  protanopia: { accent: '#0072B2', danger: '#D55E00', ok: '#009E73' },
  deuteranopia: { accent: '#0072B2', danger: '#E69F00', ok: '#56B4E9' },
  tritanopia: { accent: '#CC79A7', danger: '#D55E00', ok: '#009E73' },
} as const;

export type ColorBlindMode = keyof typeof COLORBLIND_PALETTES;

export function applyColorBlind(base: Palette, mode: ColorBlindMode): Palette {
  return { ...base, ...COLORBLIND_PALETTES[mode] };
}

/** Density scales (multipliers applied to spacing tokens). */
export const DENSITY_SCALES = {
  comfortable: 1,
  default: 0.92,
  compact: 0.82,
  ultra: 0.72,
} as const;

export type Density = keyof typeof DENSITY_SCALES;

export function scaleSpacing(value: number, density: Density): number {
  return Math.round(value * DENSITY_SCALES[density]);
}
