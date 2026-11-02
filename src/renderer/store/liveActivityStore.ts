// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Live Activities
 * -----------------------------------------------------------------------------
 * A small, system-wide registry of in-progress tasks (file copy/move/share,
 * creative export, long jobs) rendered as a premium glass progress card by
 * `components/LiveActivityHost`. One vocabulary so every long operation reports
 * progress the same way -- never a bespoke per-app spinner.
 *
 * Apply with judgment: push an activity ONLY for genuinely long, user-initiated
 * operations. Quick actions should use a toast, not a live activity.
 */

import { create } from 'zustand';

export type LiveActivityStatus = 'active' | 'success' | 'error';

export interface LiveActivity {
  id: string;
  /** Primary line, e.g. "Project Docs Folder" or "Copying to Documents". */
  title: string;
  /** Secondary line, e.g. "80 MB" or "3 of 5 files". */
  subtitle?: string;
  /** DexIcon glyph name shown in the leading tile (default 'files'). */
  icon?: string;
  /** Short uppercase source badge over the icon, e.g. "FILES". */
  badge?: string;
  /** 0..1 determinate progress, or null for an indeterminate spinner. */
  progress: number | null;
  status: LiveActivityStatus;
  createdAt: number;
  /** Present when the task can be cancelled; the card shows a Cancel button. */
  cancel?: () => void;
}

interface LiveActivityState {
  activities: LiveActivity[];
  /** Begin an activity; returns its id for later update/complete. */
  start: (input: {
    title: string;
    subtitle?: string;
    icon?: string;
    badge?: string;
    progress?: number | null;
    cancel?: () => void;
  }) => string;
  /** Start an activity under a caller-chosen id, or refresh it if it exists. */
  upsert: (id: string, input: {
    title: string;
    subtitle?: string;
    icon?: string;
    badge?: string;
    progress?: number | null;
    cancel?: () => void;
  }) => void;
  /** Patch an in-flight activity (progress, subtitle, title). */
  update: (id: string, patch: Partial<Omit<LiveActivity, 'id' | 'createdAt'>>) => void;
  /** Mark finished (success fills the bar) and auto-dismiss after a short hold. */
  complete: (
    id: string,
    patch?: { status?: LiveActivityStatus; title?: string; subtitle?: string },
  ) => void;
  /** Remove immediately (the card's close button). */
  dismiss: (id: string) => void;
}

let seq = 0;
const nextId = (): string => `la-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const HOLD_MS = 2600; // how long a finished card lingers before auto-dismiss

export const useLiveActivityStore = create<LiveActivityState>((set, get) => ({
  activities: [],

  start: (input) => {
    const id = nextId();
    const activity: LiveActivity = {
      id,
      title: input.title,
      subtitle: input.subtitle,
      icon: input.icon ?? 'files',
      badge: input.badge,
      progress: input.progress ?? null,
      status: 'active',
      createdAt: Date.now(),
      cancel: input.cancel,
    };
    set((s) => ({ activities: [...s.activities, activity] }));
    return id;
  },

  upsert: (id, input) => {
    set((s) => {
      const existing = s.activities.find((a) => a.id === id);
      if (existing) {
        return { activities: s.activities.map((a) => (a.id === id ? { ...a, ...input, status: 'active' as const, progress: input.progress ?? a.progress } : a)) };
      }
      return {
        activities: [...s.activities, {
          id,
          title: input.title,
          subtitle: input.subtitle,
          icon: input.icon ?? 'files',
          badge: input.badge,
          progress: input.progress ?? null,
          status: 'active' as const,
          createdAt: Date.now(),
          cancel: input.cancel,
        }],
      };
    });
  },

  update: (id, patch) => {
    set((s) => ({
      activities: s.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  },

  complete: (id, patch) => {
    const status = patch?.status ?? 'success';
    set((s) => ({
      activities: s.activities.map((a) =>
        a.id === id
          ? {
              ...a,
              status,
              title: patch?.title ?? a.title,
              subtitle: patch?.subtitle ?? a.subtitle,
              progress: status === 'success' ? 1 : a.progress,
              cancel: undefined,
            }
          : a,
      ),
    }));
    // Auto-dismiss after a short hold so the user sees the final state.
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        // Only dismiss if it is still in a finished state (not restarted).
        const still = get().activities.find((a) => a.id === id);
        if (still && still.status !== 'active') get().dismiss(id);
      }, HOLD_MS);
    }
  },

  dismiss: (id) => {
    set((s) => ({ activities: s.activities.filter((a) => a.id !== id) }));
  },
}));

export default useLiveActivityStore;
