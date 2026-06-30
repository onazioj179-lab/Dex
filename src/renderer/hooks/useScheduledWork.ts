// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * useScheduledInterval — drop-in replacement for a background `setInterval` that
 * routes the work through the FrameScheduler. The interval only ENQUEUES the
 * work; the scheduler decides when to actually run it within the per-tier frame
 * budget, so dozens of apps + UKI polling at once never jank the UI. Tagging the
 * task with `appId` lets the scheduler skip it entirely while the app is
 * suspended (off-screen / idle).
 */

import { useEffect, useRef } from 'react';
import { frameScheduler, type TaskPriority } from '../services/FrameScheduler';

export interface ScheduledIntervalOptions {
  priority?: TaskPriority;
  /** Owning app id — its tasks are skipped while the app is suspended. */
  appId?: string;
  /** When false, the interval is paused entirely. Default true. */
  enabled?: boolean;
}

export function useScheduledInterval(
  work: () => void,
  intervalMs: number,
  opts: ScheduledIntervalOptions = {},
): void {
  const workRef = useRef(work);
  workRef.current = work;
  const { priority = 'normal', appId, enabled = true } = opts;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      frameScheduler.schedule(() => workRef.current(), { priority, appId });
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs, priority, appId, enabled]);
}

export default useScheduledInterval;
