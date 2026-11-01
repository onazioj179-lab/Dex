// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// One source of truth for motion durations, inside the owner's ranges:
// feedback 80-120 · hover 120-180 · standard 180-260 · panel 220-320 · major 280-420.
//
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MOTION_MS, applyMotionDurations } from '../../src/renderer/styles/motionDurations';

describe('motion durations', () => {
  it('stay inside the specified ranges', () => {
    const within = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
    expect(within(MOTION_MS.fast, 80, 120)).toBe(true);
    expect(within(MOTION_MS.normal, 120, 180)).toBe(true);
    expect(within(MOTION_MS.slow, 180, 260)).toBe(true);
    expect(within(MOTION_MS.panel, 220, 320)).toBe(true);
    expect(within(MOTION_MS.major, 280, 420)).toBe(true);
  });

  it('match the stylesheet tokens', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/styles/design-system.css'), 'utf8');
    for (const [k, v] of Object.entries(MOTION_MS)) {
      if (k === 'theme') continue;
      expect(css.includes(`--duration-${k}: ${v}ms`), `--duration-${k}: ${v}ms`).toBe(true);
    }
  });

  it('zero out under reduced motion and scale for slower tiers', () => {
    const root = document.documentElement;
    applyMotionDurations(root, { reduce: true });
    expect(root.style.getPropertyValue('--duration-slow')).toBe('0ms');
    applyMotionDurations(root, { reduce: false, scale: 0.5 });
    expect(root.style.getPropertyValue('--duration-slow')).toBe('110ms');
    applyMotionDurations(root, { reduce: false });
    expect(root.style.getPropertyValue('--duration-panel')).toBe('260ms');
  });
});
