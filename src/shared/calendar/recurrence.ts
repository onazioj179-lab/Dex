// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { calendarDayKey, resolveCalendarDay } from '../time/naturalCalendar';

export interface RecurringDate {
  date: string;
  recurring?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurUntil?: string;
  excludedDates?: string[];
}

export function occursOn(event: RecurringDate, day: Date): boolean {
  const key = calendarDayKey(day);
  if (event.excludedDates?.includes(key)) return false;
  if (event.date === key) return true;
  if (!event.recurring || event.recurring === 'none' || key < event.date) return false;
  if (event.recurUntil && key > event.recurUntil) return false;
  const start = new Date(event.date + 'T00:00:00');
  switch (event.recurring) {
    case 'daily': return true;
    case 'weekly': return start.getDay() === day.getDay();
    case 'monthly': return start.getDate() === day.getDate();
    case 'yearly': return start.getMonth() === day.getMonth() && start.getDate() === day.getDate();
  }
}

export function readExcludedDates(block: string): string[] {
  const dates = new Set<string>();
  const lines = block.replace(/\r?\n[ \t]/g, '').matchAll(/^EXDATE(?:;[^:]*)?:([^\r\n]+)/gim);
  for (const [, values] of lines) {
    for (const value of values.split(',')) {
      const match = /^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?$/i.exec(value.trim());
      if (!match) continue;
      const date = match.slice(1).join('-');
      if (resolveCalendarDay(date)) dates.add(date);
    }
  }
  return [...dates].sort();
}
