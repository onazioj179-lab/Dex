// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { planReopen, REOPEN_MAX, type LastSessionRecord } from '../../src/renderer/store/runningApps';

const rec = (ids: string[], clean = true, currentAppId = ids[0] ?? ''): LastSessionRecord => ({
  apps: ids.map((id) => ({ id, name: 'stored name', icon: 'x', color: '#000' })), currentAppId, timestamp: 1, clean,
});

describe('reopen apps and windows (opt-in)', () => {
  it('brings back apps and extra windows with names from the definitions', () => {
    const p = planReopen(rec(['notes', 'notes~2', 'calculator'], true, 'notes~2'));
    expect(p.apps.map((a) => a.id)).toEqual(['notes', 'notes~2', 'calculator']);
    expect(p.apps[1].name).toMatch(/ 2$/);
    expect(p.apps[0].name).not.toBe('stored name');
    expect(p.current).toBe('notes~2');
  });
  it('nothing after an unexpected close', () => {
    expect(planReopen(rec(['notes'], false))).toMatchObject({ apps: [], skipped: 'unclean' });
  });
  it('drops unknown apps, duplicates and extra windows of single-window apps', () => {
    const p = planReopen(rec(['no-such-app', 'notes', 'notes', 'settings~2']));
    expect(p.apps.map((a) => a.id)).toEqual(['notes']);
  });
  it('caps a huge session', () => {
    const ids = Array.from({ length: 30 }, (_, i) => (i === 0 ? 'terminal' : `terminal~${i + 1}`));
    expect(planReopen(rec(ids)).apps).toHaveLength(REOPEN_MAX);
  });
  it('empty journal', () => expect(planReopen(null).skipped).toBe('empty'));
});
