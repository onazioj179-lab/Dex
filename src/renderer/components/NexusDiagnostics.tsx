// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus > Diagnostics: how DEX itself is performing. Startup phases, app launch
 * times, frame timing, DEX's own memory and CPU, crashes and errors, and
 * background task durations. Every number is measured on this computer and
 * stays here; "Copy report" puts a numbers-only summary on the clipboard when
 * you ask for it.
 */
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { APP_DEFINITIONS } from '../store/runningApps';
import { useUkiTasks } from '../store/ukiTasksStore';
import {
  getSnapshot, subscribe, measureFrames, percentile, clearLaunches, type FrameStats,
} from '../services/diagnostics/localMetrics';

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
// Looked up when the view mounts, not at module load: in the packaged build this
// module can be evaluated before the Tauri bridge (window.dex) is installed.
const getInvoke = (): Invoke | undefined => (window as unknown as { dex?: { invoke?: Invoke } }).dex?.invoke;

interface Timeline { totalMs: number; phases: Array<{ name: string; durationMs: number; atMs: number }> }
interface SelfSample { available: boolean; processCount: number; memoryMB: number; hostMemoryMB: number; cpuPercent: number }
interface SystemSample { cpuPercent: number; memoryPercent: number; memoryUsedMB: number; memoryTotalMB: number }
interface CrashStats { totalCrashes: number; crashesThisSession: number; crashesSinceUpdate: number; lastCrash: number }
interface CrashRecord { id: string; timestamp: number; type: string; message: string }

const REFRESH_MS = 3000;

function appName(id: string): string {
  return APP_DEFINITIONS[id]?.name ?? id;
}
function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–';
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;
}
function fmtAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function useLocalSnapshot() {
  // getSnapshot builds a new object each call, so cache it per change notification.
  const [version, setVersion] = useState(0);
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);
  return useMemo(() => getSnapshot(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useVisible(): boolean {
  return useSyncExternalStore(
    (cb) => { document.addEventListener('visibilitychange', cb); return () => document.removeEventListener('visibilitychange', cb); },
    () => document.visibilityState === 'visible',
  );
}

const NexusDiagnostics: React.FC = () => {
  const invoke = useMemo(getInvoke, []);
  const local = useLocalSnapshot();
  const visible = useVisible();
  const tasks = useUkiTasks((s) => s.tasks);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [self, setSelf] = useState<SelfSample | null>(null);
  const [system, setSystem] = useState<SystemSample | null>(null);
  const [crashes, setCrashes] = useState<CrashStats | null>(null);
  const [recentCrashes, setRecentCrashes] = useState<CrashRecord[]>([]);
  const [frames, setFrames] = useState<FrameStats | null>(null);
  const [framesSkipped, setFramesSkipped] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Live resource figures: only while this view is open and the window visible.
  useEffect(() => {
    if (!invoke || !visible) return;
    let alive = true;
    const pull = async () => {
      const [s, sys] = await Promise.all([
        invoke('xenon:selfSample').catch(() => null),
        invoke('xenon:systemSample').catch(() => null),
      ]);
      if (!alive) return;
      if (s && (s as SelfSample).available) setSelf(s as SelfSample);
      if (sys) setSystem(sys as SystemSample);
      setTick((t) => t + 1);
    };
    void pull();
    const id = window.setInterval(pull, REFRESH_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [visible, invoke]);

  const loadOnce = useCallback(async () => {
    if (!invoke) return;
    const [tl, cs, rc] = await Promise.all([
      invoke('startup:timeline').catch(() => null),
      invoke('crash-reporter:getStats').catch(() => null),
      invoke('crash-reporter:getRecent', 5).catch(() => null),
    ]);
    if (tl) setTimeline(tl as Timeline);
    if (cs) setCrashes(cs as CrashStats);
    if (Array.isArray(rc)) setRecentCrashes((rc as CrashRecord[]).slice().reverse());
  }, [invoke]);

  const runFrames = useCallback(async () => {
    setMeasuring(true);
    try {
      const r = await measureFrames(2000);
      setFramesSkipped(r === null);
      if (r) setFrames(r);
    } finally { setMeasuring(false); }
  }, []);

  useEffect(() => { void loadOnce(); void runFrames(); }, [loadOnce, runFrames]);

  const launchRows = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const l of local.launches) by.set(l.appId, [...(by.get(l.appId) ?? []), l.ms]);
    return [...by.entries()]
      .map(([id, ms]) => ({ id, count: ms.length, median: percentile(ms, 50), last: ms[ms.length - 1] }))
      .sort((a, b) => b.median - a.median);
  }, [local.launches]);
  const allLaunches = local.launches.map((l) => l.ms);

  const taskRows = useMemo(() => tasks
    .filter((t) => t.finishedAt || t.status === 'running')
    .slice(-8)
    .reverse()
    .map((t) => ({ id: t.id, source: t.source, status: t.status, ms: (t.finishedAt ?? Date.now()) - t.createdAt })),
  [tasks, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyReport = useCallback(async () => {
    // Numbers, app ids and statuses only: no titles, messages or content.
    const report = {
      generatedAt: new Date().toISOString(),
      startup: { native: timeline, interface: local.startup },
      launches: launchRows.map(({ id, count, median, last }) => ({ app: id, count, medianMs: median, lastMs: last })),
      frames,
      longTasks: local.longTasks,
      resources: { dex: self, system, jsHeapMB: local.heapMB },
      stability: { crashes: crashes && { total: crashes.totalCrashes, thisSession: crashes.crashesThisSession, sinceUpdate: crashes.crashesSinceUpdate }, errorsThisSession: local.errors.count },
      backgroundTasks: taskRows.map(({ source, status, ms }) => ({ source, status, ms })),
    };
    const text = JSON.stringify(report, null, 2);
    try {
      const native = (window as unknown as { dex?: { clipboard?: { writeText?: (t: string) => Promise<unknown> } } }).dex?.clipboard;
      if (native?.writeText) await native.writeText(text); else await navigator.clipboard.writeText(text);
      setStatus('Report copied. It contains numbers only.');
    } catch {
      setStatus('Could not copy the report.');
    }
    window.setTimeout(() => setStatus(null), 3000);
  }, [timeline, local, launchRows, frames, self, system, crashes, taskRows]);

  const nativePhases = timeline?.phases ?? [];

  return (
    <div style={S.root} aria-label="Diagnostics">
      <div style={S.bar}>
        <div style={S.note}>Measured on this computer. Nothing is uploaded.</div>
        <div style={S.barActions}>
          {status && <span role="status" style={S.status}>{status}</span>}
          <button style={S.btn} onClick={() => { void loadOnce(); void runFrames(); }} disabled={measuring}>Refresh</button>
          <button style={S.btn} onClick={() => void copyReport()}>Copy report</button>
        </div>
      </div>

      <div style={S.grid}>
        <Card title="DEX resource use" hint={visible ? `Updates every ${REFRESH_MS / 1000} s while open` : 'Paused while hidden'}>
          {invoke ? (
            <>
              <Stat label="Memory (all DEX processes)" value={self ? `${self.memoryMB.toLocaleString()} MB` : '–'} />
              <Stat label="Host process" value={self ? `${self.hostMemoryMB.toLocaleString()} MB` : '–'} />
              <Stat label="CPU (share of this PC)" value={self ? `${self.cpuPercent.toFixed(1)}%` : '–'} />
              <Stat label="Processes" value={self ? String(self.processCount) : '–'} />
              <Stat label="Interface script memory" value={local.heapMB !== null ? `${local.heapMB} MB` : '–'} />
              <Divider />
              <Stat label="System CPU" value={system ? `${system.cpuPercent.toFixed(0)}%` : '–'} />
              <Stat label="System memory" value={system ? `${(system.memoryUsedMB / 1024).toFixed(1)} of ${(system.memoryTotalMB / 1024).toFixed(1)} GB` : '–'} />
            </>
          ) : (
            <>
              <Stat label="Interface script memory" value={local.heapMB !== null ? `${local.heapMB} MB` : '–'} />
              <div style={S.empty}>Process figures are available in the installed app.</div>
            </>
          )}
        </Card>

        <Card title="Startup" hint="This session">
          {nativePhases.length > 0 ? nativePhases.map((p) => (
            <Stat key={p.name} label={p.name} value={fmtMs(p.atMs)} sub={`+${fmtMs(p.durationMs)}`} />
          )) : invoke ? null : <div style={S.empty}>Native phases are available in the installed app.</div>}
          {nativePhases.length > 0 && <Divider />}
          <Stat label="Interface document ready" value={fmtMs(local.startup.domContentLoadedMs)} />
          <Stat label="Interface loaded" value={fmtMs(local.startup.loadMs)} />
          <Stat label="Desktop shown" value={fmtMs(local.startup.shellReadyMs)} sub={local.startup.shellReadyMs === null ? '(not measured: window hidden at start)' : undefined} />
          <div style={S.caption}>Interface times are from the start of the interface page.</div>
        </Card>

        <Card title="Responsiveness" hint={measuring ? 'Measuring…' : framesSkipped ? 'Window hidden; not measured' : frames ? `${frames.frames} frames over 2 s` : ''}>
          <Stat label="Frame rate" value={frames ? `${frames.fps} fps` : '–'} />
          <Stat label="Frame time (median)" value={frames ? `${frames.p50} ms` : '–'} />
          <Stat label="Frame time (95th percentile)" value={frames ? `${frames.p95} ms` : '–'} />
          <Stat label="Slow frames (over 25 ms)" value={frames ? String(frames.slowFrames) : '–'} />
          <Divider />
          <Stat label="Long tasks this session" value={String(local.longTasks.count)} sub={local.longTasks.count ? `${fmtMs(local.longTasks.totalMs)} total, longest ${fmtMs(local.longTasks.maxMs)}` : undefined} />
          <div style={S.caption}>A long task blocks the interface for more than 50 ms.</div>
        </Card>

        <Card title="Stability" hint="Crash log on this computer">
          <Stat label="Crashes this session" value={crashes ? String(crashes.crashesThisSession) : invoke ? '–' : 'n/a'} />
          <Stat label="Crashes in this version" value={crashes ? String(crashes.crashesSinceUpdate) : invoke ? '–' : 'n/a'} />
          <Stat label="Crashes recorded" value={crashes ? String(crashes.totalCrashes) : invoke ? '–' : 'n/a'} />
          <Stat label="Interface errors this session" value={String(local.errors.count)} />
          {(recentCrashes.length > 0 || local.errors.recent.length > 0) && <Divider />}
          {recentCrashes.slice(0, 3).map((c) => (
            <div key={c.id} style={S.logRow}><span style={S.logMsg} title={c.message}>{c.message || c.type}</span><span style={S.logAt}>{fmtAgo(c.timestamp)}</span></div>
          ))}
          {local.errors.recent.slice(0, 3).map((e, i) => (
            <div key={`${e.at}-${i}`} style={S.logRow}><span style={S.logMsg} title={e.message}>{e.message}</span><span style={S.logAt}>{fmtAgo(e.at)}</span></div>
          ))}
        </Card>

        <Card title="App launch times" hint={allLaunches.length ? `Median ${fmtMs(percentile(allLaunches, 50))} · 95th ${fmtMs(percentile(allLaunches, 95))}` : 'Request to first frame'} wide>
          {launchRows.length === 0 ? (
            <div style={S.empty}>Open an app to record its launch time.</div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr><th style={S.th}>App</th><th style={S.thNum}>Launches</th><th style={S.thNum}>Median</th><th style={S.thNum}>Last</th></tr>
              </thead>
              <tbody>
                {launchRows.map((r) => (
                  <tr key={r.id}>
                    <td style={S.td}>{appName(r.id)}</td>
                    <td style={S.tdNum}>{r.count}</td>
                    <td style={{ ...S.tdNum, color: r.median > 500 ? 'var(--color-warning)' : undefined }}>{fmtMs(r.median)}</td>
                    <td style={S.tdNum}>{fmtMs(r.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {launchRows.length > 0 && <button style={{ ...S.link, alignSelf: 'flex-start' }} onClick={clearLaunches}>Clear launch history</button>}
        </Card>

        <Card title="Background tasks" hint="Assistant and automation tasks" wide>
          {taskRows.length === 0 ? (
            <div style={S.empty}>No background tasks yet.</div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr><th style={S.th}>Source</th><th style={S.th}>Status</th><th style={S.thNum}>Duration</th></tr>
              </thead>
              <tbody>
                {taskRows.map((t) => (
                  <tr key={t.id}>
                    <td style={S.td}>{APP_DEFINITIONS[t.source]?.name ?? t.source}</td>
                    <td style={S.td}>{t.status[0].toUpperCase() + t.status.slice(1)}</td>
                    <td style={S.tdNum}>{fmtMs(t.ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
};

const Card: React.FC<{ title: string; hint?: string; wide?: boolean; children: React.ReactNode }> = ({ title, hint, wide, children }) => (
  <section style={{ ...S.card, ...(wide ? { gridColumn: '1 / -1' } : null) }} aria-label={title}>
    <div style={S.cardHead}>
      <h3 style={S.cardTitle}>{title}</h3>
      {hint && <span style={S.cardHint}>{hint}</span>}
    </div>
    {children}
  </section>
);

const Stat: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div style={S.stat}>
    <span style={S.statLabel}>{label}</span>
    <span style={S.statValue}>{value}{sub && <span style={S.statSub}> {sub}</span>}</span>
  </div>
);

const Divider: React.FC = () => <div style={S.divider} />;

const S: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 },
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  barActions: { display: 'flex', alignItems: 'center', gap: 8 },
  note: { fontSize: 12, color: 'var(--color-text-secondary)' },
  status: { fontSize: 12, color: 'var(--color-text-secondary)' },
  btn: { height: 28, padding: '0 12px', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  link: { minHeight: 28, padding: '0 4px', border: 'none', background: 'transparent', color: 'var(--color-accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 },
  card: { display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 14px', borderRadius: 10, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)', minWidth: 0 },
  cardHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  cardTitle: { margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' },
  cardHint: { fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'right' },
  stat: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minHeight: 24 },
  statLabel: { fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  statValue: { fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  statSub: { fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' },
  divider: { height: 1, background: 'var(--color-border-subtle)', margin: '6px 0' },
  caption: { fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 },
  empty: { fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 0' },
  logRow: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, minHeight: 20, alignItems: 'center' },
  logMsg: { color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontFamily: 'var(--font-mono)' },
  logAt: { color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' },
  thNum: { textAlign: 'right', fontWeight: 500, color: 'var(--color-text-tertiary)', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' },
  td: { padding: '5px 0', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-subtle)' },
  tdNum: { padding: '5px 0', textAlign: 'right', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--color-border-subtle)' },
};

export default NexusDiagnostics;
