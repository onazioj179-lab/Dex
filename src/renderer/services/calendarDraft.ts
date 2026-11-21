// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
export interface CalendarDraft {
  start: Date;
  end: Date;
  title: string;
  description: string;
}

let pending: CalendarDraft | undefined;
export const CALENDAR_DRAFT_EVENT = 'dex-calendar-draft';

export function openCalendarDraft(draft: CalendarDraft) {
  pending = draft;
  window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'calendar' } }));
  window.dispatchEvent(new Event(CALENDAR_DRAFT_EVENT));
}

export function takeCalendarDraft(): CalendarDraft | undefined {
  const draft = pending;
  pending = undefined;
  return draft;
}
