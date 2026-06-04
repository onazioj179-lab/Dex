// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Named workspace layouts (CRT-025). Lets a creative app save and restore named
 * panel/window arrangements ("Edit", "Color", "Review") on top of the existing
 * WorkspaceSnapshot system, scoped per app id. Generic over the layout payload —
 * the app owns its shape; this owns naming, capping, and persistence.
 *
 * localStorage-backed, fail-safe, bounded. Pure aside from storage.
 */

export interface NamedLayout<T = unknown> {
  name: string;
  layout: T;
  updatedAt: number;
}

const PREFIX = 'dex-layouts:';
export const MAX_LAYOUTS_PER_APP = 24;

function keyFor(appId: string): string {
  return `${PREFIX}${appId}`;
}

function readAll<T>(appId: string): NamedLayout<T>[] {
  try {
    const raw = localStorage.getItem(keyFor(appId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll<T>(appId: string, layouts: NamedLayout<T>[]): void {
  try {
    localStorage.setItem(keyFor(appId), JSON.stringify(layouts));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** List an app's saved layouts, most-recently-updated first. */
export function listLayouts<T = unknown>(appId: string): NamedLayout<T>[] {
  return readAll<T>(appId).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Save (or overwrite) a named layout for an app. De-dupes by name
 * (case-insensitive), caps the count, returns the new list.
 */
export function saveLayout<T>(
  appId: string,
  name: string,
  layout: T,
  now: number = Date.now(),
): NamedLayout<T>[] {
  const trimmed = name.trim();
  if (!trimmed) return listLayouts<T>(appId);
  const lower = trimmed.toLowerCase();
  const others = readAll<T>(appId).filter((l) => l.name.toLowerCase() !== lower);
  const next = [{ name: trimmed, layout, updatedAt: now }, ...others]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_LAYOUTS_PER_APP);
  writeAll(appId, next);
  return next;
}

/** Get a single named layout (case-insensitive), or null. */
export function getLayout<T = unknown>(appId: string, name: string): NamedLayout<T> | null {
  const lower = name.trim().toLowerCase();
  return readAll<T>(appId).find((l) => l.name.toLowerCase() === lower) ?? null;
}

/** Delete a named layout; returns the new list. */
export function deleteLayout<T = unknown>(appId: string, name: string): NamedLayout<T>[] {
  const lower = name.trim().toLowerCase();
  const next = readAll<T>(appId).filter((l) => l.name.toLowerCase() !== lower);
  writeAll(appId, next);
  return listLayouts<T>(appId);
}
