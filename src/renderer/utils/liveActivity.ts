// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * LIVE ACTIVITY -- Real-time activity feed for Home screen
 * Apps dispatch events; Home renders inline cards that auto-dismiss on complete.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export type ActivityType = 'download' | 'encode' | 'transfer' | 'task' | 'sync' | 'build';

export interface LiveActivity {
  id: string;
  type: ActivityType;
  label: string;
  /** 0-100, or -1 for indeterminate */
  progress: number;
  app: string;
  startedAt: number;
  /** Set when complete -- triggers fade-out after 3s */
  completedAt?: number;
}

// -- Dispatch helpers -- call from any app ---------------------------------
export function dispatchActivity(act: Omit<LiveActivity, 'startedAt'>) {
  window.dispatchEvent(new CustomEvent('dex-activity-start', { detail: { ...act, startedAt: Date.now() } }));
}

export function updateActivity(id: string, progress: number, label?: string) {
  window.dispatchEvent(new CustomEvent('dex-activity-progress', { detail: { id, progress, label } }));
}

export function completeActivity(id: string) {
  window.dispatchEvent(new CustomEvent('dex-activity-complete', { detail: { id } }));
}

// -- Hook -- consumed by Home ----------------------------------------------
export function useLiveActivity() {
  const [activities, setActivities] = useState<Map<string, LiveActivity>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const cleanup = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setActivities(prev => { const m = new Map(prev); m.delete(id); return m; });
  }, []);

  useEffect(() => {
    const onStart = (e: Event) => {
      const act = (e as CustomEvent).detail as LiveActivity;
      setActivities(prev => new Map(prev).set(act.id, act));
    };

    const onProgress = (e: Event) => {
      const { id, progress, label } = (e as CustomEvent).detail;
      setActivities(prev => {
        const m = new Map(prev);
        const existing = m.get(id);
        if (existing) m.set(id, { ...existing, progress, ...(label ? { label } : {}) });
        return m;
      });
    };

    const onComplete = (e: Event) => {
      const { id } = (e as CustomEvent).detail;
      setActivities(prev => {
        const m = new Map(prev);
        const existing = m.get(id);
        if (existing) m.set(id, { ...existing, progress: 100, completedAt: Date.now() });
        return m;
      });
      // Auto-remove after 3s
      timers.current.set(id, setTimeout(() => cleanup(id), 3000));
    };

    window.addEventListener('dex-activity-start', onStart);
    window.addEventListener('dex-activity-progress', onProgress);
    window.addEventListener('dex-activity-complete', onComplete);
    return () => {
      window.removeEventListener('dex-activity-start', onStart);
      window.removeEventListener('dex-activity-progress', onProgress);
      window.removeEventListener('dex-activity-complete', onComplete);
      timers.current.forEach(t => clearTimeout(t));
    };
  }, [cleanup]);

  return { activities: Array.from(activities.values()), cleanup };
}
