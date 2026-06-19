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
import { useAppTracking } from '../services/usePatternLearning';
import { useToastHelpers } from '../components/Toast';
import { glassSidebar } from '../styles/glassMenu';
import DexIcon from '../components/DexIcon';
import ContextMenu, { useContextMenu, ContextMenuItem } from '../components/ContextMenu';
import { registerUkiAppContext, unregisterUkiAppContext } from '../uki/appContextRegistry';
import { DexSearchInput } from '../styles/components';

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

const LISTS: TaskList[] = [
  { id: 'today', name: 'Today', color: 'var(--color-accent)', icon: 'today' },
  { id: 'scheduled', name: 'Scheduled', color: 'var(--color-error)', icon: 'calendar' },
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
    if (window.electron?.invoke) {
      // Try to get from data store
      const stored = await window.electron.invoke('capability:storage:get', 'dex-tasks');
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
    if (window.electron?.invoke) {
      await window.electron.invoke('capability:storage:set', 'dex-tasks', tasks);
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
    return () => unregisterUkiAppContext('tasks');
  }, []);
  const dragIdRef = React.useRef<string | null>(null);
  const newTaskInputRef = React.useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: Ctrl+N to focus new task input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (!showCompleted && task.completed) return false;
    // Status filter (all / active / done)
    if (statusFilter === 'active' && task.completed) return false;
    if (statusFilter === 'done' && !task.completed) return false;
    // Priority filter
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!task.title.toLowerCase().includes(q) && !(task.description || '').toLowerCase().includes(q)) return false;
    }
    switch (selectedList) {
      case 'today':
        return task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString();
      case 'scheduled':
        return task.dueDate !== null;
      case 'all':
        return true;
      default:
        return task.list === selectedList;
    }
  }), [tasks, showCompleted, selectedList, searchQuery, statusFilter, priorityFilter]);

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
  const handleTaskScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!tasksWindowed) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 220) {
      setTaskVisibleCount(v => (v < sortedTasks.length ? v + TASKS_PER_PAGE : v));
    }
  }, [tasksWindowed, sortedTasks.length]);

  const clearCompleted = () => setTasks(prev => prev.filter(t => !t.completed));

  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    if (task && !task.completed) {
      // Trigger the brief completion animation, then clear the flag so it can replay.
      setRecentlyCompleted(id);
      window.setTimeout(() => setRecentlyCompleted(prev => (prev === id ? null : prev)), 400);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'tasksCompleted', amount: 1 } }));
    }
  };

  const addTask = async () => {
    const raw = newTaskTitle.trim();
    if (!raw) return;

    // Natural-language parse via the native nl-task engine: e.g. "Submit report
    // tomorrow high priority" -> clean title + due date + priority. Pure + safe;
    // falls back to the raw title off-platform or when nothing is detected.
    let title = raw;
    let parsedDue: Date | null = null;
    let parsedPriority: Task['priority'] | null = null;
    try {
      const parsed = await dexInvoke<{ title?: string; dueDate?: string | null; priority?: string }>('nl-task:parse', raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.title && parsed.title.trim()) title = parsed.title.trim();
        if (parsed.dueDate) {
          const d = new Date(parsed.dueDate);
          if (!isNaN(d.getTime())) parsedDue = d;
        }
        if (parsed.priority === 'high' || parsed.priority === 'low') parsedPriority = parsed.priority;
        else if (parsed.priority === 'normal') parsedPriority = 'medium';
      }
    } catch {
      /* fall back to the raw title */
    }

    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      priority: parsedPriority ?? 'medium',
      dueDate: newTaskDue
        ? new Date(newTaskDue)
        : (parsedDue ?? (selectedList === 'today' || selectedList === 'scheduled' ? new Date() : null)),
      list: ['personal', 'work'].includes(selectedList) ? selectedList : 'personal',
      notes: '',
    };
    setTasks([newTask, ...tasks]);
    setNewTaskTitle('');
    setNewTaskDue('');
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'tasksCreated', amount: 1 } }));
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

  const buildTaskCtxItems = useCallback((task: Task): ContextMenuItem[] => [
    { id: 'toggle', label: task.completed ? 'Mark Incomplete' : 'Mark Complete', onClick: () => toggleTask(task.id) },
    { id: 'priority', label: `Priority: ${getPriorityLabel(task.priority)}`, shortcut: 'P', onClick: () => cyclePriority(task.id) },
    { id: 'div1', label: '', divider: true },
    { id: 'expand', label: 'Edit Details', onClick: () => setExpandedTask(task.id) },
    { id: 'div2', label: '', divider: true },
    { id: 'delete', label: 'Delete Task', danger: true, shortcut: 'Del', onClick: () => deleteTask(task.id) },
  ], [toggleTask, cyclePriority, deleteTask]);

  const applyTemplate = useCallback((templateIdx: number) => {
    const template = TASK_TEMPLATES[templateIdx];
    if (!template) return;
    const newTasks = template.tasks.map(t => ({
      ...t,
      id: crypto.randomUUID(),
      dueDate: selectedList === 'today' ? new Date() : null,
    }));
    setTasks(prev => [...newTasks, ...prev]);
    toast.success(`Applied "${template.name}" template (${newTasks.length} tasks)`);
  }, [selectedList, toast]);

  const getListCount = (listId: string): number => {
    return tasks.filter(t => {
      if (t.completed) return false;
      switch (listId) {
        case 'today':
          return t.dueDate && new Date(t.dueDate).toDateString() === new Date().toDateString();
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
  const getDueDateTime = (task: Task): Date | null => {
    if (!task.dueDate) return null;
    const d = new Date(task.dueDate);
    if (task.dueTime) {
      const [h, m] = task.dueTime.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) d.setHours(h, m, 0, 0);
    }
    return d;
  };

  const isOverdue = (task: Task): boolean => {
    if (task.completed) return false;
    const due = getDueDateTime(task);
    return due !== null && due.getTime() < Date.now();
  };

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
    <div style={styles.container}>
      <style>{`
        button { font-family: inherit; transition: all 0.12s ease; }
        button:active { transform: scale(0.97); }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
        input:focus { outline: none; }
        @keyframes dexTaskComplete {
          0% { transform: scale(1); }
          40% { transform: scale(1.015); background: var(--color-success-muted, rgba(48,209,88,0.1)); }
          100% { transform: scale(1); }
        }
        .dex-task-complete { animation: dexTaskComplete 0.4s ease; }
      `}</style>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Reminders</span>
        </div>
        
        <div style={styles.lists}>
          {LISTS.map(list => {
            const Icon = Icons[list.icon];
            const count = getListCount(list.id);
            const isActive = selectedList === list.id;
            
            return (
              <button
                key={list.id}
                aria-label={`Select ${list.name} list`}
                style={{
                  ...styles.listItem,
                  background: isActive ? 'var(--color-border-subtle)' : 'transparent',
                }}
                onClick={() => setSelectedList(list.id)}
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
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <span style={{...styles.titleText, color: selectedListData.color}}>
              {selectedListData.name}
            </span>
            <span style={styles.taskCount}>
              {sortedTasks.filter(t => !t.completed).length} tasks
            </span>
          </div>
          <button
            style={styles.toggleCompleted}
            onClick={() => setShowCompleted(!showCompleted)}
            aria-label={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
          >
            {showCompleted ? 'Hide' : 'Show'} Completed
          </button>
          <button
            style={{...styles.toggleCompleted, color: showCalendarView ? 'var(--color-accent, #0a84ff)' : undefined}}
            onClick={() => setShowCalendarView(!showCalendarView)}
            aria-label={showCalendarView ? 'Hide calendar view' : 'Show calendar view'}
          >
            {showCalendarView ? 'List' : 'Calendar'}
          </button>
          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'priority' | 'date' | 'name' | 'manual')}
            aria-label="Sort tasks by"
            style={{
              padding: '4px var(--space-2)', borderRadius: 4, fontSize: 11, fontWeight: 500,
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
                padding: '3px 10px', borderRadius: 'var(--radius-sm, 4px)', fontSize: 11, cursor: 'pointer',
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
                  padding: '3px 10px', borderRadius: 'var(--radius-sm, 4px)', fontSize: 11, cursor: 'pointer',
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
                  return (
                    <div
                      key={day}
                      onClick={() => { if (dayTasks.length > 0) { setSelectedList('scheduled'); setShowCalendarView(false); } }}
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
                            <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: t.completed ? 'var(--color-success)' : t.priority === 'high' ? 'var(--color-error)' : 'var(--color-accent)' }} />
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
        <div style={styles.addTask}>
          <div style={styles.checkbox} />
          <input
            type="text"
            placeholder="Add a task"
            ref={newTaskInputRef}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTask()}
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
          <button style={styles.addBtn} onClick={addTask} aria-label="Add task">
            <Icons.plus />
          </button>
        </div>

        {/* Task Templates */}
        <div style={{ display: 'flex', gap: 4, padding: '0 var(--space-5) 6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: '24px', marginRight: 4 }}>Templates:</span>
          {TASK_TEMPLATES.map((t, i) => (
            <button
              key={t.name}
              onClick={() => applyTemplate(i)}
              className="dex-hover-bg"
              style={{
                padding: '3px var(--space-2)', borderRadius: 4,
                background: 'var(--color-border-subtle)',
                border: '1px solid var(--color-bg-hover)',
                color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="dex-scroll-fade-y" style={styles.taskList} onScroll={handleTaskScroll}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4) 0' }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 48, borderRadius: 8, background: 'var(--color-border-subtle)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : (
          <>
          {visibleTasks.map(task => (
            <div key={task.id}>
              <div
                className={recentlyCompleted === task.id ? 'dex-task-complete' : undefined}
                draggable={sortBy === 'manual'}
                onDragStart={() => { dragIdRef.current = task.id; }}
                onDragOver={e => { if (sortBy !== 'manual') return; e.preventDefault(); setDragOverId(task.id); }}
                onDrop={e => { e.preventDefault(); if (dragIdRef.current && dragIdRef.current !== task.id) reorderTasks(dragIdRef.current, task.id); setDragOverId(null); dragIdRef.current = null; }}
                onDragEnd={() => { setDragOverId(null); dragIdRef.current = null; }}
                style={{
                  ...styles.taskItem,
                  opacity: task.completed ? 0.5 : 1,
                  cursor: sortBy === 'manual' ? 'grab' : 'pointer',
                  outline: dragOverId === task.id ? '2px solid var(--color-accent)' : 'none',
                  outlineOffset: '-2px',
                }}
                onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                onContextMenu={e => showCtx(e, buildTaskCtxItems(task))}
              >
                {sortBy === 'manual' && (
                  <span style={{ flexShrink: 0, color: 'var(--color-text-muted)', opacity: 0.5, lineHeight: 0 }}>
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                      <circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/>
                      <circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/>
                      <circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/>
                    </svg>
                  </span>
                )}
                <button
                  aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
                  style={{
                    ...styles.checkbox,
                    background: task.completed ? 'var(--color-success)' : 'transparent',
                    borderColor: task.completed ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  }}
                  onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                >
                  {task.completed && <Icons.check />}
                </button>
                
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
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-accent)', fontWeight: 500 }}>{task.recurring}</span>
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
                    {(task.subtasks?.length ?? 0) > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {task.subtasks!.filter(s => s.completed).length}/{task.subtasks!.length} subtasks
                      </span>
                    )}
                  </div>
                </div>

                <button
                  style={styles.priorityBtn}
                  onClick={(e) => { e.stopPropagation(); cyclePriority(task.id); }}
                  title={`Priority: ${getPriorityLabel(task.priority)} (click to cycle)`}
                >
                  <Icons.flag color={getPriorityColor(task.priority)} />
                </button>
                
                <button
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
                    <textarea
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

                  {/* Recurring */}
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 600 }}>Repeat</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['none', 'daily', 'weekly', 'monthly'] as const).map(r => (
                        <button key={r} aria-label={`Set repeat to ${r}`} onClick={() => setRecurring(task.id, r)} style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
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
                        <button onClick={() => deleteSubtask(task.id, sub.id)} aria-label={`Delete subtask ${sub.title}`} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 14, cursor: 'pointer' }}><DexIcon name="close" size={14} /></button>
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
              style={{ display: 'block', width: '100%', margin: '6px 0 10px', padding: 'var(--space-2) 10px', fontSize: 12, color: 'var(--color-text-muted)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer' }}
            >
              Load {Math.min(TASKS_PER_PAGE, remainingTasks)} more ({remainingTasks} remaining)
            </button>
          )}

          {sortedTasks.length === 0 && (
            <div style={styles.empty}>
              <div style={{ width: 72, height: 72, borderRadius: 14, background: 'var(--color-success-muted, rgba(48,209,88,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #30d158)" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </div>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>
                {selectedList === 'today' ? 'All clear for today' : 'No tasks here'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted, #8a8a8a)', marginTop: 4, maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
                {selectedList === 'today' ? 'Tasks due today will show up here. Add one above!' : 'Type a task above and press Enter to create one.'}
              </span>
              <button
                onClick={() => newTaskInputRef.current?.focus()}
                style={{
                  marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-5)', borderRadius: 6,
                  background: 'var(--color-accent, #0a84ff)', color: '#fff',
                  border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                New Task
              </button>
            </div>
          )}
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
    borderRadius: '4px',
    border: 'none',
    background: 'var(--color-border-subtle)',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    cursor: 'pointer',
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
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-accent)',
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
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  taskTitle: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
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
    fontSize: '18px',
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
