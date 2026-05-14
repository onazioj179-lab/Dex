// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEX -- Focus Session System
 * ===========================================================================
 *
 * Enhanced focus mode with automatic activation, DND, session tracking,
 * goal setting, per-app behaviors, and intelligence layer integration.
 *
 * - Single button start, no configuration required
 * - Remembers last session length
 * - Hides dock, header, sidebar in focus mode
 * - Escape or cursor near top edge reveals exit
 * - DND activates automatically
 * - Per-app focus behaviors (Notes: centered 680px, Vinx: full preview)
 * - Session summary with apps used and tasks completed
 * - Integrates with Rewind journal
 * ===========================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocusSessionRecord {
  id: string;
  startTime: number;
  endTime: number | null;
  durationMs: number;
  goal: string;
  completed: boolean;
  appsUsed: string[];
  tasksCompleted: string[];
  notesCreated: string[];
}

export type FocusAppMode = 'default' | 'notes' | 'vinx';

/** Per-app behaviour overrides applied while a focus session is active. */
export interface AppFocusProfile {
  /** Hide window chrome (title bar, controls) for maximum canvas space. */
  hideChrome: boolean;
  /** Suppress all non-urgent notifications while this app is in focus. */
  muteNotifications: boolean;
  /** Dim the background/desktop to direct attention to this app. */
  dimBackground: boolean;
}

interface FocusSessionState {
  active: boolean;
  paused: boolean;
  sessionId: string | null;
  startTime: number | null;
  durationMinutes: number;
  goal: string;
  elapsed: number;
  dndActive: boolean;
  currentAppId: string | null;
  currentAppMode: FocusAppMode;
  showExitHint: boolean;
  sessions: FocusSessionRecord[];
  appsUsedThisSession: Set<string>;
  /** Per-app focus profiles keyed by appId. Missing entries use defaults. */
  appFocusProfiles: Record<string, AppFocusProfile>;
  tasksCompletedThisSession: string[];
  notesCreatedThisSession: string[];

  startSession: (goal?: string) => void;
  endSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  setDuration: (minutes: number) => void;
  setGoal: (goal: string) => void;
  setCurrentApp: (appId: string | null) => void;
  setShowExitHint: (show: boolean) => void;
  recordAppUsed: (appId: string) => void;
  recordTaskCompleted: (taskId: string) => void;
  recordNoteCreated: (noteId: string) => void;
  tick: () => void;
  getSessionSummary: () => FocusSessionRecord | null;
  getRecentSessions: (count: number) => FocusSessionRecord[];
  setAppFocusProfile: (appId: string, profile: Partial<AppFocusProfile>) => void;
  getAppFocusProfile: (appId: string) => AppFocusProfile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  return `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getAppFocusMode(appId: string | null): FocusAppMode {
  if (!appId) return 'default';
  const lower = appId.toLowerCase();
  if (lower.includes('notes') || lower.includes('dexcode')) return 'notes';
  if (lower.includes('vinx') || lower.includes('video')) return 'vinx';
  return 'default';
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFocusSessionStore = create<FocusSessionState>()(
  persist(
    (set, get) => ({
      active: false,
      paused: false,
      sessionId: null,
      startTime: null,
      durationMinutes: 25,
      goal: '',
      elapsed: 0,
      dndActive: false,
      currentAppId: null,
      currentAppMode: 'default',
      showExitHint: false,
      sessions: [],
      appsUsedThisSession: new Set(),
      appFocusProfiles: {},
      tasksCompletedThisSession: [],
      notesCreatedThisSession: [],

      startSession: (goal) => {
        const id = generateSessionId();
        set({
          active: true,
          paused: false,
          sessionId: id,
          startTime: Date.now(),
          goal: goal || '',
          elapsed: 0,
          dndActive: true,
          showExitHint: false,
          appsUsedThisSession: new Set(),
          tasksCompletedThisSession: [],
          notesCreatedThisSession: [],
        });
        // Notify main process to activate DND
        try {
          (window as any).electron?.ipcRenderer?.invoke('focus:start', {
            sessionId: id,
            durationMinutes: get().durationMinutes,
          });
        } catch { /* silent */ }
      },

      endSession: () => {
        const state = get();
        if (!state.active || !state.sessionId) return;

        const record: FocusSessionRecord = {
          id: state.sessionId,
          startTime: state.startTime || Date.now(),
          endTime: Date.now(),
          durationMs: state.elapsed * 1000,
          goal: state.goal,
          completed: state.elapsed >= state.durationMinutes * 60,
          appsUsed: Array.from(state.appsUsedThisSession),
          tasksCompleted: state.tasksCompletedThisSession,
          notesCreated: state.notesCreatedThisSession,
        };

        set(prev => ({
          active: false,
          paused: false,
          sessionId: null,
          startTime: null,
          goal: '',
          elapsed: 0,
          dndActive: false,
          showExitHint: false,
          sessions: [...prev.sessions.slice(-99), record],
          appsUsedThisSession: new Set(),
          tasksCompletedThisSession: [],
          notesCreatedThisSession: [],
        }));

        // Notify main process
        try {
          (window as any).electron?.ipcRenderer?.invoke('focus:end', { record });
        } catch { /* silent */ }
      },

      pauseSession: () => set({ paused: true }),
      resumeSession: () => set({ paused: false }),

      setDuration: (minutes) => set({ durationMinutes: Math.max(1, Math.min(240, minutes)) }),
      setGoal: (goal) => set({ goal }),

      setCurrentApp: (appId) => {
        const mode = getAppFocusMode(appId);
        set({ currentAppId: appId, currentAppMode: mode });
        if (appId && get().active) {
          get().recordAppUsed(appId);
        }
      },

      setShowExitHint: (show) => set({ showExitHint: show }),

      recordAppUsed: (appId) => set(state => {
        const next = new Set(state.appsUsedThisSession);
        next.add(appId);
        return { appsUsedThisSession: next };
      }),

      recordTaskCompleted: (taskId) => set(state => ({
        tasksCompletedThisSession: [...state.tasksCompletedThisSession, taskId],
      })),

      recordNoteCreated: (noteId) => set(state => ({
        notesCreatedThisSession: [...state.notesCreatedThisSession, noteId],
      })),

      tick: () => set(state => {
        if (!state.active || state.paused) return state;
        const newElapsed = state.elapsed + 1;
        if (newElapsed >= state.durationMinutes * 60) {
          // Session complete -- will be ended by the timer UI
          return { elapsed: newElapsed };
        }
        return { elapsed: newElapsed };
      }),

      getSessionSummary: () => {
        const state = get();
        if (!state.sessions.length) return null;
        return state.sessions[state.sessions.length - 1];
      },

      getRecentSessions: (count) => {
        return get().sessions.slice(-count).reverse();
      },

      setAppFocusProfile: (appId, profile) => {
        set((state) => {
          const existing: AppFocusProfile = state.appFocusProfiles[appId] ?? {
            hideChrome: false,
            muteNotifications: true,
            dimBackground: false,
          };
          return {
            appFocusProfiles: {
              ...state.appFocusProfiles,
              [appId]: { ...existing, ...profile },
            },
          };
        });
      },

      getAppFocusProfile: (appId) => {
        const profiles = get().appFocusProfiles;
        return profiles[appId] ?? {
          hideChrome: false,
          muteNotifications: true,
          dimBackground: false,
        };
      },
    }),
    {
      name: 'dex-focus-sessions',
      partialize: (state) => ({
        durationMinutes: state.durationMinutes,
        sessions: state.sessions.slice(-50),
        appFocusProfiles: state.appFocusProfiles,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Focus Mode CSS Classes (applied to shell container)
// ---------------------------------------------------------------------------

export const FOCUS_MODE_STYLES = {
  shell: {
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  shellFocused: {
    // Dock, header, sidebar hidden via parent conditional rendering
  },
  exitHint: {
    position: 'fixed' as const,
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 99999,
    padding: '6px 16px',
    borderRadius: '0 0 8px 8px',
    background: 'rgba(0,0,0,0.85)',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'opacity 0.2s, transform 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    position: 'fixed' as const,
    bottom: 0,
    left: 0,
    height: 1,
    background: 'var(--accent-primary, #007aff)',
    transition: 'width 1s linear',
    zIndex: 99998,
  },
  notesFocused: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '40px 20px',
  },
} as const;

// ---------------------------------------------------------------------------
// Timer Hook
// ---------------------------------------------------------------------------

let timerInterval: ReturnType<typeof setInterval> | null = null;

export function startFocusTimer(): void {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    useFocusSessionStore.getState().tick();
  }, 1000);
}

export function stopFocusTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
