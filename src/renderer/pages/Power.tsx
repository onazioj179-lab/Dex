// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * POWER — battery, power mode and energy use.
 *
 * Everything shown here comes from a real source: the Battery API, the native
 * power plan (powercfg on Windows), the Screen Wake Lock API and the live
 * process list. Process management and memory live in Task Manager; this page
 * does not duplicate them. Controls that had no implementation (CPU/GPU/fan
 * limits, thermal zones, startup items, "Shield", Safe Mode, Lock) were removed
 * rather than shown as if they worked.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { useToastHelpers } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { BatteryIcon, BoltIcon, GaugeIcon } from '../utils/icons';

// ===========================================================================
// PURE HELPERS (unit-tested)
// ===========================================================================

export type PowerMode = 'saver' | 'balanced' | 'performance';

/** Native profile names (power.rs) -> the three modes shown here. */
export function modeFromNative(profile: unknown): PowerMode {
  if (profile === 'eco' || profile === 'powerSaver') return 'saver';
  if (profile === 'boost' || profile === 'highPerformance') return 'performance';
  return 'balanced';
}

export interface BatterySnapshot {
  level: number;            // 0..1
  charging: boolean;
  chargingTime: number;     // seconds, Infinity when unknown
  dischargingTime: number;  // seconds, Infinity when unknown
}

export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** One honest line for the battery state. */
export function describeBattery(b: BatterySnapshot): string {
  const pct = Math.round(b.level * 100);
  if (b.charging) {
    if (pct >= 100) return 'Plugged in · fully charged';
    const t = formatDuration(b.chargingTime);
    return t ? `Charging · full in ${t}` : 'Charging';
  }
  const t = formatDuration(b.dischargingTime);
  return t ? `On battery · ${t} left` : 'On battery';
}

export interface ProcessRow { pid: number; name: string; cpu: number; memory: number }

/**
 * Top CPU users, the main driver of energy use. Ignores idle rows. Native CPU
 * is per core (one busy thread on 8 cores = 100%); dividing by the core count
 * gives share of the whole CPU, as Windows Task Manager shows it.
 */
export function rankEnergy(rows: unknown, limit = 10, cores = 1): ProcessRow[] {
  if (!Array.isArray(rows)) return [];
  const per = Math.max(1, cores);
  return rows
    .filter((r): r is ProcessRow => !!r && typeof r.pid === 'number' && typeof r.name === 'string')
    .map(r => ({ pid: r.pid, name: r.name, cpu: (Number(r.cpu) || 0) / per, memory: Number(r.memory) || 0 }))
    .filter(r => r.cpu >= 0.1)
    .sort((a, b) => b.cpu - a.cpu || b.memory - a.memory)
    .slice(0, limit);
}

// ===========================================================================
// STORAGE
// ===========================================================================

const LOG_KEY = 'dex-power-event-log';
const LOG_MAX = 50;

interface PowerLogEntry { id: string; label: string; at: number }

function loadLog(): PowerLogEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(v) ? v.filter(e => e && typeof e.label === 'string' && typeof e.at === 'number').slice(0, LOG_MAX) : [];
  } catch { return []; }
}

const MODES: { key: PowerMode; label: string; desc: string }[] = [
  { key: 'saver', label: 'Power Saver', desc: 'Longer battery life' },
  { key: 'balanced', label: 'Balanced', desc: 'Windows default' },
  { key: 'performance', label: 'High Performance', desc: 'Faster, uses more power' },
];

const KEEP_AWAKE_OPTIONS = [15, 30, 60, 120];

type Tab = 'battery' | 'mode' | 'energy';

const dex = () => (window as any).dex;

// ===========================================================================
// COMPONENT
// ===========================================================================

export const Power: React.FC = () => {
  const toast = useToastHelpers();
  const { confirm, ConfirmHost } = useConfirm();
  const [tab, setTab] = useState<Tab>('battery');

  // --- Battery (Battery API) ---
  const [battery, setBattery] = useState<BatterySnapshot | null>(null);
  const [log, setLog] = useState<PowerLogEntry[]>(loadLog);

  const pushLog = useCallback((label: string) => {
    setLog(prev => {
      const now = Date.now();
      if (prev[0] && prev[0].label === label && now - prev[0].at < 2000) return prev;
      const next = [{ id: `${now}-${Math.random().toString(36).slice(2, 7)}`, label, at: now }, ...prev].slice(0, LOG_MAX);
      try { localStorage.setItem(LOG_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  useEffect(() => {
    let bat: any = null;
    let cancelled = false;
    const apply = () => {
      if (!bat || cancelled) return;
      setBattery({ level: bat.level, charging: bat.charging, chargingTime: bat.chargingTime, dischargingTime: bat.dischargingTime });
    };
    const onCharging = () => { apply(); pushLog(bat.charging ? 'Power adapter connected' : 'Running on battery'); };
    try {
      const get = (navigator as any).getBattery;
      if (typeof get === 'function') {
        get.call(navigator).then((b: any) => {
          if (cancelled) return;
          bat = b;
          apply();
          b.addEventListener('chargingchange', onCharging);
          b.addEventListener('levelchange', apply);
          b.addEventListener('chargingtimechange', apply);
          b.addEventListener('dischargingtimechange', apply);
        }).catch(() => { /* unavailable */ });
      }
    } catch { /* unavailable */ }
    const onOnline = () => pushLog('Network connected');
    const onOffline = () => pushLog('Network disconnected');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (bat) {
        bat.removeEventListener('chargingchange', onCharging);
        bat.removeEventListener('levelchange', apply);
        bat.removeEventListener('chargingtimechange', apply);
        bat.removeEventListener('dischargingtimechange', apply);
      }
    };
  }, [pushLog]);

  // --- Power mode (native plan) ---
  const [mode, setMode] = useState<PowerMode | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeNote, setModeNote] = useState<string | null>(null);

  useEffect(() => {
    dex()?.power?.getProfile?.()
      .then((p: unknown) => { if (p) setMode(modeFromNative(p)); })
      .catch(() => { /* bridge absent */ });
  }, []);

  const chooseMode = useCallback(async (next: PowerMode) => {
    if (modeBusy || next === mode) return;
    setModeBusy(true);
    setModeNote(null);
    try {
      const native = next === 'saver' ? 'eco' : next === 'performance' ? 'boost' : 'balanced';
      const res = await dex()?.power?.setProfile?.(native);
      const actual = await dex()?.power?.getProfile?.().catch(() => null);
      if (actual) setMode(modeFromNative(actual));
      const changes: string[] = Array.isArray(res?.changes) ? res.changes : [];
      // Surface failures (e.g. "may require admin"); success needs no message.
      const problem = changes.find(c => /could not|requires|not available/i.test(c));
      if (!res) setModeNote('Power plans can only be changed in the DEX app.');
      else if (problem) setModeNote(problem);
      else if (res.success === false || !actual) setModeNote('Could not verify the active power plan.');
    } catch {
      setModeNote('Could not change the power plan.');
    } finally {
      setModeBusy(false);
    }
  }, [mode, modeBusy]);

  // --- Keep awake (Screen Wake Lock API) ---
  const wakeLock = useRef<any>(null);
  const wakeRequest = useRef(0);
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [awakeUntil, setAwakeUntil] = useState(0);
  const wakeSupported = typeof (navigator as any).wakeLock?.request === 'function';

  const releaseWake = useCallback(() => {
    try { wakeLock.current?.release?.(); } catch { /* already released */ }
    wakeLock.current = null;
  }, []);
  const stopAwake = useCallback(() => {
    wakeRequest.current++;
    if (wakeTimer.current) { clearTimeout(wakeTimer.current); wakeTimer.current = null; }
    releaseWake();
    setAwakeUntil(0);
  }, [releaseWake]);
  const requestWake = useCallback(async () => {
    try {
      if (document.hidden) return false;
      const request = ++wakeRequest.current;
      const lock = await (navigator as any).wakeLock.request('screen');
      if (document.hidden || request !== wakeRequest.current) {
        await lock.release();
        return false;
      }
      wakeLock.current = lock;
      return true;
    } catch { return false; }
  }, []);
  const startAwake = useCallback(async (minutes: number) => {
    stopAwake();
    if (!(await requestWake())) { toast.error('Keep awake is not available right now'); return; }
    setAwakeUntil(Date.now() + minutes * 60_000);
    wakeTimer.current = setTimeout(stopAwake, minutes * 60_000);
  }, [requestWake, stopAwake, toast]);

  // The OS drops wake locks when the page hides; take it back on return.
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden && awakeUntil > Date.now() && (!wakeLock.current || wakeLock.current.released)) void requestWake();
      pushLog(document.hidden ? 'Display off or DEX hidden' : 'Resumed');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [awakeUntil, requestWake, pushLog]);
  useEffect(() => () => stopAwake(), [stopAwake]);

  // Tick the remaining time once a minute while active.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!awakeUntil) return;
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, [awakeUntil]);

  // --- Energy (live processes, only while that tab is open) ---
  const [procs, setProcs] = useState<ProcessRow[] | null>(null);
  const cores = useRef(0);
  useEffect(() => {
    if (tab !== 'energy') return;
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      if (!cores.current) {
        const st = await dex()?.system?.getStatus?.().catch(() => null);
        cores.current = Number(st?.cpu?.cores) || 1;
      }
      const rows = await dex()?.system?.getProcesses?.().catch(() => null);
      if (alive) setProcs(rows ? rankEnergy(rows, 10, cores.current) : []);
    };
    void poll();
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [tab]);

  const endProcess = useCallback(async (p: ProcessRow) => {
    const ok = await confirm({
      title: `End ${p.name}?`,
      message: 'Unsaved work in that program will be lost.',
      confirmLabel: 'End process',
      tone: 'destructive',
    });
    if (!ok) return;
    const res = await dex()?.power?.closeProcess?.(p.pid, false).catch(() => null);
    if (res?.success) setProcs(prev => prev?.filter(r => r.pid !== p.pid) ?? prev);
    else toast.error(`Could not end ${p.name}`);
  }, [confirm, toast]);

  const totalCpu = useMemo(() => (procs ?? []).reduce((s, p) => s + p.cpu, 0), [procs]);

  // =========================================================================
  // RENDER
  // =========================================================================

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'battery', label: 'Battery', icon: <BatteryIcon size={14} /> },
    { key: 'mode', label: 'Power Mode', icon: <GaugeIcon size={14} /> },
    { key: 'energy', label: 'Energy Use', icon: <BoltIcon size={14} /> },
  ];

  const pct = battery ? Math.round(battery.level * 100) : null;

  return (
    <div style={S.root}>
      <nav style={S.sidebar} aria-label="Power sections">
        <h2 style={S.title}>Power</h2>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? 'page' : undefined}
              style={{ ...S.navItem, ...(active ? S.navItemActive : null) }}
            >
              <span style={{ color: active ? 'var(--color-accent)' : 'currentColor', display: 'inline-flex' }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

      <main style={S.main}>
        {tab === 'battery' && (
          <section style={S.section}>
            <h3 style={S.h3}>Battery</h3>
            {battery && pct !== null ? (
              <div style={S.card}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                  <span style={S.big}>{pct}%</span>
                  <span style={S.muted}>{describeBattery(battery)}</span>
                </div>
                <div style={S.track} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Battery level">
                  <div style={{ ...S.fill, width: `${pct}%`, background: pct <= 20 && !battery.charging ? 'var(--color-error)' : 'var(--color-accent-fill)' }} />
                </div>
              </div>
            ) : (
              <div style={S.card}><span style={S.muted}>Battery information is not available on this device.</span></div>
            )}

            <div style={S.rowHead}>
              <h3 style={S.h3}>Recent events</h3>
              {log.length > 0 && (
                <button style={S.link} onClick={() => { setLog([]); try { localStorage.removeItem(LOG_KEY); } catch { /* ignore */ } }}>Clear</button>
              )}
            </div>
            <div style={S.list}>
              {log.length === 0 && <div style={{ ...S.listRow, ...S.muted }}>No events yet</div>}
              {log.slice(0, 15).map((e, i) => (
                <div key={`${e.id}-${i}`} style={S.listRow}>
                  <span>{e.label}</span>
                  <span style={S.muted}>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'mode' && (
          <section style={S.section}>
            <h3 style={S.h3}>Power Mode</h3>
            <div role="radiogroup" aria-label="Power mode" style={S.segment}>
              {MODES.map(m => {
                const on = mode === m.key;
                return (
                  <button
                    key={m.key}
                    role="radio"
                    aria-checked={on}
                    disabled={modeBusy || mode === null}
                    onClick={() => void chooseMode(m.key)}
                    style={{ ...S.segmentItem, ...(on ? S.segmentItemOn : null) }}
                  >
                    <span style={{ fontWeight: 600 }}>{m.label}</span>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>{m.desc}</span>
                  </button>
                );
              })}
            </div>
            {mode === null && <div style={S.muted}>Power plans can only be changed in the DEX app.</div>}
            {modeNote && <div role="status" style={{ ...S.muted, color: 'var(--color-warning)' }}>{modeNote}</div>}

            <h3 style={S.h3}>Keep Awake</h3>
            {wakeSupported ? (
              <div style={S.card}>
                {awakeUntil > Date.now() ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Display stays on for {Math.max(1, Math.ceil((awakeUntil - Date.now()) / 60_000))} more min</span>
                    <button style={S.button} onClick={stopAwake}>Stop</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {KEEP_AWAKE_OPTIONS.map(min => (
                      <button key={min} style={S.button} onClick={() => void startAwake(min)}>
                        {min < 60 ? `${min} min` : `${min / 60} h`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={S.card}><span style={S.muted}>Not supported on this device.</span></div>
            )}
          </section>
        )}

        {tab === 'energy' && (
          <section style={S.section}>
            <div style={S.rowHead}>
              <h3 style={S.h3}>Energy Use</h3>
              {procs && procs.length > 0 && <span style={S.muted}>Top programs by CPU · {totalCpu.toFixed(1)}% total</span>}
            </div>
            <div style={S.list} role="table" aria-label="Programs using the most CPU">
              {procs === null && <div style={{ ...S.listRow, ...S.muted }}>Loading…</div>}
              {procs !== null && procs.length === 0 && (
                <div style={{ ...S.listRow, ...S.muted }}>{dex()?.system?.getProcesses ? 'Nothing is using noticeable CPU' : 'Process information is only available in the DEX app'}</div>
              )}
              {procs?.map(p => (
                <div key={p.pid} role="row" style={S.listRow}>
                  <span role="cell" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span role="cell" style={{ ...S.num, width: 70 }}>{p.cpu.toFixed(1)}%</span>
                  <span role="cell" style={{ ...S.num, width: 80, ...S.muted }}>{p.memory >= 1024 ? `${(p.memory / 1024).toFixed(1)} GB` : `${p.memory} MB`}</span>
                  <button style={S.link} onClick={() => void endProcess(p)} aria-label={`End ${p.name}`}>End</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <ConfirmHost />
    </div>
  );
};

// ===========================================================================
// STYLES (theme tokens only)
// ===========================================================================

const S: Record<string, React.CSSProperties> = {
  root: { width: '100%', height: '100%', display: 'flex', background: 'var(--pg-surface)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: 13, overflow: 'hidden' },
  sidebar: { width: 'var(--pg-sidebar-width)' as any, flexShrink: 0, padding: 'var(--space-4) 10px', background: 'var(--pg-sidebar)', borderRight: '1px solid var(--pg-border)', display: 'flex', flexDirection: 'column', gap: 2 },
  title: { fontSize: 16, fontWeight: 700, margin: '0 0 var(--space-3) var(--space-2)', letterSpacing: -0.2 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px var(--space-3)', height: 'var(--pg-row-height)' as any, borderRadius: 'var(--pg-row-radius)' as any, border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', textAlign: 'left' },
  navItemActive: { background: 'var(--pg-row-active)', boxShadow: 'inset 0 0 0 1px var(--pg-border-active)', color: 'var(--color-text-primary)', fontWeight: 600 },
  main: { flex: 1, overflow: 'auto', padding: 'var(--space-5) var(--space-6)' },
  section: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 560 },
  h3: { margin: 'var(--space-2) 0 0', fontSize: 15, fontWeight: 600 },
  rowHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' },
  card: { padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  big: { fontSize: 28, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  muted: { color: 'var(--color-text-secondary)', fontSize: 12 },
  track: { height: 6, borderRadius: 'var(--radius-full)' as any, background: 'var(--color-bg-hover)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 'var(--radius-full)' as any, transition: 'width 0.3s ease' },
  list: { borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)', overflow: 'hidden' },
  listRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: '9px var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)' },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  segment: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' },
  segmentItem: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', cursor: 'pointer', textAlign: 'left', fontSize: 13 },
  segmentItemOn: { borderColor: 'var(--color-accent)', boxShadow: 'inset 0 0 0 1px var(--color-accent)' },
  button: { padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer' },
  link: { background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)', fontSize: 12, cursor: 'pointer' },
};

Power.displayName = 'Power';
export default memo(Power);
