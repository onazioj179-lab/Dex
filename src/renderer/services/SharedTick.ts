// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// SharedTick — Single interval that replaces 100+ independent setIntervals
// Subscribe/unsubscribe pattern. Keeps continuity work alive at a reduced
// cadence when the window is hidden instead of fully pausing all subscribers.
// Enhanced: per-subscriber pause, fireImmediately, window blur/focus,
//           getStats(), fireNow(), overdue catch-up on window focus.
// ===========================================================================

type TickCallback = (now: number) => void;

interface TickSubscription {
  callback: TickCallback;
  intervalMs: number;
  lastFired: number;
  /** Individual pause flag — does not affect other subscribers */
  paused: boolean;
  /** Total number of times this subscriber has fired */
  fireCount: number;
}

export interface TickStats {
  subscriberCount: number;
  globallyPaused: boolean;
  windowFocused: boolean;
  subscribers: Array<{
    id: string;
    intervalMs: number;
    lastFired: number;
    fireCount: number;
    paused: boolean;
  }>;
}

interface SubscribeOptions {
  /** If true, fires the callback immediately on subscribe (before any tick) */
  fireImmediately?: boolean;
}

class SharedTickService {
  private subscribers = new Map<string, TickSubscription>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private readonly TICK_MS = 1000; // 1s base tick
  private readonly HIDDEN_MIN_INTERVAL_MS = 30_000;
  private manualPause = false;
  private windowFocused = true;
  private documentHidden = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.documentHidden = document.hidden;
        this.paused = this.manualPause;
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => {
        this.windowFocused = false;
      });
      window.addEventListener('focus', () => {
        this.windowFocused = true;
        // Fire any overdue subscribers so they catch up immediately
        this.firOverdue();
      });
    }
  }

  /**
   * Manually pause all tick subscribers (e.g. when the LockScreen is shown).
   */
  pause(): void {
    this.manualPause = true;
    this.paused = true;
  }

  /**
   * Resume after a manual pause.
   */
  resume(): void {
    this.manualPause = false;
    this.paused = false;
  }

  /**
   * Subscribe to the shared tick.
   * @param id Unique subscriber ID
   * @param callback Called on each matching tick
   * @param intervalMs How often (ms) this subscriber fires. Must be >= 1000.
   * @param options Optional subscription settings
   */
  subscribe(id: string, callback: TickCallback, intervalMs = 1000, options: SubscribeOptions = {}): void {
    const now = Date.now();
    this.subscribers.set(id, {
      callback,
      intervalMs: Math.max(1000, intervalMs),
      lastFired: options.fireImmediately ? 0 : now,
      paused: false,
      fireCount: 0,
    });
    if (options.fireImmediately) {
      try { callback(now); } catch (err) {
        console.warn(`[SharedTick] Subscriber '${id}' threw on immediate fire:`, err);
      }
      this.subscribers.get(id)!.lastFired = now;
      this.subscribers.get(id)!.fireCount = 1;
    }
    this.ensureRunning();
  }

  unsubscribe(id: string): void {
    this.subscribers.delete(id);
    if (this.subscribers.size === 0) {
      this.stop();
    }
  }

  /** Pause a single subscriber without affecting others */
  pauseSubscriber(id: string): void {
    const sub = this.subscribers.get(id);
    if (sub) sub.paused = true;
  }

  /** Resume a previously paused subscriber */
  resumeSubscriber(id: string): void {
    const sub = this.subscribers.get(id);
    if (sub) sub.paused = false;
  }

  /** Immediately fire a subscriber's callback outside the normal tick cycle */
  fireNow(id: string): void {
    const sub = this.subscribers.get(id);
    if (!sub) return;
    const now = Date.now();
    sub.lastFired = now;
    sub.fireCount++;
    try { sub.callback(now); } catch (err) {
      console.warn(`[SharedTick] Subscriber '${id}' threw on fireNow:`, err);
    }
  }

  /** Return diagnostic stats for all current subscribers */
  getStats(): TickStats {
    return {
      subscriberCount: this.subscribers.size,
      globallyPaused: this.paused,
      windowFocused: this.windowFocused,
      subscribers: Array.from(this.subscribers.entries()).map(([id, sub]) => ({
        id,
        intervalMs: sub.intervalMs,
        lastFired: sub.lastFired,
        fireCount: sub.fireCount,
        paused: sub.paused,
      })),
    };
  }

  private ensureRunning(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.TICK_MS);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (this.paused) return;
    const now = Date.now();
    for (const [id, sub] of this.subscribers) {
      if (sub.paused) continue;
      const intervalMs = this.documentHidden
        ? Math.max(sub.intervalMs, this.HIDDEN_MIN_INTERVAL_MS)
        : sub.intervalMs;
      if (now - sub.lastFired >= intervalMs) {
        sub.lastFired = now;
        sub.fireCount++;
        try { sub.callback(now); } catch (err) {
          console.warn(`[SharedTick] Subscriber '${id}' threw:`, err);
        }
      }
    }
  }

  /** Fire any subscribers that are overdue (called on window focus) */
  private firOverdue(): void {
    if (this.paused) return;
    const now = Date.now();
    for (const [id, sub] of this.subscribers) {
      if (sub.paused) continue;
      const intervalMs = this.documentHidden
        ? Math.max(sub.intervalMs, this.HIDDEN_MIN_INTERVAL_MS)
        : sub.intervalMs;
      if (now - sub.lastFired >= intervalMs) {
        sub.lastFired = now;
        sub.fireCount++;
        try { sub.callback(now); } catch (err) {
          console.warn(`[SharedTick] Subscriber '${id}' threw on focus catch-up:`, err);
        }
      }
    }
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  /** Stop the tick and clear all subscribers. Call on window unload / HMR cleanup. */
  destroy(): void {
    this.stop();
    this.subscribers.clear();
  }
}

export const sharedTick = new SharedTickService();

// HMR hot-reload cleanup (Vite)
if (import.meta.hot) {
  import.meta.hot.dispose(() => sharedTick.destroy());
}
