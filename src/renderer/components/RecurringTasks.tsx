/**
 * DEX Recurring Tasks
 * Task repetition patterns with auto-regeneration
 */

import React, { useState, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface RecurrencePattern {
  frequency: RecurrenceFrequency;
  interval: number; // Every X days/weeks/months/years
  daysOfWeek?: DayOfWeek[]; // For weekly
  dayOfMonth?: number; // For monthly
  monthOfYear?: number; // For yearly (1-12)
  endDate?: number; // Optional end date timestamp
  endAfterOccurrences?: number; // Or end after N occurrences
}

export interface RecurringTask {
  id: string;
  title: string;
  recurrence: RecurrencePattern;
  nextDueDate: number;
  lastCompletedDate?: number;
  completedOccurrences: number;
  createdAt: number;
  isActive: boolean;
}

interface RecurrencePickerProps {
  value: RecurrencePattern | null;
  onChange: (pattern: RecurrencePattern | null) => void;
  onClose?: () => void;
}

// ==================== ICONS ====================

const Icons = {
  repeat: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  calendar: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ==================== CONSTANTS ====================

const FREQUENCY_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

const DAYS_OF_WEEK: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 'sun', label: 'Sunday', short: 'S' },
  { value: 'mon', label: 'Monday', short: 'M' },
  { value: 'tue', label: 'Tuesday', short: 'T' },
  { value: 'wed', label: 'Wednesday', short: 'W' },
  { value: 'thu', label: 'Thursday', short: 'T' },
  { value: 'fri', label: 'Friday', short: 'F' },
  { value: 'sat', label: 'Saturday', short: 'S' },
];

const PRESETS: { label: string; pattern: RecurrencePattern }[] = [
  { label: 'Every day', pattern: { frequency: 'daily', interval: 1 } },
  { label: 'Every weekday', pattern: { frequency: 'weekly', interval: 1, daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'] } },
  { label: 'Every week', pattern: { frequency: 'weekly', interval: 1, daysOfWeek: ['mon'] } },
  { label: 'Every 2 weeks', pattern: { frequency: 'weekly', interval: 2, daysOfWeek: ['mon'] } },
  { label: 'Every month', pattern: { frequency: 'monthly', interval: 1, dayOfMonth: 1 } },
  { label: 'Every year', pattern: { frequency: 'yearly', interval: 1, dayOfMonth: 1, monthOfYear: 1 } },
];

// ==================== UTILITIES ====================

/**
 * Calculate the next occurrence date based on pattern
 */
export const getNextOccurrence = (
  pattern: RecurrencePattern,
  fromDate: Date = new Date()
): Date => {
  const next = new Date(fromDate);
  next.setHours(9, 0, 0, 0); // Default to 9 AM

  switch (pattern.frequency) {
    case 'daily':
      next.setDate(next.getDate() + pattern.interval);
      break;

    case 'weekly':
      if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
        const currentDay = next.getDay();
        const dayMap: Record<DayOfWeek, number> = {
          sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
        };
        
        // Find next occurrence day
        const targetDays = pattern.daysOfWeek.map(d => dayMap[d]).sort((a, b) => a - b);
        let nextDay = targetDays.find(d => d > currentDay);
        
        if (nextDay === undefined) {
          // Move to next week
          nextDay = targetDays[0];
          next.setDate(next.getDate() + (7 * pattern.interval) - currentDay + nextDay);
        } else {
          next.setDate(next.getDate() + (nextDay - currentDay));
        }
      } else {
        next.setDate(next.getDate() + (7 * pattern.interval));
      }
      break;

    case 'monthly':
      next.setMonth(next.getMonth() + pattern.interval);
      if (pattern.dayOfMonth) {
        next.setDate(Math.min(pattern.dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;

    case 'yearly':
      next.setFullYear(next.getFullYear() + pattern.interval);
      if (pattern.monthOfYear) {
        next.setMonth(pattern.monthOfYear - 1);
      }
      if (pattern.dayOfMonth) {
        next.setDate(pattern.dayOfMonth);
      }
      break;

    case 'custom':
      next.setDate(next.getDate() + pattern.interval);
      break;
  }

  return next;
};

/**
 * Format recurrence pattern for display
 */
export const formatRecurrence = (pattern: RecurrencePattern): string => {
  switch (pattern.frequency) {
    case 'daily':
      return pattern.interval === 1 ? 'Every day' : `Every ${pattern.interval} days`;
    
    case 'weekly':
      if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
        if (pattern.daysOfWeek.length === 5 && 
            !pattern.daysOfWeek.includes('sat') && 
            !pattern.daysOfWeek.includes('sun')) {
          return pattern.interval === 1 ? 'Every weekday' : `Every ${pattern.interval} weeks on weekdays`;
        }
        const days = pattern.daysOfWeek
          .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label.slice(0, 3))
          .join(', ');
        return pattern.interval === 1 
          ? `Weekly on ${days}` 
          : `Every ${pattern.interval} weeks on ${days}`;
      }
      return pattern.interval === 1 ? 'Every week' : `Every ${pattern.interval} weeks`;
    
    case 'monthly':
      const dayStr = pattern.dayOfMonth 
        ? `on day ${pattern.dayOfMonth}` 
        : '';
      return pattern.interval === 1 
        ? `Monthly ${dayStr}`.trim() 
        : `Every ${pattern.interval} months ${dayStr}`.trim();
    
    case 'yearly':
      const monthStr = pattern.monthOfYear 
        ? new Date(2000, pattern.monthOfYear - 1).toLocaleString('default', { month: 'long' })
        : '';
      return pattern.interval === 1 
        ? `Yearly${monthStr ? ` in ${monthStr}` : ''}` 
        : `Every ${pattern.interval} years${monthStr ? ` in ${monthStr}` : ''}`;
    
    case 'custom':
      return `Every ${pattern.interval} days`;
    
    default:
      return 'Repeating';
  }
};

// ==================== RECURRENCE PICKER ====================

export const RecurrencePicker: React.FC<RecurrencePickerProps> = ({
  value,
  onChange,
  onClose,
}) => {
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(value?.frequency || 'weekly');
  const [interval, setInterval] = useState(value?.interval || 1);
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(value?.daysOfWeek || ['mon']);
  const [dayOfMonth, setDayOfMonth] = useState(value?.dayOfMonth || 1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSave = useCallback(() => {
    const pattern: RecurrencePattern = {
      frequency,
      interval,
    };

    if (frequency === 'weekly') {
      pattern.daysOfWeek = daysOfWeek;
    }
    if (frequency === 'monthly' || frequency === 'yearly') {
      pattern.dayOfMonth = dayOfMonth;
    }

    onChange(pattern);
    onClose?.();
  }, [frequency, interval, daysOfWeek, dayOfMonth, onChange, onClose]);

  const handlePreset = (pattern: RecurrencePattern) => {
    setFrequency(pattern.frequency);
    setInterval(pattern.interval);
    if (pattern.daysOfWeek) setDaysOfWeek(pattern.daysOfWeek);
    if (pattern.dayOfMonth) setDayOfMonth(pattern.dayOfMonth);
  };

  const toggleDay = (day: DayOfWeek) => {
    setDaysOfWeek(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-elevated)',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      padding: '16px',
      minWidth: '280px',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '16px',
    },
    title: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px',
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
    closeBtn: {
      width: '24px',
      height: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
    },
    section: {
      marginBottom: '16px',
    },
    label: {
      fontSize: '11px',
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '8px',
    },
    presets: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
    },
    presetBtn: {
      padding: '6px 10px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '6px',
      fontSize: '12px',
      color: 'var(--color-text-secondary)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    frequencyRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    select: {
      padding: '8px 12px',
      background: 'var(--color-bg-glass)',
      border: '1px solid var(--color-border)',
      borderRadius: '6px',
      fontSize: '13px',
      color: 'var(--color-text-primary)',
      cursor: 'pointer',
      outline: 'none',
    },
    numberInput: {
      width: '60px',
      padding: '8px 12px',
      background: 'var(--color-bg-glass)',
      border: '1px solid var(--color-border)',
      borderRadius: '6px',
      fontSize: '13px',
      color: 'var(--color-text-primary)',
      textAlign: 'center',
      outline: 'none',
    },
    days: {
      display: 'flex',
      gap: '4px',
    },
    dayBtn: {
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '50%',
      fontSize: '12px',
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    dayBtnActive: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
    actions: {
      display: 'flex',
      gap: '8px',
      marginTop: '16px',
      paddingTop: '16px',
      borderTop: '1px solid var(--color-border)',
    },
    cancelBtn: {
      flex: 1,
      padding: '10px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 500,
      color: 'var(--color-text-secondary)',
      cursor: 'pointer',
    },
    saveBtn: {
      flex: 1,
      padding: '10px',
      background: 'var(--color-accent)',
      border: 'none',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
    },
    removeBtn: {
      width: '100%',
      padding: '8px',
      background: 'transparent',
      border: 'none',
      fontSize: '12px',
      color: '#ff3b30',
      cursor: 'pointer',
      marginTop: '8px',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>
          {Icons.repeat}
          Repeat
        </span>
        {onClose && (
          <button style={styles.closeBtn} onClick={onClose}>
            {Icons.close}
          </button>
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.label}>Quick Options</div>
        <div style={styles.presets}>
          {PRESETS.map(preset => (
            <button
              key={preset.label}
              style={styles.presetBtn}
              onClick={() => handlePreset(preset.pattern)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.label}>Custom</div>
        <div style={styles.frequencyRow}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Every</span>
          <input
            type="number"
            value={interval}
            onChange={e => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
            max={365}
            style={styles.numberInput}
          />
          <select
            value={frequency}
            onChange={e => setFrequency(e.target.value as RecurrenceFrequency)}
            style={styles.select}
          >
            {FREQUENCY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label.toLowerCase()}{interval > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {frequency === 'weekly' && (
        <div style={styles.section}>
          <div style={styles.label}>On these days</div>
          <div style={styles.days}>
            {DAYS_OF_WEEK.map(day => (
              <button
                key={day.value}
                style={{
                  ...styles.dayBtn,
                  ...(daysOfWeek.includes(day.value) ? styles.dayBtnActive : {}),
                }}
                onClick={() => toggleDay(day.value)}
                title={day.label}
              >
                {day.short}
              </button>
            ))}
          </div>
        </div>
      )}

      {(frequency === 'monthly' || frequency === 'yearly') && (
        <div style={styles.section}>
          <div style={styles.label}>On day</div>
          <input
            type="number"
            value={dayOfMonth}
            onChange={e => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
            min={1}
            max={31}
            style={styles.numberInput}
          />
        </div>
      )}

      <div style={styles.actions}>
        <button style={styles.cancelBtn} onClick={() => { onChange(null); onClose?.(); }}>
          No repeat
        </button>
        <button style={styles.saveBtn} onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
};

// ==================== RECURRENCE BADGE ====================

interface RecurrenceBadgeProps {
  pattern: RecurrencePattern;
  onClick?: () => void;
}

export const RecurrenceBadge: React.FC<RecurrenceBadgeProps> = ({ pattern, onClick }) => {
  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    background: 'var(--color-accent-glass)',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--color-accent)',
    cursor: onClick ? 'pointer' : 'default',
  };

  return (
    <span style={styles} onClick={onClick}>
      {Icons.repeat}
      {formatRecurrence(pattern)}
    </span>
  );
};

// ==================== HOOK: useRecurringTasks ====================

export const useRecurringTasks = () => {
  const [tasks, setTasks] = useState<RecurringTask[]>(() => {
    try {
      const saved = localStorage.getItem('dex-recurring-tasks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveTasks = useCallback((newTasks: RecurringTask[]) => {
    setTasks(newTasks);
    try {
      localStorage.setItem('dex-recurring-tasks', JSON.stringify(newTasks));
    } catch {}
  }, []);

  const createRecurringTask = useCallback((
    title: string,
    recurrence: RecurrencePattern
  ): RecurringTask => {
    const task: RecurringTask = {
      id: `recurring-${Date.now()}`,
      title,
      recurrence,
      nextDueDate: getNextOccurrence(recurrence).getTime(),
      completedOccurrences: 0,
      createdAt: Date.now(),
      isActive: true,
    };
    saveTasks([...tasks, task]);
    return task;
  }, [tasks, saveTasks]);

  const completeOccurrence = useCallback((taskId: string) => {
    saveTasks(tasks.map(task => {
      if (task.id !== taskId) return task;
      
      const now = Date.now();
      const nextDue = getNextOccurrence(task.recurrence, new Date());
      
      // Check if we've reached the end conditions
      if (task.recurrence.endAfterOccurrences && 
          task.completedOccurrences + 1 >= task.recurrence.endAfterOccurrences) {
        return { ...task, isActive: false, lastCompletedDate: now };
      }
      if (task.recurrence.endDate && nextDue.getTime() > task.recurrence.endDate) {
        return { ...task, isActive: false, lastCompletedDate: now };
      }

      return {
        ...task,
        nextDueDate: nextDue.getTime(),
        lastCompletedDate: now,
        completedOccurrences: task.completedOccurrences + 1,
      };
    }));
  }, [tasks, saveTasks]);

  const updateRecurrence = useCallback((taskId: string, recurrence: RecurrencePattern | null) => {
    if (recurrence === null) {
      // Remove recurrence
      saveTasks(tasks.filter(t => t.id !== taskId));
    } else {
      saveTasks(tasks.map(task => 
        task.id === taskId 
          ? { ...task, recurrence, nextDueDate: getNextOccurrence(recurrence).getTime() }
          : task
      ));
    }
  }, [tasks, saveTasks]);

  const deleteTask = useCallback((taskId: string) => {
    saveTasks(tasks.filter(t => t.id !== taskId));
  }, [tasks, saveTasks]);

  // Get tasks due today or overdue
  const dueTasks = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return tasks.filter(t => t.isActive && t.nextDueDate <= today.getTime());
  }, [tasks]);

  return {
    tasks,
    dueTasks,
    createRecurringTask,
    completeOccurrence,
    updateRecurrence,
    deleteTask,
  };
};

export default RecurrencePicker;
