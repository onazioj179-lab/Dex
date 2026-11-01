// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings > UKI & Memory used to be ignored: "Memory Recording" off still
// stored every conversation and the retention period was never applied.
//
import { describe, it, expect, beforeEach } from 'vitest';
import { recordTurn, readTurns, clearTurns, applyRetention, ukiMemoryPrefs } from '../../src/renderer/uki/memory';

const setPrefs = (p: Record<string, unknown>) => localStorage.setItem('dex-settings', JSON.stringify(p));

describe('UKI memory honors Settings', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearTurns();
  });

  it('records by default (matches the Settings default)', async () => {
    await recordTurn('hello', 'hi');
    expect((await readTurns()).length).toBe(1);
  });

  it('stores nothing when Memory Recording is off', async () => {
    setPrefs({ ukiMemoryEnabled: false });
    await recordTurn('secret plan', 'noted');
    expect(await readTurns()).toEqual([]);
  });

  it('retention defaults to 30 days and can be disabled with Auto Cleanup off', () => {
    expect(ukiMemoryPrefs().retentionMs).toBe(30 * 86_400_000);
    setPrefs({ ukiRetentionDays: 7 });
    expect(ukiMemoryPrefs().retentionMs).toBe(7 * 86_400_000);
    setPrefs({ ukiAutoCleanup: false, ukiRetentionDays: 7 });
    expect(ukiMemoryPrefs().retentionMs).toBeNull();
  });

  it('applyRetention drops only expired turns', () => {
    const now = 100 * 86_400_000;
    const turns = [{ ts: now - 10 * 86_400_000 }, { ts: now - 2 * 86_400_000 }, { ts: now }];
    expect(applyRetention(turns, 7 * 86_400_000, now)).toHaveLength(2);
    expect(applyRetention(turns, null, now)).toHaveLength(3);
  });
});
