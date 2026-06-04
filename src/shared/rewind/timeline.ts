// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rewind — memory timeline reconstruction.
 * -----------------------------------------------------------------------------
 * Rewind is evolving from a flat event log into a true memory timeline: the
 * user should be able to reconstruct whole work sessions ("yesterday afternoon
 * I was editing the trailer in VINX"). This pure module groups a stream of
 * activity events into sessions by idle gaps, and summarises each session so
 * the Rewind UI can render a scannable timeline. No DOM, no IO.
 */

export interface ActivityEvent {
  /** Epoch ms. */
  ts: number;
  /** App the activity happened in. */
  appId: string;
  /** Activity kind: 'open' | 'edit' | 'save' | 'focus' | 'browse' | … */
  kind: string;
  /** Optional human label (file name, page title, note title…). */
  label?: string;
}

export interface TimelineSession {
  id: string;
  startTs: number;
  endTs: number;
  /** Distinct apps used, most-active first. */
  appIds: string[];
  /** The single most-active app — the session's "home". */
  primaryAppId: string;
  eventCount: number;
  /** Human one-liner for the timeline row. */
  label: string;
}

/** Idle gap (ms) that splits one session from the next. Default 30 minutes. */
export const DEFAULT_SESSION_GAP_MS = 30 * 60 * 1000;

function primaryApp(events: ActivityEvent[]): { primary: string; ordered: string[] } {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.appId, (counts.get(e.appId) ?? 0) + 1);
  const ordered = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
  return { primary: ordered[0] ?? 'unknown', ordered };
}

/** Build sessions from a (possibly unsorted) event stream. */
export function buildTimeline(events: readonly ActivityEvent[], gapMs: number = DEFAULT_SESSION_GAP_MS): TimelineSession[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const groups: ActivityEvent[][] = [];
  let current: ActivityEvent[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const e = sorted[i];
    if (e.ts - prev.ts > gapMs) {
      groups.push(current);
      current = [e];
    } else {
      current.push(e);
    }
  }
  groups.push(current);

  return groups.map((group) => {
    const { primary, ordered } = primaryApp(group);
    const startTs = group[0].ts;
    const endTs = group[group.length - 1].ts;
    return {
      id: `session_${startTs.toString(36)}`,
      startTs,
      endTs,
      appIds: ordered,
      primaryAppId: primary,
      eventCount: group.length,
      label: summarize(primary, ordered.length, group.length),
    };
  });
}

function summarize(primary: string, appCount: number, eventCount: number): string {
  const others = appCount > 1 ? ` +${appCount - 1} app${appCount - 1 > 1 ? 's' : ''}` : '';
  return `${primary} session${others} — ${eventCount} event${eventCount === 1 ? '' : 's'}`;
}

/** Duration of a session in ms. */
export function sessionDuration(s: TimelineSession): number {
  return Math.max(0, s.endTs - s.startTs);
}
