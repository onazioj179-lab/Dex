// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  newSnapshot, transition, canTransition, checkIpcQuota, shouldRespawn,
  type AppContainerSpec,
} from '../../src/shared/runtime/appContainer';

const spec: AppContainerSpec = {
  appId: 'a',
  granted: ['files.read'],
  budgets: { cpuPct: 50, gpuMemMb: 512, ramMb: 1024, ipcMsgsPerSec: 100, ipcBytesPerSec: 1024 * 1024 },
};

describe('appContainer lifecycle', () => {
  it('rejects invalid transitions', () => {
    expect(canTransition('cold', 'hot')).toBe(false);
    expect(() => transition(newSnapshot('a', 0), 'hot', 0)).toThrow();
  });
  it('cold -> warm -> hot', () => {
    let s = newSnapshot('a', 0);
    s = transition(s, 'warm', 100);
    expect(s.startedAt).toBe(100);
    s = transition(s, 'hot', 200);
    expect(s.lastFrameAt).toBe(200);
  });
  it('quota allows under, defers near limit, blocks far over', () => {
    const s = newSnapshot('a', 0);
    const r1 = checkIpcQuota(s, spec, 100, 0);
    expect(r1.allow).toBe(true);
    // Saturate to exactly at the message budget so the next msg trips defer.
    let cur = r1.nextSnap;
    for (let i = 0; i < 99; i++) cur = checkIpcQuota(cur, spec, 100, 0).nextSnap;
    const overSoft = checkIpcQuota(cur, spec, 100, 0);
    expect(overSoft.allow).toBe(false);
    expect(overSoft.backpressure).toBe('defer');
    // Crossing 2x the byte budget in one message yields hard block.
    const huge = checkIpcQuota(cur, spec, spec.budgets.ipcBytesPerSec * 3, 0);
    expect(huge.allow).toBe(false);
    expect(huge.backpressure).toBe('block');
  });
  it('respawn guard kicks in after crash limit', () => {
    let s = newSnapshot('a', 0);
    for (let i = 0; i < 5; i++) {
      s = transition(s, 'warm', 0);
      s = transition(s, 'zombie', 0);
    }
    expect(shouldRespawn(s)).toBe(false);
  });
});
