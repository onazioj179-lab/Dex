// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pointer velocity tracker for fling/momentum gestures.
 * Used by VINX scrub-fling, AXL canvas pan inertia, and notification
 * dismissal flick.
 */

interface Sample { x: number; y: number; t: number; }

export class VelocityTracker {
  private samples: Sample[] = [];
  /** Window in ms over which to measure velocity. */
  constructor(private readonly windowMs = 100) {}

  add(x: number, y: number, t: number = performance.now()): void {
    this.samples.push({ x, y, t });
    const cutoff = t - this.windowMs * 4;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) this.samples.shift();
  }

  /** Returns velocity in units/ms (positive = right/down). */
  velocity(now: number = performance.now()): { vx: number; vy: number } {
    if (this.samples.length < 2) return { vx: 0, vy: 0 };
    const cutoff = now - this.windowMs;
    let i = this.samples.length - 1;
    while (i > 0 && this.samples[i - 1].t >= cutoff) i--;
    const a = this.samples[i];
    const b = this.samples[this.samples.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  }

  reset(): void { this.samples.length = 0; }
}
