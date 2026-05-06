// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { StartupTimeline } from '../../src/main/utils/StartupTimeline';

describe('StartupTimeline', () => {
  it('records phase durations', async () => {
    const t = new StartupTimeline();
    t.begin('Alpha');
    await new Promise(r => setTimeout(r, 10));
    t.end('Alpha');
    const s = t.snapshot();
    const alpha = s.phases.find(p => p.name === 'Alpha');
    expect(alpha).toBeDefined();
    expect(alpha!.durationMs).toBeGreaterThanOrEqual(5);
  });

  it('handles mark()', () => {
    const t = new StartupTimeline();
    t.mark('ReadyCheck');
    const s = t.snapshot();
    expect(s.phases.some(p => p.name === 'ReadyCheck')).toBe(true);
  });

  it('complete() closes open phases', () => {
    const t = new StartupTimeline();
    t.begin('Open');
    t.complete();
    const s = t.snapshot();
    const open = s.phases.find(p => p.name === 'Open');
    expect(open?.durationMs).toBeDefined();
  });

  it('complete() is idempotent', () => {
    const t = new StartupTimeline();
    t.complete();
    t.complete();
    expect(t.snapshot().totalMs).toBeGreaterThanOrEqual(0);
  });

  it('totalMs is monotonically non-negative', () => {
    const t = new StartupTimeline();
    t.begin('X');
    t.end('X');
    expect(t.snapshot().totalMs).toBeGreaterThanOrEqual(0);
  });
});
