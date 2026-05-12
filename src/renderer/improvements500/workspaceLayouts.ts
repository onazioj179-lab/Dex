// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Workspace layouts (T9-022, T9-023).
 *
 * Save/load named window-arrangement presets. A layout is a list of window
 * placements: appId + bounds + z-order. The shell consumes layouts to
 * arrange visible windows.
 */

export interface WindowPlacement {
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  state: 'normal' | 'minimized' | 'maximized';
}

export interface WorkspaceLayout {
  id: string;
  name: string;
  /** Workspace name (T9-023). When omitted, layout belongs to default workspace. */
  workspace?: string;
  windows: readonly WindowPlacement[];
  /** Last-used unix ms; bump on apply. */
  updatedTs: number;
}

const STORAGE_KEY = 'dex:workspace:layouts';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readAll(): WorkspaceLayout[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkspaceLayout[]) : [];
  } catch { return []; }
}

function writeAll(list: WorkspaceLayout[]): void {
  if (!isBrowser()) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

export function listLayouts(workspace?: string): WorkspaceLayout[] {
  const all = readAll();
  if (!workspace) return all;
  return all.filter((l) => (l.workspace ?? 'default') === workspace);
}

export function listWorkspaces(): string[] {
  const set = new Set<string>(['default']);
  for (const l of readAll()) set.add(l.workspace ?? 'default');
  return Array.from(set).sort();
}

export function saveLayout(name: string, windows: readonly WindowPlacement[], opts: { workspace?: string; id?: string } = {}): WorkspaceLayout {
  const all = readAll();
  const id = opts.id ?? `layout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const layout: WorkspaceLayout = {
    id, name, workspace: opts.workspace, windows: windows.map((w) => ({ ...w })), updatedTs: Date.now(),
  };
  const idx = all.findIndex((l) => l.id === id);
  if (idx >= 0) all[idx] = layout; else all.push(layout);
  writeAll(all);
  return layout;
}

export function deleteLayout(id: string): boolean {
  const all = readAll();
  const next = all.filter((l) => l.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}

export function getLayout(id: string): WorkspaceLayout | undefined {
  return readAll().find((l) => l.id === id);
}

/** Mark a layout as recently applied (bump updatedTs). */
export function touchLayout(id: string): void {
  const all = readAll();
  const target = all.find((l) => l.id === id);
  if (!target) return;
  target.updatedTs = Date.now();
  writeAll(all);
}

/** Reset all layouts (test helper). */
export function _clearAll(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}
