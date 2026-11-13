// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * TASKS - macOS Reminders Style Task Manager
 * Clean task management with lists and priorities
 * Connected to real file system via IPC
 */

import React, { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { AssistedTextarea } from '../components/AssistedTextarea';
import { useAppTracking } from '../services/usePatternLearning';
import { useToastHelpers } from '../components/Toast';
import { glassSidebar } from '../styles/glassMenu';
import DexIcon from '../components/DexIcon';
import ContextMenu, { useContextMenu, ContextMenuItem } from '../components/ContextMenu';
import { registerUkiAppContext, unregisterUkiAppContext } from '../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../uki/appActionRegistry';
import { searchLines } from '../../shared/search/textSearch';
import { DexSearchInput } from '../styles/components';
import { keyEventForApp } from '../shell/input/appKeyScope';

// ===========================================================================
// TYPES
// ===========================================================================

/** Native bridge invoke; resolves null off-platform (web shell) so callers degrade. */
async function dexInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> {
  const d = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<T> } }).dex;
  if (!d?.invoke) return null;
  try {
    return await d.invoke(channel, ...args);
  } catch {
    return null;
  }
}

// ===========================================================================
// QUICK-ADD PARSER
// Pure, synchronous, renderer-side parsing of the quick-add bar. Extracts a
// natural-language due date/time, priority (!high / !urgent / !low), an inline
// list (#listname) and an explicit date token (@tomorrow), returning the cleaned
// title plus the structured fields. No IPC, no backend — runs as the user types.
// ===========================================================================

interface ParsedQuickAdd {
  title: string;
  dueDate: Date | null;
  dueTime: string | null;
  priority: Task['priority'] | null;
  list: string | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ABBR: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
};

const atStartOfDay = (d: Date): Date => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
};

/** Next occurrence of weekday `target` (0=Sun..6=Sat) strictly after today (or today if same and allowToday). */
const nextWeekday = (target: number, from: Date, allowToday = false): Date => {
  const d = atStartOfDay(from);
  let delta = (target - d.getDay() + 7) % 7;
  if (delta === 0 && !allowToday) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
};

/** Parse a "5pm", "5:30pm", "17:00", "noon", "midnight" fragment -> "HH:MM" or null. */
const parseTimeToken = (raw: string): string | null => {
  const s = raw.trim().toLowerCase();
  if (s === 'noon') return '12:00';
  if (s === 'midnight') return '00:00';
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3];
  if (h > 23 || min > 59) return null;
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  // A bare number with no meridiem and no colon (e.g. "5") is too ambiguous to be a time.
  if (!mer && !m[2] && raw.search(/\b(at)\b/i) === -1) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

/**
 * Extract a natural-language date phrase from `text`. Returns the resolved date,
 * an optional time, and the [start,end) span of the matched phrase so the caller
 * can strip it from the title. Returns null when nothing recognisable is found.
 */
const extractDatePhrase = (
  text: string,
  now: Date = new Date(),
): { date: Date; time: string | null; start: number; end: number } | null => {
  const lower = text.toLowerCase();

  // Ordered patterns; each captures the whole phrase so we know what to strip.
  const patterns: { re: RegExp; resolve: (m: RegExpMatchArray) => { date: Date; time: string | null } | null }[] = [
    // "in 3 days" / "in 2 weeks" / "in 1 month"
    {
      re: /\bin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/,
      resolve: (m) => {
        const n = parseInt(m[1], 10);
        const d = atStartOfDay(now);
        const unit = m[2];
        if (unit.startsWith('day')) d.setDate(d.getDate() + n);
        else if (unit.startsWith('week')) d.setDate(d.getDate() + n * 7);
        else d.setMonth(d.getMonth() + n);
        return { date: d, time: null };
      },
    },
    // "today 5pm" / "today at 5pm" / "today"
    {
      re: /\btoday\b(?:\s+(?:at\s+)?([\d:apm]+|noon|midnight))?/,
      resolve: (m) => ({ date: atStartOfDay(now), time: m[1] ? parseTimeToken(m[1]) : null }),
    },
    // "tonight" -> today, default evening if no time
    {
      re: /\btonight\b(?:\s+(?:at\s+)?([\d:apm]+|noon|midnight))?/,
      resolve: (m) => ({ date: atStartOfDay(now), time: m[1] ? parseTimeToken(m[1]) : '20:00' }),
    },
    // "tomorrow 9am" / "tomorrow at 9" / "tomorrow"
    {
      re: /\btomorrow\b(?:\s+(?:at\s+)?([\d:apm]+|noon|midnight))?/,
      resolve: (m) => {
        const d = atStartOfDay(now);
        d.setDate(d.getDate() + 1);
        return { date: d, time: m[1] ? parseTimeToken(m[1]) : null };
      },
    },
    // "next friday" / "next fri" / "next week"
    {
      re: /\bnext\s+(week|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)\b/,
      resolve: (m) => {
        const word = m[1];
        if (word === 'week') {
          const d = atStartOfDay(now);
          d.setDate(d.getDate() + 7);
          return { date: d, time: null };
        }
        const idx = WEEKDAYS.indexOf(word) !== -1 ? WEEKDAYS.indexOf(word) : WEEKDAY_ABBR[word];
        // "next <day>" reads as the occurrence in the following week. Take the
        // upcoming instance, then push a week if it falls within the current week.
        const base = nextWeekday(idx, now, false);
        const sameWeek = (base.getTime() - atStartOfDay(now).getTime()) < 7 * 86400000;
        if (sameWeek) base.setDate(base.getDate() + 7);
        return { date: base, time: null };
      },
    },
    // "this friday" / "this fri"
    {
      re: /\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)\b/,
      resolve: (m) => {
        const word = m[1];
        const idx = WEEKDAYS.indexOf(word) !== -1 ? WEEKDAYS.indexOf(word) : WEEKDAY_ABBR[word];
        return { date: nextWeekday(idx, now, true), time: null };
      },
    },
    // bare weekday: "friday 5pm" / "mon" / "fri at 9"
    {
      re: /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)\b(?:\s+(?:at\s+)?([\d:apm]+|noon|midnight))?/,
      resolve: (m) => {
        const word = m[1];
        const idx = WEEKDAYS.indexOf(word) !== -1 ? WEEKDAYS.indexOf(word) : WEEKDAY_ABBR[word];
        return { date: nextWeekday(idx, now, false), time: m[2] ? parseTimeToken(m[2]) : null };
      },
    },
  ];

  for (const { re, resolve } of patterns) {
    const m = lower.match(re);
    if (!m || m.index === undefined) continue;
    const resolved = resolve(m);
    if (!resolved) continue;
    return { ...resolved, start: m.index, end: m.index + m[0].length };
  }
  return null;
};

/**
 * Full quick-add parse. Pulls out !priority, #list, @date tokens and a trailing
 * natural-language date phrase, returning the cleaned title and structured fields.
 */
const parseQuickAdd = (raw: string, lists: { id: string; name: string }[], now: Date = new Date()): ParsedQuickAdd => {
  let working = raw;
  let priority: Task['priority'] | null = null;
  let list: string | null = null;
  let dueDate: Date | null = null;
  let dueTime: string | null = null;

  // !priority tokens
  const priMap: Record<string, Task['priority']> = {
    urgent: 'high', high: 'high', p1: 'high', med: 'medium', medium: 'medium', p2: 'medium',
    low: 'low', p3: 'low', none: 'none', p4: 'none',
  };
  working = working.replace(/(^|\s)!([a-z0-9]+)/gi, (full, lead, word) => {
    const p = priMap[word.toLowerCase()];
    if (p) { priority = p; return lead; }
    return full;
  });

  // #list tokens — match against known list ids/names, else create a freeform list id.
  working = working.replace(/(^|\s)#([a-z0-9_-]+)/gi, (full, lead, word) => {
    const w = word.toLowerCase();
    const known = lists.find(l => l.id.toLowerCase() === w || l.name.toLowerCase() === w);
    list = known ? known.id : w;
    return lead;
  });

  // @date tokens — explicit date phrase introduced by @. We feed the captured
  // word(s) through the same date extractor (supports @tomorrow, @fri, @5pm-less).
  working = working.replace(/(^|\s)@([a-z0-9:]+)/gi, (full, lead, word) => {
    const phrase = extractDatePhrase(word.toLowerCase(), now);
    if (phrase) { dueDate = phrase.date; if (phrase.time) dueTime = phrase.time; return lead; }
    return full;
  });

  // Free-text natural-language date phrase in the remaining title.
  if (!dueDate) {
    const phrase = extractDatePhrase(working, now);
    if (phrase) {
      dueDate = phrase.date;
      dueTime = phrase.time;
      working = working.slice(0, phrase.start) + working.slice(phrase.end);
    }
  }

  const title = working.replace(/\s{2,}/g, ' ').trim();
  return { title, dueDate, dueTime, priority, list };
};

/** Resolve a task's effective due date+time (folds in optional dueTime). Null when no due date. */
const taskDueDateTime = (task: { dueDate: Date | null; dueTime?: string | null }): Date | null => {
  if (!task.dueDate) return null;
  const d = new Date(task.dueDate);
  if (task.dueTime) {
    const [h, m] = task.dueTime.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) d.setHours(h, m, 0, 0);
  }
  return d;
};

/** Advance a date by one recurrence step, preserving the day-of-month for monthly. */
const advanceRecurrence = (date: Date, recurring: NonNullable<Task['recurring']>): Date => {
  const d = new Date(date);
  switch (recurring) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    default: d.setDate(d.getDate() + 1); break;
  }
  return d;
};

/** True when a task is currently snoozed (snoozedUntil is set and in the future). */
const isSnoozed = (task: { snoozedUntil?: string | null }, now: Date = new Date()): boolean => {
  if (!task.snoozedUntil) return false;
  const until = new Date(task.snoozedUntil);
  return !isNaN(until.getTime()) && until.getTime() > now.getTime();
};

/** Format minutes as a compact "1h 30m" / "45m" / "2h" label. */
const formatMinutes = (mins: number): string => {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'none' | 'low' | 'medium' | 'high';
  dueDate: Date | null;
  /** Optional time-of-day for the due date, stored as "HH:MM" (24h). Persists as a plain string. */
  dueTime?: string | null;
  list: string;
  notes: string;
  subtasks?: { id: string; title: string; completed: boolean }[];
  recurring?: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  description?: string;
  /** User-flagged/starred for the Flagged smart list. Optional for backward compat. */
  flagged?: boolean;
  /** Ids of other tasks that block this one. Completing is discouraged while any blocker is open. Optional for backward compat. */
  blockedBy?: string[];
  /** ISO date string; while in the future the task is hidden from Today (snoozed). Optional for backward compat. */
  snoozedUntil?: string | null;
  /** Estimated effort in minutes. Optional for backward compat. */
  estimateMinutes?: number | null;
  /** Accumulated actual effort logged in minutes. Optional for backward compat. */
  actualMinutes?: number | null;
}

interface TaskList {
  id: string;
  name: string;
  color: string;
  icon: string;
}

// ===========================================================================
// DATA PERSISTENCE - Real File System
// ===========================================================================

// Smart lists are computed filter views over the existing tasks (no extra
// persistence). Regular lists ('personal', 'work', and any inline #list) match
// on Task.list. The `smart` flag drives the computed filtering in filteredTasks.
const LISTS: (TaskList & { smart?: boolean })[] = [
  { id: 'today', name: 'Today', color: 'var(--color-accent)', icon: 'today', smart: true },
  { id: 'upcoming', name: 'Upcoming', color: 'var(--color-accent)', icon: 'calendar', smart: true },
  { id: 'overdue', name: 'Overdue', color: 'var(--color-error)', icon: 'flag', smart: true },
  { id: 'flagged', name: 'Flagged', color: 'var(--color-warning)', icon: 'star', smart: true },
  { id: 'scheduled', name: 'Scheduled', color: 'var(--color-error)', icon: 'calendar', smart: true },
  { id: 'completed', name: 'Completed', color: 'var(--color-success)', icon: 'check-circle', smart: true },
  { id: 'all', name: 'All', color: 'var(--color-text-tertiary)', icon: 'list' },
  { id: 'personal', name: 'Personal', color: 'var(--color-success)', icon: 'user' },
  { id: 'work', name: 'Work', color: 'var(--color-warning)', icon: 'briefcase' },
];

const TASK_TEMPLATES: { name: string; tasks: Omit<Task, 'id'>[] }[] = [
  {
    name: 'Morning Routine',
    tasks: [
      { title: 'Review schedule for today', completed: false, priority: 'high', dueDate: null, list: 'personal', notes: '' },
      { title: 'Check emails and respond', completed: false, priority: 'medium', dueDate: null, list: 'work', notes: '' },
      { title: 'Plan top 3 priorities', completed: false, priority: 'high', dueDate: null, list: 'personal', notes: '' },
    ],
  },
  {
    name: 'Project Kickoff',
    tasks: [
      { title: 'Define project scope', completed: false, priority: 'high', dueDate: null, list: 'work', notes: '' },
      { title: 'Create project timeline', completed: false, priority: 'high', dueDate: null, list: 'work', notes: '' },
      { title: 'Identify team members', completed: false, priority: 'medium', dueDate: null, list: 'work', notes: '' },
      { title: 'Set up communication channels', completed: false, priority: 'medium', dueDate: null, list: 'work', notes: '' },
      { title: 'Create initial task breakdown', completed: false, priority: 'high', dueDate: null, list: 'work', notes: '' },
    ],
  },
  {
    name: 'Weekly Review',
    tasks: [
      { title: 'Review completed tasks', completed: false, priority: 'medium', dueDate: null, list: 'personal', notes: '' },
      { title: 'Clear inbox to zero', completed: false, priority: 'medium', dueDate: null, list: 'personal', notes: '' },
      { title: 'Plan next week goals', completed: false, priority: 'high', dueDate: null, list: 'personal', notes: '' },
      { title: 'Update project status', completed: false, priority: 'medium', dueDate: null, list: 'work', notes: '' },
    ],
  },
  {
    name: 'Bug Fix Sprint',
    tasks: [
      { title: 'Reproduce the bug', completed: false, priority: 'high', dueDate: null, list: 'work', notes: '' },
      { title: 'Identify root cause', completed: false, priority: 'high', dueDate: null, list: 'work', notes: '' },
      { title: 'Write fix', completed: false, priority: 'high', dueDate: null, list: 'work', notes: '' },
      { title: 'Write tests', completed: false, priority: 'medium', dueDate: null, list: 'work', notes: '' },
      { title: 'Code review', completed: false, priority: 'medium', dueDate: null, list: 'work', notes: '' },
      { title: 'Deploy and verify', completed: false, priority: 'high', dueDate: null, list: 'work', notes: '' },
    ],
  },
];

// Load tasks from backend or localStorage
const loadTasksFromBackend = async (): Promise<Task[]> => {
  try {
    if (window.dex?.invoke) {
      // Try to get from data store
      const stored = await window.dex.invoke('capability:storage:get', 'dex-tasks');
      if (stored && Array.isArray(stored)) {
        return stored.map((t: Omit<Task, 'dueDate'> & { dueDate: string | null }) => ({
          ...t,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        }));
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Tasks] Backend unavailable, using localStorage');
  }
  return loadTasksFromStorage();
};

const loadTasksFromStorage = (): Task[] => {
  try {
    const saved = localStorage.getItem('dex-tasks');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((t: Omit<Task, 'dueDate'> & { dueDate: string | null }) => ({
        ...t,
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
      }));
    }
  } catch { /* localStorage unavailable */ }
  return [];
};

const saveTasksToBackend = async (tasks: Task[]): Promise<boolean> => {
  try {
    if (window.dex?.invoke) {
      await window.dex.invoke('capability:storage:set', 'dex-tasks', tasks);
      return true;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Tasks] Backend save failed');
  }
  return false;
};

const saveTasksToStorage = (tasks: Task[]) => {
  localStorage.setItem('dex-tasks', JSON.stringify(tasks));
};

// ===========================================================================
// ICONS
// ===========================================================================

const Icons: Record<string, React.FC<{ color?: string }>> = {
  today: ({ color }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="3" stroke={color} strokeWidth="1.5"/>
      <path d="M3 9h18" stroke={color} strokeWidth="1.5"/>
      <text x="12" y="17" fill={color} fontSize="8" fontWeight="bold" textAnchor="middle">{new Date().getDate()}</text>
    </svg>
  ),
  calendar: ({ color }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  ),
  list: ({ color }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
    </svg>
  ),
  user: ({ color }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  briefcase: ({ color }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
    </svg>
  ),
  plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  ),
  flag: ({ color }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1.5">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <path d="M4 22v-7"/>
    </svg>
  ),
  star: ({ color }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  'check-circle': ({ color }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <circle cx="12" cy="12" r="9"/>
      <path d="M8.5 12.5l2.5 2.5 4.5-5"/>
    </svg>
  ),
};

// ===========================================================================
// COMPONENT
// ===========================================================================

export const Tasks: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('tasks');
  const toast = useToastHelpers();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedList, setSelectedList] = useState('today');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Task['priority']>('all');
  const [recentlyCompleted, setRecentlyCompleted] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'priority' | 'date' | 'name' | 'manual'>('priority');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Multi-selection for bulk complete/delete. Set of task ids.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Guards the async quick-add (it awaits the nl-task parser) against double-fire.
  const [isAdding, setIsAdding] = useState(false);
  const isAddingRef = React.useRef(false);
  // Keyboard triage: the id of the row the j/k cursor is on (null = none).
  const [triageId, setTriageId] = useState<string | null>(null);
  // Quick filter chips that toggle the visible set (priority / list / has-due-date).
  const [chipPriority, setChipPriority] = useState<Task['priority'] | null>(null);
  const [chipList, setChipList] = useState<string | null>(null);
  const [chipHasDue, setChipHasDue] = useState(false);
  const taskListRef = useRef<HTMLDivElement>(null);
  const triageIdRef = useRef<string | null>(null);
  useEffect(() => { triageIdRef.current = triageId; }, [triageId]);
  // Live visible-id order, kept current for the global keyboard-triage handler.
  const visibleIdsRef = useRef<string[]>([]);

  // -- uki context: let the assistant see what the user is doing in Tasks.
  // Registered once; a latest-value ref (refreshed every render) keeps the
  // resolver reading live state without re-registering. Mirrors the Notes
  // resolver so uki has the same awareness across the productivity apps.
  const ukiCtxRef = useRef({ tasks, expandedTask, searchQuery, statusFilter, priorityFilter });
  useEffect(() => { ukiCtxRef.current = { tasks, expandedTask, searchQuery, statusFilter, priorityFilter }; });
  useEffect(() => {
    registerUkiAppContext('tasks', () => {
      const c = ukiCtxRef.current;
      const active = c.tasks.filter(t => !t.completed).length;
      const focused = c.expandedTask ? c.tasks.find(t => t.id === c.expandedTask) : undefined;
      return {
        appId: 'tasks',
        focusedItemId: focused?.id,
        currentFile: focused?.title,
        selectionText: focused ? `${focused.title}${focused.completed ? ' (done)' : ''}` : undefined,
        custom: {
          total: c.tasks.length,
          active,
          done: c.tasks.length - active,
          search: c.searchQuery || undefined,
          statusFilter: c.statusFilter,
          priorityFilter: c.priorityFilter,
        },
      };
    });
    // UKI can READ the task list (no confirm) and ADD a task (mutating -> needs
    // the user's confirmation via the wired confirm surface).
    registerUkiAppAction('tasks', {
      id: 'tasks.listTasks',
      description: "list the user's tasks with their done/active status.",
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ukiCtxRef.current;
      if (!c.tasks.length) return 'No tasks.';
      return c.tasks.slice(0, 100).map((t) => `${t.completed ? '[x]' : '[ ]'} ${t.title}`).join('\n');
    });
    registerUkiAppAction('tasks', {
      id: 'tasks.addTask',
      description: 'add a new task with the given title.',
      args: [{ name: 'title', type: 'string' }],
      example: '{"title": "Buy milk"}',
      mutates: true,
    }, (args) => {
      const title = String(args.title ?? '').trim();
      if (!title) return 'No task title provided.';
      const newTask: Task = {
        id: crypto.randomUUID(),
        title,
        completed: false,
        priority: 'medium',
        dueDate: null,
        dueTime: null,
        list: 'personal',
        notes: '',
      };
      setTasks((prev) => [newTask, ...prev]);
      return `Added task "${title}".`;
    });
    registerUkiAppAction('tasks', {
      id: 'tasks.search',
      description: 'search the task list for a query and return matching task titles.',
      args: [{ name: 'query', type: 'string' }],
      example: '{"query":"invoice"}',
      mutates: false,
    }, (args) => {
      const c = ukiCtxRef.current;
      if (!c.tasks.length) return 'No tasks.';
      const q = String(args.query ?? '');
      const blob = c.tasks.map((t) => `${t.completed ? '[x]' : '[ ]'} ${t.title}`).join('\n');
      const hits = searchLines(blob, q, 25);
      return hits.length ? hits.map((h) => h.text).join('\n') : `No tasks match "${q}".`;
    });
    return () => {
      unregisterUkiAppContext('tasks');
      unregisterUkiAppAction('tasks.listTasks');
      unregisterUkiAppAction('tasks.addTask');
      unregisterUkiAppAction('tasks.search');
    };
  }, []);
  const dragIdRef = React.useRef<string | null>(null);
  const newTaskInputRef = React.useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: Ctrl+N to focus new task input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'tasks')) return; // key meant for another app
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        newTaskInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  // Load tasks from backend on mount
  useEffect(() => {
    // Drain any tasks uki chat queued ("add a task: ...") and clear the queue, so
    // the task lands here for real whether Tasks was opened by us or already open.
    const drainPending = (): Task[] => {
      let q: unknown = [];
      try { q = JSON.parse(localStorage.getItem('dex-uki-pending-tasks') || '[]'); } catch { q = []; }
      if (!Array.isArray(q) || q.length === 0) return [];
      localStorage.removeItem('dex-uki-pending-tasks');
      return q
        .map((item: { title?: unknown }) => (item && item.title ? String(item.title).trim() : ''))
        .filter(Boolean)
        .map((title: string): Task => ({ id: crypto.randomUUID(), title, completed: false, priority: 'medium', dueDate: null, list: 'personal', notes: '' }));
    };
    const loadTasks = async () => {
      setIsLoading(true);
      const loadedTasks = await loadTasksFromBackend();
      const pending = drainPending();
      setTasks(pending.length ? [...pending, ...loadedTasks] : loadedTasks);
      setIsLoading(false);
    };
    loadTasks();
    const onPending = () => { const p = drainPending(); if (p.length) setTasks(prev => [...p, ...prev]); };
    window.addEventListener('uki:tasks-pending', onPending);
    return () => window.removeEventListener('uki:tasks-pending', onPending);
  }, []);

  // Save to backend and localStorage when tasks change
  useEffect(() => {
    if (tasks.length > 0 || !isLoading) {
      saveTasksToBackend(tasks);
      saveTasksToStorage(tasks);
    }
  }, [tasks, isLoading]);

  const selectedListData = LISTS.find(l => l.id === selectedList) || LISTS[0];

  // Live parse of the quick-add bar so the user sees the inferred date/priority/list
  // as they type. Recomputed on every keystroke; cheap and pure.
  const quickAddPreview = useMemo(() => {
    const raw = newTaskTitle.trim();
    if (!raw) return null;
    const p = parseQuickAdd(raw, LISTS, new Date());
    if (!p.dueDate && !p.priority && !p.list && !p.dueTime) return null;
    return p;
  }, [newTaskTitle]);

  const filteredTasks = useMemo(() => tasks.filter(task => {
    // The Completed smart list is the one view that must always show done tasks.
    if (selectedList !== 'completed' && !showCompleted && task.completed) return false;
    // Status filter (all / active / done)
    if (statusFilter === 'active' && task.completed) return false;
    if (statusFilter === 'done' && !task.completed) return false;
    // Priority filter
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    // Quick filter chips (additive narrowing on top of the active list/view).
    if (chipPriority && task.priority !== chipPriority) return false;
    if (chipList && task.list !== chipList) return false;
    if (chipHasDue && !task.dueDate) return false;
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!task.title.toLowerCase().includes(q) && !(task.description || '').toLowerCase().includes(q)) return false;
    }
    const now = new Date();
    switch (selectedList) {
      case 'today':
        // Snoozed tasks drop out of Today until their snooze elapses.
        if (isSnoozed(task, now)) return false;
        return !!task.dueDate && new Date(task.dueDate).toDateString() === now.toDateString();
      case 'upcoming': {
        // Due strictly after today and not completed.
        if (task.completed || !task.dueDate) return false;
        return atStartOfDay(new Date(task.dueDate)).getTime() > atStartOfDay(now).getTime();
      }
      case 'overdue': {
        if (task.completed) return false;
        const due = taskDueDateTime(task);
        return due !== null && due.getTime() < now.getTime();
      }
      case 'flagged':
        return !!task.flagged;
      case 'completed':
        return task.completed;
      case 'scheduled':
        return task.dueDate !== null;
      case 'all':
        return true;
      default:
        return task.list === selectedList;
    }
  }), [tasks, showCompleted, selectedList, searchQuery, statusFilter, priorityFilter, chipPriority, chipList, chipHasDue]);

  const reorderTasks = useCallback((sourceId: string, targetId: string) => {
    setTasks(prev => {
      const arr = [...prev];
      const srcIdx = arr.findIndex(t => t.id === sourceId);
      const tgtIdx = arr.findIndex(t => t.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) return prev;
      const [moved] = arr.splice(srcIdx, 1);
      arr.splice(tgtIdx, 0, moved);
      return arr;
    });
  }, []);

  const sortedTasks = useMemo(() => {
    if (sortBy === 'manual') return filteredTasks;
    return [...filteredTasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (sortBy === 'date') {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      }
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
      return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
    });
  }, [filteredTasks, sortBy]);

  // Progressive rendering for large task lists (DEX 5.5 scroll audit). Manual
  // sort enables drag-reorder, which needs every row present, so windowing only
  // applies to the computed (non-manual) sort modes.
  const TASKS_PER_PAGE = 60;
  const [taskVisibleCount, setTaskVisibleCount] = useState(TASKS_PER_PAGE);
  const tasksWindowed = sortBy !== 'manual';
  useEffect(() => { setTaskVisibleCount(TASKS_PER_PAGE); }, [sortBy, sortedTasks.length]);
  const visibleTasks = tasksWindowed ? sortedTasks.slice(0, taskVisibleCount) : sortedTasks;
  const remainingTasks = sortedTasks.length - visibleTasks.length;
  // Keep the keyboard-triage id order in sync with what's actually on screen, and
  // drop the cursor if the highlighted row scrolls/filters out of view.
  useEffect(() => {
    const ids = visibleTasks.map(t => t.id);
    visibleIdsRef.current = ids;
    // Drop the triage cursor when its row is no longer visible.
    setTriageId(prev => (prev && ids.includes(prev) ? prev : null));
  }, [visibleTasks]);
  const handleTaskScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!tasksWindowed) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 220) {
      setTaskVisibleCount(v => (v < sortedTasks.length ? v + TASKS_PER_PAGE : v));
    }
  }, [tasksWindowed, sortedTasks.length]);

  const clearCompleted = () => setTasks(prev => prev.filter(t => !t.completed));

  // ===== Dependency links ("blocked by") =====
  // Fast id->task lookup for resolving blockers in render and toggle paths.
  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  /** Open (incomplete) blockers referenced by a task's blockedBy list. */
  const openBlockers = useCallback((task: Task): Task[] => {
    if (!task.blockedBy || task.blockedBy.length === 0) return [];
    return task.blockedBy
      .map(bid => tasksById.get(bid))
      .filter((b): b is Task => !!b && !b.completed);
  }, [tasksById]);

  /** Toggle a blocker link on `task` for blocker id `blockerId` (no self-links). */
  const toggleBlocker = useCallback((taskId: string, blockerId: string) => {
    if (taskId === blockerId) return;
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const cur = t.blockedBy || [];
      const next = cur.includes(blockerId) ? cur.filter(b => b !== blockerId) : [...cur, blockerId];
      return { ...t, blockedBy: next.length ? next : undefined };
    }));
  }, []);

  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    // Guard: completing a task with open blockers requires a confirmation; warn instead.
    if (task && !task.completed) {
      const blockers = openBlockers(task);
      if (blockers.length > 0) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: `Blocked by ${blockers.length} incomplete task${blockers.length === 1 ? '' : 's'}: ${blockers.map(b => b.title).join(', ')}` } }));
        return;
      }
    }
    setTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
      // Recurring rollover: completing a daily/weekly/monthly task spawns the next
      // occurrence with its due date advanced one step, fresh (uncompleted) subtasks,
      // and the recurrence preserved. The completed instance stays as history.
      if (task && !task.completed && task.recurring && task.recurring !== 'none' && task.dueDate) {
        const nextDue = advanceRecurrence(new Date(task.dueDate), task.recurring);
        const spawned: Task = {
          ...task,
          id: crypto.randomUUID(),
          completed: false,
          dueDate: nextDue,
          subtasks: task.subtasks?.map(s => ({ ...s, id: crypto.randomUUID(), completed: false })),
        };
        return [spawned, ...next];
      }
      return next;
    });
    if (task && !task.completed) {
      // Trigger the brief completion animation, then clear the flag so it can replay.
      setRecentlyCompleted(id);
      window.setTimeout(() => setRecentlyCompleted(prev => (prev === id ? null : prev)), 400);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'tasksCompleted', amount: 1 } }));
      if (task.recurring && task.recurring !== 'none' && task.dueDate) {
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: `Next ${task.recurring} occurrence scheduled` } }));
      }
    }
  };

  const addTask = async () => {
    const raw = newTaskTitle.trim();
    if (!raw) return;
    // Re-entrancy guard: addTask awaits the nl-task parser, so a fast second
    // Enter/click could otherwise fire it twice. Ref guards synchronously.
    if (isAddingRef.current) return;
    isAddingRef.current = true;
    setIsAdding(true);
    try {

    // Primary: synchronous quick-add parse. Pulls out the natural-language due
    // date/time, !priority, #list and @date tokens, leaving a clean title.
    const parsed = parseQuickAdd(raw, LISTS, new Date());
    let title = parsed.title || raw;
    let parsedDue: Date | null = parsed.dueDate;
    let parsedTime: string | null = parsed.dueTime;
    let parsedPriority: Task['priority'] | null = parsed.priority;
    const parsedList: string | null = parsed.list;

    // Secondary: if the native nl-task engine is present it can refine anything
    // the local parser missed (never overrides what we already detected).
    if (!parsedDue || !parsedPriority) {
      try {
        const nl = await dexInvoke<{ title?: string; dueDate?: string | null; priority?: string }>('nl-task:parse', raw);
        if (nl && typeof nl === 'object') {
          if (!parsedDue && nl.dueDate) {
            const d = new Date(nl.dueDate);
            if (!isNaN(d.getTime())) parsedDue = d;
          }
          if (!parsedPriority) {
            if (nl.priority === 'high' || nl.priority === 'low') parsedPriority = nl.priority;
            else if (nl.priority === 'normal') parsedPriority = 'medium';
          }
        }
      } catch {
        /* local parse already stands on its own */
      }
    }

    // The explicit date picker, when set, wins over any parsed phrase.
    const dueDate = newTaskDue
      ? new Date(newTaskDue)
      : (parsedDue ?? (selectedList === 'today' || selectedList === 'overdue' || selectedList === 'scheduled' || selectedList === 'upcoming' ? new Date() : null));

    // Resolve the destination list: an inline #list wins, otherwise the current
    // concrete (non-smart) list, otherwise Personal.
    const currentListIsConcrete = !!LISTS.find(l => l.id === selectedList && !l.smart);
    const list = parsedList || (currentListIsConcrete ? selectedList : 'personal');

    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      priority: parsedPriority ?? 'medium',
      dueDate,
      dueTime: parsedTime,
      list,
      notes: '',
      flagged: selectedList === 'flagged' ? true : undefined,
    };
    setTasks([newTask, ...tasks]);
    setNewTaskTitle('');
    setNewTaskDue('');
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'tasksCreated', amount: 1 } }));
    } finally {
      isAddingRef.current = false;
      setIsAdding(false);
    }
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const addSubtask = (taskId: string) => {
    if (!subtaskInput.trim()) return;
    setTasks(tasks.map(t => t.id === taskId ? {
      ...t,
      subtasks: [...(t.subtasks || []), { id: crypto.randomUUID(), title: subtaskInput.trim(), completed: false }],
    } : t));
    setSubtaskInput('');
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    setTasks(tasks.map(t => t.id === taskId ? {
      ...t,
      subtasks: (t.subtasks || []).map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s),
    } : t));
  };

  const deleteSubtask = (taskId: string, subtaskId: string) => {
    setTasks(tasks.map(t => t.id === taskId ? {
      ...t,
      subtasks: (t.subtasks || []).filter(s => s.id !== subtaskId),
    } : t));
  };

  const setRecurring = (taskId: string, recurring: Task['recurring']) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, recurring } : t));
  };

  const toggleFlag = (taskId: string) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, flagged: !t.flagged } : t));
  };

  // ===== Subtask rollup =====
  // Completion percentage of a task's subtasks (0..100), or null when none.
  const subtaskProgress = (task: Task): number | null => {
    const subs = task.subtasks || [];
    if (subs.length === 0) return null;
    return Math.round((subs.filter(s => s.completed).length / subs.length) * 100);
  };

  // ===== Multi-selection / bulk actions =====
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectAllVisible = () => {
    setSelectedIds(new Set(sortedTasks.map(t => t.id)));
  };

  const bulkComplete = () => {
    if (selectedIds.size === 0) return;
    const ids = selectedIds;
    let spawnedCount = 0;
    setTasks(prev => {
      const result: Task[] = [];
      for (const t of prev) {
        const willComplete = ids.has(t.id) && !t.completed;
        // Mirror single-toggle recurrence rollover for any recurring task we complete.
        if (willComplete && t.recurring && t.recurring !== 'none' && t.dueDate) {
          result.push({
            ...t,
            id: crypto.randomUUID(),
            completed: false,
            dueDate: advanceRecurrence(new Date(t.dueDate), t.recurring),
            subtasks: t.subtasks?.map(s => ({ ...s, id: crypto.randomUUID(), completed: false })),
          });
          spawnedCount++;
        }
        result.push(ids.has(t.id) ? { ...t, completed: true } : t);
      }
      return result;
    });
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'tasksCompleted', amount: ids.size } }));
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Completed ${ids.size} task${ids.size === 1 ? '' : 's'}${spawnedCount ? ` · ${spawnedCount} re-scheduled` : ''}` } }));
    clearSelection();
  };

  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setTasks(prev => prev.filter(t => !selectedIds.has(t.id)));
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: `Deleted ${count} task${count === 1 ? '' : 's'}` } }));
    clearSelection();
  };

  const bulkFlag = () => {
    if (selectedIds.size === 0) return;
    setTasks(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, flagged: true } : t));
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Flagged ${selectedIds.size} task${selectedIds.size === 1 ? '' : 's'}` } }));
    clearSelection();
  };

  const setDescription = (taskId: string, description: string) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, description } : t));
  };

  const { menuState, show: showCtx, close: closeCtx } = useContextMenu();

  const cyclePriority = (id: string) => {
    setTasks(tasks.map(t => {
      if (t.id !== id) return t;
      // P1 (high) -> P2 (medium) -> P3 (low) -> P4 (none) -> back to P1.
      const order: Task['priority'][] = ['high', 'medium', 'low', 'none'];
      const idx = order.indexOf(t.priority);
      return { ...t, priority: order[(idx + 1) % order.length] };
    }));
  };

  const setPriority = (id: string, priority: Task['priority']) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, priority } : t));
  };

  const setDueTime = (id: string, time: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, dueTime: time || null } : t));
  };

  // ===== Snooze =====
  // Set snoozedUntil to a future date. Also rolls the dueDate forward to match so
  // the task reappears in Today on the chosen day rather than staying overdue.
  const snoozeTask = useCallback((id: string, until: Date) => {
    const u = atStartOfDay(until);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, snoozedUntil: u.toISOString(), dueDate: u } : t));
    setExpandedTask(null);
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: `Snoozed until ${u.toLocaleDateString([], { month: 'short', day: 'numeric' })}` } }));
  }, []);

  const snoozeTomorrow = useCallback((id: string) => {
    const d = atStartOfDay(new Date());
    d.setDate(d.getDate() + 1);
    snoozeTask(id, d);
  }, [snoozeTask]);

  const snoozeNextWeek = useCallback((id: string) => {
    const d = atStartOfDay(new Date());
    d.setDate(d.getDate() + 7);
    snoozeTask(id, d);
  }, [snoozeTask]);

  const unsnooze = useCallback((id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, snoozedUntil: null } : t));
  }, []);

  // ===== Estimated vs actual time =====
  const setEstimate = useCallback((id: string, minutes: number | null) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, estimateMinutes: minutes && minutes > 0 ? minutes : null } : t));
  }, []);

  /** Add (or subtract) minutes to the accumulated actual time. Never goes below 0. */
  const logActual = useCallback((id: string, deltaMinutes: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const next = Math.max(0, (t.actualMinutes || 0) + deltaMinutes);
      return { ...t, actualMinutes: next || null };
    }));
  }, []);

  // Running tally across the currently-visible (sorted) tasks.
  const timeTotals = useMemo(() => {
    let est = 0, act = 0;
    for (const t of sortedTasks) {
      est += t.estimateMinutes || 0;
      act += t.actualMinutes || 0;
    }
    return { est, act };
  }, [sortedTasks]);

  const buildTaskCtxItems = useCallback((task: Task): ContextMenuItem[] => [
    { id: 'toggle', label: task.completed ? 'Mark Incomplete' : 'Mark Complete', onClick: () => toggleTask(task.id) },
    { id: 'priority', label: `Priority: ${getPriorityLabel(task.priority)}`, shortcut: 'P', onClick: () => cyclePriority(task.id) },
    { id: 'flag', label: task.flagged ? 'Remove Flag' : 'Flag Task', onClick: () => toggleFlag(task.id) },
    { id: 'divs', label: '', divider: true },
    ...(isSnoozed(task)
      ? [{ id: 'unsnooze', label: 'Unsnooze', onClick: () => unsnooze(task.id) }]
      : [
          { id: 'snooze-tmrw', label: 'Snooze · Tomorrow', onClick: () => snoozeTomorrow(task.id) },
          { id: 'snooze-week', label: 'Snooze · Next Week', onClick: () => snoozeNextWeek(task.id) },
        ]),
    { id: 'div1', label: '', divider: true },
    { id: 'expand', label: 'Edit Details', onClick: () => setExpandedTask(task.id) },
    { id: 'div2', label: '', divider: true },
    { id: 'delete', label: 'Delete Task', danger: true, shortcut: 'Del', onClick: () => deleteTask(task.id) },
  ], [toggleTask, cyclePriority, deleteTask, toggleFlag, snoozeTomorrow, snoozeNextWeek, unsnooze]);

  const applyTemplate = useCallback((templateIdx: number) => {
    const template = TASK_TEMPLATES[templateIdx];
    if (!template) return;
    const newTasks = template.tasks.map(t => ({
      ...t,
      id: crypto.randomUUID(),
      dueDate: selectedList === 'today' ? new Date() : null,
    }));
    // The new tasks appear at the top of the list; no popup needed.
    setTasks(prev => [...newTasks, ...prev]);
  }, [selectedList]);

  const getListCount = (listId: string): number => {
    const now = new Date();
    return tasks.filter(t => {
      // The Completed list counts done tasks; every other list counts open ones.
      if (listId === 'completed') return t.completed;
      if (t.completed) return false;
      switch (listId) {
        case 'today':
          return !!t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString();
        case 'upcoming':
          return !!t.dueDate && atStartOfDay(new Date(t.dueDate)).getTime() > atStartOfDay(now).getTime();
        case 'overdue': {
          const due = taskDueDateTime(t);
          return due !== null && due.getTime() < now.getTime();
        }
        case 'flagged':
          return !!t.flagged;
        case 'scheduled':
          return t.dueDate !== null;
        case 'all':
          return true;
        default:
          return t.list === listId;
      }
    }).length;
  };

  const getPriorityColor = (priority: Task['priority']): string => {
    switch (priority) {
      case 'high': return 'var(--color-error)';
      case 'medium': return 'var(--color-warning)';
      case 'low': return 'var(--color-accent)';
      case 'none': return 'var(--color-text-muted)';
    }
  };

  // P1 = highest. Maps the semantic priority to the macOS-style P-label/badge.
  const getPriorityLabel = (priority: Task['priority']): string => {
    switch (priority) {
      case 'high': return 'P1';
      case 'medium': return 'P2';
      case 'low': return 'P3';
      case 'none': return 'P4';
    }
  };

  // A task is overdue when its due date/time is in the past and it is not yet done.
  const isOverdue = (task: Task): boolean => {
    if (task.completed) return false;
    const due = taskDueDateTime(task);
    return due !== null && due.getTime() < Date.now();
  };

  // ===== Keyboard triage mode =====
  // j/k move the cursor, x toggles complete, e edits — only when the list area is
  // focused/hovered and the user is not typing in an input. A ref holds the live
  // visible-id order so the global handler stays registered once.
  const toggleTaskRef = useRef(toggleTask);
  useEffect(() => { toggleTaskRef.current = toggleTask; });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'tasks')) return; // key meant for another app
      // Ignore while typing in any editable control.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ids = visibleIdsRef.current;
      if (ids.length === 0) return;
      // Only engage when focus/pointer is within the task list, to avoid hijacking global keys.
      const listEl = taskListRef.current;
      const active = document.activeElement;
      const within = listEl && (listEl.contains(active) || listEl.matches(':hover'));
      if (!within) return;
      const cur = triageIdRef.current;
      const idx = cur ? ids.indexOf(cur) : -1;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = idx < 0 ? 0 : Math.min(ids.length - 1, idx + 1);
        setTriageId(ids[nextIdx]);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const nextIdx = idx < 0 ? 0 : Math.max(0, idx - 1);
        setTriageId(ids[nextIdx]);
      } else if (e.key === 'x') {
        if (!cur) return;
        e.preventDefault();
        toggleTaskRef.current(cur);
      } else if (e.key === 'e') {
        if (!cur) return;
        e.preventDefault();
        setExpandedTask(prev => (prev === cur ? null : cur));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const formatDueDate = (date: Date | null, time?: string | null): string => {
    if (!date) return '';
    const today = new Date();
    const taskDate = new Date(date);
    let label: string;
    if (taskDate.toDateString() === today.toDateString()) {
      label = 'Today';
    } else {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      label = taskDate.toDateString() === tomorrow.toDateString()
        ? 'Tomorrow'
        : taskDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    if (time) {
      const [h, m] = time.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const t = new Date();
        t.setHours(h, m, 0, 0);
        label += ` ${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      }
    }
    return label;
  };

  return (
    <div className="dex-tasks-root" style={styles.container}>
      <style>{`
        .dex-tasks-root button { font-family: inherit; transition: all 0.12s ease; }
        .dex-tasks-root button:active { transform: scale(0.97); }
        @scope { * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; } }
        @scope { ::-webkit-scrollbar { width: 6px; height: 6px; } }
        @scope { ::-webkit-scrollbar-track { background: transparent; } }
        @scope { ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; } }
        @scope { ::-webkit-scrollbar-thumb:hover { background: var(--color-border); } }
        /* Pointer focus stays clean; keyboard focus uses the one global ring. */
        .dex-tasks-root input:focus:not(:focus-visible),
        .dex-tasks-root select:focus:not(:focus-visible),
        .dex-tasks-root textarea:focus:not(:focus-visible) { outline: none; }
        /* Sidebar list rows: subtle hover lift for inactive rows. */
        .dex-tasks-list-row:hover { background: var(--color-border-subtle) !important; }
        /* Task rows: faint hover wash + reveal the trailing action buttons. */
        .dex-tasks-task-row:hover { background: var(--color-bg-hover, rgba(255,255,255,0.03)); }
        .dex-tasks-row-action { transition: opacity 0.12s ease, background 0.12s ease; }
        .dex-tasks-task-row:hover .dex-tasks-row-action { opacity: 0.85; }
        .dex-tasks-row-action:hover { background: var(--color-border-subtle) !important; opacity: 1 !important; }
        .dex-tasks-row-action:focus-visible { opacity: 1 !important; }
        .dex-tasks-delete:hover { background: var(--color-error-muted, rgba(255,69,58,0.14)) !important; color: var(--color-error) !important; }
        @keyframes dexTaskComplete {
          0% { transform: scale(1); }
          40% { transform: scale(1.015); background: var(--color-success-muted, rgba(48,209,88,0.1)); }
          100% { transform: scale(1); }
        }
        .dex-task-complete { animation: dexTaskComplete 0.4s ease; }
        @media (prefers-reduced-motion: reduce) {
          .dex-tasks-root button:active { transform: none; }
          .dex-task-complete { animation: none; }
        }
      `}</style>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Reminders</span>
        </div>
        
        <div style={styles.lists}>
          {LISTS.map((list, i) => {
            const Icon = Icons[list.icon];
            const count = getListCount(list.id);
            const isActive = selectedList === list.id;
            // Section labels: smart lists first, then the concrete "My Lists".
            const showSmartLabel = i === 0;
            const showMyListsLabel = !list.smart && (i === 0 || LISTS[i - 1].smart);

            return (
              <React.Fragment key={list.id}>
                {showSmartLabel && <div style={styles.sectionLabel}>Smart Lists</div>}
                {showMyListsLabel && <div style={{ ...styles.sectionLabel, marginTop: 'var(--space-2)' }}>My Lists</div>}
                <button
                  aria-label={`Select ${list.name} list`}
                  aria-current={isActive ? 'true' : undefined}
                  className={isActive ? undefined : 'dex-tasks-list-row'}
                  style={{
                    ...styles.listItem,
                    background: isActive ? 'var(--color-border-subtle)' : 'transparent',
                  }}
                  onClick={() => { setSelectedList(list.id); clearSelection(); }}
                >
                  <div style={styles.listIcon}>
                    <Icon color={list.color} />
                  </div>
                  <span style={{ flex: 1, color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                    {list.name}
                  </span>
                  {count > 0 && (
                    <span style={{...styles.listCount, color: list.color}}>{count}</span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        <div className="dex-liquid-glass" style={styles.header}>
          <div style={styles.headerTitle}>
            <span style={{...styles.titleText, color: selectedListData.color}}>
              {selectedListData.name}
            </span>
            <span style={styles.taskCount}>
              {sortedTasks.filter(t => !t.completed).length} tasks
              {(timeTotals.est > 0 || timeTotals.act > 0) && (
                <span style={{ marginLeft: 8, color: 'var(--color-text-tertiary)' }} title="Estimated vs actual time across these tasks">
                  · est {formatMinutes(timeTotals.est)} / act {formatMinutes(timeTotals.act)}
                </span>
              )}
            </span>
          </div>
          <div className="dex-tasks-controls" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
          <button
            style={styles.toggleCompleted}
            onClick={() => setShowCompleted(!showCompleted)}
            aria-label={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
            aria-pressed={showCompleted}
          >
            {showCompleted ? 'Hide' : 'Show'} Completed
          </button>
          <button
            style={{...styles.toggleCompleted, color: showCalendarView ? 'var(--color-accent, #0a84ff)' : undefined}}
            onClick={() => setShowCalendarView(!showCalendarView)}
            aria-label={showCalendarView ? 'Hide calendar view' : 'Show calendar view'}
            aria-pressed={showCalendarView}
          >
            {showCalendarView ? 'List' : 'Calendar'}
          </button>
          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'priority' | 'date' | 'name' | 'manual')}
            aria-label="Sort tasks by"
            style={{
              padding: '4px var(--space-2)', borderRadius: 10, fontSize: 11, fontWeight: 500,
              background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)', cursor: 'pointer', outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            <option value="priority">Priority</option>
            <option value="date">Due Date</option>
            <option value="name">Name</option>
            <option value="manual">Manual</option>
          </select>
          {/* Clear Completed */}
          {tasks.some(t => t.completed) && (
            <button
              style={{...styles.toggleCompleted, color: 'var(--color-error)'}}
              onClick={clearCompleted}
              aria-label="Clear completed tasks"
            >
              Clear Done
            </button>
          )}
          </div>
        </div>
        {/* Search Bar */}
        <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
          <DexSearchInput
            size="sm"
            fullWidth
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
          />
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-4) var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Status:</span>
          {([
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'done', label: 'Done' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => setStatusFilter(opt.id)}
              aria-label={`Filter by status: ${opt.label}`}
              style={{
                padding: '3px 10px', borderRadius: 'var(--radius-lg, 10px)', fontSize: 11, cursor: 'pointer',
                border: '1px solid var(--color-border-subtle)',
                background: statusFilter === opt.id ? 'var(--color-accent-light)' : 'var(--color-bg-hover)',
                color: statusFilter === opt.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                fontWeight: statusFilter === opt.id ? 600 : 400, fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, marginLeft: 'var(--space-2)' }}>Priority:</span>
          {([
            { id: 'all', label: 'All' },
            { id: 'high', label: 'P1' },
            { id: 'medium', label: 'P2' },
            { id: 'low', label: 'P3' },
            { id: 'none', label: 'P4' },
          ] as const).map(opt => {
            const active = priorityFilter === opt.id;
            const accent = opt.id === 'all' ? 'var(--color-accent)' : getPriorityColor(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => setPriorityFilter(opt.id)}
                aria-label={`Filter by priority: ${opt.label}`}
                style={{
                  padding: '3px 10px', borderRadius: 'var(--radius-lg, 10px)', fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${active ? accent : 'var(--color-border-subtle)'}`,
                  background: 'var(--color-bg-hover)',
                  color: active ? accent : 'var(--color-text-secondary)',
                  fontWeight: active ? 600 : 400, fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Quick filter chips — additive toggles over the active list. */}
        {(() => {
          const chip = (active: boolean, accent: string): React.CSSProperties => ({
            padding: '3px 10px', borderRadius: 'var(--radius-pill, 999px)', fontSize: 11, cursor: 'pointer',
            border: `1px solid ${active ? accent : 'var(--color-border-subtle)'}`,
            background: active ? 'var(--color-accent-light, rgba(10,132,255,0.12))' : 'var(--color-bg-hover)',
            color: active ? accent : 'var(--color-text-secondary)',
            fontWeight: active ? 600 : 400, fontFamily: 'inherit',
          });
          const concreteLists = LISTS.filter(l => !l.smart && l.id !== 'all');
          const anyChip = chipPriority || chipList || chipHasDue;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 var(--space-4) var(--space-2)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Quick:</span>
              {(['high', 'medium', 'low'] as const).map(p => {
                const active = chipPriority === p;
                return (
                  <button key={p} onClick={() => setChipPriority(active ? null : p)} aria-label={`Toggle quick filter ${getPriorityLabel(p)}`} style={chip(active, getPriorityColor(p))}>
                    {getPriorityLabel(p)}
                  </button>
                );
              })}
              {concreteLists.map(l => {
                const active = chipList === l.id;
                return (
                  <button key={l.id} onClick={() => setChipList(active ? null : l.id)} aria-label={`Toggle quick filter list ${l.name}`} style={chip(active, l.color)}>
                    #{l.name}
                  </button>
                );
              })}
              <button onClick={() => setChipHasDue(v => !v)} aria-label="Toggle quick filter has due date" style={chip(chipHasDue, 'var(--color-accent)')}>
                Has Due Date
              </button>
              {anyChip && (
                <button onClick={() => { setChipPriority(null); setChipList(null); setChipHasDue(false); }} aria-label="Clear quick filters" style={{ ...chip(false, 'var(--color-error)'), color: 'var(--color-error)' }}>
                  Clear
                </button>
              )}
            </div>
          );
        })()}

        {/* Calendar View */}
        {showCalendarView && (() => {
          const year = calendarMonth.getFullYear();
          const month = calendarMonth.getMonth();
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const today = new Date();
          const days: (number | null)[] = [];
          for (let i = 0; i < firstDay; i++) days.push(null);
          for (let d = 1; d <= daysInMonth; d++) days.push(d);
          const getTasksForDay = (day: number) => tasks.filter(t =>
            t.dueDate && new Date(t.dueDate).getFullYear() === year &&
            new Date(t.dueDate).getMonth() === month &&
            new Date(t.dueDate).getDate() === day
          );
          return (
            <div style={{ padding: '0 var(--space-4) var(--space-3)', borderBottom: '1px solid var(--color-bg-hover)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 16 }} aria-label="Previous month"><DexIcon name="chevron-left" size={16} /></button>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 16 }} aria-label="Next month"><DexIcon name="chevron-right" size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--color-text-tertiary)', padding: '2px 0', fontWeight: 600 }}>{d}</div>
                ))}
                {days.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} />;
                  const dayTasks = getTasksForDay(day);
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                  const hasTasks = dayTasks.length > 0;
                  const openDay = () => { if (hasTasks) { setSelectedList('scheduled'); setShowCalendarView(false); } };
                  return (
                    <div
                      key={day}
                      onClick={openDay}
                      role={hasTasks ? 'button' : undefined}
                      tabIndex={hasTasks ? 0 : undefined}
                      aria-label={hasTasks ? `${calendarMonth.toLocaleString('default', { month: 'long' })} ${day}, ${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}` : undefined}
                      onKeyDown={hasTasks ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(); } } : undefined}
                      style={{
                        textAlign: 'center', padding: '4px 2px', borderRadius: 4, cursor: dayTasks.length > 0 ? 'pointer' : 'default',
                        background: isToday ? 'var(--color-accent-light, rgba(10,132,255,0.2))' : dayTasks.length > 0 ? 'var(--color-border-subtle)' : 'transparent',
                        border: isToday ? '1px solid var(--color-accent-soft, rgba(10,132,255,0.4))' : '1px solid transparent',
                      }}
                    >
                      <div style={{ fontSize: 11, color: isToday ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: isToday ? 600 : 400 }}>{day}</div>
                      {dayTasks.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 2 }}>
                          {dayTasks.slice(0, 3).map((t, j) => (
                            <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: t.completed ? 'var(--color-success)' : t.priority === 'high' ? 'var(--color-error)' : 'var(--color-accent-fill)' }} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Add Task */}
        <div className="dex-tasks-add-button" style={styles.addTask}>
          <div style={{ ...styles.checkbox, cursor: 'default' }} aria-hidden="true" />
          <input
            type="text"
            placeholder='Add a task — try "Submit report tomorrow 5pm !high #work"'
            ref={newTaskInputRef}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isAdding) { e.preventDefault(); addTask(); }
              else if (e.key === 'Escape' && newTaskTitle) { e.preventDefault(); setNewTaskTitle(''); setNewTaskDue(''); }
            }}
            aria-label="Add a task"
            style={styles.addInput}
          />
          <input
            type="date"
            value={newTaskDue}
            onChange={(e) => setNewTaskDue(e.target.value)}
            aria-label="Due date"
            style={{
              padding: '4px var(--space-2)', borderRadius: 4,
              background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)', fontSize: 12,
              outline: 'none', fontFamily: 'inherit',
              colorScheme: 'dark',
            }}
          />
          <button
            style={{ ...styles.addBtn, opacity: isAdding ? 0.6 : 1, cursor: isAdding ? 'default' : 'pointer' }}
            onClick={addTask}
            disabled={isAdding}
            aria-label="Add task"
          >
            <Icons.plus />
          </button>
        </div>

        {/* Quick-add live parse preview: shows the fields inferred from the typed
            string (date, time, priority, list) before the task is created. */}
        {quickAddPreview && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 var(--space-6) 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Detected:</span>
            {quickAddPreview.dueDate && (
              <span style={styles.previewChip}>
                {formatDueDate(quickAddPreview.dueDate, quickAddPreview.dueTime)}
              </span>
            )}
            {quickAddPreview.priority && (
              <span style={{ ...styles.previewChip, color: getPriorityColor(quickAddPreview.priority), borderColor: getPriorityColor(quickAddPreview.priority) }}>
                {getPriorityLabel(quickAddPreview.priority)}
              </span>
            )}
            {quickAddPreview.list && (
              <span style={styles.previewChip}>
                #{(LISTS.find(l => l.id === quickAddPreview.list)?.name || quickAddPreview.list)}
              </span>
            )}
            {quickAddPreview.title && quickAddPreview.title !== newTaskTitle.trim() && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                → "{quickAddPreview.title}"
              </span>
            )}
          </div>
        )}

        {/* Bulk action toolbar: appears while one or more tasks are selected. */}
        {selectedIds.size > 0 && (
          <div style={styles.bulkBar}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {selectedIds.size} selected
            </span>
            <button style={styles.bulkBtn} onClick={bulkComplete} aria-label="Complete selected tasks">Complete</button>
            <button style={styles.bulkBtn} onClick={bulkFlag} aria-label="Flag selected tasks">Flag</button>
            <button style={{ ...styles.bulkBtn, color: 'var(--color-error)', borderColor: 'var(--color-error)' }} onClick={bulkDelete} aria-label="Delete selected tasks">Delete</button>
            <button style={styles.bulkBtn} onClick={selectAllVisible} aria-label="Select all visible tasks">Select All</button>
            <button style={{ ...styles.bulkBtn, marginLeft: 'auto' }} onClick={clearSelection} aria-label="Clear selection">Clear</button>
          </div>
        )}

        {/* Task Templates */}
        <div style={{ display: 'flex', gap: 4, padding: '0 var(--space-5) 6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: '24px', marginRight: 4 }}>Templates:</span>
          {TASK_TEMPLATES.map((t, i) => (
            <button
              key={t.name}
              onClick={() => applyTemplate(i)}
              className="dex-hover-bg"
              style={{
                padding: '3px var(--space-2)', borderRadius: 10,
                background: 'var(--color-border-subtle)',
                border: '1px solid var(--color-bg-hover)',
                color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t.name}
            </button>
          ))}
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', lineHeight: '24px', marginLeft: 'auto' }} title="Hover or focus the list, then use the keyboard">
            Triage: j/k move · x done · e edit
          </span>
        </div>

        {/* Task List */}
        <div ref={taskListRef} tabIndex={-1} className="dex-scroll-fade-y" style={styles.taskList} onScroll={handleTaskScroll}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4) 0' }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 48, borderRadius: 10, background: 'var(--color-border-subtle)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : (
          <>
          {visibleTasks.map(task => (
            <div key={task.id}>
              <div
                className={`dex-task-item dex-tasks-task-row${recentlyCompleted === task.id ? ' dex-task-complete' : ''}`}
                draggable={sortBy === 'manual'}
                onDragStart={() => { dragIdRef.current = task.id; }}
                onDragOver={e => { if (sortBy !== 'manual') return; e.preventDefault(); setDragOverId(task.id); }}
                onDrop={e => { e.preventDefault(); if (dragIdRef.current && dragIdRef.current !== task.id) reorderTasks(dragIdRef.current, task.id); setDragOverId(null); dragIdRef.current = null; }}
                onDragEnd={() => { setDragOverId(null); dragIdRef.current = null; }}
                style={{
                  ...styles.taskItem,
                  opacity: task.completed ? 0.5 : 1,
                  cursor: sortBy === 'manual' ? 'grab' : 'pointer',
                  outline: dragOverId === task.id
                    ? '2px solid var(--color-accent)'
                    : triageId === task.id ? '2px solid var(--color-accent-soft, rgba(10,132,255,0.6))' : 'none',
                  outlineOffset: '-2px',
                  background: triageId === task.id ? 'var(--color-accent-light, rgba(10,132,255,0.08))' : undefined,
                }}
                onClick={() => { setTriageId(task.id); setExpandedTask(expandedTask === task.id ? null : task.id); }}
                onContextMenu={e => showCtx(e, buildTaskCtxItems(task))}
              >
                {sortBy === 'manual' && (
                  <span className="dex-tasks-drag-handle" style={{ flexShrink: 0, color: 'var(--color-text-muted)', opacity: 0.5, lineHeight: 0 }}>
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                      <circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/>
                      <circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/>
                      <circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/>
                    </svg>
                  </span>
                )}
                {/* Multi-select checkbox (square, distinct from the round complete toggle). */}
                <button
                  aria-label={selectedIds.has(task.id) ? `Deselect "${task.title}"` : `Select "${task.title}"`}
                  onClick={(e) => { e.stopPropagation(); toggleSelected(task.id); }}
                  style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: selectedIds.has(task.id) ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                    background: selectedIds.has(task.id) ? 'var(--color-accent-fill)' : 'transparent',
                    color: 'var(--color-accent-text, #fff)',
                  }}
                >
                  {selectedIds.has(task.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                </button>
                {(() => {
                  const blocked = !task.completed && openBlockers(task).length > 0;
                  return (
                    <button
                      aria-label={task.completed ? `Mark "${task.title}" incomplete` : blocked ? `"${task.title}" is blocked` : `Complete "${task.title}"`}
                      title={blocked ? 'Blocked by an incomplete task' : undefined}
                      style={{
                        ...styles.checkbox,
                        background: task.completed ? 'var(--color-success)' : 'transparent',
                        borderColor: task.completed ? 'var(--color-success)' : blocked ? 'var(--color-error)' : 'var(--color-text-tertiary)',
                        cursor: blocked ? 'not-allowed' : 'pointer',
                      }}
                      onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                    >
                      {task.completed && <Icons.check />}
                      {blocked && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-error)', lineHeight: 1 }}>!</span>}
                    </button>
                  );
                })()}
                
                {/* Priority badge (P1 error, P2 warning, P3 accent, P4 muted) */}
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    padding: '2px 5px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    color: getPriorityColor(task.priority),
                    border: `1px solid ${getPriorityColor(task.priority)}`,
                    background: 'transparent',
                    lineHeight: 1.2,
                    opacity: task.priority === 'none' ? 0.6 : 1,
                  }}
                  title={`Priority: ${getPriorityLabel(task.priority)}`}
                >
                  {getPriorityLabel(task.priority)}
                </span>

                <div style={styles.taskContent}>
                  <span style={{
                    ...styles.taskTitle,
                    textDecoration: task.completed ? 'line-through' : 'none',
                  }}>
                    {task.title}
                    {task.recurring && task.recurring !== 'none' && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{task.recurring}</span>
                    )}
                    {(() => {
                      const blockers = openBlockers(task);
                      if (blockers.length === 0 || task.completed) return null;
                      return (
                        <span
                          title={`Blocked by: ${blockers.map(b => b.title).join(', ')}`}
                          style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--color-error)', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-sm, 4px)', padding: '1px 5px', verticalAlign: 'middle' }}
                        >
                          Blocked ×{blockers.length}
                        </span>
                      );
                    })()}
                    {isSnoozed(task) && (
                      <span
                        title={`Snoozed until ${new Date(task.snoozedUntil!).toLocaleDateString([], { month: 'short', day: 'numeric' })}`}
                        style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm, 4px)', padding: '1px 5px', verticalAlign: 'middle' }}
                      >
                        Snoozed
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {task.dueDate && (
                      <span style={{
                        ...styles.taskDue,
                        color: isOverdue(task) ? 'var(--color-error)' : styles.taskDue.color,
                        fontWeight: isOverdue(task) ? 600 : undefined,
                      }}>
                        {isOverdue(task) ? 'Overdue · ' : ''}{formatDueDate(task.dueDate, task.dueTime)}
                      </span>
                    )}
                    {(() => {
                      const pct = subtaskProgress(task);
                      if (pct === null) return null;
                      return (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={`${task.subtasks!.filter(s => s.completed).length} of ${task.subtasks!.length} subtasks done`}>
                          <span style={{ width: 48, height: 4, borderRadius: 2, background: 'var(--color-border-subtle)', overflow: 'hidden', display: 'inline-block' }}>
                            <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--color-success)' : 'var(--color-accent-fill)', transition: 'width 0.2s ease' }} />
                          </span>
                          <span style={{ fontSize: 11, color: pct === 100 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>{pct}%</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Quick Snooze: one click -> Tomorrow (right-click for more via context menu). */}
                {!task.completed && (
                  <button
                    className="dex-tasks-row-action"
                    style={{ ...styles.priorityBtn, opacity: isSnoozed(task) ? 1 : 0.55 }}
                    onClick={(e) => { e.stopPropagation(); if (isSnoozed(task)) unsnooze(task.id); else snoozeTomorrow(task.id); }}
                    aria-label={isSnoozed(task) ? `Unsnooze task: ${task.title}` : `Snooze task to tomorrow: ${task.title}`}
                    title={isSnoozed(task) ? 'Snoozed (click to clear)' : 'Snooze to tomorrow'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke={isSnoozed(task) ? 'var(--color-accent)' : 'var(--color-text-muted)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/>
                    </svg>
                  </button>
                )}

                {/* Star / flag toggle for the Flagged smart list. */}
                <button
                  className="dex-tasks-row-action"
                  style={{ ...styles.priorityBtn, opacity: task.flagged ? 1 : 0.45 }}
                  onClick={(e) => { e.stopPropagation(); toggleFlag(task.id); }}
                  aria-label={task.flagged ? `Unflag task: ${task.title}` : `Flag task: ${task.title}`}
                  title={task.flagged ? 'Flagged (click to remove)' : 'Flag this task'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24"
                    fill={task.flagged ? 'var(--color-warning)' : 'none'}
                    stroke={task.flagged ? 'var(--color-warning)' : 'var(--color-text-muted)'}
                    strokeWidth="1.5" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>

                <button
                  className="dex-tasks-row-action"
                  style={styles.priorityBtn}
                  onClick={(e) => { e.stopPropagation(); cyclePriority(task.id); }}
                  title={`Priority: ${getPriorityLabel(task.priority)} (click to cycle)`}
                  aria-label={`Cycle priority for "${task.title}" (currently ${getPriorityLabel(task.priority)})`}
                >
                  <Icons.flag color={getPriorityColor(task.priority)} />
                </button>

                <button
                  className="dex-tasks-row-action dex-tasks-delete"
                  style={styles.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                  aria-label={`Delete task: ${task.title}`}
                >
                  <DexIcon name="close" size={14} />
                </button>
              </div>

              {/* Expanded task detail panel */}
              {expandedTask === task.id && (
                <div style={{ padding: 'var(--space-2) var(--space-6) var(--space-4) 58px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
                  {/* Description */}
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Description</div>
                    <AssistedTextarea
                      value={task.description || ''}
                      onChange={(e) => setDescription(task.id, e.target.value)}
                      placeholder="Add a description..."
                      style={{ width: '100%', minHeight: 48, padding: 'var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>

                  {/* Priority + Due time */}
                  <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Priority</div>
                      <select
                        value={task.priority}
                        onChange={(e) => setPriority(task.id, e.target.value as Task['priority'])}
                        aria-label="Set task priority"
                        style={{
                          padding: '4px var(--space-2)', borderRadius: 4, fontSize: 12, fontFamily: 'inherit',
                          border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)',
                          color: getPriorityColor(task.priority), fontWeight: 600, cursor: 'pointer', outline: 'none',
                        }}
                      >
                        <option value="high">P1 - High</option>
                        <option value="medium">P2 - Medium</option>
                        <option value="low">P3 - Low</option>
                        <option value="none">P4 - None</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Due time</div>
                      <input
                        type="time"
                        value={task.dueTime || ''}
                        onChange={(e) => setDueTime(task.id, e.target.value)}
                        disabled={!task.dueDate}
                        aria-label="Set due time"
                        title={task.dueDate ? 'Time of day for the due date' : 'Set a due date first'}
                        style={{
                          padding: '4px var(--space-2)', borderRadius: 4, fontSize: 12, fontFamily: 'inherit',
                          border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)',
                          color: 'var(--color-text-primary)', cursor: task.dueDate ? 'pointer' : 'not-allowed',
                          outline: 'none', opacity: task.dueDate ? 1 : 0.5, colorScheme: 'dark',
                        }}
                      />
                    </div>
                  </div>

                  {/* Estimated vs actual time */}
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Time (estimate vs actual)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Estimate
                        <input
                          type="number"
                          min={0}
                          step={5}
                          value={task.estimateMinutes ?? ''}
                          onChange={(e) => setEstimate(task.id, e.target.value === '' ? null : parseInt(e.target.value, 10))}
                          placeholder="min"
                          aria-label="Estimated minutes"
                          style={{ width: 70, padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                        />
                      </label>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Actual: <strong style={{ color: 'var(--color-text-primary)' }}>{formatMinutes(task.actualMinutes || 0)}</strong>
                        {task.estimateMinutes ? (
                          <span style={{ marginLeft: 6, color: (task.actualMinutes || 0) > task.estimateMinutes ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}>
                            / {formatMinutes(task.estimateMinutes)}
                          </span>
                        ) : null}
                      </span>
                      {([15, 30, 60] as const).map(m => (
                        <button key={m} onClick={() => logActual(task.id, m)} aria-label={`Add ${m} minutes to actual time`} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-secondary)', fontFamily: 'inherit' }}>
                          +{m}m
                        </button>
                      ))}
                      {(task.actualMinutes || 0) > 0 && (
                        <button onClick={() => logActual(task.id, -(task.actualMinutes || 0))} aria-label="Reset actual time" style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-muted)', fontFamily: 'inherit' }}>
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Snooze */}
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Snooze</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => snoozeTomorrow(task.id)} aria-label="Snooze to tomorrow" style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-secondary)', fontFamily: 'inherit' }}>Tomorrow</button>
                      <button onClick={() => snoozeNextWeek(task.id)} aria-label="Snooze to next week" style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-secondary)', fontFamily: 'inherit' }}>Next week</button>
                      <input
                        type="date"
                        aria-label="Snooze until a specific date"
                        value={isSnoozed(task) ? new Date(task.snoozedUntil!).toISOString().slice(0, 10) : ''}
                        onChange={(e) => { if (e.target.value) snoozeTask(task.id, new Date(e.target.value + 'T00:00:00')); }}
                        style={{ padding: '4px var(--space-2)', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-primary)', outline: 'none', colorScheme: 'dark' }}
                      />
                      {isSnoozed(task) && (
                        <button onClick={() => unsnooze(task.id)} aria-label="Clear snooze" style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-muted)', fontFamily: 'inherit' }}>Clear</button>
                      )}
                    </div>
                  </div>

                  {/* Blocked by (dependency links) */}
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Blocked by</div>
                    {(task.blockedBy || []).length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                        {(task.blockedBy || []).map(bid => {
                          const b = tasksById.get(bid);
                          return (
                            <div key={bid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: b && b.completed ? 'var(--color-success)' : 'var(--color-error)' }} />
                              <span style={{ flex: 1, color: b ? (b.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)') : 'var(--color-text-muted)', textDecoration: b && b.completed ? 'line-through' : 'none' }}>
                                {b ? b.title : '(deleted task)'}
                              </span>
                              <button onClick={() => toggleBlocker(task.id, bid)} aria-label="Remove blocker" style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><DexIcon name="close" size={12} /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <select
                      value=""
                      aria-label="Add a blocking task"
                      onChange={(e) => { if (e.target.value) toggleBlocker(task.id, e.target.value); }}
                      style={{ padding: '4px var(--space-2)', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-secondary)', cursor: 'pointer', outline: 'none', maxWidth: 280 }}
                    >
                      <option value="">Add a blocker…</option>
                      {tasks
                        .filter(t => t.id !== task.id && !(task.blockedBy || []).includes(t.id))
                        .map(t => (
                          <option key={t.id} value={t.id}>{t.completed ? '✓ ' : ''}{t.title}</option>
                        ))}
                    </select>
                  </div>

                  {/* Recurring */}
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Repeat</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['none', 'daily', 'weekly', 'monthly'] as const).map(r => (
                        <button key={r} aria-label={`Set repeat to ${r}`} onClick={() => setRecurring(task.id, r)} style={{
                          padding: '4px 10px', borderRadius: 10, fontSize: 11, cursor: 'pointer',
                          border: '1px solid var(--color-border-subtle)',
                          background: (task.recurring || 'none') === r ? 'var(--color-accent-light)' : 'var(--color-bg-inset)',
                          color: (task.recurring || 'none') === r ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                          fontWeight: (task.recurring || 'none') === r ? 600 : 400,
                        }}>{r === 'none' ? 'None' : r.charAt(0).toUpperCase() + r.slice(1)}</button>
                      ))}
                    </div>
                  </div>

                  {/* Subtasks */}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Subtasks</div>
                    {(task.subtasks || []).map(sub => (
                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
                        <button
                          aria-label={sub.completed ? `Mark subtask "${sub.title}" incomplete` : `Complete subtask "${sub.title}"`}
                          onClick={() => toggleSubtask(task.id, sub.id)}
                          style={{
                            width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                            border: sub.completed ? '2px solid var(--color-success, #30d158)' : '2px solid var(--color-border)',
                            background: sub.completed ? 'var(--color-success)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {sub.completed && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                        </button>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-primary)', textDecoration: sub.completed ? 'line-through' : 'none', opacity: sub.completed ? 0.5 : 1 }}>{sub.title}</span>
                        <button onClick={() => deleteSubtask(task.id, sub.id)} aria-label={`Delete subtask ${sub.title}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><DexIcon name="close" size={14} /></button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <input
                        value={subtaskInput}
                        onChange={e => setSubtaskInput(e.target.value)}
                        placeholder="Add subtask..."
                        onKeyDown={e => { if (e.key === 'Enter') addSubtask(task.id); }}
                        style={{ flex: 1, padding: '4px var(--space-2)', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'inherit' }}
                      />
                      <button onClick={() => addSubtask(task.id)} aria-label="Add subtask" style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>+</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {remainingTasks > 0 && (
            <button
              onClick={() => setTaskVisibleCount(v => v + TASKS_PER_PAGE)}
              style={{ display: 'block', width: '100%', margin: '6px 0 10px', padding: 'var(--space-2) 10px', fontSize: 12, color: 'var(--color-text-muted)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 10, cursor: 'pointer' }}
            >
              Load {Math.min(TASKS_PER_PAGE, remainingTasks)} more ({remainingTasks} remaining)
            </button>
          )}

          {sortedTasks.length === 0 && (() => {
            // List-aware empty states. A search/filter that hides everything gets its
            // own copy so the user knows it's a filter, not an empty list.
            const isFiltered = !!searchQuery.trim() || statusFilter !== 'all' || priorityFilter !== 'all' || chipPriority || chipList || chipHasDue;
            const accent = isFiltered
              ? 'var(--color-accent, #0a84ff)'
              : selectedList === 'overdue'
                ? 'var(--color-error, #ff453a)'
                : selectedList === 'flagged'
                  ? 'var(--color-warning, #ff9f0a)'
                  : 'var(--color-success, #30d158)';
            const headline = isFiltered
              ? 'No matches'
              : selectedList === 'today'
                ? 'All clear for today'
                : selectedList === 'overdue'
                  ? 'Nothing overdue'
                  : selectedList === 'upcoming'
                    ? 'Nothing scheduled ahead'
                    : selectedList === 'flagged'
                      ? 'No flagged tasks'
                      : selectedList === 'completed'
                        ? 'Nothing completed yet'
                        : 'No tasks here';
            const body = isFiltered
              ? 'No tasks match the current search or filters. Try clearing them.'
              : selectedList === 'today'
                ? 'Tasks due today will show up here. Add one above to get going.'
                : selectedList === 'overdue'
                  ? "You're caught up — no tasks have slipped past their due date."
                  : selectedList === 'upcoming'
                    ? 'Tasks with a future due date will appear here.'
                    : selectedList === 'flagged'
                      ? 'Flag a task with the star to surface it here.'
                      : selectedList === 'completed'
                        ? 'Completed tasks collect here as you check them off.'
                        : 'Type a task above and press Enter to create one.';
            return (
            <div style={styles.empty}>
              <div style={{ width: 72, height: 72, borderRadius: 18, background: 'color-mix(in srgb, ' + accent + ' 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </div>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary, #fff)', letterSpacing: '-0.01em' }}>
                {headline}
              </span>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted, #8a8a8a)', marginTop: 6, maxWidth: 280, textAlign: 'center', lineHeight: 1.5 }}>
                {body}
              </span>
              <button
                onClick={() => {
                  if (isFiltered) {
                    setSearchQuery(''); setStatusFilter('all'); setPriorityFilter('all');
                    setChipPriority(null); setChipList(null); setChipHasDue(false);
                  } else {
                    newTaskInputRef.current?.focus();
                  }
                }}
                style={{
                  marginTop: 'var(--space-4)', padding: 'var(--space-2) var(--space-5)', borderRadius: 'var(--radius-lg, 10px)',
                  background: 'var(--color-accent-fill)', color: 'var(--color-accent-text, #fff)',
                  border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isFiltered ? 'Clear filters' : 'New Task'}
              </button>
            </div>
            );
          })()}
          </>
          )}
        </div>
      </div>
      {menuState && <ContextMenu items={menuState.items} position={menuState.position} onClose={closeCtx} />}
    </div>
  );
};

// ===========================================================================
// STYLES
// ===========================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    overflow: 'hidden',
    background: 'var(--color-bg-elevated, #1C1C20)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '13px',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  
  // Sidebar
  sidebar: {
    width: '220px',
    ...glassSidebar,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  sidebarHeader: {
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  sidebarTitle: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  lists: {
    padding: 'var(--space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflowY: 'auto',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    padding: '4px var(--space-3) 2px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    textAlign: 'left',
  },
  listIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCount: {
    fontSize: '13px',
    fontWeight: 600,
  },
  
  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-5)',
    borderRadius: 0,
    borderBottom: '1px solid var(--color-border)',
  },
  headerTitle: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  titleText: {
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
  taskCount: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  toggleCompleted: {
    padding: '5px 10px',
    borderRadius: '10px',
    border: 'none',
    background: 'var(--color-border-subtle)',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer',
  },
  
  previewChip: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid var(--color-accent)',
    color: 'var(--color-accent)',
    background: 'transparent',
    lineHeight: 1.4,
  },
  bulkBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-6)',
    background: 'var(--color-accent-light, rgba(10,132,255,0.08))',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  bulkBtn: {
    padding: '4px 12px',
    borderRadius: 'var(--radius-lg, 10px)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-secondary)',
    fontFamily: 'inherit',
  },

  // Add Task
  addTask: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-6)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  addInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    border: 'none',
    background: 'var(--color-accent-fill)',
    color: 'var(--color-accent-text)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  
  // Tasks
  taskList: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-2) 0',
  },
  taskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-6)',
    transition: 'background 0.1s',
  },
  checkbox: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    border: '2px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    color: 'var(--color-text-primary)',
  },
  taskContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  taskTitle: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  taskDue: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  priorityBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    opacity: 0.7,
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px',
    color: 'var(--color-text-muted)',
  },
};

Tasks.displayName = 'Tasks';
export default memo(Tasks);
