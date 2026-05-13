// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Workspace layout snapshot helpers. Serialize a set of window positions
 * and snap zones into a JSON-safe payload for save/restore.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface WindowGeometry {
  windowId: string;
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  snapZone?: string;
  display?: number;
  zIndex?: number;
}

export interface WorkspaceLayoutSnapshot {
  version: 1;
  id: string;
  name: string;
  capturedAt: number;
  windows: WindowGeometry[];
}

export function takeWorkspaceLayoutSnapshot(
  id: string,
  name: string,
  windows: readonly WindowGeometry[],
  now = Date.now(),
): WorkspaceLayoutSnapshot {
  return {
    version: 1,
    id,
    name,
    capturedAt: now,
    windows: windows.map((w) => ({ ...w })),
  };
}

export function isWorkspaceLayoutSnapshot(value: unknown): value is WorkspaceLayoutSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorkspaceLayoutSnapshot>;
  return (
    v.version === 1 &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.capturedAt === 'number' &&
    Array.isArray(v.windows)
  );
}

export function diffWorkspaceLayoutSnapshots(
  a: WorkspaceLayoutSnapshot,
  b: WorkspaceLayoutSnapshot,
): { added: string[]; removed: string[]; moved: string[] } {
  const aMap = new Map(a.windows.map((w) => [w.windowId, w]));
  const bMap = new Map(b.windows.map((w) => [w.windowId, w]));
  const added: string[] = [];
  const removed: string[] = [];
  const moved: string[] = [];
  for (const id of bMap.keys()) if (!aMap.has(id)) added.push(id);
  for (const id of aMap.keys()) if (!bMap.has(id)) removed.push(id);
  for (const [id, aw] of aMap) {
    const bw = bMap.get(id);
    if (!bw) continue;
    if (aw.x !== bw.x || aw.y !== bw.y || aw.width !== bw.width || aw.height !== bw.height) {
      moved.push(id);
    }
  }
  return { added, removed, moved };
}
