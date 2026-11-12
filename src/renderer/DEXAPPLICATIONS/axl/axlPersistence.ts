// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// AXL keeps the open project in app storage, written on every change by the
// project store. Before this module:
//  - a full store made zustand's write throw inside every edit (an imported
//    mesh is easily megabytes), and nothing told the user their work was not
//    being kept;
//  - the leave-page guard and crash-recovery copy hung off an `isDirty` flag
//    that nothing ever set, so neither ever ran;
//  - "Import Project" accepted any JSON with `name` and `assembly`, so a file
//    without a parts list opened and then crashed the viewport.
// Now writes go through persistOrWarn (one warning per failure streak) and
// publish a status the toolbar shows; project files are checked here.

import { useSyncExternalStore } from 'react';
import type { StateStorage } from 'zustand/middleware';
import { persistOrWarn } from '../../utils/persistOrWarn';
import { MATERIAL_DB } from './constants';
import type { AXLProject, Part } from './types';

// ─── Save status ────────────────────────────────────────────────────────────

export interface AxlSaveStatus {
  /** false while the latest change could not be written. */
  ok: boolean;
  /** Time of the last successful write (ms), or null before the first one. */
  savedAt: number | null;
  error?: string;
}

let status: AxlSaveStatus = { ok: true, savedAt: null };
const listeners = new Set<() => void>();

function setStatus(next: AxlSaveStatus): void {
  status = next;
  listeners.forEach((l) => l());
}

export function getAxlSaveStatus(): AxlSaveStatus {
  return status;
}

export function subscribeAxlSaveStatus(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useAxlSaveStatus(): AxlSaveStatus {
  return useSyncExternalStore(subscribeAxlSaveStatus, getAxlSaveStatus, getAxlSaveStatus);
}

/** Storage for the project store's persist middleware. Never throws on write. */
export const axlStateStorage: StateStorage = {
  getItem: (name) => {
    try { return localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name, value) => {
    if (persistOrWarn(name, value, 'the AXL project')) {
      setStatus({ ok: true, savedAt: Date.now() });
    } else {
      setStatus({
        ok: false,
        savedAt: status.savedAt,
        error: 'App storage is full. Export the project (Ctrl+E) or remove large imported meshes.',
      });
    }
  },
  removeItem: (name) => {
    try { localStorage.removeItem(name); } catch { /* nothing to remove */ }
  },
};

/** Test helper. */
export function __resetAxlSaveStatus(): void {
  status = { ok: true, savedAt: null };
}

// ─── Project files ──────────────────────────────────────────────────────────

export type ParseResult =
  | { ok: true; project: AXLProject; notes: string[] }
  | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec = (v: unknown): boolean => isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.z);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** A part the renderer can draw: id, features list and a numeric transform. */
function checkPart(p: unknown): Part | null {
  if (!isObj(p) || typeof p.id !== 'string' || !p.id || !Array.isArray(p.features)) return null;
  const t = p.transform;
  if (!isObj(t) || !isVec(t.position) || !isVec(t.rotation) || !isVec(t.scale)) return null;
  const material = isObj(p.material) && typeof p.material.color === 'string' ? p.material : MATERIAL_DB[0];
  return {
    ...(p as unknown as Part),
    name: typeof p.name === 'string' && p.name ? p.name : 'Part',
    material: material as Part['material'],
    features: (p.features as unknown[]).filter((f) => isObj(f) && typeof f.type === 'string' && isObj(f.params)) as Part['features'],
    visible: p.visible !== false,
    selected: false,
    color: typeof p.color === 'string' ? p.color : (material as Part['material']).color,
    meshVertexCount: isNum(p.meshVertexCount) ? p.meshVertexCount : 0,
  };
}

/**
 * Read an AXL project file (the JSON that Export › JSON and Ctrl+E write).
 * Unusable parts are dropped and counted; a file with no usable part is refused.
 */
export function parseAxlProject(text: string): ParseResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'The file is not valid JSON.' }; }
  if (!isObj(data) || !isObj(data.assembly)) return { ok: false, reason: 'Not an AXL project (no assembly).' };
  const rawParts = data.assembly.parts;
  if (!Array.isArray(rawParts)) return { ok: false, reason: 'Not an AXL project (the assembly has no parts list).' };

  const parts = rawParts.map(checkPart).filter((p): p is Part => p !== null);
  const notes: string[] = [];
  const dropped = rawParts.length - parts.length;
  if (rawParts.length > 0 && parts.length === 0) return { ok: false, reason: `None of the ${rawParts.length} parts could be read.` };
  if (dropped > 0) notes.push(dropped === 1 ? '1 part could not be read and was left out.' : `${dropped} parts could not be read and were left out.`);

  const ids = new Set(parts.map((p) => p.id));
  const constraints = arr<Record<string, unknown>>(data.assembly.constraints)
    .filter((c) => isObj(c) && ids.has(c.partA as string) && ids.has(c.partB as string));
  const droppedC = arr(data.assembly.constraints).length - constraints.length;
  if (droppedC > 0) notes.push(droppedC === 1 ? '1 constraint referred to a missing part and was left out.' : `${droppedC} constraints referred to missing parts and were left out.`);

  const units = data.units === 'in' || data.units === 'm' ? data.units : 'mm';
  const now = Date.now();
  const project: AXLProject = {
    ...(data as unknown as AXLProject),
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : 'Imported Project',
    units,
    gridSnap: isNum(data.gridSnap) && data.gridSnap > 0 ? data.gridSnap : 1,
    assembly: {
      ...(data.assembly as unknown as AXLProject['assembly']),
      id: typeof data.assembly.id === 'string' ? data.assembly.id : 'assembly',
      name: typeof data.assembly.name === 'string' ? data.assembly.name : 'Main Assembly',
      parts,
      constraints: constraints as unknown as AXLProject['assembly']['constraints'],
      exploded: data.assembly.exploded === true,
      explodeDistance: isNum(data.assembly.explodeDistance) ? data.assembly.explodeDistance : 50,
    },
    measurements: arr(data.measurements),
    annotations: arr(data.annotations),
    bom: arr(data.bom),
    drawingViews: arr(data.drawingViews),
    dimensionLines: arr(data.dimensionLines),
    sketches: arr(data.sketches),
    parameters: arr(data.parameters),
    configurations: arr(data.configurations),
    namedViews: arr(data.namedViews),
    createdAt: isNum(data.createdAt) ? data.createdAt : now,
    modifiedAt: now,
    version: isNum(data.version) ? data.version : 1,
  };
  return { ok: true, project, notes };
}
