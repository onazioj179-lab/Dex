// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Generic single-pointer gesture recognizer. Classifies a stream of pointer
 * samples (begin / move / end) into tap, double-tap, long-press, swipe, or
 * cancel. Pure logic; no DOM listeners. Coordinate units are CSS pixels.
 */

export type GestureKind =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'swipe'
  | 'cancel';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface GestureResult {
  kind: GestureKind;
  x: number;
  y: number;
  durationMs: number;
  direction?: SwipeDirection;
  distance?: number;
}

export interface GestureOptions {
  tapMaxMovePx?: number;
  tapMaxDurationMs?: number;
  longPressMs?: number;
  doubleTapMaxGapMs?: number;
  swipeMinDistancePx?: number;
}

interface ActiveSample {
  x0: number;
  y0: number;
  t0: number;
  lastX: number;
  lastY: number;
  lastT: number;
  cancelled: boolean;
}

export class GestureRecognizer {
  private active: ActiveSample | null = null;
  private lastTapTs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  private readonly tapMove: number;
  private readonly tapDur: number;
  private readonly longPress: number;
  private readonly dblGap: number;
  private readonly swipeMin: number;

  constructor(opts: GestureOptions = {}) {
    this.tapMove = opts.tapMaxMovePx ?? 8;
    this.tapDur = opts.tapMaxDurationMs ?? 300;
    this.longPress = opts.longPressMs ?? 500;
    this.dblGap = opts.doubleTapMaxGapMs ?? 350;
    this.swipeMin = opts.swipeMinDistancePx ?? 32;
  }

  begin(x: number, y: number, t: number): void {
    this.active = { x0: x, y0: y, t0: t, lastX: x, lastY: y, lastT: t, cancelled: false };
  }

  move(x: number, y: number, t: number): void {
    if (!this.active) return;
    this.active.lastX = x;
    this.active.lastY = y;
    this.active.lastT = t;
  }

  cancel(): void {
    if (this.active) this.active.cancelled = true;
  }

  end(x: number, y: number, t: number): GestureResult | null {
    const a = this.active;
    if (!a) return null;
    this.active = null;
    if (a.cancelled) {
      return { kind: 'cancel', x, y, durationMs: t - a.t0 };
    }
    const dx = x - a.x0;
    const dy = y - a.y0;
    const dist = Math.hypot(dx, dy);
    const dur = t - a.t0;

    if (dist >= this.swipeMin) {
      const direction: SwipeDirection = Math.abs(dx) >= Math.abs(dy)
        ? (dx >= 0 ? 'right' : 'left')
        : (dy >= 0 ? 'down' : 'up');
      return { kind: 'swipe', x, y, durationMs: dur, direction, distance: dist };
    }
    if (dist <= this.tapMove && dur >= this.longPress) {
      return { kind: 'longPress', x, y, durationMs: dur };
    }
    if (dist <= this.tapMove && dur <= this.tapDur) {
      const gap = a.t0 - this.lastTapTs;
      const sameSpot = Math.hypot(x - this.lastTapX, y - this.lastTapY) <= this.tapMove * 2;
      if (gap <= this.dblGap && sameSpot) {
        this.lastTapTs = -Infinity;
        return { kind: 'doubleTap', x, y, durationMs: dur };
      }
      this.lastTapTs = t;
      this.lastTapX = x;
      this.lastTapY = y;
      return { kind: 'tap', x, y, durationMs: dur };
    }
    return { kind: 'cancel', x, y, durationMs: dur };
  }

  reset(): void {
    this.active = null;
    this.lastTapTs = -Infinity;
  }
}
