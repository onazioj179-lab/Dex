// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Project Manifest (.dexproject)
 * -----------------------------------------------------------------------------
 * The cross-app contract that lets Imosion, Vinx, Prism, Flux, and Forge share
 * a single project context: which apps touch it, last view state per app, the
 * shared color palette, and a shared timeline reference.
 *
 * Pure data + helpers; persistence is handled by the caller (IPC / file-system).
 */

import { ContextBus } from '../services/ContextBus';
import type { WorkspaceSnapshot } from '../../shared/phase15/workspaceSnapshot';

export const DEXPROJECT_VERSION = 1 as const;
export const DEXPROJECT_FILENAME = '.dexproject';

/** App-specific snapshot. Deliberately opaque: each app defines its own shape. */
export interface AppViewState {
  /** App id. */
  appId: string;
  /** Last write timestamp (ms epoch). */
  updatedAt: number;
  /** App-specific blob. Must be JSON-serializable. */
  state: Record<string, unknown>;
}

export interface SharedPalette {
  /** Hex colors. */
  colors: string[];
  /** Free-form name -> hex map for semantic colors. */
  named?: Record<string, string>;
}

export interface SharedTimeline {
  /** Frame rate the project is authored at. */
  fps: number;
  /** Duration in seconds (-1 if open-ended). */
  durationSeconds: number;
  /** Anchor markers shared across apps (seconds). */
  markers?: { id: string; seconds: number; label?: string; color?: string }[];
}

export interface DexProjectManifest {
  version: typeof DEXPROJECT_VERSION;
  /** Stable project id (uuid-like). */
  projectId: string;
  /** Human-readable name. */
  name: string;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /** App ids that have touched this project, in MRU order. */
  apps: string[];
  /** Per-app view state snapshots. */
  views: AppViewState[];
  /** Shared color palette. */
  palette: SharedPalette;
  /** Optional shared timeline (only for time-based projects). */
  timeline?: SharedTimeline;
  /** Free-form tags. */
  tags?: string[];
  /** Optional thumbnail path (relative to manifest). */
  thumbnail?: string;
  /**
   * Optional workspace snapshot: which apps/windows were open and focused for
   * this project. This is the bridge that makes "open project → restore the
   * full window layout" work — the project-centric continuity contract. Reuses
   * the shared WorkspaceSnapshot shape (shared/phase15/workspaceSnapshot.ts);
   * actual restoration is performed by the renderer window registry, this field
   * only carries the data.
   */
  workspace?: WorkspaceSnapshot;
}

// ---------------------------------------------------------------------------
// Construction + mutation helpers (pure, no IO)
// ---------------------------------------------------------------------------

const newProjectId = (): string =>
  `dexp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export function createDexProject(input: {
  name: string;
  appId?: string;
  palette?: SharedPalette;
  timeline?: SharedTimeline;
  tags?: string[];
}): DexProjectManifest {
  const now = new Date().toISOString();
  return {
    version: DEXPROJECT_VERSION,
    projectId: newProjectId(),
    name: input.name?.trim() || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    apps: input.appId ? [input.appId] : [],
    views: [],
    palette: input.palette ?? { colors: [] },
    timeline: input.timeline,
    tags: input.tags,
  };
}

/** Touch the manifest from an app: bumps updatedAt + MRU app list. */
export function touchProject(m: DexProjectManifest, appId: string): DexProjectManifest {
  const apps = [appId, ...(m.apps ?? []).filter((a) => a !== appId)];
  return { ...m, updatedAt: new Date().toISOString(), apps };
}

/** Replace (or insert) the per-app view-state snapshot. */
export function setAppView(
  m: DexProjectManifest,
  appId: string,
  state: Record<string, unknown>
): DexProjectManifest {
  const others = (m.views ?? []).filter((v) => v.appId !== appId);
  const next: AppViewState = { appId, updatedAt: Date.now(), state };
  return touchProject({ ...m, views: [...others, next] }, appId);
}

export function getAppView(m: DexProjectManifest, appId: string): AppViewState | undefined {
  return (m.views ?? []).find((v) => v.appId === appId);
}

/** Attach (or replace) the workspace snapshot this project should restore to. */
export function setProjectWorkspace(m: DexProjectManifest, workspace: WorkspaceSnapshot): DexProjectManifest {
  return { ...m, workspace, updatedAt: new Date().toISOString() };
}

/** Read the workspace snapshot to restore when this project is opened. */
export function getProjectWorkspace(m: DexProjectManifest): WorkspaceSnapshot | undefined {
  return m.workspace;
}

export function addPaletteColor(m: DexProjectManifest, hex: string): DexProjectManifest {
  const norm = hex.trim().toLowerCase();
  if (!/^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(norm)) return m;
  const palette = m.palette ?? { colors: [] };
  if (palette.colors.includes(norm)) return m;
  return {
    ...m,
    palette: { ...palette, colors: [...palette.colors, norm] },
    updatedAt: new Date().toISOString(),
  };
}

export function addMarker(
  m: DexProjectManifest,
  marker: { id?: string; seconds: number; label?: string; color?: string }
): DexProjectManifest {
  const t = m.timeline ?? { fps: 30, durationSeconds: -1, markers: [] };
  const id = marker.id || `mk_${Date.now().toString(36)}`;
  const markers = [...(t.markers ?? []), { id, seconds: marker.seconds, label: marker.label, color: marker.color }];
  return { ...m, timeline: { ...t, markers }, updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Minimal structural guard for a carried workspace snapshot (v1 + windows[]). */
function isWorkspaceLike(v: unknown): v is WorkspaceSnapshot {
  if (!v || typeof v !== 'object') return false;
  const w = v as Partial<WorkspaceSnapshot>;
  return w.version === 1 && Array.isArray(w.windows);
}

export function isDexProjectManifest(value: unknown): value is DexProjectManifest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DexProjectManifest>;
  return (
    v.version === DEXPROJECT_VERSION &&
    typeof v.projectId === 'string' &&
    typeof v.name === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.updatedAt === 'string' &&
    Array.isArray(v.apps) &&
    Array.isArray(v.views) &&
    !!v.palette && Array.isArray(v.palette.colors)
  );
}

/** Best-effort migration / coercion of legacy or partial manifests. */
export function coerceManifest(raw: unknown): DexProjectManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  try {
    const candidate: DexProjectManifest = {
      version: DEXPROJECT_VERSION,
      projectId: typeof r.projectId === 'string' ? r.projectId : newProjectId(),
      name: typeof r.name === 'string' ? r.name : 'Untitled Project',
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
      apps: Array.isArray(r.apps) ? r.apps.filter((x): x is string => typeof x === 'string') : [],
      views: Array.isArray(r.views)
        ? (r.views as Partial<AppViewState>[])
            .filter((v) => v && typeof v.appId === 'string' && v.state && typeof v.state === 'object')
            .map((v) => ({ appId: v.appId as string, updatedAt: v.updatedAt ?? Date.now(), state: v.state as Record<string, unknown> }))
        : [],
      palette: (r.palette && typeof r.palette === 'object' && Array.isArray((r.palette as SharedPalette).colors))
        ? r.palette as SharedPalette
        : { colors: [] },
      timeline: (r.timeline && typeof r.timeline === 'object') ? r.timeline as SharedTimeline : undefined,
      tags: Array.isArray(r.tags) ? r.tags.filter((x): x is string => typeof x === 'string') : undefined,
      thumbnail: typeof r.thumbnail === 'string' ? r.thumbnail : undefined,
      workspace: isWorkspaceLike(r.workspace) ? r.workspace : undefined,
    };
    return candidate;
  } catch {
    return null;
  }
}

/** Announce that a project context became active (after open / focus). */
export function announceProjectFocus(manifest: DexProjectManifest, source: string, manifestPath?: string): void {
  try {
    ContextBus.emit('continuity:project', {
      projectId: manifest.projectId,
      name: manifest.name,
      manifestPath,
      source,
    });
  } catch { /* bus errors non-fatal */ }
}
