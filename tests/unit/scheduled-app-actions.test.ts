// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerUkiAppAction, unregisterUkiAppAction, runUkiAction, setUkiActionConfirmHandler, getUkiActionAudit, clearUkiActionAudit,
} from '../../src/renderer/uki/appActionRegistry';
import { appActionFor, scheduleTaskTool } from '../../src/renderer/uki/scheduleTools';
import { useScheduledTasksStore } from '../../src/renderer/store/scheduledTasksStore';
import { useRunningApps } from '../../src/renderer/store/runningApps';
import { useUkiTasks } from '../../src/renderer/store/ukiTasksStore';
import { scheduledTaskRunner } from '../../src/renderer/services/scheduledTaskRunner';

const NOW = new Date(2026, 10, 12, 10, 0).getTime();
const made: string[] = [];

function registerNotes() {
  registerUkiAppAction('notes', {
    id: 'notes.createNote', description: 'Create a note', args: [{ name: 'title', type: 'string' }],
    example: '{"title": "Groceries"}', mutates: true,
  }, (a) => { made.push(String(a.title)); return `Created "${a.title}".`; });
  registerUkiAppAction('notes', {
    id: 'notes.count', description: 'Count notes', args: [], example: '{}', mutates: false,
  }, () => '3 notes');
}

function setRunning(ids: string[]) {
  useRunningApps.setState({ runningApps: ids.map((id) => ({ id, name: id, icon: id, launchedAt: 0, lastActiveAt: 0, isMinimized: false })) as never });
}

beforeEach(() => {
  made.length = 0;
  clearUkiActionAudit();
  localStorage.clear();
  useScheduledTasksStore.getState().clearAll();
  useUkiTasks.setState({ tasks: [] });
  setUkiActionConfirmHandler(null);
  registerNotes();
  setRunning(['notes']);
});

describe('pre-approved app actions', () => {
  it('a changing action without approval and nobody to confirm is not run', async () => {
    const r = await runUkiAction('notes.createNote', { title: 'A' });
    expect(r).toMatch(/needs the user's confirmation/);
    expect(made).toEqual([]);
  });

  it('pre-approval runs it without a prompt and says so in the audit', async () => {
    const confirm = vi.fn(() => false);
    setUkiActionConfirmHandler(confirm);
    const r = await runUkiAction('notes.createNote', { title: 'B' }, { preApproved: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(made).toEqual(['B']);
    expect(r).toBe('Created "B". (approved when scheduled)');
    expect(getUkiActionAudit().at(-1)).toMatchObject({ id: 'notes.createNote', outcome: 'ran' });
  });

  it('pre-approval never lets an action run while its app is closed', async () => {
    setRunning([]);
    const r = await runUkiAction('notes.createNote', { title: 'C' }, { preApproved: true });
    expect(r).toMatch(/not running/);
    expect(made).toEqual([]);
  });
});

describe('scheduling an app action', () => {
  it('builds a pre-approved action only for changing actions, with validated args', () => {
    expect(appActionFor('notes.createNote', '{"title":"X"}')).toEqual({ ok: true, action: { type: 'app-action', actionId: 'notes.createNote', args: { title: 'X' }, appId: 'notes', mutates: true, preApproved: true } });
    expect(appActionFor('notes.count', '')).toMatchObject({ ok: true, action: { mutates: false, preApproved: false } });
    expect(appActionFor('notes.createNote', '{}')).toMatchObject({ ok: false, error: expect.stringMatching(/requires "title"/) });
    expect(appActionFor('notes.createNote', 'nope')).toMatchObject({ ok: false, error: expect.stringMatching(/JSON object/) });
    expect(appActionFor('notes.createNote', '[1]')).toMatchObject({ ok: false });
    expect(appActionFor('mail.send', '{}')).toMatchObject({ ok: false, error: expect.stringMatching(/Open the app first/) });
  });

  it('schedule_task with an action stores it and explains what will happen', () => {
    const r = scheduleTaskTool({ title: 'Daily note', when: 'every day at 9', action: 'notes.createNote', args: '{"title":"Standup"}' }, NOW);
    expect(r).toMatch(/runs notes\.createNote, approved now so it runs without asking; opens notes if it is closed/);
    const t = useScheduledTasksStore.getState().tasks[0];
    expect(t.action).toMatchObject({ type: 'app-action', actionId: 'notes.createNote', preApproved: true, appId: 'notes' });
    expect(scheduleTaskTool({ title: 'x', when: 'in 5 minutes', action: 'notes.createNote', args: '{}' }, NOW)).toMatch(/^Could not schedule: notes\.createNote requires "title"/);
    expect(useScheduledTasksStore.getState().tasks).toHaveLength(1);
  });
});

describe('runner', () => {
  it('opens a closed app, waits for its action, then runs it pre-approved', async () => {
    unregisterUkiAppAction('notes.createNote');
    setRunning([]);
    const id = useScheduledTasksStore.getState().addTask({
      title: 'Note', kind: 'once', atMs: NOW + 60_000,
      action: { type: 'app-action', actionId: 'notes.createNote', args: { title: 'Auto' }, appId: 'notes', mutates: true, preApproved: true },
    }, NOW);
    const opened: unknown[] = [];
    const onOpen = (e: Event) => {
      opened.push((e as CustomEvent).detail);
      // Simulate the shell opening Notes, which registers its actions on mount.
      setTimeout(() => { setRunning(['notes']); registerNotes(); }, 300);
    };
    window.addEventListener('dex-open-app', onOpen);
    try {
      await scheduledTaskRunner.tick(NOW + 61_000);
      await vi.waitFor(() => expect(made).toEqual(['Auto']), { timeout: 5000, interval: 100 });
      await vi.waitFor(() => expect(useScheduledTasksStore.getState().tasks.find((t) => t.id === id)?.lastOutcome).toBe('ok'), { timeout: 2000 });
    } finally {
      window.removeEventListener('dex-open-app', onOpen);
    }
    expect(opened).toEqual([{ appId: 'notes', appName: 'notes' }]);
    const t = useScheduledTasksStore.getState().tasks.find((x) => x.id === id)!;
    expect(t.enabled).toBe(false); // one-time task done
  });

  it('a changing action that was not pre-approved fails honestly when nobody confirms', async () => {
    const id = useScheduledTasksStore.getState().addTask({
      title: 'Unapproved', kind: 'once', atMs: NOW + 60_000,
      action: { type: 'app-action', actionId: 'notes.createNote', args: { title: 'No' }, appId: 'notes', mutates: true },
    }, NOW);
    await scheduledTaskRunner.tick(NOW + 61_000);
    await vi.waitFor(() => expect(useScheduledTasksStore.getState().tasks.find((t) => t.id === id)?.lastOutcome).toBe('error'), { timeout: 2000 });
    expect(made).toEqual([]);
    expect(useScheduledTasksStore.getState().tasks.find((t) => t.id === id)?.lastError).toMatch(/confirmation/);
  });
});
