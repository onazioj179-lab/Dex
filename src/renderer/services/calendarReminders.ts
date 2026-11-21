// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Calendar event alerts and timed task alerts. Runs with the shell (like scheduled tasks), so an
// alert arrives whether or not Calendar is open. Every 30 s it looks at the
// events Calendar saves, including repeating ones, and notifies for each
// occurrence whose alert time fell since the last check. An occurrence is
// alerted once (remembered, bounded); alerts missed by more than 10 minutes
// (DEX was closed) are not replayed. The due-check is pure; unit-tested.

import { notify } from './notify';
import { repairPickedDay } from '../utils/localDate';
import { occursOn, type RecurringDate } from '../../shared/calendar/recurrence';
import { calendarDayKey } from '../../shared/time/naturalCalendar';

export interface ReminderEvent extends RecurringDate {
  id: string; title: string; time: string;
  /** Minutes before the start to alert; undefined/null = no alert. */
  alertMinutes?: number | null;
}

const EVENTS_KEY = 'dex-calendar-events';
const FIRED_KEY = 'dex-calendar-alerts-fired';
const MISSED_GRACE_MS = 10 * 60_000;

export { occursOn };

export interface DueAlert { key: string; event: ReminderEvent; startsAt: number; alertAt: number }

/** Alerts whose time is in (since, now] for occurrences on the days around now. */
export function dueAlerts(events: ReminderEvent[], since: number, now: number, fired: Set<string>): DueAlert[] {
  const out: DueAlert[] = [];
  const from = Math.max(since, now - MISSED_GRACE_MS);
  for (const e of events) {
    if (e.alertMinutes == null || !Number.isFinite(e.alertMinutes) || e.alertMinutes < 0) continue;
    const [h, m] = (e.time || '00:00').split(':').map(Number);
    // Yesterday .. 2 days ahead: a 1-day-before alert fires the day before.
    for (let off = -1; off <= 2; off++) {
      const day = new Date(now); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + off);
      if (!occursOn(e, day)) continue;
      const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0).getTime();
      const alertAt = startsAt - e.alertMinutes * 60_000;
      const key = `${e.id}@${calendarDayKey(day)}`;
      if (alertAt > from && alertAt <= now && !fired.has(key)) out.push({ key, event: e, startsAt, alertAt });
    }
  }
  return out;
}

export function alertText(a: DueAlert, now: number): string {
  const mins = Math.round((a.startsAt - now) / 60_000);
  const at = new Date(a.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (mins <= 0) return `Now · ${at}`;
  if (mins < 60) return `In ${mins} min · ${at}`;
  if (mins < 1440) return `In ${Math.round(mins / 60)} h · ${at}`;
  return `Tomorrow · ${at}`;
}

// ---- Tasks with a due time ------------------------------------------------------
// A task with a date AND a time alerts at that time (date-only tasks do not, so
// nobody gets a burst of notifications at midnight). Snoozed and done tasks never.

export interface ReminderTask { id: string; title: string; completed?: boolean; dueDate?: string | null; dueTime?: string | null; snoozedUntil?: string | null }

export function dueTaskAlerts(tasks: ReminderTask[], since: number, now: number, fired: Set<string>): { key: string; task: ReminderTask; dueAt: number }[] {
  const from = Math.max(since, now - MISSED_GRACE_MS);
  const out: { key: string; task: ReminderTask; dueAt: number }[] = [];
  for (const t of tasks) {
    if (!t || t.completed || !t.dueDate || !t.dueTime) continue;
    if (t.snoozedUntil && new Date(t.snoozedUntil).getTime() > now) continue;
    const day = repairPickedDay(t.dueDate);
    const [h, m] = String(t.dueTime).split(':').map(Number);
    if (!day || Number.isNaN(h) || Number.isNaN(m)) continue;
    const dueAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
    const key = `task:${t.id}@${dueAt}`;
    if (dueAt > from && dueAt <= now && !fired.has(key)) out.push({ key, task: t, dueAt });
  }
  return out;
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastCheck = 0;

function readFired(): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(FIRED_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); }
}

function check(): void {
  const now = Date.now();
  const read = <T,>(key: string): T[] => { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const fired = readFired();
  const due = dueAlerts(read<ReminderEvent>(EVENTS_KEY), lastCheck, now, fired);
  const dueTasks = dueTaskAlerts(read<ReminderTask>('dex-tasks'), lastCheck, now, fired);
  lastCheck = now;
  if (!due.length && !dueTasks.length) return;
  for (const a of due) {
    fired.add(a.key);
    void notify({
      title: a.event.title || 'Event',
      body: alertText(a, now),
      source: 'Calendar',
      icon: 'info',
      priority: 'high',
      actions: [{ label: 'Open Calendar', onClick: () => window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'calendar' } })) }],
    });
  }
  for (const d of dueTasks) {
    fired.add(d.key);
    void notify({
      title: d.task.title || 'Task due',
      body: `Task due now · ${new Date(d.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      source: 'Tasks',
      icon: 'info',
      priority: 'high',
      actions: [{ label: 'Open Tasks', onClick: () => window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'tasks' } })) }],
    });
  }
  try { localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-500))); } catch { /* storage full: may alert again */ }
}

export const calendarReminders = {
  start(): void {
    if (timer) return;
    lastCheck = Date.now() - 60_000;
    check();
    timer = setInterval(check, 30_000);
  },
  stop(): void { if (timer) clearInterval(timer); timer = null; },
};
