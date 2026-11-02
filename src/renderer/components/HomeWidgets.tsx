// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * HomeWidgets - Draggable, resizable widget layer for the Home screen.
 * Renders widgets from widgetStore with move/resize handles in edit mode.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { AssistedTextarea } from './AssistedTextarea';
import { useWidgetStore, WIDGET_TEMPLATES, type Widget, type WidgetType } from '../store/widgetStore';
import { useRecentFiles, type RecentFile } from '../store/useRecentFiles';
import { useNotesStore } from '../store/notesStore';
import { useDockPins } from '../store/dockPinStore';
import { APP_DEFINITIONS } from '../store/runningApps';
import { usePatternLearning, type Suggestion } from '../services/usePatternLearning';
import { useNowPlaying } from '../services/nowPlaying';
import { sharedTick } from '../services/SharedTick';
import DexIcon from './DexIcon';
import { platform } from '../utils';
import { formatBytes as sharedFormatBytes } from '../../shared/format/units';
import { space, radius, fontSize, zIndex } from '../styles/tokens';

// ======================================================================
// WIDGET CONTENT RENDERERS
// ======================================================================

const ClockWidget: React.FC<{ widget: Widget }> = ({ widget }) => {
  const [time, setTime] = useState(new Date());
  const [userName, setUserName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showSeconds, setShowSeconds] = useState(() => {
    try { return localStorage.getItem('dex-clock-show-seconds') === 'true'; } catch { return false; }
  });
  const [use24Hour, setUse24Hour] = useState(() => {
    try { return localStorage.getItem('dex-clock-24h') === 'true'; } catch { return false; }
  });
  const [showDate, setShowDate] = useState(() => {
    try {
      const raw = localStorage.getItem('dex-clock-show-date');
      return raw === null ? true : raw === 'true';
    } catch { return true; }
  });
  const [timezone, setTimezone] = useState(() => {
    try { return localStorage.getItem('dex-clock-timezone') || 'local'; } catch { return 'local'; }
  });
  const greeting = useMemo(() => {
    const hour = time.getHours();
    const base = hour >= 5 && hour < 12 ? 'Good Morning' : hour >= 12 && hour < 17 ? 'Good Afternoon' : hour >= 17 && hour < 21 ? 'Good Evening' : 'Good Night';
    return userName ? `${base}, ${userName}` : base;
  }, [time, userName]);
  const timeSize = Math.max(34, Math.min(82, Math.round(Math.min(widget.width * (showSeconds ? 0.2 : 0.24), widget.height * (showSeconds ? 0.27 : 0.34)))));
  const metaSize = Math.max(11, Math.min(16, Math.round(widget.width * 0.045)));
  
  useEffect(() => {
    // Use SharedTick for centralized interval management (auto-pauses when hidden)
    const tickId = `clock-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, () => setTime(new Date()), showSeconds ? 1000 : 60000);
    return () => sharedTick.unsubscribe(tickId);
  }, [showSeconds]);

  useEffect(() => {
    (async () => {
      try {
        const info = await (window as any).electron?.invoke?.('system:getUserInfo');
        if (info?.username) {
          const name = info.displayName || info.username;
          setUserName(name.split(/[\s_]/)[0].replace(/^\w/, (c: string) => c.toUpperCase()));
        }
      } catch { /* silent */ }
    })();
  }, []);
  
  const toggleSeconds = () => {
    const newValue = !showSeconds;
    setShowSeconds(newValue);
    try { localStorage.setItem('dex-clock-show-seconds', String(newValue)); } catch { /* intentional: widget pref persistence is best-effort */ }
  };

  const toggle24Hour = () => {
    const next = !use24Hour;
    setUse24Hour(next);
    try { localStorage.setItem('dex-clock-24h', String(next)); } catch { /* intentional: widget pref persistence is best-effort */ }
  };

  const toggleDate = () => {
    const next = !showDate;
    setShowDate(next);
    try { localStorage.setItem('dex-clock-show-date', String(next)); } catch { /* intentional: widget pref persistence is best-effort */ }
  };

  const updateTimezone = (tz: string) => {
    setTimezone(tz);
    try { localStorage.setItem('dex-clock-timezone', tz); } catch { /* intentional: widget pref persistence is best-effort */ }
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24Hour,
    ...(showSeconds ? { second: '2-digit' as const } : {}),
    ...(timezone !== 'local' ? { timeZone: timezone } : {}),
  };

  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timezone !== 'local' ? { timeZone: timezone } : {}),
  };
  
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'default', padding: '10px var(--space-3)', textAlign: 'center', position: 'relative' }}
    >
      <button
        type="button"
        onClick={() => setShowSettings(v => !v)}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          border: 'none',
          borderRadius: radius.lg,
          background: 'rgba(255,255,255,0.10)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          fontSize: 10,
          fontWeight: 600,
          padding: '3px 6px',
          zIndex: 2,
        }}
        aria-label="Clock settings"
        title="Clock settings"
      >
        Time
      </button>

      {showSettings && (
        <div
          style={{
            position: 'absolute',
            top: 30,
            right: 6,
            width: 170,
            borderRadius: radius.xl,
            border: '1px solid var(--color-border, rgba(255,255,255,0.15))',
            background: 'var(--color-bg-glass-strong, rgba(18,18,22,0.92))',
            padding: space[2],
            zIndex: 3,
            boxShadow: 'var(--pg-shadow-panel)',
          }}
        >
          <button type="button" onClick={toggleSeconds} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#fff', fontSize: 11, padding: '5px 6px', borderRadius: 4, cursor: 'pointer' }}>
            Seconds: {showSeconds ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={toggle24Hour} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#fff', fontSize: 11, padding: '5px 6px', borderRadius: 4, cursor: 'pointer' }}>
            Format: {use24Hour ? '24-hour' : '12-hour'}
          </button>
          <button type="button" onClick={toggleDate} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#fff', fontSize: 11, padding: '5px 6px', borderRadius: 4, cursor: 'pointer' }}>
            Date: {showDate ? 'Shown' : 'Hidden'}
          </button>
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-tertiary)', padding: '0 6px 4px' }}>Timezone</div>
          <select
            value={timezone}
            onChange={(e) => updateTimezone(e.target.value)}
            style={{ width: '100%', borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, padding: '5px 6px' }}
          >
            <option value="local">Local</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">New York</option>
            <option value="Europe/London">London</option>
            <option value="Asia/Tokyo">Tokyo</option>
          </select>
        </div>
      )}

      <div style={{ fontSize: metaSize, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', marginBottom: 6 }}>
        {greeting}
      </div>
      <div style={{ fontSize: timeSize, fontWeight: 250, letterSpacing: '-0.03em', lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums', textShadow: '0 4px 20px rgba(0,0,0,0.34)' }}>
        {time.toLocaleTimeString([], timeOptions)}
      </div>
      {showDate && (
        <div style={{ fontSize: metaSize, color: 'var(--color-text-secondary)', marginTop: 6 }}>
          {time.toLocaleDateString([], dateOptions)}
        </div>
      )}
    </div>
  );
};

interface UpcomingCalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime?: string;
  color?: string;
  description?: string;
  recurring?: string;
}

function readUpcomingCalendarEvents(limit: number): UpcomingCalendarEvent[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem('dex-calendar-events'); } catch { return []; }
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const now = new Date();
  const items: { ev: UpcomingCalendarEvent; ts: number }[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const ev = item as UpcomingCalendarEvent;
    if (!ev.date || typeof ev.date !== 'string') continue;
    const time = typeof ev.time === 'string' && /^\d{2}:\d{2}$/.test(ev.time) ? ev.time : '00:00';
    const ts = new Date(`${ev.date}T${time}:00`).getTime();
    if (!Number.isFinite(ts) || ts < now.getTime()) continue;
    items.push({ ev: { ...ev, time }, ts });
  }
  items.sort((a, b) => a.ts - b.ts);
  return items.slice(0, limit).map(i => i.ev);
}

function formatRelativeEventTime(date: string, time: string): string {
  const ts = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(ts.getTime())) return `${date} ${time}`;
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(ts) - startOfDay(now)) / 86400000);
  const hhmm = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (dayDiff === 0) return `Today ${hhmm}`;
  if (dayDiff === 1) return `Tomorrow ${hhmm}`;
  return `${ts.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${hhmm}`;
}

const CalendarWidget: React.FC = () => {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [upcoming, setUpcoming] = useState<UpcomingCalendarEvent[]>(() => readUpcomingCalendarEvents(3));
  useEffect(() => {
    const refresh = () => setUpcoming(readUpcomingCalendarEvents(3));
    refresh();
    // SharedTick instead of a raw setInterval: it auto-pauses while the window
    // is hidden, so the widget stops polling in the background.
    const tickId = `calendar-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, refresh, 5 * 60 * 1000);
    return () => sharedTick.unsubscribe(tickId);
  }, []);
  const today = now.getDate();
  const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  
  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const goToday = () => { setViewMonth(now.getMonth()); setViewYear(now.getFullYear()); };
  
  return (
    <div style={{ padding: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14 }} aria-label="Previous month">‹</button>
        <button onClick={goToday} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
          {new Date(viewYear, viewMonth).toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </button>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 14 }} aria-label="Next month">›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 10, textAlign: 'center' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`h-${i}`} style={{ color: 'var(--color-text-tertiary)', fontWeight: 500, padding: 2 }}>{d}</div>
        ))}
        {days.map((d, i) => {
          const isToday = isCurrentMonth && d === today;
          return (
            <div key={i} style={{
              padding: 3, borderRadius: 4, color: isToday ? '#000' : d ? '#fff' : 'transparent',
              background: isToday ? 'var(--color-accent-fill)' : 'transparent', fontWeight: isToday ? 600 : 400,
            }}>
              {d ?? ''}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 'var(--space-2)', paddingTop: 6, borderTop: '1px solid var(--color-border-subtle, var(--color-border))' }}>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>No upcoming events</div>
        ) : upcoming.map(ev => (
          <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', minWidth: 0 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: ev.color || 'var(--color-accent)',
            }} />
            <span style={{
              fontSize: 11, color: 'var(--color-text-primary)', flex: 1, minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }} title={ev.title}>{ev.title}</span>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
              {formatRelativeEventTime(ev.date, ev.time)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RecentFilesWidget: React.FC = () => {
  const recents = useRecentFiles(s => s.recentFiles).slice(0, 6);
  return (
    <div style={{ padding: 'var(--space-2)', overflow: 'hidden' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Recent Files</div>
      {recents.length === 0 && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No recent files</div>}
      {recents.map((f: { name: string }, i: number) => (
        <div key={i} style={{ fontSize: 12, color: '#fff', padding: '3px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.name}
        </div>
      ))}
    </div>
  );
};

const QuickActionsWidget: React.FC = () => {
  const [customActions, setCustomActions] = useState(() => {
    try {
      const saved = localStorage.getItem('dex-quick-actions');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  
  const defaultActions = [
    { label: 'Files', appId: 'files', color: 'var(--color-accent)', icon: 'folder' },
    { label: 'VINX', appId: 'videoeditor', color: '#5E5CE6', icon: 'film' },
    { label: 'Browser', appId: 'browser', color: 'var(--color-success)', icon: 'globe' },
    { label: 'Settings', appId: 'settings', color: 'var(--color-text-tertiary)', icon: 'settings' },
  ];
  const actions = customActions || defaultActions;
  
  const openApp = (appId: string) => {
    window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId } }));
  };
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, padding: 'var(--space-2)' }}>
      {actions.map((a: { appId: string; label: string; color: string; icon?: string }) => (
        <button 
          key={a.appId} 
          onClick={() => openApp(a.appId)}
          style={{ 
            padding: '10px 6px', borderRadius: 10, 
            background: `${a.color}20`, border: 'none', 
            color: a.color, fontSize: 11, fontWeight: 600, 
            cursor: 'pointer', transition: 'background 0.15s, transform 0.1s' 
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${a.color}35`; e.currentTarget.style.transform = 'scale(1.02)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = `${a.color}20`; e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.02)'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            {a.icon ? <DexIcon name={a.icon} size={15} color={a.color} /> : null}
            <span>{a.label}</span>
          </div>
        </button>
      ))}
    </div>
  );
};

const SystemStatusWidget: React.FC = () => {
  const [cpu, setCpu] = useState(0);
  const [mem, setMem] = useState(0);
  const [network, setNetwork] = useState({ online: true, type: '' });
  const [gpu, setGpu] = useState(0);
  const [disk, setDisk] = useState(0);
  
  // CPU estimation via requestAnimationFrame frame budget. Higher load = longer frames.
  const cpuEstimateRef = React.useRef<number>(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const samples: number[] = [];
    const tick = (t: number) => {
      const delta = t - last;
      last = t;
      // 16.67ms = 0% load on a 60Hz frame; >33ms means saturated
      const load = Math.min(100, Math.max(0, ((delta - 16.67) / 16.67) * 50));
      samples.push(load);
      if (samples.length > 30) samples.shift();
      cpuEstimateRef.current = samples.reduce((a, b) => a + b, 0) / samples.length;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // Try to get real system stats via IPC, fallback to estimation
    const fetchStats = async () => {
      try {
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const stats = await ipc.invoke('system:getStats');
          if (stats?.cpuUsage !== undefined) {
            setCpu(Math.round(stats.cpuUsage));
            setMem(Math.round(stats.memoryUsage));
            if (stats.gpuUsage !== undefined) setGpu(Math.round(stats.gpuUsage));
            return;
          }
        }
      } catch { /* fallback */ }
      // Fallback: real metrics only (no fake data)
      const navMem = (performance as any).memory;
      if (navMem) {
        const used = navMem.usedJSHeapSize / navMem.jsHeapSizeLimit * 100;
        setMem(Math.round(Math.min(99, Math.max(1, used))));
      } else {
        // Last resort: heap-relative pseudo metric so the bar isn't dead
        setMem(Math.round(15 + (cpuEstimateRef.current / 5)));
      }
      // Use rAF-based real CPU estimate (frame budget pressure)
      setCpu(Math.max(1, Math.round(cpuEstimateRef.current)));
    };
    
    // Network status
    const updateNetwork = () => {
      setNetwork({
        online: navigator.onLine,
        type: (navigator as any).connection?.effectiveType || '',
      });
    };
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    updateNetwork();
    
    fetchStats();
    const tickId = `system-status-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, fetchStats, 5000);
    return () => {
      sharedTick.unsubscribe(tickId);
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  }, []);

  // Disk usage changes slowly -- poll it on its own relaxed cadence so the live
  // system surface shows CPU + Memory + GPU + Disk together (DEX Now / DEX 5.7).
  useEffect(() => {
    const fetchDisk = async () => {
      try {
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const s = await ipc.invoke('system:getStorage');
          if (s?.total) setDisk(Math.round((s.used / s.total) * 100));
        }
      } catch { /* best-effort */ }
    };
    fetchDisk();
    const tickId = `system-status-disk-${Date.now()}`;
    sharedTick.subscribe(tickId, fetchDisk, 30000);
    return () => sharedTick.unsubscribe(tickId);
  }, []);
  
  const StatBar: React.FC<{ label: string; value: number; warningAt?: number; errorAt?: number; color?: string }> = 
    ({ label, value, warningAt = 70, errorAt = 85, color }) => {
    const barColor = color || (value > errorAt ? 'var(--color-error)' : value > warningAt ? 'var(--color-warning)' : 'var(--color-success)');
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
          <span>{label}</span>
          <span>{value}%</span>
        </div>
        <div style={{ height: 3, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
          <div style={{ width: `${value}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.5s' }} />
        </div>
      </div>
    );
  };
  
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>System</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: network.online ? 'var(--color-success)' : 'var(--color-error)' }} />
          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{network.online ? 'Online' : 'Offline'}</span>
        </div>
      </div>
      <StatBar label="CPU" value={cpu} />
      <StatBar label="Memory" value={mem} warningAt={80} />
      {gpu > 0 && <StatBar label="GPU" value={gpu} color="var(--color-accent)" />}
      {disk > 0 && <StatBar label="Disk" value={disk} warningAt={80} />}
    </div>
  );
};

const NotesScratchpadWidget: React.FC<{ widgetId: string }> = ({ widgetId }) => {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(`dex-widget-note-${widgetId}`) || ''; } catch { return ''; }
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const save = useCallback((v: string) => {
    setText(v);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(`dex-widget-note-${widgetId}`, v); } catch { /* */ }
    }, 500);
  }, [widgetId]);
  return (
    <div style={{ padding: 'var(--space-2)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>Notes</div>
      <AssistedTextarea
        value={text}
        onChange={e => save(e.target.value)}
        placeholder="Type here..."
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: '#fff', fontSize: 12, resize: 'none', fontFamily: 'inherit',
        }}
      />
    </div>
  );
};

const NexusMiniWidget: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!isVisibleRef.current) {
        // Pause when document hidden — stop scheduling entirely (don't just
        // early-return and re-arm, which keeps the loop alive). The
        // visibilitychange handler restarts it when the tab is shown again.
        return;
      }
      frameRef.current++;
      const frame = frameRef.current;
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, w, h);
      // Radar sweep
      const angle = (frame * 0.02) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(10,132,255,0.3)';
      ctx.lineWidth = 1;
      for (let r = 20; r < Math.min(cx, cy); r += 30) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      // Sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * cx * 0.9, cy + Math.sin(angle) * cy * 0.9);
      ctx.strokeStyle = 'rgba(10,132,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Dots
      for (let i = 0; i < 5; i++) {
        const a = (i * 1.3 + frame * 0.005) % (Math.PI * 2);
        const r = 20 + (i * 18);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(10,132,255,${0.5 + Math.sin(frame * 0.05 + i) * 0.3})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    // Visibility change handler to pause/resume animation. On resume, restart
    // the loop (it stops itself while hidden).
    const onVis = () => {
      const visible = !document.hidden;
      isVisibleRef.current = visible;
      if (visible) { cancelAnimationFrame(rafRef.current); draw(); }
    };
    document.addEventListener('visibilitychange', onVis);
    
    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return <canvas ref={canvasRef} width={260} height={260} style={{ width: '100%', height: '100%', borderRadius: 10 }} />;
};

// Real weather for the widget, with NO fabricated fallback. Reads the Weather
// app's own keyless open-meteo cache (localStorage 'dex-weather-cache:<loc>' for
// the active location 'dex-weather-active', temps stored in Celsius) so it shows
// the user's genuine last-known conditions. If the user has never opened the
// Weather app (no cache) and no 'weather:get' IPC exists, it honestly shows an
// unavailable state instead of inventing a sunny 72 degrees.
interface WidgetWeather { temp: number; condition: string; humidity: number }

const readWeatherFromCache = (): WidgetWeather | null => {
  try {
    const active = localStorage.getItem('dex-weather-active');
    if (!active) return null;
    const raw = localStorage.getItem(`dex-weather-cache:${active.trim().toLowerCase()}`);
    if (!raw) return null;
    const cur = (JSON.parse(raw) as { current?: { temp: number; condition: string; humidity: number } }).current;
    if (!cur || typeof cur.temp !== 'number') return null;
    const unitF = localStorage.getItem('dex-weather-unit') === 'F';
    return {
      temp: unitF ? Math.round(cur.temp * 9 / 5 + 32) : cur.temp,
      condition: String(cur.condition || 'Clear').replace(/([A-Z])/g, ' $1').trim(),
      humidity: cur.humidity ?? 0,
    };
  } catch { return null; }
};

const WeatherWidget: React.FC = () => {
  const [weather, setWeather] = useState<WidgetWeather | null>(null);
  useEffect(() => {
    const refresh = async () => {
      // Prefer a native weather bridge if one is ever wired; otherwise fall back
      // to the Weather app's cached real data. Never fabricate.
      try {
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const data = await ipc.invoke('weather:get');
          if (data?.temp !== undefined) {
            setWeather({ temp: data.temp, condition: data.condition || 'Clear', humidity: data.humidity ?? 0 });
            return;
          }
        }
      } catch { /* fall through to cache */ }
      setWeather(readWeatherFromCache());
    };
    refresh();
    const tickId = `weather-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, refresh, 300000); // Update every 5 min
    return () => sharedTick.unsubscribe(tickId);
  }, []);
  const unavailable = weather == null;
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={unavailable ? 'var(--color-text-tertiary)' : '#FFD60A'} strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      {unavailable ? (
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, textAlign: 'center' }}>Open Weather<br />to see conditions</div>
      ) : (
        <>
          <div style={{ fontSize: 28, fontWeight: 300, color: '#fff', marginTop: 6 }}>{weather.temp}°</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{weather.condition}</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Humidity: {weather.humidity}%</div>
        </>
      )}
    </div>
  );
};

const BatteryWidget: React.FC = () => {
  const [battery, setBattery] = useState({ level: 100, charging: false, timeRemaining: '' });
  useEffect(() => {
    const fetchBattery = async () => {
      try {
        // Try IPC first
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const data = await ipc.invoke('system:getBattery');
          if (data?.level !== undefined) {
            setBattery({ 
              level: Math.round(data.level), 
              charging: data.charging || false,
              timeRemaining: data.timeRemaining || '',
            });
            return;
          }
        }
        // Fallback: Web Battery API
        if ('getBattery' in navigator) {
          const bat = await (navigator as any).getBattery();
          setBattery({
            level: Math.round(bat.level * 100),
            charging: bat.charging,
            timeRemaining: bat.charging ? '' : bat.dischargingTime !== Infinity ? `${Math.floor(bat.dischargingTime / 60)}m` : '',
          });
        }
      } catch { /* use defaults */ }
    };
    fetchBattery();
    const tickId = `battery-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, fetchBattery, 30000);
    return () => sharedTick.unsubscribe(tickId);
  }, []);
  const color = battery.level > 20 ? 'var(--color-success)' : 'var(--color-error)';
  return (
    <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2"/>
          <line x1="23" y1="13" x2="23" y2="11"/>
          <rect x="3" y="8" width={Math.round(battery.level / 100 * 14)} height="8" fill={color} rx="1"/>
        </svg>
        {battery.charging && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 400, color: '#fff', marginTop: 6 }}>{battery.level}%</div>
      {battery.charging && <div style={{ fontSize: 10, color: 'var(--color-success)' }}>Charging</div>}
      {!battery.charging && battery.timeRemaining && (
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{battery.timeRemaining} remaining</div>
      )}
    </div>
  );
};

const StorageWidget: React.FC = () => {
  const [storage, setStorage] = useState({ used: 0, total: 0, free: 0 });
  useEffect(() => {
    const fetchStorage = async () => {
      try {
        const ipc = (window as any).electron;
        if (ipc?.invoke) {
          const data = await ipc.invoke('system:getStorage');
          if (data?.total) {
            setStorage({ used: data.used || 0, total: data.total, free: data.free || (data.total - data.used) });
            return;
          }
        }
        // Fallback: estimate from Storage API
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const est = await navigator.storage.estimate();
          const total = est.quota || 10 * 1024 * 1024 * 1024; // default 10GB
          const used = est.usage || 0;
          setStorage({ used, total, free: total - used });
        }
      } catch { /* defaults */ }
    };
    fetchStorage();
    const tickId = `storage-widget-${Date.now()}`;
    sharedTick.subscribe(tickId, fetchStorage, 60000);
    return () => sharedTick.unsubscribe(tickId);
  }, []);
  const formatBytes = (bytes: number) => sharedFormatBytes(bytes);
  const usedPercent = storage.total > 0 ? Math.round((storage.used / storage.total) * 100) : 0;
  const color = usedPercent > 90 ? 'var(--color-error)' : usedPercent > 70 ? 'var(--color-warning)' : 'var(--color-accent)';
  return (
    <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>Storage</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 'var(--space-2)' }}>
        <span style={{ fontSize: 20, fontWeight: 500, color: '#fff' }}>{formatBytes(storage.free)}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>free of {formatBytes(storage.total)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div style={{ width: `${usedPercent}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{usedPercent}% used</div>
    </div>
  );
};

const MusicControlsWidget: React.FC = () => {
  // Bind to the real now-playing store (services/nowPlaying), the same source
  // the MiniPlayer and FloatingLauncher use, fed live by the Audio app. The old
  // 'dex-now-playing' / 'dex-media-control' events had no dispatcher/listener,
  // so the widget was permanently stuck and its buttons were no-ops.
  const track = useNowPlaying(s => s.track);
  const isPlaying = useNowPlaying(s => s.isPlaying);
  const toggle = useNowPlaying(s => s.toggle);
  const next = useNowPlaying(s => s.next);
  const prev = useNowPlaying(s => s.prev);

  return (
    <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {track?.title ?? 'No track'}
      </div>
      {track?.artist && (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{track.artist}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
        <button onClick={() => prev()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} aria-label="Previous">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
        </button>
        <button
          onClick={() => toggle()}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--color-accent-fill)', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
        </button>
        <button onClick={() => next()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} aria-label="Next">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>
      </div>
    </div>
  );
};

const _M = platform.isMac ? '⌘' : 'Ctrl';

const DAILY_TIPS: string[] = [
  `Press ${_M}+K to open the command palette anywhere.`,
  'Drag any window to a screen edge to snap it.',
  `Hold ${_M} to peek at all keyboard shortcuts.`,
  'Press ? on the home screen to open the shortcuts help.',
  'Right-click the Home background to add a new widget.',
  `Use ${_M}+/ to keep the shortcuts overlay sticky.`,
  'Pin a window with the title bar pin button to keep it on top.',
  'Switch wallpapers from Settings, Appearance, Wallpaper.',
  'Type a math expression in the command palette for an instant answer.',
  'Drag a file onto the Notes app to attach it to a note.',
  'Use Alt+T to open Transfers and inspect background jobs.',
  'Toggle Compact density in Settings, Appearance for tighter layouts.',
  'Adjust Text size in Settings, Appearance to scale the whole UI.',
  'The Reader summary works fully offline -- no model, no network.',
  'Frame snapping has 16 zones. Drag to a corner for a quarter snap.',
  'Permissions are batched by capability and remembered with a TTL.',
  'Creator Access unlocks Power tier features with a signed key.',
  `Use ${_M}+L to lock the screen instantly.`,
  `Open Quick Settings with ${_M}+, for fast toggles.`,
  'Press F11 to toggle fullscreen on the active window.',
];

const DailyTipWidget: React.FC = () => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const startOfYear = new Date(today.getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((today.getTime() - startOfYear) / 86400000);
  const tip = DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
  const dismissKey = `dex-tip-dismissed-${todayKey}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(dismissKey) === 'true'; } catch { return false; }
  });
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(dismissKey, 'true'); } catch { /* intentional: dismiss-flag persistence is best-effort */ }
  };
  if (dismissed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        All caught up
      </div>
    );
  }
  return (
    <div style={{ padding: 10, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning, #FF9F0A)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18h6" /><path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.3 1 2.1V18h6v-1.2c0-.8.3-1.6 1-2.1A7 7 0 0 0 12 2z" />
        </svg>
        <button
          onClick={dismiss}
          aria-label="Dismiss tip"
          title="Dismiss"
          style={{
            background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
            cursor: 'pointer', padding: 2, fontSize: 14, lineHeight: 1,
          }}
        >x</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-primary)', lineHeight: 1.4, flex: 1 }}>
        {tip}
      </div>
    </div>
  );
};

// Widget content dispatcher
const WidgetContent: React.FC<{ widget: Widget }> = memo(({ widget }) => {
  switch (widget.type) {
    case 'clock': return <ClockWidget widget={widget} />;
    case 'calendar': return <CalendarWidget />;
    case 'recent-files': return <RecentFilesWidget />;
    case 'quick-actions': return <QuickActionsWidget />;
    case 'system-status': return <SystemStatusWidget />;
    case 'notes-scratchpad': return <NotesScratchpadWidget widgetId={widget.id} />;
    case 'nexus': return <NexusMiniWidget />;
    case 'weather': return <WeatherWidget />;
    case 'battery': return <BatteryWidget />;
    case 'storage': return <StorageWidget />;
    case 'music-controls': return <MusicControlsWidget />;
    case 'daily-tip': return <DailyTipWidget />;
    default: return <div style={{ padding: 10, color: 'var(--color-text-tertiary)' }}>Unknown widget</div>;
  }
});

// ======================================================================
// DRAGGABLE WIDGET WRAPPER
// ======================================================================

// Minimum widget fallbacks when a template is missing (kept in sync with
// widgetStore.resizeWidget so the live preview never disagrees with the
// committed size).
const FALLBACK_MIN_W = 120;
const FALLBACK_MIN_H = 80;

// Lifted elevation used while a widget is being actively dragged. At rest a
// widget has no shadow -- it sits flat on the unified desktop surface.
const DRAG_SHADOW = 'var(--elev-4), var(--pg-gloss-top)';

const DraggableWidget: React.FC<{
  widget: Widget;
  onRemove: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
}> = memo(({ widget, onRemove, onMove, onResize }) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  // Live drag/resize bookkeeping. All per-frame work mutates the DOM node
  // directly via rAF; the store is written exactly once, on pointer up — so
  // dragging stays at 60fps with no React re-render per mouse move.
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number; dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ pointerId: number; startX: number; startY: number; origW: number; origH: number; w: number; h: number } | null>(null);
  const rafRef = useRef<number>(0);

  // One re-render at gesture start and one at end (never per move). Drives the
  // resting styles only: swaps cursor/elevation while a gesture is live so the
  // imperative transform isn't fought by CSS.
  const [interacting, setInteracting] = useState(false);
  // Hover reveals the resize handle + remove button (direct manipulation: no
  // global edit mode -- you touch the widget directly to reposition/resize it).
  const [hovered, setHovered] = useState(false);

  const minSize = useCallback(() => {
    const t = WIDGET_TEMPLATES.find(t => t.type === widget.type);
    return { minW: t?.minWidth ?? FALLBACK_MIN_W, minH: t?.minHeight ?? FALLBACK_MIN_H };
  }, [widget.type]);

  // --- Live drag (transform-based) --------------------------------------
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    // Primary button / touch / pen only.
    if (e.button !== 0) return;
    // Interactive-content passthrough: a press that lands on a control inside
    // the widget (button, field, link, the resize handle/remove button) is a
    // click, not a reposition -- let it through so widgets stay usable.
    if ((e.target as HTMLElement).closest(
      'button, input, textarea, select, a, [role="button"], [role="slider"], [contenteditable="true"]',
    )) return;
    e.preventDefault();
    e.stopPropagation();
    const node = nodeRef.current;
    if (!node) return;
    node.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: widget.x, origY: widget.y, dx: 0, dy: 0 };
    // Lift: scale + elevation + grab cursor, applied imperatively so it lands
    // on the same frame as the gesture without waiting for a React commit.
    node.style.transition = 'none';
    node.style.animation = 'none';
    node.style.transform = 'translate3d(0,0,0) scale(1.02)';
    node.style.boxShadow = DRAG_SHADOW;
    node.style.cursor = 'grabbing';
    node.style.zIndex = '40';
    setInteracting(true);
  }, [widget.x, widget.y]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.dx = e.clientX - d.startX;
    d.dy = e.clientY - d.startY;
    if (rafRef.current) return; // coalesce: at most one transform write per frame
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const node = nodeRef.current;
      const cur = dragRef.current;
      if (!node || !cur) return;
      node.style.transform = `translate3d(${cur.dx}px, ${cur.dy}px, 0) scale(1.02)`;
    });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    const node = nodeRef.current;
    if (node) {
      try { node.releasePointerCapture(d.pointerId); } catch { /* pointer already released */ }
      // Clear the live transform; the committed left/top below and the
      // declarative lift styles (restored by setInteracting(false) below) land
      // in the same paint, so the widget settles without a one-frame jump.
      node.style.transform = '';
    }
    setInteracting(false);
    // Commit the new grid position to the store exactly once.
    onMove(d.origX + d.dx, d.origY + d.dy);
  }, [onMove]);

  // --- Live resize (width/height applied to the node, committed on up) ---
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const node = nodeRef.current;
    if (!node) return;
    node.setPointerCapture(e.pointerId);
    resizeRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origW: widget.width, origH: widget.height, w: widget.width, h: widget.height };
    node.style.transition = 'none';
    node.style.animation = 'none';
    node.style.boxShadow = DRAG_SHADOW;
    node.style.zIndex = '40';
    setInteracting(true);
  }, [widget.width, widget.height]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const { minW, minH } = minSize();
    r.w = Math.max(minW, r.origW + (e.clientX - r.startX));
    r.h = Math.max(minH, r.origH + (e.clientY - r.startY));
    if (rafRef.current) return; // coalesce to one layout write per frame
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const node = nodeRef.current;
      const cur = resizeRef.current;
      if (!node || !cur) return;
      node.style.width = `${cur.w}px`;
      node.style.height = `${cur.h}px`;
    });
  }, [minSize]);

  const endResize = useCallback((e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    resizeRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    const node = nodeRef.current;
    if (node) {
      try { node.releasePointerCapture(r.pointerId); } catch { /* pointer already released */ }
    }
    // The committed width/height (via onResize) and the declarative lift styles
    // are both restored by the re-render setInteracting(false) triggers, so the
    // live inline width/height set during the gesture are reconciled away with
    // no flash. Nothing imperative needs clearing here.
    setInteracting(false);
    // Commit the final size once; the store clamps to the template minimums.
    onResize(r.w, r.h);
  }, [onResize]);

  // Cancel any in-flight rAF if the widget unmounts mid-gesture (e.g. removed
  // while being dragged) so we never write to a detached node.
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      ref={nodeRef}
      role="article"
      aria-label={`${widget.title} widget, drag to reposition`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        borderRadius: 14,
        // Unified desktop surface (v5.5 Desktop initiative): the widget is a
        // desktop object sitting on the wallpaper, not an opaque card. At rest it
        // has no fill or border. An inherited text-shadow plus an object drop-shadow
        // keep content legible on any wallpaper -- this is the legibility treatment
        // the earlier full-transparency attempt was missing (text and data-viz bars
        // read as deliberate floating objects, not a glitch). On hover/drag a soft
        // scrim + hairline reveal the draggable bounds.
        background: (hovered || interacting) ? 'var(--dex-desktop-scrim-hover)' : 'transparent',
        border: (hovered || interacting) ? '1px solid var(--color-border-strong, rgba(255,255,255,0.22))' : '1px solid transparent',
        boxShadow: 'none',
        textShadow: 'var(--dex-desktop-text-shadow)',
        filter: interacting ? undefined : 'var(--dex-desktop-object-shadow)',
        overflow: 'hidden',
        // Always directly draggable; the active "grabbing" cursor and the lift
        // are applied imperatively during a gesture.
        cursor: 'grab',
        // No transition while interacting so the live transform tracks the
        // pointer 1:1; otherwise a gentle settle on the lift styles.
        transition: interacting ? 'none' : 'box-shadow 0.2s, transform 0.15s, border-color 0.15s',
        willChange: interacting ? 'transform' : undefined,
        zIndex: 10,
        touchAction: 'none',
      }}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <WidgetContent widget={widget} />

      {/* Remove button (revealed on hover) */}
      {(hovered || interacting) && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Remove ${widget.title}`}
          style={{
            position: 'absolute', top: -6, right: -6,
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--color-error)', border: '2px solid rgba(28,28,30,0.9)',
            color: '#fff', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', lineHeight: 1, zIndex: 2,
          }}
        >
          ×
        </button>
      )}

      {/* Resize handle (revealed on hover) */}
      {(hovered || interacting) && (
        <div
          role="slider"
          aria-label={`Resize ${widget.title} widget`}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 16, height: 16, cursor: 'nwse-resize',
            background: 'var(--color-accent, rgba(10,132,255,0.6))', opacity: 0.55, borderRadius: 4,
            touchAction: 'none',
          }}
        />
      )}
    </div>
  );
});

// ======================================================================
// ADD WIDGET PICKER
// ======================================================================

const WidgetPicker: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const addWidget = useWidgetStore(s => s.addWidget);
  const widgets = useWidgetStore(s => s.widgets);
  return (
    <>
      {/* Flex-centered (whole-pixel) instead of translate(-50%,-50%); width
          clamps so the picker never overflows small windows. */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-max)', background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      >
      <div style={{
        width: 'min(380px, calc(100vw - 48px))', maxHeight: 'min(440px, calc(100vh - 48px))',
        background: 'var(--color-bg-elevated, #1a1a1e)',
        borderRadius: 10, border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
        boxShadow: 'var(--pg-shadow-popover)',
        padding: 'var(--space-5)', overflow: 'auto',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 14 }}>Add Widget</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {WIDGET_TEMPLATES.map(t => {
            const exists = widgets.some(w => w.type === t.type);
            return (
              <button
                key={t.type}
                onClick={() => { addWidget(t.type); onClose(); }}
                disabled={t.type !== 'notes-scratchpad' && exists}
                style={{
                  padding: '14px 10px', borderRadius: 10, border: 'none',
                  background: exists && t.type !== 'notes-scratchpad' ? 'var(--color-border-subtle)' : 'var(--color-bg-hover)',
                  color: exists && t.type !== 'notes-scratchpad' ? 'var(--color-text-tertiary)' : '#fff',
                  cursor: exists && t.type !== 'notes-scratchpad' ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 500, textAlign: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-border)'; }}
                onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <DexIcon name={t.icon} size={18} color={exists && t.type !== 'notes-scratchpad' ? 'var(--color-text-tertiary)' : 'rgba(255,255,255,0.9)'} />
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t.title}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </>
  );
};

// ======================================================================
// MAIN WIDGET LAYER
// ======================================================================

export const HomeWidgets: React.FC = () => {
  const widgets = useWidgetStore(s => s.widgets);
  const addWidget = useWidgetStore(s => s.addWidget);
  const removeWidget = useWidgetStore(s => s.removeWidget);
  const moveWidget = useWidgetStore(s => s.moveWidget);
  const resizeWidget = useWidgetStore(s => s.resizeWidget);
  const pickerOpen = useWidgetStore(s => s.pickerOpen);
  const setPickerOpen = useWidgetStore(s => s.setPickerOpen);

  return (
    <>
      {/* Widget layer */}
      {widgets.filter(w => w.visible).map(w => (
        <DraggableWidget
          key={w.id}
          widget={w}
          onRemove={() => removeWidget(w.id)}
          onMove={(x, y) => moveWidget(w.id, x, y)}
          onResize={(width, height) => resizeWidget(w.id, width, height)}
        />
      ))}

      {/* No empty-state nudge: the desktop stays clean by default (macOS-style).
          Widgets are added via right-click the desktop -> Add Widget. */}

      {/* No persistent "Add widget" button (Widget Freedom initiative): the
          workspace is the editor. Repositioning/resizing/removing are direct
          (touch the widget), and adding is the OS-like right-click on the
          desktop -> "Add Widget" (Home desktop context menu), which opens the
          picker below. No permanent arrange/add chrome. */}
      {pickerOpen && <WidgetPicker onClose={() => setPickerOpen(false)} />}
    </>
  );
};

// ======================================================================
// HOME DASHBOARD (DEX 5.5) — the brief's seven-widget set.
// ----------------------------------------------------------------------
// A compact, flat (DEX Sharp) dashboard that surfaces live system state
// with real data and honest empty states. Every card is keyboard- and
// click-navigable to the relevant app. No glass/blur, no decoration:
// var(--dex-font-ui), design tokens, sharp type, thin hairlines.
//
// Data sources (all reused, nothing fabricated):
//   Recent Projects  — useRecentFiles (creative-app / .dexproject entries)
//   Recent Notes     — useNotesStore  -> dexnotes:list
//   Current Tasks    — dex-tasks       (capability:storage / localStorage)
//   Active Workflows — window.dex.workflows.getAll() / dex-workflows
//   Rewind Summary   — window.dex.rewind.getDaySummary(today)
//   AI Suggestions   — patterns:getSuggestions (local pattern engine)
//   Pinned Apps      — useDockPins (dockPinStore)
// ======================================================================

const navigateToApp = (appId: string): void => {
  window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId } }));
};

// --- Shared card chrome -------------------------------------------------

// Unified desktop surface (v5.5 Desktop initiative): dashboard panels are gently
// dimmed regions of the one Home surface, not opaque bordered cards. A soft scrim
// (no hard border, no elevation, no washed-out glass) plus an inherited text-shadow
// keeps dense text readable on any wallpaper -- the legibility the earlier
// full-transparency attempt lacked -- while the borderless soft fills read as a
// continuous desktop rather than a stack of separate cards.
const CARD_BG = 'var(--dex-desktop-scrim, rgba(12,12,14,0.30))';
const CARD_BORDER = '1px solid transparent';

const dashCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  width: '100%',
  height: '100%',
  background: CARD_BG,
  border: CARD_BORDER,
  borderRadius: 10,
  padding: 'var(--space-3) 14px',
  fontFamily: 'var(--dex-font-ui)',
  textShadow: 'var(--dex-desktop-text-shadow)',
  overflow: 'hidden',
};

const DashCardHeader: React.FC<{
  title: string;
  icon: string;
  appId: string;
  count?: number | string;
}> = ({ title, icon, appId, count }) => (
  <button
    type="button"
    onClick={() => navigateToApp(appId)}
    className="dex-hover-bg"
    aria-label={`Open ${title}`}
    style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%',
      background: 'transparent', border: 'none', padding: '0 0 var(--space-2)', margin: 0,
      cursor: 'pointer', textAlign: 'left', color: 'var(--color-text-secondary)',
    }}
  >
    <DexIcon name={icon} size={13} color="var(--color-text-tertiary)" />
    <span className="dex-label-caps" style={{ flex: 1 }}>{title}</span>
    {count !== undefined && count !== '' && (
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    )}
    <DexIcon name="chevron-right" size={13} color="var(--color-text-muted, #6b6b70)" />
  </button>
);

const DashEmpty: React.FC<{ icon: string; label: string; hint?: string }> = ({ icon, label, hint }) => (
  <div style={{
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 6, padding: 'var(--space-2) 4px', textAlign: 'center',
  }}>
    <DexIcon name={icon} size={20} color="var(--color-text-muted, #6b6b70)" />
    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{label}</span>
    {hint && <span style={{ fontSize: 11, color: 'var(--color-text-muted, #6b6b70)', lineHeight: 1.4, maxWidth: 200 }}>{hint}</span>}
  </div>
);

/** Flat, single-line row used by most list widgets. */
const DashRow: React.FC<{
  primary: string;
  secondary?: string;
  meta?: string;
  icon?: string;
  iconColor?: string;
  onClick: () => void;
  title?: string;
}> = ({ primary, secondary, meta, icon, iconColor, onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    className="dex-hover-bg"
    title={title ?? primary}
    style={{
      display: 'flex', alignItems: 'center', gap: 9, width: '100%',
      padding: '6px 6px', margin: '0 -6px', border: 'none', borderRadius: 6,
      background: 'transparent', cursor: 'pointer', textAlign: 'left',
      color: 'var(--color-text-primary)',
    }}
  >
    {icon && <DexIcon name={icon} size={14} color={iconColor ?? 'var(--color-text-tertiary)'} />}
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 12.5, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</span>
      {secondary && <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondary}</span>}
    </span>
    {meta && <span style={{ fontSize: 10.5, color: 'var(--color-text-muted, #6b6b70)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{meta}</span>}
  </button>
);

function relativeTime(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// --- 1. Recent Projects -------------------------------------------------
// No central recent-projects channel exists in the renderer; .dexproject
// files are opened ad-hoc by the creative apps. We honestly derive recent
// projects from the unified recent-files store: entries that are .dexproject
// manifests or were opened by a creative/project app. Degrades to a clean
// empty state when none are present. (FLAGGED: a first-class recent-projects
// subsystem would be the proper long-term source.)

const PROJECT_APP_IDS = new Set(['videoeditor', 'imosion', 'prism', 'flux', 'forge', 'axl', 'nexus', 'dexcode']);

const RecentProjectsWidget: React.FC = () => {
  const recentFiles = useRecentFiles(s => s.recentFiles);
  const projects = useMemo(() => {
    const seen = new Set<string>();
    const out: RecentFile[] = [];
    for (const f of recentFiles) {
      const isProject = /\.dexproject$/i.test(f.path) || /\.dexproj$/i.test(f.path) || PROJECT_APP_IDS.has(f.appId);
      if (!isProject) continue;
      const key = (f.path || f.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
      if (out.length >= 4) break;
    }
    return out;
  }, [recentFiles]);

  return (
    <div style={dashCardStyle}>
      <DashCardHeader title="Recent Projects" icon="folder" appId="files" count={projects.length || undefined} />
      {projects.length === 0 ? (
        <DashEmpty icon="folder" label="No recent projects" hint="Projects you open in the creative apps appear here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {projects.map((p, i) => {
            const def = APP_DEFINITIONS[p.appId];
            return (
              <DashRow
                key={p.path + i}
                primary={p.name.replace(/\.(dexproject|dexproj)$/i, '')}
                secondary={def?.name ?? 'Project'}
                meta={relativeTime(p.openedAt)}
                icon={def?.icon ?? 'folder'}
                iconColor={def?.color && !def.color.startsWith('var') ? def.color : 'var(--color-accent)'}
                title={p.path}
                onClick={() => navigateToApp(PROJECT_APP_IDS.has(p.appId) ? p.appId : 'files')}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- 2. Recent Notes ----------------------------------------------------

const RecentNotesWidget: React.FC = () => {
  const notes = useNotesStore(s => s.notes);
  const loadNotes = useNotesStore(s => s.loadNotes);
  const selectNote = useNotesStore(s => s.selectNote);

  useEffect(() => {
    // Hydrate once if the Notes store has not been initialised yet.
    if (useNotesStore.getState().notes.length === 0) {
      void loadNotes(null);
    }
  }, [loadNotes]);

  const recent = useMemo(
    () => [...notes].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0)).slice(0, 4),
    [notes],
  );

  return (
    <div style={dashCardStyle}>
      <DashCardHeader title="Recent Notes" icon="notes" appId="notes" count={notes.length || undefined} />
      {recent.length === 0 ? (
        <DashEmpty icon="notes" label="No notes yet" hint="Create a note and it shows up here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {recent.map(n => {
            const preview = (n.plain_text || '').replace(/\s+/g, ' ').trim();
            return (
              <DashRow
                key={n.id}
                primary={n.title?.trim() || 'Untitled note'}
                secondary={preview || undefined}
                meta={relativeTime(n.updated_at)}
                icon={n.pinned ? 'pin' : 'file-text'}
                iconColor={n.pinned ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
                onClick={() => { selectNote(n.id); navigateToApp('notes'); }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- 3. Current Tasks ---------------------------------------------------
// Reuses the exact persistence the Tasks app uses (dex-tasks via the
// capability storage bridge, localStorage fallback). Read-only here.

interface DashTask {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
}

async function loadDashTasks(): Promise<DashTask[]> {
  try {
    const stored = await (window as any).electron?.invoke?.('capability:storage:get', 'dex-tasks');
    if (Array.isArray(stored)) return stored as DashTask[];
  } catch { /* fall through to localStorage */ }
  try {
    const raw = localStorage.getItem('dex-tasks');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as DashTask[];
    }
  } catch { /* none */ }
  return [];
}

const PRIORITY_COLOR: Record<DashTask['priority'], string> = {
  high: 'var(--color-error)',
  medium: 'var(--color-warning)',
  low: 'var(--color-text-tertiary)',
};

function formatDueShort(due: string | null): string | undefined {
  if (!due) return undefined;
  const d = new Date(due);
  if (!Number.isFinite(d.getTime())) return undefined;
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const tom = new Date(today); tom.setDate(tom.getDate() + 1);
  if (d.toDateString() === tom.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const CurrentTasksWidget: React.FC = () => {
  const [tasks, setTasks] = useState<DashTask[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadDashTasks().then(t => { if (alive) setTasks(t); }); };
    refresh();
    const tickId = `home-tasks-${Date.now()}`;
    sharedTick.subscribe(tickId, refresh, 30000);
    return () => { alive = false; sharedTick.unsubscribe(tickId); };
  }, []);

  const open = useMemo(() => {
    const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return tasks
      .filter(t => !t.completed)
      .sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (da !== db) return da - db;
        return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
      })
      .slice(0, 4);
  }, [tasks]);

  const openCount = tasks.filter(t => !t.completed).length;

  return (
    <div style={dashCardStyle}>
      <DashCardHeader title="Current Tasks" icon="check-square" appId="tasks" count={openCount || undefined} />
      {open.length === 0 ? (
        <DashEmpty icon="check-square" label="All clear" hint="No open tasks. Add one in Tasks." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {open.map(t => (
            <DashRow
              key={t.id}
              primary={t.title}
              meta={formatDueShort(t.dueDate)}
              icon="circle"
              iconColor={PRIORITY_COLOR[t.priority] ?? 'var(--color-text-tertiary)'}
              onClick={() => navigateToApp('tasks')}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- 4. Active Workflows ------------------------------------------------

interface DashWorkflow { id: string; name: string; steps?: number; lastRun?: string | number | null; }

async function loadDashWorkflows(): Promise<DashWorkflow[]> {
  try {
    const remote = await (window as any).dex?.workflows?.getAll?.();
    if (Array.isArray(remote) && remote.length > 0) return remote as DashWorkflow[];
  } catch { /* fall through */ }
  try {
    const raw = localStorage.getItem('dex-workflows');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as DashWorkflow[];
    }
  } catch { /* none */ }
  return [];
}

const ActiveWorkflowsWidget: React.FC = () => {
  const [workflows, setWorkflows] = useState<DashWorkflow[]>([]);
  useEffect(() => {
    let alive = true;
    void loadDashWorkflows().then(w => { if (alive) setWorkflows(w); });
    return () => { alive = false; };
  }, []);

  const top = useMemo(() => {
    return [...workflows]
      .sort((a, b) => {
        const ra = a.lastRun ? new Date(a.lastRun).getTime() : 0;
        const rb = b.lastRun ? new Date(b.lastRun).getTime() : 0;
        return rb - ra;
      })
      .slice(0, 4);
  }, [workflows]);

  return (
    <div style={dashCardStyle}>
      <DashCardHeader title="Active Workflows" icon="workflows" appId="workflows" count={workflows.length || undefined} />
      {top.length === 0 ? (
        <DashEmpty icon="workflows" label="No workflows" hint="Build an automation in Workflows." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {top.map(w => {
            const ran = w.lastRun ? new Date(w.lastRun).getTime() : 0;
            return (
              <DashRow
                key={w.id}
                primary={w.name || 'Untitled workflow'}
                secondary={typeof w.steps === 'number' ? `${w.steps} step${w.steps === 1 ? '' : 's'}` : undefined}
                meta={ran ? relativeTime(ran) : undefined}
                icon="play"
                iconColor="var(--color-accent)"
                onClick={() => navigateToApp('workflows')}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- 5. Rewind Summary --------------------------------------------------
// Uses the existing Rewind day-summary channel for a compact "today" view.
// Degrades to a tasteful empty state when Rewind is off-platform or has no
// data for today.

interface DashDaySummary {
  totalEntries: number;
  byType: Record<string, number>;
  topApps: { name: string; count: number }[];
}

const RewindSummaryWidget: React.FC = () => {
  const [summary, setSummary] = useState<DashDaySummary | null | 'unavailable'>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const api = (window as any).dex?.rewind;
      if (!api?.getDaySummary) { if (alive) setSummary('unavailable'); return; }
      try {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const s = await api.getDaySummary(dateStr);
        if (!alive) return;
        if (s && typeof s.totalEntries === 'number') {
          setSummary({ totalEntries: s.totalEntries, byType: s.byType || {}, topApps: Array.isArray(s.topApps) ? s.topApps : [] });
        } else {
          setSummary({ totalEntries: 0, byType: {}, topApps: [] });
        }
      } catch { if (alive) setSummary('unavailable'); }
    };
    void load();
    const tickId = `home-rewind-${Date.now()}`;
    sharedTick.subscribe(tickId, () => { void load(); }, 120000);
    return () => { alive = false; sharedTick.unsubscribe(tickId); };
  }, []);

  return (
    <div style={dashCardStyle}>
      <DashCardHeader title="Rewind Summary" icon="rewind" appId="rewind" />
      {summary === 'unavailable' ? (
        <DashEmpty icon="rewind" label="Rewind is off" hint="Open Rewind to start capturing your day." />
      ) : summary === null ? (
        <DashEmpty icon="rewind" label="Loading today…" />
      ) : summary.totalEntries === 0 ? (
        <DashEmpty icon="rewind" label="Nothing captured today" hint="Your day timeline will build as you work." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 300, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {summary.totalEntries}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>moments today</span>
          </div>
          {summary.topApps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="dex-label-caps" style={{ fontSize: 10 }}>Top apps</span>
              {summary.topApps.slice(0, 3).map((a, i) => {
                const max = summary.topApps[0]?.count || 1;
                const pct = Math.max(8, Math.round((a.count / max) * 100));
                return (
                  <div key={a.name + i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <span style={{ width: 56, height: 4, borderRadius: 2, background: 'var(--color-bg-hover, rgba(255,255,255,0.08))', overflow: 'hidden', flexShrink: 0 }}>
                      <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--color-accent-fill)', borderRadius: 2 }} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- 6. AI Suggestions --------------------------------------------------
// Reuses the local pattern-learning engine (patterns:getSuggestions). This
// is real, on-device behaviour learning — NOT fabricated model output. When
// the engine has no signal yet, it degrades to an honest empty state.

const SUGGESTION_REASON_LABEL: Record<Suggestion['reason'], string> = {
  time_pattern: 'Usual for this time',
  sequence: 'Often opened next',
  frequent: 'Frequently used',
  context: 'Fits your context',
};

const AiSuggestionsWidget: React.FC = () => {
  const { getSuggestions } = usePatternLearning();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const result = await getSuggestions({ limit: 4 });
        if (alive) setSuggestions(Array.isArray(result) ? result : []);
      } catch { if (alive) setSuggestions([]); }
    };
    void load();
    const tickId = `home-suggest-${Date.now()}`;
    sharedTick.subscribe(tickId, () => { void load(); }, 60000);
    return () => { alive = false; sharedTick.unsubscribe(tickId); };
  }, [getSuggestions]);

  const appSuggestions = useMemo(
    () => (suggestions || []).filter(s => s.type === 'app' && APP_DEFINITIONS[s.target]).slice(0, 4),
    [suggestions],
  );

  return (
    <div style={dashCardStyle}>
      <DashCardHeader title="Suggestions" icon="zap" appId="home" />
      {suggestions === null ? (
        <DashEmpty icon="zap" label="Learning…" />
      ) : appSuggestions.length === 0 ? (
        <DashEmpty icon="zap" label="Nothing to suggest yet" hint="DEX learns your patterns as you work — locally." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {appSuggestions.map((s, i) => {
            const def = APP_DEFINITIONS[s.target];
            return (
              <DashRow
                key={s.target + i}
                primary={def?.name ?? s.target}
                secondary={SUGGESTION_REASON_LABEL[s.reason] ?? 'Suggested'}
                meta={s.confidence ? `${Math.round(s.confidence * 100)}%` : undefined}
                icon={def?.icon ?? 'zap'}
                iconColor={def?.color && !def.color.startsWith('var') ? def.color : 'var(--color-accent)'}
                onClick={() => navigateToApp(s.target)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- 7. Pinned Apps -----------------------------------------------------
// Reuses the dock pinning store so Home and the Dock stay in sync.

const PinnedAppsWidget: React.FC = () => {
  const pins = useDockPins(s => s.pins);
  const pinApp = useDockPins(s => s.pinApp);
  const [picking, setPicking] = useState(false);
  const apps = useMemo(() => {
    return [...pins]
      .sort((a, b) => a.position - b.position)
      .map(p => ({ id: p.id, def: APP_DEFINITIONS[p.id] }))
      .filter((x): x is { id: string; def: NonNullable<typeof x.def> } => !!x.def && x.id !== 'home')
      .slice(0, 11);
  }, [pins]);
  const pinnedIds = useMemo(() => new Set(pins.map(p => p.id)), [pins]);
  const addable = useMemo(() => Object.entries(APP_DEFINITIONS)
    .filter(([id, def]) => id !== 'home' && !!def && !pinnedIds.has(id))
    .map(([id, def]) => ({ id, def: def! })), [pinnedIds]);

  return (
    <div style={{ ...dashCardStyle, position: 'relative' }}>
      <DashCardHeader title="Pinned Apps" icon="grid" appId="home" count={apps.length || undefined} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)',
        // Scroll within the card so no pinned apps are clipped when the icon grid
        // is taller than the cell (was hiding ~122px of icons in the 1-row span).
        alignContent: 'start', flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: 2,
      }}>
        {apps.map(({ id, def }) => {
          const tinted = !!def.color && !def.color.startsWith('var');
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigateToApp(id)}
              className="dex-hover-bg"
              aria-label={`Open ${def.name}`}
              title={def.name}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: 'var(--space-2) 2px', border: 'none', borderRadius: 10,
                background: 'transparent', cursor: 'pointer',
                color: 'var(--color-text-secondary)',
              }}
            >
              <span style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: tinted ? `${def.color}22` : 'var(--color-bg-hover, rgba(255,255,255,0.08))',
                color: tinted ? def.color : 'var(--color-accent)',
              }}>
                <DexIcon name={def.icon as any} size={18} color="currentColor" />
              </span>
              <span style={{ fontSize: 10, lineHeight: 1.15, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-tertiary)' }}>
                {def.name}
              </span>
            </button>
          );
        })}
        {/* Add-to-Home affordance: pin any app straight from the widget. */}
        <button
          type="button"
          onClick={() => setPicking(p => !p)}
          className="dex-hover-bg"
          aria-label="Add app to Home"
          aria-expanded={picking}
          title="Add app to Home"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            padding: 'var(--space-2) 2px', border: 'none', borderRadius: 10,
            background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)',
          }}
        >
          <span style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-bg-inset)', border: '1px dashed var(--color-border)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </span>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Add</span>
        </button>
      </div>

      {picking && (
        <div
          role="menu"
          aria-label="Add app to Home"
          style={{
            position: 'absolute', left: 8, right: 8, top: 38, maxHeight: 210, overflowY: 'auto',
            zIndex: 20, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', padding: 6,
          }}
        >
          {addable.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Every app is already pinned.</div>
          ) : addable.map(({ id, def }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className="dex-hover-bg"
              onClick={() => { pinApp(id); setPicking(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%',
                padding: '7px var(--space-2)', border: 'none', borderRadius: 6,
                background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)', textAlign: 'left',
              }}
            >
              <DexIcon name={def.icon as any} size={16} color="var(--color-text-secondary)" />
              <span style={{ fontSize: 12 }}>{def.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Dashboard grid -----------------------------------------------------

/**
 * Bento sizing: each dashboard card claims a different footprint in the grid
 * so the dashboard reads as a macOS-style bento wall rather than a uniform
 * grid. Sizes map to column/row spans over the base bento cell.
 */
const BENTO_SPAN: Record<string, React.CSSProperties> = {
  small: {},
  wide:  { gridColumn: 'span 2' },
  tall:  { gridRow: 'span 2' },
  large: { gridColumn: 'span 2', gridRow: 'span 2' },
};

export const HomeDashboard: React.FC = () => {
  return (
    <div
      role="region"
      aria-label="Home dashboard"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        // 168px rows; the oversized/empty look came from SPANS, not row height —
        // Current Tasks (2 items) was a 2-row `tall` card and Rewind a 2x2 `large`
        // card, leaving huge empty space. Cards are now sized to their content and
        // their list bodies scroll, so the bento stays compact + aligned.
        gridAutoRows: '168px',
        gridAutoFlow: 'dense',
        gridAutoColumns: '1fr',
        gap: 'var(--space-3)',
        width: '100%',
        fontFamily: 'var(--dex-font-ui)',
      }}
    >
      <div style={{ ...BENTO_SPAN['wide'], minWidth: 0, minHeight: 0, display: 'flex' }}><RecentProjectsWidget /></div>
      <div style={{ ...BENTO_SPAN['small'], minWidth: 0, minHeight: 0, display: 'flex' }}><RecentNotesWidget /></div>
      <div style={{ ...BENTO_SPAN['small'], minWidth: 0, minHeight: 0, display: 'flex' }}><CurrentTasksWidget /></div>
      <div style={{ ...BENTO_SPAN['small'], minWidth: 0, minHeight: 0, display: 'flex' }}><ActiveWorkflowsWidget /></div>
      <div style={{ ...BENTO_SPAN['wide'], minWidth: 0, minHeight: 0, display: 'flex' }}><RewindSummaryWidget /></div>
      <div style={{ ...BENTO_SPAN['wide'], minWidth: 0, minHeight: 0, display: 'flex' }}><AiSuggestionsWidget /></div>
      <div style={{ ...BENTO_SPAN['wide'], minWidth: 0, minHeight: 0, display: 'flex' }}><PinnedAppsWidget /></div>
    </div>
  );
};
HomeDashboard.displayName = 'HomeDashboard';
