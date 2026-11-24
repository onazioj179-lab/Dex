/**
 * DEX Platform - Calendar
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Apple-Calendar-inspired event manager with month / week views,
 * drag-to-create slots, recurring events, and ICS import/export.
 */
import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { notify } from '../../services/notify';
import { CALENDAR_DRAFT_EVENT, takeCalendarDraft } from '../../services/calendarDraft';
import { AssistedTextarea } from '../../components/AssistedTextarea';
import { useAppTracking } from '../../services/usePatternLearning';
import DexIcon from '../../components/DexIcon';
import { findEventConflicts } from '../../../shared/calendar/eventConflicts';
import { occursOn, readExcludedDates, type RecurringDate } from '../../../shared/calendar/recurrence';
import { calendarDayKey as formatDate, parseQuickCalendarEvent } from '../../../shared/time/naturalCalendar';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { keyEventForApp } from '../../shell/input/appKeyScope';
import { persistOrWarn } from '../../utils/persistOrWarn';

interface CalendarEvent extends RecurringDate {
  id: string;
  title: string;
  time: string;
  endTime: string;
  color: string;
  description: string;
  icon?: string;
  /** Category id (see CATEGORIES). Older stored events have none -> treated as 'general'. */
  category?: string;
  /** Alert this many minutes before the start (services/calendarReminders). Absent = no alert. */
  alertMinutes?: number | null;
}

const ALERT_CHOICES: { value: number | null; label: string }[] = [
  { value: null, label: 'No alert' }, { value: 0, label: 'At start' }, { value: 5, label: '5 min before' },
  { value: 15, label: '15 min before' }, { value: 30, label: '30 min before' }, { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

interface Category {
  id: string;
  name: string;
  color: string;
}

// Built-in colour-coded categories. The colour drives the calendar accents when an
// event has no explicit colour override (legacy events keep their stored colour).
const CATEGORIES: Category[] = [
  { id: 'general', name: 'General', color: 'var(--color-accent)' },
  { id: 'work', name: 'Work', color: '#bf5af2' },
  { id: 'personal', name: 'Personal', color: 'var(--color-success)' },
  { id: 'health', name: 'Health', color: '#ff2d55' },
  { id: 'social', name: 'Social', color: '#64d2ff' },
  { id: 'travel', name: 'Travel', color: 'var(--color-warning)' },
];

const eventClock = (date: Date) => [date.getHours(), date.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });

const Calendar: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('calendar');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [eventDate, setEventDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [view, setView] = useState<'month' | 'week' | 'day' | 'agenda'>('month');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Id of the event currently being edited (inline editor reuses the modal). null = new.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOccurrence, setEditingOccurrence] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quickEvent, setQuickEvent] = useState('');
  const [quickError, setQuickError] = useState(false);
  // Set of category ids that are hidden from rendering (toggle visibility).
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  // How many days the agenda view looks ahead.
  const AGENDA_DAYS = 14;
  // Working-hours overlay: shade hours outside [start, end) and dim weekends on
  // the time-grid (week/day) views. Toggleable; bounds persisted in localStorage.
  const WORK_START = 9;
  const WORK_END = 18;
  const [showWorkingHours, setShowWorkingHours] = useState(true);
  // Is this hour outside configured working hours? (used for shading)
  const isOffHour = (hour: number) => hour < WORK_START || hour >= WORK_END;
  // Sat (6) / Sun (0) -> weekend, dimmed in the grid.
  const isWeekend = (date: Date) => { const d = date.getDay(); return d === 0 || d === 6; };
  const [newEvent, setNewEvent] = useState({
    title: '',
    time: '09:00',
    endTime: '10:00',
    color: 'var(--color-accent)',
    description: '',
    recurring: 'none' as CalendarEvent['recurring'],
    icon: '',
    category: 'general',
    recurUntil: '',
    alertMinutes: null as number | null,
  });

  const colors = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-error)', '#bf5af2', '#ff2d55', '#64d2ff'];
  // Event icons use the DexIcon glyph set (no emoji, per project rules). Names
  // chosen to avoid the legacy alias map so they render as-is.
  const eventIcons = ['calendar', 'users', 'video', 'music', 'film', 'tv', 'gamepad', 'gift', 'code', 'palette', 'bell', 'map-pin'];
  // Week is Monday-first to match the calendar grid design.
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  useEffect(() => {
    (async () => {
      try {
        if ((window as any).dex?.invoke) {
          const stored = await (window as any).dex.invoke('capability:storage:get', 'dex-calendar-events');
          if (Array.isArray(stored)) { setEvents(stored); setEventsLoaded(true); return; }
        }
      } catch (e) { console.warn('[DEX]', e); }
      try {
        const saved = localStorage.getItem('dex-calendar-events');
        const parsed: unknown = saved && JSON.parse(saved);
        if (Array.isArray(parsed)) setEvents(parsed);
      } catch (e) {
        console.warn('[Calendar] Failed to load events:', e);
      } finally {
        setEventsLoaded(true);
      }
    })();
    // Restore the working-hours overlay preference.
    try {
      const pref = localStorage.getItem('dex-calendar-working-hours');
      if (pref !== null) setShowWorkingHours(pref === '1');
    } catch (e) { console.warn('[DEX]', e); }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('dex-calendar-working-hours', showWorkingHours ? '1' : '0'); } catch (e) { console.warn('[DEX]', e); }
  }, [showWorkingHours]);

  useEffect(() => {
    if (!eventsLoaded) return;
    try {
      persistOrWarn('dex-calendar-events', JSON.stringify(events), 'your calendar events');
    } catch (e) { console.warn('[DEX]', e); }
    (async () => {
      try {
        if ((window as any).dex?.invoke) {
          await (window as any).dex.invoke('capability:storage:set', 'dex-calendar-events', events);
        }
      } catch (e) { console.warn('[DEX]', e); }
    })();
  }, [events, eventsLoaded]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Monday-first offset: Mon=0 ... Sun=6.
    const startingDay = (firstDay.getDay() + 6) % 7;
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  // Format as a LOCAL calendar day (YYYY-MM-DD). Using toISOString() here would
  // convert to UTC first, which lands on the wrong day for any timezone whose
  // local date differs from UTC at the current moment (e.g. evenings in the
  // Americas) — that caused the "today" marker and event matching to be off by
  // one day. The grid cells are built with local-time `new Date(y, m, d)`, so
  // identity comparisons must be local too.
  const eventCategory = (e: CalendarEvent): string => e.category || 'general';
  const isCategoryVisible = (e: CalendarEvent) => !hiddenCategories.has(eventCategory(e));
  const query = search.trim().toLowerCase();
  const matchesSearch = (e: CalendarEvent) =>
    !query || e.title.toLowerCase().includes(query) || e.description?.toLowerCase().includes(query);

  const getEventsForDate = (date: Date) =>
    events
      .filter(e => isCategoryVisible(e) && matchesSearch(e) && occursOn(e, date))
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

  const isToday = (date: Date) => formatDate(date) === formatDate(new Date());
  const isSelected = (date: Date) => selectedDate && formatDate(date) === formatDate(selectedDate);
  // Index of today's weekday in the Monday-first header (Mon=0 ... Sun=6).
  const todayDow = (new Date().getDay() + 6) % 7;

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getWeekDates = (date: Date): Date[] => {
    const start = getWeekStart(date);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  };

  const getEventsForDateAndHour = (date: Date, hour: number): CalendarEvent[] => {
    return events.filter(e => {
      if (!isCategoryVisible(e) || !matchesSearch(e)) return false;
      if (!occursOn(e, date)) return false;
      const eventHour = parseInt(e.time.split(':')[0], 10);
      return eventHour === hour;
    });
  };

  // "HH:MM" -> minutes from midnight; tolerant of malformed input.
  const toMinutes = (t: string): number => {
    const [h, m] = (t || '').split(':');
    return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
  };

  // Ids of events that overlap another event on the same day (double-booked).
  const conflictIds = useMemo(
    () => findEventConflicts(events.map(e => ({
      id: e.id,
      date: e.date,
      start: toMinutes(e.time),
      end: Math.max(toMinutes(e.endTime), toMinutes(e.time) + 1),
    }))),
    [events],
  );

  const resetNewEvent = () => setNewEvent({
    title: '', time: '09:00', endTime: '10:00', color: 'var(--color-accent)',
    description: '', recurring: 'none', icon: '', category: 'general', recurUntil: '', alertMinutes: null,
  });

  // Open the inline editor pre-filled for a brand new event on `date`.
  const openNewEvent = (date: Date, time?: string, endTime?: string) => {
    setEditingId(null);
    setEditingOccurrence(null);
    setSelectedDate(date);
    setEventDate(date);
    setNewEvent(prev => ({
      ...prev,
      title: '', description: '', icon: '',
      time: time ?? '09:00',
      endTime: endTime ?? '10:00',
    }));
    setShowEventModal(true);
  };

  useEffect(() => {
    if (showEventModal) return;
    const applyDraft = () => {
      const draft = takeCalendarDraft();
      if (!draft) return;
      setEditingId(null);
      setEditingOccurrence(null);
      setCurrentDate(draft.start);
      setSelectedDate(draft.start);
      setEventDate(draft.start);
      setNewEvent({
        title: draft.title, description: draft.description, time: eventClock(draft.start), endTime: eventClock(draft.end),
        color: 'var(--color-accent)', icon: '', recurring: 'none', category: 'general', recurUntil: '', alertMinutes: null,
      });
      setShowEventModal(true);
    };
    applyDraft();
    window.addEventListener(CALENDAR_DRAFT_EVENT, applyDraft);
    return () => window.removeEventListener(CALENDAR_DRAFT_EVENT, applyDraft);
  }, [showEventModal]);

  // Open the inline editor pre-filled with an existing event for editing.
  const openEditEvent = (e: CalendarEvent, occurrence: Date) => {
    setEditingId(e.id);
    setEditingOccurrence(formatDate(occurrence));
    setEventDate(new Date(e.date + 'T00:00:00'));
    setNewEvent({
      title: e.title,
      time: e.time,
      endTime: e.endTime,
      color: e.color,
      description: e.description || '',
      recurring: e.recurring || 'none',
      icon: e.icon || '',
      category: e.category || 'general',
      recurUntil: e.recurUntil || '',
      alertMinutes: e.alertMinutes ?? null,
    });
    setShowEventModal(true);
  };

  const openQuickEvent = (event: React.FormEvent) => {
    event.preventDefault();
    const draft = parseQuickCalendarEvent(quickEvent);
    if (!draft) {
      setQuickError(true);
      return;
    }
    setQuickError(false);
    setQuickEvent('');
    setCurrentDate(draft.start);
    if (view === 'agenda') setView('day');
    openNewEvent(draft.start, eventClock(draft.start), eventClock(draft.end));
    setNewEvent(previous => ({ ...previous, title: draft.title }));
  };

  const handleSaveEvent = () => {
    if (!eventsLoaded) return;
    if (!newEvent.title.trim()) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Event needs a title' } }));
      return;
    }
    if (toMinutes(newEvent.endTime) <= toMinutes(newEvent.time)) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'End time must be after start time' } }));
      return;
    }

    const base = {
      title: newEvent.title.trim(),
      date: formatDate(eventDate),
      time: newEvent.time,
      endTime: newEvent.endTime,
      color: newEvent.color,
      description: newEvent.description,
      recurring: newEvent.recurring,
      icon: newEvent.icon || undefined,
      category: newEvent.category,
      recurUntil: newEvent.recurring && newEvent.recurring !== 'none' ? (newEvent.recurUntil || undefined) : undefined,
      alertMinutes: newEvent.alertMinutes ?? undefined,
    };

    if (editingId) {
      setEvents(prev => prev.map(e => (e.id === editingId ? { ...e, ...base, excludedDates: base.recurring === 'none' ? undefined : e.excludedDates } : e)));
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Event updated' } }));
    } else {
      const event: CalendarEvent = { id: Date.now().toString(), ...base };
      setEvents(prev => [...prev, event]);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'calendarEventsCreated', amount: 1 } }));
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Event created' } }));
    }

    resetNewEvent();
    setEditingId(null);
    setShowEventModal(false);
  };

  const closeModal = () => {
    setShowEventModal(false);
    setEditingId(null);
    setEditingOccurrence(null);
    resetNewEvent();
  };

  const setOccurrenceSkipped = (id: string, day: string, skip: boolean) => {
    setEvents(previous => previous.map(event => {
      if (event.id !== id) return event;
      const dates = new Set(event.excludedDates);
      if (skip) dates.add(day);
      else dates.delete(day);
      return { ...event, excludedDates: [...dates].sort() };
    }));
    if (skip) closeModal();
  };

  const deleteEvent = (id: string) => {
    const idx = events.findIndex(e => e.id === id);
    if (idx < 0) return;
    const removed = events[idx];
    setEvents(prev => prev.filter(e => e.id !== id));
    // Recoverable: Undo puts the event back.
    void notify({
      title: 'Event deleted',
      body: removed.title,
      source: 'Calendar',
      priority: 'low',
      undo: () => setEvents(prev => prev.some(e => e.id === removed.id) ? prev : [...prev.slice(0, idx), removed, ...prev.slice(idx)]),
    });
  };

  const toggleCategory = (id: string) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Flatten the next AGENDA_DAYS days of (visible, search-matched) events for the agenda view.
  const agendaItems = useMemo(() => {
    const out: { date: Date; event: CalendarEvent }[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < AGENDA_DAYS; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      getEventsForDate(d).forEach(event => out.push({ date: d, event }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, hiddenCategories, search]);

  // Drag-to-create state (week view)
  const [dragStart, setDragStart] = useState<{ date: Date; hour: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ date: Date; hour: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (date: Date, hour: number) => {
    setDragStart({ date, hour });
    setDragEnd({ date, hour });
    setIsDragging(true);
  };

  const handleDragMove = (date: Date, hour: number) => {
    if (!isDragging || !dragStart) return;
    if (formatDate(date) === formatDate(dragStart.date)) {
      setDragEnd({ date, hour });
    }
  };

  const handleDragEnd = () => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    const startHour = Math.min(dragStart.hour, dragEnd.hour);
    const endHour = Math.max(dragStart.hour, dragEnd.hour) + 1;
    openNewEvent(
      dragStart.date,
      startHour.toString().padStart(2, '0') + ':00',
      Math.min(endHour, 23).toString().padStart(2, '0') + ':00',
    );
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  const isInDragRange = (date: Date, hour: number): boolean => {
    if (!isDragging || !dragStart || !dragEnd) return false;
    if (formatDate(date) !== formatDate(dragStart.date)) return false;
    const minH = Math.min(dragStart.hour, dragEnd.hour);
    const maxH = Math.max(dragStart.hour, dragEnd.hour);
    return hour >= minH && hour <= maxH;
  };

  const navigate = (dir: number) => {
    const newDate = new Date(currentDate);
    if (view === 'week') {
      newDate.setDate(newDate.getDate() + dir * 7);
    } else if (view === 'day') {
      newDate.setDate(newDate.getDate() + dir);
      setSelectedDate(new Date(newDate));
    } else {
      newDate.setMonth(newDate.getMonth() + dir);
    }
    setCurrentDate(newDate);
  };

  const pageMiniMonth = (dir: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
    setCurrentDate(date);
    setSelectedDate(date);
    if (view === 'agenda') setView('month');
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  // Jump to a specific date from the date picker. Aligns selection + visible range.
  const jumpToDate = (value: string) => {
    if (!value) return;
    const d = new Date(value + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    setCurrentDate(d);
    setSelectedDate(d);
  };

  // Keyboard navigation: arrow keys page the view, "t" jumps to today. Ignored
  // while typing in an input/textarea or when the editor modal is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'calendar')) return; // key meant for another app
      if (showEventModal) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
      else if (e.key === 't' || e.key === 'T') { goToToday(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentDate, showEventModal]);

  // ICS export ------------------------------------------------------------
  // Escape per RFC 5545: backslash, comma, semicolon, and newlines must be
  // escaped inside SUMMARY/DESCRIPTION text values.
  const icsEscape = (s: string): string =>
    (s || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');

  // UTC timestamp stamp (DTSTAMP) in basic ICS form, e.g. 20260101T120000Z.
  const icsStamp = (): string => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  };

  // Build the VEVENT block lines for one event (local floating times, no Z).
  const buildVEvent = (e: CalendarEvent): string[] => {
    const dateClean = e.date.replace(/-/g, '');
    const timeClean = e.time.replace(':', '') + '00';
    const endClean = e.endTime.replace(':', '') + '00';
    const out = [
      'BEGIN:VEVENT',
      `UID:${e.id}@dex`,
      `DTSTAMP:${icsStamp()}`,
      `DTSTART:${dateClean}T${timeClean}`,
      `DTEND:${dateClean}T${endClean}`,
      `SUMMARY:${icsEscape(e.title)}`,
    ];
    if (e.description) out.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.category) out.push(`CATEGORIES:${icsEscape(eventCategory(e))}`);
    if (e.recurring && e.recurring !== 'none') {
      let rule = `RRULE:FREQ=${e.recurring.toUpperCase()}`;
      if (e.recurUntil) rule += `;UNTIL=${e.recurUntil.replace(/-/g, '')}T235959`;
      out.push(rule);
      e.excludedDates?.forEach(day => out.push('EXDATE:' + day.replace(/-/g, '') + 'T' + timeClean));
    }
    out.push('END:VEVENT');
    return out;
  };

  // Wrap VEVENT blocks in a VCALENDAR envelope and trigger a Blob download.
  const downloadICS = (vevents: CalendarEvent[], filename: string) => {
    try {
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DEX//Calendar//EN', 'CALSCALE:GREGORIAN'];
      vevents.forEach(e => lines.push(...buildVEvent(e)));
      lines.push('END:VCALENDAR');
      const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Exported ${vevents.length} event${vevents.length === 1 ? '' : 's'}` } }));
    } catch (err) {
      console.warn('[Calendar] ICS export failed:', err);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Export failed' } }));
    }
  };

  // Export every stored event.
  const exportICS = () => downloadICS(events, 'dex-calendar.ics');

  // Export a single event (used from the editor footer + day list).
  const exportEventICS = (e: CalendarEvent) => {
    const safe = (e.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
    downloadICS([e], `dex-${safe}.ics`);
  };

  // Export only the events occurring within the currently visible range
  // (month / week / day). Recurring instances are materialised per-day so the
  // exported file reflects what the user actually sees.
  const exportVisibleRange = () => {
    try {
      let rangeStart: Date;
      let rangeEnd: Date;
      if (view === 'week') {
        const wd = getWeekDates(currentDate);
        rangeStart = wd[0]; rangeEnd = wd[6];
      } else if (view === 'day') {
        rangeStart = new Date(currentDate); rangeEnd = new Date(currentDate);
      } else if (view === 'agenda') {
        rangeStart = new Date(); rangeStart.setHours(0, 0, 0, 0);
        rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeStart.getDate() + AGENDA_DAYS - 1);
      } else {
        rangeStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        rangeEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      }
      // Walk each day in the range, emit one concrete VEVENT per occurrence.
      const out: CalendarEvent[] = [];
      const seen = new Set<string>();
      const cursor = new Date(rangeStart);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= rangeEnd) {
        getEventsForDate(cursor).forEach(e => {
          const occDate = formatDate(cursor);
          const key = e.id + occDate;
          if (seen.has(key)) return;
          seen.add(key);
          // Pin recurring occurrences to their concrete day; one-offs unchanged.
          out.push({ ...e, date: occDate, recurring: 'none', recurUntil: undefined, excludedDates: undefined, id: `${e.id}-${occDate}` });
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      if (out.length === 0) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'No events in the visible range' } }));
        return;
      }
      downloadICS(out, `dex-calendar-${formatDate(rangeStart)}.ics`);
    } catch (err) {
      console.warn('[Calendar] Range export failed:', err);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Export failed' } }));
    }
  };

  // Duplicate an event (one-click copy). The copy lands on the same day with a
  // "(copy)" suffix and a fresh id, then is selected for quick editing.
  const duplicateEvent = (e: CalendarEvent) => {
    try {
      const copy: CalendarEvent = {
        ...e,
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        title: `${e.title} (copy)`,
      };
      setEvents(prev => [...prev, copy]);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Event duplicated' } }));
    } catch (err) {
      console.warn('[Calendar] Duplicate failed:', err);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Could not duplicate' } }));
    }
  };

  // Quick reschedule: shift an event's date forward by `days` (e.g. +1 / +7).
  const rescheduleEvent = (e: CalendarEvent, days: number) => {
    try {
      const d = new Date(e.date + 'T00:00:00');
      if (isNaN(d.getTime())) return;
      d.setDate(d.getDate() + days);
      const newDate = formatDate(d);
      setEvents(prev => prev.map(ev => (ev.id === e.id ? { ...ev, date: newDate } : ev)));
      const label = days === 1 ? 'tomorrow' : days === 7 ? 'next week' : `+${days}d`;
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Moved to ${label}` } }));
    } catch (err) {
      console.warn('[Calendar] Reschedule failed:', err);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Could not reschedule' } }));
    }
  };

  // ICS import
  const importICS = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics';
    input.onchange = async () => {
      try {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported: CalendarEvent[] = [];
      const vevents = text.split('BEGIN:VEVENT');
      for (let i = 1; i < vevents.length; i++) {
        const block = vevents[i];
        const get = (key: string) => {
          const match = block.match(new RegExp(`${key}[^:]*:(.+)`));
          return match?.[1]?.trim() || '';
        };
        const dtstart = get('DTSTART');
        const dtend = get('DTEND');
        const summary = get('SUMMARY');
        const desc = get('DESCRIPTION');
        const rrule = get('RRULE');
        const catRaw = get('CATEGORIES').toLowerCase();
        const category = CATEGORIES.some(c => c.id === catRaw) ? catRaw : 'general';
        if (!summary || !dtstart) continue;
        const date = dtstart.length >= 8 ? `${dtstart.slice(0,4)}-${dtstart.slice(4,6)}-${dtstart.slice(6,8)}` : '';
        // Skip entries that didn't yield a usable calendar day; importing an
        // event with an empty date would make it un-renderable and unmatchable.
        if (!date) continue;
        const time = dtstart.length >= 13 ? `${dtstart.slice(9,11)}:${dtstart.slice(11,13)}` : '09:00';
        const endTime = dtend.length >= 13 ? `${dtend.slice(9,11)}:${dtend.slice(11,13)}` : '10:00';
        let recurring: CalendarEvent['recurring'] = 'none';
        if (rrule.includes('DAILY')) recurring = 'daily';
        else if (rrule.includes('WEEKLY')) recurring = 'weekly';
        else if (rrule.includes('MONTHLY')) recurring = 'monthly';
        else if (rrule.includes('YEARLY')) recurring = 'yearly';
        const catColor = CATEGORIES.find(c => c.id === category)?.color || 'var(--color-accent)';
        imported.push({ id: Date.now().toString() + i, title: summary, date, time, endTime, color: catColor, description: desc, recurring, category,
          recurUntil: /(?:^|;)UNTIL=(\d{4})(\d{2})(\d{2})/.exec(rrule)?.slice(1).join('-'),
          excludedDates: recurring === 'none' ? undefined : readExcludedDates(block),
        });
      }
      if (imported.length > 0) {
        setEvents(prev => [...prev, ...imported]);
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Imported ${imported.length} event${imported.length === 1 ? '' : 's'}` } }));
      } else {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'No events found in file' } }));
      }
      } catch (err) {
        console.warn('[Calendar] ICS import failed:', err);
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Import failed' } }));
      }
    };
    input.click();
  };

  // -- uki context: let the assistant see the calendar view + selection.
  // Registered once on mount; a latest-value ref (refreshed each render) keeps
  // the pure resolver reading live state without re-registering.
  const selectedDayEventCount = selectedDate ? getEventsForDate(selectedDate).length : 0;
  const ukiCtxRef = useRef({ view, selectedDate, currentDate, events, search, selectedDayEventCount });
  useEffect(() => { ukiCtxRef.current = { view, selectedDate, currentDate, events, search, selectedDayEventCount }; });
  useEffect(() => {
    registerUkiAppContext('calendar', () => {
      const c = ukiCtxRef.current;
      const selectedStr = c.selectedDate ? formatDate(c.selectedDate) : undefined;
      return {
        appId: 'calendar',
        focusedItemId: selectedStr,
        custom: {
          view: c.view,
          selectedDate: selectedStr,
          visibleDate: formatDate(c.currentDate),
          eventsOnSelectedDay: c.selectedDayEventCount,
          totalEvents: c.events.length,
          search: c.search || undefined,
        },
      };
    });
    // Let UKI read the calendar's events as a callable action (read-only).
    registerUkiAppAction('calendar', {
      id: 'calendar.listEvents',
      description: 'list calendar events with their date, time and title.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ukiCtxRef.current;
      if (!c.events.length) return 'No events on the calendar.';
      const sorted = [...c.events]
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .slice(0, 60);
      return sorted.map((e) => `${e.date}${e.time ? ` ${e.time}` : ''} — ${e.title}`).join('\n');
    });
    // UKI can ADD an event (mutating -> confirm-gated).
    registerUkiAppAction('calendar', {
      id: 'calendar.addEvent',
      description: 'add a calendar event on a date (YYYY-MM-DD) with a title and optional time (HH:MM).',
      args: [
        { name: 'title', type: 'string' },
        { name: 'date', type: 'string' },
        { name: 'time', type: 'string', optional: true },
      ],
      example: '{"title":"Dentist","date":"2026-07-02","time":"14:30"}',
      mutates: true,
    }, (args) => {
      const title = String(args.title ?? '').trim();
      const date = String(args.date ?? '').trim();
      if (!title || !date) return 'Need a title and a date (YYYY-MM-DD).';
      const time = String(args.time ?? '').trim();
      const newEvent: CalendarEvent = {
        id: crypto.randomUUID(),
        title,
        date,
        time: time || '09:00',
        endTime: '',
        color: '#0A84FF',
        description: '',
      };
      setEvents((prev) => [...prev, newEvent]);
      return `Added "${title}" on ${date}${time ? ` at ${time}` : ''}.`;
    });
    return () => {
      unregisterUkiAppContext('calendar');
      unregisterUkiAppAction('calendar.listEvents');
      unregisterUkiAppAction('calendar.addEvent');
    };
  }, []);

  return (
    <div style={styles.container} role="region" aria-label="Calendar">
      <style>{`
        @keyframes cal-view-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cal-modal-in { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes cal-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        .cal-view-anim { animation: cal-view-fade 0.18s cubic-bezier(0.25,0.1,0.25,1); }
        .cal-overlay-anim { animation: cal-overlay-in 0.16s ease; }
        .cal-modal-anim { animation: cal-modal-in 0.2s cubic-bezier(0.16,1,0.3,1); }
        .cal-icon-btn { outline: none; }
        .cal-icon-btn:hover { background: var(--color-border-subtle) !important; color: var(--color-text-primary) !important; }
        .cal-icon-btn:active { transform: scale(0.94); }
        .cal-pill:hover { background: var(--color-border-subtle) !important; color: var(--color-text-primary) !important; }
        .cal-pill:active { transform: scale(0.97); }
        .cal-add:hover { filter: brightness(1.1); }
        .cal-add:active { transform: scale(0.95); }
        .cal-daycell:hover { background: var(--color-bg-hover) !important; border-color: var(--color-border-default) !important; }
        .cal-mini-day:hover { background: var(--color-bg-hover) !important; color: var(--color-text-primary) !important; }
        .cal-event-row:hover { border-color: var(--color-border-strong) !important; }
        .cal-agenda-row:hover { border-color: var(--color-border-strong) !important; }
        .cal-cat-row:hover { background: var(--color-bg-hover) !important; }
        .cal-mini-action:hover { background: var(--color-border-subtle) !important; color: var(--color-text-secondary) !important; }
        .cal-week-event:hover { filter: brightness(1.08); }
        .cal-save:hover { filter: brightness(1.1); }
        .cal-save:active { transform: scale(0.97); }
        .cal-cancel:hover { background: var(--color-bg-hover) !important; color: var(--color-text-primary) !important; }
        .cal-chip-input:focus-within { border-color: var(--color-border-strong) !important; }
      `}</style>
      {/* Header */}
      <div className="dex-liquid-glass" style={styles.header}>
        <div style={styles.headerLeft}>
          {/* Sidebar toggle lives in the toolbar (it used to float over the sidebar). */}
          <button className="cal-icon-btn" style={styles.navBtn} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle sidebar" aria-pressed={!sidebarCollapsed} title="Toggle sidebar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
          <button className="cal-pill" style={styles.todayBtn} onClick={goToToday} aria-label="Go to today">Today</button>
          <div style={styles.navBtns}>
            <button className="cal-icon-btn" style={styles.navBtn} onClick={() => navigate(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'} title={view === 'week' ? 'Previous week' : 'Previous month'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button className="cal-icon-btn" style={styles.navBtn} onClick={() => navigate(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'} title={view === 'week' ? 'Next week' : 'Next month'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
          <h1 style={styles.title}>
            {view === 'week'
              ? (() => {
                  const wd = getWeekDates(currentDate);
                  const s = wd[0], e = wd[6];
                  return s.getMonth() === e.getMonth()
                    ? `${months[s.getMonth()]} ${s.getDate()} \u2013 ${e.getDate()}, ${s.getFullYear()}`
                    : `${months[s.getMonth()].slice(0,3)} ${s.getDate()} \u2013 ${months[e.getMonth()].slice(0,3)} ${e.getDate()}, ${e.getFullYear()}`;
                })()
              : view === 'day'
              ? currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
              : view === 'agenda'
              ? `Next ${AGENDA_DAYS} Days`
              : `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`
            }
          </h1>
          <input
            style={styles.jumpDate}
            type="date"
            value={formatDate(currentDate)}
            onChange={e => jumpToDate(e.target.value)}
            aria-label="Jump to date"
            title="Jump to date"
          />
        </div>
        <div style={styles.headerRight}>
          <div className="cal-chip-input" style={styles.searchWrap}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              style={styles.searchInput}
              type="text"
              placeholder="Search events and notes"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search events and notes"
            />
            {search && (
              <button style={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear search"><DexIcon name="close" size={11} /></button>
            )}
          </div>
          <div style={styles.viewToggle}>
            <button className="cal-pill" style={{ ...styles.viewBtn, ...(view === 'month' ? styles.viewBtnActive : {}) }} onClick={() => setView('month')} aria-label="Month view" aria-pressed={view === 'month'}>Month</button>
            <button className="cal-pill" style={{ ...styles.viewBtn, ...(view === 'week' ? styles.viewBtnActive : {}) }} onClick={() => setView('week')} aria-label="Week view" aria-pressed={view === 'week'}>Week</button>
            <button className="cal-pill" style={{ ...styles.viewBtn, ...(view === 'day' ? styles.viewBtnActive : {}) }} onClick={() => setView('day')} aria-label="Day view" aria-pressed={view === 'day'}>Day</button>
            <button className="cal-pill" style={{ ...styles.viewBtn, ...(view === 'agenda' ? styles.viewBtnActive : {}) }} onClick={() => setView('agenda')} aria-label="Agenda view" aria-pressed={view === 'agenda'}>Agenda</button>
          </div>
          <button className="cal-add" style={styles.addBtn} onClick={() => openNewEvent(selectedDate || new Date())} aria-label="Add event" title="Add event">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          {(view === 'week' || view === 'day') && (
            <button
              className="cal-pill"
              style={{ ...styles.todayBtn, marginLeft: 4, ...(showWorkingHours ? styles.viewBtnActive : {}) }}
              onClick={() => setShowWorkingHours(v => !v)}
              aria-pressed={showWorkingHours}
              aria-label="Toggle working hours overlay"
              title={`${showWorkingHours ? 'Hide' : 'Show'} working-hours overlay (${formatHour(WORK_START)}–${formatHour(WORK_END)})`}
            >
              Hours
            </button>
          )}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button className="cal-icon-btn" style={styles.navBtn} onClick={() => setMoreOpen(v => !v)} aria-label="More" aria-haspopup="menu" aria-expanded={moreOpen} title="Import / export">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
            </button>
            {moreOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMoreOpen(false)} />
                <div role="menu" className="dex-liquid-glass-strong" style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 41, minWidth: 200, padding: 4,
                  borderRadius: 10, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,0.35))',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {[
                    { label: 'Export visible range…', run: exportVisibleRange },
                    { label: 'Export all events…', run: exportICS },
                    { label: 'Import .ics…', run: importICS },
                  ].map(it => (
                    <button key={it.label} role="menuitem" className="cal-cat-row"
                      onClick={() => { setMoreOpen(false); it.run(); }}
                      style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 12.5, cursor: 'pointer' }}>
                      {it.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      <form style={styles.quickForm} onSubmit={openQuickEvent}>
        <input className="cal-input" style={{ ...styles.searchInput, minWidth: 0, flex: '1 1 170px' }}
          aria-label="Quick add event" placeholder="Lunch Fri 12" maxLength={200}
          aria-invalid={quickError} aria-describedby={quickError ? 'calendar-quick-error' : undefined}
          value={quickEvent} onChange={event => { setQuickEvent(event.target.value); setQuickError(false); }} />
        <button className="cal-pill" type="submit" style={styles.todayBtn} disabled={!quickEvent.trim()}>Quick add</button>
        {quickError && <span id="calendar-quick-error" role="alert">Use a title, day and time, such as Lunch Fri 12.</span>}
      </form>

      <div style={styles.main}>
        {/* Sidebar */}
        <div className={sidebarCollapsed ? undefined : 'dex-liquid-glass'} style={{ ...styles.sidebar, width: sidebarCollapsed ? '0' : 'min(260px, 30vw)', padding: sidebarCollapsed ? '0' : '20px' }}>
          {!sidebarCollapsed && (
            <>
              {/* Mini Calendar */}
              <div style={styles.miniCal}>
                <div style={styles.miniHeader}>
                  <button className="cal-icon-btn" style={styles.navBtn} onClick={() => pageMiniMonth(-1)} aria-label="Previous mini-calendar month"><DexIcon name="chevron-left" size={13} /></button>
                  <span style={styles.miniTitle} aria-live="polite">{months[currentDate.getMonth()].slice(0, 3)} {currentDate.getFullYear()}</span>
                  <button className="cal-icon-btn" style={styles.navBtn} onClick={() => pageMiniMonth(1)} aria-label="Next mini-calendar month"><DexIcon name="chevron-right" size={13} /></button>
                </div>
                <button className="cal-pill" style={{ ...styles.todayBtn, width: '100%', marginBottom: 6 }}
                  onClick={goToToday} aria-label="Mini-calendar today">Today</button>
                <div style={styles.miniDays}>
                  {days.map(d => <span key={d} style={styles.miniDayLabel}>{d[0]}</span>)}
                </div>
                <div style={styles.miniGrid}>
                  {getDaysInMonth(currentDate).map((day, idx) => day ? (
                    <button type="button"
                      key={formatDate(day)}
                      className="cal-mini-day"
                      style={{
                        ...styles.miniDay,
                        ...(isWeekend(day) && !isToday(day) && !isSelected(day) ? { color: 'var(--color-text-muted)' } : {}),
                        ...(isSelected(day) ? styles.miniDaySelected : {}),
                        ...(isToday(day) ? styles.miniDayToday : {}),
                      }}
                      aria-label={dateLabel.format(day)}
                      aria-pressed={!!isSelected(day)}
                      aria-current={isToday(day) ? 'date' : undefined}
                      onClick={() => { jumpToDate(formatDate(day)); if (view === 'agenda') setView('day'); }}
                    >
                      {day.getDate()}
                    </button>
                  ) : <span key={'blank-' + idx} />)}
                </div>
              </div>

              {/* Categories (colour-coded, toggle visibility) */}
              <div style={styles.catSection}>
                <div style={styles.dayEventsHeader}>
                  <span style={styles.dayEventsTitle}>Categories</span>
                </div>
                <div style={styles.catList}>
                  {CATEGORIES.map(cat => {
                    const hidden = hiddenCategories.has(cat.id);
                    return (
                      <button
                        key={cat.id}
                        className="cal-cat-row"
                        style={{ ...styles.catRow, opacity: hidden ? 0.4 : 1 }}
                        onClick={() => toggleCategory(cat.id)}
                        aria-pressed={!hidden}
                        aria-label={`${hidden ? 'Show' : 'Hide'} ${cat.name}`}
                        title={`${hidden ? 'Show' : 'Hide'} ${cat.name}`}
                      >
                        <span style={{ ...styles.catSwatch, background: cat.color, ...(hidden ? { background: 'transparent', border: `2px solid ${cat.color}` } : {}) }} />
                        <span style={styles.catName}>{cat.name}</span>
                        <DexIcon name={hidden ? 'eye-off' : 'eye'} size={12} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {events.some(event => event.excludedDates?.length) && (
                <details style={{ paddingBottom: 'var(--space-3)' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 12 }}>Skipped occurrences</summary>
                  <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                    {events.flatMap(event => event.excludedDates?.map(day => (
                      <button key={event.id + day} type="button" style={{ ...styles.cancelBtn, whiteSpace: 'normal' }}
                        onClick={() => setOccurrenceSkipped(event.id, day, false)}>Restore {event.title} · {day}</button>
                    )) ?? [])}
                  </div>
                </details>
              )}

              {/* Selected Day Events */}
              {selectedDate && (
                <div style={styles.dayEvents}>
                  <div style={styles.dayEventsHeader}>
                    <span style={styles.dayEventsTitle}>
                      {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div style={styles.eventsList}>
                    {getEventsForDate(selectedDate).length === 0 ? (
                      <div style={styles.noEvents}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.35, marginBottom: 'var(--space-2)' }}>
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <div>No events for this day</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Click the + button to add one</div>
                      </div>
                    ) : (
                      getEventsForDate(selectedDate).map(event => (
                        <div
                          key={event.id}
                          className="cal-event-row"
                          aria-label={'Edit ' + event.title + ', ' + event.time}
                          tabIndex={0}
                          role="button"
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditEvent(event, selectedDate); } }}
                          style={{ ...styles.eventItem, borderLeftColor: event.color, cursor: 'pointer' }}
                          onClick={() => openEditEvent(event, selectedDate)}
                          title="Click to edit"
                        >
                          <div style={styles.eventTime}>
                            {event.time} - {event.endTime}
                            {conflictIds.has(event.id) && (
                              <span style={styles.conflictTag} title="Overlaps another event">
                                <DexIcon name="alert-triangle" size={10} /> Conflict
                              </span>
                            )}
                          </div>
                          <div style={styles.eventTitle}>{event.title}</div>
                          <div style={styles.eventActions} onClick={e => e.stopPropagation()}>
                            <button className="cal-mini-action" style={styles.eventActionBtn} onClick={() => duplicateEvent(event)} aria-label={`Duplicate ${event.title}`} title="Duplicate"><DexIcon name="copy" size={11} /></button>
                            <button className="cal-mini-action" style={styles.eventActionBtn} onClick={() => rescheduleEvent(event, 1)} aria-label={`Move ${event.title} to tomorrow`} title="Reschedule +1 day">+1d</button>
                            <button className="cal-mini-action" style={styles.eventActionBtn} onClick={() => rescheduleEvent(event, 7)} aria-label={`Move ${event.title} to next week`} title="Reschedule +1 week">+1w</button>
                            <button className="cal-mini-action" style={styles.eventActionBtn} onClick={() => exportEventICS(event)} aria-label={`Export ${event.title}`} title="Export this event (.ics)"><DexIcon name="download" size={11} /></button>
                          </div>
                          <button className="cal-mini-action" style={styles.deleteEventBtn} onClick={e => { e.stopPropagation(); deleteEvent(event.id); }} aria-label={`Delete ${event.title}`}><DexIcon name="close" size={12} /></button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Calendar Grid */}
        <div key={view} className="cal-view-anim" style={styles.calendarArea}>
          {view === 'month' ? (
            <>
              <div style={styles.weekHeader}>
                {days.map((day, idx) => (
                  <div
                    key={day}
                    style={{ ...styles.weekDayPill, ...(idx === todayDow ? styles.weekDayPillToday : {}) }}
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div style={styles.calendarGrid}>
                {getDaysInMonth(currentDate).map((day, idx) => {
                  if (!day) return <div key={idx} style={styles.dayCellEmpty} />;
                  const dayEvents = getEventsForDate(day);
                  const iconEvent = dayEvents.find(e => e.icon);
                  const today = isToday(day);
                  const weekend = isWeekend(day);
                  const selected = !!isSelected(day);
                  return (
                    <div
                      key={idx}
                      className="cal-daycell"
                      tabIndex={0}
                      role="button"
                      aria-label={`${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                      aria-pressed={selected}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDate(day); } }}
                      onDoubleClick={() => openNewEvent(day)}
                      style={{
                        ...styles.dayCell,
                        ...(weekend && !today && !selected ? styles.dayCellWeekend : {}),
                        ...(today ? styles.dayCellToday : {}),
                        ...(selected ? styles.dayCellSelected : {}),
                      }}
                      onClick={() => setSelectedDate(day)}
                      title={dayEvents.length ? dayEvents.map(e => `${e.time} ${e.title}`).join('\n') : 'Double-click to add an event'}
                    >
                      <div style={styles.cellTopRow}>
                        <div style={{ ...styles.dayNumber, ...(today ? styles.dayNumberToday : {}) }}>
                          {day.getDate()}
                        </div>
                        {iconEvent && (
                          <span style={{ color: iconEvent.color, display: 'inline-flex', opacity: 0.85 }}>
                            <DexIcon name={iconEvent.icon!} size={14} color="currentColor" />
                          </span>
                        )}
                      </div>
                      <div style={styles.cellChips}>
                        {dayEvents.slice(0, 3).map(ev => (
                          <div
                            key={ev.id}
                            style={{
                              ...styles.cellChip,
                              background: `color-mix(in srgb, ${ev.color} 18%, transparent)`,
                              ...(conflictIds.has(ev.id) ? { boxShadow: 'inset 0 0 0 1px var(--color-warning)' } : {}),
                            }}
                          >
                            <span style={{ ...styles.cellChipDot, background: ev.color }} />
                            <span style={styles.cellChipText}>{ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div style={styles.cellMore}>+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : view === 'agenda' ? (
            /* Agenda / List View */
            <div style={styles.agendaContainer}>
              {agendaItems.length === 0 ? (
                <div style={styles.noEvents}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.35, marginBottom: 'var(--space-2)' }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>No upcoming events{search ? ' match your search' : ''}</div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{search ? 'Try a different search term' : `The next ${AGENDA_DAYS} days are clear`}</div>
                  {!search && (
                    <button className="cal-pill" style={{ ...styles.todayBtn, marginTop: 'var(--space-3)' }} onClick={() => openNewEvent(selectedDate || new Date())} aria-label="Add an event">Add event</button>
                  )}
                </div>
              ) : (
                (() => {
                  // Group agenda items by day for headers.
                  const groups: { key: string; date: Date; items: typeof agendaItems }[] = [];
                  agendaItems.forEach(item => {
                    const key = formatDate(item.date);
                    let g = groups.find(x => x.key === key);
                    if (!g) { g = { key, date: item.date, items: [] }; groups.push(g); }
                    g.items.push(item);
                  });
                  return groups.map(group => (
                    <div key={group.key} style={styles.agendaGroup}>
                      <div style={{ ...styles.agendaDayLabel, ...(isToday(group.date) ? styles.agendaDayLabelToday : {}) }}>
                        {isToday(group.date) ? 'Today · ' : ''}
                        {group.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </div>
                      {group.items.map(({ event }) => (
                        <div
                          key={event.id + group.key}
                          className="cal-agenda-row"
                          tabIndex={0}
                          role="button"
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditEvent(event, group.date); } }}
                          style={{ ...styles.agendaItem, borderLeftColor: event.color }}
                          onClick={() => openEditEvent(event, group.date)}
                          title="Click to edit"
                        >
                          <span style={styles.agendaTime}>{event.time}</span>
                          {event.icon && (
                            <span style={{ color: event.color, display: 'inline-flex' }}>
                              <DexIcon name={event.icon} size={14} color="currentColor" />
                            </span>
                          )}
                          <span style={styles.agendaTitle}>{event.title}</span>
                          {conflictIds.has(event.id) && (
                            <span style={styles.conflictTag} title="Overlaps another event">
                              <DexIcon name="alert-triangle" size={10} /> Conflict
                            </span>
                          )}
                          <button className="cal-mini-action" style={styles.agendaDelete} onClick={e => { e.stopPropagation(); duplicateEvent(event); }} aria-label={`Duplicate ${event.title}`} title="Duplicate"><DexIcon name="copy" size={12} /></button>
                          <button className="cal-mini-action" style={styles.agendaDelete} onClick={e => { e.stopPropagation(); rescheduleEvent(event, 1); }} aria-label={`Move ${event.title} to tomorrow`} title="Reschedule +1 day"><DexIcon name="chevron-right" size={12} /></button>
                          <button className="cal-mini-action" style={styles.agendaDelete} onClick={e => { e.stopPropagation(); exportEventICS(event); }} aria-label={`Export ${event.title}`} title="Export this event (.ics)"><DexIcon name="download" size={12} /></button>
                          <button className="cal-mini-action" style={styles.agendaDelete} onClick={e => { e.stopPropagation(); deleteEvent(event.id); }} aria-label={`Delete ${event.title}`}><DexIcon name="close" size={12} /></button>
                        </div>
                      ))}
                    </div>
                  ));
                })()
              )}
            </div>
          ) : view === 'day' ? (
            /* Day View - single-column hour grid */
            <div style={styles.weekViewContainer}>
              <div style={styles.dayViewHeader}>
                <div style={styles.weekViewTimeGutter} />
                <div style={{ ...styles.weekViewDayHeader, ...(isToday(currentDate) ? styles.weekViewDayHeaderToday : {}) }}>
                  <span style={styles.weekViewDayName}>{currentDate.toLocaleDateString('en-US', { weekday: 'long' })}</span>
                  <span style={{ ...styles.weekViewDayNum, ...(isToday(currentDate) ? styles.weekViewDayNumToday : {}) }}>
                    {currentDate.getDate()}
                  </span>
                </div>
              </div>
              <div style={styles.weekViewBody}>
                {Array.from({ length: 24 }, (_, hour) => {
                  const slotEvents = getEventsForDateAndHour(currentDate, hour);
                  return (
                    <div key={hour} style={styles.dayViewRow}>
                      <div style={styles.weekViewTimeLabel}>
                        <span style={styles.weekViewTimeLabelText}>{formatHour(hour)}</span>
                      </div>
                      <div
                        style={{
                          ...styles.weekViewCell,
                          ...(showWorkingHours && isWeekend(currentDate) ? styles.weekViewCellWeekend : {}),
                          ...(showWorkingHours && isOffHour(hour) ? styles.weekViewCellOffHour : {}),
                          ...(isToday(currentDate) ? styles.weekViewCellToday : {}),
                          ...(isInDragRange(currentDate, hour) ? { background: 'var(--color-accent-light, rgba(74,158,255,0.15))' } : {}),
                        }}
                        onMouseDown={e => { e.preventDefault(); handleDragStart(currentDate, hour); }}
                        onMouseEnter={() => handleDragMove(currentDate, hour)}
                        onMouseUp={() => handleDragEnd()}
                        onClick={() => {
                          if (isDragging) return;
                          const endHour = Math.min(hour + 1, 23);
                          openNewEvent(currentDate, hour.toString().padStart(2, '0') + ':00', endHour.toString().padStart(2, '0') + ':00');
                        }}
                      >
                        {slotEvents.map(event => (
                          <div
                            key={event.id}
                            className="cal-week-event"
                            style={{
                              ...styles.dayViewEvent,
                              background: event.color,
                              ...(conflictIds.has(event.id) ? styles.weekViewEventConflict : {}),
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={'Edit ' + event.title + ', ' + event.time}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openEditEvent(event, currentDate); } }}
                            onClick={e => { e.stopPropagation(); openEditEvent(event, currentDate); }}
                            title="Click to edit"
                          >
                            <span style={styles.weekViewEventTitle}>{event.title}</span>
                            <span style={styles.weekViewEventTime}>{event.time} - {event.endTime}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Week View */
            <div style={styles.weekViewContainer}>
              {/* Week Day Headers */}
              <div style={styles.weekViewHeader}>
                <div style={styles.weekViewTimeGutter} />
                {getWeekDates(currentDate).map((date, idx) => (
                  <div
                    key={idx}
                    style={{
                      ...styles.weekViewDayHeader,
                      ...(isToday(date) ? styles.weekViewDayHeaderToday : {}),
                    }}
                  >
                    <span style={styles.weekViewDayName}>{days[idx]}</span>
                    <span style={{
                      ...styles.weekViewDayNum,
                      ...(isToday(date) ? styles.weekViewDayNumToday : {}),
                    }}>
                      {date.getDate()}
                    </span>
                  </div>
                ))}
              </div>
              {/* Hour Rows */}
              <div style={styles.weekViewBody}>
                {Array.from({ length: 24 }, (_, hour) => (
                  <div key={hour} style={styles.weekViewRow}>
                    <div style={styles.weekViewTimeLabel}>
                      <span style={styles.weekViewTimeLabelText}>{formatHour(hour)}</span>
                    </div>
                    {getWeekDates(currentDate).map((date, dayIdx) => {
                      const slotEvents = getEventsForDateAndHour(date, hour);
                      return (
                        <div
                          key={dayIdx}
                          style={{
                            ...styles.weekViewCell,
                            ...(showWorkingHours && isWeekend(date) ? styles.weekViewCellWeekend : {}),
                            ...(showWorkingHours && isOffHour(hour) ? styles.weekViewCellOffHour : {}),
                            ...(isToday(date) ? styles.weekViewCellToday : {}),
                            ...(isInDragRange(date, hour) ? { background: 'var(--color-accent-light, rgba(74,158,255,0.15))' } : {}),
                          }}
                          onMouseDown={e => { e.preventDefault(); handleDragStart(date, hour); }}
                          onMouseEnter={() => handleDragMove(date, hour)}
                          onMouseUp={() => handleDragEnd()}
                          onClick={() => {
                            if (isDragging) return;
                            const endHour = Math.min(hour + 1, 23);
                            openNewEvent(date, hour.toString().padStart(2, '0') + ':00', endHour.toString().padStart(2, '0') + ':00');
                          }}
                        >
                          {slotEvents.map(event => (
                            <div
                              key={event.id}
                              className="cal-week-event"
                              style={{
                                ...styles.weekViewEvent,
                                background: event.color,
                                ...(conflictIds.has(event.id) ? styles.weekViewEventConflict : {}),
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={'Edit ' + event.title + ', ' + event.time}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openEditEvent(event, date); } }}
                              onClick={e => { e.stopPropagation(); openEditEvent(event, date); }}
                              title={conflictIds.has(event.id) ? 'Overlaps another event' : 'Click to edit'}
                            >
                              <span style={styles.weekViewEventTitle}>{event.title}</span>
                              <span style={styles.weekViewEventTime}>{event.time}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="cal-overlay-anim" style={styles.modalOverlay} onMouseDown={closeModal}>
          <div className="dex-liquid-glass-strong cal-modal-anim" style={styles.modal} role="dialog" aria-label={editingId ? 'Edit Event' : 'New Event'} aria-modal="true" onMouseDown={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editingId ? 'Edit Event' : 'New Event'}</h2>
              <button style={styles.modalClose} onClick={closeModal} aria-label="Close modal"><DexIcon name="close" size={14} /></button>
            </div>
            <div style={styles.modalBody}>
              <input
                className="cal-input"
                style={styles.input}
                type="text"
                placeholder="Event title"
                value={newEvent.title}
                onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEvent(); } }}
                autoFocus
              />
              <input
                style={styles.timeInput}
                type="date"
                value={formatDate(eventDate)}
                onChange={e => { if (e.target.value) setEventDate(new Date(e.target.value + 'T00:00:00')); }}
                aria-label="Event date"
              />
              <div style={styles.timeRow}>
                <input
                  style={styles.timeInput}
                  type="time"
                  aria-label="Start time"
                  value={newEvent.time}
                  onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                />
                <span style={styles.timeSep}>to</span>
                <input
                  style={styles.timeInput}
                  type="time"
                  aria-label="End time"
                  value={newEvent.endTime}
                  onChange={e => setNewEvent({ ...newEvent, endTime: e.target.value })}
                />
              </div>
              {/* Category picker */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                      border: '1px solid ' + (newEvent.category === cat.id ? 'var(--color-accent)' : 'var(--color-border-subtle)'),
                      background: newEvent.category === cat.id ? 'var(--color-bg-hover)' : 'transparent',
                      color: 'var(--color-text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => setNewEvent({ ...newEvent, category: cat.id, color: cat.color })}
                    aria-label={`Category ${cat.name}`}
                    aria-pressed={newEvent.category === cat.id}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                    {cat.name}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(r => (
                  <button
                    key={r}
                    style={{
                      padding: '4px 10px', borderRadius: 4,
                      border: '1px solid ' + (newEvent.recurring === r ? 'var(--color-accent)' : 'var(--color-border-subtle)'),
                      fontSize: 12,
                      background: newEvent.recurring === r ? 'var(--color-accent-fill)' : 'var(--color-bg-hover)',
                      color: newEvent.recurring === r ? 'var(--color-accent-text, #fff)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => setNewEvent({ ...newEvent, recurring: r })}
                    aria-label={`Repeat ${r}`}
                  >
                    {r === 'none' ? 'No Repeat' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              {newEvent.recurring && newEvent.recurring !== 'none' && (
                <div style={styles.timeRow}>
                  <span style={styles.timeSep}>Until</span>
                  <input
                    style={styles.timeInput}
                    type="date"
                    value={newEvent.recurUntil}
                    min={selectedDate ? formatDate(selectedDate) : undefined}
                    onChange={e => setNewEvent({ ...newEvent, recurUntil: e.target.value })}
                    aria-label="Repeat until date"
                    title="Leave empty to repeat forever"
                  />
                  {newEvent.recurUntil && (
                    <button style={styles.modalClose} onClick={() => setNewEvent({ ...newEvent, recurUntil: '' })} aria-label="Clear end date"><DexIcon name="close" size={12} /></button>
                  )}
                </div>
              )}
              <div style={styles.timeRow}>
                <span style={styles.timeSep}>Alert</span>
                <select
                  style={styles.timeInput}
                  value={newEvent.alertMinutes == null ? '' : String(newEvent.alertMinutes)}
                  onChange={e => setNewEvent({ ...newEvent, alertMinutes: e.target.value === '' ? null : Number(e.target.value) })}
                  aria-label="Alert"
                  title="A notification before the event starts (also when Calendar is closed)"
                  data-testid="calendar-alert"
                >
                  {ALERT_CHOICES.map(c => <option key={c.label} value={c.value == null ? '' : String(c.value)}>{c.label}</option>)}
                </select>
              </div>
              <div style={styles.iconPicker}>
                <button
                  type="button"
                  style={{ ...styles.iconBtn, ...(newEvent.icon === '' ? styles.iconBtnActive : {}) }}
                  onClick={() => setNewEvent({ ...newEvent, icon: '' })}
                  aria-label="No icon"
                >
                  <DexIcon name="close" size={12} />
                </button>
                {eventIcons.map(ic => (
                  <button
                    key={ic}
                    type="button"
                    style={{ ...styles.iconBtn, ...(newEvent.icon === ic ? styles.iconBtnActive : {}) }}
                    onClick={() => setNewEvent({ ...newEvent, icon: ic })}
                    aria-label={`Select icon ${ic}`}
                  >
                    <DexIcon name={ic} size={16} color="currentColor" />
                  </button>
                ))}
              </div>
              <div style={styles.colorPicker}>
                {colors.map(color => (
                  <button
                    key={color}
                    style={{
                      ...styles.colorBtn,
                      background: color,
                      ...(newEvent.color === color ? styles.colorBtnActive : {}),
                    }}
                    onClick={() => setNewEvent({ ...newEvent, color })}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
              <AssistedTextarea
                style={styles.textarea}
                placeholder="Add description..."
                value={newEvent.description}
                onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
              />
            </div>
            <div style={styles.modalFooter}>
              {editingId && (() => {
                const current = events.find(ev => ev.id === editingId);
                return (
                  <div style={{ display: 'flex', gap: '6px', marginRight: 'auto', flexWrap: 'wrap' }}>
                    <button
                      style={{ ...styles.cancelBtn, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                      onClick={() => { deleteEvent(editingId); closeModal(); }}
                      aria-label="Delete event"
                    >
                      Delete
                    </button>
                    {current && (
                      <>
                        {current.recurring && current.recurring !== 'none' && editingOccurrence && (
                          <button type="button" style={styles.cancelBtn}
                            title={editingOccurrence} onClick={() => setOccurrenceSkipped(current.id, editingOccurrence, true)}>
                            Skip this occurrence
                          </button>
                        )}
                        <button style={styles.cancelBtn} onClick={() => { duplicateEvent(current); closeModal(); }} aria-label="Duplicate event">Duplicate</button>
                        <button style={styles.cancelBtn} onClick={() => { rescheduleEvent(current, 1); closeModal(); }} aria-label="Move to tomorrow" title="Reschedule +1 day">+1 Day</button>
                        <button style={styles.cancelBtn} onClick={() => { rescheduleEvent(current, 7); closeModal(); }} aria-label="Move to next week" title="Reschedule +1 week">+1 Week</button>
                        <button style={styles.cancelBtn} onClick={() => exportEventICS(current)} aria-label="Export this event" title="Export this event (.ics)">Export</button>
                      </>
                    )}
                  </div>
                );
              })()}
              <button className="cal-cancel" style={styles.cancelBtn} onClick={closeModal} aria-label="Cancel">Cancel</button>
              <button className="cal-save" style={styles.saveBtn} onClick={handleSaveEvent} disabled={!eventsLoaded} aria-label="Save event">{editingId ? 'Save Changes' : 'Save Event'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--dex-font-ui)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    height: 'var(--app-header-height, 44px)',
    borderRadius: 0,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    minWidth: 0,
    flexShrink: 1,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexShrink: 0,
  },
  todayBtn: {
    padding: '6px 14px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    letterSpacing: '0.3px',
    textTransform: 'none' as const,
  },
  navBtns: {
    display: 'flex',
    gap: '4px',
  },
  navBtn: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-tertiary)',
    padding: '6px var(--space-2)',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  title: {
    whiteSpace: 'nowrap',
    fontSize: '15px',
    fontWeight: 600,
    margin: 0,
    letterSpacing: '-0.3px',
  },
  jumpDate: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    padding: '5px 8px',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'var(--dex-font-ui)',
    outline: 'none',
    colorScheme: 'dark',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    padding: '0 8px',
    height: '28px',
    color: 'var(--color-text-tertiary)',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'var(--dex-font-ui)',
    width: '120px',
  },
  searchClear: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: 0,
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--color-bg-hover)',
    borderRadius: '10px',
    padding: '2px',
    border: '1px solid var(--color-border-subtle)',
    gap: '2px',
  },
  viewBtn: {
    padding: '6px var(--space-3)',
    border: 'none',
    borderRadius: '10px',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    letterSpacing: '0.3px',
    textTransform: 'none' as const,
  },
  viewBtnActive: {
    background: 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)',
    color: 'var(--color-text-primary)',
  },
  addBtn: {
    width: '32px',
    height: '32px',
    background: 'var(--color-accent-fill)',
    border: 'none',
    borderRadius: '10px',
    color: 'var(--color-accent-text, #fff)',
    flexShrink: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  sidebar: {
    borderRadius: 0,
    overflowX: 'hidden',
    overflowY: 'auto',
    transition: 'all 0.18s ease',
  },
  miniCal: {
    marginBottom: 'var(--space-4)',
    background: 'var(--color-bg-surface)',
    borderRadius: '14px',
    padding: 'var(--space-3)',
    border: '1px solid var(--color-border-subtle)',
  },
  miniHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    marginBottom: '10px',
  },
  quickForm: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  miniTitle: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    color: 'var(--color-text-secondary)',
  },
  miniDays: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
    marginBottom: '6px',
  },
  miniDayLabel: {
    textAlign: 'center',
    fontSize: '9px',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    textTransform: 'none' as const,
  },
  miniGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
  },
  miniDay: {
    background: 'transparent',
    border: '1px solid transparent',
    textAlign: 'center',
    padding: '5px',
    fontSize: '10px',
    borderRadius: '50%',
    cursor: 'pointer',
    color: 'var(--color-text-tertiary)',
    transition: 'all 0.15s ease',
    fontWeight: 500,
  },
  miniDayToday: {
    background: 'var(--color-accent-fill)',
    color: 'var(--color-accent-text, #fff)',
    fontWeight: 600,
  },
  miniDaySelected: {
    background: 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)',
    border: '1px solid var(--dex-focus-color, #fff)',
  },
  catSection: {
    marginBottom: 'var(--space-4)',
  },
  catList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  catRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    padding: '5px 6px',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    transition: 'all 0.15s ease',
  },
  catSwatch: {
    width: '12px',
    height: '12px',
    borderRadius: '4px',
    flexShrink: 0,
    boxSizing: 'border-box',
  },
  catName: {
    flex: 1,
    textAlign: 'left',
    fontWeight: 500,
  },
  dayEvents: {
    marginTop: 'var(--space-3)',
  },
  dayEventsHeader: {
    marginBottom: '10px',
  },
  dayEventsTitle: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    color: 'var(--color-text-tertiary)',
    textTransform: 'none' as const,
  },
  eventsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  noEvents: {
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    padding: 'var(--space-6) 0',
    fontWeight: 500,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  eventItem: {
    background: 'var(--color-bg-surface)',
    borderRadius: '10px',
    padding: '10px var(--space-3)',
    borderLeft: '3px solid',
    position: 'relative',
    boxShadow: 'var(--shadow-sm)',
    transition: 'all 0.15s ease',
    border: '1px solid var(--color-border-subtle)',
  },
  eventTime: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    marginBottom: '4px',
    fontWeight: 600,
    letterSpacing: '0.3px',
  },
  eventTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    paddingRight: '22px',
  },
  conflictTag: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    marginLeft: 6, padding: '0 4px', borderRadius: 4,
    color: 'var(--color-warning)',
    background: 'var(--color-warning-muted, rgba(255,159,10,0.15))',
    fontWeight: 600, letterSpacing: 0,
  },
  eventActions: {
    display: 'flex',
    gap: '4px',
    marginTop: '8px',
    flexWrap: 'wrap',
  },
  eventActionBtn: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-tertiary)',
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '3px 6px',
    borderRadius: '4px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    transition: 'all 0.15s ease',
    fontFamily: 'var(--dex-font-ui)',
  },
  deleteEventBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'var(--color-bg-hover)',
    border: 'none',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: '4px',
    transition: 'all 0.15s ease',
  },
  calendarArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--space-4)',
    marginLeft: 'var(--space-3)',
  },
  // Month view is one hairline grid (1px gaps over the border colour), not a
  // wall of separately boxed day cards; weekday names are plain labels.
  weekHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    marginBottom: '6px',
  },
  weekDayPill: {
    textAlign: 'center',
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
    fontWeight: 600,
    padding: '4px 0',
    letterSpacing: '0.4px',
  },
  weekDayPillToday: {
    color: 'var(--color-text-primary)',
  },
  calendarGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gridAutoRows: '1fr',
    gap: '1px',
    background: 'var(--color-border-subtle)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  dayCell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-base)',
    padding: '8px 10px',
    minHeight: '60px',
    cursor: 'pointer',
    transition: 'background 0.12s ease',
  },
  dayCellEmpty: {
    background: 'var(--color-bg-base)',
    opacity: 0.6,
  },
  dayCellWeekend: {
    background: 'color-mix(in srgb, var(--color-text-muted) 3%, var(--color-bg-base))',
  },
  dayCellToday: {},
  dayCellSelected: {
    background: 'color-mix(in srgb, var(--color-text-primary) 6%, var(--color-bg-base))',
  },
  cellTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  cellChips: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflow: 'hidden',
    flex: 1,
  },
  cellChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    borderRadius: '6px',
    padding: '1px 5px',
    overflow: 'hidden',
  },
  cellChipDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  cellChipText: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    lineHeight: 1.4,
  },
  cellMore: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    padding: '0 5px',
    letterSpacing: '0.2px',
  },
  dayNumber: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    alignSelf: 'flex-start',
  },
  dayNumberToday: {
    color: 'var(--color-accent-text, #fff)',
    fontWeight: 700,
    background: 'var(--color-accent-fill)',
    borderRadius: '50%',
    width: '22px',
    height: '22px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
  },
  // -- Week View Styles --------------------------------------
  weekViewContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflow: 'hidden',
    borderRadius: '14px',
    border: '1px solid var(--color-border-subtle)',
    boxShadow: 'var(--shadow-md)',
  },
  weekViewHeader: {
    display: 'grid',
    gridTemplateColumns: '56px repeat(7, 1fr)',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)',
  },
  weekViewTimeGutter: {
    borderRight: '1px solid var(--color-border-subtle)',
  },
  weekViewDayHeader: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: 'var(--space-2) 0 6px',
    gap: '2px',
    borderRight: '1px solid var(--color-border-subtle)',
  },
  weekViewDayHeaderToday: {
    background: 'var(--color-accent-light)',
  },
  weekViewDayName: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'none' as const,
    letterSpacing: '0.01em',
  },
  weekViewDayNum: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    lineHeight: 1,
  },
  weekViewDayNumToday: {
    background: 'var(--color-accent-fill)',
    color: 'var(--color-accent-text, #fff)',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
  },
  weekViewBody: {
    flex: 1,
    overflowY: 'auto' as const,
    background: 'var(--color-bg-surface)',
  },
  weekViewRow: {
    display: 'grid',
    gridTemplateColumns: '56px repeat(7, 1fr)',
    minHeight: '48px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  weekViewTimeLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingRight: 'var(--space-2)',
    paddingTop: '2px',
    borderRight: '1px solid var(--color-border-subtle)',
  },
  weekViewTimeLabelText: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'none' as const,
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap' as const,
  },
  weekViewCell: {
    borderRight: '1px solid var(--color-border-subtle)',
    padding: '2px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    minHeight: '48px',
  },
  weekViewCellToday: {
    background: 'var(--color-accent-soft, rgba(74,158,255,0.04))',
  },
  // Non-working-hour shading (overlaid below other backgrounds via spread order).
  weekViewCellOffHour: {
    background: 'var(--color-bg-base)',
    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, color-mix(in srgb, var(--color-text-muted) 6%, transparent) 6px, color-mix(in srgb, var(--color-text-muted) 6%, transparent) 7px)',
  },
  // Weekend column dimming.
  weekViewCellWeekend: {
    background: 'color-mix(in srgb, var(--color-text-muted) 4%, transparent)',
  },
  weekViewEvent: {
    borderRadius: '4px',
    padding: '2px 6px',
    marginBottom: '2px',
    overflow: 'hidden',
    cursor: 'default',
    boxShadow: 'var(--shadow-sm)',
  },
  weekViewEventConflict: {
    boxShadow: 'inset 0 0 0 1.5px var(--color-warning)',
  },
  weekViewEventTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--color-accent-text, #fff)',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  weekViewEventTime: {
    fontSize: '9px',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    display: 'block',
  },
  // -- Day View ----------------------------------------------
  dayViewHeader: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)',
  },
  dayViewRow: {
    display: 'grid',
    gridTemplateColumns: '56px 1fr',
    minHeight: '48px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  dayViewEvent: {
    borderRadius: '4px',
    padding: '4px 8px',
    marginBottom: '2px',
    overflow: 'hidden',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)',
  },
  // -- Agenda / List View ------------------------------------
  agendaContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    paddingRight: '4px',
  },
  agendaGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  agendaDayLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-tertiary)',
    textTransform: 'none' as const,
    letterSpacing: '0.4px',
    padding: '4px 2px',
    position: 'sticky' as const,
    top: 0,
    background: 'var(--color-bg-base)',
    zIndex: 1,
  },
  agendaDayLabelToday: {
    color: 'var(--color-accent)',
  },
  agendaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-subtle)',
    borderLeft: '3px solid',
    borderRadius: '10px',
    padding: '10px var(--space-3)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  agendaTime: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    minWidth: '44px',
    fontVariantNumeric: 'tabular-nums',
  },
  agendaTitle: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  agendaDelete: {
    background: 'var(--color-bg-hover)',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.15s ease',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--color-bg-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 'var(--z-max)',

  },
  modal: {
    borderRadius: '14px',
    width: 'min(380px, 92vw)',

  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  modalTitle: {
    fontSize: '14px',
    fontWeight: 600,
    margin: 0,
    letterSpacing: '-0.2px',
  },
  modalClose: {
    background: 'var(--color-bg-hover)',
    border: 'none',
    color: 'var(--color-text-tertiary)',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '4px var(--space-2)',
    borderRadius: '4px',
    transition: 'all 0.15s ease',
  },
  modalBody: {
    padding: 'var(--space-4) var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  input: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    padding: 'var(--space-3) 14px',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    transition: 'all 0.15s ease',
    fontWeight: 500,
    fontFamily: 'var(--dex-font-ui)',
  },
  timeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  timeInput: {
    flex: 1,
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    padding: '10px var(--space-3)',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'var(--dex-font-ui)',
  },
  timeSep: {
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    fontWeight: 600,
  },
  iconPicker: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  iconBtn: {
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    cursor: 'pointer',
    color: 'var(--color-text-tertiary)',
    transition: 'all 0.15s ease',
  },
  iconBtnActive: {
    border: '1px solid var(--color-accent)',
    background: 'var(--color-accent-light, rgba(74,158,255,0.15))',
    color: 'var(--color-accent)',
  },
  colorPicker: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  colorBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: 'var(--shadow-sm)',
  },
  colorBtnActive: {
    border: '2px solid var(--color-text-primary)',
  },
  textarea: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    padding: 'var(--space-3) 14px',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    resize: 'none',
    height: '70px',
    outline: 'none',
    fontWeight: 500,
    fontFamily: 'var(--dex-font-ui)',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: 'var(--space-4) var(--space-5)',
    borderTop: '1px solid var(--color-border-subtle)',
  },
  cancelBtn: {
    padding: 'var(--space-2) var(--space-4)',
    background: 'transparent',
    border: '1px solid var(--color-border-default)',
    borderRadius: '10px',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'var(--dex-font-ui)',
  },
  saveBtn: {
    padding: 'var(--space-2) var(--space-4)',
    background: 'var(--color-success)',
    border: 'none',
    borderRadius: '10px',
    color: 'var(--color-text-inverse)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'var(--dex-font-ui)',
  },
};

Calendar.displayName = 'Calendar';
export default memo(Calendar);
