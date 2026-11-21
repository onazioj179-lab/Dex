// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React, { useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { openCalendarDraft } from '../../services/calendarDraft';

interface City { id: string; label: string; timezone: string }
const MINUTE = 60_000;
const STEP = 15;
const two = (value: number) => String(value).padStart(2, '0');
const localDay = (date: Date) => [date.getFullYear(), two(date.getMonth() + 1), two(date.getDate())].join('-');
const clockMinutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

export function workingOverlaps(zones: readonly string[], start: Date, end: Date): Array<{ start: number; end: number }> {
  if (zones.length < 2) return [];
  const formatters = zones.map(timeZone => new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }));
  const ranges: Array<{ start: number; end: number }> = [];
  const interval = STEP * MINUTE;
  for (let at = start.getTime(); at + interval <= end.getTime(); at += interval) {
    const fits = formatters.every(formatter => [at, at + interval - 1].every(instant => {
      const parts = formatter.formatToParts(instant);
      const hour = Number(parts.find(part => part.type === 'hour')?.value);
      const day = parts.find(part => part.type === 'weekday')?.value;
      return day !== 'Sat' && day !== 'Sun' && hour >= 9 && hour < 17;
    }));
    if (!fits) continue;
    const previous = ranges[ranges.length - 1];
    if (previous?.end === at) previous.end += interval;
    else ranges.push({ start: at, end: at + interval });
  }
  return ranges;
}

export function MeetingPlanner({ cities, is24h }: { cities: City[]; is24h: boolean }) {
  const [day, setDay] = useState(() => localDay(new Date()));
  const [offset, setOffset] = useState(() => {
    const now = new Date();
    const start = new Date(now).setHours(0, 0, 0, 0);
    return Math.floor((now.getTime() - start) / (MINUTE * STEP)) * STEP;
  });
  const { start, end, overlaps } = useMemo(() => {
    const start = new Date(day + 'T00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, overlaps: workingOverlaps(cities.map(city => city.timezone), start, end) };
  }, [cities, day]);
  const lastSlot = Math.floor(((end.getTime() - start.getTime()) / MINUTE - 1) / STEP) * STEP;
  const minute = Math.min(offset, lastSlot);
  const selected = new Date(start.getTime() + minute * MINUTE);
  const finish = new Date(selected.getTime() + 30 * MINUTE);
  const canSchedule = localDay(finish) === day && clockMinutes(finish) > clockMinutes(selected);
  const localTime = (instant: number | Date) => new Intl.DateTimeFormat(undefined, {
    hour: 'numeric', minute: '2-digit', hour12: !is24h, timeZoneName: 'short',
  }).format(instant);
  const times = cities.map(city => ({
    ...city,
    time: new Intl.DateTimeFormat(undefined, {
      timeZone: city.timezone, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: !is24h, timeZoneName: 'short',
    }).format(selected),
  }));

  return (
    <section aria-label="Meeting planner" style={{ display: 'grid', gap: 10, padding: 12, background: 'var(--color-bg-secondary)', borderRadius: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <input type="date" aria-label="Meeting date" value={day}
          style={{ color: 'var(--color-text-primary)', background: 'var(--color-bg-inset)', border: '1px solid var(--color-border)', padding: '5px 8px' }}
          onChange={event => { if (event.target.value && Number.isFinite(new Date(event.target.value + 'T00:00').getTime())) setDay(event.target.value); }} />
        <input type="range" aria-label="Meeting time" aria-valuetext={localTime(selected)} min={0} max={lastSlot} step={STEP}
          value={minute} onChange={event => setOffset(Number(event.target.value))} />
        <output>{localTime(selected)}</output>
        <Button size="sm" variant="subtle" disabled={!canSchedule}
          title={canSchedule ? undefined : 'Choose a time where the 30-minute meeting fits on the same day'}
          onClick={() => openCalendarDraft({
            start: selected, end: finish, title: 'Meeting',
            description: [selected.toISOString(), ...times.map(city => city.label + ' ' + city.time)].join('\n'),
          })}>Open in Calendar</Button>
      </div>
      <ul aria-label="Time in each city" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, padding: 0, margin: 0, listStyle: 'none' }}>
        {times.map(city => <li key={city.id}><strong>{city.label}</strong><br />{city.time}</li>)}
      </ul>
      {cities.length > 1 && <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span>Shared working hours</span>
        {overlaps.length ? overlaps.map(range => (
          <Button key={range.start} size="sm" onClick={() => setOffset((range.start - start.getTime()) / MINUTE)}>
            {localTime(range.start)} – {localTime(range.end)}
          </Button>
        )) : <span style={{ color: 'var(--color-text-secondary)' }}>No overlap on this date</span>}
      </div>}
    </section>
  );
}
