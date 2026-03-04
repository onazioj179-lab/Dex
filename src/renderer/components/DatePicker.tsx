/**
 * DEX Date Picker Component
 * Date and time selection
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ==================== TYPES ====================

interface DatePickerProps {
  value?: Date;
  defaultValue?: Date;
  onChange?: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  placeholder?: string;
  format?: string;
  showTime?: boolean;
  clearable?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface DateRangePickerProps {
  startDate?: Date;
  endDate?: Date;
  onChange?: (start: Date | null, end: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
}

interface TimePickerProps {
  value?: string; // HH:mm format
  onChange?: (time: string) => void;
  use24Hour?: boolean;
  minuteStep?: number;
  disabled?: boolean;
}

interface MonthYearPickerProps {
  value?: Date;
  onChange?: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
}

// ==================== UTILITIES ====================

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const formatDate = (date: Date, format: string = 'MM/DD/YYYY'): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes);
};

const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
};

const isDateInRange = (date: Date, min?: Date, max?: Date): boolean => {
  if (min && date < min) return false;
  if (max && date > max) return false;
  return true;
};

// ==================== DATE PICKER ====================

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  defaultValue,
  onChange,
  minDate,
  maxDate,
  disabled = false,
  placeholder = 'Select date',
  format = 'MM/DD/YYYY',
  showTime = false,
  clearable = true,
  size = 'md',
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    value || defaultValue || null
  );
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(
    value || defaultValue || new Date()
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (value !== undefined) {
      setSelectedDate(value);
      if (value) setViewDate(value);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDaysInMonth = (year: number, month: number): Date[] => {
    const days: Date[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Add padding days from previous month
    for (let i = firstDay.getDay(); i > 0; i--) {
      days.push(new Date(year, month, 1 - i));
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    // Add padding days from next month
    const remaining = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }

    return days;
  };

  const handleSelect = (date: Date) => {
    if (!isDateInRange(date, minDate, maxDate)) return;

    if (showTime && selectedDate) {
      date.setHours(selectedDate.getHours(), selectedDate.getMinutes());
    }

    setSelectedDate(date);
    onChange?.(date);
    if (!showTime) {
      setIsOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate(null);
    onChange?.(null);
  };

  const navigateMonth = (direction: number) => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  };

  const sizes = {
    sm: { input: 32, font: 12 },
    md: { input: 40, font: 14 },
    lg: { input: 48, font: 16 },
  };

  const s = sizes[size];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-block',
    },
    input: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      height: s.input,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      minWidth: 160,
    },
    inputOpen: {
      borderColor: 'var(--color-accent)',
      boxShadow: '0 0 0 2px rgba(var(--color-accent-rgb), 0.2)',
    },
    inputText: {
      flex: 1,
      fontSize: s.font,
      color: selectedDate ? 'var(--color-text)' : 'var(--color-text-muted)',
    },
    clearButton: {
      padding: 4,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 12,
    },
    calendar: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    navButton: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      color: 'var(--color-text)',
      fontSize: 16,
    },
    monthYear: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    weekdays: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 2,
      marginBottom: 8,
    },
    weekday: {
      textAlign: 'center',
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      padding: 4,
    },
    days: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 2,
    },
    day: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      fontSize: 13,
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      color: 'var(--color-text)',
      transition: 'all 0.15s',
    },
    dayOtherMonth: {
      color: 'var(--color-text-muted)',
      opacity: 0.5,
    },
    daySelected: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
    dayToday: {
      border: '1px solid var(--color-accent)',
    },
    dayDisabled: {
      opacity: 0.3,
      cursor: 'not-allowed',
    },
    timeSection: {
      display: 'flex',
      gap: 8,
      marginTop: 12,
      paddingTop: 12,
      borderTop: '1px solid var(--color-border)',
    },
    timeInput: {
      flex: 1,
      padding: '8px 12px',
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 14,
      color: 'var(--color-text)',
      textAlign: 'center',
    },
  };

  const days = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());

  return (
    <div ref={containerRef} style={styles.container}>
      <div
        style={{
          ...styles.input,
          ...(isOpen ? styles.inputOpen : {}),
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span style={styles.inputText}>
          {selectedDate
            ? formatDate(selectedDate, showTime ? format + ' HH:mm' : format)
            : placeholder}
        </span>
        {clearable && selectedDate && (
          <button style={styles.clearButton} onClick={handleClear}>
            ×
          </button>
        )}
        <span style={{ color: 'var(--color-text-muted)' }}>calendar</span>
      </div>

      {isOpen && (
        <div style={styles.calendar}>
          <div style={styles.header}>
            <button style={styles.navButton} onClick={() => navigateMonth(-1)}>
              ‹
            </button>
            <span style={styles.monthYear}>
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button style={styles.navButton} onClick={() => navigateMonth(1)}>
              ›
            </button>
          </div>

          <div style={styles.weekdays}>
            {DAYS.map(day => (
              <div key={day} style={styles.weekday}>{day}</div>
            ))}
          </div>

          <div style={styles.days}>
            {days.map((day, i) => {
              const isCurrentMonth = day.getMonth() === viewDate.getMonth();
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, today);
              const isDisabled = !isDateInRange(day, minDate, maxDate);

              return (
                <button
                  key={i}
                  style={{
                    ...styles.day,
                    ...(!isCurrentMonth ? styles.dayOtherMonth : {}),
                    ...(isSelected ? styles.daySelected : {}),
                    ...(isToday && !isSelected ? styles.dayToday : {}),
                    ...(isDisabled ? styles.dayDisabled : {}),
                  }}
                  onClick={() => handleSelect(day)}
                  disabled={isDisabled}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {showTime && (
            <div style={styles.timeSection}>
              <input
                type="time"
                style={styles.timeInput}
                value={
                  selectedDate
                    ? `${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}`
                    : ''
                }
                onChange={(e) => {
                  if (selectedDate) {
                    const [hours, minutes] = e.target.value.split(':').map(Number);
                    const newDate = new Date(selectedDate);
                    newDate.setHours(hours, minutes);
                    setSelectedDate(newDate);
                    onChange?.(newDate);
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== DATE RANGE PICKER ====================

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate: controlledStart,
  endDate: controlledEnd,
  onChange,
  minDate,
  maxDate,
  disabled = false,
}) => {
  const [startDate, setStartDate] = useState<Date | null>(controlledStart || null);
  const [endDate, setEndDate] = useState<Date | null>(controlledEnd || null);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDaysInMonth = (year: number, month: number): Date[] => {
    const days: Date[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    for (let i = firstDay.getDay(); i > 0; i--) {
      days.push(new Date(year, month, 1 - i));
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }

    return days;
  };

  const handleSelect = (date: Date) => {
    if (!isDateInRange(date, minDate, maxDate)) return;

    if (selecting === 'start') {
      setStartDate(date);
      setEndDate(null);
      setSelecting('end');
    } else {
      if (startDate && date < startDate) {
        setEndDate(startDate);
        setStartDate(date);
      } else {
        setEndDate(date);
      }
      setSelecting('start');
      setIsOpen(false);
      onChange?.(startDate, date);
    }
  };

  const isInRange = (date: Date): boolean => {
    if (!startDate || !endDate) return false;
    return date >= startDate && date <= endDate;
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-block',
    },
    input: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    },
    inputOpen: {
      borderColor: 'var(--color-accent)',
    },
    dateText: {
      fontSize: 14,
      color: 'var(--color-text)',
    },
    separator: {
      color: 'var(--color-text-muted)',
    },
    calendar: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    navButton: {
      padding: 8,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text)',
    },
    weekdays: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 2,
      marginBottom: 8,
    },
    weekday: {
      textAlign: 'center',
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    days: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 2,
    },
    day: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      fontSize: 13,
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      color: 'var(--color-text)',
    },
    dayInRange: {
      background: 'rgba(var(--color-accent-rgb), 0.1)',
    },
    daySelected: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
  };

  const days = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());

  return (
    <div ref={containerRef} style={styles.container}>
      <div
        style={{
          ...styles.input,
          ...(isOpen ? styles.inputOpen : {}),
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span style={styles.dateText}>
          {startDate ? formatDate(startDate, 'MM/DD/YYYY') : 'Start date'}
        </span>
        <span style={styles.separator}>arrow-right</span>
        <span style={styles.dateText}>
          {endDate ? formatDate(endDate, 'MM/DD/YYYY') : 'End date'}
        </span>
      </div>

      {isOpen && (
        <div style={styles.calendar}>
          <div style={styles.header}>
            <button
              style={styles.navButton}
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))}
            >
              ‹
            </button>
            <span>
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button
              style={styles.navButton}
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))}
            >
              ›
            </button>
          </div>

          <div style={styles.weekdays}>
            {DAYS.map(day => (
              <div key={day} style={styles.weekday}>{day}</div>
            ))}
          </div>

          <div style={styles.days}>
            {days.map((day, i) => {
              const isStart = startDate && isSameDay(day, startDate);
              const isEnd = endDate && isSameDay(day, endDate);
              const inRange = isInRange(day);

              return (
                <button
                  key={i}
                  style={{
                    ...styles.day,
                    ...(inRange ? styles.dayInRange : {}),
                    ...(isStart || isEnd ? styles.daySelected : {}),
                  }}
                  onClick={() => handleSelect(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== TIME PICKER ====================

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  use24Hour = true,
  minuteStep = 5,
  disabled = false,
}) => {
  const [time, setTime] = useState(value || '12:00');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [hours, minutes] = time.split(':').map(Number);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const setHours = (h: number) => {
    const newTime = `${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setTime(newTime);
    onChange?.(newTime);
  };

  const setMinutes = (m: number) => {
    const newTime = `${String(hours).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setTime(newTime);
    onChange?.(newTime);
  };

  const hourOptions = use24Hour
    ? Array.from({ length: 24 }, (_, i) => i)
    : Array.from({ length: 12 }, (_, i) => i + 1);

  const minuteOptions = Array.from(
    { length: 60 / minuteStep },
    (_, i) => i * minuteStep
  );

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-block',
    },
    input: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    },
    dropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      display: 'flex',
      gap: 8,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
    },
    column: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      maxHeight: 200,
      overflow: 'auto',
    },
    option: {
      width: 40,
      padding: '6px 0',
      textAlign: 'center',
      background: 'none',
      border: 'none',
      borderRadius: 6,
      fontSize: 14,
      cursor: 'pointer',
      color: 'var(--color-text)',
    },
    optionSelected: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.input} onClick={() => !disabled && setIsOpen(!isOpen)}>
        <span>clock</span>
        <span>{time}</span>
      </div>

      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.column as any}>
            {hourOptions.map(h => (
              <button
                key={h}
                style={{
                  ...styles.option,
                  ...(hours === h ? styles.optionSelected : {}),
                }}
                onClick={() => setHours(h)}
              >
                {String(h).padStart(2, '0')}
              </button>
            ))}
          </div>
          <div style={styles.column as any}>
            {minuteOptions.map(m => (
              <button
                key={m}
                style={{
                  ...styles.option,
                  ...(minutes === m ? styles.optionSelected : {}),
                }}
                onClick={() => setMinutes(m)}
              >
                {String(m).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== MONTH YEAR PICKER ====================

export const MonthYearPicker: React.FC<MonthYearPickerProps> = ({
  value,
  onChange,
  minDate,
  maxDate,
  disabled = false,
}) => {
  const [date, setDate] = useState(value || new Date());
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectMonth = (month: number) => {
    const newDate = new Date(date.getFullYear(), month, 1);
    setDate(newDate);
    onChange?.(newDate);
    setIsOpen(false);
  };

  const selectYear = (year: number) => {
    const newDate = new Date(year, date.getMonth(), 1);
    setDate(newDate);
    setMode('month');
  };

  const startYear = Math.floor(date.getFullYear() / 12) * 12;
  const years = Array.from({ length: 12 }, (_, i) => startYear + i);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-block',
    },
    input: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    },
    dropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      padding: 12,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
      width: 280,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    yearButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8,
    },
    option: {
      padding: '8px 12px',
      background: 'none',
      border: 'none',
      borderRadius: 6,
      fontSize: 13,
      cursor: 'pointer',
      color: 'var(--color-text)',
      textAlign: 'center',
    },
    optionSelected: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.input} onClick={() => !disabled && setIsOpen(!isOpen)}>
        <span>{MONTHS[date.getMonth()]} {date.getFullYear()}</span>
      </div>

      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.header}>
            <button
              style={styles.yearButton}
              onClick={() => setMode(mode === 'month' ? 'year' : 'month')}
            >
              {mode === 'month' ? date.getFullYear() : `${startYear} - ${startYear + 11}`}
            </button>
          </div>

          <div style={styles.grid}>
            {mode === 'month'
              ? MONTHS.map((month, i) => (
                  <button
                    key={month}
                    style={{
                      ...styles.option,
                      ...(date.getMonth() === i ? styles.optionSelected : {}),
                    }}
                    onClick={() => selectMonth(i)}
                  >
                    {month.slice(0, 3)}
                  </button>
                ))
              : years.map(year => (
                  <button
                    key={year}
                    style={{
                      ...styles.option,
                      ...(date.getFullYear() === year ? styles.optionSelected : {}),
                    }}
                    onClick={() => selectYear(year)}
                  >
                    {year}
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
