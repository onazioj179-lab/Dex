// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// FLUX project files (what Save Project writes): validation for opening one
// (tests/unit/flux-project.test.ts). Opening used to apply whatever the file
// held (fps, canvas size, duration, layers) and only logged to the console when
// a file was refused or broken.

export const FLUX_LAYER_TYPES = ['video', 'image', 'shape', 'text', 'particle', 'generator', 'group', 'camera', 'light'] as const;

export interface FluxProjectSettings {
  fps?: number;
  duration?: number;
  canvasSize?: { width: number; height: number };
  is3DMode?: boolean;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const intIn = (v: unknown, lo: number, hi: number): v is number => finite(v) && Number.isInteger(v) && v >= lo && v <= hi;

/** Read a project file. Throws with a reason; unreadable layers are left out and counted. */
export function parseFluxProject<L extends { id: string }>(text: string): { layers: L[]; settings: FluxProjectSettings; warnings: string[] } {
  let o: Record<string, unknown>;
  try { o = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.appId !== 'flux') throw new Error('Not a FLUX project.');
  if (o.version !== 1) throw new Error(`Unsupported project version: ${String(o.version)}.`);
  if (!Array.isArray(o.layers)) throw new Error('The project has no layer list.');

  const warnings: string[] = [];
  const seen = new Set<string>();
  const layers: L[] = [];
  let dropped = 0;
  for (const raw of o.layers) {
    const l = (raw ?? {}) as Record<string, unknown>;
    const ok = typeof l.id === 'string' && l.id !== '' && !seen.has(l.id)
      && typeof l.name === 'string'
      && FLUX_LAYER_TYPES.includes(l.type as (typeof FLUX_LAYER_TYPES)[number])
      && [l.startTime, l.duration, l.inPoint, l.outPoint].every(finite)
      && !!l.transform && typeof l.transform === 'object'
      && Array.isArray(l.behaviors) && Array.isArray(l.filters)
      && (l.content === undefined || typeof l.content === 'string');
    if (!ok) { dropped++; continue; }
    seen.add(l.id as string);
    layers.push({ visible: true, locked: false, solo: false, ...l } as unknown as L);
  }
  if (dropped) warnings.push(`${dropped} layer(s) could not be read and were left out.`);

  const settings: FluxProjectSettings = {};
  const s = (o.settings ?? {}) as Record<string, unknown>;
  if (s.fps !== undefined) { if (intIn(s.fps, 1, 240)) settings.fps = s.fps; else warnings.push('The frame rate in the file was not usable; the current one was kept.'); }
  if (s.duration !== undefined) { if (intIn(s.duration, 1, 1_000_000)) settings.duration = s.duration; else warnings.push('The duration in the file was not usable; the current one was kept.'); }
  if (s.canvasSize !== undefined) {
    const c = s.canvasSize as Record<string, unknown>;
    if (c && intIn(c.width, 16, 8192) && intIn(c.height, 16, 8192)) settings.canvasSize = { width: c.width as number, height: c.height as number };
    else warnings.push('The canvas size in the file was not usable; the current one was kept.');
  }
  if (typeof s.is3DMode === 'boolean') settings.is3DMode = s.is3DMode;
  return { layers, settings, warnings };
}
