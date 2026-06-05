// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { focusScore } from '../../src/shared/rewind/focusScore';

describe('focus score', () => {
  it('is 0 for no activity', () => {
    expect(focusScore([])).toEqual({ score: 0, switches: 0, primaryAppId: '', primaryShare: 0 });
  });

  it('is 100 when one app is used throughout', () => {
    const r = focusScore([{ ts: 1, appId: 'a' }, { ts: 2, appId: 'a' }, { ts: 3, appId: 'a' }]);
    expect(r.score).toBe(100);
    expect(r.switches).toBe(0);
    expect(r.primaryAppId).toBe('a');
    expect(r.primaryShare).toBe(1);
  });

  it('drops with constant app switching', () => {
    const r = focusScore([
      { ts: 1, appId: 'a' }, { ts: 2, appId: 'b' }, { ts: 3, appId: 'a' }, { ts: 4, appId: 'b' },
    ]);
    expect(r.switches).toBe(3);
    expect(r.primaryShare).toBe(0.5);
    expect(r.score).toBe(20);
  });

  it('sorts by time first', () => {
    const r = focusScore([{ ts: 3, appId: 'a' }, { ts: 1, appId: 'a' }, { ts: 2, appId: 'a' }]);
    expect(r.score).toBe(100);
  });
});
