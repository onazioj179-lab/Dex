/**
 * HOME - macOS Tahoe-Style Glass Desktop
 * Wallpaper system, right-click context menu, widget grid,
 * live activity feed, glassmorphism throughout.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useRunningApps, RunningApp } from '../store/runningApps';
import { useLiveActivity, type LiveActivity, type ActivityType } from '../utils/liveActivity';
import { useWallpaperStore, WALLPAPER_PRESETS } from '../store/wallpaperStore';
import { glassMenu, glassPanel, glassButton, glassOverlay } from '../styles/glassMenu';
import {
  PenIcon, CameraIcon, TimerIcon, LockIcon, FolderIcon, CloudSunIcon,
  SkipBackIcon, PlayIcon, PauseIcon, SkipForwardIcon, BatteryIcon, BoltIcon
} from '../utils/icons';

// ======================================================================
// TYPES
// ======================================================================
type WidgetSize = 'small' | 'medium' | 'large';

interface WidgetConfig {
  id: string;
  type: string;
  size: WidgetSize;
}

interface WidgetDef {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultSize: WidgetSize;
  render: (size: WidgetSize, data: WidgetData) => React.ReactNode;
}

interface WidgetData {
  time: Date;
  runningApps: RunningApp[];
  recentFiles: { name: string; path: string; time: string }[];
  upcomingTasks: { id: string; title: string; due: string }[];
  systemStats: { notes: number; tasks: number };
  quickNote: string;
  setQuickNote: (v: string) => void;
  weather: WeatherData;
  batteryLevel: number;
}

interface WeatherData {
  temp: number;
  condition: string;
  location: string;
  high: number;
  low: number;
  humidity: number;
  icon: string;
}

// ======================================================================
// ACTIVITY ICONS
// ======================================================================
const ACTIVITY_ICONS: Record<ActivityType, JSX.Element> = {
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  encode: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  transfer: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  task: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  sync: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  build: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
};

// ======================================================================
// WIDGET DEFS (12 widget types)
// ======================================================================
const WIDGET_DEFS: WidgetDef[] = [
  {
    type: 'clock',
    label: 'Clock',
    description: 'Time and date',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    defaultSize: 'medium',
    render: (size, { time }) => {
      const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const fmtDate = (d: Date) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      const isLarge = size === 'large';
      const isSmall = size === 'small';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isSmall ? 'center' : 'flex-start', justifyContent: 'center', height: '100%', gap: isSmall ? 2 : 4 }}>
          <div style={{ fontSize: isLarge ? 56 : isSmall ? 28 : 42, fontWeight: 200, color: '#fff', letterSpacing: '-1px', lineHeight: 1 }}>
            {fmt(time)}
          </div>
          {!isSmall && (
            <div style={{ fontSize: isLarge ? 16 : 13, color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>
              {fmtDate(time)}
            </div>
          )}
          {isLarge && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
              {time.toLocaleDateString([], { year: 'numeric' })}
            </div>
          )}
        </div>
      );
    },
  },
  {
    type: 'quicknote',
    label: 'Quick Note',
    description: 'Jot down a quick note',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    defaultSize: 'medium',
    render: (_size, { quickNote, setQuickNote }) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Quick Note</div>
        <textarea
          value={quickNote}
          onChange={e => setQuickNote(e.target.value)}
          placeholder="Type a note..."
          style={{
            flex: 1, resize: 'none' as const, background: 'transparent', border: 'none', outline: 'none',
            color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1.5,
            fontFamily: 'var(--font-family)',
          }}
        />
      </div>
    ),
  },
  {
    type: 'stats',
    label: 'Overview',
    description: 'Notes, Tasks, Running apps',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
    defaultSize: 'small',
    render: (_size, { systemStats, runningApps }) => (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 10 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Overview</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {[
            { val: systemStats.notes, label: 'Notes', color: '#30d158' },
            { val: systemStats.tasks, label: 'Tasks', color: '#bf5af2' },
            { val: runningApps.length, label: 'Running', color: '#0a84ff' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' as const, flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    type: 'recent',
    label: 'Recent Files',
    description: 'Recently accessed files',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
    defaultSize: 'medium',
    render: (_size, { recentFiles }) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Recent Files</div>
        {recentFiles.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {recentFiles.slice(0, 4).map((f, i) => (
              <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.name}</div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>No recent files</div>
        )}
      </div>
    ),
  },
  {
    type: 'tasks',
    label: 'Upcoming Tasks',
    description: 'Tasks due soon',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    defaultSize: 'medium',
    render: (_size, { upcomingTasks }) => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Upcoming</div>
        {upcomingTasks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {upcomingTasks.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{t.title}</span>
                <span style={{ fontSize: 10, color: '#ff453a', marginLeft: 8, flexShrink: 0 }}>{t.due}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>No upcoming tasks</div>
        )}
      </div>
    ),
  },
  {
    type: 'calendar',
    label: 'Calendar',
    description: 'Mini month calendar',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    defaultSize: 'small',
    render: (_size, { time }) => {
      const now = time;
      const y = now.getFullYear(), m = now.getMonth();
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      const today = now.getDate();
      const cells: (number | null)[] = Array(first).fill(null);
      for (let d = 1; d <= days; d++) cells.push(d);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>
            {now.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, fontSize: 9 }}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center' as const, color: 'rgba(255,255,255,0.35)', padding: '2px 0' }}>{d}</div>
            ))}
            {cells.map((d, i) => (
              <div key={i} style={{
                textAlign: 'center' as const, padding: '2px 0', borderRadius: 4,
                color: d === today ? '#fff' : d ? 'rgba(255,255,255,0.6)' : 'transparent',
                background: d === today ? '#0a84ff' : 'transparent',
                fontWeight: d === today ? 600 : 400,
              }}>
                {d ?? ''}
              </div>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    type: 'weather',
    label: 'Weather',
    description: 'Current weather conditions',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 18a5 5 0 0 0-2.06-9.57A7 7 0 1 0 3 18h14z"/></svg>,
    defaultSize: 'small',
    render: (_size, { weather }) => (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 6 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Weather</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28, lineHeight: 1, display: 'flex' }}><CloudSunIcon size={28} color="#ffd60a" /></span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 300, color: '#fff', lineHeight: 1 }}>{weather.temp}°</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{weather.condition}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          <span>H:{weather.high}°</span>
          <span>L:{weather.low}°</span>
          <span>{weather.humidity}%</span>
        </div>
      </div>
    ),
  },
  {
    type: 'battery',
    label: 'Battery',
    description: 'System battery level',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="10" x2="23" y2="14"/></svg>,
    defaultSize: 'small',
    render: (_size, { batteryLevel }) => {
      const pct = batteryLevel;
      const color = pct > 50 ? '#30d158' : pct > 20 ? '#ff9f0a' : '#ff453a';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 8 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Battery</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 300, color, lineHeight: 1 }}>{pct}%</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      );
    },
  },
  {
    type: 'shortcuts',
    label: 'Quick Actions',
    description: 'Common quick shortcuts',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    defaultSize: 'medium',
    render: () => {
      const actions = [
        { label: 'New Note', icon: <PenIcon size={14} color="#ffd60a" />, color: '#ffd60a' },
        { label: 'Screenshot', icon: <CameraIcon size={14} color="#0a84ff" />, color: '#0a84ff' },
        { label: 'Timer', icon: <TimerIcon size={14} color="#ff9f0a" />, color: '#ff9f0a' },
        { label: 'Lock', icon: <LockIcon size={14} color="#ff453a" />, color: '#ff453a' },
      ];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: 1, alignContent: 'center' }}>
            {actions.map(a => (
              <button key={a.label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer',
                transition: 'background 0.15s',
              }}>
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    type: 'systeminfo',
    label: 'System Info',
    description: 'CPU, Memory, Disk usage',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>,
    defaultSize: 'medium',
    render: () => {
      const stats = [
        { label: 'CPU', value: 23, color: '#0a84ff' },
        { label: 'Memory', value: 54, color: '#30d158' },
        { label: 'Disk', value: 67, color: '#ff9f0a' },
      ];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>System</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, justifyContent: 'center' }}>
            {stats.map(s => (
              <div key={s.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{s.label}</span>
                  <span style={{ color: s.color, fontWeight: 500 }}>{s.value}%</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.value}%`, background: s.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    type: 'music',
    label: 'Now Playing',
    description: 'Currently playing music',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
    defaultSize: 'medium',
    render: () => (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 10 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Now Playing</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Not Playing</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Open Audio to play music</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 4 }}>
          {[<SkipBackIcon size={16} />, <PlayIcon size={16} />, <SkipForwardIcon size={16} />].map((icon, i) => (
            <button key={i} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 16, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>{icon}</button>
          ))}
        </div>
      </div>
    ),
  },
  {
    type: 'countdown',
    label: 'Countdown',
    description: 'Days until end of year',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    defaultSize: 'small',
    render: (_size, { time }) => {
      const endOfYear = new Date(time.getFullYear(), 11, 31);
      const diff = Math.ceil((endOfYear.getTime() - time.getTime()) / (1000 * 60 * 60 * 24));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Days Left in {time.getFullYear()}</div>
          <div style={{ fontSize: 36, fontWeight: 200, color: '#64d2ff', lineHeight: 1 }}>{diff}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>days remaining</div>
        </div>
      );
    },
  },
];

const WIDGET_MAP = new Map(WIDGET_DEFS.map(d => [d.type, d]));

// ======================================================================
// SIZE HELPERS
// ======================================================================
const SIZE_SPAN: Record<WidgetSize, { col: number; row: number }> = {
  small: { col: 1, row: 1 },
  medium: { col: 2, row: 1 },
  large: { col: 2, row: 2 },
};

const SIZE_OPTIONS: WidgetSize[] = ['small', 'medium', 'large'];

// ======================================================================
// PERSISTENCE
// ======================================================================
const STORAGE_KEY = 'dex-home-widgets';
const NOTE_KEY = 'dex-quick-note';

function loadWidgets(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [{ id: 'w-clock', type: 'clock', size: 'medium' }];
}

function saveWidgets(w: WidgetConfig[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)); } catch { /* */ }
}

// ======================================================================
// COMPONENT
// ======================================================================
export const Home: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const { runningApps } = useRunningApps();
  const { activities } = useLiveActivity();
  const { mode: wpMode, value: wpValue, blur: wpBlur, opacity: wpOpacity, tint: wpTint } = useWallpaperStore();

  const [widgets, setWidgets] = useState<WidgetConfig[]>(loadWidgets);
  const [editMode, setEditMode] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [quickNote, setQuickNote] = useState(() => {
    try { return localStorage.getItem(NOTE_KEY) || ''; } catch { return ''; }
  });
  useEffect(() => { try { localStorage.setItem(NOTE_KEY, quickNote); } catch { /* */ } }, [quickNote]);

  const [recentFiles, setRecentFiles] = useState<{ name: string; path: string; time: string }[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<{ id: string; title: string; due: string }[]>([]);
  const [systemStats, setSystemStats] = useState({ notes: 0, tasks: 0 });

  const [weather, setWeather] = useState<WeatherData>({ temp: 72, condition: 'Partly Cloudy', location: 'Local', high: 76, low: 58, humidity: 62, icon: 'cloud-sun' });
  const [batteryLevel, setBatteryLevel] = useState(87);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch real battery level via IPC
  useEffect(() => {
    const fetchBattery = async () => {
      try {
        const stats = await window.electron?.invoke?.('power:getStats');
        if (stats?.battery?.level != null) {
          setBatteryLevel(Math.round(stats.battery.level));
        }
      } catch { /* fallback to initial value */ }
    };
    fetchBattery();
    const interval = setInterval(fetchBattery, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      const files = localStorage.getItem('dex-recent-files');
      if (files) setRecentFiles(JSON.parse(files).slice(0, 5));
    } catch { /* */ }
    try {
      const tasks = localStorage.getItem('dex-tasks');
      if (tasks) {
        const parsed = JSON.parse(tasks);
        const upcoming = parsed
          .filter((t: { completed: boolean; dueDate: string | null }) => !t.completed && t.dueDate)
          .sort((a: { dueDate: string }, b: { dueDate: string }) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
          .slice(0, 4)
          .map((t: { id: string; title: string; dueDate: string }) => ({ id: t.id, title: t.title, due: new Date(t.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) }));
        setUpcomingTasks(upcoming);
        setSystemStats(prev => ({ ...prev, tasks: parsed.filter((t: { completed: boolean }) => !t.completed).length }));
      }
    } catch { /* */ }
    try {
      const notes = localStorage.getItem('dex-notes');
      if (notes) setSystemStats(prev => ({ ...prev, notes: JSON.parse(notes).length }));
    } catch { /* */ }
  }, []);

  useEffect(() => { saveWidgets(widgets); }, [widgets]);

  // ---- Context Menu handlers ----
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', close);
      window.addEventListener('contextmenu', close);
      return () => {
        window.removeEventListener('click', close);
        window.removeEventListener('contextmenu', close);
      };
    }
  }, [contextMenu]);

  // ---- Widget CRUD ----
  const addWidget = useCallback((type: string) => {
    const def = WIDGET_MAP.get(type);
    if (!def) return;
    const id = `w-${type}-${Date.now()}`;
    setWidgets(prev => [...prev, { id, type, size: def.defaultSize }]);
    setShowWidgetPicker(false);
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  }, []);

  const resizeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.map(w => {
      if (w.id !== id) return w;
      const idx = SIZE_OPTIONS.indexOf(w.size);
      return { ...w, size: SIZE_OPTIONS[(idx + 1) % SIZE_OPTIONS.length] };
    }));
  }, []);

  const widgetData: WidgetData = useMemo(() => ({
    time, runningApps, recentFiles, upcomingTasks, systemStats, quickNote, setQuickNote, weather, batteryLevel,
  }), [time, runningApps, recentFiles, upcomingTasks, systemStats, quickNote, weather, batteryLevel]);

  // Wallpaper background CSS
  const wallpaperBg: React.CSSProperties = wpMode === 'image'
    ? { backgroundImage: `url(${wpValue})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : wpMode === 'gradient'
      ? { backgroundImage: wpValue }
      : { backgroundColor: wpValue };

  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div
      role="region"
      aria-label="Home"
      onContextMenu={handleContextMenu}
      style={{
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Wallpaper Layer */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        ...wallpaperBg,
        filter: wpBlur > 0 ? `blur(${wpBlur}px)` : undefined,
        transform: wpBlur > 0 ? 'scale(1.05)' : undefined,
        transition: 'all 0.4s ease',
      }} />

      {/* Glass Tint Overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: wpTint,
        opacity: wpOpacity,
        transition: 'all 0.4s ease',
      }} />

      {/* Content Layer */}
      <div style={{
        position: 'relative', zIndex: 2,
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'auto',
      }}>
        {/* Widget Grid */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: widgets.length <= 1 ? 'center' : 'flex-start',
          padding: '32px 36px 16px',
          gap: 16,
        }}>
          {widgets.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setEditMode(p => !p)}
                aria-label={editMode ? 'Finish editing widgets' : 'Edit widgets'}
                style={{
                  ...glassButton,
                  padding: '6px 14px', borderRadius: 10,
                  background: editMode ? 'rgba(255,69,58,0.15)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${editMode ? 'rgba(255,69,58,0.25)' : 'rgba(255,255,255,0.12)'}`,
                  color: editMode ? '#ff453a' : 'rgba(255,255,255,0.6)',
                  fontSize: 12, fontWeight: 500,
                }}
              >
                {editMode ? 'Done' : 'Edit Widgets'}
              </button>
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
            width: '100%',
          }}>
            {widgets.map(wc => {
              const def = WIDGET_MAP.get(wc.type);
              if (!def) return null;
              const span = SIZE_SPAN[wc.size];
              return (
                <div
                  key={wc.id}
                  style={{
                    gridColumn: `span ${span.col}`,
                    gridRow: `span ${span.row}`,
                    minHeight: span.row === 2 ? 220 : 110,
                    position: 'relative' as const,
                    padding: '16px 18px',
                    borderRadius: 16,
                    background: 'rgba(28,28,30,0.55)',
                    backdropFilter: 'blur(40px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
                    animation: 'fadeIn 0.2s ease-out',
                    overflow: 'hidden',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  {editMode && (
                    <div style={{ position: 'absolute' as const, top: 6, right: 6, display: 'flex', gap: 4, zIndex: 2 }}>
                      <button
                        onClick={() => resizeWidget(wc.id)}
                        title={`Resize (${wc.size})`}
                        style={{
                          width: 24, height: 24, borderRadius: 6,
                          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)',
                          color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
                        }}
                      >
                        {wc.size === 'small' ? 'S' : wc.size === 'medium' ? 'M' : 'L'}
                      </button>
                      <button
                        onClick={() => removeWidget(wc.id)}
                        title="Remove"
                        style={{
                          width: 24, height: 24, borderRadius: 6,
                          background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.25)',
                          color: '#ff453a', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}
                  {def.render(wc.size, widgetData)}
                </div>
              );
            })}
          </div>

          {widgets.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 12, padding: 48, opacity: 0.5,
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Right-click to add widgets</div>
            </div>
          )}
        </div>

        {/* Live Activity Feed */}
        {activities.length > 0 && (
          <div style={{
            padding: '8px 36px 80px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Live Activity</div>
            {activities.map(act => (
              <ActivityCard key={act.id} activity={act} />
            ))}
          </div>
        )}

        {activities.length === 0 && (
          <div style={{ padding: '16px 0 80px', textAlign: 'center' as const, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            No live activities right now
          </div>
        )}
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            ...glassMenu,
            padding: '6px 0',
            minWidth: 220,
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          <ContextMenuItem icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>} label="Add Widget" onClick={() => { setContextMenu(null); setShowWidgetPicker(true); }} />
          <ContextMenuItem icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>} label="Change Wallpaper" onClick={() => { setContextMenu(null); setShowWallpaperPicker(true); }} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
          <ContextMenuItem icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>} label={editMode ? 'Done Editing' : 'Edit Widgets'} onClick={() => { setContextMenu(null); setEditMode(p => !p); }} />
          <ContextMenuItem icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>} label="Spotlight Search" shortcut="Ctrl+Space" onClick={() => { setContextMenu(null); }} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
          <ContextMenuItem icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>} label="Reset Layout" onClick={() => { setContextMenu(null); setWidgets([{ id: 'w-clock', type: 'clock', size: 'medium' }]); }} />
        </div>
      )}

      {/* Widget Picker Modal */}
      {showWidgetPicker && (
        <div style={{ ...glassOverlay, position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowWidgetPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            ...glassPanel,
            width: 480, maxHeight: '70vh', overflow: 'auto',
            padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Add Widget</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Choose a widget to add to your desktop</p>
              </div>
              <button onClick={() => setShowWidgetPicker(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 28, height: 28, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {WIDGET_DEFS.map(def => {
                const alreadyAdded = widgets.some(w => w.type === def.type);
                return (
                  <button
                    key={def.type}
                    onClick={() => addWidget(def.type)}
                    disabled={alreadyAdded}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10,
                      background: alreadyAdded ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: alreadyAdded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
                      cursor: alreadyAdded ? 'default' : 'pointer',
                      textAlign: 'left' as const,
                      transition: 'background 0.15s',
                      opacity: alreadyAdded ? 0.5 : 1,
                    }}
                  >
                    <div style={{ color: alreadyAdded ? 'rgba(255,255,255,0.2)' : '#0a84ff', display: 'flex' }}>{def.icon}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{def.label}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{def.description}</div>
                    </div>
                    {alreadyAdded && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Added</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Wallpaper Picker Modal */}
      {showWallpaperPicker && <WallpaperPickerModal onClose={() => setShowWallpaperPicker(false)} />}
    </div>
  );
};

// ======================================================================
// CONTEXT MENU ITEM
// ======================================================================
const ContextMenuItem: React.FC<{ icon: React.ReactNode; label: string; shortcut?: string; onClick: () => void }> = ({ icon, label, shortcut, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '7px 14px',
        background: hovered ? 'rgba(10,132,255,0.2)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: hovered ? '#fff' : 'rgba(255,255,255,0.85)',
        fontSize: 13, textAlign: 'left' as const,
        borderRadius: 0,
        transition: 'background 0.1s',
      }}
    >
      <span style={{ width: 20, textAlign: 'center' as const, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{shortcut}</span>}
    </button>
  );
};

// ======================================================================
// WALLPAPER PICKER MODAL
// ======================================================================
const WallpaperPickerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { presetId, setWallpaper, setCustomImage, blur, setBlur, opacity, setOpacity } = useWallpaperStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    const input = fileRef.current;
    if (!input) return;
    input.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div style={{ ...glassOverlay, position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        ...glassPanel,
        width: 520, maxHeight: '75vh', overflow: 'auto', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Wallpaper</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Choose a desktop wallpaper</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 28, height: 28, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Preset Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {WALLPAPER_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setWallpaper(p)}
              style={{
                width: '100%', aspectRatio: '16/10', borderRadius: 10,
                background: p.thumbnail || p.value,
                border: presetId === p.id ? '2px solid #0a84ff' : '2px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                position: 'relative', overflow: 'hidden',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '16px 6px 5px',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                fontSize: 9, color: 'rgba(255,255,255,0.8)', fontWeight: 500,
                textAlign: 'center' as const,
              }}>
                {p.name}
              </div>
              {presetId === p.id && (
                <div style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, background: '#0a84ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Custom Image */}
        <button
          onClick={handleFileSelect}
          style={{
            ...glassButton,
            width: '100%', padding: '10px', textAlign: 'center' as const,
            fontSize: 13, marginBottom: 20,
          }}
        >
          <FolderIcon size={14} /> Choose Custom Image...
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        {/* Sliders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
              <span>Blur</span><span>{blur}px</span>
            </div>
            <input type="range" min="0" max="40" value={blur} onChange={e => setBlur(Number(e.target.value))} style={{ width: '100%', accentColor: '#0a84ff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
              <span>Tint Opacity</span><span>{Math.round(opacity * 100)}%</span>
            </div>
            <input type="range" min="0" max="100" value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)} style={{ width: '100%', accentColor: '#0a84ff' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ======================================================================
// ACTIVITY CARD
// ======================================================================
const ActivityCard: React.FC<{ activity: LiveActivity }> = ({ activity }) => {
  const done = activity.completedAt != null;
  const color = done ? '#30d158' : '#0a84ff';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 12,
      background: 'rgba(28,28,30,0.55)',
      backdropFilter: 'blur(30px) saturate(180%)', WebkitBackdropFilter: 'blur(30px) saturate(180%)',
      border: '1px solid rgba(255,255,255,0.1)',
      opacity: done ? 0.6 : 1,
      transition: 'opacity 0.5s ease',
      animation: 'fadeIn 0.2s ease-out',
    }}>
      <div style={{ color, display: 'flex', alignItems: 'center' }}>
        {ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.sync}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {activity.label}
        </div>
        {activity.progress >= 0 && !done && (
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: color, width: `${activity.progress}%`, transition: 'width 0.3s ease' }} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
        {done ? 'Done' : activity.progress >= 0 ? `${activity.progress}%` : ''}
      </div>
    </div>
  );
};

Home.displayName = 'Home';
export default memo(Home);
