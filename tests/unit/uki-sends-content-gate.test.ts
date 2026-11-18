// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Actions that read app content into the conversation (browser.readPage) must
// ask the user every time, even when a scheduled task pre-approved the call.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerUkiAppAction, runUkiAction, setUkiActionConfirmHandler, getUkiActionAudit, clearUkiActionAudit,
} from '../../src/renderer/uki/appActionRegistry';
import { useRunningApps } from '../../src/renderer/store/runningApps';

let reads = 0;
beforeEach(() => {
  reads = 0;
  clearUkiActionAudit();
  setUkiActionConfirmHandler(null);
  registerUkiAppAction('browser', {
    id: 'test.readPage', description: 'read the page', args: [], example: '{}', mutates: false, sendsContent: true,
  }, () => { reads++; return 'page text'; });
  useRunningApps.setState({ runningApps: [{ id: 'browser', name: 'Browser', icon: 'browser', launchedAt: 0, lastActiveAt: 0, isMinimized: false }] as never });
});

describe('sendsContent confirmation gate', () => {
  it('is not run with nobody to confirm', async () => {
    const r = await runUkiAction('test.readPage', {});
    expect(r).toMatch(/shares content from browser and needs the user's confirmation/);
    expect(reads).toBe(0);
    expect(getUkiActionAudit().at(-1)).toMatchObject({ id: 'test.readPage', outcome: 'denied' });
  });

  it('runs once the user confirms', async () => {
    const confirm = vi.fn(() => true);
    setUkiActionConfirmHandler(confirm);
    expect(await runUkiAction('test.readPage', {})).toBe('page text');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(reads).toBe(1);
  });

  it('still asks when pre-approved (a schedule cannot approve unseen content)', async () => {
    const confirm = vi.fn(() => false);
    setUkiActionConfirmHandler(confirm);
    const r = await runUkiAction('test.readPage', {}, { preApproved: true });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(reads).toBe(0);
    expect(r).toMatch(/Not performed/);
  });
});
