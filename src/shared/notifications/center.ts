// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Notification Center view-model (SHL-052/060). `group.ts` is the priority /
 * grouping / coalescing *policy*; this is the *presentation* layer the (today
 * unwired) Notification Center needs: how many banners to show vs. collapse into
 * "+N more", unread accounting, read/unread partitioning, and Do-Not-Disturb
 * filtering. Pure — builds entirely on group.ts. No DOM, no state.
 */

import {
  type NotificationRecord,
  type NotificationPriority,
  type NotificationGroup,
  sortByPriority,
  groupBySource,
} from './group';

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  urgent: 3, high: 2, normal: 1, low: 0,
};

function toIdSet(ids: ReadonlySet<string> | readonly string[] | undefined): ReadonlySet<string> {
  if (!ids) return new Set();
  return ids instanceof Set ? ids : new Set(ids);
}

export interface VisibleSelection {
  /** The banners actually shown (priority/recency order), capped at `max`. */
  visible: NotificationRecord[];
  /** How many are collapsed beyond the cap. */
  overflow: number;
  /** "+3 more" (or '' when nothing is hidden). */
  overflowLabel: string;
}

/** Pick the top `max` notifications to show; the rest become an overflow count. */
export function selectVisible(items: readonly NotificationRecord[], max = 3): VisibleSelection {
  const sorted = sortByPriority(items);
  const cap = Math.max(0, Math.floor(max));
  const visible = sorted.slice(0, cap);
  const overflow = Math.max(0, sorted.length - cap);
  return { visible, overflow, overflowLabel: overflow > 0 ? `+${overflow} more` : '' };
}

/** Count unread (id not in `readIds`). */
export function unreadCount(
  items: readonly NotificationRecord[],
  readIds?: ReadonlySet<string> | readonly string[],
): number {
  const read = toIdSet(readIds);
  return items.reduce((n, it) => (read.has(it.id) ? n : n + 1), 0);
}

export interface ReadPartition {
  unread: NotificationRecord[];
  read: NotificationRecord[];
}

/** Split into unread / read, each priority/recency ordered. */
export function partitionByRead(
  items: readonly NotificationRecord[],
  readIds?: ReadonlySet<string> | readonly string[],
): ReadPartition {
  const read = toIdSet(readIds);
  const unread: NotificationRecord[] = [];
  const readList: NotificationRecord[] = [];
  for (const it of items) (read.has(it.id) ? readList : unread).push(it);
  return { unread: sortByPriority(unread), read: sortByPriority(readList) };
}

export interface DndOptions {
  enabled: boolean;
  /** Lowest priority allowed through while DND is on. Default 'urgent'. */
  allowAtLeast?: NotificationPriority;
}

/** While Do-Not-Disturb is on, suppress anything below `allowAtLeast`. */
export function applyDnd(items: readonly NotificationRecord[], dnd: DndOptions): NotificationRecord[] {
  if (!dnd.enabled) return [...items];
  const floor = PRIORITY_RANK[dnd.allowAtLeast ?? 'urgent'];
  return items.filter((it) => PRIORITY_RANK[it.priority] >= floor);
}

export interface CenterModel {
  /** Grouped-by-source for the expanded Center list. */
  groups: NotificationGroup[];
  /** Banners to surface now (post-DND), capped. */
  visible: NotificationRecord[];
  overflow: number;
  overflowLabel: string;
  unread: number;
  total: number;
}

export interface CenterOptions {
  readIds?: ReadonlySet<string> | readonly string[];
  maxVisible?: number;
  dnd?: DndOptions;
}

/**
 * One call that assembles everything the Notification Center renders: DND is
 * applied first, then visible/overflow selection, source grouping, and unread
 * accounting (unread is computed on the post-DND set so the badge matches what
 * the user can actually see).
 */
export function buildCenterModel(items: readonly NotificationRecord[], opts: CenterOptions = {}): CenterModel {
  const afterDnd = applyDnd(items, opts.dnd ?? { enabled: false });
  const { visible, overflow, overflowLabel } = selectVisible(afterDnd, opts.maxVisible ?? 3);
  return {
    groups: groupBySource(afterDnd),
    visible,
    overflow,
    overflowLabel,
    unread: unreadCount(afterDnd, opts.readIds),
    total: afterDnd.length,
  };
}
