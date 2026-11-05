// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ScreenGuard's blank-screen detection used a requestAnimationFrame loop on
// every frame, forever (60 of ~78 frames/s DEX requested while idle). It now
// probes one frame every 2 s and still recovers after three late frames.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ScreenGuard frame probe', () => {
  let rafCalls = 0;
  let pending: Array<(t: number) => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    rafCalls = 0;
    pending = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { rafCalls++; pending.push(cb); return rafCalls; });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  async function freshGuard() {
    const mod = await import('../../src/renderer/services/ScreenGuardSystem');
    const guard = mod.screenGuard as unknown as Record<string, any>;
    guard.isMonitoring = true;
    guard.windowFocused = true;
    guard.suppressUntil = 0;
    return guard;
  }

  it('asks for one frame per probe interval, not one per frame', async () => {
    const guard = await freshGuard();
    const run10s = () => {
      const start = rafCalls;
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(2000);
        const cbs = pending.splice(0);
        cbs.forEach((cb) => cb(performance.now()));
      }
      return rafCalls - start;
    };
    const without = run10s();        // other systems in the module, if any
    guard.startFrameMonitoring();
    const withProbe = run10s();
    expect(withProbe - without).toBe(5);   // 10 s at 60 fps used to be ~600
    guard.destroy();
  });

  it('recovers after three late frames in a row', async () => {
    const guard = await freshGuard();
    const recover = vi.fn();
    guard.attemptRecovery = recover;
    guard.startFrameMonitoring();
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(2000);
      const cb = pending.shift();
      vi.advanceTimersByTime(600); // the frame arrives 600 ms after it was asked for
      cb?.(performance.now());
    }
    expect(recover).toHaveBeenCalledTimes(1);
    guard.destroy();
  });

  it('does not probe while the window is unfocused', async () => {
    const guard = await freshGuard();
    guard.windowFocused = false;
    guard.startFrameMonitoring();
    vi.advanceTimersByTime(10_000);
    expect(rafCalls).toBe(0);
    guard.destroy();
  });
});
