// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Task Manager -- DEX's diagnostics tool. Laid out like a desktop system
// monitor, not a dashboard: one compact toolbar, four views (Processes,
// Performance, DEX Apps, System), dense tables, and one chart at a time with
// real axes. Every number comes from the native bridge (`system:getStatus`,
// `system:getProcesses`) or from the renderer itself (JS heap, long tasks);
// nothing is estimated or decorative. Data stays on this device.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DexIcon from '../components/DexIcon';
import { APP_DEFINITIONS, useRunningApps } from '../store/runningApps';
import { ConfirmDialog } from '../components/ConfirmDialog';
import NexusUkiPanel from '../components/NexusUkiPanel';
import ScheduledTasksPanel from '../components/ScheduledTasksPanel';
import SystemIntegrityPanel from '../components/SystemIntegrityPanel';
import NexusDiagnostics from '../components/NexusDiagnostics';
import { appLifecycle, type AppPhase } from '../services/AppLifecycle';
import { useVirtualList } from '../improvements500/virtualList';
import { DexSearchInput } from '../styles/components';
import { sendToNotes } from '../services/sendTo';
import { useElementSize } from '../utils/motionHooksExtended';

// -- types + persisted preferences --------------------------------------------

type View = 'processes' | 'performance' | 'apps' | 'diagnostics' | 'system';
const VIEWS: { id: View; label: string }[] = [
  { id: 'processes', label: 'Processes' },
  { id: 'performance', label: 'Performance' },
  { id: 'apps', label: 'DEX Apps' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'system', label: 'System' },
];
type Resource = 'cpu' | 'memory' | 'disk' | 'network' | 'battery' | 'dex';
/** Update speed in ms; 0 = paused. */
const SPEEDS: { ms: number; label: string }[] = [
  { ms: 1000, label: 'Normal (1 s)' },
  { ms: 2000, label: 'Low (2 s)' },
  { ms: 5000, label: 'Very low (5 s)' },
  { ms: 0, label: 'Paused' },
];

const VIEW_KEY = 'dex-taskmanager-view';
const RESOURCE_KEY = 'dex-taskmanager-resource';
const SPEED_KEY = 'dex-taskmanager-speed';
const PINNED_KEY = 'dex-taskmanager-pinned';
const GROUP_BY_KEY = 'dex-taskmanager-groupby';

const readPref = <T,>(key: string, ok: (v: string) => boolean, fallback: T, map: (v: string) => T): T => {
  try { const v = localStorage.getItem(key); if (v != null && ok(v)) return map(v); } catch { /* storage blocked */ }
  return fallback;
};
const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* quota */ } };

const loadPinned = (): number[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
    if (Array.isArray(parsed)) return parsed.filter((n): n is number => typeof n === 'number');
  } catch { /* ignore */ }
  return [];
};

interface SystemProcess { pid: number; name: string; cpu?: number; memory?: number }
interface SystemStatusInfo {
  cpu?: { usage: number; cores: number };
  memory?: { total: number; used: number; percent: number };
  battery?: { percent: number; charging: boolean; hasBattery?: boolean; timeRemaining?: number | null };
  network?: { connected: boolean; type?: string; rxBps?: number; txBps?: number };
  disk?: { used: number; total: number; percent: number };
  uptime?: number;
}

/** Samples kept per series: 60 at the normal speed = one minute. */
const HISTORY_LENGTH = 60;
const PROCESS_ROW_H = 28;

// -- formatting ----------------------------------------------------------------

const GB = 1024 ** 3;
const fmtGB = (b: number) => `${(b / GB).toFixed(b >= 100 * GB ? 0 : 1)} GB`;
const fmtMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const fmtBps = (bps: number): string => {
  if (!Number.isFinite(bps) || bps <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let v = bps; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
};
const fmtAge = (ts: number): string => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const fmtUptime = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtClock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Collapse a process name to the application it belongs to (for grouping). */
const groupKeyFor = (name: string): string => {
  let base = (name || 'unknown').trim();
  base = base.replace(/\.(exe|app|bin|dll|sh)$/i, '');
  base = base.replace(/\s+Helper(\s*\([^)]*\))?$/i, '');
  base = base.replace(/\s*\(([^)]*)\)\s*$/i, '');
  return base.trim() || (name || 'unknown');
};

const toast = (type: 'success' | 'error' | 'info', message: string) => {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* ignore */ }
};

const pushSample = (prev: number[], value: number): number[] => {
  const next = prev.length >= HISTORY_LENGTH ? prev.slice(prev.length - HISTORY_LENGTH + 1) : prev.slice();
  next.push(Number.isFinite(value) ? value : 0);
  return next;
};

// Renderer heap (Chromium/WebView2 only; absent elsewhere -> null, not 0).
const readHeapMB = (): { used: number; limit: number } | null => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return m ? { used: m.usedJSHeapSize / 1024 ** 2, limit: m.jsHeapSizeLimit / 1024 ** 2 } : null;
};

// -- chart ------------------------------------------------------------------------

/**
 * A colour the canvas can use, with alpha. Accepts hex, rgb()/rgba() or a CSS
 * variable such as var(--color-accent), resolved against `el` so the charts
 * follow the theme. (Appending hex alpha to "var(...)" made an invalid colour,
 * and addColorStop threw.)
 */
export function canvasColor(color: string, alpha: number, el?: Element | null): string {
  let c = color.trim();
  const m = /^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$/.exec(c);
  if (m) {
    const resolved = typeof getComputedStyle === 'function'
      ? getComputedStyle(el ?? document.documentElement).getPropertyValue(m[1]).trim()
      : '';
    c = resolved || (m[2] ?? 'var(--color-accent)').trim();
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return c; // named colour: no alpha, but still valid
}

interface LineChartProps {
  series: number[];
  /** Second, dashed series (e.g. network send). */
  series2?: number[];
  max: number;
  height: number;
  ariaLabel: string;
  /** Draw the y-axis grid labels (top + middle). */
  axisLabel?: (v: number) => string;
}

/**
 * One flat line chart: hairline grid, the accent line, a faint fill. No
 * gradients, glow or smoothing -- the shape is the data. Samples are laid out
 * right-aligned so a new chart fills in from the right like a system monitor.
 */
const LineChart: React.FC<LineChartProps> = ({ series, series2, max, height, ariaLabel, axisLabel }) => {
  const { ref, width, height: cssH } = useElementSize<HTMLCanvasElement>();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width || !cssH) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(width), h = Math.floor(cssH);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const accent = canvasColor('var(--color-accent, #0A84FF)', 1, canvas);
    const fillTone = canvasColor('var(--color-accent, #0A84FF)', 0.12, canvas);
    const grid = canvasColor('var(--color-text-primary, #ffffff)', 0.08, canvas);
    const label = canvasColor('var(--color-text-tertiary, #8e8e93)', 1, canvas);

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = Math.round((h - 1) * (i / 4)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      const x = Math.round(w * (i / 6)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    const safeMax = max > 0 ? max : 1;
    const stepX = w / (HISTORY_LENGTH - 1);
    const draw = (data: number[], dashed: boolean, fill: boolean) => {
      const s = data.slice(-HISTORY_LENGTH);
      if (s.length < 2) return;
      const x0 = (HISTORY_LENGTH - s.length) * stepX;
      const pt = (v: number, i: number): [number, number] => [x0 + i * stepX, (h - 1) - (Math.max(0, Math.min(safeMax, v)) / safeMax) * (h - 2)];
      ctx.beginPath();
      s.forEach((v, i) => { const [x, y] = pt(v, i); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      if (fill) {
        ctx.save();
        ctx.lineTo(x0 + (s.length - 1) * stepX, h);
        ctx.lineTo(x0, h);
        ctx.closePath();
        ctx.fillStyle = fillTone;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        s.forEach((v, i) => { const [x, y] = pt(v, i); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      }
      ctx.setLineDash(dashed ? [4, 3] : []);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    };
    draw(series, false, true);
    if (series2) draw(series2, true, false);

    if (axisLabel) {
      ctx.fillStyle = label;
      ctx.font = '10px var(--dex-font-ui, system-ui), system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText(axisLabel(safeMax), w - 4, 3);
      ctx.textBaseline = 'middle';
      ctx.fillText(axisLabel(safeMax / 2), w - 4, h / 2);
    }
  }, [series, series2, max, width, cssH, axisLabel, ref]);
  return <canvas ref={ref} role="img" aria-label={ariaLabel} style={{ width: '100%', height, display: 'block' }} />;
};

// -- main component -----------------------------------------------------------

const TaskManager: React.FC = () => {
  const runningApps = useRunningApps(s => s.runningApps);
  const currentAppId = useRunningApps(s => s.currentAppId);
  const closeApp = useRunningApps(s => s.closeApp);
  const setCurrentApp = useRunningApps(s => s.setCurrentApp);

  const [view, setView] = useState<View>(() => readPref<View>(VIEW_KEY, v => VIEWS.some(x => x.id === v), 'processes', v => v as View));
  const [resource, setResource] = useState<Resource>(() => readPref<Resource>(RESOURCE_KEY, v => ['cpu', 'memory', 'disk', 'network', 'battery', 'dex'].includes(v), 'cpu', v => v as Resource));
  const [speed, setSpeed] = useState<number>(() => readPref<number>(SPEED_KEY, v => SPEEDS.some(s => String(s.ms) === v), 1000, Number));
  useEffect(() => writePref(VIEW_KEY, view), [view]);
  useEffect(() => writePref(RESOURCE_KEY, resource), [resource]);
  useEffect(() => writePref(SPEED_KEY, String(speed)), [speed]);

  const [status, setStatus] = useState<SystemStatusInfo>({});
  const [processes, setProcesses] = useState<SystemProcess[]>([]);
  const [bridge, setBridge] = useState<'unknown' | 'ok' | 'missing' | 'error'>('unknown');
  const [lastError, setLastError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [hist, setHist] = useState({ cpu: [] as number[], mem: [] as number[], disk: [] as number[], rx: [] as number[], tx: [] as number[], bat: [] as number[], heap: [] as number[] });
  const [heap, setHeap] = useState<{ used: number; limit: number } | null>(() => readHeapMB());
  const [longTasks, setLongTasks] = useState({ count: 0, worstMs: 0 });
  const firstSeenRef = useRef<Map<number, number>>(new Map());

  // Long tasks (>50 ms main-thread blocks) in the DEX renderer -- the honest
  // measure of UI jank. Supported in Chromium/WebView2; absent elsewhere.
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    const obs = new PerformanceObserver(list => {
      const entries = list.getEntries();
      if (!entries.length) return;
      setLongTasks(prev => ({
        count: prev.count + entries.length,
        worstMs: Math.max(prev.worstMs, ...entries.map(e => Math.round(e.duration))),
      }));
    });
    try { obs.observe({ type: 'longtask', buffered: false }); } catch { return; }
    return () => obs.disconnect();
  }, []);

  const refreshStatus = useCallback(async () => {
    const api = (window as { dex?: { system?: { getStatus?: () => Promise<SystemStatusInfo> } } }).dex;
    const h = readHeapMB();
    setHeap(h);
    if (!api?.system?.getStatus) {
      setBridge('missing');
      if (h) setHist(p => ({ ...p, heap: pushSample(p.heap, h.used) }));
      return;
    }
    try {
      const s = await api.system.getStatus();
      if (!s) throw new Error('No data returned');
      setStatus(s);
      setHist(p => ({
        cpu: pushSample(p.cpu, s.cpu?.usage ?? 0),
        mem: pushSample(p.mem, s.memory?.percent ?? 0),
        disk: pushSample(p.disk, s.disk?.percent ?? 0),
        rx: pushSample(p.rx, s.network?.rxBps ?? 0),
        tx: pushSample(p.tx, s.network?.txBps ?? 0),
        bat: s.battery && s.battery.hasBattery !== false ? pushSample(p.bat, s.battery.percent) : p.bat,
        heap: h ? pushSample(p.heap, h.used) : p.heap,
      }));
      setBridge('ok');
      setLastError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setBridge('error');
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshProcesses = useCallback(async () => {
    const api = (window as { dex?: { system?: { getProcesses?: () => Promise<SystemProcess[]> } } }).dex;
    if (!api?.system?.getProcesses) { setBridge(b => (b === 'ok' ? b : 'missing')); return; }
    try {
      const raw = await api.system.getProcesses();
      const list = Array.isArray(raw) ? raw.filter(p => typeof p?.pid === 'number') : [];
      const seen = firstSeenRef.current;
      const now = Date.now();
      const live = new Set<number>();
      for (const p of list) { live.add(p.pid); if (!seen.has(p.pid)) seen.set(p.pid, now); }
      for (const pid of Array.from(seen.keys())) if (!live.has(pid)) seen.delete(pid);
      setProcesses(list);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Polling: status at the chosen speed; the process list (heavier) at 3x that,
  // and only while the Processes view is open. Stops while DEX is hidden.
  useEffect(() => {
    void refreshStatus();
    void refreshProcesses();
    if (speed === 0) return;
    let statusTimer: number | null = null;
    let procTimer: number | null = null;
    const start = () => {
      if (statusTimer == null) statusTimer = window.setInterval(() => { void refreshStatus(); }, speed);
      if (procTimer == null && view === 'processes') procTimer = window.setInterval(() => { void refreshProcesses(); }, Math.max(3000, speed * 3));
    };
    const stop = () => {
      if (statusTimer != null) { window.clearInterval(statusTimer); statusTimer = null; }
      if (procTimer != null) { window.clearInterval(procTimer); procTimer = null; }
    };
    const onVis = () => { if (document.hidden) stop(); else { void refreshStatus(); start(); } };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [speed, view, refreshStatus, refreshProcesses]);

  const refreshNow = useCallback(() => { void refreshStatus(); void refreshProcesses(); }, [refreshStatus, refreshProcesses]);

  // -- kill flow ---------------------------------------------------------------
  const [killConfirm, setKillConfirm] = useState<{ pid: number; name: string; force: boolean; tree?: boolean } | null>(null);
  const [killing, setKilling] = useState<number | null>(null);
  const canKill = !!(window as { dex?: { system?: { killProcess?: unknown } } }).dex?.system?.killProcess;
  const askEnd = useCallback((pid: number, name: string, tree = false) => {
    if (pid > 0) setKillConfirm({ pid, name, force: false, tree });
  }, []);
  const executeKill = useCallback(async () => {
    if (!killConfirm) return;
    const { pid, name, force, tree } = killConfirm;
    setKillConfirm(null);
    setKilling(pid);
    try {
      const sys = (window as { dex?: { system?: { killProcess?: (p: number, f: boolean) => Promise<{ success?: boolean; error?: string }>; killProcessTree?: (p: number, f: boolean) => Promise<{ success?: boolean; error?: string }> } } }).dex?.system;
      const fn = tree ? sys?.killProcessTree : sys?.killProcess;
      if (!fn) throw new Error('Ending processes is not available in this build');
      const result = await fn(pid, force);
      if (result && result.success === false) {
        if (!force) setKillConfirm({ pid, name, force: true, tree });
        else toast('error', result.error || `Could not end ${name}`);
      } else {
        toast('success', `Ended ${name}`);
        await refreshProcesses();
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : `Could not end ${name}`);
    } finally {
      setKilling(null);
    }
  }, [killConfirm, refreshProcesses]);

  // -- derived -----------------------------------------------------------------
  const shellApps = runningApps.filter(a => a.id !== 'home');
  const cpu = status.cpu?.usage ?? 0;
  const memPct = status.memory?.percent ?? 0;
  const hasBattery = !!status.battery && status.battery.hasBattery !== false;
  const totalProcMem = useMemo(() => processes.reduce((n, p) => n + (p.memory || 0), 0), [processes]);

  const exportSnapshot = useCallback(() => {
    const top = [...processes].sort((a, b) => (b.cpu || 0) - (a.cpu || 0)).slice(0, 25);
    if (top.length === 0) { toast('info', 'No process data to export yet'); return; }
    const stamp = new Date().toLocaleString();
    const padR = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
    const padL = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
    const head = `${padR('PROCESS', 28)} ${padL('PID', 8)} ${padL('CPU%', 7)} ${padL('MEM(MB)', 9)}`;
    const text = [
      `DEX Task Manager snapshot — ${stamp}`,
      `CPU: ${cpu}%   Memory: ${memPct}%   Processes: ${processes.length}`,
      `Top ${top.length} processes by CPU:`,
      '',
      head,
      '-'.repeat(head.length),
      ...top.map(p => `${padR(p.name || 'unknown', 28)} ${padL(String(p.pid), 8)} ${padL((p.cpu || 0).toFixed(1), 7)} ${padL(String(Math.round(p.memory || 0)), 9)}`),
    ].join('\n');
    void sendToNotes(text, `Task Manager snapshot — ${stamp}`);
  }, [processes, cpu, memPct]);

  return (
    <div style={S.root}>
      <ConfirmDialog
        open={killConfirm !== null}
        title={killConfirm?.force
          ? `Force end "${killConfirm.name}"${killConfirm.tree ? ' and its child processes' : ''}?`
          : killConfirm?.tree ? `End "${killConfirm?.name}" and its child processes?` : `End "${killConfirm?.name}"?`}
        message={killConfirm?.force
          ? 'It did not close when asked. Forcing it ends it immediately.'
          : 'Unsaved work in this process will be lost.'}
        confirmLabel={killConfirm?.force ? 'Force End' : 'End'}
        tone="destructive"
        onConfirm={executeKill}
        onCancel={() => setKillConfirm(null)}
      />

      {/* Toolbar: views on the left, update controls on the right. */}
      <div style={S.toolbar}>
        <div role="tablist" aria-label="Task Manager views" style={S.segment}>
          {VIEWS.map(v => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              style={{ ...S.segBtn, ...(view === v.id ? S.segBtnOn : null) }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={S.updated} aria-live="off" title={lastError ? `Last error: ${lastError}` : undefined}>
          {bridge === 'missing' ? 'System data unavailable in this build'
            : bridge === 'error' ? 'Update failed'
            : speed === 0 ? (updatedAt ? `Paused · ${fmtClock(updatedAt)}` : 'Paused')
            : updatedAt ? `Updated ${fmtClock(updatedAt)}` : 'Reading…'}
        </span>
        <select
          value={speed}
          onChange={e => setSpeed(Number(e.target.value))}
          aria-label="Update speed"
          title="Update speed"
          style={S.select}
        >
          {SPEEDS.map(s => <option key={s.ms} value={s.ms}>{s.label}</option>)}
        </select>
        <button type="button" style={S.iconBtn} onClick={refreshNow} aria-label="Refresh now" title="Refresh now">
          <DexIcon name="refresh" size={14} />
        </button>
        <button type="button" style={S.iconBtn} onClick={exportSnapshot} disabled={processes.length === 0} aria-label="Send a snapshot to Notes" title="Send a snapshot of the top processes to Notes">
          <DexIcon name="file-text" size={14} />
        </button>
      </div>

      {bridge === 'error' && lastError && (
        <div role="alert" style={S.errorBar}>
          <DexIcon name="alert-triangle" size={13} />
          <span style={{ flex: 1, minWidth: 0 }}>Could not read system data: {lastError}</span>
          <button type="button" style={S.textBtn} onClick={refreshNow}>Retry</button>
        </div>
      )}

      <div style={S.body}>
        {view === 'processes' && (
          <ProcessesView
            processes={processes}
            bridgeOk={bridge !== 'missing'}
            busyPid={killing}
            canKill={canKill}
            firstSeen={firstSeenRef.current}
            onEnd={askEnd}
          />
        )}
        {view === 'performance' && (
          <PerformanceView
            resource={resource}
            onResource={setResource}
            status={status}
            hist={hist}
            heap={heap}
            longTasks={longTasks}
            processCount={processes.length}
            appCount={shellApps.length}
            hasBattery={hasBattery}
            bridgeOk={bridge !== 'missing'}
          />
        )}
        {view === 'apps' && (
          <AppsView
            apps={shellApps}
            currentAppId={currentAppId}
            onFocus={id => setCurrentApp(id)}
            onQuit={id => closeApp(id)}
          />
        )}
        {view === 'diagnostics' && (
          <div style={S.scroll}><NexusDiagnostics /></div>
        )}
        {view === 'system' && (
          <div style={S.scroll}>
            <SystemIntegrityPanel />
            <ScheduledTasksPanel />
            <NexusUkiPanel />
          </div>
        )}
      </div>

      {/* Status bar: the always-useful totals, like a system monitor footer. */}
      <div style={S.statusBar}>
        <span>CPU <b style={S.num}>{status.cpu ? `${cpu}%` : '—'}</b></span>
        <span>Memory <b style={S.num}>{status.memory ? `${memPct}%` : '—'}</b></span>
        <span>Processes <b style={S.num}>{processes.length || '—'}</b></span>
        <span>DEX apps <b style={S.num}>{shellApps.length}</b></span>
        {view === 'processes' && totalProcMem > 0 && <span>Listed memory <b style={S.num}>{fmtMB(totalProcMem)}</b></span>}
        <span style={{ marginLeft: 'auto' }}>Up <b style={S.num}>{fmtUptime(status.uptime ?? 0)}</b></span>
      </div>
    </div>
  );
};

// -- Processes view -------------------------------------------------------------

type SortKey = 'name' | 'pid' | 'cpu' | 'memory';

interface ProcessesViewProps {
  processes: SystemProcess[];
  bridgeOk: boolean;
  busyPid: number | null;
  canKill: boolean;
  firstSeen: Map<number, number>;
  onEnd: (pid: number, name: string, tree?: boolean) => void;
}

const ProcessesView: React.FC<ProcessesViewProps> = ({ processes, bridgeOk, busyPid, canKill, firstSeen, onEnd }) => {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pinned, setPinned] = useState<number[]>(loadPinned);
  const [groupBy, setGroupBy] = useState<boolean>(() => readPref(GROUP_BY_KEY, () => true, false, v => v === '1'));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  useEffect(() => writePref(PINNED_KEY, JSON.stringify(pinned)), [pinned]);
  useEffect(() => writePref(GROUP_BY_KEY, groupBy ? '1' : '0'), [groupBy]);

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const dir = sortDir === 'asc' ? 1 : -1;
    const list = q ? processes.filter(p => p.name.toLowerCase().includes(q) || String(p.pid).includes(q)) : processes.slice();
    return list.sort((a, b) => {
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
      const va = sortKey === 'pid' ? a.pid : sortKey === 'memory' ? (a.memory || 0) : (a.cpu || 0);
      const vb = sortKey === 'pid' ? b.pid : sortKey === 'memory' ? (b.memory || 0) : (b.cpu || 0);
      return dir * (va - vb);
    });
  }, [processes, filter, sortKey, sortDir]);

  interface Group { key: string; procs: SystemProcess[]; cpu: number; memory: number }
  type Row = { kind: 'group'; group: Group } | { kind: 'proc'; proc: SystemProcess; nested: boolean; pinned: boolean };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const p of visible) if (pinnedSet.has(p.pid)) out.push({ kind: 'proc', proc: p, nested: false, pinned: true });
    if (!groupBy) {
      for (const p of visible) if (!pinnedSet.has(p.pid)) out.push({ kind: 'proc', proc: p, nested: false, pinned: false });
      return out;
    }
    const map = new Map<string, Group>();
    for (const p of visible) {
      const key = groupKeyFor(p.name);
      let g = map.get(key);
      if (!g) { g = { key, procs: [], cpu: 0, memory: 0 }; map.set(key, g); }
      g.procs.push(p); g.cpu += p.cpu || 0; g.memory += p.memory || 0;
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    const groups = Array.from(map.values()).sort((a, b) =>
      sortKey === 'name' ? dir * a.key.localeCompare(b.key)
        : sortKey === 'memory' ? dir * (a.memory - b.memory)
        : sortKey === 'pid' ? dir * (a.procs[0].pid - b.procs[0].pid)
        : dir * (a.cpu - b.cpu));
    for (const g of groups) {
      if (g.procs.length === 1) { const p = g.procs[0]; if (!pinnedSet.has(p.pid)) out.push({ kind: 'proc', proc: p, nested: false, pinned: false }); continue; }
      out.push({ kind: 'group', group: g });
      if (!collapsed[g.key]) for (const p of g.procs) if (!pinnedSet.has(p.pid)) out.push({ kind: 'proc', proc: p, nested: true, pinned: false });
    }
    return out;
  }, [visible, pinnedSet, groupBy, collapsed, sortKey, sortDir]);

  const virt = useVirtualList({ itemCount: rows.length, rowHeight: PROCESS_ROW_H, bufferRows: 8 });
  const selected = selectedPid == null ? null : processes.find(p => p.pid === selectedPid) || null;

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };
  const ariaSort = (key: SortKey): React.AriaAttributes['aria-sort'] => (sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const togglePin = (pid: number) => setPinned(p => (p.includes(pid) ? p.filter(x => x !== pid) : [...p, pid]));

  // Keyboard: Up/Down move the selection, Delete ends the selected process.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const procRows = rows.filter((r): r is Extract<Row, { kind: 'proc' }> => r.kind === 'proc');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = procRows.findIndex(r => r.proc.pid === selectedPid);
      const n = e.key === 'ArrowDown' ? Math.min(procRows.length - 1, i + 1) : Math.max(0, i - 1);
      const next = procRows[n];
      if (next) {
        setSelectedPid(next.proc.pid);
        const el = virt.ref.current;
        const rowIndex = rows.indexOf(next);
        if (el) {
          const top = rowIndex * PROCESS_ROW_H;
          if (top < el.scrollTop) el.scrollTop = top;
          else if (top + PROCESS_ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + PROCESS_ROW_H - el.clientHeight;
        }
      }
    } else if (e.key === 'Delete' && selected && canKill) {
      e.preventDefault();
      onEnd(selected.pid, selected.name);
    }
  };

  const cpuColor = (v: number) => (v >= 50 ? 'var(--color-error)' : v >= 20 ? 'var(--color-warning)' : 'var(--color-text-secondary)');

  return (
    <div style={S.split}>
      <div style={S.tableWrap}>
        <div style={S.subbar}>
          <DexSearchInput
            size="sm"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onClear={() => setFilter('')}
            placeholder="Filter by name or PID"
            aria-label="Filter processes"
            style={{ width: 220 }}
          />
          <button type="button" aria-pressed={groupBy} onClick={() => setGroupBy(g => !g)} style={{ ...S.pill, ...(groupBy ? S.pillOn : null) }} title="Group processes by application">
            Group by app
          </button>
          <span style={S.subtle}>{filter ? `${visible.length} of ${processes.length}` : `${processes.length} processes`}{pinned.length ? ` · ${pinned.length} pinned` : ''}</span>
        </div>
        <div role="row" style={S.thead}>
          <button type="button" role="columnheader" aria-sort={ariaSort('name')} style={S.th} onClick={() => sortBy('name')}>Name{arrow('name')}</button>
          <button type="button" role="columnheader" aria-sort={ariaSort('pid')} style={{ ...S.th, justifyContent: 'flex-end' }} onClick={() => sortBy('pid')}>PID{arrow('pid')}</button>
          <button type="button" role="columnheader" aria-sort={ariaSort('cpu')} style={{ ...S.th, justifyContent: 'flex-end' }} onClick={() => sortBy('cpu')}>CPU{arrow('cpu')}</button>
          <button type="button" role="columnheader" aria-sort={ariaSort('memory')} style={{ ...S.th, justifyContent: 'flex-end' }} onClick={() => sortBy('memory')}>Memory{arrow('memory')}</button>
        </div>
        <div
          ref={virt.ref}
          onScroll={virt.onScroll}
          role="grid"
          aria-label="Processes"
          tabIndex={0}
          onKeyDown={onKeyDown}
          style={S.tbody}
        >
          {!bridgeOk ? (
            <div style={S.empty}>The process list comes from the DEX desktop app; it is not available here.</div>
          ) : rows.length === 0 ? (
            <div style={S.empty}>{filter ? 'No process matches the filter.' : 'Reading processes…'}</div>
          ) : (
            <>
              <div style={{ height: virt.slice.padTop }} aria-hidden="true" />
              {rows.slice(virt.slice.start, virt.slice.end).map(row => {
                if (row.kind === 'group') {
                  const g = row.group;
                  const isCollapsed = !!collapsed[g.key];
                  return (
                    <button
                      type="button"
                      key={`g-${g.key}`}
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}
                      style={{ ...S.tr, ...S.groupRow }}
                    >
                      <span style={S.cellName}>
                        <span aria-hidden="true" style={{ ...S.chevron, transform: isCollapsed ? 'none' : 'rotate(90deg)' }}>›</span>
                        {g.key} <span style={S.subtle}>({g.procs.length})</span>
                      </span>
                      <span />
                      <span style={{ ...S.cellNum, color: cpuColor(g.cpu) }}>{g.cpu.toFixed(1)}%</span>
                      <span style={S.cellNum}>{fmtMB(g.memory)}</span>
                    </button>
                  );
                }
                const p = row.proc;
                const isSel = selectedPid === p.pid;
                return (
                  <div
                    key={`${row.pinned ? 'pin-' : ''}${p.pid}`}
                    role="row"
                    aria-selected={isSel}
                    onClick={() => setSelectedPid(isSel ? null : p.pid)}
                    onDoubleClick={() => togglePin(p.pid)}
                    style={{ ...S.tr, ...(isSel ? S.trSel : null), opacity: busyPid === p.pid ? 0.5 : 1 }}
                  >
                    <span style={{ ...S.cellName, paddingLeft: row.nested ? 18 : 0 }} title={p.name}>
                      {row.pinned && <DexIcon name="pin" size={11} color="var(--color-accent)" />}
                      {p.name}
                    </span>
                    <span style={{ ...S.cellNum, color: 'var(--color-text-tertiary)' }}>{p.pid}</span>
                    <span style={{ ...S.cellNum, color: cpuColor(p.cpu || 0) }}>{(p.cpu || 0).toFixed(1)}%</span>
                    <span style={S.cellNum}>{fmtMB(p.memory || 0)}</span>
                  </div>
                );
              })}
              <div style={{ height: virt.slice.padBottom }} aria-hidden="true" />
            </>
          )}
        </div>
      </div>

      {/* Inspector: appears only for a selection; the table keeps the width otherwise. */}
      {selected && (
        <aside style={S.inspector} aria-label={`Details for ${selected.name}`}>
          <div style={S.inspHead}>
            <span style={S.inspTitle} title={selected.name}>{selected.name}</span>
            <button type="button" style={S.iconBtn} onClick={() => setSelectedPid(null)} aria-label="Close details" title="Close">
              <DexIcon name="close" size={13} />
            </button>
          </div>
          <dl style={S.kv}>
            <dt style={S.k}>PID</dt><dd style={S.v}>{selected.pid}</dd>
            <dt style={S.k}>Application</dt><dd style={S.v}>{groupKeyFor(selected.name)}</dd>
            <dt style={S.k}>CPU</dt><dd style={S.v}>{(selected.cpu || 0).toFixed(1)}%</dd>
            <dt style={S.k}>Memory</dt><dd style={S.v}>{fmtMB(selected.memory || 0)}</dd>
            <dt style={S.k}>Seen for</dt><dd style={S.v}>{firstSeen.has(selected.pid) ? fmtAge(firstSeen.get(selected.pid)!) : '—'}</dd>
          </dl>
          <div style={S.inspActions}>
            <button type="button" style={S.btn} onClick={() => togglePin(selected.pid)} aria-pressed={pinnedSet.has(selected.pid)}>
              {pinnedSet.has(selected.pid) ? 'Unpin' : 'Pin to top'}
            </button>
            {canKill && (
              <>
                <button type="button" style={S.btnDanger} disabled={busyPid === selected.pid} onClick={() => onEnd(selected.pid, selected.name)}>End Process</button>
                <button type="button" style={S.btn} disabled={busyPid === selected.pid} onClick={() => onEnd(selected.pid, selected.name, true)}>End Process Tree</button>
              </>
            )}
          </div>
          <p style={S.hint}>Double-click a row to pin it. Delete ends the selected process.</p>
        </aside>
      )}
    </div>
  );
};

// -- Performance view -----------------------------------------------------------

interface PerformanceViewProps {
  resource: Resource;
  onResource: (r: Resource) => void;
  status: SystemStatusInfo;
  hist: { cpu: number[]; mem: number[]; disk: number[]; rx: number[]; tx: number[]; bat: number[]; heap: number[] };
  heap: { used: number; limit: number } | null;
  longTasks: { count: number; worstMs: number };
  processCount: number;
  appCount: number;
  hasBattery: boolean;
  bridgeOk: boolean;
}

const PerformanceView: React.FC<PerformanceViewProps> = ({ resource, onResource, status, hist, heap, longTasks, processCount, appCount, hasBattery, bridgeOk }) => {
  const netMax = Math.max(64 * 1024, ...hist.rx, ...hist.tx);
  const heapMax = heap ? Math.max(256, Math.ceil(Math.max(...hist.heap, heap.used) / 128) * 128) : 256;
  const pctLabel = useCallback((v: number) => `${Math.round(v)}%`, []);
  const bpsLabel = useCallback((v: number) => fmtBps(v), []);
  const mbLabel = useCallback((v: number) => `${Math.round(v)} MB`, []);

  type Entry = { id: Resource; name: string; value: string; detail: string; series: number[]; max: number };
  const entries: Entry[] = [
    { id: 'cpu', name: 'CPU', value: status.cpu ? `${status.cpu.usage}%` : '—', detail: status.cpu ? `${status.cpu.cores} cores` : '', series: hist.cpu, max: 100 },
    { id: 'memory', name: 'Memory', value: status.memory ? `${status.memory.percent}%` : '—', detail: status.memory ? `${fmtGB(status.memory.used)} of ${fmtGB(status.memory.total)}` : '', series: hist.mem, max: 100 },
    ...(status.disk ? [{ id: 'disk' as Resource, name: 'Disk', value: `${status.disk.percent}%`, detail: `${fmtGB(status.disk.used)} of ${fmtGB(status.disk.total)}`, series: hist.disk, max: 100 }] : []),
    { id: 'network', name: 'Network', value: status.network ? (status.network.connected ? fmtBps(status.network.rxBps ?? 0) : 'Offline') : '—', detail: status.network?.connected ? `Send ${fmtBps(status.network.txBps ?? 0)}` : '', series: hist.rx, max: netMax },
    ...(hasBattery ? [{ id: 'battery' as Resource, name: 'Battery', value: `${status.battery!.percent}%`, detail: status.battery!.charging ? 'Charging' : 'On battery', series: hist.bat, max: 100 }] : []),
    { id: 'dex', name: 'DEX', value: heap ? `${Math.round(heap.used)} MB` : `${appCount} apps`, detail: `${appCount} app${appCount === 1 ? '' : 's'} open`, series: hist.heap, max: heapMax },
  ];
  const sel = entries.find(e => e.id === resource) ?? entries[0];

  const stats: [string, string][] = (() => {
    switch (sel.id) {
      case 'cpu': return [['Utilization', status.cpu ? `${status.cpu.usage}%` : '—'], ['Logical cores', status.cpu ? String(status.cpu.cores) : '—'], ['Processes', processCount ? String(processCount) : '—'], ['Up time', fmtUptime(status.uptime ?? 0)]];
      case 'memory': return status.memory
        ? [['In use', fmtGB(status.memory.used)], ['Available', fmtGB(Math.max(0, status.memory.total - status.memory.used))], ['Total', fmtGB(status.memory.total)], ['Used', `${status.memory.percent}%`]]
        : [['In use', '—']];
      case 'disk': return status.disk
        ? [['Used', fmtGB(status.disk.used)], ['Free', fmtGB(Math.max(0, status.disk.total - status.disk.used))], ['Capacity', fmtGB(status.disk.total)], ['Used', `${status.disk.percent}%`]]
        : [['Used', '—']];
      case 'network': return [['Receive', fmtBps(status.network?.rxBps ?? 0)], ['Send', fmtBps(status.network?.txBps ?? 0)], ['Connection', status.network ? (status.network.connected ? (status.network.type || 'Connected') : 'Offline') : '—'], ['Peak (1 min)', fmtBps(Math.max(0, ...hist.rx, ...hist.tx))]];
      case 'battery': return [['Charge', `${status.battery?.percent ?? 0}%`], ['State', status.battery?.charging ? 'Charging' : 'On battery'], ['Time left', status.battery?.timeRemaining && status.battery.timeRemaining > 0 ? `${Math.round(status.battery.timeRemaining)} min` : '—']];
      default: return [
        ['JS heap', heap ? `${Math.round(heap.used)} MB` : 'Not reported'],
        ['Heap limit', heap ? `${Math.round(heap.limit)} MB` : '—'],
        ['Open apps', String(appCount)],
        ['Long tasks', `${longTasks.count}`],
        ['Longest task', longTasks.worstMs ? `${longTasks.worstMs} ms` : '—'],
      ];
    }
  })();

  const label = sel.id === 'network' ? bpsLabel : sel.id === 'dex' ? mbLabel : pctLabel;

  return (
    <div style={S.split}>
      <nav aria-label="Resources" style={S.resList}>
        {entries.map(e => {
          const on = e.id === sel.id;
          return (
            <button key={e.id} type="button" aria-pressed={on} onClick={() => onResource(e.id)} style={{ ...S.resItem, ...(on ? S.resItemOn : null) }}>
              <div style={S.resSpark}><LineChart series={e.series} max={e.max} height={30} ariaLabel={`${e.name} history`} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={S.resName}>{e.name}</div>
                <div style={S.resValue}>{e.value}</div>
                {e.detail && <div style={S.resDetail}>{e.detail}</div>}
              </div>
            </button>
          );
        })}
      </nav>
      <section style={S.perfMain} aria-label={`${sel.name} performance`}>
        <div style={S.perfHead}>
          <h2 style={S.perfTitle}>{sel.name}</h2>
          <span style={S.subtle}>{sel.id === 'network' ? 'Receive (solid) and send (dashed)' : sel.id === 'dex' ? 'DEX renderer memory' : 'Utilization'}</span>
        </div>
        {!bridgeOk && sel.id !== 'dex' ? (
          <div style={S.empty}>System metrics come from the DEX desktop app; they are not available here. The DEX entry still reports this window's own memory.</div>
        ) : (
          <>
            <div style={S.chartBox}>
              <LineChart
                series={sel.series}
                series2={sel.id === 'network' ? hist.tx : undefined}
                max={sel.max}
                height={220}
                ariaLabel={`${sel.name} over the last minute`}
                axisLabel={label}
              />
              <div style={S.axisRow}><span>60 seconds</span><span>0</span></div>
            </div>
            <dl style={S.statGrid}>
              {stats.map(([k, v]) => (
                <div key={k} style={S.stat}>
                  <dt style={S.statK}>{k}</dt>
                  <dd style={S.statV}>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>
    </div>
  );
};

// -- DEX Apps view ------------------------------------------------------------------

interface AppsViewProps {
  apps: Array<{ id: string; name: string; icon?: string; launchedAt: number }>;
  currentAppId: string;
  onFocus: (id: string) => void;
  onQuit: (id: string) => void;
}

// Live AppLifecycle phase per app (the phases the shell broadcasts). Suspend is
// offered only for apps that listen for it and so really release their GPU,
// audio and timers.
const PHASE_LABEL: Record<AppPhase, string> = { foreground: 'In front', background: 'Background', suspended: 'Suspended' };
function useAppPhases(): Record<string, AppPhase> {
  const [phases, setPhases] = useState<Record<string, AppPhase>>(() => appLifecycle.snapshot());
  useEffect(() => appLifecycle.subscribeAll((id, phase) => setPhases((p) => (p[id] === phase ? p : { ...p, [id]: phase }))), []);
  return phases;
}

const AppsView: React.FC<AppsViewProps> = ({ apps, currentAppId, onFocus, onQuit }) => {
  const phases = useAppPhases();
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 15000); return () => window.clearInterval(t); }, []);
  if (apps.length === 0) return <div style={S.empty}>No DEX apps are open.</div>;
  return (
    <div style={S.scroll}>
      <div role="table" aria-label="Open DEX apps" style={{ minWidth: 0 }}>
        <div role="row" style={{ ...S.thead, gridTemplateColumns: APP_COLS }}>
          <span role="columnheader" style={S.thStatic}>App</span>
          <span role="columnheader" style={S.thStatic}>State</span>
          <span role="columnheader" style={{ ...S.thStatic, textAlign: 'right' }}>Open for</span>
          <span />
        </div>
        {apps.map(app => {
          const def = APP_DEFINITIONS[app.id];
          const active = app.id === currentAppId;
          const phase: AppPhase = phases[app.id] ?? appLifecycle.getPhase(app.id);
          const canSuspend = !active && phase !== 'foreground' && appLifecycle.handles(app.id);
          const label = def?.name || app.name;
          return (
            <div role="row" key={app.id} style={{ ...S.tr, gridTemplateColumns: APP_COLS, height: 36 }}>
              <span style={S.cellName}>
                <DexIcon name={def?.icon || app.icon || app.id} size={15} color="var(--color-text-secondary)" />
                {def?.name || app.name}
              </span>
              <span style={{ fontSize: 12, color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{active ? 'In front' : PHASE_LABEL[phase]}</span>
              <span style={{ ...S.cellNum, color: 'var(--color-text-tertiary)' }}>{fmtAge(app.launchedAt)}</span>
              <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {canSuspend && (
                  <button
                    type="button"
                    style={S.btnSm}
                    onClick={() => appLifecycle.setPhase(app.id, phase === 'suspended' ? 'background' : 'suspended')}
                    aria-label={`${phase === 'suspended' ? 'Resume' : 'Suspend'} ${label}`}
                    title={phase === 'suspended' ? 'Let it run in the background again' : 'Release its GPU, audio and timers until you open it'}
                  >
                    {phase === 'suspended' ? 'Resume' : 'Suspend'}
                  </button>
                )}
                {!active && <button type="button" style={S.btnSm} onClick={() => onFocus(app.id)}>Show</button>}
                <button type="button" style={S.btnSm} onClick={() => onQuit(app.id)} aria-label={`Quit ${def?.name || app.name}`}>Quit</button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// -- styles -----------------------------------------------------------------------

const PROC_COLS = 'minmax(140px, 1fr) 72px 72px 92px';
const APP_COLS = 'minmax(160px, 1fr) 110px 90px 200px';

const S: Record<string, React.CSSProperties> = {
  root: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', color: 'var(--color-text-primary)', background: 'var(--color-bg-base)', overflow: 'hidden', fontSize: 12 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 8, height: 44, flexShrink: 0, padding: '0 12px', borderBottom: '1px solid var(--color-border-subtle)' },
  segment: { display: 'inline-flex', padding: 2, gap: 2, borderRadius: 10, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' },
  segBtn: { height: 24, padding: '0 12px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  segBtnOn: { background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' },
  updated: { fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  select: { height: 26, borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontSize: 11.5, padding: '0 6px' },
  iconBtn: { width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 0, flexShrink: 0 },
  errorBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 12, color: 'var(--color-warning)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-secondary)' },
  textBtn: { border: 'none', background: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, padding: 0 },
  body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  scroll: { flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  split: { flex: 1, minHeight: 0, display: 'flex' },
  tableWrap: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  subbar: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexShrink: 0 },
  subtle: { fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400 },
  pill: { height: 24, padding: '0 10px', borderRadius: 9999, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11.5, cursor: 'pointer' },
  pillOn: { borderColor: 'var(--color-accent)', color: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' },
  thead: { display: 'grid', gridTemplateColumns: PROC_COLS, gap: 8, height: 26, alignItems: 'center', padding: '0 12px', borderTop: '1px solid var(--color-border-subtle)', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 },
  th: { display: 'flex', alignItems: 'center', height: '100%', padding: 0, border: 'none', background: 'none', color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  thStatic: { color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600 },
  tbody: { flex: 1, minHeight: 0, overflow: 'auto', outline: 'none' },
  tr: { display: 'grid', gridTemplateColumns: PROC_COLS, gap: 8, alignItems: 'center', height: PROCESS_ROW_H, padding: '0 12px', boxSizing: 'border-box', fontSize: 12, cursor: 'default', borderBottom: '1px solid color-mix(in srgb, var(--color-border-subtle) 50%, transparent)' },
  trSel: { background: 'color-mix(in srgb, var(--color-accent) 22%, transparent)' },
  groupRow: { width: '100%', border: 'none', borderBottom: '1px solid color-mix(in srgb, var(--color-border-subtle) 50%, transparent)', background: 'transparent', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer', fontWeight: 600 },
  chevron: { display: 'inline-block', width: 10, color: 'var(--color-text-tertiary)', transition: 'transform 0.12s ease' },
  cellName: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cellNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' },
  empty: { padding: 20, color: 'var(--color-text-tertiary)', fontSize: 12, lineHeight: 1.5 },
  inspector: { width: 260, flexShrink: 0, borderLeft: '1px solid var(--color-border-subtle)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', background: 'var(--color-bg-secondary)' },
  inspHead: { display: 'flex', alignItems: 'center', gap: 6 },
  inspTitle: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  kv: { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 6, margin: 0 },
  k: { color: 'var(--color-text-tertiary)', fontSize: 11.5 },
  v: { margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  inspActions: { display: 'flex', flexDirection: 'column', gap: 6 },
  btn: { height: 28, borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer' },
  btnDanger: { height: 28, borderRadius: 6, border: '1px solid color-mix(in srgb, var(--color-error) 45%, transparent)', background: 'transparent', color: 'var(--color-error)', fontSize: 12, cursor: 'pointer' },
  btnSm: { height: 24, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: 11.5, cursor: 'pointer' },
  hint: { margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.45 },
  resList: { width: 210, flexShrink: 0, overflow: 'auto', borderRight: '1px solid var(--color-border-subtle)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 },
  resItem: { display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center', padding: '7px 8px', borderRadius: 10, border: '1px solid transparent', background: 'transparent', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer' },
  resItemOn: { background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-subtle)' },
  resSpark: { height: 30, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border-subtle)' },
  resName: { fontSize: 12, fontWeight: 600 },
  resValue: { fontSize: 11.5, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' },
  resDetail: { fontSize: 10.5, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  perfMain: { flex: 1, minWidth: 0, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  perfHead: { display: 'flex', alignItems: 'baseline', gap: 10 },
  perfTitle: { margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' },
  chartBox: { border: '1px solid var(--color-border-subtle)', borderRadius: 6, overflow: 'hidden' },
  axisRow: { display: 'flex', justifyContent: 'space-between', padding: '3px 6px', fontSize: 10, color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border-subtle)' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px 20px', margin: 0 },
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
  statK: { fontSize: 11, color: 'var(--color-text-tertiary)' },
  statV: { margin: 0, fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
  statusBar: { display: 'flex', alignItems: 'center', gap: 16, height: 26, flexShrink: 0, padding: '0 12px', borderTop: '1px solid var(--color-border-subtle)', fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden' },
  num: { fontWeight: 500, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' },
};

export default TaskManager;
