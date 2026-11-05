// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Per-app floating-window position memory (pure + persisted).
 *
 * Detaching an app used to ALWAYS maximize it, discarding wherever you last
 * floated it. This remembers each app's last floating rect so reopening the
 * window restores its place (mandate: "remember place when floating"). Keyed by
 * appId, persisted to localStorage so it survives a restart. The first-ever
 * detach (no memory yet) falls back to the maximized default at the call site.
 */

export interface FloatingRect { x: number; y: number; w: number; h: number }

const STORAGE_KEY = 'dex-floating-bounds';
const MAX_ENTRIES = 60;

type BoundsMap = Record<string, FloatingRect>;

function isRect(v: unknown): v is FloatingRect {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return ['x', 'y', 'w', 'h'].every(k => typeof o[k] === 'number' && Number.isFinite(o[k]))
    && (o.w as number) > 0 && (o.h as number) > 0;
}

function load(): BoundsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const out: BoundsMap = {};
    for (const [k, v] of Object.entries(parsed)) if (isRect(v)) out[k] = v as FloatingRect;
    return out;
  } catch {
    return {};
  }
}

function persist(map: BoundsMap): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* storage full */ }
}

/** Remembered floating rect for an app, or null if none saved. */
export function getFloatingBounds(appId: string): FloatingRect | null {
  const rect = load()[appId];
  return rect ? { ...rect } : null;
}

/** Save an app's floating rect (rounded). Capped so the map can't grow unbounded. */
export function saveFloatingBounds(appId: string, rect: FloatingRect): void {
  if (!appId || !isRect(rect)) return;
  const map = load();
  map[appId] = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) delete map[keys[0]]; // drop the oldest inserted
  persist(map);
}

export function forgetFloatingBounds(appId: string): void {
  const map = load();
  if (map[appId]) { delete map[appId]; persist(map); }
}

/**
 * True when a rect is "essentially maximized" for the given workspace (within a
 * few px of filling it). We DON'T remember maximized rects as a floating place —
 * a maximized window should reopen maximized via the default path, and remember
 * only genuine floating positions.
 */
export function isMaximizedRect(rect: FloatingRect, ws: { x: number; y: number; w: number; h: number }, tol = 6): boolean {
  return Math.abs(rect.x - ws.x) <= tol
    && Math.abs(rect.y - ws.y) <= tol
    && Math.abs(rect.w - ws.w) <= tol
    && Math.abs(rect.h - ws.h) <= tol;
}

/**
 * A maximized window that was left short at the bottom: it sits at the work
 * area's top-left, spans its full width, and stops up to `bottomSlack` px above
 * its bottom. Older builds reserved a strip above the DEX Bar, and a maximized
 * window sized then (or before the DEX window grew) kept that height, leaving a
 * blank band under every app. Such a rect is treated as maximized.
 */
export function isShortMaximizedRect(
  rect: FloatingRect,
  ws: { x: number; y: number; w: number; h: number },
  bottomSlack = 200,
  tol = 6,
): boolean {
  return Math.abs(rect.x - ws.x) <= tol
    && Math.abs(rect.y - ws.y) <= tol
    && Math.abs(rect.w - ws.w) <= tol
    && rect.h <= ws.h + tol
    && rect.h >= ws.h - bottomSlack;
}
