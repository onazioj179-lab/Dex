// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Workspace Time Machine -- a rolling, automatic timeline of window layouts.
 *
 * Where WorkspacePresets holds NAMED layouts the user saves on purpose, this is
 * the macOS-Time-Machine analogue: AppManager captures the live layout on a
 * schedule, and the user can scrub back to "how my desktop looked an hour ago"
 * and restore it with one click. Same WindowSnapshot geometry + same restore
 * path as presets/crash-recovery -- this module is just the capped, dedup'd
 * rolling store (localStorage).
 */

import type { WindowSnapshot } from './WindowManifest';

export interface TimelineSnapshot {
  id: string;
  createdAt: number;
  windows: WindowSnapshot[];
}

const STORAGE_KEY = 'dex-workspace-timeline';
const MAX_SNAPSHOTS = 40;

function read(): TimelineSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(s => s && typeof s.id === 'string' && Array.isArray(s.windows));
  } catch {
    return [];
  }
}

function write(snaps: TimelineSnapshot[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps)); } catch { /* storage full */ }
}

/** Order-independent signature of a layout, so an unchanged desktop doesn't
 *  spawn duplicate snapshots every tick. */
function signature(windows: WindowSnapshot[]): string {
  return windows
    .map(w => `${w.appId}:${w.x},${w.y},${w.width},${w.height},${w.minimized ? 1 : 0}`)
    .sort()
    .join('|');
}

/** Newest first. */
export function listTimeline(): TimelineSnapshot[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function getTimelineSnapshot(id: string): TimelineSnapshot | undefined {
  return read().find(s => s.id === id);
}

/**
 * Record the current layout. No-ops when the layout is empty or identical to the
 * most recent snapshot (so an idle desktop doesn't fill the timeline). Returns
 * the stored snapshot, or null when skipped.
 */
export function pushTimelineSnapshot(windows: WindowSnapshot[], now: number = Date.now()): TimelineSnapshot | null {
  if (!windows.length) return null;
  const existing = read().sort((a, b) => b.createdAt - a.createdAt);
  if (existing[0] && signature(existing[0].windows) === signature(windows)) return null;
  const snap: TimelineSnapshot = {
    id: 'tl-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    createdAt: now,
    windows,
  };
  write([snap, ...existing].slice(0, MAX_SNAPSHOTS));
  return snap;
}

export function deleteTimelineSnapshot(id: string): void {
  write(read().filter(s => s.id !== id));
}

export function clearTimeline(): void {
  write([]);
}
