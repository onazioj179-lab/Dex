// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// Idle Continuity
// Keeps Dex visually persistent during inactivity while slowing background work.
// ===========================================================================

import { sharedTick } from './SharedTick';

export type IdleContinuityState = 'active' | 'low-power-active' | 'extended-idle';
export type AppContinuityClass = 'active' | 'semi-active' | 'inactive';

export const BACKGROUND_REFRESH_INTERVALS = {
  active: 0,
  semiActive: 15 * 60_000,
  inactive: 30 * 60_000,
} as const;

interface IdleContinuitySnapshot {
  state: IdleContinuityState;
  lastActivityAt: number;
  idleForMs: number;
  foregroundAppId: string;
}

interface AppActivity {
  lastActiveAt: number;
  lastRefreshAt: number;
}

const ACTIVE_IDLE_THRESHOLD_MS = 60_000;
const EXTENDED_IDLE_THRESHOLD_MS = 5 * 60_000;
const ACTIVE_APP_WINDOW_MS = 2 * 60_000;
const SEMI_ACTIVE_APP_WINDOW_MS = 30 * 60_000;

class IdleContinuityService {
  private initialized = false;
  private state: IdleContinuityState = 'active';
  private lastActivityAt = Date.now();
  private lastPointerActivityAt = 0;
  private foregroundAppId = 'home';
  private appActivity = new Map<string, AppActivity>([
    ['home', { lastActiveAt: Date.now(), lastRefreshAt: Date.now() }],
  ]);

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    this.applyRootState();

    const record = (event?: Event) => {
      if (event?.type === 'pointermove') {
        const now = Date.now();
        if (now - this.lastPointerActivityAt < 1000) return;
        this.lastPointerActivityAt = now;
      }
      this.recordActivity();
    };
    const inputEvents = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart', 'focus'];
    for (const eventName of inputEvents) {
      window.addEventListener(eventName, record, { passive: true, capture: true });
    }

    sharedTick.subscribe('idle-continuity', () => this.evaluate(), 30_000, { fireImmediately: true });

    window.addEventListener('beforeunload', () => {
      sharedTick.unsubscribe('idle-continuity');
      for (const eventName of inputEvents) {
        window.removeEventListener(eventName, record, { capture: true } as AddEventListenerOptions);
      }
    }, { once: true });
  }

  getSnapshot(): IdleContinuitySnapshot {
    const now = Date.now();
    return {
      state: this.state,
      lastActivityAt: this.lastActivityAt,
      idleForMs: now - this.lastActivityAt,
      foregroundAppId: this.foregroundAppId,
    };
  }

  recordActivity(appId = this.foregroundAppId): void {
    const now = Date.now();
    this.lastActivityAt = now;
    this.markAppActive(appId, now);
    if (this.state !== 'active') {
      this.setState('active');
      window.dispatchEvent(new CustomEvent('dex-continuity-resume', { detail: this.getSnapshot() }));
    } else {
      this.applyRootState();
    }
  }

  setForegroundApp(appId: string): void {
    this.foregroundAppId = appId || 'home';
    this.recordActivity(this.foregroundAppId);
  }

  markAppActive(appId: string, at = Date.now()): void {
    const current = this.appActivity.get(appId);
    this.appActivity.set(appId, {
      lastActiveAt: at,
      lastRefreshAt: current?.lastRefreshAt ?? at,
    });
  }

  getAppClass(appId: string): AppContinuityClass {
    if (appId === this.foregroundAppId) return 'active';
    const now = Date.now();
    const activity = this.appActivity.get(appId);
    const age = now - (activity?.lastActiveAt ?? 0);
    if (age <= ACTIVE_APP_WINDOW_MS) return 'semi-active';
    if (age <= SEMI_ACTIVE_APP_WINDOW_MS) return 'semi-active';
    return 'inactive';
  }

  getRefreshInterval(appId: string): number {
    const appClass = this.getAppClass(appId);
    if (appClass === 'active') return BACKGROUND_REFRESH_INTERVALS.active;
    return appClass === 'semi-active'
      ? BACKGROUND_REFRESH_INTERVALS.semiActive
      : BACKGROUND_REFRESH_INTERVALS.inactive;
  }

  private evaluate(): void {
    const now = Date.now();
    const idleForMs = now - this.lastActivityAt;
    if (idleForMs >= EXTENDED_IDLE_THRESHOLD_MS) this.setState('extended-idle');
    else if (idleForMs >= ACTIVE_IDLE_THRESHOLD_MS) this.setState('low-power-active');
    else this.setState('active');
    this.fireDueBackgroundRefreshes(now);
  }

  private fireDueBackgroundRefreshes(now: number): void {
    for (const [appId, activity] of this.appActivity) {
      if (appId === this.foregroundAppId) continue;
      const interval = this.getRefreshInterval(appId);
      if (interval > 0 && now - activity.lastRefreshAt >= interval) {
        activity.lastRefreshAt = now;
        window.dispatchEvent(new CustomEvent('dex-app-background-refresh', {
          detail: { appId, intervalMs: interval, continuityClass: this.getAppClass(appId) },
        }));
      }
    }
  }

  private setState(next: IdleContinuityState): void {
    if (this.state === next) {
      this.applyRootState();
      return;
    }
    const previous = this.state;
    this.state = next;
    this.applyRootState();
    window.dispatchEvent(new CustomEvent('dex-idle-continuity-change', {
      detail: { previous, current: next, snapshot: this.getSnapshot() },
    }));
  }

  private applyRootState(): void {
    const root = document.documentElement;
    root.setAttribute('data-dex-idle-state', this.state);
    root.setAttribute('data-dex-session-persistent', 'true');
    root.classList.toggle('dex-low-power-active', this.state !== 'active');
  }
}

export const idleContinuity = new IdleContinuityService();

export function initIdleContinuity(): void {
  idleContinuity.init();
}
