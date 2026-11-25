// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { launchOriginFor, setLastPress, LAUNCH_ORIGIN_MAX_AGE_MS } from '../../src/renderer/shell/launchOrigin';

describe('launch origin', () => {
  const rect = { left: 100, top: 50, width: 600, height: 400 };
  it('grows from the clicked point inside the window', () => {
    setLastPress({ x: 400, y: 250, t: 1000 });
    expect(launchOriginFor(rect, 1100)).toEqual({ x: 300, y: 200 });
  });
  it('clamps a press outside the window (the Dock) to its edge', () => {
    setLastPress({ x: 640, y: 780, t: 1000 });
    expect(launchOriginFor(rect, 1100)).toEqual({ x: 540, y: 400 });
  });
  it('ignores an old press (keyboard / UKI opens)', () => {
    setLastPress({ x: 400, y: 250, t: 1000 });
    expect(launchOriginFor(rect, 1000 + LAUNCH_ORIGIN_MAX_AGE_MS + 1)).toBeNull();
    setLastPress(null);
    expect(launchOriginFor(rect, 1100)).toBeNull();
  });
});
