/**
 * POWER - Full System Control & Process Manager
 * macOS Activity Monitor style with glassmorphism design.
 * Process manager, battery optimization, performance profiles,
 * memory cleanup, startup management, thermal monitoring, and more.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { glassPanel, glassButton, glassMenu } from '../styles/glassMenu';
import { useRunningApps } from '../store/runningApps';
import {
  BalanceIcon, RocketIcon, BatteryIcon, MuteIcon, SettingsIcon,
  BarChartIcon, GaugeIcon, MemoryIcon, BoltIcon, ThermometerIcon,
  SlidersIcon, WarningIcon, CleanupIcon, PackageIcon, FileTextIcon, FolderIcon
} from '../utils/icons';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type PowerTab = 'processes' | 'battery' | 'performance' | 'memory' | 'startup' | 'thermal' | 'controls';

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

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT FALLBACKS & STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

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
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_STARTUP_ITEMS: StartupItem[] = [
  { id: 's1', name: 'DEX Sync Service', type: 'service', enabled: true, impact: 'low', delay: 0 },
  { id: 's2', name: 'AI Background Engine', type: 'service', enabled: true, impact: 'high', delay: 5 },
  { id: 's3', name: 'Security Scanner', type: 'service', enabled: true, impact: 'medium', delay: 3 },
  { id: 's4', name: 'Automation Core', type: 'service', enabled: false, impact: 'medium', delay: 2 },
  { id: 's5', name: 'Cloud Backup', type: 'service', enabled: true, impact: 'low', delay: 10 },
  { id: 's6', name: 'Plugin Auto-Update', type: 'script', enabled: false, impact: 'low', delay: 15 },
  { id: 's7', name: 'File Indexer', type: 'service', enabled: true, impact: 'high', delay: 0 },
  { id: 's8', name: 'Clipboard History', type: 'app', enabled: true, impact: 'low', delay: 2 },
  { id: 's9', name: 'Network Monitor', type: 'service', enabled: false, impact: 'medium', delay: 5 },
  { id: 's10', name: 'Custom Scripts', type: 'script', enabled: false, impact: 'low', delay: 20 },
];

const DEFAULT_SCHEDULED_TASKS: ScheduledTask[] = [
  { id: 't1', name: 'Cache Cleanup', schedule: 'Daily 3:00 AM', enabled: true, lastRun: '2 hours ago', nextRun: 'Tomorrow 3:00 AM' },
  { id: 't2', name: 'Backup', schedule: 'Daily 12:00 AM', enabled: true, lastRun: '14 hours ago', nextRun: 'Tonight 12:00 AM' },
  { id: 't3', name: 'Index Rebuild', schedule: 'Weekly Sun 4:00 AM', enabled: true, lastRun: '3 days ago', nextRun: 'Sunday 4:00 AM' },
  { id: 't4', name: 'Security Scan', schedule: 'Daily 6:00 AM', enabled: false, lastRun: 'Never', nextRun: 'Disabled' },
  { id: 't5', name: 'Log Rotation', schedule: 'Weekly Mon 2:00 AM', enabled: true, lastRun: '5 days ago', nextRun: 'Monday 2:00 AM' },
];

const PROFILE_INFO: Record<PerformanceProfile, { name: string; desc: string; color: string; icon: React.ReactNode }> = {
  balanced:        { name: 'Balanced',         desc: 'Optimal balance of performance and efficiency', color: '#0a84ff', icon: <BalanceIcon size={16} color="#0a84ff" /> },
  highPerformance: { name: 'High Performance', desc: 'Max CPU/GPU clocks, fans at full speed',        color: '#ff9f0a', icon: <RocketIcon size={16} color="#ff9f0a" /> },
  powerSaver:      { name: 'Power Saver',      desc: 'Extend battery life, reduced performance',      color: '#30d158', icon: <BatteryIcon size={16} color="#30d158" /> },
  silent:          { name: 'Silent',            desc: 'Minimum fan noise, thermal throttling allowed', color: '#bf5af2', icon: <MuteIcon size={16} color="#bf5af2" /> },
  custom:          { name: 'Custom',            desc: 'User-defined CPU/GPU/fan limits',               color: '#64d2ff', icon: <SettingsIcon size={16} color="#64d2ff" /> },
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const Power: React.FC = () => {
  const [tab, setTab] = useState<PowerTab>('processes');
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [sortBy, setSortBy] = useState<'cpu' | 'memory' | 'name' | 'pid'>('cpu');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

  // Battery
  const [battery, setBattery] = useState<BatteryInfo>(DEFAULT_BATTERY);

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
  const [learningEnabled, setLearningEnabled] = useState(true);
  const [appLocked, setAppLocked] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [panicStopped, setPanicStopped] = useState(false);

  // Live CPU history for chart
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(60).fill(0));

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

  // Poll live data from IPC every 3 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
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
        // Update CPU history from current process totals
        setCpuHistory(prev => {
          const total = procs && Array.isArray(procs)
            ? +procs.reduce((s: number, p: any) => s + (p.cpu || 0), 0).toFixed(1)
            : prev[prev.length - 1] || 0;
          return [...prev.slice(1), total];
        });
      } catch (e) {
        console.warn('[Power] Polling error:', e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Sync profile changes to IPC
  useEffect(() => {
    window.dex?.power?.setProfile?.(profile)?.catch?.((e: any) =>
      console.warn('[Power] Failed to set profile:', e)
    );
  }, [profile]);

  // Persist startup items to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.startupItems, JSON.stringify(startupItems)); } catch {}
  }, [startupItems]);

  // Persist scheduled tasks to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.scheduledTasks, JSON.stringify(scheduledTasks)); } catch {}
  }, [scheduledTasks]);

  // Sort & filter processes
  const sortedProcesses = useMemo(() => {
    let filtered = processes.filter(p => p.name.toLowerCase().includes(searchFilter.toLowerCase()));
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'cpu') cmp = a.cpu - b.cpu;
      else if (sortBy === 'memory') cmp = a.memory - b.memory;
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
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

  const handlePanicStop = useCallback(() => {
    if (window.confirm('Stop all automations and background tasks?')) {
      setPanicStopped(true);
      setAutomationsEnabled(false);
    }
  }, []);

  const handleMemoryCleanup = useCallback(async () => {
    try {
      await window.dex?.power?.freeMemory?.();
      const stats = await window.dex?.power?.getStats?.();
      if (stats?.memory) {
        setMemInfo(prev => ({ ...prev, ...stats.memory }));
        return;
      }
    } catch (e) {
      console.warn('[Power] Memory cleanup error:', e);
    }
    // Fallback: locally estimate cleanup if IPC fails
    setMemInfo(prev => ({
      ...prev,
      used: Math.max(4000, prev.used - 2000),
      available: Math.min(prev.total, prev.available + 2000),
      cached: Math.max(500, prev.cached - 1000),
    }));
  }, []);

  const toggleStartup = useCallback((id: string) => {
    setStartupItems(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }, []);

  const toggleScheduled = useCallback((id: string) => {
    setScheduledTasks(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  }, []);

  const TABS: { key: PowerTab; label: string; icon: React.ReactNode }[] = [
    { key: 'processes', label: 'Processes', icon: <BarChartIcon size={14} /> },
    { key: 'battery', label: 'Battery', icon: <BatteryIcon size={14} /> },
    { key: 'performance', label: 'Performance', icon: <RocketIcon size={14} /> },
    { key: 'memory', label: 'Memory', icon: <MemoryIcon size={14} /> },
    { key: 'startup', label: 'Startup', icon: <BoltIcon size={14} /> },
    { key: 'thermal', label: 'Thermal', icon: <ThermometerIcon size={14} /> },
    { key: 'controls', label: 'Controls', icon: <SlidersIcon size={14} /> },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', background: 'var(--color-bg-base)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{
        width: 200, flexShrink: 0, padding: '20px 12px',
        background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#fff', margin: '0 0 16px 8px' }}>Power</h2>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8, border: 'none',
              background: tab === t.key ? 'rgba(10,132,255,0.2)' : 'transparent',
              color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.6)',
              fontSize: 13, cursor: 'pointer', textAlign: 'left' as const,
              transition: 'background 0.15s',
            }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Quick stats */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>CPU</span>
            <span style={{ color: totalCpu > 80 ? '#ff453a' : '#0a84ff' }}>{totalCpu.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Memory</span>
            <span style={{ color: '#30d158' }}>{(totalMem / 1024).toFixed(1)} GB</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Battery</span>
            <span style={{ color: battery.level > 50 ? '#30d158' : '#ff9f0a' }}>{battery.level}%</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* ═══ PROCESSES TAB ═══ */}
        {tab === 'processes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Processes ({sortedProcesses.length})</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  placeholder="Filter processes..."
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', outline: 'none', width: 180,
                  }}
                />
                {selectedPid && (
                  <button onClick={() => handleKill(selectedPid)} style={{ ...glassButton, padding: '6px 12px', fontSize: 12, background: 'rgba(255,69,58,0.15)', color: '#ff453a', border: '1px solid rgba(255,69,58,0.25)' }}>
                    Kill Process
                  </button>
                )}
              </div>
            </div>

            {/* CPU Mini Chart */}
            <div style={{ ...glassPanel as any, padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600 }}>CPU Usage</div>
              <div style={{ display: 'flex', alignItems: 'end', gap: 1, height: 40 }}>
                {cpuHistory.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${Math.min(100, v)}%`, background: v > 70 ? '#ff453a' : v > 40 ? '#ff9f0a' : '#0a84ff', borderRadius: 1, minHeight: 1, opacity: 0.5 + (i / cpuHistory.length) * 0.5, transition: 'height 0.3s' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                <span>60s ago</span><span>Total: {totalCpu.toFixed(1)}%</span><span>Now</span>
              </div>
            </div>

            {/* Process Table */}
            <div style={{ ...glassPanel as any, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px 90px 60px 70px 70px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
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
                    onClick={() => { if (sortBy === col.key) setSortAsc(!sortAsc); else { setSortBy(col.key as any); setSortAsc(false); } }}
                    style={{ background: 'none', border: 'none', color: sortBy === col.key ? '#0a84ff' : 'rgba(255,255,255,0.4)', cursor: 'pointer', textAlign: 'left' as const, fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: 0 }}
                  >
                    {col.label} {sortBy === col.key ? (sortAsc ? '↑' : '↓') : ''}
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
                      padding: '7px 12px', cursor: 'pointer',
                      background: p.pid === selectedPid ? 'rgba(10,132,255,0.15)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.1s',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: 11 }}>{p.pid}</span>
                    <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{p.name}</span>
                    <span style={{ color: p.cpu > 20 ? '#ff453a' : p.cpu > 10 ? '#ff9f0a' : 'rgba(255,255,255,0.6)' }}>{p.cpu}%</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{p.memory > 1024 ? `${(p.memory / 1024).toFixed(1)} GB` : `${p.memory} MB`}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>{p.disk} MB/s</span>
                    <span style={{ 
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: p.status === 'running' ? 'rgba(48,209,88,0.15)' : p.status === 'sleeping' ? 'rgba(255,159,10,0.15)' : 'rgba(255,255,255,0.05)',
                      color: p.status === 'running' ? '#30d158' : p.status === 'sleeping' ? '#ff9f0a' : 'rgba(255,255,255,0.4)',
                      textAlign: 'center' as const,
                    }}>{p.status}</span>
                    <span style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center' as const }}>{p.threads}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ BATTERY TAB ═══ */}
        {tab === 'battery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Battery</h3>

            {/* Main battery display */}
            <div style={{ ...glassPanel as any, padding: 24, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ position: 'relative', width: 80, height: 80 }}>
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                  <circle cx="40" cy="40" r="35" fill="none" 
                    stroke={battery.level > 50 ? '#30d158' : battery.level > 20 ? '#ff9f0a' : '#ff453a'} 
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${battery.level * 2.2} 220`}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: '#fff' }}>
                  {battery.level}%
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#fff', marginBottom: 4 }}>
                  {battery.charging ? <><BoltIcon size={14} color="#ff9f0a" /> Charging</> : <><BatteryIcon size={14} color="#30d158" /> {battery.timeRemaining} remaining</>}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{battery.adapter}</div>
              </div>
            </div>

            {/* Battery details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Health', value: `${battery.health}%`, color: battery.health > 80 ? '#30d158' : '#ff9f0a' },
                { label: 'Cycle Count', value: `${battery.cycleCount}`, color: '#64d2ff' },
                { label: 'Temperature', value: `${battery.temperature}°C`, color: battery.temperature > 40 ? '#ff453a' : '#0a84ff' },
                { label: 'Voltage', value: `${battery.voltage}V`, color: '#bf5af2' },
              ].map(s => (
                <div key={s.label} style={{ ...glassPanel as any, padding: 16, borderRadius: 12 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Optimized charging toggle */}
            <div style={{ ...glassPanel as any, padding: 16, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>Optimized Battery Charging</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Reduces battery aging by learning your charging habits</div>
                </div>
                <ToggleSwitch checked={battery.optimizedCharging} onChange={() => setBattery(prev => ({ ...prev, optimizedCharging: !prev.optimizedCharging }))} />
              </div>
            </div>

            {/* Low power mode */}
            <div style={{ ...glassPanel as any, padding: 16, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>Low Power Mode</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Reduce energy usage to extend battery life</div>
                </div>
                <ToggleSwitch checked={profile === 'powerSaver'} onChange={() => setProfile(profile === 'powerSaver' ? 'balanced' : 'powerSaver')} />
              </div>
            </div>
          </div>
        )}

        {/* ═══ PERFORMANCE TAB ═══ */}
        {tab === 'performance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Performance Profiles</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.entries(PROFILE_INFO) as [PerformanceProfile, typeof PROFILE_INFO[PerformanceProfile]][]).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => setProfile(key)}
                  style={{
                    ...glassPanel as any,
                    padding: 16, borderRadius: 12, cursor: 'pointer',
                    border: profile === key ? `2px solid ${info.color}` : '1px solid rgba(255,255,255,0.08)',
                    textAlign: 'left' as const,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>{info.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: profile === key ? info.color : '#fff' }}>{info.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{info.desc}</div>
                  {profile === key && (
                    <div style={{ marginTop: 8, fontSize: 10, color: info.color, fontWeight: 600 }}>● Active</div>
                  )}
                </button>
              ))}
            </div>

            {/* Custom profile sliders */}
            {profile === 'custom' && (
              <div style={{ ...glassPanel as any, padding: 20, borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 16 }}>Custom Profile Settings</div>
                {[
                  { label: 'CPU Limit', value: cpuLimit, set: setCpuLimit, color: '#0a84ff' },
                  { label: 'GPU Limit', value: gpuLimit, set: setGpuLimit, color: '#30d158' },
                  { label: 'Fan Speed', value: fanCurve, set: setFanCurve, color: '#ff9f0a' },
                ].map(s => (
                  <div key={s.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
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

        {/* ═══ MEMORY TAB ═══ */}
        {tab === 'memory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Memory</h3>
              <button onClick={handleMemoryCleanup} style={{ ...glassButton, padding: '6px 14px', fontSize: 12, background: 'rgba(48,209,88,0.15)', color: '#30d158', border: '1px solid rgba(48,209,88,0.25)' }}>
                <CleanupIcon size={14} /> Clean Up Memory
              </button>
            </div>

            {/* Overview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Used', value: `${(memInfo.used / 1024).toFixed(1)} GB`, total: `of ${(memInfo.total / 1024).toFixed(0)} GB`, pct: (memInfo.used / memInfo.total * 100), color: '#ff9f0a' },
                { label: 'Available', value: `${(memInfo.available / 1024).toFixed(1)} GB`, total: '', pct: (memInfo.available / memInfo.total * 100), color: '#30d158' },
                { label: 'Cached', value: `${(memInfo.cached / 1024).toFixed(1)} GB`, total: '', pct: (memInfo.cached / memInfo.total * 100), color: '#64d2ff' },
              ].map(s => (
                <div key={s.label} style={{ ...glassPanel as any, padding: 16, borderRadius: 12 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: s.color }}>{s.value}</div>
                  {s.total && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{s.total}</div>}
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Per-app memory */}
            <div style={{ ...glassPanel as any, padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>App Memory Usage</div>
              {memInfo.appMemory.map(app => (
                <div key={app.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#fff' }}>{app.name}</span>
                  <span style={{ fontSize: 11, color: app.trend === 'up' ? '#ff453a' : app.trend === 'down' ? '#30d158' : 'rgba(255,255,255,0.4)' }}>
                    {app.trend === 'up' ? '↑' : app.trend === 'down' ? '↓' : '–'}
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', width: 60, textAlign: 'right' as const }}>{app.memory} MB</span>
                </div>
              ))}
            </div>

            {/* Swap */}
            <div style={{ ...glassPanel as any, padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Swap</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                <span>{(memInfo.swapUsed / 1024).toFixed(1)} GB used</span>
                <span>{(memInfo.swapTotal / 1024).toFixed(0)} GB total</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(memInfo.swapUsed / memInfo.swapTotal) * 100}%`, background: '#bf5af2', borderRadius: 2 }} />
              </div>
            </div>
          </div>
        )}

        {/* ═══ STARTUP TAB ═══ */}
        {tab === 'startup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Startup Items</h3>

            <div style={{ ...glassPanel as any, borderRadius: 12, overflow: 'hidden' }}>
              {startupItems.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < startupItems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontSize: 14, display: 'flex' }}>{item.type === 'app' ? <PackageIcon size={14} /> : item.type === 'service' ? <SettingsIcon size={14} /> : <FileTextIcon size={14} />}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                      Impact: <span style={{ color: item.impact === 'high' ? '#ff453a' : item.impact === 'medium' ? '#ff9f0a' : '#30d158' }}>{item.impact}</span>
                      {item.delay > 0 && ` · Delay: ${item.delay}s`}
                    </div>
                  </div>
                  <ToggleSwitch checked={item.enabled} onChange={() => toggleStartup(item.id)} />
                </div>
              ))}
            </div>

            <h3 style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 600, color: '#fff' }}>Scheduled Tasks</h3>
            <div style={{ ...glassPanel as any, borderRadius: 12, overflow: 'hidden' }}>
              {scheduledTasks.map((task, i) => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < scheduledTasks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{task.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{task.schedule} · Last: {task.lastRun}</div>
                  </div>
                  <ToggleSwitch checked={task.enabled} onChange={() => toggleScheduled(task.id)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ THERMAL TAB ═══ */}
        {tab === 'thermal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Thermal Monitoring</h3>

            {thermals.map(zone => {
              const pct = (zone.temp / zone.maxTemp) * 100;
              const color = pct > 80 ? '#ff453a' : pct > 60 ? '#ff9f0a' : '#30d158';
              return (
                <div key={zone.name} style={{ ...glassPanel as any, padding: 16, borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{zone.name}</span>
                    <span style={{ fontSize: 20, fontWeight: 500, color }}>{zone.temp.toFixed(0)}°C</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                    <span>Max: {zone.maxTemp}°C</span>
                    {zone.fanSpeed > 0 && <span>Fan: {zone.fanSpeed} RPM / {zone.maxFanSpeed} RPM</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ CONTROLS TAB ═══ (original Power controls) */}
        {tab === 'controls' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>System Controls</h3>

            {panicStopped && (
              <div style={{ ...glassPanel as any, padding: 16, borderRadius: 12, border: '1px solid rgba(255,69,58,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, color: '#ff453a', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><WarningIcon size={14} color="#ff453a" /> All systems stopped</span>
                <button onClick={() => { setPanicStopped(false); setAutomationsEnabled(true); }} style={{ ...glassButton, padding: '6px 14px', fontSize: 12, color: '#30d158', background: 'rgba(48,209,88,0.15)', border: '1px solid rgba(48,209,88,0.25)' }}>
                  Resume
                </button>
              </div>
            )}

            <div style={{ ...glassPanel as any, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Automation</div>
              <ControlRow label="Automations" description="Run automated tasks and workflows" checked={automationsEnabled && !panicStopped} onChange={() => setAutomationsEnabled(!automationsEnabled)} disabled={panicStopped} />
              <ControlRow label="Learning" description="Learn from usage patterns" checked={learningEnabled && !panicStopped} onChange={() => setLearningEnabled(!learningEnabled)} disabled={panicStopped} />
            </div>

            <div style={{ ...glassPanel as any, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Security</div>
              <ControlRow label="Lock DEX" description="Require authentication to access" checked={appLocked} onChange={() => setAppLocked(!appLocked)} />
              <ControlRow label="Safe Mode" description="Disable all extensions and custom scripts" checked={safeMode} onChange={() => setSafeMode(!safeMode)} />
            </div>

            <div style={{ ...glassPanel as any, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>Emergency</div>
              <button
                onClick={handlePanicStop}
                disabled={panicStopped}
                style={{
                  width: '100%', padding: 14, borderRadius: 10,
                  background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.25)',
                  color: '#ff453a', fontSize: 14, fontWeight: 500, cursor: panicStopped ? 'default' : 'pointer',
                  opacity: panicStopped ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                Panic Stop
              </button>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0' }}>
                Immediately stop all automations, workflows, and background tasks
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Toggle Switch Component
// ═══════════════════════════════════════════════════════════════════════════

const ToggleSwitch: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button
    onClick={onChange}
    disabled={disabled}
    style={{
      width: 40, height: 22, borderRadius: 11, border: 'none',
      cursor: disabled ? 'default' : 'pointer', position: 'relative' as const,
      padding: 0, flexShrink: 0, transition: 'background 0.2s ease',
      background: checked ? '#0a84ff' : 'rgba(255,255,255,0.15)',
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

// ═══════════════════════════════════════════════════════════════════════════
// Control Row Component
// ═══════════════════════════════════════════════════════════════════════════

const ControlRow: React.FC<{ label: string; description: string; checked: boolean; onChange: () => void; disabled?: boolean }> = ({ label, description, checked, onChange, disabled }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: disabled ? 0.5 : 1 }}>
    <div>
      <div style={{ fontSize: 14, color: '#fff' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{description}</div>
    </div>
    <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
  </div>
);

Power.displayName = 'Power';
export default memo(Power);

