/**
 * DEX Habit Tracker
 * Daily habit tracking with streaks, goals, and visual progress
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useMemo, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface Habit {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  frequency: 'daily' | 'weekdays' | 'weekends' | 'custom';
  customDays?: number[]; // 0=Sun, 6=Sat
  targetPerDay: number;
  createdAt: number;
  archived: boolean;
}

export interface HabitCompletion {
  habitId: string;
  date: string; // YYYY-MM-DD
  count: number;
}

export interface HabitTrackerState {
  habits: Habit[];
  completions: HabitCompletion[];
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-habits';

function loadState(): HabitTrackerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { habits: [], completions: [] };
}

function saveState(state: HabitTrackerState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ============================================================================
// DATE UTILS
// ============================================================================

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function getDatesInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function getStreak(habitId: string, completions: HabitCompletion[], target: number): number {
  let streak = 0;
  const d = new Date();
  // Check if today is done
  const todayStr = today();
  const todayComp = completions.find(c => c.habitId === habitId && c.date === todayStr);
  if (!todayComp || todayComp.count < target) {
    d.setDate(d.getDate() - 1); // Start from yesterday
  }
  while (true) {
    const dateStr = d.toISOString().split('T')[0];
    const comp = completions.find(c => c.habitId === habitId && c.date === dateStr);
    if (comp && comp.count >= target) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ============================================================================
// PRESET HABITS
// ============================================================================

const PRESET_HABITS: Partial<Habit>[] = [
  { name: 'Drink Water', icon: 'W', color: '#3b82f6', targetPerDay: 8, description: '8 glasses per day' },
  { name: 'Exercise', icon: 'E', color: '#10b981', targetPerDay: 1, description: 'Daily workout' },
  { name: 'Read', icon: 'R', color: '#8b5cf6', targetPerDay: 1, description: 'Read for 30 minutes' },
  { name: 'Meditate', icon: 'M', color: '#f59e0b', targetPerDay: 1, description: '10 minutes of mindfulness' },
  { name: 'Journal', icon: 'J', color: '#ec4899', targetPerDay: 1, description: 'Write daily reflections' },
  { name: 'Code', icon: 'C', color: '#06b6d4', targetPerDay: 1, description: 'Practice coding daily' },
  { name: 'Walk', icon: 'WK', color: '#22c55e', targetPerDay: 1, description: 'Take a walk outside' },
  { name: 'No Junk Food', icon: 'NJ', color: '#ef4444', targetPerDay: 1, description: 'Avoid unhealthy food' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const HabitTracker: React.FC<{ onClose?: () => void }> = memo(({ onClose }) => {
  const [state, setState] = useState<HabitTrackerState>(loadState);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [newTarget, setNewTarget] = useState(1);
  const [viewRange, setViewRange] = useState(7); // days

  const persist = useCallback((s: HabitTrackerState) => { setState(s); saveState(s); }, []);

  const activeHabits = useMemo(() => state.habits.filter(h => !h.archived), [state.habits]);

  const todayStr = today();

  const getCompletion = useCallback((habitId: string, date: string) => {
    return state.completions.find(c => c.habitId === habitId && c.date === date);
  }, [state.completions]);

  const toggleCompletion = useCallback((habitId: string, date: string) => {
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;
    const existing = state.completions.find(c => c.habitId === habitId && c.date === date);
    let completions: HabitCompletion[];
    if (existing) {
      if (existing.count >= habit.targetPerDay) {
        // Reset
        completions = state.completions.filter(c => !(c.habitId === habitId && c.date === date));
      } else {
        completions = state.completions.map(c =>
          c.habitId === habitId && c.date === date ? { ...c, count: c.count + 1 } : c
        );
      }
    } else {
      completions = [...state.completions, { habitId, date, count: 1 }];
    }
    persist({ ...state, completions });
  }, [state, persist]);

  const createHabit = useCallback(() => {
    if (!newName.trim()) return;
    const habit: Habit = {
      id: `habit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim(),
      description: newDesc.trim(),
      icon: newName.charAt(0).toUpperCase(),
      color: newColor,
      frequency: 'daily',
      targetPerDay: newTarget,
      createdAt: Date.now(),
      archived: false,
    };
    persist({ ...state, habits: [...state.habits, habit] });
    setNewName('');
    setNewDesc('');
    setNewTarget(1);
    setShowCreate(false);
  }, [newName, newDesc, newColor, newTarget, state, persist]);

  const deleteHabit = useCallback((id: string) => {
    persist({
      ...state,
      habits: state.habits.filter(h => h.id !== id),
      completions: state.completions.filter(c => c.habitId !== id),
    });
  }, [state, persist]);

  const archiveHabit = useCallback((id: string) => {
    persist({
      ...state,
      habits: state.habits.map(h => h.id === id ? { ...h, archived: true } : h),
    });
  }, [state, persist]);

  // Date columns for the grid
  const dateColumns = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - viewRange + 1);
    return getDatesInRange(start, end);
  }, [viewRange]);

  // Overall completion rate
  const completionRate = useMemo(() => {
    if (activeHabits.length === 0) return 0;
    const todayCompletions = activeHabits.filter(h => {
      const comp = getCompletion(h.id, todayStr);
      return comp && comp.count >= h.targetPerDay;
    }).length;
    return Math.round((todayCompletions / activeHabits.length) * 100);
  }, [activeHabits, todayStr, getCompletion]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Habit Tracker</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>Build better habits, one day at a time</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={viewRange} onChange={e => setViewRange(parseInt(e.target.value))} style={styles.selectSmall} aria-label="View range">
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button onClick={() => setShowCreate(!showCreate)} style={styles.addBtn}>
            {showCreate ? 'Cancel' : '+ New Habit'}
          </button>
        </div>
      </div>

      {/* Today's progress */}
      <div style={styles.progressBar}>
        <div style={styles.progressLabel}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Today: {completionRate}%</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {activeHabits.filter(h => {
              const c = getCompletion(h.id, todayStr);
              return c && c.count >= h.targetPerDay;
            }).length}/{activeHabits.length} completed
          </span>
        </div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${completionRate}%` }} />
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={styles.createForm}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>New Habit</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESET_HABITS.map(p => (
              <button key={p.name} onClick={() => { setNewName(p.name!); setNewDesc(p.description!); setNewColor(p.color!); setNewTarget(p.targetPerDay!); }}
                style={styles.presetBtn}>{p.icon} {p.name}</button>
            ))}
          </div>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Habit name" style={styles.input} aria-label="Habit name" />
          <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)" style={styles.input} aria-label="Description" />
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
              style={{ width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer' }} aria-label="Color" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <label style={{ fontSize: 12 }}>Target/day:</label>
              <input type="number" value={newTarget} min={1} max={100}
                onChange={e => setNewTarget(parseInt(e.target.value) || 1)}
                style={styles.numInput} aria-label="Target per day" />
            </div>
            <button onClick={createHabit} style={styles.saveBtn}>Create</button>
          </div>
        </div>
      )}

      {/* Habit grid */}
      {activeHabits.length === 0 ? (
        <div style={styles.emptyState}>
          No habits yet. Create one to start tracking your daily progress.
        </div>
      ) : (
        <div style={styles.grid}>
          {/* Header row with dates */}
          <div style={styles.gridRow}>
            <div style={styles.habitNameCol}></div>
            {dateColumns.map(date => {
              const d = new Date(date + 'T12:00:00');
              const isToday = date === todayStr;
              return (
                <div key={date} style={{ ...styles.dateCol, ...(isToday ? { color: '#3b82f6', fontWeight: 800 } : {}) }}>
                  <div>{d.toLocaleDateString([], { weekday: 'narrow' })}</div>
                  <div>{d.getDate()}</div>
                </div>
              );
            })}
            <div style={styles.streakCol}>Streak</div>
          </div>

          {/* Habit rows */}
          {activeHabits.map(habit => {
            const streak = getStreak(habit.id, state.completions, habit.targetPerDay);
            return (
              <div key={habit.id} style={styles.gridRow}>
                <div style={styles.habitNameCol} title={habit.description}>
                  <div style={{ ...styles.habitIcon, background: habit.color }}>{habit.icon}</div>
                  <div style={styles.habitName}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{habit.name}</span>
                    {habit.targetPerDay > 1 && (
                      <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>x{habit.targetPerDay}/day</span>
                    )}
                  </div>
                </div>
                {dateColumns.map(date => {
                  const comp = getCompletion(habit.id, date);
                  const count = comp?.count || 0;
                  const done = count >= habit.targetPerDay;
                  const partial = count > 0 && !done;
                  return (
                    <button key={date} onClick={() => toggleCompletion(habit.id, date)}
                      style={{
                        ...styles.dayCell,
                        background: done ? habit.color : partial ? `${habit.color}33` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${done ? habit.color : 'rgba(255,255,255,0.06)'}`,
                      }}
                      aria-label={`${habit.name} ${date}: ${done ? 'completed' : partial ? `${count}/${habit.targetPerDay}` : 'not done'}`}
                      title={count > 0 ? `${count}/${habit.targetPerDay}` : 'Click to mark done'}
                    >
                      {done ? '\u2713' : partial ? count : ''}
                    </button>
                  );
                })}
                <div style={styles.streakCol}>
                  <span style={{ color: streak > 0 ? '#f59e0b' : 'var(--color-text-muted)', fontWeight: 700 }}>
                    {streak > 0 ? `${streak}d` : '-'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

HabitTracker.displayName = 'HabitTracker';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto', gap: 14 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  addBtn: { padding: '6px 12px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  selectSmall: { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 11, outline: 'none' },
  progressBar: { display: 'flex', flexDirection: 'column', gap: 4 },
  progressLabel: { display: 'flex', justifyContent: 'space-between' },
  progressTrack: { height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, background: '#10b981', transition: 'width 0.3s ease' },
  createForm: { padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  presetBtn: { padding: '3px 8px', borderRadius: 4, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 600, cursor: 'pointer' },
  input: { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, fontFamily: 'inherit', outline: 'none' },
  numInput: { width: 50, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, textAlign: 'center', outline: 'none' },
  saveBtn: { flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: 30, fontSize: 13, color: 'var(--color-text-muted)' },
  grid: { display: 'flex', flexDirection: 'column', gap: 2 },
  gridRow: { display: 'flex', alignItems: 'center', gap: 2 },
  habitNameCol: { width: 140, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '4px 0' },
  habitIcon: { width: 22, height: 22, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 800, flexShrink: 0 },
  habitName: { display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  dateCol: { width: 32, textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--color-text-muted)', padding: '4px 0' },
  dayCell: { width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0, border: 'none', transition: 'all 0.15s' },
  streakCol: { width: 40, textAlign: 'center', fontSize: 11 },
};

export default HabitTracker;
