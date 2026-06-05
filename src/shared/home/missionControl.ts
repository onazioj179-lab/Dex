// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Home → Mission Control (HOM-001…). The Home page should open on the user's
 * *work*, not a static launchpad: active projects, unfinished tasks, and a
 * "pick up where you left off" rail. This pure module turns a list of work
 * items into those surfaces — what's resumable, what's gone stale, grouped by
 * app, with human resume labels. Pure; the clock is injected.
 */

export interface WorkItem {
  id: string;
  title: string;
  appId: string;
  /** Last touched, epoch ms. */
  updatedTs: number;
  /** 0..1 completion; omit if unknown. */
  progress?: number;
  done?: boolean;
}

export interface ContinueOptions {
  limit?: number;
  now?: number;
}

/** Unfinished items, most-recently touched first (the "continue" rail). */
export function continueWorking(items: readonly WorkItem[], opts: ContinueOptions = {}): WorkItem[] {
  const limit = Math.max(0, Math.floor(opts.limit ?? 5));
  const active = items
    .filter((i) => !i.done)
    .sort((a, b) => b.updatedTs - a.updatedTs || a.id.localeCompare(b.id));
  return limit > 0 ? active.slice(0, limit) : active;
}

/** Unfinished items untouched for longer than `thresholdMs`, most-stale first. */
export function staleItems(items: readonly WorkItem[], now: number, thresholdMs: number): WorkItem[] {
  return items
    .filter((i) => !i.done && now - i.updatedTs > thresholdMs)
    .sort((a, b) => a.updatedTs - b.updatedTs);
}

export interface AppBucket {
  appId: string;
  items: WorkItem[];
}

/** Group items by app; buckets and their items ordered by recency. */
export function groupByApp(items: readonly WorkItem[]): AppBucket[] {
  const byApp = new Map<string, WorkItem[]>();
  for (const i of items) {
    const arr = byApp.get(i.appId);
    if (arr) arr.push(i);
    else byApp.set(i.appId, [i]);
  }
  const buckets: AppBucket[] = [];
  for (const [appId, list] of byApp) {
    buckets.push({ appId, items: [...list].sort((a, b) => b.updatedTs - a.updatedTs) });
  }
  return buckets.sort((a, b) => b.items[0].updatedTs - a.items[0].updatedTs);
}

/** Coarse, human relative-time: "just now", "5m ago", "2h ago", "3d ago". */
export function relativeTime(ageMs: number): string {
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  return `${w}w ago`;
}

/** "Continue "Trailer cut" in vinx · 2h ago" — a resume CTA label. */
export function resumeLabel(item: WorkItem, now: number): string {
  return `Continue "${item.title}" in ${item.appId} · ${relativeTime(now - item.updatedTs)}`;
}
