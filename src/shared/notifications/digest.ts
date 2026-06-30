// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Notification group digest (SHL-052/060 — the "summary" leg of the
 * notification redesign). `group.ts` produces the grouped/priority model and
 * `center.ts` the presentation; this distils a single source group into a short,
 * HONEST one-line summary the Notification Center shows above a collapsed group
 * ("5 notifications, 2 urgent — latest 3m ago").
 *
 * Deliberately deterministic and on-device: it counts and surfaces what is
 * actually present rather than fabricating a natural-language gloss from a model
 * that may not be available. A provider-backed prose summary can layer on top of
 * `headline`/`counts` later, but the digest must always degrade to real numbers.
 *
 * Pure: no DOM, no IO, no clock of its own — `now` is injected so callers (and
 * tests) stay deterministic.
 */

import type { NotificationPriority } from './group';

/** Minimal shape a digest needs — a structural subset of NotificationRecord. */
export interface DigestItem {
  priority: NotificationPriority;
  ts: number;
  read?: boolean;
}

export interface GroupDigest {
  total: number;
  unread: number;
  urgent: number;
  high: number;
  /** Timestamp of the most recent item (0 when the group is empty). */
  latestTs: number;
  /** "5 notifications, 2 urgent" — counts only, never empty for >=1 item. */
  headline: string;
  /** "5 notifications, 2 urgent — 3m ago" when `now` is supplied; else === headline. */
  text: string;
}

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  urgent: 3, high: 2, normal: 1, low: 0,
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Short relative-time label for the digest tail. Coarser than a full formatter
 * on purpose (a digest only needs "now / 3m / 2h / 4d / a date") and pure so it
 * can be unit-tested with an injected `now`.
 */
export function relativeShort(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Summarise a source group into counts + a one-line headline. When `now` is
 * given, `text` gains a "— <relative>" tail off the latest item; otherwise
 * `text` equals `headline`. Counts the highest-severity band present so the
 * headline leads with what matters (urgent before high).
 */
export function summarizeGroup(items: readonly DigestItem[], now?: number): GroupDigest {
  let unread = 0;
  let urgent = 0;
  let high = 0;
  let latestTs = 0;
  for (const it of items) {
    if (!it.read) unread += 1;
    if (it.priority === 'urgent') urgent += 1;
    else if (it.priority === 'high') high += 1;
    if (it.ts > latestTs) latestTs = it.ts;
  }
  const total = items.length;

  const parts: string[] = [plural(total, 'notification')];
  // Lead the severity tag with the strongest band actually present.
  if (urgent > 0) parts.push(`${urgent} urgent`);
  else if (high > 0) parts.push(`${high} important`);
  else if (unread > 0 && unread < total) parts.push(`${unread} unread`);

  const headline = parts.join(', ');
  const text = now !== undefined && latestTs > 0
    ? `${headline} — ${relativeShort(latestTs, now)}`
    : headline;

  return { total, unread, urgent, high, latestTs, headline, text };
}

/** Convenience: the strongest priority present in a group (for accenting). */
export function topPriority(items: readonly DigestItem[]): NotificationPriority {
  let best: NotificationPriority = 'low';
  for (const it of items) {
    if (PRIORITY_RANK[it.priority] > PRIORITY_RANK[best]) best = it.priority;
  }
  return best;
}
