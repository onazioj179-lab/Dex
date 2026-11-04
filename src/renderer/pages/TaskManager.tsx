// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DexIcon from '../components/DexIcon';
import { APP_DEFINITIONS, useRunningApps } from '../store/runningApps';
import { useStageStore, STAGE_DEFAULT_ID } from '../store/stageStore';
import { ConfirmDialog } from '../components/ConfirmDialog';
import NexusUkiPanel from '../components/NexusUkiPanel';
import ScheduledTasksPanel from '../components/ScheduledTasksPanel';
import SystemIntegrityPanel from '../components/SystemIntegrityPanel';
import NexusDiagnostics from '../components/NexusDiagnostics';
import { useVirtualList } from '../improvements500/virtualList';
import { DexSearchInput } from '../styles/components';
import { sendToNotes } from '../services/sendTo';
import { useElementSize } from '../utils/motionHooksExtended';
import { appLifecycle, type AppPhase } from '../services/AppLifecycle';

// Progressive detail (information priority): show what matters first, reveal
// diagnostics and advanced data only on request -- never everything at once.
//   1 Essential   - key metric cards only (CPU / Memory / Apps / Battery)
//   2 Detailed    - full metrics + workspaces / workflows / open apps
//   3 Advanced    - adds the full, virtualized system-process table
type DetailLevel = 1 | 2 | 3;
const DETAIL_LEVELS: { level: DetailLevel; label: string; title: string }[] = [
  { level: 1, label: 'Essential', title: 'Essential — key metrics only' },
  { level: 2, label: 'Detailed', title: 'Detailed — full metrics, workspaces, workflows, open apps' },
  { level: 3, label: 'Advanced', title: 'Advanced — adds the full system process table' },
];
const DETAIL_LEVEL_KEY = 'dex-taskmanager-detail';
// Activity (live system + apps) or Diagnostics (how DEX itself performs).
type NexusView = 'activity' | 'diagnostics';
const VIEW_KEY = 'dex-taskmanager-view';
const loadDetailLevel = (): DetailLevel => {
  try {
    const v = Number(localStorage.getItem(DETAIL_LEVEL_KEY));
    if (v === 1 || v === 2 || v === 3) return v;
  } catch { /* ignore */ }
  return 2;
};

// Fixed process-row height drives the windowed list (only visible rows mount,
// so the table stays smooth at thousands of processes).
const PROCESS_ROW_H = 30;

// Per-app lifecycle phase, read live from AppLifecycle (the same phases the
// shell broadcasts). Suspend is offered only for apps that listen for it and
// therefore really release their GPU / audio / timers; it used to be a select
// ("Realtime / Frozen") that changed nothing.
const PHASE_LABEL: Record<AppPhase, string> = { foreground: 'Foreground', background: 'Background', suspended: 'Suspended' };

function useAppPhases(): Record<string, AppPhase> {
  const [phases, setPhases] = useState<Record<string, AppPhase>>(() => appLifecycle.snapshot());
  useEffect(() => appLifecycle.subscribeAll((id, phase) => setPhases((p) => (p[id] === phase ? p : { ...p, [id]: phase }))), []);
  return phases;
}

interface SystemProcess {
  pid: number;
  name: string;
  cpu?: number;
  memory?: number;
}

interface SystemStatusInfo {
  cpu?: { usage: number; cores: number };
  memory?: { total: number; used: number; percent: number };
  battery?: { percent: number; charging: boolean; hasBattery?: boolean; timeRemaining?: number | null };
  network?: { connected: boolean; type?: string; rxBps?: number; txBps?: number };
  disk?: { used: number; total: number; percent: number };
  uptime?: number;
}

const HISTORY_LENGTH = 120;

const formatAge = (timestamp: number): string => {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const formatUptime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Just started';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const toneFor = (percent: number): string => (percent > 80 ? 'var(--color-error)' : percent > 55 ? 'var(--color-warning)' : 'var(--color-success)');

const batteryTone = (percent: number, charging: boolean): string => {
  if (charging) return '#30D158';
  if (percent < 15) return '#FF453A';
  if (percent < 30) return '#FF9F0A';
  return '#30D158';
};

const formatBps = (bps: number): string => {
  if (!Number.isFinite(bps) || bps <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bps;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
};

// Group key for "by application": collapse a process name into the application
// it most likely belongs to. Strips a trailing PID-ish suffix, a file
// extension, and the " Helper (Renderer)"-style qualifiers Chromium apps spawn,
// so e.g. "chrome.exe", "Code Helper (GPU)" and "node" each cluster sensibly.
const PINNED_KEY = 'dex-taskmanager-pinned';
const GROUP_BY_KEY = 'dex-taskmanager-groupby';

const groupKeyFor = (name: string): string => {
  let base = (name || 'unknown').trim();
  // Drop a Windows/Unix extension.
  base = base.replace(/\.(exe|app|bin|dll|sh)$/i, '');
  // Drop Chromium-style helper qualifiers: "Foo Helper (Renderer)" -> "Foo".
  base = base.replace(/\s+Helper(\s*\([^)]*\))?$/i, '');
  base = base.replace(/\s*\(([^)]*)\)\s*$/i, '');
  return base.trim() || (name || 'unknown');
};

const loadPinned = (): number[] => {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((n): n is number => typeof n === 'number');
  } catch { /* ignore */ }
  return [];
};

const loadGroupBy = (): boolean => {
  try { return localStorage.getItem(GROUP_BY_KEY) === '1'; } catch { /* ignore */ }
  return false;
};

const toastEvent = (type: 'success' | 'error' | 'info', message: string): void => {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* ignore */ }
};

interface SparklineProps {
  history: number[];
  color: string;
  height?: number;
  max?: number;
  ariaLabel: string;
}

const Sparkline: React.FC<SparklineProps> = ({ history, color, height = 36, max = 100, ariaLabel }) => {
  // Size from a ResizeObserver: calling getBoundingClientRect on every sample
  // forced a whole-document layout each second (and returned the zoomed size
  // on the spatial desktop).
  const { ref: canvasRef, width: cssW, height: cssH } = useElementSize<HTMLCanvasElement>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (!cssW || !cssH) return;
    const rect = { width: cssW, height: cssH };
    const widthPx = Math.max(60, Math.floor(rect.width));
    const heightPx = Math.max(20, Math.floor(rect.height));
    if (canvas.width !== widthPx * dpr || canvas.height !== heightPx * dpr) {
      canvas.width = widthPx * dpr;
      canvas.height = heightPx * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, widthPx, heightPx);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let gridIndex = 1; gridIndex < 4; gridIndex++) {
      const y = (heightPx / 4) * gridIndex;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(widthPx, y);
      ctx.stroke();
    }

    if (history.length < 2) return;

    const samples = history.slice(-HISTORY_LENGTH);
    const stepX = widthPx / (HISTORY_LENGTH - 1);
    const startIndex = HISTORY_LENGTH - samples.length;
    const safeMax = max <= 0 ? 1 : max;

    const pointFor = (value: number, index: number): [number, number] => {
      const clamped = Math.max(0, Math.min(safeMax, value));
      const x = (startIndex + index) * stepX;
      const y = heightPx - (clamped / safeMax) * (heightPx - 4) - 2;
      return [x, y];
    };

    const gradient = ctx.createLinearGradient(0, 0, 0, heightPx);
    gradient.addColorStop(0, color + '55');
    gradient.addColorStop(1, color + '00');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    const [firstX, firstY] = pointFor(samples[0], 0);
    ctx.moveTo(firstX, heightPx);
    ctx.lineTo(firstX, firstY);
    for (let i = 1; i < samples.length; i++) {
      const [x, y] = pointFor(samples[i], i);
      ctx.lineTo(x, y);
    }
    const lastSampleX = (startIndex + samples.length - 1) * stepX;
    ctx.lineTo(lastSampleX, heightPx);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(firstX, firstY);
    for (let i = 1; i < samples.length; i++) {
      const [x, y] = pointFor(samples[i], i);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    const [endX, endY] = pointFor(samples[samples.length - 1], samples.length - 1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(endX, endY, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }, [history, color, max, cssW, cssH]);

  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel} style={{ width: '100%', height, display: 'block' }} />;
};

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  history: number[];
  tone: string;
  max?: number;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, detail, history, tone, max = 100 }) => (
  <div className="dex-liquid-glass" style={styles.statCard}>
    <div style={styles.statLabel}>{label}</div>
    <div style={{ ...styles.statValue, color: tone }}>{value}</div>
    <div style={styles.statDetail}>{detail}</div>
    <div style={styles.sparkWrap}>
      <Sparkline history={history} color={tone} ariaLabel={`${label} history`} max={max} />
    </div>
  </div>
);

// Overview hero: a single radial gauge (the "current project" donut from the
// concept). SVG so it stays razor-sharp at any DPI and animates the sweep.
interface DonutProps { value: number; max?: number; size?: number; stroke?: number; color: string; ariaLabel: string }
const Donut: React.FC<DonutProps> = ({ value, max = 100, size = 104, stroke = 11, color, ariaLabel }) => {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, value / (max <= 0 ? 1 : max)));
  const dash = circ * pct;
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
      <circle cx={mid} cy={mid} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={mid} cy={mid} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`} transform={`rotate(-90 ${mid} ${mid})`}
        style={{ transition: 'stroke-dasharray 0.55s cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 5px ${color}55)` }}
      />
    </svg>
  );
};

// The big "Tasks Done" area chart from the concept, re-cast as a live load
// graph: a smooth monotone curve with a soft gradient fill and an endpoint glow.
interface AreaChartProps { history: number[]; color: string; height?: number; max?: number; ariaLabel: string }
const AreaChart: React.FC<AreaChartProps> = ({ history, color, height = 188, max = 100, ariaLabel }) => {
  const { ref: canvasRef, width: cssW, height: cssH } = useElementSize<HTMLCanvasElement>();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (!cssW || !cssH) return;
    const rect = { width: cssW, height: cssH };
    const w = Math.max(120, Math.floor(rect.width));
    const h = Math.max(80, Math.floor(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padT = 10;
    const padB = 6;
    const plotH = h - padT - padB;
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH / 3) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const samples = history.slice(-HISTORY_LENGTH);
    if (samples.length < 2) return;
    const safeMax = max <= 0 ? 1 : max;
    const stepX = w / (samples.length - 1);
    const pts: [number, number][] = samples.map((v, i) => {
      const clamped = Math.max(0, Math.min(safeMax, v));
      return [i * stepX, padT + plotH * (1 - clamped / safeMax)];
    });

    // Smooth curve through the points (midpoint cubic) -> the polished concept look.
    const trace = (close: boolean) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const cx = (x0 + x1) / 2;
        ctx.bezierCurveTo(cx, y0, cx, y1, x1, y1);
      }
      if (close) {
        ctx.lineTo(pts[pts.length - 1][0], h);
        ctx.lineTo(pts[0][0], h);
        ctx.closePath();
      }
    };

    const grad = ctx.createLinearGradient(0, padT, 0, h);
    grad.addColorStop(0, color + '5e');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    trace(true);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    trace(false);
    ctx.stroke();

    const last = pts[pts.length - 1];
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(last[0], last[1], 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color + '44';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(last[0], last[1], 3.4, 0, Math.PI * 2); ctx.stroke();
  }, [history, color, max, height, cssW, cssH]);
  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel} style={{ width: '100%', height, display: 'block' }} />;
};

// Compact "asset" tile (the Company files / Dribbble assets cards in the concept).
interface AssetTileProps { icon: string; tint: string; value: string; label: string; detail: string }
const AssetTile: React.FC<AssetTileProps> = ({ icon, tint, value, label, detail }) => (
  <div className="dex-liquid-glass" style={styles.assetTile}>
    <span style={{ ...styles.assetGlyph, background: tint + '22', color: tint, borderColor: tint + '40' }}>
      <DexIcon name={icon} size={16} color={tint} strokeWidth={2.2} />
    </span>
    <div style={{ minWidth: 0 }}>
      <div style={styles.assetValue}>{value}</div>
      <div style={styles.assetLabel}>{label}</div>
    </div>
    <div style={styles.assetDetail}>{detail}</div>
  </div>
);

const TaskManager: React.FC = () => {
  const runningApps = useRunningApps(state => state.runningApps);
  const currentAppId = useRunningApps(state => state.currentAppId);
  const closeApp = useRunningApps(state => state.closeApp);
  const setCurrentApp = useRunningApps(state => state.setCurrentApp);
  const [processes, setProcesses] = useState<SystemProcess[]>([]);
  const [status, setStatus] = useState<SystemStatusInfo>({});
  const [filter, setFilter] = useState('');
  const [bridgeAvailable, setBridgeAvailable] = useState(true);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [processHistory, setProcessHistory] = useState<number[]>([]);
  const [appHistory, setAppHistory] = useState<number[]>([]);
  const [batteryHistory, setBatteryHistory] = useState<number[]>([]);
  const [netRxHistory, setNetRxHistory] = useState<number[]>([]);
  const [netTxHistory, setNetTxHistory] = useState<number[]>([]);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(loadDetailLevel);
  const [view, setView] = useState<NexusView>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'diagnostics' ? 'diagnostics' : 'activity'; } catch { return 'activity'; }
  });
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ } }, [view]);
  // Process-table sort: local-only (no backend). Default mirrors the previous
  // hardcoded behaviour (CPU, highest first); clicking a header cycles it.
  const [sortKey, setSortKey] = useState<'name' | 'pid' | 'cpu' | 'memory'>('cpu');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [killing, setKilling] = useState<number | null>(null);
  const [hoveredPid, setHoveredPid] = useState<number | null>(null);
  const [killConfirm, setKillConfirm] = useState<{ pid: number; name: string; force: boolean; tree?: boolean } | null>(null);

  // -- Feature state (all renderer-local, persisted where it makes sense) --
  // Pinned watch-list of PIDs: pinned processes are floated to the top of the
  // table and rendered in their own always-visible strip.
  const [pinned, setPinned] = useState<number[]>(loadPinned);
  // Group-by-application toggle + which group rows are collapsed.
  const [groupBy, setGroupBy] = useState<boolean>(loadGroupBy);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // Selected process for the detail panel (by pid).
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  // First-seen timestamps so the detail panel can show how long a PID has been
  // observed in this session (the native payload carries no start time).
  const firstSeenRef = useRef<Map<number, number>>(new Map());

  // Pulse v2: workspace grouping + live app phases.
  const stages = useStageStore(s => s.stages);
  const activeStageId = useStageStore(s => s.activeStageId);
  const phases = useAppPhases();
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; steps: number; lastRun: number | null }>>([]);

  const pushSample = useCallback((setter: React.Dispatch<React.SetStateAction<number[]>>, value: number) => {
    setter(prev => {
      const next = prev.length >= HISTORY_LENGTH ? prev.slice(prev.length - HISTORY_LENGTH + 1) : prev.slice();
      next.push(Number.isFinite(value) ? value : 0);
      return next;
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    const dexApi = (window as any).dex;
    if (!dexApi?.system?.getStatus) {
      setBridgeAvailable(false);
      return;
    }
    try {
      const systemStatus = await dexApi.system.getStatus().catch(() => null);
      if (systemStatus) {
        setStatus(systemStatus);
        pushSample(setCpuHistory, systemStatus?.cpu?.usage ?? 0);
        pushSample(setMemoryHistory, systemStatus?.memory?.percent ?? 0);
        if (systemStatus?.battery?.hasBattery !== false) {
          pushSample(setBatteryHistory, systemStatus?.battery?.percent ?? 0);
        }
        pushSample(setNetRxHistory, systemStatus?.network?.rxBps ?? 0);
        pushSample(setNetTxHistory, systemStatus?.network?.txBps ?? 0);
        setBridgeAvailable(true);
      }
    } catch {
      setBridgeAvailable(false);
    }
  }, [pushSample]);

  const refreshProcesses = useCallback(async () => {
    const dexApi = (window as any).dex;
    if (!dexApi?.system?.getProcesses) {
      setBridgeAvailable(false);
      return;
    }
    try {
      const processList = await dexApi.system.getProcesses().catch(() => []);
      const list = Array.isArray(processList) ? processList : [];
      // Record the first time each PID is observed so the detail panel can show
      // an approximate age (the native payload has no start time).
      const seen = firstSeenRef.current;
      const now = Date.now();
      const livePids = new Set<number>();
      for (const proc of list) {
        if (typeof proc?.pid === 'number') {
          livePids.add(proc.pid);
          if (!seen.has(proc.pid)) seen.set(proc.pid, now);
        }
      }
      // Prune PIDs that are gone so the map cannot grow unbounded.
      for (const pid of Array.from(seen.keys())) if (!livePids.has(pid)) seen.delete(pid);
      setProcesses(list);
      pushSample(setProcessHistory, list.length);
      setBridgeAvailable(true);
    } catch {
      setBridgeAvailable(false);
    }
  }, [pushSample]);

  useEffect(() => {
    refreshStatus();
    refreshProcesses();
    let statusTimer: number | null = window.setInterval(refreshStatus, 1000);
    let processTimer: number | null = window.setInterval(refreshProcesses, 3000);
    const stop = () => {
      if (statusTimer !== null) { window.clearInterval(statusTimer); statusTimer = null; }
      if (processTimer !== null) { window.clearInterval(processTimer); processTimer = null; }
    };
    const start = () => {
      if (statusTimer === null) { refreshStatus(); statusTimer = window.setInterval(refreshStatus, 1000); }
      if (processTimer === null) { refreshProcesses(); processTimer = window.setInterval(refreshProcesses, 3000); }
    };
    const onVisibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshStatus, refreshProcesses]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      pushSample(setAppHistory, runningApps.filter(app => app.id !== 'home').length);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pushSample, runningApps]);

  // Workflows section: read the saved automations (same source as the Workflows
  // app — native `workflows:getAll` with the localStorage fallback). Read-only
  // summary; status lives in the ephemeral engine, so we show steps + last run.
  const refreshWorkflows = useCallback(async () => {
    let list: any[] = [];
    try {
      const dexApi = (window as any).dex;
      if (dexApi?.workflows?.getAll) {
        const remote = await dexApi.workflows.getAll().catch(() => null);
        if (Array.isArray(remote)) list = remote;
      }
      if (list.length === 0) {
        const saved = localStorage.getItem('dex-workflows');
        if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) list = parsed; }
      }
    } catch { /* ignore */ }
    setWorkflows(list.map((w: any) => ({
      id: String(w?.id ?? ''),
      name: String(w?.name ?? 'Untitled workflow'),
      steps: typeof w?.steps === 'number' ? w.steps : Array.isArray(w?.nodes) ? w.nodes.length : 0,
      lastRun: w?.lastRun ? (typeof w.lastRun === 'number' ? w.lastRun : Date.parse(w.lastRun) || null) : null,
    })));
  }, []);

  useEffect(() => {
    refreshWorkflows();
    const timer = window.setInterval(refreshWorkflows, 5000);
    return () => window.clearInterval(timer);
  }, [refreshWorkflows]);

  // Persist the chosen detail level so the monitor opens where the user left it.
  useEffect(() => {
    try { localStorage.setItem(DETAIL_LEVEL_KEY, String(detailLevel)); } catch { /* ignore */ }
  }, [detailLevel]);

  // Persist the pinned watch-list and the group-by toggle.
  useEffect(() => {
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(pinned)); } catch { /* ignore */ }
  }, [pinned]);
  useEffect(() => {
    try { localStorage.setItem(GROUP_BY_KEY, groupBy ? '1' : '0'); } catch { /* ignore */ }
  }, [groupBy]);

  const visibleProcesses = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const dir = sortDir === 'asc' ? 1 : -1;
    const sortedProcesses = [...processes].sort((first, second) => {
      if (sortKey === 'name') return dir * first.name.localeCompare(second.name);
      const a = sortKey === 'pid' ? first.pid : sortKey === 'memory' ? (first.memory || 0) : (first.cpu || 0);
      const b = sortKey === 'pid' ? second.pid : sortKey === 'memory' ? (second.memory || 0) : (second.cpu || 0);
      return dir * (a - b);
    });
    // No hard cap: the list is windowed (useVirtualList), so only on-screen rows
    // ever mount even with thousands of processes.
    if (!query) return sortedProcesses;
    return sortedProcesses.filter(
      process => process.name.toLowerCase().includes(query) || String(process.pid).includes(query),
    );
  }, [filter, processes, sortKey, sortDir]);

  // Header click: toggle direction on the active column, else switch column with
  // a sensible default (numbers high-first, name A->Z).
  const handleSort = useCallback((key: 'name' | 'pid' | 'cpu' | 'memory') => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return prev; }
      setSortDir(key === 'name' ? 'asc' : 'desc');
      return key;
    });
  }, []);
  const sortArrow = (key: 'name' | 'pid' | 'cpu' | 'memory') => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  const togglePin = useCallback((pid: number) => {
    setPinned(prev => (prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]));
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Aggregate application groups (CPU/mem sums + child count) over the filtered,
  // sorted process list. Group order follows the active sort applied to each
  // group's aggregate, so "sort by CPU" surfaces the heaviest app first.
  interface ProcGroup { key: string; processes: SystemProcess[]; cpu: number; memory: number }
  const groups = useMemo<ProcGroup[]>(() => {
    const map = new Map<string, ProcGroup>();
    for (const proc of visibleProcesses) {
      const key = groupKeyFor(proc.name);
      let group = map.get(key);
      if (!group) { group = { key, processes: [], cpu: 0, memory: 0 }; map.set(key, group); }
      group.processes.push(proc);
      group.cpu += proc.cpu || 0;
      group.memory += proc.memory || 0;
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return Array.from(map.values()).sort((a, b) => {
      if (sortKey === 'name') return dir * a.key.localeCompare(b.key);
      if (sortKey === 'memory') return dir * (a.memory - b.memory);
      if (sortKey === 'pid') return dir * (a.processes[0].pid - b.processes[0].pid);
      return dir * (a.cpu - b.cpu);
    });
  }, [visibleProcesses, sortKey, sortDir]);

  // Flatten everything the table renders into a single uniform-height row list,
  // so virtualization stays valid. Row kinds: pinned process, group header,
  // process. Pinned processes always lead, regardless of grouping.
  type TableRow =
    | { kind: 'pinned'; process: SystemProcess }
    | { kind: 'group'; group: ProcGroup }
    | { kind: 'process'; process: SystemProcess; grouped: boolean };
  const tableRows = useMemo<TableRow[]>(() => {
    const rows: TableRow[] = [];
    const pinnedProcs = visibleProcesses.filter(p => pinnedSet.has(p.pid));
    for (const proc of pinnedProcs) rows.push({ kind: 'pinned', process: proc });
    if (groupBy) {
      for (const group of groups) {
        rows.push({ kind: 'group', group });
        if (!collapsedGroups[group.key]) {
          for (const proc of group.processes) {
            if (pinnedSet.has(proc.pid)) continue;
            rows.push({ kind: 'process', process: proc, grouped: true });
          }
        }
      }
    } else {
      for (const proc of visibleProcesses) {
        if (pinnedSet.has(proc.pid)) continue;
        rows.push({ kind: 'process', process: proc, grouped: false });
      }
    }
    return rows;
  }, [visibleProcesses, groups, groupBy, collapsedGroups, pinnedSet]);

  // The detail-panel target, resolved from the live process list (so its metrics
  // update each refresh). Falls back to null once the PID disappears.
  const selectedProcess = useMemo(
    () => (selectedPid == null ? null : processes.find(p => p.pid === selectedPid) || null),
    [selectedPid, processes],
  );

  // Windowed process table: drives padTop/visible-rows/padBottom from scrollTop.
  const procVirtual = useVirtualList({ itemCount: tableRows.length, rowHeight: PROCESS_ROW_H, bufferRows: 6 });

  const shellApps = runningApps.filter(app => app.id !== 'home');
  const cpuUsage = status.cpu?.usage ?? 0;
  const memoryPercent = status.memory?.percent ?? 0;
  const memoryDetail = status.memory
    ? `${(status.memory.used / 1024 ** 3).toFixed(1)} / ${(status.memory.total / 1024 ** 3).toFixed(1)} GB`
    : 'Waiting for system bridge';
  const cpuDetail = status.cpu
    ? `${status.cpu.cores || '?'} cores - ${cpuUsage > 80 ? 'High load' : cpuUsage > 55 ? 'Moderate' : 'Nominal'}`
    : 'Waiting for system bridge';
  const processCount = processes.length;
  const appsTone = shellApps.length > 12 ? '#FF9F0A' : '#0A84FF';

  const battery = status.battery;
  const hasBattery = battery && battery.hasBattery !== false;
  const batteryPercent = battery?.percent ?? 0;
  const batteryDetail = !hasBattery
    ? 'No battery detected'
    : battery?.charging
      ? 'Charging'
      : (battery?.timeRemaining && battery.timeRemaining > 0)
        ? `${Math.round(battery.timeRemaining)} min remaining`
        : 'On battery';
  const uptimeSeconds = status.uptime ?? 0;
  const networkConnected = status.network?.connected ?? false;
  const rxBps = status.network?.rxBps ?? 0;
  const txBps = status.network?.txBps ?? 0;
  const diskPercent = status.disk?.percent ?? 0;
  const diskDetail = status.disk
    ? `${(status.disk.used / 1024 ** 3).toFixed(0)} / ${(status.disk.total / 1024 ** 3).toFixed(0)} GB`
    : 'No disk data';

  // -- Snapshot export: a plain-text table of the top processes -> Notes. ----
  const handleExportSnapshot = useCallback(() => {
    try {
      const top = [...processes]
        .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
        .slice(0, 25);
      if (top.length === 0) { toastEvent('info', 'No process data to export yet'); return; }
      const stamp = new Date().toLocaleString();
      const padR = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
      const padL = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
      const headerRow = `${padR('PROCESS', 28)} ${padL('PID', 8)} ${padL('CPU%', 7)} ${padL('MEM(MB)', 9)}`;
      const divider = '-'.repeat(headerRow.length);
      const lines = top.map(p =>
        `${padR(p.name || 'unknown', 28)} ${padL(String(p.pid), 8)} ${padL((p.cpu || 0).toFixed(1), 7)} ${padL(String(Math.round(p.memory || 0)), 9)}`,
      );
      const summary = [
        `DEX Task Manager snapshot — ${stamp}`,
        '',
        `CPU: ${cpuUsage}%   Memory: ${memoryPercent}%   Processes: ${processes.length}`,
        hasBattery ? `Battery: ${batteryPercent}% (${battery?.charging ? 'charging' : 'on battery'})` : '',
        `Top ${top.length} processes by CPU:`,
        '',
        headerRow,
        divider,
        ...lines,
      ].filter(line => line !== '').join('\n');
      void sendToNotes(summary, `Task Manager snapshot — ${stamp}`);
    } catch (e) {
      console.warn('[TaskManager] snapshot export failed', e);
      toastEvent('error', 'Could not export snapshot');
    }
  }, [processes, cpuUsage, memoryPercent, hasBattery, batteryPercent, battery]);

  // -- Health monitoring (Task Manager 2.0) --------------------------------
  // Detect resource spikes and runaway processes, and surface a
  // recovery action (end the worst offender). Thresholds mirror the metric tones.
  const topProcess = useMemo(() => {
    let top: SystemProcess | null = null;
    for (const p of processes) if ((p.cpu || 0) > (top?.cpu ?? -1)) top = p;
    return top;
  }, [processes]);
  const health = useMemo(() => {
    const issues: string[] = [];
    let critical = false;
    let elevated = false;
    if (cpuUsage > 85) { issues.push(`CPU critical at ${cpuUsage}%`); critical = true; }
    else if (cpuUsage > 70) { issues.push(`CPU elevated at ${cpuUsage}%`); elevated = true; }
    if (memoryPercent > 90) { issues.push(`Memory critical at ${memoryPercent}%`); critical = true; }
    else if (memoryPercent > 80) { issues.push(`Memory high at ${memoryPercent}%`); elevated = true; }
    if (topProcess && (topProcess.cpu || 0) > 80) {
      issues.push(`${topProcess.name} using ${Math.round(topProcess.cpu || 0)}% CPU`);
      elevated = true;
    }
    const level: 'healthy' | 'elevated' | 'critical' = critical ? 'critical' : elevated ? 'elevated' : 'healthy';
    // Name the dominant resource for the pill: pick whichever of CPU/Mem is the
    // bigger offender (highest % over its own elevated threshold), derived from
    // the same status values that set the level above.
    let bottleneck: string | null = null;
    if (level !== 'healthy') {
      const cpuOver = cpuUsage > 70 ? cpuUsage - 70 : -1;
      const memOver = memoryPercent > 80 ? memoryPercent - 80 : -1;
      if (cpuOver >= 0 || memOver >= 0) {
        bottleneck = cpuOver >= memOver ? `CPU ${cpuUsage}%` : `Mem ${memoryPercent}%`;
      }
    }
    return { level, issues, bottleneck };
  }, [cpuUsage, memoryPercent, topProcess]);
  const healthTone = health.level === 'critical' ? '#FF453A' : health.level === 'elevated' ? '#FF9F0A' : '#30D158';
  const healthLabel = health.level === 'critical' ? 'Critical' : health.level === 'elevated' ? 'Elevated' : 'Healthy';
  const healthPillText = health.bottleneck ? `${healthLabel} · ${health.bottleneck}` : healthLabel;

  const handleManualRefresh = () => {
    refreshStatus();
    refreshProcesses();
  };

  const handleEndProcess = useCallback((pid: number, name: string) => {
    if (typeof pid !== 'number' || pid <= 0) return;
    const dexApi = (window as any).dex;
    if (!dexApi?.system?.killProcess) return;
    setKillConfirm({ pid, name, force: false });
  }, []);

  // Kill-tree (Tier 5 / 45): terminate the process AND all of its descendants,
  // so closing a parent never leaves orphaned/zombie children behind.
  const handleEndTree = useCallback((pid: number, name: string) => {
    if (typeof pid !== 'number' || pid <= 0) return;
    const dexApi = (window as any).dex;
    if (!dexApi?.system?.killProcessTree) return;
    setKillConfirm({ pid, name, force: false, tree: true });
  }, []);

  const executeKill = useCallback(async () => {
    if (!killConfirm) return;
    const { pid, name, force, tree } = killConfirm;
    setKillConfirm(null);
    setKilling(pid);
    try {
      const dexApi = (window as any).dex;
      const result = tree
        ? await dexApi.system.killProcessTree(pid, force)
        : await dexApi.system.killProcess(pid, force);
      if (result && result.success === false && !force) {
        setKillConfirm({ pid, name, force: true, tree });
      } else {
        await refreshProcesses();
      }
    } catch (e) {
      console.warn('[TaskManager] kill failed', e);
    } finally {
      setKilling(null);
    }
  }, [killConfirm, refreshProcesses]);

  return (
    <div style={styles.container}>
      <ConfirmDialog
        open={killConfirm !== null}
        title={killConfirm?.force
          ? `Force Kill "${killConfirm.name}"${killConfirm?.tree ? ' + children' : ''}?`
          : killConfirm?.tree ? `End "${killConfirm?.name}" and all children?` : `End Process "${killConfirm?.name}"?`}
        message={killConfirm?.force
          ? 'Could not end gracefully. Force kill will immediately terminate the process.'
          : killConfirm?.tree
            ? 'This ends the process and every child process it spawned. Unsaved work in any of them will be lost.'
            : 'Unsaved work in this process will be lost.'}
        confirmLabel={killConfirm?.force ? 'Force Kill' : killConfirm?.tree ? 'End Tree' : 'End Process'}
        tone="destructive"
        onConfirm={executeKill}
        onCancel={() => setKillConfirm(null)}
      />
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <span style={styles.titleIcon}><DexIcon name="activity" size={18} color="#fff" strokeWidth={2.25} /></span>
          <div>
            <h2 style={styles.title}>Task Manager</h2>
            <div style={styles.subtitle}>Live performance, running apps, and process activity</div>
          </div>
          <span
            data-health-pill
            title={health.issues.join(' · ') || 'All systems nominal'}
            style={{ ...styles.healthPill, color: healthTone, borderColor: healthTone + '66', background: healthTone + '14' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 9999, background: healthTone, display: 'inline-block' }} />
            {healthPillText}
          </span>
        </div>
        <div style={styles.headerControls}>
          <div style={styles.segGroup} role="tablist" aria-label="View">
            {(['activity', 'diagnostics'] as NexusView[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                style={{ ...styles.segButton, ...(view === v ? styles.segButtonActive : null) }}
              >
                {v === 'activity' ? 'Activity' : 'Diagnostics'}
              </button>
            ))}
          </div>
          {view === 'activity' && (<>
          <div style={styles.segGroup} role="group" aria-label="Detail level">
            {DETAIL_LEVELS.map(({ level, label, title }) => (
              <button
                key={level}
                onClick={() => setDetailLevel(level)}
                aria-pressed={detailLevel === level}
                title={title}
                style={{ ...styles.segButton, ...(detailLevel === level ? styles.segButtonActive : null) }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            style={{ ...styles.refreshButton, opacity: processes.length === 0 ? 0.5 : 1 }}
            onClick={handleExportSnapshot}
            disabled={processes.length === 0}
            aria-label="Send a snapshot of current usage to Notes"
            title="Send a text table of the top processes to Notes"
          >
            <DexIcon name="file-text" size={14} /> Send to Notes
          </button>
          <button style={styles.refreshButton} onClick={handleManualRefresh} aria-label="Refresh Task Manager">
            <DexIcon name="refresh" size={14} /> Refresh
          </button>
          </>)}
        </div>
      </div>

      {view === 'diagnostics' && <NexusDiagnostics />}
      <div style={{ display: view === 'diagnostics' ? 'none' : 'contents' }}>

      {health.level !== 'healthy' && (
        <div
          data-health-banner
          role="status"
          style={{ ...styles.healthBanner, borderColor: healthTone + '55', background: healthTone + '12' }}
        >
          <DexIcon name="activity" size={15} color={healthTone} strokeWidth={2.3} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--color-text-primary)' }}>
            <strong style={{ color: healthTone }}>{healthLabel}:</strong> {health.issues.join(' · ')}
          </span>
          {topProcess && (topProcess.cpu || 0) > 80 && (
            <button
              style={styles.endButton}
              onClick={() => handleEndProcess(topProcess.pid, topProcess.name)}
              aria-label={`End ${topProcess.name}`}
            >
              End {topProcess.name}
            </button>
          )}
        </div>
      )}

      {/* UKI-driven Nexus: surfaces UKI's live mind (status, memory, recent turns,
          reasoning trail, knowledge graph) from the ukiStore. Folds away when not
          wanted; degrades to a calm empty state before UKI has done anything. */}
      <NexusUkiPanel />

      {/* Scheduled background tasks: recurring cron/interval reminders that the
          scheduledTaskRunner fires on the shared heartbeat, retrying on failure. */}
      <ScheduledTasksPanel />

      {/* Integrity checks + performance alerts from the background monitors. */}
      <SystemIntegrityPanel />

      {/* Overview hero — the concept's Overview page, driven by live system data:
          two headline cards + a radial load gauge, a row of asset tiles, the big
          smooth load chart, and a right-hand "focus" card mirroring the project
          panel (top process + progress + running-app avatars + uptime). */}
      <div style={styles.heroGrid}>
        <div style={styles.heroLeft}>
          <div style={styles.heroTopRow}>
            <div className="dex-liquid-glass" style={styles.heroBigCard}>
              <span style={styles.heroIconTile}><DexIcon name="layers" size={20} color="#fff" strokeWidth={2.3} /></span>
              <div style={styles.heroBigValue}>
                {bridgeAvailable ? processCount : shellApps.length}
                <span style={styles.heroBigPlus}>+</span>
              </div>
              <div style={styles.heroBigLabel}>{bridgeAvailable ? 'Active processes' : 'DEX apps running'}</div>
              <div style={styles.heroDelta}>
                <span style={{ color: appsTone }}>{shellApps.length} DEX apps</span> open · sampled live
              </div>
            </div>

            <div className="dex-liquid-glass" style={styles.heroDonutCard}>
              <div style={styles.heroDonutTitle}>System Load</div>
              <div style={styles.heroDonutWrap}>
                <Donut value={cpuUsage} color={toneFor(cpuUsage)} ariaLabel={`CPU load ${cpuUsage} percent`} />
                <div style={styles.heroDonutCenter}>
                  <div style={{ fontSize: 24, fontWeight: 780, color: toneFor(cpuUsage), fontVariantNumeric: 'tabular-nums' }}>{cpuUsage}%</div>
                  <div style={styles.heroDonutUnit}>CPU</div>
                </div>
              </div>
              <div style={styles.heroDonutFoot}>{cpuDetail}</div>
            </div>
          </div>

          <div style={styles.heroAssetRow}>
            <AssetTile
              icon="hard-drive"
              tint="#5E5CE6"
              value={`${memoryPercent}%`}
              label="Memory"
              detail={memoryDetail}
            />
            {hasBattery ? (
              <AssetTile
                icon="battery"
                tint={batteryTone(batteryPercent, !!battery?.charging)}
                value={`${batteryPercent}%`}
                label="Battery"
                detail={batteryDetail}
              />
            ) : status.disk ? (
              <AssetTile
                icon="database"
                tint={toneFor(diskPercent)}
                value={`${diskPercent}%`}
                label="Disk"
                detail={diskDetail}
              />
            ) : (
              <AssetTile
                icon="wifi"
                tint={networkConnected ? '#5AC8FA' : 'var(--color-text-tertiary)'}
                value={networkConnected ? 'Online' : 'Offline'}
                label="Network"
                detail={`${formatBps(rxBps)} down`}
              />
            )}
          </div>

          <div className="dex-liquid-glass" style={styles.chartCard}>
            <div style={styles.chartHead}>
              <div>
                <div style={styles.chartTitle}>Load history</div>
                <div style={styles.chartSub}>CPU utilization over the last {Math.min(cpuHistory.length, HISTORY_LENGTH)} samples</div>
              </div>
              <div style={styles.chartRangePills} aria-hidden="true">
                <span style={styles.chartPill}>CPU</span>
                <span style={{ ...styles.chartPill, ...styles.chartPillMuted }}>Live</span>
              </div>
            </div>
            <AreaChart history={cpuHistory} color="#7B5CFF" max={100} ariaLabel="CPU load over time" />
          </div>
        </div>

        <div className="dex-liquid-glass-strong" style={styles.focusCard}>
          <div style={styles.focusTop}>
            <span style={{ ...styles.healthPill, color: healthTone, borderColor: healthTone + '66', background: healthTone + '18', margin: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: 9999, background: healthTone, display: 'inline-block' }} />
              {healthLabel}
            </span>
            <span style={styles.focusUptime}>{formatUptime(uptimeSeconds)} up</span>
          </div>
          <div style={styles.focusHeading}>{topProcess?.name || 'System idle'}</div>
          <div style={styles.focusKicker}>{topProcess ? 'Top process by CPU' : 'No heavy process right now'}</div>

          <div style={styles.focusProgressRow}>
            <span>Load</span>
            <span style={{ color: toneFor(Math.round(topProcess?.cpu || cpuUsage)) }}>{Math.round(topProcess?.cpu || cpuUsage)}%</span>
          </div>
          <div style={styles.focusProgressTrack}>
            <div style={{ ...styles.focusProgressFill, width: `${Math.max(3, Math.min(100, Math.round(topProcess?.cpu || cpuUsage)))}%`, background: toneFor(Math.round(topProcess?.cpu || cpuUsage)) }} />
          </div>

          <div style={styles.focusAvatars}>
            {shellApps.slice(0, 5).map((app, i) => {
              const def = APP_DEFINITIONS[app.id];
              return (
                <span key={app.id} title={def?.name || app.name} style={{ ...styles.focusAvatar, marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
                  <DexIcon name={def?.icon || app.icon || app.id} size={14} color="#fff" strokeWidth={2.2} />
                </span>
              );
            })}
            <span style={styles.focusAvatarsLabel}>
              {shellApps.length === 0 ? 'No apps open' : `${shellApps.length} app${shellApps.length === 1 ? '' : 's'} active`}
            </span>
          </div>

          {topProcess && (topProcess.cpu || 0) > 60 && (
            <button style={styles.focusAction} onClick={() => handleEndProcess(topProcess.pid, topProcess.name)} aria-label={`End ${topProcess.name}`}>
              End {topProcess.name}
            </button>
          )}
        </div>
      </div>

      {/* Lower-signal diagnostics (uptime, throughput) stay available in Advanced. */}
      {detailLevel >= 3 && (
        <div style={styles.statsGrid}>
          <MetricCard
            label="Processes"
            value={bridgeAvailable ? String(processCount) : 'Local'}
            detail={bridgeAvailable ? `${visibleProcesses.length} listed - sampled every 3s` : 'DEX apps only'}
            history={processHistory}
            tone="#5E5CE6"
            max={Math.max(50, ...processHistory)}
          />
          <MetricCard
            label="Network Rx"
            value={formatBps(rxBps)}
            detail={networkConnected ? 'Receiving' : 'Offline'}
            history={netRxHistory}
            tone="#5AC8FA"
            max={Math.max(1024, ...netRxHistory)}
          />
          <MetricCard
            label="Network Tx"
            value={formatBps(txBps)}
            detail={networkConnected ? 'Sending' : 'Offline'}
            history={netTxHistory}
            tone="#FF9F0A"
            max={Math.max(1024, ...netTxHistory)}
          />
          {status.disk && (
            <div className="dex-liquid-glass" style={styles.statCard}>
              <div style={styles.statLabel}>Disk</div>
              <div style={{ ...styles.statValue, color: toneFor(diskPercent), fontSize: 20 }}>{diskPercent}%</div>
              <div style={styles.statDetail}>{diskDetail}</div>
              <div style={styles.sparkWrap} />
            </div>
          )}
        </div>
      )}

      {detailLevel >= 2 && (
      <div style={styles.contentGrid}>
        {stages.length > 0 && (
        <section className="dex-liquid-glass" style={{ ...styles.panel, gridColumn: '1 / -1' }}>
          <div style={styles.panelHeader}>
            <span>Workspaces</span>
            <span style={styles.countPill}>{stages.length}</span>
          </div>
          <div style={{ ...styles.list, flexDirection: 'row', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {stages.map(stage => {
              const stageApps = stage.windows.map(w => w.appId);
              const isActive = stage.id === activeStageId;
              return (
                <div
                  key={stage.id}
                  style={{
                    flex: '1 1 220px', minWidth: 220, padding: 10, borderRadius: 10,
                    border: '1px solid ' + (isActive ? 'rgba(74,158,255,0.42)' : 'var(--color-border-subtle)'),
                    background: isActive ? 'rgba(74,158,255,0.06)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{stage.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stage.posture}</span>
                    {isActive && <span style={{ fontSize: 10, color: 'var(--color-accent)', marginLeft: 'auto' }}>active</span>}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {stageApps.length === 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>No windows captured</span>
                    ) : stageApps.map(appId => {
                      const def = APP_DEFINITIONS[appId];
                      return (
                        <span key={appId} title={def?.name || appId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', fontSize: 11 }}>
                          <DexIcon name={def?.icon || appId} size={11} color="#fff" strokeWidth={2.2} />
                          {def?.name || appId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {stages.length === 1 && stages[0].id === STAGE_DEFAULT_ID && (
              <div style={{ flex: '0 0 100%', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Tip: create additional Stages to group windows by context (Edit, Focus, Music, Play).
              </div>
            )}
          </div>
        </section>
        )}

        <section className="dex-liquid-glass" style={{ ...styles.panel, gridColumn: '1 / -1' }}>
          <div style={styles.panelHeader}>
            <span>Workflows</span>
            <span style={styles.countPill}>{workflows.length}</span>
          </div>
          <div style={{ ...styles.list, flexDirection: 'row', flexWrap: 'wrap', gap: 'var(--space-2)', maxHeight: 150 }}>
            {workflows.length === 0 ? (
              <div style={styles.empty}>No workflows yet. Build one in the Workflows app.</div>
            ) : workflows.map(wf => (
              <div
                key={wf.id || wf.name}
                style={{ flex: '1 1 220px', minWidth: 220, padding: 10, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'rgba(255,255,255,0.03)' }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {wf.steps} step{wf.steps === 1 ? '' : 's'} · {wf.lastRun ? `last run ${formatAge(wf.lastRun)} ago` : 'never run'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="dex-liquid-glass" style={{ ...styles.panel, ...(detailLevel < 3 ? { gridColumn: '1 / -1' } : null) }}>
          <div style={styles.panelHeader}>
            <span>Open Apps</span>
            <span style={styles.countPill}>{shellApps.length}</span>
          </div>
          <div style={styles.list}>
            {shellApps.length === 0 ? (
              <div style={styles.empty}>No apps are currently open.</div>
            ) : shellApps.map(app => {
              const definition = APP_DEFINITIONS[app.id];
              const active = currentAppId === app.id;
              const phase: AppPhase = phases[app.id] ?? appLifecycle.getPhase(app.id);
              const canSuspend = !active && phase !== 'foreground' && appLifecycle.handles(app.id);
              return (
                <div key={app.id} style={{ ...styles.appRow, borderColor: active ? 'rgba(74,158,255,0.42)' : 'var(--color-border-subtle)' }}>
                  <div style={styles.appGlyph}><DexIcon name={definition?.icon || app.icon || app.id} size={18} color="#fff" strokeWidth={2.2} /></div>
                  <div style={styles.appMeta}>
                    <div style={styles.appName}>{definition?.name || app.name}</div>
                    <div style={styles.appDetail}>{active ? 'Focused' : PHASE_LABEL[phase]} - open {formatAge(app.launchedAt)}</div>
                  </div>
                  <button style={styles.ghostButton} onClick={() => setCurrentApp(app.id)} aria-label={`Focus ${definition?.name || app.name}`}>Focus</button>
                  {canSuspend && (
                    <button style={styles.ghostButton}
                      onClick={() => appLifecycle.setPhase(app.id, phase === 'suspended' ? 'background' : 'suspended')}
                      aria-label={`${phase === 'suspended' ? 'Resume' : 'Suspend'} ${definition?.name || app.name}`}
                      title={phase === 'suspended' ? 'Let it run in the background again' : 'Release its GPU, audio and timers until you open it'}>
                      {phase === 'suspended' ? 'Resume' : 'Suspend'}
                    </button>
                  )}
                  <button style={styles.endButton} onClick={() => closeApp(app.id)} aria-label={`End ${definition?.name || app.name}`}>End</button>
                </div>
              );
            })}
          </div>
        </section>

        {detailLevel >= 3 && (
        <section className="dex-liquid-glass" style={styles.panel}>
          <div style={styles.panelHeader}>
            <span>System Processes</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {pinned.length > 0 && (
                <span style={{ ...styles.countPill, background: 'rgba(255,159,10,0.16)', color: '#FFB340' }} title="Pinned to watch list">
                  {pinned.length} pinned
                </span>
              )}
              <button
                type="button"
                onClick={() => setGroupBy(g => !g)}
                aria-pressed={groupBy}
                title="Group processes by application"
                style={{ ...styles.toggleButton, ...(groupBy ? styles.toggleButtonActive : null) }}
              >
                <DexIcon name="layers" size={12} /> Group
              </button>
              <DexSearchInput
                size="sm"
                value={filter}
                onChange={event => setFilter(event.target.value)}
                onClear={() => setFilter('')}
                placeholder="Filter by name"
                aria-label="Filter system processes"
                style={{ width: 150 }}
              />
            </div>
          </div>
          <div style={styles.processTableHead}>
            <button type="button" style={styles.sortHeader} onClick={() => handleSort('name')} aria-label="Sort by name">Name{sortArrow('name')}</button>
            <button type="button" style={{ ...styles.sortHeader, justifyContent: 'flex-end' }} onClick={() => handleSort('pid')} aria-label="Sort by PID">PID{sortArrow('pid')}</button>
            <button type="button" style={{ ...styles.sortHeader, justifyContent: 'flex-end' }} onClick={() => handleSort('cpu')} aria-label="Sort by CPU">CPU{sortArrow('cpu')}</button>
            <button type="button" style={{ ...styles.sortHeader, justifyContent: 'flex-end' }} onClick={() => handleSort('memory')} aria-label="Sort by memory">RAM{sortArrow('memory')}</button>
            <span style={{ textAlign: 'right' }}>Action</span>
          </div>
          <div ref={procVirtual.ref as React.RefObject<HTMLDivElement>} onScroll={procVirtual.onScroll} style={styles.processTable}>
            {!bridgeAvailable ? (
              <div style={styles.empty}>Native process bridge is unavailable in this build. DEX app management remains active.</div>
            ) : tableRows.length === 0 ? (
              <div style={styles.empty}>No processes to show yet.</div>
            ) : (
              <>
                <div style={{ height: procVirtual.slice.padTop }} aria-hidden="true" />
                {tableRows.slice(procVirtual.slice.start, procVirtual.slice.end).map((row, sliceIndex) => {
                  if (row.kind === 'group') {
                    const group = row.group;
                    const collapsed = !!collapsedGroups[group.key];
                    const groupCpuColor = group.cpu > 50 ? '#FF453A' : group.cpu > 20 ? '#FF9F0A' : 'var(--color-text-secondary)';
                    return (
                      <button
                        type="button"
                        key={`group-${group.key}`}
                        style={styles.groupRow}
                        onClick={() => toggleGroup(group.key)}
                        aria-expanded={!collapsed}
                        title={`${collapsed ? 'Expand' : 'Collapse'} ${group.key} (${group.processes.length} processes)`}
                      >
                        <span style={styles.groupName}>
                          <span style={{ display: 'inline-block', width: 12, color: 'var(--color-text-tertiary)' }}>{collapsed ? '▸' : '▾'}</span>
                          {group.key}
                          <span style={styles.groupCount}>{group.processes.length}</span>
                        </span>
                        <span style={styles.processPid} />
                        <span style={{ ...styles.processMetric, color: groupCpuColor }}>{group.cpu.toFixed(1)}%</span>
                        <span style={styles.processMetric}>{Math.round(group.memory)} MB</span>
                        <span />
                      </button>
                    );
                  }
                  const process = row.process;
                  const isPinnedRow = row.kind === 'pinned';
                  const cpuValue = process.cpu || 0;
                  const cpuColor = cpuValue > 50 ? '#FF453A' : cpuValue > 20 ? '#FF9F0A' : 'var(--color-text-secondary)';
                  const isKilling = killing === process.pid;
                  const hovered = hoveredPid === process.pid;
                  const isPinned = pinnedSet.has(process.pid);
                  const isSelected = selectedPid === process.pid;
                  const grouped = row.kind === 'process' && row.grouped;
                  return (
                    <div
                      key={`${isPinnedRow ? 'pin-' : ''}${process.pid}-${process.name}-${sliceIndex}`}
                      style={{
                        ...styles.processRow,
                        ...(grouped ? styles.processRowNested : null),
                        ...(isPinnedRow ? styles.processRowPinned : null),
                        ...(isSelected ? styles.processRowSelected : null),
                        ...(hovered ? styles.processRowHover : null),
                      }}
                      onMouseEnter={() => setHoveredPid(process.pid)}
                      onMouseLeave={() => setHoveredPid(prev => (prev === process.pid ? null : prev))}
                      onClick={() => setSelectedPid(prev => (prev === process.pid ? null : process.pid))}
                    >
                      <span style={styles.processName} title={process.name}>
                        {isPinnedRow && <span style={{ color: '#FFB340', marginRight: 5 }}>★</span>}
                        {process.name}
                      </span>
                      <span style={styles.processPid}>{process.pid}</span>
                      <span style={{ ...styles.processMetric, color: cpuColor }}>{cpuValue.toFixed(1)}%</span>
                      <span style={styles.processMetric}>{Math.round(process.memory || 0)} MB</span>
                      <div style={styles.processActions} onClick={e => e.stopPropagation()}>
                        <button
                          style={{ ...styles.iconAction, color: isPinned ? '#FFB340' : 'var(--color-text-tertiary)' }}
                          onClick={() => togglePin(process.pid)}
                          aria-label={isPinned ? `Unpin ${process.name}` : `Pin ${process.name} to watch list`}
                          aria-pressed={isPinned}
                          title={isPinned ? 'Unpin from watch list' : 'Pin to watch list'}
                        >
                          {isPinned ? '★' : '☆'}
                        </button>
                        <button
                          style={{ ...styles.iconAction, color: isSelected ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                          onClick={() => setSelectedPid(prev => (prev === process.pid ? null : process.pid))}
                          aria-label={`Details for ${process.name}`}
                          aria-pressed={isSelected}
                          title="Show process details"
                        >
                          <DexIcon name="info" size={12} />
                        </button>
                        <button
                          style={{ ...styles.endButton, height: 20, padding: '0 7px', fontSize: 10, opacity: isKilling ? 0.5 : 1 }}
                          onClick={() => handleEndProcess(process.pid, process.name)}
                          disabled={isKilling}
                          aria-label={`End process ${process.name}`}
                          title={`End ${process.name}`}
                        >
                          {isKilling ? '...' : 'End'}
                        </button>
                        <button
                          style={{ ...styles.endButton, height: 20, padding: '0 7px', fontSize: 10, opacity: isKilling ? 0.5 : 1 }}
                          onClick={() => handleEndTree(process.pid, process.name)}
                          disabled={isKilling}
                          aria-label={`End process tree ${process.name}`}
                          title={`End ${process.name} and all child processes`}
                        >
                          Tree
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div style={{ height: procVirtual.slice.padBottom }} aria-hidden="true" />
              </>
            )}
          </div>
          {selectedProcess && (
            <div className="dex-liquid-glass-strong" style={styles.detailPanel} role="region" aria-label={`Details for ${selectedProcess.name}`}>
              <div style={styles.detailHeader}>
                <span style={styles.detailTitle} title={selectedProcess.name}>{selectedProcess.name}</span>
                <button
                  style={{ ...styles.iconAction, color: pinnedSet.has(selectedProcess.pid) ? '#FFB340' : 'var(--color-text-tertiary)' }}
                  onClick={() => togglePin(selectedProcess.pid)}
                  aria-label={pinnedSet.has(selectedProcess.pid) ? 'Unpin' : 'Pin to watch list'}
                  title={pinnedSet.has(selectedProcess.pid) ? 'Unpin from watch list' : 'Pin to watch list'}
                >
                  {pinnedSet.has(selectedProcess.pid) ? '★' : '☆'}
                </button>
                <button style={styles.detailClose} onClick={() => setSelectedPid(null)} aria-label="Close details" title="Close">✕</button>
              </div>
              <div style={styles.detailGrid}>
                <div style={styles.detailKey}>PID</div>
                <div style={styles.detailVal}>{selectedProcess.pid}</div>
                <div style={styles.detailKey}>Application</div>
                <div style={styles.detailVal}>{groupKeyFor(selectedProcess.name)}</div>
                <div style={styles.detailKey}>CPU</div>
                <div style={styles.detailVal}>{(selectedProcess.cpu || 0).toFixed(1)}%</div>
                <div style={styles.detailKey}>Memory</div>
                <div style={styles.detailVal}>{Math.round(selectedProcess.memory || 0)} MB</div>
                <div style={styles.detailKey}>First seen</div>
                <div style={styles.detailVal}>
                  {firstSeenRef.current.has(selectedProcess.pid)
                    ? `${formatAge(firstSeenRef.current.get(selectedProcess.pid)!)} ago (this session)`
                    : 'just now'}
                </div>
              </div>
              <div style={styles.detailActions}>
                <button style={styles.ghostButton} onClick={() => handleEndProcess(selectedProcess.pid, selectedProcess.name)} aria-label={`End ${selectedProcess.name}`}>End Process</button>
                <button style={styles.ghostButton} onClick={() => handleEndTree(selectedProcess.pid, selectedProcess.name)} aria-label={`End tree ${selectedProcess.name}`}>End Tree</button>
              </div>
            </div>
          )}
        </section>
        )}
      </div>
      )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    padding: 'var(--space-4)', color: 'var(--color-text-primary)', background: 'var(--pg-surface)',
    overflow: 'hidden',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' },
  titleWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  titleIcon: { width: 34, height: 34, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--color-accent-fill)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff', boxShadow: '0 8px 22px rgba(10,132,255,0.28)' },
  title: { margin: 0, fontSize: 18, fontWeight: 750, letterSpacing: 0 },
  subtitle: { fontSize: 12, color: 'var(--color-text-secondary)' },
  headerControls: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  segGroup: { display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' },
  segButton: { height: 26, padding: '0 10px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.01em' },
  segButtonActive: { background: 'var(--color-accent-fill)', color: '#fff' },
  refreshButton: { display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-glass)', color: 'var(--color-text-primary)', cursor: 'pointer' },
  healthPill: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 9999, border: '1px solid', fontSize: 11, fontWeight: 650, letterSpacing: '0.02em', marginLeft: 4 },
  healthBanner: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px var(--space-3)', borderRadius: 10, border: '1px solid' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-2)' },
  statCard: { padding: 11, borderRadius: 'var(--radius-lg, 12px)', display: 'flex', flexDirection: 'column', gap: 3 },
  statLabel: { fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  statValue: { fontSize: 20, fontWeight: 760, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 },
  statDetail: { fontSize: 11, color: 'var(--color-text-tertiary)' },
  sparkWrap: { marginTop: 5, height: 36 },

  // -- Overview hero (the concept layout) ---------------------------------
  heroGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.85fr) minmax(248px, 0.85fr)', gap: 'var(--space-3)', alignItems: 'stretch' },
  heroLeft: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 },
  heroTopRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 'var(--space-3)' },
  heroBigCard: { position: 'relative', padding: '16px 18px', borderRadius: 'var(--radius-xl, 16px)', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 132, justifyContent: 'flex-end', overflow: 'hidden' },
  heroIconTile: { position: 'absolute', top: 16, left: 18, width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--color-accent-fill)', border: '1px solid rgba(255,255,255,0.20)', boxShadow: '0 10px 26px rgba(10,132,255,0.30)' },
  heroBigValue: { display: 'flex', alignItems: 'baseline', gap: 2, fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' },
  heroBigPlus: { fontSize: 22, fontWeight: 700, color: 'var(--color-accent)' },
  heroBigLabel: { fontSize: 13, fontWeight: 650, color: 'var(--color-text-primary)' },
  heroDelta: { fontSize: 11.5, color: 'var(--color-text-tertiary)' },
  heroDonutCard: { padding: 16, borderRadius: 'var(--radius-xl, 16px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minHeight: 132 },
  heroDonutTitle: { alignSelf: 'flex-start', fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 },
  heroDonutWrap: { position: 'relative', display: 'grid', placeItems: 'center' },
  heroDonutCenter: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 },
  heroDonutUnit: { fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  heroDonutFoot: { fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' },
  heroAssetRow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)' },
  assetTile: { display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 14 },
  assetGlyph: { width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', border: '1px solid', flexShrink: 0 },
  assetValue: { fontSize: 18, fontWeight: 750, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' },
  assetLabel: { fontSize: 11.5, color: 'var(--color-text-tertiary)', fontWeight: 600 },
  assetDetail: { marginLeft: 'auto', fontSize: 10.5, color: 'var(--color-text-tertiary)', textAlign: 'right', maxWidth: 96, lineHeight: 1.25 },
  chartCard: { padding: 16, borderRadius: 'var(--radius-xl, 16px)', display: 'flex', flexDirection: 'column', gap: 12 },
  chartHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  chartTitle: { fontSize: 14, fontWeight: 720, letterSpacing: '-0.01em' },
  chartSub: { marginTop: 2, fontSize: 11, color: 'var(--color-text-tertiary)' },
  chartRangePills: { display: 'flex', alignItems: 'center', gap: 6 },
  chartPill: { padding: '3px 9px', borderRadius: 9999, fontSize: 10.5, fontWeight: 650, background: 'rgba(123,92,255,0.18)', color: '#B7A4FF', border: '1px solid rgba(123,92,255,0.30)' },
  chartPillMuted: { background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border-subtle)' },
  focusCard: { position: 'relative', padding: 18, borderRadius: 'var(--radius-xl, 16px)', display: 'flex', flexDirection: 'column', gap: 9, overflow: 'hidden', background: 'linear-gradient(165deg, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 62%), var(--color-bg-glass-strong)' },
  focusTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  focusUptime: { fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' },
  focusHeading: { marginTop: 4, fontSize: 20, fontWeight: 760, letterSpacing: '-0.02em', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  focusKicker: { fontSize: 11.5, color: 'var(--color-text-tertiary)' },
  focusProgressRow: { marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 650, color: 'var(--color-text-secondary)' },
  focusProgressTrack: { height: 7, borderRadius: 9999, background: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  focusProgressFill: { height: '100%', borderRadius: 9999, transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)' },
  focusAvatars: { marginTop: 8, display: 'flex', alignItems: 'center' },
  focusAvatar: { width: 28, height: 28, borderRadius: 9999, display: 'grid', placeItems: 'center', background: 'var(--color-accent-fill)', border: '2px solid var(--color-bg-glass-strong, #111)', boxShadow: '0 4px 12px rgba(0,0,0,0.35)' },
  focusAvatarsLabel: { marginLeft: 10, fontSize: 11, color: 'var(--color-text-tertiary)' },
  focusAction: { marginTop: 'auto', height: 34, borderRadius: 10, border: '1px solid rgba(255,69,58,0.34)', background: 'rgba(255,69,58,0.12)', color: 'var(--color-error, #FF8A82)', cursor: 'pointer', fontWeight: 650, fontSize: 12.5 },

  contentGrid: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(300px, 0.9fr) minmax(340px, 1.1fr)', gap: 'var(--space-3)' },
  panel: { minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-lg, 12px)', overflow: 'hidden' },
  panelHeader: { height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 var(--space-3)', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em' },
  countPill: { padding: '2px 7px', borderRadius: 9999, background: 'rgba(74,158,255,0.16)', color: 'var(--color-accent)', fontSize: 11 },
  list: { flex: 1, minHeight: 0, overflow: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  appRow: { display: 'flex', alignItems: 'center', gap: 9, padding: 9, borderRadius: 10, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' },
  appGlyph: { width: 32, height: 32, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'var(--color-accent-fill)', color: '#fff', flexShrink: 0, boxShadow: '0 6px 18px rgba(10,132,255,0.24)' },
  appMeta: { flex: 1, minWidth: 0 },
  appName: { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  appDetail: { marginTop: 2, fontSize: 11, color: 'var(--color-text-tertiary)' },
  ghostButton: { height: 28, padding: '0 9px', borderRadius: 4, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' },
  endButton: { height: 28, padding: '0 9px', borderRadius: 4, border: '1px solid rgba(255,69,58,0.34)', background: 'rgba(255,69,58,0.10)', color: 'var(--color-error, #FF8A82)', cursor: 'pointer' },
  processTableHead: { display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 70px 70px 80px 86px', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  sortHeader: { display: 'flex', alignItems: 'center', height: '100%', padding: 0, border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer' },
  processTable: { flex: 1, minHeight: 0, overflow: 'auto' },
  processRow: { display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 70px 70px 80px 86px', gap: 'var(--space-2)', height: PROCESS_ROW_H, padding: '0 var(--space-3)', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center', fontSize: 12, boxSizing: 'border-box' },
  processActions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  processRowHover: { background: 'color-mix(in srgb, var(--dex-focus-color, #fff) 12%, transparent)' },
  processRowNested: { paddingLeft: 'calc(var(--space-3) + 14px)' },
  processRowPinned: { background: 'rgba(255,159,10,0.08)', borderLeft: '2px solid #FFB340' },
  processRowSelected: { background: 'rgba(74,158,255,0.12)' },
  groupRow: {
    display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 70px 70px 80px 86px', gap: 'var(--space-2)',
    height: PROCESS_ROW_H, padding: '0 var(--space-3)', alignItems: 'center', fontSize: 12,
    boxSizing: 'border-box', width: '100%', textAlign: 'left', borderTop: 'none', borderLeft: 'none',
    borderRight: 'none', borderBottom: '1px solid var(--color-border-subtle)',
    background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 700,
  },
  groupName: { display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  groupCount: { padding: '1px 6px', borderRadius: 9999, background: 'rgba(74,158,255,0.16)', color: 'var(--color-accent)', fontSize: 10, fontWeight: 600 },
  toggleButton: { display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  toggleButtonActive: { background: 'var(--color-accent-fill)', borderColor: 'var(--color-accent)', color: '#fff' },
  iconAction: { display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, padding: 0 },
  detailPanel: { flexShrink: 0, borderRadius: 0, borderTop: '1px solid var(--color-border-subtle)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 8 },
  detailHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  detailTitle: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detailClose: { width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 4, fontSize: 12 },
  detailKey: { color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 },
  detailVal: { color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detailActions: { display: 'flex', gap: 8 },
  processName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  processPid: { color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  processMetric: { color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  empty: { padding: 18, color: 'var(--color-text-tertiary)', fontSize: 12, lineHeight: 1.5 },
};

export default TaskManager;
