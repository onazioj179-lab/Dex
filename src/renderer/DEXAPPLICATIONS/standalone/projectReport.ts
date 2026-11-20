import { toLocalDateInput } from '../../utils/localDate';
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Project status report from real data only: the tasks list (open, overdue,
// due today, due in the next 7 days, done), recent notes and recent activity.
// "At risk" means something is overdue; nothing is estimated or invented.
// Used by Project Dashboard (Report → Notes / copy) and UKI (projects.status).
// Pure; unit-tested.

export interface ReportTask { title?: string; completed?: boolean; dueDate?: string | null; dueTime?: string | null; snoozedUntil?: string | null }
export interface ReportInput {
  projectName: string;
  kindLabel: string;
  tasks: ReportTask[] | null;
  notes: { title: string; updated_at: number }[] | null;
  activity: { label: string; ts: number }[];
  now: number;
}

const DAY = 86_400_000;
const day = (ms: number) => toLocalDateInput(new Date(ms));

/**
 * A task's due moment in LOCAL time. "2026-11-18" means that local day:
 * `new Date('2026-11-18')` is UTC midnight, which west of UTC is the evening
 * before (a task due today showed as overdue).
 */
export function dueMs(t: ReportTask): number | null {
  if (!t.dueDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t.dueDate).trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(t.dueDate);
  if (Number.isNaN(d.getTime())) return null;
  if (t.dueTime) { const [h, m] = String(t.dueTime).split(':').map(Number); if (!Number.isNaN(h) && !Number.isNaN(m)) d.setHours(h, m, 0, 0); }
  return d.getTime();
}

export function buildProjectReport(r: ReportInput): { markdown: string; status: 'at-risk' | 'on-track' | 'no-tasks' } {
  const lines = [`# ${r.projectName} — status`, '', `${r.kindLabel} · ${day(r.now)}`, ''];
  let status: 'at-risk' | 'on-track' | 'no-tasks' = 'no-tasks';
  if (r.tasks) {
    const start = new Date(r.now); start.setHours(0, 0, 0, 0);
    const todayEnd = start.getTime() + DAY, weekEnd = start.getTime() + 8 * DAY;
    const open = r.tasks.filter((t) => t && !t.completed);
    const done = r.tasks.length - open.length;
    const live = open.filter((t) => !(t.snoozedUntil && new Date(t.snoozedUntil).getTime() > r.now));
    const withDue = live.map((t) => ({ t, due: dueMs(t) })).filter((x): x is { t: ReportTask; due: number } => x.due != null).sort((a, b) => a.due - b.due);
    const overdue = withDue.filter((x) => x.due < r.now);
    const today = withDue.filter((x) => x.due >= r.now && x.due < todayEnd);
    const week = withDue.filter((x) => x.due >= todayEnd && x.due < weekEnd);
    status = r.tasks.length === 0 ? 'no-tasks' : overdue.length ? 'at-risk' : 'on-track';
    lines.push(`**Status:** ${status === 'at-risk' ? `At risk — ${overdue.length} overdue` : status === 'on-track' ? 'On track — nothing overdue' : 'No tasks yet'}`, '');
    lines.push('## Tasks', `- Open: ${open.length} · Done: ${done} · Overdue: ${overdue.length} · Due today: ${today.length} · Next 7 days: ${week.length}`);
    const list = (title: string, xs: { t: ReportTask; due: number }[]) => {
      if (!xs.length) return;
      lines.push('', `### ${title}`, ...xs.slice(0, 15).map((x) => `- ${x.t.title?.trim() || 'Untitled'} (due ${day(x.due)})`));
      if (xs.length > 15) lines.push(`- …and ${xs.length - 15} more`);
    };
    list('Overdue', overdue); list('Due today', today); list('Next 7 days', week);
  } else {
    lines.push('## Tasks', '- The Tasks list could not be read.');
  }
  lines.push('', '## Notes');
  if (r.notes && r.notes.length) lines.push(...r.notes.slice(0, 5).map((n) => `- ${n.title}${n.updated_at ? ` (edited ${day(n.updated_at)})` : ''}`));
  else lines.push(r.notes ? '- No notes yet.' : '- Notes could not be read.');
  lines.push('', '## Recent activity');
  if (r.activity.length) lines.push(...r.activity.slice(0, 8).map((a) => `- ${a.label} (${day(a.ts)})`));
  else lines.push('- Nothing recorded this session.');
  return { markdown: lines.join('\n'), status };
}
