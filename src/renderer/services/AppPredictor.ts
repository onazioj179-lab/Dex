// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// App Predictor (Track A1: autonomous pre-warming)
// ---------------------------------------------------------------------------
// Builds a first-order Markov transition table over recent app launches and
// uses it to predict the next-likely apps. The renderer pre-imports the top
// candidates during idle so their first-paint is warm by the time the user
// opens them.
// ===========================================================================

const STORAGE_KEY = 'dex-app-predictor-v1';
const MAX_HISTORY = 200;

export interface AppEvent {
  appId: string;
  ts: number;
}

interface PredictorState {
  history: AppEvent[];
  /** transitions[from][to] -> count */
  transitions: Record<string, Record<string, number>>;
}

export interface PredictorPrediction {
  appId: string;
  /** Conditional probability P(next=appId | last=fromAppId). */
  probability: number;
  /** Raw count for reference. */
  count: number;
}

const EMPTY_STATE: PredictorState = { history: [], transitions: {} };

export class AppPredictor {
  private state: PredictorState = clone(EMPTY_STATE);
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private dirty = false;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.storage = storage === undefined
      ? (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null)
      : storage;
    this.load();
  }

  /** Record an app launch / focus event. */
  record(appId: string, now: number = Date.now()): void {
    if (!appId) return;
    const last = this.state.history[this.state.history.length - 1];
    this.state.history.push({ appId, ts: now });
    if (this.state.history.length > MAX_HISTORY) {
      this.state.history.splice(0, this.state.history.length - MAX_HISTORY);
    }
    if (last && last.appId !== appId) {
      const row = this.state.transitions[last.appId] ??= {};
      row[appId] = (row[appId] ?? 0) + 1;
    }
    this.dirty = true;
    this.flush();
  }

  /** Predict the top-N most likely next apps after `fromAppId`. */
  predict(fromAppId: string, limit = 3): PredictorPrediction[] {
    const row = this.state.transitions[fromAppId];
    if (!row) return [];
    const total = Object.values(row).reduce((s, n) => s + n, 0);
    if (total === 0) return [];
    return Object.entries(row)
      .map(([appId, count]) => ({ appId, count, probability: count / total }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, limit);
  }

  /** True if the predictor has at least `minObservations` transitions for `fromAppId`. */
  hasSignal(fromAppId: string, minObservations = 2): boolean {
    const row = this.state.transitions[fromAppId];
    if (!row) return false;
    const total = Object.values(row).reduce((s, n) => s + n, 0);
    return total >= minObservations;
  }

  /** Number of transitions recorded (for diagnostics). */
  get observationCount(): number {
    let total = 0;
    for (const row of Object.values(this.state.transitions)) {
      for (const n of Object.values(row)) total += n;
    }
    return total;
  }

  /** Clear all learned state. Use sparingly. */
  reset(): void {
    this.state = clone(EMPTY_STATE);
    this.dirty = true;
    this.flush();
  }

  // ---- Internals --------------------------------------------------------

  private load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PredictorState;
      if (parsed && Array.isArray(parsed.history) && parsed.transitions && typeof parsed.transitions === 'object') {
        this.state = {
          history: parsed.history.filter(e => e && typeof e.appId === 'string').slice(-MAX_HISTORY),
          transitions: parsed.transitions,
        };
      }
    } catch { /* ignore */ }
  }

  private flush(): void {
    if (!this.dirty || !this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.dirty = false;
    } catch { /* quota / unavailable */ }
  }
}

// ---------------------------------------------------------------------------
// Idle pre-warm helper
// ---------------------------------------------------------------------------

export interface IdlePrewarmOptions {
  /** Resolves a renderer-side dynamic import for an appId. */
  importer: (appId: string) => Promise<unknown> | unknown;
  /** Maximum apps to pre-warm per idle slot. Default 2. */
  topN?: number;
  /** Probability floor below which a candidate is skipped. Default 0.2. */
  minProbability?: number;
}

const prewarmedThisSession = new Set<string>();

/**
 * Schedule a pre-warm pass. Uses requestIdleCallback when available, falls
 * back to setTimeout(0) otherwise. Idempotent per appId per session.
 */
export function schedulePrewarm(
  predictor: AppPredictor,
  fromAppId: string,
  opts: IdlePrewarmOptions,
): void {
  const topN = opts.topN ?? 2;
  const minP = opts.minProbability ?? 0.2;
  const candidates = predictor.predict(fromAppId, topN).filter(c => c.probability >= minP);
  if (candidates.length === 0) return;

  const run = (): void => {
    for (const c of candidates) {
      if (prewarmedThisSession.has(c.appId)) continue;
      prewarmedThisSession.add(c.appId);
      try {
        const result = opts.importer(c.appId);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).catch(() => prewarmedThisSession.delete(c.appId));
        }
      } catch {
        prewarmedThisSession.delete(c.appId);
      }
    }
  };

  const w = typeof window !== 'undefined' ? (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  }) : null;

  if (w?.requestIdleCallback) {
    w.requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 0);
  }
}

/** Test helper. */
export function _resetPrewarmCache(): void {
  prewarmedThisSession.clear();
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _singleton: AppPredictor | null = null;

export function getAppPredictor(): AppPredictor {
  if (!_singleton) _singleton = new AppPredictor();
  return _singleton;
}

export function _resetAppPredictorSingleton(): void {
  _singleton = null;
}
