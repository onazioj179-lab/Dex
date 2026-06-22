// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Canonical due-date helpers shared across task surfaces (Kanban, Tasks,
 * Calendar). One definition of "overdue" / "due soon" and their token colours so
 * every surface highlights dates identically. Pure: no DOM, no React.
 *
 * Dates are plain 'YYYY-MM-DD' strings (the shape Kanban/Tasks persist). All
 * comparisons are done at day granularity in local time.
 */

export type DueStatus = 'none' | 'overdue' | 'due-today' | 'due-soon' | 'upcoming';

/** Local midnight for a 'YYYY-MM-DD' string, or null when unparseable. */
function parseDay(dueDate?: string): Date | null {
  if (!dueDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole-day difference (due - today); negative when overdue. */
export function daysUntilDue(dueDate?: string): number | null {
  const due = parseDay(dueDate);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/** Classify a due date relative to today. `soonDays` is the upcoming window. */
export function dueStatus(dueDate?: string, soonDays = 3): DueStatus {
  const diff = daysUntilDue(dueDate);
  if (diff === null) return 'none';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due-today';
  if (diff <= soonDays) return 'due-soon';
  return 'upcoming';
}

/** Design-token colour for a due status (empty string for 'none'/'upcoming'). */
export function dueStatusColor(status: DueStatus): string {
  switch (status) {
    case 'overdue': return 'var(--color-error)';
    case 'due-today': return 'var(--color-warning)';
    case 'due-soon': return '#ff6723';
    default: return '';
  }
}

/** Short human label for a due status. */
export function dueStatusLabel(status: DueStatus): string {
  switch (status) {
    case 'overdue': return 'Overdue';
    case 'due-today': return 'Today';
    case 'due-soon': return 'Soon';
    default: return '';
  }
}

/** Compact relative label, e.g. "2d overdue", "Today", "in 5d", "Jun 30". */
export function relativeDueLabel(dueDate?: string): string {
  const diff = daysUntilDue(dueDate);
  if (diff === null) return '';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `in ${diff}d`;
  const due = parseDay(dueDate)!;
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Advance a 'YYYY-MM-DD' date by a recurrence cadence; returns a new string. */
export function advanceDate(dueDate: string, cadence: 'daily' | 'weekly' | 'monthly'): string {
  const base = parseDay(dueDate) ?? new Date();
  const d = new Date(base.getTime());
  if (cadence === 'daily') d.setDate(d.getDate() + 1);
  else if (cadence === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
