// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const weekdayPattern = '(?:next\\s+)?(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)';
const dayPattern = '(?:today|tomorrow|yesterday|\\d{4}-\\d{2}-\\d{2}|' + weekdayPattern + ')';
const pad = (value: number) => String(value).padStart(2, '0');
export const calendarDayKey = (date: Date) => [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function resolveCalendarDay(text: string, now = new Date()): Date | null {
  const key = text.trim().toLowerCase();
  const date = midnight(now);
  const relative = { yesterday: -1, today: 0, tomorrow: 1 };
  if (Object.hasOwn(relative, key)) {
    date.setDate(date.getDate() + relative[key as keyof typeof relative]);
    return date;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const day = new Date(key + 'T00:00');
    return Number.isFinite(day.getTime()) && calendarDayKey(day) === key ? day : null;
  }
  if (!new RegExp('^' + weekdayPattern + '$', 'i').test(key)) return null;
  const target = weekdays.indexOf(key.replace(/^next\s+/, '').slice(0, 3));
  const delta = (target - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date;
}

export function evaluateCalendarMath(text: string, now = new Date()): string | null {
  const offset = new RegExp('^(' + dayPattern + ')\\s*([+-])\\s*(\\d{1,5})\\s*([dw])$', 'i').exec(text.trim());
  if (offset) {
    const day = resolveCalendarDay(offset[1], now);
    if (!day) return null;
    day.setDate(day.getDate() + Number(offset[3]) * (offset[2] === '-' ? -1 : 1) * (offset[4].toLowerCase() === 'w' ? 7 : 1));
    return calendarDayKey(day);
  }
  const until = new RegExp('^days\\s+until\\s+(' + dayPattern + ')$', 'i').exec(text.trim());
  if (!until) return null;
  const day = resolveCalendarDay(until[1], now);
  if (!day) return null;
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return String((utc(day) - utc(now)) / 86_400_000);
}

export function parseQuickCalendarEvent(text: string, now = new Date()): { title: string; start: Date; end: Date } | null {
  const match = new RegExp('^(.+?)\\s+(' + dayPattern + ')\\s+(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?$', 'i').exec(text.trim());
  if (!match) return null;
  const day = resolveCalendarDay(match[2], now);
  let hours = Number(match[3]);
  const minutes = Number(match[4] ?? 0);
  if (!day || minutes > 59 || hours > 23 || (match[5] && (hours < 1 || hours > 12))) return null;
  if (match[5]) hours = hours % 12 + (match[5].toLowerCase() === 'pm' ? 12 : 0);
  day.setHours(hours, minutes);
  if (day.getHours() !== hours || day.getMinutes() !== minutes) return null;
  const end = new Date(day.getTime() + 30 * 60_000);
  if (calendarDayKey(day) !== calendarDayKey(end) || end.getHours() * 60 + end.getMinutes() <= hours * 60 + minutes) return null;
  return { title: match[1].trim(), start: day, end };
}
