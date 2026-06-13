/**
 * DEX Platform - Calendar
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Apple-Calendar-inspired event manager with month / week views,
 * drag-to-create slots, recurring events, and ICS import/export.
 */
import React, { useState, useEffect, memo } from 'react';
import { useAppTracking } from '../../services/usePatternLearning';
import DexIcon from '../../components/DexIcon';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime: string;
  color: string;
  description: string;
  recurring?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
}

const Calendar: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('calendar');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    time: '09:00',
    endTime: '10:00',
    color: 'var(--color-accent)',
    description: '',
    recurring: 'none' as CalendarEvent['recurring'],
  });

  const colors = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-error)', '#bf5af2', '#ff2d55', '#64d2ff'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  useEffect(() => {
    (async () => {
      try {
        if ((window as any).electron?.invoke) {
          const stored = await (window as any).electron.invoke('capability:storage:get', 'dex-calendar-events');
          if (stored && Array.isArray(stored)) { setEvents(stored); return; }
        }
      } catch (e) { console.warn('[DEX]', e); }
      try {
        const saved = localStorage.getItem('dex-calendar-events');
        if (saved) setEvents(JSON.parse(saved));
      } catch (e) {
        console.warn('[Calendar] Failed to load events:', e);
      }
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('dex-calendar-events', JSON.stringify(events));
    } catch (e) { console.warn('[DEX]', e); }
    (async () => {
      try {
        if ((window as any).electron?.invoke) {
          await (window as any).electron.invoke('capability:storage:set', 'dex-calendar-events', events);
        }
      } catch (e) { console.warn('[DEX]', e); }
    })();
  }, [events]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  
  const getEventsForDate = (date: Date) => {
    const dateStr = formatDate(date);
    return events.filter(e => {
      if (e.date === dateStr) return true;
      if (!e.recurring || e.recurring === 'none') return false;
      const eventDate = new Date(e.date);
      if (eventDate > date) return false;
      if (e.recurring === 'daily') return true;
      if (e.recurring === 'weekly') return eventDate.getDay() === date.getDay();
      if (e.recurring === 'monthly') return eventDate.getDate() === date.getDate();
      if (e.recurring === 'yearly') return eventDate.getMonth() === date.getMonth() && eventDate.getDate() === date.getDate();
      return false;
    });
  };

  const isToday = (date: Date) => formatDate(date) === formatDate(new Date());
  const isSelected = (date: Date) => selectedDate && formatDate(date) === formatDate(selectedDate);

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
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
      if (e.date !== formatDate(date)) return false;
      const eventHour = parseInt(e.time.split(':')[0], 10);
      return eventHour === hour;
    });
  };

  const handleSaveEvent = () => {
    if (!newEvent.title || !selectedDate) return;
    
    const event: CalendarEvent = {
      id: Date.now().toString(),
      title: newEvent.title,
      date: formatDate(selectedDate),
      time: newEvent.time,
      endTime: newEvent.endTime,
      color: newEvent.color,
      description: newEvent.description,
      recurring: newEvent.recurring,
    };
    
    setEvents(prev => [...prev, event]);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'calendarEventsCreated', amount: 1 } }));
    setNewEvent({ title: '', time: '09:00', endTime: '10:00', color: 'var(--color-accent)', description: '', recurring: 'none' });
    setShowEventModal(false);
  };

  const deleteEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  };

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
    setSelectedDate(dragStart.date);
    setNewEvent(prev => ({
      ...prev,
      time: startHour.toString().padStart(2, '0') + ':00',
      endTime: Math.min(endHour, 23).toString().padStart(2, '0') + ':00',
    }));
    setShowEventModal(true);
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
    } else {
      newDate.setMonth(newDate.getMonth() + dir);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  // ICS export
  const exportICS = () => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DEX//Calendar//EN'];
    events.forEach(e => {
      const dateClean = e.date.replace(/-/g, '');
      const timeClean = e.time.replace(':', '') + '00';
      const endClean = e.endTime.replace(':', '') + '00';
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@dex`);
      lines.push(`DTSTART:${dateClean}T${timeClean}`);
      lines.push(`DTEND:${dateClean}T${endClean}`);
      lines.push(`SUMMARY:${e.title}`);
      if (e.description) lines.push(`DESCRIPTION:${e.description}`);
      if (e.recurring && e.recurring !== 'none') {
        const freq = e.recurring.toUpperCase();
        lines.push(`RRULE:FREQ=${freq}`);
      }
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dex-calendar.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ICS import
  const importICS = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics';
    input.onchange = async () => {
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
        if (!summary || !dtstart) continue;
        const date = dtstart.length >= 8 ? `${dtstart.slice(0,4)}-${dtstart.slice(4,6)}-${dtstart.slice(6,8)}` : '';
        const time = dtstart.length >= 13 ? `${dtstart.slice(9,11)}:${dtstart.slice(11,13)}` : '09:00';
        const endTime = dtend.length >= 13 ? `${dtend.slice(9,11)}:${dtend.slice(11,13)}` : '10:00';
        let recurring: CalendarEvent['recurring'] = 'none';
        if (rrule.includes('DAILY')) recurring = 'daily';
        else if (rrule.includes('WEEKLY')) recurring = 'weekly';
        else if (rrule.includes('MONTHLY')) recurring = 'monthly';
        else if (rrule.includes('YEARLY')) recurring = 'yearly';
        imported.push({ id: Date.now().toString() + i, title: summary, date, time, endTime, color: 'var(--color-accent)', description: desc, recurring });
      }
      if (imported.length > 0) setEvents(prev => [...prev, ...imported]);
    };
    input.click();
  };

  return (
    <div style={styles.container} role="region" aria-label="Calendar">
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.todayBtn} onClick={goToToday} aria-label="Go to today">Today</button>
          <div style={styles.navBtns}>
            <button style={styles.navBtn} onClick={() => navigate(-1)} aria-label="Previous month">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button style={styles.navBtn} onClick={() => navigate(1)} aria-label="Next month">
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
              : `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`
            }
          </h1>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.viewToggle}>
            <button style={{ ...styles.viewBtn, ...(view === 'month' ? styles.viewBtnActive : {}) }} onClick={() => setView('month')} aria-label="Month view">Month</button>
            <button style={{ ...styles.viewBtn, ...(view === 'week' ? styles.viewBtnActive : {}) }} onClick={() => setView('week')} aria-label="Week view">Week</button>
          </div>
          <button style={styles.addBtn} onClick={() => setShowEventModal(true)} aria-label="Add event">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button style={{ ...styles.todayBtn, marginLeft: 4 }} onClick={exportICS} aria-label="Export ICS">Export</button>
          <button style={{ ...styles.todayBtn, marginLeft: 2 }} onClick={importICS} aria-label="Import ICS">Import</button>

        </div>
      </div>

      <div style={styles.main}>
        {/* Sidebar */}
        <div style={{ ...styles.sidebar, width: sidebarCollapsed ? '0' : 'min(260px, 30vw)', padding: sidebarCollapsed ? '0' : '20px' }}>
          {!sidebarCollapsed && (
            <>
              {/* Mini Calendar */}
              <div style={styles.miniCal}>
                <div style={styles.miniHeader}>
                  <span style={styles.miniTitle}>{months[currentDate.getMonth()].slice(0, 3)} {currentDate.getFullYear()}</span>
                </div>
                <div style={styles.miniDays}>
                  {days.map(d => <span key={d} style={styles.miniDayLabel}>{d[0]}</span>)}
                </div>
                <div style={styles.miniGrid}>
                  {getDaysInMonth(currentDate).map((day, idx) => (
                    <div
                      key={idx}
                      style={{
                        ...styles.miniDay,
                        ...(day && isToday(day) ? styles.miniDayToday : {}),
                        ...(day && isSelected(day) ? styles.miniDaySelected : {}),
                      }}
                      onClick={() => day && setSelectedDate(day)}
                    >
                      {day?.getDate()}
                    </div>
                  ))}
                </div>
              </div>

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
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.35, marginBottom: 8 }}>
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <div>No events for this day</div>
                        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>Click the + button to add one</div>
                      </div>
                    ) : (
                      getEventsForDate(selectedDate).map(event => (
                        <div key={event.id} style={{ ...styles.eventItem, borderLeftColor: event.color }}>
                          <div style={styles.eventTime}>{event.time} - {event.endTime}</div>
                          <div style={styles.eventTitle}>{event.title}</div>
                          <button style={styles.deleteEventBtn} onClick={() => deleteEvent(event.id)} aria-label={`Delete ${event.title}`}><DexIcon name="close" size={12} /></button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Toggle Sidebar */}
        <button style={styles.sidebarToggle} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>

        {/* Calendar Grid */}
        <div style={styles.calendarArea}>
          {view === 'month' ? (
            <>
              <div style={styles.weekHeader}>
                {days.map(day => (
                  <div key={day} style={styles.weekDay}>{day}</div>
                ))}
              </div>
              <div style={styles.calendarGrid}>
                {getDaysInMonth(currentDate).map((day, idx) => (
                  <div
                    key={idx}
                    style={{
                      ...styles.dayCell,
                      ...(day && isToday(day) ? styles.dayCellToday : {}),
                      ...(day && isSelected(day) ? styles.dayCellSelected : {}),
                    }}
                    onClick={() => day && setSelectedDate(day)}
                  >
                    {day && (
                      <>
                        <div style={{ ...styles.dayNumber, ...(isToday(day) ? styles.dayNumberToday : {}) }}>
                          {day.getDate()}
                        </div>
                        <div style={styles.dayEventsPreview}>
                          {getEventsForDate(day).slice(0, 3).map(event => (
                            <div key={event.id} style={{ ...styles.eventDot, background: event.color }}>
                              <span style={styles.eventDotText}>{event.title}</span>
                            </div>
                          ))}
                          {getEventsForDate(day).length > 3 && (
                            <div style={styles.moreEvents}>+{getEventsForDate(day).length - 3} more</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
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
                            ...(isToday(date) ? styles.weekViewCellToday : {}),
                            ...(isInDragRange(date, hour) ? { background: 'var(--color-accent-light, rgba(74,158,255,0.15))' } : {}),
                          }}
                          onMouseDown={e => { e.preventDefault(); handleDragStart(date, hour); }}
                          onMouseEnter={() => handleDragMove(date, hour)}
                          onMouseUp={() => handleDragEnd()}
                          onClick={() => {
                            if (isDragging) return;
                            setSelectedDate(date);
                            const timeStr = hour.toString().padStart(2, '0') + ':00';
                            const endHour = Math.min(hour + 1, 23);
                            const endTimeStr = endHour.toString().padStart(2, '0') + ':00';
                            setNewEvent(prev => ({ ...prev, time: timeStr, endTime: endTimeStr }));
                            setShowEventModal(true);
                          }}
                        >
                          {slotEvents.map(event => (
                            <div
                              key={event.id}
                              style={{
                                ...styles.weekViewEvent,
                                background: event.color,
                              }}
                              onClick={e => e.stopPropagation()}
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
        <div style={styles.modalOverlay} onMouseDown={() => setShowEventModal(false)}>
          <div style={styles.modal} role="dialog" aria-label="New Event" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>New Event</h2>
              <button style={styles.modalClose} onClick={() => setShowEventModal(false)} aria-label="Close modal"><DexIcon name="close" size={14} /></button>
            </div>
            <div style={styles.modalBody}>
              <input
                style={styles.input}
                type="text"
                placeholder="Event title"
                value={newEvent.title}
                onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                autoFocus
              />
              <div style={styles.timeRow}>
                <input
                  style={styles.timeInput}
                  type="time"
                  value={newEvent.time}
                  onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                />
                <span style={styles.timeSep}>to</span>
                <input
                  style={styles.timeInput}
                  type="time"
                  value={newEvent.endTime}
                  onChange={e => setNewEvent({ ...newEvent, endTime: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(r => (
                  <button
                    key={r}
                    style={{
                      padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 12,
                      background: newEvent.recurring === r ? 'var(--accent)' : 'var(--bg-tertiary, #333)',
                      color: newEvent.recurring === r ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setNewEvent({ ...newEvent, recurring: r })}
                    aria-label={`Repeat ${r}`}
                  >
                    {r === 'none' ? 'No Repeat' : r.charAt(0).toUpperCase() + r.slice(1)}
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
              <textarea
                style={styles.textarea}
                placeholder="Add description..."
                value={newEvent.description}
                onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
              />
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowEventModal(false)} aria-label="Cancel">Cancel</button>
              <button style={styles.saveBtn} onClick={handleSaveEvent} aria-label="Save event">Save Event</button>
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
    padding: '12px 16px',
    height: '44px',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-solid, #1C1C1E)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  todayBtn: {
    padding: '6px 14px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '4px',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  navBtns: {
    display: 'flex',
    gap: '4px',
  },
  navBtn: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-tertiary)',
    padding: '6px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.15s ease',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    margin: 0,
    letterSpacing: '-0.3px',
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--color-bg-hover)',
    borderRadius: '4px',
    padding: '2px',
    border: '1px solid var(--color-border-subtle)',
    gap: '2px',
  },
  viewBtn: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '3px',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  viewBtnActive: {
    background: 'var(--color-accent)',
    color: 'var(--color-text-inverse)',
  },
  addBtn: {
    width: '32px',
    height: '32px',
    background: 'var(--color-success)',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--color-text-inverse)',
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
    background: 'var(--color-bg-surface)',
    borderRight: '1px solid var(--color-border-subtle)',
    overflow: 'hidden',
    transition: 'all 0.18s ease',
  },
  sidebarToggle: {
    position: 'absolute',
    left: '0',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderLeft: 'none',
    borderRadius: '0 4px 4px 0',
    padding: '8px 4px',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    zIndex: 10,
    boxShadow: 'var(--shadow-md)',
  },
  miniCal: {
    marginBottom: '16px',
    background: 'var(--color-bg-surface)',
    borderRadius: '6px',
    padding: '12px',
    border: '1px solid var(--color-border-subtle)',
  },
  miniHeader: {
    marginBottom: '10px',
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
    textTransform: 'uppercase' as const,
  },
  miniGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px',
  },
  miniDay: {
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
    background: 'var(--color-accent)',
    color: 'var(--color-text-inverse)',
  },
  miniDaySelected: {
    background: 'var(--color-accent-light, rgba(74,158,255,0.2))',
    border: '1px solid var(--color-accent-soft, rgba(74,158,255,0.4))',
  },
  dayEvents: {
    marginTop: '12px',
  },
  dayEventsHeader: {
    marginBottom: '10px',
  },
  dayEventsTitle: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase' as const,
  },
  eventsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  noEvents: {
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    padding: '24px 0',
    fontWeight: 500,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  eventItem: {
    background: 'var(--color-bg-surface)',
    borderRadius: '4px',
    padding: '10px 12px',
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
    borderRadius: '3px',
    transition: 'all 0.15s ease',
  },
  calendarArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    marginLeft: '12px',
  },
  weekHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    marginBottom: '8px',
  },
  weekDay: {
    textAlign: 'center',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    padding: '8px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  calendarGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gridAutoRows: '1fr',
    gap: '1px',
    background: 'var(--color-border-subtle)',
    borderRadius: '6px',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-md)',
  },
  dayCell: {
    background: 'var(--color-bg-surface)',
    padding: '8px',
    minHeight: '80px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  dayCellToday: {
    background: 'var(--color-accent-light)',
  },
  dayCellSelected: {
    background: 'var(--color-accent-light)',
    boxShadow: 'inset 0 0 0 1px var(--color-accent-soft, rgba(74,158,255,0.3))',
  },
  dayNumber: {
    fontSize: '12px',
    fontWeight: 600,
    marginBottom: '4px',
    color: 'var(--color-text-tertiary)',
  },
  dayNumberToday: {
    background: 'var(--color-accent)',
    color: 'var(--color-text-inverse)',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayEventsPreview: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  eventDot: {
    padding: '2px 6px',
    borderRadius: '2px',
    fontSize: '9px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    boxShadow: 'var(--shadow-sm)',
  },
  eventDotText: {
    color: 'var(--color-text-inverse)',
    fontWeight: 600,
  },
  moreEvents: {
    fontSize: '9px',
    color: 'var(--color-text-muted)',
    padding: '2px 6px',
    fontWeight: 600,
  },
  // -- Week View Styles --------------------------------------
  weekViewContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflow: 'hidden',
    borderRadius: '6px',
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
    padding: '8px 0 6px',
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
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  weekViewDayNum: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    lineHeight: 1,
  },
  weekViewDayNumToday: {
    background: 'var(--color-accent)',
    color: 'var(--color-text-inverse)',
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
    paddingRight: '8px',
    paddingTop: '2px',
    borderRight: '1px solid var(--color-border-subtle)',
  },
  weekViewTimeLabelText: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
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
  weekViewEvent: {
    borderRadius: '3px',
    padding: '2px 6px',
    marginBottom: '2px',
    overflow: 'hidden',
    cursor: 'default',
    boxShadow: 'var(--shadow-sm)',
  },
  weekViewEventTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--color-text-inverse)',
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
    background: 'var(--color-bg-surface)',
    borderRadius: '10px',
    width: 'min(380px, 92vw)',
    boxShadow: 'var(--shadow-float)',
    border: '1px solid var(--color-border-default)',

  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)',
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
    padding: '4px 8px',
    borderRadius: '3px',
    transition: 'all 0.15s ease',
  },
  modalBody: {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '4px',
    padding: '12px 14px',
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
    borderRadius: '4px',
    padding: '10px 12px',
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
  colorPicker: {
    display: 'flex',
    gap: '8px',
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
    transform: 'scale(1.15)',
    boxShadow: 'var(--shadow-md)',
  },
  textarea: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '4px',
    padding: '12px 14px',
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
    padding: '16px 20px',
    borderTop: '1px solid var(--color-border-subtle)',
  },
  cancelBtn: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid var(--color-border-default)',
    borderRadius: '4px',
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'var(--dex-font-ui)',
  },
  saveBtn: {
    padding: '8px 16px',
    background: 'var(--color-success)',
    border: 'none',
    borderRadius: '4px',
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
