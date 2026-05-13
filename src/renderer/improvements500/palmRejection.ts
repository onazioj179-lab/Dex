// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Palm-rejection filter for stylus-first surfaces. Maintains a short timeline
 * of recent pointer events; flags subsequent touch contacts that overlap in
 * time and proximity with an active pen contact.
 *
 * Pure logic - no DOM coupling. The host wires it to pointerdown/move/up.
 */

export type PointerKind = 'pen' | 'touch' | 'mouse';

export interface PalmEvent {
  id: number;
  kind: PointerKind;
  x: number;
  y: number;
  t: number;
}

export interface PalmRejectionOptions {
  /** Window of time (ms) in which a touch is judged against active pen. */
  windowMs?: number;
  /** Distance threshold (px) inside which a touch is rejected. */
  radiusPx?: number;
  /** Grace period (ms) after pen lifts during which touches still rejected. */
  liftGraceMs?: number;
}

export class PalmRejection {
  private penActive = new Map<number, PalmEvent>();
  private penLastSeen = -Infinity;
  private penLastX = 0;
  private penLastY = 0;
  private readonly windowMs: number;
  private readonly radiusPx: number;
  private readonly liftGraceMs: number;

  constructor(opts: PalmRejectionOptions = {}) {
    this.windowMs = opts.windowMs ?? 250;
    this.radiusPx = opts.radiusPx ?? 120;
    this.liftGraceMs = opts.liftGraceMs ?? 300;
  }

  begin(ev: PalmEvent): boolean {
    if (ev.kind === 'pen') {
      this.penActive.set(ev.id, ev);
      this.penLastSeen = ev.t;
      this.penLastX = ev.x;
      this.penLastY = ev.y;
      return true;
    }
    if (ev.kind === 'mouse') return true;
    // touch
    if (this.penActive.size > 0) return false;
    if (ev.t - this.penLastSeen <= this.liftGraceMs) {
      const dx = ev.x - this.penLastX;
      const dy = ev.y - this.penLastY;
      if (dx * dx + dy * dy <= this.radiusPx * this.radiusPx) return false;
    }
    return true;
  }

  move(ev: PalmEvent): void {
    if (ev.kind === 'pen' && this.penActive.has(ev.id)) {
      this.penActive.set(ev.id, ev);
      this.penLastSeen = ev.t;
      this.penLastX = ev.x;
      this.penLastY = ev.y;
    }
  }

  end(ev: PalmEvent): void {
    if (ev.kind === 'pen') {
      this.penActive.delete(ev.id);
      this.penLastSeen = ev.t;
      this.penLastX = ev.x;
      this.penLastY = ev.y;
    }
  }

  /** Whether the recent timing/position would currently reject a touch at (x,y,t). */
  wouldReject(x: number, y: number, t: number): boolean {
    if (this.penActive.size > 0) return true;
    if (t - this.penLastSeen > this.liftGraceMs) return false;
    const dx = x - this.penLastX;
    const dy = y - this.penLastY;
    return dx * dx + dy * dy <= this.radiusPx * this.radiusPx;
  }

  reset(): void {
    this.penActive.clear();
    this.penLastSeen = -Infinity;
  }
  // window is configured via constructor; surface for tests
  get _windowMs(): number { return this.windowMs; }
}
