// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('UI sound mute persists across restarts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('defaults to on', async () => {
    const m = await import('../../src/renderer/shell/SpatialAudio');
    expect(m.isSoundEnabled()).toBe(true);
  });

  it('a muted preference survives a fresh module load (restart)', async () => {
    const first = await import('../../src/renderer/shell/SpatialAudio');
    first.setSoundEnabled(false);
    vi.resetModules();
    const second = await import('../../src/renderer/shell/SpatialAudio');
    expect(second.isSoundEnabled()).toBe(false);
  });

  it('turning sound back on persists too', async () => {
    const first = await import('../../src/renderer/shell/SpatialAudio');
    first.setSoundEnabled(false);
    first.setSoundEnabled(true);
    vi.resetModules();
    const second = await import('../../src/renderer/shell/SpatialAudio');
    expect(second.isSoundEnabled()).toBe(true);
  });

  it('muted playback creates no AudioContext', async () => {
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    const m = await import('../../src/renderer/shell/SpatialAudio');
    m.setSoundEnabled(false);
    m.playNotification(100);
    expect(ctor).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
