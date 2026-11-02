// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * LIVE ACTIVITY -- id-based helpers for long operations (downloads, encodes,
 * transfers). They write to the one system-wide store (store/liveActivityStore),
 * so every long task shows in the same place (LiveActivityHost) instead of a
 * second, Home-only list.
 */
import { useLiveActivityStore } from '../store/liveActivityStore';

export type ActivityType = 'download' | 'encode' | 'transfer' | 'task' | 'sync' | 'build';

export interface LiveActivity {
  id: string;
  type: ActivityType;
  label: string;
  /** 0-100, or -1 for indeterminate */
  progress: number;
  app: string;
  startedAt: number;
  /** Set when complete */
  completedAt?: number;
}

const ICON: Record<ActivityType, string> = {
  download: 'download', encode: 'video', transfer: 'repeat', task: 'check-square', sync: 'refresh', build: 'zap',
};

const toFraction = (progress: number): number | null => (progress < 0 ? null : Math.max(0, Math.min(1, progress / 100)));

/** Start (or refresh) an activity. `cancel` adds a Cancel button when the task supports it. */
export function dispatchActivity(act: Omit<LiveActivity, 'startedAt'> & { cancel?: () => void }) {
  useLiveActivityStore.getState().upsert(act.id, {
    title: act.label,
    icon: ICON[act.type] ?? 'refresh',
    badge: act.type.toUpperCase(),
    progress: toFraction(act.progress),
    cancel: act.cancel,
  });
}

export function updateActivity(id: string, progress: number, label?: string) {
  useLiveActivityStore.getState().update(id, { progress: toFraction(progress), ...(label ? { title: label } : {}) });
}

export function completeActivity(id: string, failed = false) {
  useLiveActivityStore.getState().complete(id, { status: failed ? 'error' : 'success' });
}
