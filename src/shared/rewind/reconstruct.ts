// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rewind workspace reconstruction (RWD-013/016, data layer). Given a session's
 * activity events, derive what to reopen to "pick up where I left off": the apps
 * that were active (most-used first) and the distinct files/pages touched. The
 * Rewind UI turns this into a one-click restore via WorkspaceSnapshot.
 *
 * Pure: no DOM, no IO. Builds on the same `ActivityEvent` / `TimelineSession`
 * shapes as `timeline.ts`.
 */

import type { ActivityEvent, TimelineSession } from './timeline';

export interface ReconstructedWorkspace {
  primaryAppId: string;
  /** Apps used in the session, most-active first. */
  appIds: string[];
  /** Distinct file/page labels touched, most-recent first. */
  files: string[];
}

/** Event kinds that reference an openable artifact carried in `label`. */
const ARTIFACT_KINDS = new Set(['file', 'open', 'edit', 'save', 'browse']);

/** Slice the events belonging to a session (inclusive of its bounds). */
export function eventsForSession(
  allEvents: readonly ActivityEvent[],
  session: TimelineSession,
): ActivityEvent[] {
  return allEvents.filter((e) => e.ts >= session.startTs && e.ts <= session.endTs);
}

/** Reconstruct the workspace (apps + artifacts) from a session's events. */
export function reconstructWorkspace(events: readonly ActivityEvent[]): ReconstructedWorkspace {
  // App activity counts → ordering.
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.appId, (counts.get(e.appId) ?? 0) + 1);
  const appIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);

  // Distinct artifacts, most-recent first, de-duplicated by label.
  const seen = new Set<string>();
  const files: string[] = [];
  for (const e of [...events].sort((a, b) => b.ts - a.ts)) {
    if (!e.label || !ARTIFACT_KINDS.has(e.kind)) continue;
    if (seen.has(e.label)) continue;
    seen.add(e.label);
    files.push(e.label);
  }

  return { primaryAppId: appIds[0] ?? 'unknown', appIds, files };
}
