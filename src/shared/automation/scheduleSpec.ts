// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Plain-English schedule parser (pure). Turns what a user (or UKI) writes —
 * "in 20 minutes", "tomorrow at 9am", "every 2 hours", "weekdays at 08:30",
 * "every monday at 9", "0 9 * * 1-5" — into the scheduled-task engine's
 * once / interval / cron shapes. Anything it cannot read is an error with a
 * hint, never a guess.
 */

import { parseCron } from './cron';

export type ParsedSchedule =
  | { ok: true; kind: 'once'; atMs: number; summary: string }
  | { ok: true; kind: 'interval'; intervalMs: number; summary: string }
  | { ok: true; kind: 'cron'; cron: string; summary: string }
  | { ok: false; error: string };

const MIN = 60_000;
const UNIT_MS: Record<string, number> = {
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: MIN, min: MIN, mins: MIN, minute: MIN, minutes: MIN,
  h: 60 * MIN, hr: 60 * MIN, hrs: 60 * MIN, hour: 60 * MIN, hours: 60 * MIN,
  d: 1440 * MIN, day: 1440 * MIN, days: 1440 * MIN,
  w: 7 * 1440 * MIN, week: 7 * 1440 * MIN, weeks: 7 * 1440 * MIN,
};
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const HINT = 'Try "in 20 minutes", "tomorrow at 9am", "every 2 hours", "weekdays at 08:30", "every monday at 9" or a 5-field cron.';

/** Parse "9", "9am", "9:30", "21:05", "9.30pm", "noon", "midnight". */
export function parseClock(text: string): { h: number; m: number } | null {
  const t = text.trim().toLowerCase();
  if (t === 'noon') return { h: 12, m: 0 };
  if (t === 'midnight') return { h: 0, m: 0 };
  const mm = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(t);
  if (!mm) return null;
  let h = Number(mm[1]);
  const m = mm[2] ? Number(mm[2]) : 0;
  const ap = mm[3]?.replace(/\./g, '');
  if (m > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'am') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h > 23) return null;
  return { h, m };
}

function fmtClock(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtWhen(ms: number, now: number): string {
  const d = new Date(ms);
  const n = new Date(now);
  const sameDay = d.toDateString() === n.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = sameDay ? 'today' : d.toDateString() === tomorrow.toDateString() ? 'tomorrow'
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${day} at ${fmtClock(d.getHours(), d.getMinutes())}`;
}

function amount(n: string): number {
  if (n === 'a' || n === 'an' || n === 'one') return 1;
  return Number(n);
}

/** Parse a schedule. `now` is epoch ms (local time zone is used for clock times). */
export function parseScheduleSpec(input: string, now: number): ParsedSchedule {
  const raw = String(input ?? '').trim();
  const t = raw.toLowerCase().replace(/\s+/g, ' ').replace(/[.,!]$/, '');
  if (!t) return { ok: false, error: `No time given. ${HINT}` };

  // Raw 5-field cron.
  if (/^[\d*/,-]+( [\d*/,-]+){4}$/.test(t)) {
    try { parseCron(t); } catch (e) { return { ok: false, error: `Invalid cron "${raw}": ${(e as Error).message}` }; }
    return { ok: true, kind: 'cron', cron: t, summary: `cron ${t}` };
  }

  // in N units  /  in an hour
  let m = /^in (\d+(?:\.\d+)?|an?|one) ([a-z]+)$/.exec(t);
  if (m) {
    const unit = UNIT_MS[m[2]];
    const n = amount(m[1]);
    if (!unit || !(n > 0)) return { ok: false, error: `Unknown duration "${raw}". ${HINT}` };
    const atMs = now + Math.round(n * unit);
    if (atMs - now < 1000) return { ok: false, error: 'That is too soon.' };
    return { ok: true, kind: 'once', atMs, summary: `once, ${fmtWhen(atMs, now)}` };
  }

  // every N units / every hour / hourly
  if (t === 'hourly') return { ok: true, kind: 'interval', intervalMs: 60 * MIN, summary: 'every 1 hr' };
  m = /^every (\d+(?:\.\d+)?|an?|one)? ?([a-z]+)$/.exec(t);
  if (m && UNIT_MS[m[2]]) {
    const n = m[1] ? amount(m[1]) : 1;
    const ms = Math.round(n * UNIT_MS[m[2]]);
    if (!(ms >= MIN)) return { ok: false, error: 'Repeating tasks run at most once a minute.' };
    return { ok: true, kind: 'interval', intervalMs: ms, summary: `every ${n} ${m[2].replace(/s$/, '')}${n === 1 ? '' : 's'}` };
  }

  // (every day | daily | weekdays | weekends | every <weekday>) at <clock>
  m = /^(every day|daily|each day|every weekday|weekdays|on weekdays|every weekend|weekends|on weekends|every ([a-z]+?)s?|on ([a-z]+?)s) (?:at )?(.+)$/.exec(t);
  if (m) {
    const clock = parseClock(m[4]);
    if (!clock) return { ok: false, error: `Could not read the time "${m[4]}". ${HINT}` };
    let dow = '*';
    let label = 'every day';
    const phrase = m[1];
    if (/weekday/.test(phrase)) { dow = '1-5'; label = 'weekdays'; }
    else if (/weekend/.test(phrase)) { dow = '0,6'; label = 'weekends'; }
    else if (m[2] || m[3]) {
      const name = (m[2] || m[3])!;
      const idx = DAYS.findIndex((d) => d === name || d.startsWith(name) && name.length >= 3);
      if (idx < 0) return { ok: false, error: `Unknown day "${name}". ${HINT}` };
      dow = String(idx); label = `every ${DAYS[idx][0].toUpperCase()}${DAYS[idx].slice(1)}`;
    }
    const cron = `${clock.m} ${clock.h} * * ${dow}`;
    return { ok: true, kind: 'cron', cron, summary: `${label} at ${fmtClock(clock.h, clock.m)}` };
  }

  // [today|tomorrow|<weekday>] at <clock>   /   at <clock>   /   <clock> tomorrow
  m = /^(?:(today|tonight|tomorrow|next [a-z]+|on [a-z]+|[a-z]+day) )?(?:at )?([0-9:.apm ]+|noon|midnight)(?: (today|tomorrow))?$/.exec(t);
  if (m) {
    const clock = parseClock(m[2]);
    if (clock) {
      const dayWord = (m[1] || m[3] || '').replace(/^(next|on) /, '');
      const d = new Date(now);
      d.setSeconds(0, 0);
      d.setHours(clock.h, clock.m);
      if (dayWord === 'tomorrow') d.setDate(d.getDate() + 1);
      else if (dayWord && dayWord !== 'today' && dayWord !== 'tonight') {
        const idx = DAYS.findIndex((x) => x === dayWord || x.startsWith(dayWord) && dayWord.length >= 3);
        if (idx < 0) return { ok: false, error: `Unknown day "${dayWord}". ${HINT}` };
        let add = (idx - d.getDay() + 7) % 7;
        if (add === 0 && d.getTime() <= now) add = 7;
        d.setDate(d.getDate() + add);
      } else if (d.getTime() <= now) {
        if (dayWord === 'today' || dayWord === 'tonight') return { ok: false, error: `${fmtClock(clock.h, clock.m)} today has already passed.` };
        d.setDate(d.getDate() + 1); // bare "at 9" means the next 9:00
      }
      return { ok: true, kind: 'once', atMs: d.getTime(), summary: `once, ${fmtWhen(d.getTime(), now)}` };
    }
  }

  // ISO-ish date time: 2026-11-12 09:00 / 2026-11-12T09:00
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?$/.exec(t);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 9, m[5] ? Number(m[5]) : 0);
    if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1) return { ok: false, error: `Invalid date "${raw}".` };
    if (d.getTime() <= now) return { ok: false, error: `${raw} is in the past.` };
    return { ok: true, kind: 'once', atMs: d.getTime(), summary: `once, ${fmtWhen(d.getTime(), now)}` };
  }

  return { ok: false, error: `Could not read "${raw}". ${HINT}` };
}
