// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Workspace Presets ("workspace memory")
 * -----------------------------------------------------------------------------
 * Named, saved window layouts the user can restore instantly (DEX 5.5 Workspace
 * Flow initiative). A preset is the same geometry snapshot the WindowManifest
 * captures — `WindowSnapshot[]` + the active stage — but persisted under a user
 * name rather than as the single live/crash snapshot.
 *
 * Pure storage layer (localStorage). AppManager owns the capture (current
 * floating windows) and the restore (launch apps + apply clamped geometry),
 * reusing its existing crash-recovery path; this module just holds the named
 * collection.
 */

import type { WindowSnapshot } from './WindowManifest';

export interface WorkspacePreset {
  id: string;
  name: string;
  createdAt: number;
  /** Active stage at save time, if any. */
  stageId?: string;
  windows: WindowSnapshot[];
}

const STORAGE_KEY = 'dex-workspace-presets';
const MAX_PRESETS = 24;

// NOTE (DEX 5.6): the built-in starter set lives in services/workflowTemplates.ts
// (`WORKFLOW_TEMPLATES`) as the single source — they now open as real, kind-tagged
// Project Spaces via services/projectSpaces.ts `openWorkflowSpace()`. The old
// geometry-less `WORKSPACE_TEMPLATES` here (+ the `dex-workspace-apply-template`
// event path) were removed to retire the duplicate template system.

function read(): WorkspacePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(p => p && typeof p.id === 'string' && Array.isArray(p.windows));
  } catch {
    return [];
  }
}

function write(presets: WorkspacePreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    /* storage full — ignore */
  }
}

function makeId(): string {
  // Renderer context: Date.now()/Math.random() are available (unlike the
  // workflow sandbox). Collision-safe enough for a personal preset list.
  return 'ws-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/** All saved presets, newest first. */
export function listPresets(): WorkspacePreset[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function getPreset(id: string): WorkspacePreset | undefined {
  return read().find(p => p.id === id);
}

/**
 * Save the current layout under a name. Re-saving an existing name overwrites it
 * (so "update my Writing layout" is one action, not a duplicate). Returns the
 * stored preset.
 */
export function savePreset(name: string, windows: WindowSnapshot[], stageId?: string): WorkspacePreset {
  const trimmed = name.trim() || 'Workspace';
  const presets = read();
  const existing = presets.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
  const preset: WorkspacePreset = {
    id: existing?.id ?? makeId(),
    name: trimmed,
    createdAt: Date.now(),
    stageId,
    windows,
  };
  const next = [preset, ...presets.filter(p => p.id !== preset.id)].slice(0, MAX_PRESETS);
  write(next);
  return preset;
}

export function deletePreset(id: string): void {
  write(read().filter(p => p.id !== id));
}

export function renamePreset(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  write(read().map(p => (p.id === id ? { ...p, name: trimmed } : p)));
}
