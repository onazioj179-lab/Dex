// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX Capsule geometry: one set of sizes for every capsule control, so buttons
// in a group line up and a selected highlight always matches its container.
//
//   outer radius  = height / 2 (a true capsule)
//   inset         = the gap between the container edge and a segment
//   inner radius  = outer radius - inset   (concentric: never a rectangle in a pill)

export type CapsuleSize = 'sm' | 'md' | 'lg';

export const CAPSULE_HEIGHT: Record<CapsuleSize, number> = { sm: 24, md: 28, lg: 32 };
export const CAPSULE_INSET = 2;
export const CAPSULE_FONT: Record<CapsuleSize, number> = { sm: 11, md: 12, lg: 13 };
export const CAPSULE_ICON: Record<CapsuleSize, number> = { sm: 12, md: 14, lg: 16 };
export const CAPSULE_PAD_X: Record<CapsuleSize, number> = { sm: 8, md: 10, lg: 12 };
/** Icon stroke for every capsule glyph (one icon weight across DEX). */
export const CAPSULE_STROKE = 1.75;

/** Radius of a segment inside a container of `outerRadius` with `inset` padding. */
export function innerRadius(outerRadius: number, inset = CAPSULE_INSET): number {
  return Math.max(0, outerRadius - inset);
}

/** Outer and inner radius for a capsule group of a given size. Multi-row grids use a rounded rectangle. */
export function capsuleRadii(size: CapsuleSize, rows = 1): { outer: number; inner: number } {
  const h = CAPSULE_HEIGHT[size];
  const outer = rows > 1 ? 10 : h / 2;
  return { outer, inner: innerRadius(outer) };
}

/** Selected highlight: the DEX accent tint, theme-aware. */
export const CAPSULE_SELECTED_BG = 'color-mix(in srgb, var(--color-accent, #0A84FF) 22%, transparent)';
export const CAPSULE_HOVER_BG = 'color-mix(in srgb, var(--color-text-primary, #fff) 8%, transparent)';
