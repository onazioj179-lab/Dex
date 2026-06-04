// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Relative date bucketing (Files/Rewind/Nexus list grouping). Classifies a
 * timestamp relative to "now" into Today / Yesterday / This Week / This Month /
 * Older, using local calendar boundaries. Pure: no DOM, no IO (injectable now).
 */

export type DateBucket = 'today' | 'yesterday' | 'this-week' | 'this-month' | 'older';

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Classify `ts` relative to `now` (both epoch ms). Future → 'today'. */
export function bucketDate(ts: number, now: number = Date.now()): DateBucket {
  const nowDate = new Date(now);
  const todayStart = startOfDay(nowDate);
  const tsStart = startOfDay(new Date(ts));

  if (tsStart >= todayStart) return 'today';
  if (tsStart >= todayStart - DAY_MS) return 'yesterday';

  // Start of the local week (Sunday).
  const weekStart = todayStart - nowDate.getDay() * DAY_MS;
  if (tsStart >= weekStart) return 'this-week';

  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  if (ts >= monthStart) return 'this-month';

  return 'older';
}

export const BUCKET_LABELS: Record<DateBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'This Week',
  'this-month': 'This Month',
  older: 'Older',
};

/** Group items by date bucket, preserving order, in display order. */
export function groupByDateBucket<T>(
  items: readonly T[],
  getTs: (item: T) => number,
  now: number = Date.now(),
): Array<{ bucket: DateBucket; label: string; items: T[] }> {
  const order: DateBucket[] = ['today', 'yesterday', 'this-week', 'this-month', 'older'];
  const map = new Map<DateBucket, T[]>();
  for (const item of items) {
    const b = bucketDate(getTs(item), now);
    (map.get(b) ?? map.set(b, []).get(b)!).push(item);
  }
  return order
    .filter((b) => map.has(b))
    .map((bucket) => ({ bucket, label: BUCKET_LABELS[bucket], items: map.get(bucket)! }));
}
