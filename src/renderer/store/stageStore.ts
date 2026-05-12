// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Stage Store
 * -----------------------------------------------------------------------------
 * A "Stage" is a named workspace context that captures: the set of running app
 * windows, dock pin overrides, active wallpaper accent, focus posture, and the
 * last focused window. Switching stages is the unit of context-switching in
 * DEX -- inspired by macOS Stage Manager + Linux virtual desktops, but
 * persistence-first and crash-recoverable.
 *
 * Non-goals: this store does NOT own window geometry or app process state --
 * those live in WindowManager / runningApps. Stages reference them by id.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';
import { ContextBus } from '../services/ContextBus';

export type StagePosture = 'work' | 'edit' | 'focus' | 'music' | 'play' | 'custom';

export interface StageWindowRef {
  /** App id from runningApps. */
  appId: string;
  /** Window id (FloatingWindow.id) -- optional for single-window apps. */
  windowId?: string;
  /** Last known z-order, lower = behind. */
  z?: number;
  /** Last known minimized state at the time the stage was captured. */
  minimized?: boolean;
}

export interface Stage {
  id: string;
  name: string;
  posture: StagePosture;
  /** Windows that belong to this stage. */
  windows: StageWindowRef[];
  /** Optional dock pin overrides for this stage (app ids). Falls back to global pins. */
  dockOverrides?: string[];
  /** Wallpaper accent override (hex) -- null lets the wallpaper drive accent. */
  accent?: string | null;
  /** Wallpaper id override. */
  wallpaperId?: string | null;
  /** App id of the last focused window when the stage was active. */
  focusedAppId?: string;
  /** Do-not-disturb default for this stage. */
  dnd?: boolean;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
}

interface StageState {
  stages: Stage[];
  activeStageId: string;
  /** Stage ids in MRU order, most recent first (max 12). */
  history: string[];

  // Mutations -------------------------------------------------------------
  createStage: (input: Partial<Omit<Stage, 'id' | 'createdAt' | 'updatedAt' | 'lastActiveAt'>>) => string;
  renameStage: (id: string, name: string) => void;
  deleteStage: (id: string) => void;
  setActiveStage: (id: string) => void;
  /** Replace the windows snapshot of a stage (called by WindowManager on debounce). */
  captureWindows: (id: string, windows: StageWindowRef[], focusedAppId?: string) => void;
  setPosture: (id: string, posture: StagePosture) => void;
  setAccent: (id: string, accent: string | null) => void;
  setWallpaper: (id: string, wallpaperId: string | null) => void;
  setDnd: (id: string, dnd: boolean) => void;
  setDockOverrides: (id: string, appIds: string[] | undefined) => void;

  // Selectors -------------------------------------------------------------
  getStage: (id: string) => Stage | undefined;
  getActiveStage: () => Stage | undefined;
}

const DEFAULT_STAGE_ID = 'stage-default';
const MAX_STAGES = 12;
const MAX_HISTORY = 12;

const DEFAULT_STAGE: Stage = {
  id: DEFAULT_STAGE_ID,
  name: 'Workspace',
  posture: 'work',
  windows: [],
  accent: null,
  wallpaperId: null,
  dnd: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  lastActiveAt: Date.now(),
};

const newId = (): string =>
  `stage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const pushMru = (history: string[], id: string): string[] => {
  const filtered = history.filter((x) => x !== id);
  return [id, ...filtered].slice(0, MAX_HISTORY);
};

export const useStageStore = create<StageState>()(
  persist(
    (set, get) => ({
      stages: [DEFAULT_STAGE],
      activeStageId: DEFAULT_STAGE_ID,
      history: [DEFAULT_STAGE_ID],

      createStage: (input) => {
        const stages = get().stages;
        if (stages.length >= MAX_STAGES) return stages[0].id;
        const id = newId();
        const now = Date.now();
        const stage: Stage = {
          id,
          name: input.name?.trim() || `Stage ${stages.length + 1}`,
          posture: input.posture ?? 'custom',
          windows: input.windows ?? [],
          dockOverrides: input.dockOverrides,
          accent: input.accent ?? null,
          wallpaperId: input.wallpaperId ?? null,
          focusedAppId: input.focusedAppId,
          dnd: input.dnd ?? false,
          createdAt: now,
          updatedAt: now,
          lastActiveAt: now,
        };
        set({ stages: [...stages, stage] });
        return id;
      },

      renameStage: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set({
          stages: get().stages.map((s) =>
            s.id === id ? { ...s, name: trimmed, updatedAt: Date.now() } : s
          ),
        });
      },

      deleteStage: (id) => {
        if (id === DEFAULT_STAGE_ID) return;
        const next = get().stages.filter((s) => s.id !== id);
        const history = get().history.filter((x) => x !== id);
        const activeStageId =
          get().activeStageId === id ? (history[0] ?? DEFAULT_STAGE_ID) : get().activeStageId;
        set({ stages: next, history, activeStageId });
      },

      setActiveStage: (id) => {
        const stage = get().stages.find((s) => s.id === id);
        if (!stage) return;
        const previous = get().activeStageId;
        if (previous === id) return;
        const now = Date.now();
        set({
          activeStageId: id,
          history: pushMru(get().history, id),
          stages: get().stages.map((s) =>
            s.id === id ? { ...s, lastActiveAt: now } : s
          ),
        });
        try {
          ContextBus.emit('continuity:stage', { stageId: id, previousStageId: previous });
        } catch { /* bus errors are non-fatal */ }
      },

      captureWindows: (id, windows, focusedAppId) => {
        set({
          stages: get().stages.map((s) =>
            s.id === id
              ? { ...s, windows, focusedAppId, updatedAt: Date.now() }
              : s
          ),
        });
      },

      setPosture: (id, posture) => {
        set({
          stages: get().stages.map((s) =>
            s.id === id ? { ...s, posture, updatedAt: Date.now() } : s
          ),
        });
      },

      setAccent: (id, accent) => {
        set({
          stages: get().stages.map((s) =>
            s.id === id ? { ...s, accent, updatedAt: Date.now() } : s
          ),
        });
      },

      setWallpaper: (id, wallpaperId) => {
        set({
          stages: get().stages.map((s) =>
            s.id === id ? { ...s, wallpaperId, updatedAt: Date.now() } : s
          ),
        });
      },

      setDnd: (id, dnd) => {
        set({
          stages: get().stages.map((s) =>
            s.id === id ? { ...s, dnd, updatedAt: Date.now() } : s
          ),
        });
      },

      setDockOverrides: (id, dockOverrides) => {
        set({
          stages: get().stages.map((s) =>
            s.id === id ? { ...s, dockOverrides, updatedAt: Date.now() } : s
          ),
        });
      },

      getStage: (id) => get().stages.find((s) => s.id === id),
      getActiveStage: () => {
        const id = get().activeStageId;
        return get().stages.find((s) => s.id === id);
      },
    }),
    {
      name: 'dex-stage-store',
      storage: debouncedJsonStorage,
      version: 1,
    }
  )
);

export const STAGE_DEFAULT_ID = DEFAULT_STAGE_ID;
