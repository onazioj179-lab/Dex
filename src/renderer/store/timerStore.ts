// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Shared Timer Store (v6 Track G)
 * ---------------------------------------------------------------------------
 * One source of truth for the Timer, Stopwatch and Pomodoro apps so a running
 * session survives switching away, unmounting, and a full reload.
 *
 * The cardinal rule: NEVER store a ticking counter. Store wall-clock anchors
 * (a `startedAt` epoch ms + accumulated ms) and DERIVE remaining/elapsed from
 * Date.now() on demand. A React interval only drives re-renders — if it dies on
 * unmount the math stays correct, and on reload we recompute from the anchor.
 *
 * Persisted to localStorage on every mutation (guarded), mirroring the manual
 * load/save pattern used by dockPinStore / notesStore rather than the persist
 * middleware, because the timestamp-derived values must be recomputed at read
 * time, not rehydrated as stale snapshots.
 */

import { create } from 'zustand';
import { calendarDayKey } from '../../shared/time/naturalCalendar';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const TIMERS_KEY = 'dex-timers-v1';
const STOPWATCH_KEY = 'dex-stopwatch-v1';
const POMODORO_KEY = 'dex-pomodoro-v1';
const POMODORO_CONFIG_KEY = 'dex-pomodoro-config-v1';
const POMODORO_LOG_KEY = 'dex-pomodoro-log-v1';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (parsed != null) return parsed as T;
    }
  } catch { /* ignore */ }
  return fallback;
}

function saveJSON(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** Fire a DEX toast. Used by all three apps on completion. */
function toast(type: 'success' | 'info' | 'error', message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch { /* ignore (non-DOM env) */ }
}

// ===========================================================================
// TIMERS — multiple named concurrent countdowns
// ===========================================================================

export interface TimerEntry {
  id: string;
  label: string;
  /** Configured duration in ms (drives quick-restart + progress). */
  durationMs: number;
  /** Epoch ms when the current run started; null while paused/idle. */
  startedAt: number | null;
  /** Ms already elapsed before the current run (accumulated across pauses). */
  accumulatedMs: number;
  running: boolean;
  /** Set true once the countdown reaches zero. */
  completed: boolean;
}

/** Live elapsed ms for a timer, derived from wall-clock. */
export function timerElapsed(t: TimerEntry): number {
  const base = t.accumulatedMs;
  if (t.running && t.startedAt != null) return base + (Date.now() - t.startedAt);
  return base;
}

/** Live remaining ms (clamped to >= 0). */
export function timerRemaining(t: TimerEntry): number {
  return Math.max(0, t.durationMs - timerElapsed(t));
}

// ===========================================================================
// STOPWATCH — single counting-up clock with laps
// ===========================================================================

export interface StopwatchState {
  startedAt: number | null;
  accumulatedMs: number;
  running: boolean;
  /** Cumulative lap times (ms from zero), newest first. */
  laps: number[];
}

/** Live elapsed ms for the stopwatch, derived from wall-clock. */
export function stopwatchElapsed(sw: StopwatchState): number {
  if (sw.running && sw.startedAt != null) return sw.accumulatedMs + (Date.now() - sw.startedAt);
  return sw.accumulatedMs;
}

// ===========================================================================
// POMODORO — work/break cycles with config + session log
// ===========================================================================

export type PomoPhase = 'work' | 'shortBreak' | 'longBreak';

export interface PomodoroConfig {
  /** Minutes. */
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  /** Number of work sessions before a long break. */
  longBreakEvery: number;
  /** Automatically start the next phase when one completes. */
  autoStartNext: boolean;
}

export const DEFAULT_POMO_CONFIG: PomodoroConfig = {
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  autoStartNext: false,
};

export interface PomodoroRuntime {
  phase: PomoPhase;
  startedAt: number | null;
  accumulatedMs: number;
  running: boolean;
  /** Completed WORK sessions in the current cycle (drives long-break cadence). */
  completedSessions: number;
}

export interface PomodoroLogEntry {
  phase: PomoPhase;
  /** Epoch ms when this phase completed. */
  at: number;
  /** Duration in minutes. */
  minutes: number;
}

export interface PomodoroLog {
  /** Calendar day the totals below belong to. */
  date: string;
  /** Completed work sessions today. */
  sessions: number;
  /** Total focused minutes today. */
  focusMin: number;
  /** Recent completed phases (capped). */
  entries: PomodoroLogEntry[];
  pastFocusMin?: Record<string, number>;
}

function phaseMinutes(cfg: PomodoroConfig, phase: PomoPhase): number {
  if (phase === 'work') return cfg.workMin;
  if (phase === 'shortBreak') return cfg.shortBreakMin;
  return cfg.longBreakMin;
}

function phaseDurationMs(cfg: PomodoroConfig, phase: PomoPhase): number {
  return Math.max(1, phaseMinutes(cfg, phase)) * 60 * 1000;
}

/** Live remaining ms for the current pomodoro phase. */
export function pomodoroRemaining(rt: PomodoroRuntime, cfg: PomodoroConfig): number {
  const total = phaseDurationMs(cfg, rt.phase);
  const elapsed = rt.running && rt.startedAt != null
    ? rt.accumulatedMs + (Date.now() - rt.startedAt)
    : rt.accumulatedMs;
  return Math.max(0, total - elapsed);
}

const LOG_CAP = 50;

function freshLog(): PomodoroLog {
  return { date: calendarDayKey(new Date()), sessions: 0, focusMin: 0, entries: [] };
}

function pruneFocusDays(days: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.keys(days).sort().slice(-366).map(day => [day, days[day]]));
}

/** Preserve the previous day's focus total when clearing the daily session list. */
function rolloverLog(log: PomodoroLog): PomodoroLog {
  const today = freshLog();
  if (log.date === today.date) return log;
  const pastFocusMin = { ...log.pastFocusMin };
  if (log.focusMin > 0) pastFocusMin[log.date] = log.focusMin;
  today.focusMin = pastFocusMin[today.date] ?? 0;
  delete pastFocusMin[today.date];
  return { ...today, pastFocusMin: pruneFocusDays(pastFocusMin) };
}

export function summarizeFocus(log: PomodoroLog, now = new Date()) {
  const minutesByDay = { ...log.pastFocusMin, [log.date]: log.focusMin };
  const dayAt = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const minutesAt = (offset: number) => minutesByDay[calendarDayKey(dayAt(offset))] || 0;
  const days = Array.from({ length: 7 }, (_, index) => ({ date: dayAt(index - 6), minutes: minutesAt(index - 6) }));
  let streak = 0;
  for (let offset = minutesAt(0) > 0 ? 0 : -1; minutesAt(offset) > 0; offset--) streak++;
  return { days, streak, weekMinutes: days.reduce((sum, day) => sum + day.minutes, 0) };
}

// ===========================================================================
// Store
// ===========================================================================

interface TimerStoreState {
  // --- Timers ---
  timers: TimerEntry[];
  addTimer: (durationMs: number, label?: string) => string;
  removeTimer: (id: string) => void;
  startTimer: (id: string) => void;
  pauseTimer: (id: string) => void;
  resetTimer: (id: string) => void;
  /** Reset to the configured duration AND start again (quick-restart). */
  restartTimer: (id: string) => void;
  renameTimer: (id: string, label: string) => void;
  setTimerDuration: (id: string, durationMs: number) => void;
  /** Reconcile any timers that crossed zero while unmounted; fires toasts. */
  tickTimers: () => void;

  // --- Stopwatch ---
  stopwatch: StopwatchState;
  startStopwatch: () => void;
  stopStopwatch: () => void;
  resetStopwatch: () => void;
  lapStopwatch: () => void;

  // --- Pomodoro ---
  pomodoro: PomodoroRuntime;
  pomodoroConfig: PomodoroConfig;
  pomodoroLog: PomodoroLog;
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resetPomodoro: () => void;
  setPomodoroPhase: (phase: PomoPhase) => void;
  /** Complete the current phase now (skip / natural completion). */
  advancePomodoro: (opts?: { silent?: boolean; skip?: boolean; completedAt?: number }) => void;
  setPomodoroConfig: (patch: Partial<PomodoroConfig>) => void;
  /** Reconcile if the active phase elapsed while unmounted; fires toasts. */
  tickPomodoro: () => void;
}

// --- Initial hydration from localStorage -----------------------------------

const initialTimers: TimerEntry[] = loadJSON<TimerEntry[]>(TIMERS_KEY, []);
const initialStopwatch: StopwatchState = loadJSON<StopwatchState>(STOPWATCH_KEY, {
  startedAt: null, accumulatedMs: 0, running: false, laps: [],
});
const initialPomodoro: PomodoroRuntime = loadJSON<PomodoroRuntime>(POMODORO_KEY, {
  phase: 'work', startedAt: null, accumulatedMs: 0, running: false, completedSessions: 0,
});
const initialConfig: PomodoroConfig = {
  ...DEFAULT_POMO_CONFIG,
  ...loadJSON<Partial<PomodoroConfig>>(POMODORO_CONFIG_KEY, {}),
};
const initialLog: PomodoroLog = rolloverLog(loadJSON<PomodoroLog>(POMODORO_LOG_KEY, freshLog()));

export const useTimerStore = create<TimerStoreState>((set, get) => {
  const persistTimers = (timers: TimerEntry[]) => saveJSON(TIMERS_KEY, timers);
  const persistStopwatch = (sw: StopwatchState) => saveJSON(STOPWATCH_KEY, sw);
  const persistPomodoro = (rt: PomodoroRuntime) => saveJSON(POMODORO_KEY, rt);
  const persistLog = (log: PomodoroLog) => saveJSON(POMODORO_LOG_KEY, log);

  return {
    // =====================================================================
    // Timers
    // =====================================================================
    timers: initialTimers,

    addTimer: (durationMs, label) => {
      const id = genId('timer');
      const entry: TimerEntry = {
        id,
        label: label?.trim() || 'Timer',
        durationMs: Math.max(1000, Math.round(durationMs)),
        startedAt: null,
        accumulatedMs: 0,
        running: false,
        completed: false,
      };
      const timers = [...get().timers, entry];
      persistTimers(timers);
      set({ timers });
      return id;
    },

    removeTimer: (id) => {
      const timers = get().timers.filter(t => t.id !== id);
      persistTimers(timers);
      set({ timers });
    },

    startTimer: (id) => {
      const timers = get().timers.map(t => {
        if (t.id !== id) return t;
        // Don't restart a finished countdown without a reset.
        if (t.completed || timerRemaining(t) <= 0) return t;
        if (t.running) return t;
        return { ...t, running: true, startedAt: Date.now() };
      });
      persistTimers(timers);
      set({ timers });
    },

    pauseTimer: (id) => {
      const timers = get().timers.map(t => {
        if (t.id !== id || !t.running) return t;
        const accumulatedMs = t.accumulatedMs + (t.startedAt != null ? Date.now() - t.startedAt : 0);
        return { ...t, running: false, startedAt: null, accumulatedMs };
      });
      persistTimers(timers);
      set({ timers });
    },

    resetTimer: (id) => {
      const timers = get().timers.map(t =>
        t.id === id ? { ...t, running: false, startedAt: null, accumulatedMs: 0, completed: false } : t,
      );
      persistTimers(timers);
      set({ timers });
    },

    restartTimer: (id) => {
      const timers = get().timers.map(t =>
        t.id === id
          ? { ...t, running: true, startedAt: Date.now(), accumulatedMs: 0, completed: false }
          : t,
      );
      persistTimers(timers);
      set({ timers });
    },

    renameTimer: (id, label) => {
      const timers = get().timers.map(t => t.id === id ? { ...t, label: label.trim() || 'Timer' } : t);
      persistTimers(timers);
      set({ timers });
    },

    setTimerDuration: (id, durationMs) => {
      const dur = Math.max(1000, Math.round(durationMs));
      const timers = get().timers.map(t =>
        t.id === id
          ? { ...t, durationMs: dur, running: false, startedAt: null, accumulatedMs: 0, completed: false }
          : t,
      );
      persistTimers(timers);
      set({ timers });
    },

    tickTimers: () => {
      let changed = false;
      const timers = get().timers.map(t => {
        if (!t.running || t.completed) return t;
        if (timerRemaining(t) <= 0) {
          changed = true;
          toast('success', `Timer "${t.label}" finished`);
          // Freeze at exactly the configured duration.
          return { ...t, running: false, startedAt: null, accumulatedMs: t.durationMs, completed: true };
        }
        return t;
      });
      if (changed) {
        persistTimers(timers);
        set({ timers });
      }
    },

    // =====================================================================
    // Stopwatch
    // =====================================================================
    stopwatch: initialStopwatch,

    startStopwatch: () => {
      const sw = get().stopwatch;
      if (sw.running) return;
      const next: StopwatchState = { ...sw, running: true, startedAt: Date.now() };
      persistStopwatch(next);
      set({ stopwatch: next });
    },

    stopStopwatch: () => {
      const sw = get().stopwatch;
      if (!sw.running) return;
      const accumulatedMs = sw.accumulatedMs + (sw.startedAt != null ? Date.now() - sw.startedAt : 0);
      const next: StopwatchState = { ...sw, running: false, startedAt: null, accumulatedMs };
      persistStopwatch(next);
      set({ stopwatch: next });
    },

    resetStopwatch: () => {
      const next: StopwatchState = { startedAt: null, accumulatedMs: 0, running: false, laps: [] };
      persistStopwatch(next);
      set({ stopwatch: next });
    },

    lapStopwatch: () => {
      const sw = get().stopwatch;
      const next: StopwatchState = { ...sw, laps: [stopwatchElapsed(sw), ...sw.laps] };
      persistStopwatch(next);
      set({ stopwatch: next });
    },

    // =====================================================================
    // Pomodoro
    // =====================================================================
    pomodoro: initialPomodoro,
    pomodoroConfig: initialConfig,
    pomodoroLog: initialLog,

    startPomodoro: () => {
      const rt = get().pomodoro;
      if (rt.running) return;
      const next: PomodoroRuntime = { ...rt, running: true, startedAt: Date.now() };
      persistPomodoro(next);
      set({ pomodoro: next });
    },

    pausePomodoro: () => {
      const rt = get().pomodoro;
      if (!rt.running) return;
      const accumulatedMs = rt.accumulatedMs + (rt.startedAt != null ? Date.now() - rt.startedAt : 0);
      const next: PomodoroRuntime = { ...rt, running: false, startedAt: null, accumulatedMs };
      persistPomodoro(next);
      set({ pomodoro: next });
    },

    resetPomodoro: () => {
      const rt = get().pomodoro;
      const next: PomodoroRuntime = { ...rt, startedAt: null, accumulatedMs: 0, running: false };
      persistPomodoro(next);
      set({ pomodoro: next });
    },

    setPomodoroPhase: (phase) => {
      const next: PomodoroRuntime = {
        ...get().pomodoro, phase, startedAt: null, accumulatedMs: 0, running: false,
      };
      persistPomodoro(next);
      set({ pomodoro: next });
    },

    advancePomodoro: (opts) => {
      const { pomodoro: rt, pomodoroConfig: cfg, pomodoroLog } = get();
      const silent = opts?.silent ?? false;
      const completedPhase = rt.phase;
      const minutes = phaseMinutes(cfg, completedPhase);

      // Log + daily totals (work phases count toward focus minutes).
      let log = rolloverLog(pomodoroLog);
      if (!opts?.skip) {
        const entry: PomodoroLogEntry = { phase: completedPhase, at: opts?.completedAt ?? Date.now(), minutes };
        const entryDay = calendarDayKey(new Date(entry.at));
        if (entryDay === log.date) {
          log = {
            ...log,
            entries: [entry, ...log.entries].slice(0, LOG_CAP),
            sessions: log.sessions + (completedPhase === 'work' ? 1 : 0),
            focusMin: log.focusMin + (completedPhase === 'work' ? minutes : 0),
          };
        } else if (completedPhase === 'work') {
          const pastFocusMin = { ...log.pastFocusMin };
          pastFocusMin[entryDay] = (pastFocusMin[entryDay] ?? 0) + minutes;
          log = { ...log, pastFocusMin: pruneFocusDays(pastFocusMin) };
        }
      }

      // Decide the next phase.
      let nextPhase: PomoPhase;
      let completedSessions = rt.completedSessions;
      if (completedPhase === 'work') {
        if (!opts?.skip) completedSessions += 1;
        const every = Math.max(1, cfg.longBreakEvery);
        nextPhase = !opts?.skip && completedSessions % every === 0 ? 'longBreak' : 'shortBreak';
      } else {
        nextPhase = 'work';
      }

      const autoStart = cfg.autoStartNext;
      const next: PomodoroRuntime = {
        phase: nextPhase,
        completedSessions,
        accumulatedMs: 0,
        running: autoStart,
        startedAt: autoStart ? Date.now() : null,
      };

      persistPomodoro(next);
      persistLog(log);
      set({ pomodoro: next, pomodoroLog: log });

      if (!silent) {
        const label = completedPhase === 'work' ? 'Focus session' : 'Break';
        toast('success', `${label} complete`);
      }
    },

    setPomodoroConfig: (patch) => {
      const cfg: PomodoroConfig = { ...get().pomodoroConfig, ...patch };
      // Clamp to sane bounds.
      cfg.workMin = Math.max(1, Math.min(180, Math.round(cfg.workMin)));
      cfg.shortBreakMin = Math.max(1, Math.min(60, Math.round(cfg.shortBreakMin)));
      cfg.longBreakMin = Math.max(1, Math.min(120, Math.round(cfg.longBreakMin)));
      cfg.longBreakEvery = Math.max(1, Math.min(12, Math.round(cfg.longBreakEvery)));
      saveJSON(POMODORO_CONFIG_KEY, cfg);
      set({ pomodoroConfig: cfg });

      // If idle, reflect a duration change immediately (nothing to recompute
      // mid-run; remaining is derived from the phase duration on read).
      const rt = get().pomodoro;
      if (!rt.running && rt.accumulatedMs === 0) {
        // No stored remaining to reset — derived values pick up the new config.
        persistPomodoro(rt);
      }
    },

    tickPomodoro: () => {
      const { pomodoro: rt, pomodoroConfig: cfg, pomodoroLog } = get();
      // Daily rollover even when idle.
      const rolled = rolloverLog(pomodoroLog);
      if (rolled !== pomodoroLog) {
        persistLog(rolled);
        set({ pomodoroLog: rolled });
      }
      if (!rt.running) return;
      if (pomodoroRemaining(rt, cfg) <= 0) {
        const completedAt = rt.startedAt == null
          ? Date.now() : rt.startedAt + Math.max(0, phaseDurationMs(cfg, rt.phase) - rt.accumulatedMs);
        get().advancePomodoro({ completedAt });
      }
    },
  };
});
