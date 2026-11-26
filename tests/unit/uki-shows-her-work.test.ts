// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { registerUkiAppAction, unregisterUkiAppAction, runUkiAction, setUkiActionConfirmHandler } from '../../src/renderer/uki/appActionRegistry';
import { useRunningApps } from '../../src/renderer/store/runningApps';
import { UKI_ACTIVITY_EVENT, activityLabel, type UkiActivity } from '../../src/renderer/uki/activity';

const events: UkiActivity[] = [];
window.addEventListener(UKI_ACTIVITY_EVENT, (e) => events.push((e as CustomEvent<UkiActivity>).detail));

beforeEach(() => {
  events.length = 0;
  useRunningApps.getState().closeAllApps?.();
  setUkiActionConfirmHandler(() => true);
});

describe('UKI shows her work', () => {
  it('makes short labels from action descriptions', () => {
    expect(activityLabel('run the open file in the terminal (asks first). Read-only.')).toBe('Run the open file in the terminal');
    expect(activityLabel('x'.repeat(100)).length).toBeLessThanOrEqual(61);
  });

  it('a change brings the app to the front and the pill shows start then done', async () => {
    useRunningApps.getState().launchApp({ id: 'dexcode', name: 'DEX Code', icon: 'dexcode' } as never);
    useRunningApps.getState().launchApp({ id: 'notes', name: 'Notes', icon: 'notes' } as never);
    expect(useRunningApps.getState().currentAppId).toBe('notes');
    registerUkiAppAction('dexcode', { id: 'dexcode.runFile', description: 'run the open file (asks first)', args: [], example: '{}', mutates: true }, async () => 'Ran it.');
    const out = await runUkiAction('dexcode.runFile', {});
    expect(out).toBe('Ran it.');
    expect(useRunningApps.getState().currentAppId).toBe('dexcode');
    expect(events.map((e) => [e.appId, e.phase, e.label])).toEqual([['dexcode', 'start', 'Run the open file'], ['dexcode', 'done', 'Run the open file']]);
    expect(events[0].id).toBe(events[1].id);
    unregisterUkiAppAction('dexcode.runFile');
  });

  it('reports a failure in the pill', async () => {
    useRunningApps.getState().launchApp({ id: 'axl', name: 'AXL', icon: 'axl' } as never);
    registerUkiAppAction('axl', { id: 'axl.addBox', description: 'add a box to the model', args: [], example: '{}', mutates: true }, async () => { throw new Error('no active part'); });
    await runUkiAction('axl.addBox', {});
    expect(events.at(-1)).toMatchObject({ appId: 'axl', phase: 'failed', detail: 'no active part' });
    unregisterUkiAppAction('axl.addBox');
  });

  it('opens a closed app for her and waits for it to be ready', async () => {
    expect(useRunningApps.getState().runningApps.some((a) => a.id === 'ledger')).toBe(false);
    // The app registers its actions when it mounts; simulate that after launch.
    const unsub = useRunningApps.subscribe((st) => {
      if (st.runningApps.some((a) => a.id === 'ledger')) {
        setTimeout(() => registerUkiAppAction('ledger', { id: 'ledger.summary', description: 'summarise this month', args: [], example: '{}', mutates: false }, async () => 'Spent 120.'), 150);
        unsub();
      }
    });
    const out = await runUkiAction('ledger.summary', {});
    expect(useRunningApps.getState().runningApps.some((a) => a.id === 'ledger')).toBe(true);
    expect(out).toBe('Spent 120.');
    unregisterUkiAppAction('ledger.summary');
  });
});
