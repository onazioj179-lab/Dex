// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
// Frame-time samplers must not wake the compositor while nobody is using DEX.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { userRecentlyActive, _markUserActivity } from '../../src/renderer/services/userActivity';
import { startThermalAdaptiveMonitor, stopThermalAdaptiveMonitor } from '../../src/renderer/services/ThermalAdaptiveMonitor';

describe('idle frame samplers', () => {
  afterEach(() => { stopThermalAdaptiveMonitor(); vi.restoreAllMocks(); });

  it('input marks the user active; 15 s without input is idle', () => {
    _markUserActivity(performance.now() - 60_000);
    expect(userRecentlyActive()).toBe(false);
    window.dispatchEvent(new Event('keydown'));
    expect(userRecentlyActive()).toBe(true);
  });

  it('the thermal sampler requests no frames while idle, and samples after input', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    _markUserActivity(performance.now() - 60_000);
    startThermalAdaptiveMonitor();
    expect(raf).not.toHaveBeenCalled();
    stopThermalAdaptiveMonitor();
    _markUserActivity();
    startThermalAdaptiveMonitor();
    expect(raf).toHaveBeenCalledTimes(1);
  });
});
