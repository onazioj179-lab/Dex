// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Idle / away detection (T4-039 presence, T7-009 vault-on-idle).
 *
 * Tracks last activity timestamp; emits state transitions ACTIVE -> IDLE
 * after `idleAfterMs`, and IDLE -> AWAY after `awayAfterMs`. Reset on any
 * pointer/keyboard/touch input.
 */

export type IdleState = 'active' | 'idle' | 'away';

export interface IdleOptions {
  idleAfterMs: number; // e.g. 60_000
  awayAfterMs: number; // e.g. 5 * 60_000
  onChange: (state: IdleState) => void;
}

export class IdleDetector {
  private state: IdleState = 'active';
  private lastActivity = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listener = () => this.poke();

  constructor(private readonly opts: IdleOptions) {}

  start(): void {
    if (typeof window === 'undefined') return;
    for (const ev of ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'wheel']) {
      window.addEventListener(ev, this.listener, { passive: true });
    }
    this.timer = setInterval(() => this.tick(), 5_000);
  }

  stop(): void {
    if (typeof window === 'undefined') return;
    for (const ev of ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'wheel']) {
      window.removeEventListener(ev, this.listener);
    }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  poke(now: number = Date.now()): void {
    this.lastActivity = now;
    this.transition('active');
  }

  /** Test-friendly tick. */
  tick(now: number = Date.now()): void {
    const delta = now - this.lastActivity;
    if (delta >= this.opts.awayAfterMs) this.transition('away');
    else if (delta >= this.opts.idleAfterMs) this.transition('idle');
    else this.transition('active');
  }

  getState(): IdleState { return this.state; }

  private transition(next: IdleState): void {
    if (next === this.state) return;
    this.state = next;
    this.opts.onChange(next);
  }
}
