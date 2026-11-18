// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { frameStep, decay } from '../../src/renderer/utils/frameTime';

/** Coast like MotionController: v *= f^step; x += v * step, until |v| < 0.5. */
function coast(hz: number, v0: number, friction = 0.95) {
  let v = v0, x = 0, t = 0, last: number | null = null, ms = 0;
  for (;;) {
    t += 1000 / hz;
    const s = frameStep(last, t); last = t;
    v *= decay(friction, s); x += v * s; ms = t;
    if (Math.abs(v) < 0.5) break;
  }
  return { x, ms };
}

describe('refresh-rate independent motion', () => {
  it('a flick coasts about the same distance and time at 60, 90, 120 and 144 Hz', () => {
    const base = coast(60, 40);
    for (const hz of [90, 120, 144]) {
      const r = coast(hz, 40);
      expect(Math.abs(r.x - base.x) / base.x).toBeLessThan(0.05);
      expect(Math.abs(r.ms - base.ms)).toBeLessThan(60);
    }
  });

  it('the old per-frame physics did not (regression proof)', () => {
    const perFrame = (hz: number) => { let v = 40, ms = 0; while (Math.abs(v) >= 0.5) { v *= 0.95; ms += 1000 / hz; } return ms; };
    expect(perFrame(120)).toBeLessThan(perFrame(60) * 0.6); // stopped in about half the time
  });

  it('a stalled frame is clamped, never a jump', () => {
    expect(frameStep(0, 5000)).toBe(4);
    expect(frameStep(null, 10)).toBe(1);
  });
});
