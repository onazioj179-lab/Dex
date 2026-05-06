// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Performance Reservation tests
 * @vitest-environment node
 */

import { describe, it, expect, vi } from 'vitest';
import {
  PerformanceReservation,
  _internals,
  type ProcessSnapshot,
  type ReservationDeps,
} from '../../src/main/core/PerformanceReservation';

function snap(over: Partial<ProcessSnapshot>): ProcessSnapshot {
  return { pid: 100, name: 'editor.exe', priority: 'Normal', foreground: false, ...over };
}

function makeDeps(processes: ProcessSnapshot[], platform: 'win32' | 'darwin' | 'linux' = 'linux'): {
  deps: ReservationDeps;
  setPriority: ReturnType<typeof vi.fn>;
} {
  const setPriority = vi.fn().mockResolvedValue(undefined);
  return {
    setPriority,
    deps: {
      enumerate: vi.fn().mockResolvedValue(processes),
      setPriority,
      platform: () => platform,
      now: () => 1000,
    },
  };
}

describe('PerformanceReservation hard exclusions', () => {
  it('excludes well-known system / AV / DEX process names', () => {
    expect(_internals.isHardExcluded('System Idle Process', 0)).toBe(true);
    expect(_internals.isHardExcluded('MsMpEng.exe', 1234)).toBe(true);
    expect(_internals.isHardExcluded('CrowdStrike.exe', 1234)).toBe(true);
    expect(_internals.isHardExcluded('dwm.exe', 1234)).toBe(true);
    expect(_internals.isHardExcluded('audiodg.exe', 1234)).toBe(true);
    expect(_internals.isHardExcluded('dex.exe', 1234)).toBe(true);
    expect(_internals.isHardExcluded('init', 1)).toBe(true); // PID 1 hard exclude
    expect(_internals.isHardExcluded('chrome.exe', 555)).toBe(false);
  });
});

describe('PerformanceReservation.enable / disable (linux)', () => {
  it('reniccs only eligible background non-system processes', async () => {
    const procs = [
      snap({ pid: 100, name: 'editor.exe', priority: 0, foreground: false }),
      snap({ pid: 101, name: 'browser.exe', priority: 0, foreground: false }),
      snap({ pid: 102, name: 'editor-fg.exe', priority: 0, foreground: true }), // foreground
      snap({ pid: 103, name: 'audiodg.exe', priority: 0, foreground: false }),  // hard exclude
      snap({ pid: 104, name: 'MsMpEng.exe', priority: 0, foreground: false }),  // hard exclude
    ];
    const { deps, setPriority } = makeDeps(procs);
    const r = new PerformanceReservation(deps);
    const status = await r.enable();
    expect(status.enabled).toBe(true);
    expect(status.managedPids.sort()).toEqual([100, 101]);
    expect(setPriority).toHaveBeenCalledWith(100, 19);
    expect(setPriority).toHaveBeenCalledWith(101, 19);
    expect(setPriority).not.toHaveBeenCalledWith(102, expect.anything());
    expect(setPriority).not.toHaveBeenCalledWith(103, expect.anything());
    expect(setPriority).not.toHaveBeenCalledWith(104, expect.anything());
  });

  it('uses Idle on win32', async () => {
    const procs = [snap({ pid: 200, name: 'editor.exe', priority: 'Normal' })];
    const { deps, setPriority } = makeDeps(procs, 'win32');
    const r = new PerformanceReservation(deps);
    await r.enable();
    expect(setPriority).toHaveBeenCalledWith(200, 'Idle');
  });

  it('disable restores every managed PID to its original priority', async () => {
    const procs = [
      snap({ pid: 100, name: 'editor.exe', priority: 5 }),
      snap({ pid: 101, name: 'browser.exe', priority: 0 }),
    ];
    const { deps, setPriority } = makeDeps(procs);
    const r = new PerformanceReservation(deps);
    await r.enable();
    setPriority.mockClear();
    await r.disable();
    expect(setPriority).toHaveBeenCalledWith(100, 5);
    expect(setPriority).toHaveBeenCalledWith(101, 0);
    expect(r.status().enabled).toBe(false);
    expect(r.status().managedCount).toBe(0);
  });

  it('release restores a single PID and removes it from management', async () => {
    const procs = [snap({ pid: 100, name: 'editor.exe', priority: 7 })];
    const { deps, setPriority } = makeDeps(procs);
    const r = new PerformanceReservation(deps);
    await r.enable();
    setPriority.mockClear();
    await r.release(100);
    expect(setPriority).toHaveBeenCalledWith(100, 7);
    expect(r.status().managedPids).toEqual([]);
  });

  it('records lastError and continues on per-pid failures', async () => {
    const procs = [
      snap({ pid: 100, name: 'editor.exe' }),
      snap({ pid: 101, name: 'browser.exe' }),
    ];
    const setPriority = vi.fn()
      .mockRejectedValueOnce(new Error('access denied 100'))
      .mockResolvedValueOnce(undefined);
    const deps: ReservationDeps = {
      enumerate: vi.fn().mockResolvedValue(procs),
      setPriority,
      platform: () => 'linux',
    };
    const r = new PerformanceReservation(deps);
    const status = await r.enable();
    expect(status.lastError).toMatch(/access denied 100/);
    expect(status.managedPids).toEqual([101]);
  });

  it('honors caller exclude lists', async () => {
    const procs = [
      snap({ pid: 100, name: 'editor.exe' }),
      snap({ pid: 101, name: 'browser.exe' }),
    ];
    const { deps, setPriority } = makeDeps(procs);
    const r = new PerformanceReservation(deps);
    await r.enable({ excludePids: [101], excludeNames: ['nothing'] });
    expect(setPriority).toHaveBeenCalledTimes(1);
    expect(setPriority).toHaveBeenCalledWith(100, 19);
  });

  it('enable is idempotent for already-managed PIDs', async () => {
    const procs = [snap({ pid: 100, name: 'editor.exe' })];
    const { deps, setPriority } = makeDeps(procs);
    const r = new PerformanceReservation(deps);
    await r.enable();
    await r.enable();
    expect(setPriority).toHaveBeenCalledTimes(1);
  });
});
