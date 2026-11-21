// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Tasks, { advanceTaskRecurrence } from '../../src/renderer/pages/Tasks';
import { ToastProvider } from '../../src/renderer/components/Toast';
import { sendToTasks, takeIncomingTasks } from '../../src/renderer/services/taskIntake';
import { useTimerStore } from '../../src/renderer/store/timerStore';
import { toLocalDateInput } from '../../src/renderer/utils/localDate';

const savedTimer = useTimerStore.getState();
const row = (id: string, title: string, fields: Record<string, unknown> = {}) => ({
  id, title, completed: false, priority: 'medium', dueDate: null, notes: '', list: 'personal', ...fields,
});

function seed(...rows: ReturnType<typeof row>[]) {
  localStorage.setItem('dex-tasks', JSON.stringify(rows));
}

function mountTasks() { return render(<ToastProvider><Tasks /></ToastProvider>); }

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  takeIncomingTasks();
  vi.unstubAllGlobals();
  useTimerStore.setState({ pomodoro: savedTimer.pomodoro, pomodoroLog: savedTimer.pomodoroLog });
});

it('clamps a monthly recurrence and returns to the original day when available', () => {
  const feb = advanceTaskRecurrence(new Date(2026, 0, 31), 'monthly');
  expect(toLocalDateInput(feb)).toBe('2026-02-28');
  expect(toLocalDateInput(advanceTaskRecurrence(feb, 'monthly', undefined, 31))).toBe('2026-03-31');
  expect(toLocalDateInput(advanceTaskRecurrence(new Date(2026, 1, 26), 'custom', 10))).toBe('2026-03-08');
});

it('bulk-completes eligible tasks, retains blocked tasks and creates one custom recurrence', async () => {
  seed(
    row('a', 'Check inventory', { dueDate: '2026-11-21', recurring: 'custom', recurrenceDays: 10, actualMinutes: 40 }),
    row('b', 'Send invoice', { blockedBy: ['c'] }),
    row('c', 'Approve invoice'),
  );
  mountTasks();
  fireEvent.click(screen.getByRole('button', { name: 'Select Personal list' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Select "Check inventory"' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select "Send invoice"' }));
  fireEvent.click(screen.getByRole('button', { name: 'Complete selected tasks' }));
  expect(screen.getByRole('button', { name: '"Send invoice" is blocked' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Deselect "Send invoice"' })).toBeVisible();
  let saved = JSON.parse(localStorage.getItem('dex-tasks')!);
  expect(saved.find((task: { id: string }) => task.id === 'a').completedAt).toBeTruthy();
  const occurrences = saved.filter((task: { title: string }) => task.title === 'Check inventory');
  expect(occurrences).toHaveLength(2);
  expect(occurrences.find((task: { id: string }) => task.id !== 'a')).toMatchObject({ completed: false, actualMinutes: null });
  fireEvent.click(screen.getByRole('button', { name: 'Select Completed Today list' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark "Check inventory" incomplete' }));
  saved = JSON.parse(localStorage.getItem('dex-tasks')!);
  expect(saved.find((task: { id: string }) => task.id === 'a').completedAt).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Select Personal list' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Complete "Check inventory"' })[0]);
  expect(JSON.parse(localStorage.getItem('dex-tasks')!).filter((task: { title: string }) => task.title === 'Check inventory')).toHaveLength(2);
});

it('receives a forwarded card, moves it to a list, and saves a tag view across mounts', async () => {
  sendToTasks({ title: 'Launch checklist', notes: 'Notes from Kanban', dueDate: '2026-11-30' });
  const view = mountTasks();
  fireEvent.click(await screen.findByText('Launch checklist'));
  expect(screen.getByPlaceholderText('Add a description...')).toHaveValue('Notes from Kanban');
  fireEvent.change(screen.getByRole('textbox', { name: 'Task tags' }), { target: { value: 'Launch, launch' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter tasks by tag' }), { target: { value: 'launch' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save tag', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Select "Launch checklist"' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Move selected tasks to list' }), { target: { value: 'work' } });
  fireEvent.click(screen.getByRole('button', { name: 'Move', exact: true }));
  view.unmount();
  mountTasks();
  fireEvent.click(screen.getByRole('button', { name: '#launch' }));
  expect(await screen.findByText('Launch checklist')).toBeVisible();
  expect(JSON.parse(localStorage.getItem('dex-tasks')!)[0]).toMatchObject({ list: 'work', tags: ['launch'] });
});

it('attaches, opens and removes a native file reference', async () => {
  seed(row('native', 'Native references'));
  const path = 'C:\\Examples\\plan.pdf';
  const invoke = vi.fn(async (channel: string) => channel === 'dialog:showOpenDialog'
    ? { canceled: false, filePaths: [path] }
    : null);
  vi.stubGlobal('dex', { invoke });
  mountTasks();
  fireEvent.click(screen.getByRole('button', { name: 'Select Personal list' }));
  fireEvent.click(await screen.findByText('Native references'));
  fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
  fireEvent.click(await screen.findByRole('button', { name: 'plan.pdf' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('shell:openPath', path));
  fireEvent.click(screen.getByRole('button', { name: 'Remove attachment plan.pdf' }));
  expect(screen.queryByRole('button', { name: 'plan.pdf' })).toBeNull();
});

it('opens a task-linked Pomodoro and keeps the task on its completed focus entry', async () => {
  seed(row('focus', 'Focus on outline'));
  useTimerStore.getState().resetPomodoro();
  mountTasks();
  fireEvent.click(screen.getByRole('button', { name: 'Select Personal list' }));
  fireEvent.click(await screen.findByText('Focus on outline'));
  fireEvent.click(screen.getByRole('button', { name: 'Start Pomodoro' }));
  const store = useTimerStore.getState();
  expect(store.pomodoro).toMatchObject({ running: true, phase: 'work', task: { id: 'focus', title: 'Focus on outline' } });
  expect(store.startTaskFocus({ id: 'different', title: 'Other task' })).toBe(false);
  act(() => store.advancePomodoro({ silent: true }));
  expect(useTimerStore.getState().pomodoroLog.entries[0]).toMatchObject({ phase: 'work', task: { id: 'focus' } });
});
