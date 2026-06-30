// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AppLifecycle — per-app phase broadcaster (renderer singleton).
 *
 * DEX keeps every launched app mounted (keep-alive) so switching is instant. To
 * stay cheap, heavy apps still need to *release* work when they are not on
 * screen — without unmounting. This service is the message bus for that: it
 * tracks one of three phases per app and notifies opt-in subscribers on change.
 *
 *   foreground — visible / current. Run the rAF loop, audio, full work.
 *   background — mounted + warm but not visible. Pause the rAF loop / playback;
 *                keep GPU contexts and buffers so switch-back is instant.
 *   suspended  — mounted but asked to release GPU/audio/large buffers + cancel
 *                timers (deep background or extended idle / memory pressure).
 *
 * Policy (who is foreground vs. background vs. suspended) lives in AppManager,
 * which already computes per-app visibility; this service is a dumb, testable
 * store + pub/sub. Apps opt in via `useAppLifecycle` — non-adopting apps see
 * zero behavior change.
 */

export type AppPhase = 'foreground' | 'background' | 'suspended';

export interface AppLifecycleHandlers {
  /** App became visible/current. Re-acquire GL, resume rAF/audio. */
  onForeground?: () => void;
  /** App hidden but warm. Pause rAF/playback, keep buffers. */
  onBackground?: () => void;
  /** Release GPU/audio/large buffers, cancel timers. */
  onSuspend?: () => void;
  /** Inverse of suspend — re-allocate lazily after a suspend. */
  onResume?: () => void;
}

export type AppPhaseListener = (phase: AppPhase, prev: AppPhase) => void;

class AppLifecycleService {
  private phases = new Map<string, AppPhase>();
  private listeners = new Map<string, Set<AppPhaseListener>>();

  /** Current phase for an app (defaults to 'background' before first set). */
  getPhase(appId: string): AppPhase {
    return this.phases.get(appId) ?? 'background';
  }

  /** Set an app's phase; notifies subscribers only on a real change. */
  setPhase(appId: string, phase: AppPhase): void {
    const prev = this.getPhase(appId);
    if (prev === phase) return;
    this.phases.set(appId, phase);
    const set = this.listeners.get(appId);
    if (!set) return;
    set.forEach((l) => {
      try {
        l(phase, prev);
      } catch (err) {
        // A misbehaving handler must not break the broadcast.
        // eslint-disable-next-line no-console
        console.warn(`[AppLifecycle] listener for "${appId}" threw`, err);
      }
    });
  }

  /** Subscribe to phase changes for an app. Returns an unsubscribe fn. */
  subscribe(appId: string, listener: AppPhaseListener): () => void {
    let set = this.listeners.get(appId);
    if (!set) {
      set = new Set();
      this.listeners.set(appId, set);
    }
    set.add(listener);
    return () => {
      const s = this.listeners.get(appId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this.listeners.delete(appId);
    };
  }

  /** Test/debug helper — current snapshot of all known phases. */
  snapshot(): Record<string, AppPhase> {
    return Object.fromEntries(this.phases);
  }
}

export const appLifecycle = new AppLifecycleService();

/**
 * Map a phase transition onto the opt-in handlers. Centralized so the hook and
 * any other consumer share identical semantics:
 *   - entering suspended      -> onSuspend
 *   - leaving suspended       -> onResume (then foreground handler if visible)
 *   - foreground -> background -> onBackground
 *   - * -> foreground          -> onForeground
 */
export function applyPhaseTransition(
  prev: AppPhase,
  next: AppPhase,
  h: AppLifecycleHandlers,
): void {
  if (next === 'suspended') {
    h.onSuspend?.();
    return;
  }
  if (prev === 'suspended') h.onResume?.();
  if (next === 'foreground') h.onForeground?.();
  else if (next === 'background' && prev === 'foreground') h.onBackground?.();
}
