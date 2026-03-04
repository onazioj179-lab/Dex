/**
 * TASKS - macOS Reminders Style Task Manager
 * Clean task management with lists and priorities
 * Connected to real file system via IPC
 */

import React, { useState, useEffect, useMemo, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate: Date | null;
  list: string;
  notes: string;
}

interface TaskList {
  id: string;
  name: string;
  color: string;
  icon: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA PERSISTENCE - Real File System
// ═══════════════════════════════════════════════════════════════════════════

const LISTS: TaskList[] = [
  { id: 'today', name: 'Today', color: '#0a84ff', icon: 'today' },
  { id: 'scheduled', name: 'Scheduled', color: '#ff453a', icon: 'calendar' },
  { id: 'all', name: 'All', color: '#8e8e93', icon: 'list' },
  { id: 'personal', name: 'Personal', color: '#30d158', icon: 'user' },
  { id: 'work', name: 'Work', color: '#ff9f0a', icon: 'briefcase' },
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

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const Tasks: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('tasks');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedList, setSelectedList] = useState('today');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Load tasks from backend on mount
  useEffect(() => {
    const loadTasks = async () => {
      setIsLoading(true);
      const loadedTasks = await loadTasksFromBackend();
      setTasks(loadedTasks);
      setIsLoading(false);
    };
    loadTasks();
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
  }), [tasks, showCompleted, selectedList]);

  const sortedTasks = useMemo(() => [...filteredTasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  }), [filteredTasks]);

  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    if (task && !task.completed) {
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'tasksCompleted', amount: 1 } }));
    }
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle,
      completed: false,
      priority: 'medium',
      dueDate: newTaskDue ? new Date(newTaskDue) : (selectedList === 'today' || selectedList === 'scheduled' ? new Date() : null),
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

  const cyclePriority = (id: string) => {
    setTasks(tasks.map(t => {
      if (t.id !== id) return t;
      const order: Task['priority'][] = ['low', 'medium', 'high'];
      const idx = order.indexOf(t.priority);
      return { ...t, priority: order[(idx + 1) % 3] };
    }));
  };

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
      case 'high': return '#ff453a';
      case 'medium': return '#ff9f0a';
      case 'low': return '#8e8e93';
    }
  };

  const formatDueDate = (date: Date | null): string => {
    if (!date) return '';
    const today = new Date();
    const taskDate = new Date(date);
    if (taskDate.toDateString() === today.toDateString()) return 'Today';
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (taskDate.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return taskDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div style={styles.container}>
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
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}
                onClick={() => setSelectedList(list.id)}
              >
                <div style={styles.listIcon}>
                  <Icon color={list.color} />
                </div>
                <span style={{ flex: 1, color: isActive ? '#fff' : 'rgba(255,255,255,0.85)' }}>
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
        </div>

        {/* Add Task */}
        <div style={styles.addTask}>
          <div style={styles.checkbox} />
          <input
            type="text"
            placeholder="Add a task..."
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
              padding: '4px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--color-text-secondary)', fontSize: 12,
              outline: 'none', fontFamily: 'inherit',
              colorScheme: 'dark',
            }}
          />
          <button style={styles.addBtn} onClick={addTask} aria-label="Add task">
            <Icons.plus />
          </button>
        </div>

        {/* Task List */}
        <div style={styles.taskList}>
          {sortedTasks.map(task => (
            <div
              key={task.id}
              style={{
                ...styles.taskItem,
                opacity: task.completed ? 0.5 : 1,
              }}
            >
              <button
                aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
                style={{
                  ...styles.checkbox,
                  background: task.completed ? '#30d158' : 'transparent',
                  borderColor: task.completed ? '#30d158' : 'rgba(255,255,255,0.3)',
                }}
                onClick={() => toggleTask(task.id)}
              >
                {task.completed && <Icons.check />}
              </button>
              
              <div style={styles.taskContent}>
                <span style={{
                  ...styles.taskTitle,
                  textDecoration: task.completed ? 'line-through' : 'none',
                }}>
                  {task.title}
                </span>
                {task.dueDate && (
                  <span style={styles.taskDue}>{formatDueDate(task.dueDate)}</span>
                )}
              </div>
              
              <button
                style={styles.priorityBtn}
                onClick={() => cyclePriority(task.id)}
                title={`Priority: ${task.priority}`}
              >
                <Icons.flag color={getPriorityColor(task.priority)} />
              </button>
              
              <button
                style={styles.deleteBtn}
                onClick={() => deleteTask(task.id)}
                aria-label={`Delete task: ${task.title}`}
              >
                ×
              </button>
            </div>
          ))}
          
          {sortedTasks.length === 0 && (
            <div style={styles.empty}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span style={{ marginTop: '16px' }}>No tasks here</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '13px',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  
  // Sidebar
  sidebar: {
    width: '240px',
    background: 'var(--color-bg-secondary)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  sidebarTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  lists: {
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    textAlign: 'left',
  },
  listIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCount: {
    fontSize: '14px',
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
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  headerTitle: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  titleText: {
    fontSize: '28px',
    fontWeight: 700,
  },
  taskCount: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
  toggleCompleted: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  
  // Add Task
  addTask: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 24px',
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
    borderRadius: '8px',
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
    padding: '8px 0',
  },
  taskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 24px',
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
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    opacity: 0.7,
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
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
