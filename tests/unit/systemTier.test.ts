// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SystemTier (K1)', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as any).dex = undefined;
    if (typeof document !== 'undefined') {
      try { delete document.documentElement.dataset.tier; } catch { /* jsdom */ }
    }
  });

  it('classifies <=2 cores as low tier', async () => {
    (globalThis as any).dex = {
      diagnostics: {
        getSystemInfo: async () => ({
          cpu: { cores: 2 },
          memory: { total: 8 },
          graphics: [{ model: 'Intel UHD 620', vram: 0 }],
        }),
      },
    };
    const mod = await import('../../src/renderer/services/SystemTier');
    const info = await mod.detectSystemTier();
    expect(info.tier).toBe('low');
    expect(info.cores).toBe(2);
  });

  it('classifies <=4GB RAM as low tier', async () => {
    (globalThis as any).dex = {
      diagnostics: {
        getSystemInfo: async () => ({
          cpu: { cores: 8 },
          memory: { total: 4 },
          graphics: [{ model: 'Intel UHD 620', vram: 0 }],
        }),
      },
    };
    const mod = await import('../../src/renderer/services/SystemTier');
    const info = await mod.detectSystemTier();
    expect(info.tier).toBe('low');
  });

  it('classifies discrete GPU + 16GB+ + 8 cores as high tier', async () => {
    (globalThis as any).dex = {
      diagnostics: {
        getSystemInfo: async () => ({
          cpu: { cores: 16 },
          memory: { total: 32 },
          graphics: [{ model: 'NVIDIA GeForce RTX 4060', vram: 8192 }],
        }),
      },
    };
    const mod = await import('../../src/renderer/services/SystemTier');
    const info = await mod.detectSystemTier();
    expect(info.tier).toBe('high');
    expect(info.gpuModel).toContain('RTX');
  });

  it('falls back to mid tier for typical hardware', async () => {
    (globalThis as any).dex = {
      diagnostics: {
        getSystemInfo: async () => ({
          cpu: { cores: 8 },
          memory: { total: 16 },
          graphics: [{ model: 'Intel Iris Xe', vram: 0 }],
        }),
      },
    };
    const mod = await import('../../src/renderer/services/SystemTier');
    const info = await mod.detectSystemTier();
    expect(info.tier).toBe('mid');
  });

  it('returns mid tier when diagnostics IPC is unavailable', async () => {
    const mod = await import('../../src/renderer/services/SystemTier');
    const info = await mod.detectSystemTier();
    expect(info.tier).toBe('mid');
    expect(info.reason).toBe('no-diagnostics-api');
  });

  it('exposes tier policy magnitudes per tier', async () => {
    const mod = await import('../../src/renderer/services/SystemTier');
    expect(mod.getTierPolicy('low').blur).toBeLessThan(1);
    expect(mod.getTierPolicy('mid').blur).toBe(1);
    expect(mod.getTierPolicy('high').blur).toBeGreaterThan(1);
  });

  it('subscribers fire immediately with cached tier', async () => {
    const mod = await import('../../src/renderer/services/SystemTier');
    const calls: string[] = [];
    const off = mod.subscribeSystemTier(info => calls.push(info.tier));
    expect(calls.length).toBe(1);
    off();
  });
});
