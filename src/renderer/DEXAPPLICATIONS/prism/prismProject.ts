// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// PRISM project files (.prism.json): validation for opening one
// (tests/unit/prism-project.test.ts). Save Project has always written
// { version: 1, canvasSize, layers, adjustments }; nothing could read it back.

export const PRISM_PROJECT_VERSION = 1;
export const PRISM_MAX_SIDE = 16384;

const LAYER_TYPES = ['image', 'shape', 'text', 'adjustment', 'group'] as const;
const ADJUSTMENT_KEYS = ['brightness', 'contrast', 'saturation', 'hue', 'exposure', 'highlights', 'shadows', 'temperature', 'tint', 'vibrance'] as const;

export interface PrismProjectFile<L> {
  canvasSize: { width: number; height: number };
  layers: L[];
  adjustments: Partial<Record<(typeof ADJUSTMENT_KEYS)[number], number>>;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Read a project file. Throws with a reason when it is not a PRISM project.
 * Layers that cannot be drawn are dropped and counted in `warnings`; a layer's
 * picture must be embedded (a `data:image/` URL), so opening a file never
 * fetches anything from the network.
 */
export function parsePrismProject<L extends { id: string }>(text: string): { project: PrismProjectFile<L>; warnings: string[] } {
  let o: Record<string, unknown>;
  try { o = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Not a PRISM project.');
  if (o.version !== PRISM_PROJECT_VERSION) throw new Error(o.version === undefined ? 'Not a PRISM project.' : `Unsupported project version: ${String(o.version)}.`);
  const cs = o.canvasSize as Record<string, unknown> | undefined;
  const width = Number(cs?.width);
  const height = Number(cs?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > PRISM_MAX_SIDE || height > PRISM_MAX_SIDE) {
    throw new Error('The project has no usable canvas size.');
  }
  if (!Array.isArray(o.layers)) throw new Error('The project has no layer list.');

  const warnings: string[] = [];
  let dropped = 0;
  let unembedded = 0;
  const seen = new Set<string>();
  const layers: L[] = [];
  for (const raw of o.layers) {
    const l = (raw ?? {}) as Record<string, unknown>;
    const ok = typeof l.id === 'string' && l.id && !seen.has(l.id)
      && typeof l.name === 'string'
      && LAYER_TYPES.includes(l.type as (typeof LAYER_TYPES)[number])
      && [l.opacity, l.x, l.y, l.width, l.height, l.rotation].every(finite)
      && typeof l.visible === 'boolean';
    if (!ok) { dropped++; continue; }
    let layer = l;
    if (l.imageData !== undefined && !(typeof l.imageData === 'string' && l.imageData.startsWith('data:image/'))) {
      unembedded++;
      const { imageData: _drop, ...rest } = l;
      layer = rest;
    }
    seen.add(l.id as string);
    layers.push(layer as unknown as L);
  }
  if (!layers.length) throw new Error('The project has no readable layers.');
  if (dropped) warnings.push(`${dropped} layer(s) could not be read and were left out.`);
  if (unembedded) warnings.push(`${unembedded} layer picture(s) were not embedded in the file and were left out.`);

  const adjustments: PrismProjectFile<L>['adjustments'] = {};
  const a = (o.adjustments ?? {}) as Record<string, unknown>;
  for (const k of ADJUSTMENT_KEYS) if (finite(a[k])) adjustments[k] = Math.max(-100, Math.min(100, a[k] as number));

  return { project: { canvasSize: { width, height }, layers, adjustments }, warnings };
}
