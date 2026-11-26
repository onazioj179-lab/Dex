// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, afterEach } from 'vitest';
import {
  getCapabilities,
  hasNative,
  TAURI_NATIVE_SUBSYSTEMS,
} from '../../src/renderer/services/platform/capabilities';

// getCapabilities() reads detectShell(), which checks window.__TAURI__ / window.dex.
const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.__TAURI__;
  delete g.dex;
});

describe('platform capabilities (the blend layer)', () => {
  it('web/preview: no native subsystems', () => {
    const caps = getCapabilities();
    expect(caps.shell).toBe('web');
    expect(caps.full).toBe(false);
    expect(caps.has('vault')).toBe(false);
    expect(caps.nativeSubsystems).toEqual([]);
  });

  it('electron: full backend, everything available', () => {
    g.dex = {};
    const caps = getCapabilities();
    expect(caps.shell).toBe('electron');
    expect(caps.full).toBe(true);
    expect(caps.has('vault')).toBe(true);
    expect(caps.has('anything-at-all')).toBe(true);
    expect(caps.nativeSubsystems).toEqual(['*']);
  });

  it('tauri: native where ported, graceful elsewhere', () => {
    g.__TAURI__ = { core: { invoke: () => {} } };
    const caps = getCapabilities();
    expect(caps.shell).toBe('tauri');
    expect(caps.full).toBe(false);
    expect(caps.has('vault')).toBe(true); // ported
    expect(caps.has('files')).toBe(true); // ported
    expect(caps.has('audio')).toBe(true); // ported (analysis engine)
    expect(caps.has('automation')).toBe(true); // ported (execution engine)
    expect(caps.has('transfer')).toBe(true); // ported native transfer controller
    expect(caps.nativeSubsystems).toEqual([...TAURI_NATIVE_SUBSYSTEMS]);
  });

  it('hasNative reflects the active shell', () => {
    expect(hasNative('vault')).toBe(false); // web by default
    g.dex = {};
    expect(hasNative('vault')).toBe(true); // electron
  });
});
