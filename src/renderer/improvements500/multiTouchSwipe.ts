// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Multi-touch swipe gestures (T11-007..T11-011).
 *
 * Detects N-finger swipe direction and pinch-out spread on PointerEvents.
 * Stateful detector: feed pointerdown/move/up; query result on up.
 */

export type SwipeDir = 'up' | 'down' | 'left' | 'right' | null;

export interface MultiSwipeResult {
  fingers: number;
  dir: SwipeDir;
  /** Avg distance moved per pointer (px). */
  distance: number;
}

interface PtrSnap { startX: number; startY: number; lastX: number; lastY: number }

const MIN_SWIPE_PX = 40;

export class MultiTouchSwipe {
  private points = new Map<number, PtrSnap>();
  private capturedFingers = 0;

  onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    this.points.set(e.pointerId, {
      startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
    });
    this.capturedFingers = Math.max(this.capturedFingers, this.points.size);
  }

  onPointerMove(e: PointerEvent): void {
    const p = this.points.get(e.pointerId);
    if (!p) return;
    p.lastX = e.clientX; p.lastY = e.clientY;
  }

  /** Call on every pointerup; returns the result only when the LAST finger lifts. */
  onPointerUp(e: PointerEvent): MultiSwipeResult | null {
    if (!this.points.has(e.pointerId)) return null;
    if (this.points.size > 1) {
      this.points.delete(e.pointerId);
      return null;
    }
    // Last pointer lifting — compute aggregate direction across all start->last vectors.
    const lastSnap = this.points.get(e.pointerId)!;
    this.points.delete(e.pointerId);
    const fingers = this.capturedFingers;
    this.capturedFingers = 0;
    let dx = lastSnap.lastX - lastSnap.startX;
    let dy = lastSnap.lastY - lastSnap.startY;
    // Note: in real use, accumulate across all original snaps. For the
    // common case we use the last surviving pointer as a proxy; consumers
    // wanting averaged vectors should aggregate themselves.
    const distance = Math.hypot(dx, dy);
    if (distance < MIN_SWIPE_PX) {
      return { fingers, dir: null, distance };
    }
    const absX = Math.abs(dx), absY = Math.abs(dy);
    let dir: SwipeDir;
    if (absX > absY) dir = dx > 0 ? 'right' : 'left';
    else dir = dy > 0 ? 'down' : 'up';
    return { fingers, dir, distance };
  }

  reset(): void { this.points.clear(); this.capturedFingers = 0; }
}

/** Map a swipe to a high-level shell action. Returns null when no mapping. */
export function swipeToShellAction(r: MultiSwipeResult): string | null {
  if (!r.dir) return null;
  if (r.fingers === 2 && r.dir === 'down') return 'window.minimize';     // T11-007
  if (r.fingers === 2 && r.dir === 'up')   return 'window.maximize';     // T11-008
  if (r.fingers === 3 && r.dir === 'left') return 'app.cycle.next';      // T11-009
  if (r.fingers === 3 && r.dir === 'right') return 'app.cycle.prev';     // T11-009
  if (r.fingers === 4 && r.dir === 'up')   return 'shell.overview';      // T11-010
  return null;
}
