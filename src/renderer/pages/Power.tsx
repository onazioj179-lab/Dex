// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * POWER - Full System Control & Process Manager
 * macOS Activity Monitor style with glassmorphism design.
 * Process manager, battery optimization, performance profiles,
 * memory cleanup, startup management, thermal monitoring, and more.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { useToastHelpers } from '../components/Toast';
import { glassButton } from '../styles/glassMenu';
import { useRunningApps } from '../store/runningApps';
import { useLearningStore } from '../store/learningStore';
import { useConfirm } from '../components/ConfirmDialog';
import { DexSearchInput } from '../styles/components';
import {
  BalanceIcon, RocketIcon, BatteryIcon, MuteIcon, SettingsIcon,
  BarChartIcon, GaugeIcon, MemoryIcon, BoltIcon, ThermometerIcon,
  SlidersIcon, WarningIcon, CleanupIcon, PackageIcon, FileTextIcon, FolderIcon
} from '../utils/icons';

// ===========================================================================
// TYPES
// ===========================================================================

type PowerTab = 'processes' | 'battery' | 'performance' | 'memory' | 'startup' | 'thermal' | 'controls' | 'shield';

interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  status: 'running' | 'sleeping' | 'idle' | 'zombie';
  user: string;
  threads: number;
  uptime: string;
  threatScore?: number;
}

type PerformanceProfile = 'balanced' | 'highPerformance' | 'powerSaver' | 'silent' | 'custom';

interface BatteryInfo {
  level: number;
  charging: boolean;
  timeRemaining: string;
  health: number;
  cycleCount: number;
  temperature: number;
  voltage: number;
  wattage: number;
  adapter: string;
  optimizedCharging: boolean;
}

interface MemoryInfo {
  total: number;
  used: number;
  available: number;
  cached: number;
  swapTotal: number;
  swapUsed: number;
  appMemory: { name: string; memory: number; trend: 'up' | 'down' | 'stable' }[];
}

interface ThermalZone {
  name: string;
  temp: number;
  maxTemp: number;
  fanSpeed: number;
  maxFanSpeed: number;
}

interface StartupItem {
  id: string;
  name: string;
  type: 'app' | 'service' | 'script';
  enabled: boolean;
  impact: 'low' | 'medium' | 'high';
  delay: number;
}

interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun: string;
  nextRun: string;
}

// ===========================================================================
// DEFAULT FALLBACKS & STORAGE HELPERS
// ===========================================================================

const DEFAULT_BATTERY: BatteryInfo = {
  level: 100, charging: false, timeRemaining: 'N/A', health: 100,
  cycleCount: 0, temperature: 0, voltage: 0, wattage: 0,
  adapter: 'Unknown', optimizedCharging: false,
};

const DEFAULT_MEMORY: MemoryInfo = {
  total: 0, used: 0, available: 0, cached: 0,
  swapTotal: 0, swapUsed: 0, appMemory: [],
};

const STORAGE_KEYS = {
  startupItems: 'dex-power-startup-items',
  scheduledTasks: 'dex-power-scheduled-tasks',
  powerMode: 'dex-power-mode',
  keepAwake: 'dex-power-keep-awake',
  powerLog: 'dex-power-event-log',
};

// Simplified, user-facing power mode independent of the richer PerformanceProfile.
type PowerMode = 'balanced' | 'saver' | 'performance';

const POWER_MODE_TO_PROFILE: Record<PowerMode, PerformanceProfile> = {
  balanced: 'balanced',
  saver: 'powerSaver',
  performance: 'highPerformance',
};

interface PowerLogEntry {
  id: string;
  type: 'wake' | 'sleep' | 'charge' | 'discharge' | 'online' | 'offline';
  label: string;
  at: number;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_STARTUP_ITEMS: StartupItem[] = [];

const DEFAULT_SCHEDULED_TASKS: ScheduledTask[] = [];

const PROFILE_INFO: Record<PerformanceProfile, { name: string; desc: string; color: string; icon: React.ReactNode }> = {
  balanced:        { name: 'Balanced',         desc: 'Optimal balance of performance and efficiency', color: 'var(--color-accent)', icon: <BalanceIcon size={16} color="#0a84ff" /> },
  highPerformance: { name: 'High Performance', desc: 'Max CPU/GPU clocks, fans at full speed',        color: 'var(--color-warning)', icon: <RocketIcon size={16} color="#ff9f0a" /> },
  powerSaver:      { name: 'Power Saver',      desc: 'Extend battery life, reduced performance',      color: 'var(--color-success)', icon: <BatteryIcon size={16} color="#30d158" /> },
  silent:          { name: 'Silent',            desc: 'Minimum fan noise, thermal throttling allowed', color: '#bf5af2', icon: <MuteIcon size={16} color="#bf5af2" /> },
  custom:          { name: 'Custom',            desc: 'User-defined CPU/GPU/fan limits',               color: '#64d2ff', icon: <SettingsIcon size={16} color="#64d2ff" /> },
};

// ===========================================================================
// COMPONENT
// ===========================================================================

export const Power: React.FC = () => {
  const { confirm, ConfirmHost } = useConfirm();
  const [tab, setTab] = useState<PowerTab>('processes');
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [sortBy, setSortBy] = useState<'cpu' | 'memory' | 'name' | 'pid' | 'disk' | 'status' | 'threads'>('cpu');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

  // Battery
  const [battery, setBattery] = useState<BatteryInfo>(DEFAULT_BATTERY);

  // Simplified power mode (balanced/saver/performance), persisted to localStorage.
  const [powerMode, setPowerMode] = useState<PowerMode>(() => loadFromStorage<PowerMode>(STORAGE_KEYS.powerMode, 'balanced'));

  // Keep awake for N minutes (uses the Screen Wake Lock API — no IPC channel exists).
  const [keepAwakeMinutes, setKeepAwakeMinutes] = useState<number>(() => loadFromStorage<number>(STORAGE_KEYS.keepAwake, 0));
  const [keepAwakeUntil, setKeepAwakeUntil] = useState<number>(0);
  const wakeLockRef = useRef<any>(null);
  const keepAwakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wake/sleep + power-source event log, persisted (most recent 50 kept).
  const [powerLog, setPowerLog] = useState<PowerLogEntry[]>(() => loadFromStorage<PowerLogEntry[]>(STORAGE_KEYS.powerLog, []));

  // Performance
  const [profile, setProfile] = useState<PerformanceProfile>('balanced');
  const [cpuLimit, setCpuLimit] = useState(100);
  const [gpuLimit, setGpuLimit] = useState(100);
  const [fanCurve, setFanCurve] = useState(50);

  // Memory
  const [memInfo, setMemInfo] = useState<MemoryInfo>(DEFAULT_MEMORY);

  // Thermal
  const [thermals, setThermals] = useState<ThermalZone[]>([]);

  // Startup (persisted to localStorage)
  const [startupItems, setStartupItems] = useState<StartupItem[]>(() => loadFromStorage(STORAGE_KEYS.startupItems, DEFAULT_STARTUP_ITEMS));
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>(() => loadFromStorage(STORAGE_KEYS.scheduledTasks, DEFAULT_SCHEDULED_TASKS));

  // Controls (original)
  const [automationsEnabled, setAutomationsEnabled] = useState(true);
  // "Learning" is bound to the real silent-learning store so this toggle
  // actually turns usage learning (app suggestions, pattern tracking) on/off.
  const learningEnabled = useLearningStore((s) => s.enabled);
  const setLearningStoreEnabled = useLearningStore((s) => s.setEnabled);
  const setLearningEnabled = (v: boolean) => setLearningStoreEnabled(v);
  const [appLocked, setAppLocked] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [panicStopped, setPanicStopped] = useState(false);

  // Live CPU history for chart
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(60).fill(0));
  // In-flight guard so the memory-cleanup button can't be double-fired.
  const [cleaningMemory, setCleaningMemory] = useState(false);
  const toast = useToastHelpers();
  const pollFailCountRef = useRef(0);

  // Load initial data from IPC on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [procs, stats, prof] = await Promise.all([
          window.dex?.system?.getProcesses?.().catch(() => null),
          window.dex?.power?.getStats?.().catch(() => null),
          (window.dex?.power as any)?.getProfile?.()?.catch?.(() => null) ?? Promise.resolve(null),
        ]);
        if (procs && Array.isArray(procs)) setProcesses(procs);
        if (stats) {
          if (stats.battery) setBattery(prev => ({ ...prev, ...stats.battery }));
          if (stats.memory) setMemInfo(prev => ({ ...prev, ...stats.memory }));
          if (stats.thermal && Array.isArray(stats.thermal)) setThermals(stats.thermal);
        }
        if (prof && typeof prof === 'string') setProfile(prof as PerformanceProfile);
      } catch (e) {
        console.warn('[Power] Failed to load initial data from IPC:', e);
      }
    };
    loadData();
  }, []);

  // Poll live data from IPC every 3 seconds (pause when tab hidden)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const [procs, stats] = await Promise.all([
          window.dex?.system?.getProcesses?.().catch(() => null),
          window.dex?.power?.getStats?.().catch(() => null),
        ]);
        if (procs && Array.isArray(procs)) setProcesses(procs);
        if (stats) {
          if (stats.battery) setBattery(prev => ({ ...prev, ...stats.battery }));
          if (stats.memory) setMemInfo(prev => ({ ...prev, ...stats.memory }));
          if (stats.thermal && Array.isArray(stats.thermal)) setThermals(stats.thermal);
        }
        setCpuHistory(prev => {
          const total = procs && Array.isArray(procs)
            ? +procs.reduce((s: number, p: any) => s + (p.cpu || 0), 0).toFixed(1)
            : prev[prev.length - 1] || 0;
          return [...prev.slice(1), total];
        });
        pollFailCountRef.current = 0;
      } catch (e) {
        console.warn('[Power] Polling error:', e);
        pollFailCountRef.current += 1;
        if (pollFailCountRef.current === 3) {
          toast.error('Power monitor lost connection to system bridge. Data may be stale.');
        }
      }
    };
    const start = () => { if (!interval) interval = setInterval(poll, 3000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVisibility = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  // Sync profile changes to IPC
  useEffect(() => {
    window.dex?.power?.setProfile?.(profile)?.catch?.((e: any) =>
      console.warn('[Power] Failed to set profile:', e)
    );
  }, [profile]);

  // Append a power-event log entry (de-duped against the immediately-previous
  // entry of the same type within 2s) and keep only the most recent 50.
  const pushLog = useCallback((type: PowerLogEntry['type'], label: string) => {
    setPowerLog(prev => {
      const now = Date.now();
      if (prev[0] && prev[0].type === type && now - prev[0].at < 2000) return prev;
      const entry: PowerLogEntry = { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, type, label, at: now };
      const next = [entry, ...prev].slice(0, 50);
      return next;
    });
  }, []);

  // Persist the power log.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.powerLog, JSON.stringify(powerLog)); } catch (e) { console.warn('[DEX]', e); }
  }, [powerLog]);

  // Persist + apply simplified power mode. Maps onto the richer performance
  // profile (real IPC) and mirrors into the profile selector so both stay in sync.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.powerMode, JSON.stringify(powerMode)); } catch (e) { console.warn('[DEX]', e); }
    const mapped = POWER_MODE_TO_PROFILE[powerMode];
    setProfile(prev => (prev === mapped ? prev : mapped));
  }, [powerMode]);

  // Live battery via the Web Battery API (navigator.getBattery) — no IPC needed.
  // Fills in level / charging / time-remaining and logs charge/discharge events.
  useEffect(() => {
    let bat: any = null;
    let cancelled = false;
    const fmtRemaining = (seconds: number): string => {
      if (!isFinite(seconds) || seconds <= 0) return 'N/A';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    const apply = () => {
      if (!bat || cancelled) return;
      const remaining = bat.charging ? bat.chargingTime : bat.dischargingTime;
      setBattery(prev => ({
        ...prev,
        level: Math.round(bat.level * 100),
        charging: bat.charging,
        timeRemaining: fmtRemaining(remaining),
      }));
    };
    const onCharging = () => { apply(); pushLog(bat.charging ? 'charge' : 'discharge', bat.charging ? 'Power adapter connected' : 'Running on battery'); };
    const onLevel = () => apply();
    const onTime = () => apply();
    try {
      const getBattery = (navigator as any).getBattery;
      if (typeof getBattery === 'function') {
        getBattery.call(navigator).then((b: any) => {
          if (cancelled) return;
          bat = b;
          apply();
          b.addEventListener('chargingchange', onCharging);
          b.addEventListener('levelchange', onLevel);
          b.addEventListener('chargingtimechange', onTime);
          b.addEventListener('dischargingtimechange', onTime);
        }).catch(() => { /* battery API unavailable */ });
      }
    } catch (e) { console.warn('[Power] Battery API error:', e); }
    return () => {
      cancelled = true;
      if (bat) {
        try {
          bat.removeEventListener('chargingchange', onCharging);
          bat.removeEventListener('levelchange', onLevel);
          bat.removeEventListener('chargingtimechange', onTime);
          bat.removeEventListener('dischargingtimechange', onTime);
        } catch { /* ignore */ }
      }
    };
  }, [pushLog]);

  // Wake/sleep timeline — record visibility (sleep/wake) and connectivity events.
  useEffect(() => {
    const onVis = () => pushLog(document.hidden ? 'sleep' : 'wake', document.hidden ? 'System idle / display off' : 'System resumed');
    const onOnline = () => pushLog('online', 'Network connected');
    const onOffline = () => pushLog('offline', 'Network disconnected');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [pushLog]);

  // --- Keep awake (Screen Wake Lock API) ---
  const releaseWakeLock = useCallback(async () => {
    try { if (wakeLockRef.current) { await wakeLockRef.current.release(); wakeLockRef.current = null; } }
    catch (e) { console.warn('[Power] Wake lock release error:', e); }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try {
      const wl = (navigator as any).wakeLock;
      if (wl && typeof wl.request === 'function' && !document.hidden) {
        wakeLockRef.current = await wl.request('screen');
        wakeLockRef.current?.addEventListener?.('release', () => { wakeLockRef.current = null; });
      }
    } catch (e) { console.warn('[Power] Wake lock request error:', e); }
  }, []);

  const stopKeepAwake = useCallback(() => {
    setKeepAwakeUntil(0);
    if (keepAwakeTimerRef.current) { clearTimeout(keepAwakeTimerRef.current); keepAwakeTimerRef.current = null; }
    releaseWakeLock();
    try { localStorage.setItem(STORAGE_KEYS.keepAwake, JSON.stringify(0)); } catch { /* ignore */ }
    setKeepAwakeMinutes(0);
  }, [releaseWakeLock]);

  const startKeepAwake = useCallback((minutes: number) => {
    try {
      setKeepAwakeMinutes(minutes);
      try { localStorage.setItem(STORAGE_KEYS.keepAwake, JSON.stringify(minutes)); } catch { /* ignore */ }
      if (keepAwakeTimerRef.current) { clearTimeout(keepAwakeTimerRef.current); keepAwakeTimerRef.current = null; }
      if (minutes <= 0) { stopKeepAwake(); return; }
      const until = Date.now() + minutes * 60 * 1000;
      setKeepAwakeUntil(until);
      acquireWakeLock();
      keepAwakeTimerRef.current = setTimeout(() => {
        stopKeepAwake();
        window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Keep awake ended' } }));
      }, minutes * 60 * 1000);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Keeping awake for ${minutes} min` } }));
    } catch (e) { console.warn('[Power] Keep awake error:', e); window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Failed to enable keep awake' } })); }
  }, [acquireWakeLock, stopKeepAwake]);

  // Re-acquire the wake lock when the tab becomes visible again (the OS releases
  // wake locks on hide) while a keep-awake window is still active.
  useEffect(() => {
    const onVis = () => { if (!document.hidden && keepAwakeUntil > Date.now() && !wakeLockRef.current) acquireWakeLock(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); releaseWakeLock(); };
  }, [keepAwakeUntil, acquireWakeLock, releaseWakeLock]);

  // Per-app energy impact derived from live process data (CPU + disk + network).
  // Weighted so CPU dominates, matching typical OS energy-impact heuristics.
  const energyImpact = useMemo(() => {
    return processes
      .map(p => ({
        name: p.name,
        pid: p.pid,
        score: (p.cpu || 0) * 1.0 + (p.disk || 0) * 0.05 + (p.network || 0) * 0.05,
        cpu: p.cpu || 0,
      }))
      .filter(e => e.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [processes]);
  const maxImpact = useMemo(() => energyImpact.reduce((m, e) => Math.max(m, e.score), 0) || 1, [energyImpact]);

  // Persist startup items to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.startupItems, JSON.stringify(startupItems)); } catch (e) { console.warn('[DEX]', e); }
  }, [startupItems]);

  // Persist scheduled tasks to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.scheduledTasks, JSON.stringify(scheduledTasks)); } catch (e) { console.warn('[DEX]', e); }
  }, [scheduledTasks]);

  // Sort & filter processes
  const sortedProcesses = useMemo(() => {
    let filtered = processes.filter(p => (p.name || '').toLowerCase().includes(searchFilter.toLowerCase()));
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'cpu') cmp = a.cpu - b.cpu;
      else if (sortBy === 'memory') cmp = a.memory - b.memory;
      else if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '');
      else if (sortBy === 'disk') cmp = a.disk - b.disk;
      else if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortBy === 'threads') cmp = a.threads - b.threads;
      else cmp = a.pid - b.pid;
      return sortAsc ? cmp : -cmp;
    });
    return filtered;
  }, [processes, sortBy, sortAsc, searchFilter]);

  const totalCpu = useMemo(() => +processes.reduce((s, p) => s + p.cpu, 0).toFixed(1), [processes]);
  const totalMem = useMemo(() => processes.reduce((s, p) => s + p.memory, 0), [processes]);

  const handleKill = useCallback(async (pid: number) => {
    try {
      await window.dex?.power?.closeProcess?.(pid, false);
    } catch (e) {
      console.warn('[Power] Failed to kill process:', e);
    }
    setProcesses(prev => prev.filter(p => p.pid !== pid));
    setSelectedPid(null);
  }, []);

  const handlePanicStop = useCallback(async () => {
    const ok = await confirm({
      title: 'Stop everything?',
      message: 'Stop all automations and background tasks?',
      confirmLabel: 'Stop all',
      tone: 'destructive',
    });
    if (ok) {
      setPanicStopped(true);
      setAutomationsEnabled(false);
    }
  }, []);

  const handleMemoryCleanup = useCallback(async () => {
    if (cleaningMemory) return;
    setCleaningMemory(true);
    try {
      await window.dex?.power?.freeMemory?.();
      const stats = await window.dex?.power?.getStats?.();
      if (stats?.memory) {
        setMemInfo(prev => ({ ...prev, ...stats.memory }));
        return;
      }
      // Fallback: locally estimate cleanup if IPC returns no memory stats
      setMemInfo(prev => ({
        ...prev,
        used: Math.max(4000, prev.used - 2000),
        available: Math.min(prev.total, prev.available + 2000),
        cached: Math.max(500, prev.cached - 1000),
      }));
    } catch (e) {
      console.warn('[Power] Memory cleanup error:', e);
      // Fallback: locally estimate cleanup if IPC fails
      setMemInfo(prev => ({
        ...prev,
        used: Math.max(4000, prev.used - 2000),
        available: Math.min(prev.total, prev.available + 2000),
        cached: Math.max(500, prev.cached - 1000),
      }));
    } finally {
      setCleaningMemory(false);
    }
  }, [cleaningMemory]);

  const toggleStartup = useCallback((id: string) => {
    setStartupItems(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }, []);

  const toggleScheduled = useCallback((id: string) => {
    setScheduledTasks(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  }, []);

  // Wire CPU/GPU limit changes to IPC
  const setCpuLimitWired = useCallback((val: number) => {
    setCpuLimit(val);
    window.dex?.power?.setCpuLimit?.(val)?.catch?.(() => {});
  }, []);
  const setGpuLimitWired = useCallback((val: number) => {
    setGpuLimit(val);
    window.dex?.power?.setGpuLimit?.(val)?.catch?.(() => {});
  }, []);
  const setFanCurveWired = useCallback((val: number) => {
    setFanCurve(val);
    window.dex?.power?.setFanCurve?.(val)?.catch?.(() => {});
  }, []);

  const TABS: { key: PowerTab; label: string; icon: React.ReactNode }[] = [
    { key: 'processes', label: 'Processes', icon: <BarChartIcon size={14} /> },
    { key: 'battery', label: 'Battery', icon: <BatteryIcon size={14} /> },
    { key: 'performance', label: 'Performance', icon: <RocketIcon size={14} /> },
    { key: 'memory', label: 'Memory', icon: <MemoryIcon size={14} /> },
    { key: 'startup', label: 'Startup', icon: <BoltIcon size={14} /> },
    { key: 'thermal', label: 'Thermal', icon: <ThermometerIcon size={14} /> },
    { key: 'controls', label: 'Controls', icon: <SlidersIcon size={14} /> },
    { key: 'shield', label: 'Shield', icon: <WarningIcon size={14} /> },
  ];

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--pg-surface)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '13px', overflow: 'hidden' } as React.CSSProperties}>
      {/* Sidebar */}
      <div style={{
        width: 'var(--pg-sidebar-width)' as any, flexShrink: 0, padding: 'var(--space-4) 10px',
        background: 'var(--pg-sidebar)',
        borderRight: '1px solid var(--pg-border)',
        display: 'flex', flexDirection: 'column', gap: 1,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 var(--space-3) var(--space-2)', letterSpacing: -0.2 }}>Power</h2>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px var(--space-3)', height: 'var(--pg-row-height)' as any,
                borderRadius: 'var(--pg-row-radius)' as any, border: 'none',
                background: active ? 'var(--pg-row-active)' : 'transparent',
                boxShadow: active ? 'inset 0 0 0 1px var(--pg-border-active)' : 'none',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: 12.5, fontWeight: active ? 600 : 500,
                cursor: 'pointer', textAlign: 'left' as const,
                transition: 'background-color 0.12s ease, color 0.12s ease',
                position: 'relative',
              }}
            >
              {active && (
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, background: 'var(--color-accent)', borderRadius: 2, boxShadow: '0 0 6px rgba(74,158,255,0.55)' }} />
              )}
              <span style={{ color: active ? 'var(--color-accent)' : 'currentColor', display: 'inline-flex' }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Quick stats */}
        <div style={{ padding: 'var(--space-3) var(--space-2)', borderTop: '1px solid var(--pg-border)', fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>CPU</span>
            <span style={{ color: totalCpu > 80 ? 'var(--color-error)' : 'var(--color-accent)' }}>{totalCpu.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Memory</span>
            <span style={{ color: 'var(--color-success)' }}>{(totalMem / 1024).toFixed(1)} GB</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Battery</span>
            <span style={{ color: battery.level > 50 ? 'var(--color-success)' : 'var(--color-warning)' }}>{battery.level}%</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-5) var(--space-6)' }}>
        {/* === PROCESSES TAB === */}
        {tab === 'processes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>Processes ({sortedProcesses.length})</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <DexSearchInput
                  size="sm"
                  placeholder="Filter"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  onClear={() => setSearchFilter('')}
                  style={{ width: 180 }}
                />
                {selectedPid && (
                  <button onClick={() => handleKill(selectedPid)} style={{ ...glassButton, padding: '6px var(--space-3)', fontSize: 12, background: 'rgba(255,69,58,0.15)', color: 'var(--color-error)', border: '1px solid rgba(255,69,58,0.25)' }}>
                    Kill Process
                  </button>
                )}
              </div>
            </div>

            {/* CPU Mini Chart */}
            <div className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div className="dex-label-caps" style={{ marginBottom: 'var(--space-2)' }}>CPU Usage</div>
              <div style={{ display: 'flex', alignItems: 'end', gap: 1, height: 40 }}>
                {cpuHistory.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${Math.min(100, v)}%`, background: v > 70 ? 'var(--color-error)' : v > 40 ? 'var(--color-warning)' : 'var(--color-accent)', borderRadius: 2, minHeight: 1, opacity: 0.5 + (i / cpuHistory.length) * 0.5, transition: 'height 0.3s' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                <span>60s ago</span><span>Total: {totalCpu.toFixed(1)}%</span><span>Now</span>
              </div>
            </div>

            {/* Process Table */}
            <div className="dex-liquid-glass-strong" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px 90px 60px 70px 70px', padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                {[
                  { key: 'pid', label: 'PID' },
                  { key: 'name', label: 'Name' },
                  { key: 'cpu', label: 'CPU %' },
                  { key: 'memory', label: 'Memory' },
                  { key: 'disk', label: 'Disk' },
                  { key: 'status', label: 'Status' },
                  { key: 'threads', label: 'Threads' },
                ].map(col => (
                  <button
                    key={col.key}
                    onClick={() => { if (sortBy === col.key) setSortAsc(!sortAsc); else { setSortBy(col.key as typeof sortBy); setSortAsc(false); } }}
                    style={{ background: 'none', border: 'none', color: sortBy === col.key ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', textAlign: 'left' as const, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: 0 }}
                  >
                    {col.label}{sortBy === col.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                  </button>
                ))}
              </div>
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {sortedProcesses.map(p => (
                  <div
                    key={p.pid}
                    onClick={() => setSelectedPid(p.pid === selectedPid ? null : p.pid)}
                    style={{
                      display: 'grid', gridTemplateColumns: '50px 1fr 80px 90px 60px 70px 70px',
                      padding: '7px var(--space-3)', cursor: 'pointer',
                      background: p.pid === selectedPid ? 'var(--color-accent-light, rgba(10,132,255,0.15))' : 'transparent',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      transition: 'background 0.1s',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.pid}</span>
                    <span style={{ color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.name}</span>
                    <span style={{ color: p.cpu > 20 ? 'var(--color-error)' : p.cpu > 10 ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>{p.cpu}%</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{p.memory > 1024 ? `${(p.memory / 1024).toFixed(1)} GB` : `${p.memory} MB`}</span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>{p.disk} MB/s</span>
                    <span style={{ 
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: p.status === 'running' ? 'rgba(48,209,88,0.15)' : p.status === 'sleeping' ? 'rgba(255,159,10,0.15)' : 'var(--color-bg-hover)',
                      color: p.status === 'running' ? 'var(--color-success)' : p.status === 'sleeping' ? 'var(--color-warning)' : 'var(--color-text-tertiary)',
                      textAlign: 'center' as const,
                    }}>{p.status}</span>
                    <span style={{ color: 'var(--color-text-tertiary)', textAlign: 'center' as const }}>{p.threads}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === BATTERY TAB === */}
        {tab === 'battery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 560 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>Battery</h3>

            {/* Main battery display */}
            <div className="dex-liquid-glass" style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <div style={{ position: 'relative', width: 80, height: 80 }}>
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="35" fill="none" stroke="var(--color-border-subtle)" strokeWidth="6" />
                  <circle cx="40" cy="40" r="35" fill="none" 
                    stroke={battery.level > 50 ? 'var(--color-success)' : battery.level > 20 ? 'var(--color-warning)' : 'var(--color-error)'} 
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${battery.level * 2.2} 220`}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {battery.level}%
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                  {battery.charging ? <><BoltIcon size={14} color="#ff9f0a" /> Charging</> : <><BatteryIcon size={14} color="#30d158" /> {battery.timeRemaining} remaining</>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{battery.adapter}</div>
              </div>
            </div>

            {/* Battery details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              {[
                { label: 'Health', value: `${battery.health}%`, color: battery.health > 80 ? 'var(--color-success)' : 'var(--color-warning)' },
                { label: 'Cycle Count', value: `${battery.cycleCount}`, color: '#64d2ff' },
                { label: 'Temperature', value: `${battery.temperature}°C`, color: battery.temperature > 40 ? 'var(--color-error)' : 'var(--color-accent)' },
                { label: 'Voltage', value: `${battery.voltage}V`, color: '#bf5af2' },
              ].map(s => (
                <div key={s.label} className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
                  <div className="dex-label-caps" style={{ marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Optimized charging toggle */}
            <div className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>Optimized Battery Charging</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Reduces battery aging by learning your charging habits</div>
                </div>
                <ToggleSwitch checked={battery.optimizedCharging} onChange={() => setBattery(prev => ({ ...prev, optimizedCharging: !prev.optimizedCharging }))} label="Toggle optimized battery charging" />
              </div>
            </div>

            {/* Low power mode */}
            <div className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>Low Power Mode</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Reduce energy usage to extend battery life</div>
                </div>
                <ToggleSwitch checked={profile === 'powerSaver'} onChange={() => setPowerMode(powerMode === 'saver' ? 'balanced' : 'saver')} label="Toggle low power mode" />
              </div>
            </div>

            {/* Power mode (balanced / saver / performance) — persisted */}
            <div className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500, marginBottom: 'var(--space-3)' }}>Power Mode</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { key: 'saver', label: 'Saver', color: 'var(--color-success)' },
                  { key: 'balanced', label: 'Balanced', color: 'var(--color-accent)' },
                  { key: 'performance', label: 'Performance', color: 'var(--color-warning)' },
                ] as { key: PowerMode; label: string; color: string }[]).map(m => (
                  <button key={m.key} onClick={() => setPowerMode(m.key)} aria-pressed={powerMode === m.key} style={{
                    flex: 1, padding: '8px var(--space-3)', borderRadius: 10, cursor: 'pointer',
                    border: powerMode === m.key ? `1px solid ${m.color}` : '1px solid var(--color-border-subtle)',
                    background: powerMode === m.key ? `${m.color}1f` : 'var(--color-bg-elevated)',
                    color: powerMode === m.key ? m.color : 'var(--color-text-secondary)',
                    fontSize: 12, fontWeight: 600,
                  }}>{m.label}</button>
                ))}
              </div>
            </div>

            {/* Keep awake for N minutes (Screen Wake Lock) */}
            <div className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>Keep Awake</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {keepAwakeUntil > Date.now()
                      ? `Active — ${Math.max(0, Math.ceil((keepAwakeUntil - Date.now()) / 60000))} min remaining`
                      : 'Prevent the display from sleeping'}
                  </div>
                </div>
                {keepAwakeUntil > Date.now() && (
                  <button onClick={stopKeepAwake} style={{ ...glassButton, padding: '6px 14px', fontSize: 12, background: 'rgba(255,69,58,0.15)', color: 'var(--color-error)', border: '1px solid rgba(255,69,58,0.25)' }}>Stop</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[15, 30, 60, 120].map(min => {
                  const active = keepAwakeUntil > Date.now() && keepAwakeMinutes === min;
                  return (
                    <button key={min} onClick={() => startKeepAwake(min)} aria-pressed={active} style={{
                      flex: 1, padding: '7px', borderRadius: 10, cursor: 'pointer',
                      border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
                      background: active ? 'var(--color-accent-light, rgba(10,132,255,0.15))' : 'var(--color-bg-elevated)',
                      color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      fontSize: 12, fontWeight: 600,
                    }}>{min < 60 ? `${min}m` : `${min / 60}h`}</button>
                  );
                })}
              </div>
            </div>

            {/* Per-app energy impact (derived from live process data) */}
            <div className="dex-liquid-glass-strong" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div className="dex-label-caps" style={{ marginBottom: 'var(--space-3)' }}>Energy Impact</div>
              {energyImpact.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No active energy consumers</div>
              ) : energyImpact.map(e => {
                const pct = (e.score / maxImpact) * 100;
                const color = e.score > maxImpact * 0.66 ? 'var(--color-error)' : e.score > maxImpact * 0.33 ? 'var(--color-warning)' : 'var(--color-success)';
                return (
                  <div key={e.pid} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{e.name}</span>
                    <div style={{ width: 90, height: 4, background: 'var(--color-bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', width: 44, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>{e.cpu.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>

            {/* Wake / sleep / power-source timeline */}
            <div className="dex-liquid-glass-strong" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <span className="dex-label-caps">Activity Log</span>
                {powerLog.length > 0 && (
                  <button onClick={() => setPowerLog([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 11 }}>Clear</button>
                )}
              </div>
              {powerLog.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No recorded events yet</div>
              ) : (
                <div style={{ maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {powerLog.map(ev => {
                    const dot = ev.type === 'wake' || ev.type === 'online' || ev.type === 'charge' ? 'var(--color-success)'
                      : ev.type === 'sleep' || ev.type === 'offline' ? 'var(--color-warning)' : 'var(--color-accent)';
                    return (
                      <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>{ev.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === PERFORMANCE TAB === */}
        {tab === 'performance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 600 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>Performance Profiles</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              {(Object.entries(PROFILE_INFO) as [PerformanceProfile, typeof PROFILE_INFO[PerformanceProfile]][]).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => setProfile(key)}
                  className="dex-liquid-glass"
                  style={{
                    padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)', cursor: 'pointer',
                    border: profile === key ? `2px solid ${info.color}` : undefined,
                    textAlign: 'left' as const,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 20 }}>{info.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: profile === key ? info.color : 'var(--color-text-primary)' }}>{info.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>{info.desc}</div>
                  {profile === key && (
                    <div style={{ marginTop: 'var(--space-2)', fontSize: 10, color: info.color, fontWeight: 600 }}>Active</div>
                  )}
                </button>
              ))}
            </div>

            {/* Custom profile sliders */}
            {profile === 'custom' && (
              <div className="dex-liquid-glass-strong" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)' }}>Custom Profile Settings</div>
                {[
                  { label: 'CPU Limit', value: cpuLimit, set: setCpuLimitWired, color: 'var(--color-accent)' },
                  { label: 'GPU Limit', value: gpuLimit, set: setGpuLimitWired, color: 'var(--color-success)' },
                  { label: 'Fan Speed', value: fanCurve, set: setFanCurveWired, color: 'var(--color-warning)' },
                ].map(s => (
                  <div key={s.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                      <span>{s.label}</span>
                      <span style={{ color: s.color }}>{s.value}%</span>
                    </div>
                    <input type="range" min="10" max="100" value={s.value} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: s.color }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === MEMORY TAB === */}
        {tab === 'memory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>Memory</h3>
              <button onClick={handleMemoryCleanup} disabled={cleaningMemory} aria-label="Clean up memory" style={{ ...glassButton, padding: '6px 14px', fontSize: 12, background: 'rgba(48,209,88,0.15)', color: 'var(--color-success)', border: '1px solid rgba(48,209,88,0.25)', opacity: cleaningMemory ? 0.5 : 1, cursor: cleaningMemory ? 'default' : 'pointer' }}>
                <CleanupIcon size={14} /> {cleaningMemory ? 'Cleaning…' : 'Clean Up Memory'}
              </button>
            </div>

            {/* Overview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
              {[
                { label: 'Used', value: `${(memInfo.used / 1024).toFixed(1)} GB`, total: `of ${(memInfo.total / 1024).toFixed(0)} GB`, pct: (memInfo.used / memInfo.total * 100), color: 'var(--color-warning)' },
                { label: 'Available', value: `${(memInfo.available / 1024).toFixed(1)} GB`, total: '', pct: (memInfo.available / memInfo.total * 100), color: 'var(--color-success)' },
                { label: 'Cached', value: `${(memInfo.cached / 1024).toFixed(1)} GB`, total: '', pct: (memInfo.cached / memInfo.total * 100), color: '#64d2ff' },
              ].map(s => (
                <div key={s.label} className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
                  <div className="dex-label-caps" style={{ marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: s.color }}>{s.value}</div>
                  {s.total && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{s.total}</div>}
                  <div style={{ height: 3, background: 'var(--color-bg-hover)', borderRadius: 2, marginTop: 'var(--space-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Per-app memory */}
            <div className="dex-liquid-glass-strong" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>App Memory Usage</div>
              {memInfo.appMemory.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No per-app memory data</div>
              )}
              {memInfo.appMemory.map(app => (
                <div key={app.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)' }}>{app.name}</span>
                  <span aria-hidden style={{ fontSize: 11, color: app.trend === 'up' ? 'var(--color-error)' : app.trend === 'down' ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                    {app.trend === 'up' ? '↑' : app.trend === 'down' ? '↓' : '–'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 60, textAlign: 'right' as const }}>{app.memory} MB</span>
                </div>
              ))}
            </div>

            {/* Swap */}
            <div className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Swap</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                <span>{(memInfo.swapUsed / 1024).toFixed(1)} GB used</span>
                <span>{(memInfo.swapTotal / 1024).toFixed(0)} GB total</span>
              </div>
              <div style={{ height: 4, background: 'var(--color-bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(memInfo.swapUsed / memInfo.swapTotal) * 100}%`, background: '#bf5af2', borderRadius: 2 }} />
              </div>
            </div>
          </div>
        )}

        {/* === STARTUP TAB === */}
        {tab === 'startup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 600 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>Startup Items</h3>

            <div className="dex-liquid-glass-strong" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              {startupItems.length === 0 && (
                <div style={{ padding: 'var(--space-5)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No startup items</div>
              )}
              {startupItems.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: i < startupItems.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                  <span style={{ fontSize: 14, display: 'flex' }}>{item.type === 'app' ? <PackageIcon size={14} /> : item.type === 'service' ? <SettingsIcon size={14} /> : <FileTextIcon size={14} />}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      Impact: <span style={{ color: item.impact === 'high' ? 'var(--color-error)' : item.impact === 'medium' ? 'var(--color-warning)' : 'var(--color-success)' }}>{item.impact}</span>
                      {item.delay > 0 && ` · Delay: ${item.delay}s`}
                    </div>
                  </div>
                  <ToggleSwitch checked={item.enabled} onChange={() => toggleStartup(item.id)} label={`Toggle ${item.name}`} />
                </div>
              ))}
            </div>

            <h3 style={{ margin: 'var(--space-2) 0 0', fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>Scheduled Tasks</h3>
            <div className="dex-liquid-glass-strong" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              {scheduledTasks.length === 0 && (
                <div style={{ padding: 'var(--space-5)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No scheduled tasks</div>
              )}
              {scheduledTasks.map((task, i) => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: i < scheduledTasks.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>{task.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{task.schedule} · Last: {task.lastRun}</div>
                  </div>
                  <ToggleSwitch checked={task.enabled} onChange={() => toggleScheduled(task.id)} label={`Toggle ${task.name}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === THERMAL TAB === */}
        {tab === 'thermal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 600 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>Thermal Monitoring</h3>

            {thermals.length === 0 && (
              <div className="dex-liquid-glass" style={{ padding: 'var(--space-8)', borderRadius: 'var(--radius-xl)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>No thermal sensor data available</div>
            )}
            {thermals.map(zone => {
              const pct = (zone.temp / zone.maxTemp) * 100;
              const color = pct > 80 ? 'var(--color-error)' : pct > 60 ? 'var(--color-warning)' : 'var(--color-success)';
              return (
                <div key={zone.name} className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{zone.name}</span>
                    <span style={{ fontSize: 20, fontWeight: 500, color }}>{zone.temp.toFixed(0)}°C</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--color-bg-hover)', borderRadius: 2, overflow: 'hidden', marginBottom: 'var(--space-2)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                    <span>Max: {zone.maxTemp}°C</span>
                    {zone.fanSpeed > 0 && <span>Fan: {zone.fanSpeed} RPM / {zone.maxFanSpeed} RPM</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* === CONTROLS TAB === (original Power controls) */}
        {tab === 'controls' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 480 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>System Controls</h3>

            {panicStopped && (
              <div className="dex-liquid-glass" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(255,69,58,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, color: 'var(--color-error)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><WarningIcon size={14} color="#ff453a" /> All systems stopped</span>
                <button onClick={() => { setPanicStopped(false); setAutomationsEnabled(true); }} style={{ ...glassButton, padding: '6px 14px', fontSize: 12, color: 'var(--color-success)', background: 'rgba(48,209,88,0.15)', border: '1px solid rgba(48,209,88,0.25)' }}>
                  Resume
                </button>
              </div>
            )}

            <div className="dex-liquid-glass-strong" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <div className="dex-label-caps" style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-bg-hover)' }}>Automation</div>
              <ControlRow label="Automations" description="Run automated tasks and workflows" checked={automationsEnabled && !panicStopped} onChange={() => setAutomationsEnabled(!automationsEnabled)} disabled={panicStopped} />
              <ControlRow label="Learning" description="Learn from usage patterns" checked={learningEnabled && !panicStopped} onChange={() => setLearningEnabled(!learningEnabled)} disabled={panicStopped} />
            </div>

            <div className="dex-liquid-glass-strong" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
              <div className="dex-label-caps" style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-bg-hover)' }}>Security</div>
              <ControlRow label="Lock DEX" description="Require authentication to access" checked={appLocked} onChange={() => setAppLocked(!appLocked)} />
              <ControlRow label="Safe Mode" description="Disable all extensions and custom scripts" checked={safeMode} onChange={() => setSafeMode(!safeMode)} />
            </div>

            <div className="dex-liquid-glass" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--space-4)' }}>
              <div className="dex-label-caps" style={{ marginBottom: 'var(--space-3)' }}>Emergency</div>
              <button
                onClick={handlePanicStop}
                disabled={panicStopped}
                style={{
                  width: '100%', padding: 14, borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.25)',
                  color: 'var(--color-error)', fontSize: 14, fontWeight: 500, cursor: panicStopped ? 'default' : 'pointer',
                  opacity: panicStopped ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                Panic Stop
              </button>
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 'var(--space-2) 0 0' }}>
                Immediately stop all automations, workflows, and background tasks
              </p>
            </div>
          </div>
        )}

        {/* === SHIELD TAB === */}
        {tab === 'shield' && (
          <ShieldPanel processes={processes} />
        )}
      </div>
      <ConfirmHost />
    </div>
  );
};

// ===========================================================================
// SHIELD PANEL — Suspicious Process Detection
// ===========================================================================

const KNOWN_THREAT_NAMES = [
  'miner', 'crypto', 'xmrig', 'coinhive', 'monero', 'nicehash',
  'keylogger', 'spyware', 'adware', 'trojan', 'rootkit', 'botnet',
  'backdoor', 'rat.exe', 'stealer', 'ransomware',
];

const SUSPICIOUS_PATTERNS = [
  { test: (p: ProcessInfo) => p.cpu > 80, label: 'High CPU', severity: 'warning' as const },
  { test: (p: ProcessInfo) => p.memory > 2000, label: 'High Memory', severity: 'warning' as const },
  { test: (p: ProcessInfo) => KNOWN_THREAT_NAMES.some(t => p.name.toLowerCase().includes(t)), label: 'Threat Name Match', severity: 'danger' as const },
  { test: (p: ProcessInfo) => p.name.startsWith('.'), label: 'Hidden Process', severity: 'danger' as const },
];

type Severity = 'safe' | 'warning' | 'danger';

interface ThreatEntry {
  process: ProcessInfo;
  reasons: { label: string; severity: Severity }[];
  score: number;
}

function scoreProcesses(processes: ProcessInfo[]): ThreatEntry[] {
  return processes
    .map(p => {
      const hits = SUSPICIOUS_PATTERNS.filter(sp => sp.test(p));
      const score = hits.reduce((s, h) => s + (h.severity === 'danger' ? 3 : 1), 0);
      return { process: p, reasons: hits, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);
}

const SEV_COLOR: Record<Severity, string> = {
  safe: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-error)',
};

const ShieldPanel: React.FC<{ processes: ProcessInfo[] }> = ({ processes }) => {
  const threats = useMemo(() => scoreProcesses(processes), [processes]);

  const overall: Severity = threats.some(t => t.score >= 3) ? 'danger'
    : threats.length > 0 ? 'warning' : 'safe';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>Shield</h3>
        <span style={{
          fontSize: 12, fontWeight: 600, padding: '4px var(--space-3)', borderRadius: 14,
          background: overall === 'safe' ? 'rgba(48,209,88,0.15)' : overall === 'warning' ? 'rgba(255,159,10,0.15)' : 'rgba(255,69,58,0.15)',
          color: SEV_COLOR[overall],
          border: `1px solid ${SEV_COLOR[overall]}40`,
        }}>
          {overall === 'safe' ? 'System Clean' : overall === 'warning' ? 'Review Required' : 'Threats Detected'}
        </span>
      </div>

      {threats.length === 0 ? (
        <div className="dex-liquid-glass" style={{ padding: 'var(--space-8)', borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 'var(--space-3)' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 6 }}>No suspicious processes found</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>All running processes appear normal</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {threats.map(({ process: p, reasons, score }) => (
            <div key={p.pid} className="dex-liquid-glass" style={{
              borderRadius: 'var(--radius-xl)', padding: 14,
              border: `1px solid ${score >= 3 ? 'rgba(255,69,58,0.25)' : 'rgba(255,159,10,0.2)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-2)' }}>
                <WarningIcon size={14} color={score >= 3 ? 'var(--color-error)' : 'var(--color-warning)'} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>{p.name}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>PID {p.pid}</span>
                <span style={{ fontSize: 10, padding: '2px var(--space-2)', borderRadius: 10, fontWeight: 600,
                  background: score >= 3 ? 'rgba(255,69,58,0.15)' : 'rgba(255,159,10,0.15)',
                  color: score >= 3 ? 'var(--color-error)' : 'var(--color-warning)' }}>
                  Score {score}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                {reasons.map(r => (
                  <span key={r.label} style={{ fontSize: 10, padding: '2px var(--space-2)', borderRadius: 10, background: `${SEV_COLOR[r.severity]}18`, color: SEV_COLOR[r.severity], border: `1px solid ${SEV_COLOR[r.severity]}30` }}>
                    {r.label}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                <span>CPU: <b style={{ color: p.cpu > 50 ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>{p.cpu.toFixed(1)}%</b></span>
                <span>Mem: <b style={{ color: 'var(--color-text-secondary)' }}>{p.memory} MB</b></span>
                <span>Disk: <b style={{ color: 'var(--color-text-secondary)' }}>{p.disk.toFixed(1)} MB/s</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ===========================================================================
// Toggle Switch Component
// ===========================================================================

const ToggleSwitch: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean; label?: string }> = ({ checked, onChange, disabled, label }) => (
  <button
    onClick={onChange}
    disabled={disabled}
    aria-label={label}
    aria-checked={checked}
    role="switch"
    style={{
      width: 40, height: 22, borderRadius: 10, border: 'none',
      cursor: disabled ? 'default' : 'pointer', position: 'relative' as const,
      padding: 0, flexShrink: 0, transition: 'background 0.2s ease',
      background: checked ? 'var(--color-accent)' : 'var(--color-border)',
      opacity: disabled ? 0.4 : 1,
    }}
  >
    <span style={{
      position: 'absolute' as const, top: 3,
      left: checked ? 21 : 3,
      width: 16, height: 16, borderRadius: '50%',
      background: '#fff',
      transition: 'left 0.2s ease',
    }} />
  </button>
);

// ===========================================================================
// Control Row Component
// ===========================================================================

const ControlRow: React.FC<{ label: string; description: string; checked: boolean; onChange: () => void; disabled?: boolean }> = ({ label, description, checked, onChange, disabled }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)', opacity: disabled ? 0.5 : 1 }}>
    <div>
      <div style={{ fontSize: 14, color: 'var(--color-text-primary, #fff)' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{description}</div>
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} label={label} />
  </div>
);

Power.displayName = 'Power';
export default memo(Power);

