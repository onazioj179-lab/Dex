// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Task Manager > Diagnostics: how DEX itself is performing. Laid out like the
 * Performance view -- a section list on the left (each row shows its headline
 * figure) and one detail pane -- instead of a grid of cards. Sections: DEX
 * resource use (live history with 1/5/15-minute ranges), startup (phase
 * waterfall), responsiveness (frame timing on request), stability (crash log
 * and interface errors), app launch times and background tasks.
 *
 * Every number is measured on this computer and stays here; "Copy report"
 * puts a numbers-only summary on the clipboard when you ask for it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SegmentedControl } from './controls';
import { APP_DEFINITIONS } from '../store/runningApps';
import { useUkiTasks } from '../store/ukiTasksStore';
import {
  getSnapshot, subscribe, measureFrames, percentile, clearLaunches, type FrameStats,
} from '../services/diagnostics/localMetrics';
import {
  RANGES, SAMPLE_MS, type RangeId, type ResourceSample,
  pushResourceSample, getResourceSamples, samplesInRange, capacityFor, summarise, niceCeil, phaseWaterfall,
} from '../services/diagnostics/resourceHistory';
import { LineChart } from './telemetry/LineChart';
import { getBuildInfo } from '../utils/appVersion';

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
// Looked up when the view mounts, not at module load: in the packaged build this
// module can be evaluated before the Tauri bridge (window.dex) is installed.
const getInvoke = (): Invoke | undefined => (window as unknown as { dex?: { invoke?: Invoke } }).dex?.invoke;

interface Timeline { totalMs: number; phases: Array<{ name: string; durationMs: number; atMs: number }> }
interface SelfSample { available: boolean; processCount: number; memoryMB: number; hostMemoryMB: number; cpuPercent: number }
interface SystemSample { cpuPercent: number; memoryPercent: number; memoryUsedMB: number; memoryTotalMB: number }
interface CrashStats { totalCrashes: number; crashesThisSession: number; crashesSinceUpdate: number; lastCrash: number }
interface CrashRecord { id: string; timestamp: number; type: string; message: string }

type Section = 'resources' | 'startup' | 'responsiveness' | 'stability' | 'launches' | 'tasks';
const SECTION_KEY = 'dex-taskmanager-diag-section';
const RANGE_KEY = 'dex-taskmanager-diag-range';
const SECTIONS: Section[] = ['resources', 'startup', 'responsiveness', 'stability', 'launches', 'tasks'];

const readPref = <T extends string>(key: string, allowed: readonly string[], fallback: T): T => {
  try { const v = localStorage.getItem(key); if (v && allowed.includes(v)) return v as T; } catch { /* storage blocked */ }
  return fallback;
};
const writePref = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* quota */ } };

interface SamplerStats {
  pulls: number; ok: number; failed: number; overlapped: number; skippedHidden: number;
  lastResult: 'ok' | 'no reply' | 'unavailable' | null; lastAt: number | null;
}
const EMPTY_SAMPLER: SamplerStats = { pulls: 0, ok: 0, failed: 0, overlapped: 0, skippedHidden: 0, lastResult: null, lastAt: null };

/** Resources header hint: what the sampler is doing right now. */
export function samplerHint(st: SamplerStats, hasFigures: boolean, visible: boolean): string {
  if (!visible) return 'Paused while hidden';
  if (hasFigures || st.ok > 0) return `Updates every ${SAMPLE_MS / 1000} s while open`;
  if (st.failed > 0) return `No reading yet (${st.failed} ${st.failed === 1 ? 'attempt' : 'attempts'}: ${st.lastResult}); retrying`;
  return 'Waiting for the first reading…';
}
const SAMPLE_TIMEOUT_MS = 8000;

/** Resolves to the call's value, or null if it fails or takes longer than `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

function appName(id: string): string {
  return APP_DEFINITIONS[id]?.name ?? id;
}
function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
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
const fmtClock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`);

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
  const [section, setSection] = useState<Section>(() => readPref<Section>(SECTION_KEY, SECTIONS, 'resources'));
  const [range, setRange] = useState<RangeId>(() => readPref<RangeId>(RANGE_KEY, RANGES.map((r) => r.id), '5m'));
  useEffect(() => writePref(SECTION_KEY, section), [section]);
  useEffect(() => writePref(RANGE_KEY, range), [range]);

  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [self, setSelf] = useState<SelfSample | null>(null);
  const [system, setSystem] = useState<SystemSample | null>(null);
  const [history, setHistory] = useState<ResourceSample[]>(() => getResourceSamples());
  const [sampleError, setSampleError] = useState(false);
  const [crashes, setCrashes] = useState<CrashStats | null>(null);
  const [recentCrashes, setRecentCrashes] = useState<CrashRecord[]>([]);
  const [frames, setFrames] = useState<FrameStats | null>(null);
  const [framesSkipped, setFramesSkipped] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Live resource figures. One sampler for the life of the view: it never stops
  // on a visibility change (a hidden/visible flip used to tear it down and, in
  // rare timing, leave it stopped), it skips its tick while the window is
  // hidden, and samples never overlap.
  const pullRef = useRef<() => Promise<void>>(async () => undefined);
  // What the sampler has done so far, so an empty pane says why instead of a
  // silent dash (and automated checks can read it from data-* attributes).
  const [sampler, setSampler] = useState<SamplerStats>(EMPTY_SAMPLER);
  useEffect(() => {
    if (!invoke) return;
    let alive = true;
    let inFlight = false;
    const pull = async () => {
      if (inFlight) { setSampler((st) => ({ ...st, overlapped: st.overlapped + 1 })); return; }
      inFlight = true;
      setSampler((st) => ({ ...st, pulls: st.pulls + 1 }));
      try {
        // Each call is time-boxed: with the overlap guard, one reply that never
        // arrived used to block every later tick, so the figures stayed empty
        // for the life of the view.
        const [s, sys] = await Promise.all([
          withTimeout(invoke('xenon:selfSample'), SAMPLE_TIMEOUT_MS),
          withTimeout(invoke('xenon:systemSample'), SAMPLE_TIMEOUT_MS),
        ]);
        if (!alive) return;
        const selfOk = !!(s && (s as SelfSample).available);
        if (selfOk) setSelf(s as SelfSample);
        if (sys) setSystem(sys as SystemSample);
        setSampleError(!selfOk && !sys);
        setSampler((st) => ({
          ...st,
          ok: st.ok + (selfOk ? 1 : 0),
          failed: st.failed + (selfOk ? 0 : 1),
          lastResult: selfOk ? 'ok' : s === null ? 'no reply' : 'unavailable',
          lastAt: Date.now(),
        }));
        if (selfOk) {
          const ss = s as SelfSample;
          setHistory(pushResourceSample({
            at: Date.now(),
            dexMemMB: ss.memoryMB,
            dexCpu: ss.cpuPercent,
            sysCpu: sys ? (sys as SystemSample).cpuPercent : 0,
          }));
        }
      } finally {
        inFlight = false;
      }
    };
    pullRef.current = pull;
    void pull();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pull();
      else setSampler((st) => ({ ...st, skippedHidden: st.skippedHidden + 1 }));
    }, SAMPLE_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [invoke]);

  const loadOnce = useCallback(async () => {
    if (!invoke) return;
    const [tl, cs, rc] = await Promise.all([
      invoke('startup:timeline').catch(() => null),
      invoke('crash-reporter:getStats').catch(() => null),
      invoke('crash-reporter:getRecent', 10).catch(() => null),
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
      .map(([id, ms]) => ({ id, count: ms.length, median: percentile(ms, 50), p95: percentile(ms, 95), last: ms[ms.length - 1] }))
      .sort((a, b) => b.median - a.median);
  }, [local.launches]);
  const allLaunches = local.launches.map((l) => l.ms);

  const taskRows = useMemo(() => tasks
    .filter((t) => t.finishedAt || t.status === 'running')
    .slice(-12)
    .reverse()
    .map((t) => ({ id: t.id, source: t.source, status: t.status, at: t.createdAt, ms: (t.finishedAt ?? Date.now()) - t.createdAt })),
  [tasks, history.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setStatus('Report copied (numbers only)');
    } catch {
      setStatus('Could not copy the report');
    }
    window.setTimeout(() => setStatus(null), 3000);
  }, [timeline, local, launchRows, frames, self, system, crashes, taskRows]);

  const errorCount = (crashes?.crashesThisSession ?? 0) + local.errors.count;
  const nav: Array<{ id: Section; name: string; value: string; detail?: string; warn?: boolean }> = [
    { id: 'resources', name: 'DEX resource use', value: self ? fmtMB(self.memoryMB) : invoke ? '—' : local.heapMB !== null ? `${local.heapMB} MB` : '—', detail: self ? `CPU ${self.cpuPercent.toFixed(1)}%` : local.heapMB !== null ? 'Interface heap' : undefined },
    { id: 'startup', name: 'Startup', value: fmtMs(local.startup.shellReadyMs ?? timeline?.totalMs ?? local.startup.loadMs), detail: 'This session' },
    { id: 'responsiveness', name: 'Responsiveness', value: frames ? `${frames.fps} fps` : measuring ? 'Measuring…' : '—', detail: `${local.longTasks.count} long task${local.longTasks.count === 1 ? '' : 's'}`, warn: !!frames && frames.p95 > 33 },
    { id: 'stability', name: 'Stability', value: errorCount === 0 ? 'No errors' : `${errorCount} this session`, detail: crashes ? `${crashes.totalCrashes} crash${crashes.totalCrashes === 1 ? '' : 'es'} recorded` : undefined, warn: errorCount > 0 },
    { id: 'launches', name: 'App launch times', value: allLaunches.length ? `Median ${fmtMs(percentile(allLaunches, 50))}` : 'None yet', detail: allLaunches.length ? `${allLaunches.length} launch${allLaunches.length === 1 ? '' : 'es'}` : undefined },
    { id: 'tasks', name: 'Background tasks', value: taskRows.length ? `${taskRows.filter((t) => t.status === 'running').length} running` : 'None', detail: taskRows.length ? `${taskRows.length} recent` : undefined },
  ];

  return (
    <div style={S.root} aria-label="Diagnostics">
      <nav aria-label="Diagnostics sections" style={S.nav}>
        {nav.map((n) => {
          const on = n.id === section;
          return (
            <button key={n.id} type="button" aria-pressed={on} onClick={() => setSection(n.id)} style={{ ...S.navItem, ...(on ? S.navItemOn : null) }}>
              <span style={S.navName}>{n.name}</span>
              <span style={{ ...S.navValue, ...(n.warn ? { color: 'var(--color-warning)' } : null) }}>{n.value}</span>
              {n.detail && <span style={S.navDetail}>{n.detail}</span>}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={S.navFoot}>
          <button type="button" style={S.btn} onClick={() => void copyReport()} title="Copy a numbers-only report to the clipboard">Copy report</button>
          <span role="status" style={S.navNote}>{status ?? 'Measured here. Nothing is uploaded.'}</span>
        </div>
      </nav>

      <section style={S.main} aria-label={nav.find((n) => n.id === section)?.name}
        {...(invoke && section === 'resources' ? { 'data-sampler-pulls': sampler.pulls, 'data-sampler-ok': sampler.ok, 'data-sampler-failed': sampler.failed, 'data-sampler-overlapped': sampler.overlapped, 'data-sampler-skipped-hidden': sampler.skippedHidden, 'data-sampler-last': sampler.lastResult ?? 'none' } : {})}>
        {section === 'resources' && (
          <ResourcesPane
            available={!!invoke}
            visible={visible}
            self={self}
            system={system}
            history={history}
            range={range}
            onRange={setRange}
            heapMB={local.heapMB}
            sampleError={sampleError}
            hint={samplerHint(sampler, !!self, visible)}
          />
        )}

        {section === 'startup' && (
          <>
            <Head title="Startup" sub="This session, from process start" />
            {timeline && timeline.phases.length > 0 ? (
              <Waterfall timeline={timeline} />
            ) : (
              <p style={S.empty}>{invoke ? 'Native startup phases were not reported.' : 'Native startup phases are available in the installed app.'}</p>
            )}
            <h3 style={S.h3}>Interface</h3>
            <dl style={S.kv}>
              <KV k="Document ready" v={fmtMs(local.startup.domContentLoadedMs)} />
              <KV k="Page loaded" v={fmtMs(local.startup.loadMs)} />
              <KV k="Desktop shown" v={fmtMs(local.startup.shellReadyMs)} note={local.startup.shellReadyMs === null ? 'Not measured: the window was hidden at start' : undefined} />
            </dl>
            <p style={S.caption}>Interface times are measured from the start of the interface page.</p>
          </>
        )}

        {section === 'responsiveness' && (
          <>
            <Head
              title="Responsiveness"
              sub={measuring ? 'Measuring for 2 s…' : framesSkipped ? 'Window was hidden; not measured' : frames ? `${frames.frames} frames over 2 s` : ''}
              action={<button type="button" style={S.btn} disabled={measuring} onClick={() => void runFrames()}>{measuring ? 'Measuring…' : 'Measure again'}</button>}
            />
            <dl style={S.statGrid}>
              <Stat k="Frame rate" v={frames ? `${frames.fps} fps` : '—'} />
              <Stat k="Frame time, median" v={frames ? `${frames.p50} ms` : '—'} />
              <Stat k="Frame time, 95th pct" v={frames ? `${frames.p95} ms` : '—'} warn={!!frames && frames.p95 > 33} />
              <Stat k="Slow frames (>25 ms)" v={frames ? String(frames.slowFrames) : '—'} />
            </dl>
            <h3 style={S.h3}>Main thread</h3>
            <dl style={S.kv}>
              <KV k="Long tasks this session" v={String(local.longTasks.count)} />
              <KV k="Time blocked" v={local.longTasks.count ? fmtMs(local.longTasks.totalMs) : '—'} />
              <KV k="Longest task" v={local.longTasks.count ? fmtMs(local.longTasks.maxMs) : '—'} />
            </dl>
            <p style={S.caption}>A long task blocks the interface for more than 50 ms. Frame timing runs only when measured, never in the background.</p>
          </>
        )}

        {section === 'stability' && (
          <>
            <Head title="Stability" sub="Crash log and interface errors on this computer" action={<button type="button" style={S.btn} onClick={() => void loadOnce()}>Reload</button>} />
            <dl style={S.statGrid}>
              <Stat k="Crashes this session" v={crashes ? String(crashes.crashesThisSession) : invoke ? '—' : 'n/a'} warn={!!crashes && crashes.crashesThisSession > 0} />
              <Stat k="Crashes in this version" v={crashes ? String(crashes.crashesSinceUpdate) : invoke ? '—' : 'n/a'} />
              <Stat k="Crashes recorded" v={crashes ? String(crashes.totalCrashes) : invoke ? '—' : 'n/a'} />
              <Stat k="Interface errors" v={String(local.errors.count)} warn={local.errors.count > 0} />
              <Stat k="Build" v={`${getBuildInfo().buildId} · ${getBuildInfo().channel} · ${getBuildInfo().commit}`} />
            </dl>
            <h3 style={S.h3}>Recent</h3>
            {recentCrashes.length === 0 && local.errors.recent.length === 0 ? (
              <p style={S.empty}>Nothing recorded.</p>
            ) : (
              <table style={S.table}>
                <thead><tr><th style={S.th}>Kind</th><th style={S.th}>Message</th><th style={S.thNum}>When</th></tr></thead>
                <tbody>
                  {[
                    ...recentCrashes.map((c) => ({ key: `c-${c.id}`, kind: 'Crash', msg: c.message || c.type, at: c.timestamp })),
                    ...local.errors.recent.map((e, i) => ({ key: `e-${e.at}-${i}`, kind: e.source === 'rejection' ? 'Promise' : 'Error', msg: e.message, at: e.at })),
                  ].sort((a, b) => b.at - a.at).slice(0, 15).map((r) => (
                    <tr key={r.key}>
                      <td style={{ ...S.td, width: 72, color: r.kind === 'Crash' ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>{r.kind}</td>
                      <td style={{ ...S.td, ...S.mono }} title={r.msg}>{r.msg}</td>
                      <td style={{ ...S.tdNum, width: 90, color: 'var(--color-text-tertiary)' }}>{fmtAgo(r.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {section === 'launches' && (
          <>
            <Head
              title="App launch times"
              sub={allLaunches.length ? `Median ${fmtMs(percentile(allLaunches, 50))} · 95th ${fmtMs(percentile(allLaunches, 95))} · request to first frame` : 'Request to first frame'}
              action={launchRows.length > 0 ? <button type="button" style={S.btn} onClick={clearLaunches}>Clear history</button> : undefined}
            />
            {launchRows.length === 0 ? (
              <p style={S.empty}>Open an app to record its launch time.</p>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr><th style={S.th}>App</th><th style={S.thNum}>Launches</th><th style={S.thNum}>Median</th><th style={S.thNum}>95th</th><th style={S.thNum}>Last</th></tr>
                </thead>
                <tbody>
                  {launchRows.map((r) => (
                    <tr key={r.id}>
                      <td style={S.td}>{appName(r.id)}</td>
                      <td style={S.tdNum}>{r.count}</td>
                      <td style={{ ...S.tdNum, color: r.median > 500 ? 'var(--color-warning)' : undefined }}>{fmtMs(r.median)}</td>
                      <td style={S.tdNum}>{fmtMs(r.p95)}</td>
                      <td style={S.tdNum}>{fmtMs(r.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {section === 'tasks' && (
          <>
            <Head title="Background tasks" sub="Assistant and automation runs" />
            {taskRows.length === 0 ? (
              <p style={S.empty}>No background tasks yet.</p>
            ) : (
              <table style={S.table}>
                <thead><tr><th style={S.th}>Source</th><th style={S.th}>Status</th><th style={S.thNum}>Started</th><th style={S.thNum}>Duration</th></tr></thead>
                <tbody>
                  {taskRows.map((t) => (
                    <tr key={t.id}>
                      <td style={S.td}>{APP_DEFINITIONS[t.source]?.name ?? t.source}</td>
                      <td style={{ ...S.td, color: t.status === 'failed' || t.status === 'stalled' ? 'var(--color-warning)' : t.status === 'running' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>{t.status[0].toUpperCase() + t.status.slice(1)}</td>
                      <td style={{ ...S.tdNum, color: 'var(--color-text-tertiary)' }}>{fmtClock(t.at)}</td>
                      <td style={S.tdNum}>{fmtMs(t.ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  );
};

// -- DEX resource use ----------------------------------------------------------

interface ResourcesPaneProps {
  available: boolean;
  visible: boolean;
  self: SelfSample | null;
  system: SystemSample | null;
  history: ResourceSample[];
  range: RangeId;
  onRange: (r: RangeId) => void;
  heapMB: number | null;
  sampleError: boolean;
  /** Sampler status, shown until the first reading arrives. */
  hint: string;
}

const ResourcesPane: React.FC<ResourcesPaneProps> = ({ available, visible, self, system, history, range, onRange, heapMB, sampleError, hint }) => {
  const r = RANGES.find((x) => x.id === range) ?? RANGES[1];
  const inRange = useMemo(() => samplesInRange(history, r.ms), [history, r.ms]);
  const mem = useMemo(() => inRange.map((s) => s.dexMemMB), [inRange]);
  const cpu = useMemo(() => inRange.map((s) => s.dexCpu), [inRange]);
  const memSum = summarise(mem);
  const cpuSum = summarise(cpu);
  const cap = capacityFor(r.ms);
  const memMax = niceCeil((memSum?.max ?? 0) * 1.15, 128);
  const cpuMax = Math.min(100, Math.max(10, niceCeil((cpuSum?.max ?? 0) * 1.2, 5)));
  const mbLabel = useCallback((v: number) => `${Math.round(v)} MB`, []);
  const pctLabel = useCallback((v: number) => `${Math.round(v)}%`, []);
  const last = history.length ? history[history.length - 1].at : null;

  if (!available) {
    return (
      <>
        <Head title="DEX resource use" sub="This window" />
        <dl style={S.kv}><KV k="Interface script memory" v={heapMB !== null ? `${heapMB} MB` : '—'} /></dl>
        <p style={S.empty}>Process figures come from the DEX desktop app; they are not available here.</p>
      </>
    );
  }

  return (
    <>
      <Head
        title="DEX resource use"
        sub={!visible ? 'Paused while hidden' : last ? `Every ${SAMPLE_MS / 1000} s · last sample ${fmtClock(last)}` : hint}
        action={
          <SegmentedControl aria-label="Time range" size="sm" options={RANGES.map((x) => ({ value: x.id, label: x.label }))} value={range} onChange={(v) => onRange(v)} />
        }
      />
      {sampleError && <p role="alert" style={{ ...S.empty, color: 'var(--color-warning)' }}>The native sampler did not answer. Figures resume on the next successful sample.</p>}

      <div style={S.chartHead}><span style={S.chartTitle}>Memory, all DEX processes</span><span style={S.subtle}>{memSum ? `min ${fmtMB(memSum.min)} · avg ${fmtMB(memSum.avg)} · max ${fmtMB(memSum.max)}` : ''}</span></div>
      <div style={S.chartBox}>
        <LineChart series={mem} max={memMax} height={140} capacity={cap} ariaLabel={`DEX memory over the last ${r.label}`} axisLabel={mbLabel} />
        <div style={S.axisRow}><span>{r.label} ago</span><span>now</span></div>
      </div>

      <div style={S.chartHead}><span style={S.chartTitle}>CPU, share of this PC</span><span style={S.subtle}>{cpuSum ? `avg ${cpuSum.avg.toFixed(1)}% · max ${cpuSum.max.toFixed(1)}%` : ''}</span></div>
      <div style={S.chartBox}>
        <LineChart series={cpu} max={cpuMax} height={100} capacity={cap} ariaLabel={`DEX CPU over the last ${r.label}`} axisLabel={pctLabel} />
        <div style={S.axisRow}><span>{r.label} ago</span><span>now</span></div>
      </div>

      <dl style={S.statGrid}>
        <Stat k="DEX memory" v={self ? fmtMB(self.memoryMB) : '—'} />
        <Stat k="Host process" v={self ? fmtMB(self.hostMemoryMB) : '—'} />
        <Stat k="DEX CPU" v={self ? `${self.cpuPercent.toFixed(1)}%` : '—'} />
        <Stat k="DEX processes" v={self ? String(self.processCount) : '—'} />
        <Stat k="Interface heap" v={heapMB !== null ? `${heapMB} MB` : '—'} />
        <Stat k="System CPU" v={system ? `${system.cpuPercent.toFixed(0)}%` : '—'} />
        <Stat k="System memory" v={system ? `${(system.memoryUsedMB / 1024).toFixed(1)} of ${(system.memoryTotalMB / 1024).toFixed(1)} GB` : '—'} />
      </dl>
      <p style={S.caption}>Sampled only while this view is open. History is kept for 15 minutes in memory and is never saved.</p>
    </>
  );
};

// -- startup waterfall -----------------------------------------------------------

const Waterfall: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const bars = phaseWaterfall(timeline.phases, timeline.totalMs);
  return (
    <div role="table" aria-label="Startup phases" style={S.wf}>
      {bars.map((b) => (
        <div role="row" key={b.name} style={S.wfRow}>
          <span role="cell" style={S.wfName} title={b.name}>{b.name}</span>
          <span role="cell" style={S.wfTrack} aria-label={`${b.name}: ${fmtMs(b.durationMs)}, done at ${fmtMs(b.atMs)}`}>
            <span style={{ ...S.wfBar, left: `${b.startPct}%`, width: `${b.widthPct}%` }} />
          </span>
          <span role="cell" style={S.wfNum}>{fmtMs(b.durationMs)}</span>
          <span role="cell" style={{ ...S.wfNum, color: 'var(--color-text-tertiary)' }}>{fmtMs(b.atMs)}</span>
        </div>
      ))}
      <div style={S.wfFoot}><span>Phase</span><span style={{ flex: 1 }} /><span>Took · done at · total {fmtMs(timeline.totalMs)}</span></div>
    </div>
  );
};

// -- small parts -------------------------------------------------------------------

const Head: React.FC<{ title: string; sub?: string; action?: React.ReactNode }> = ({ title, sub, action }) => (
  <div style={S.head}>
    <h2 style={S.title}>{title}</h2>
    {sub && <span style={S.subtle}>{sub}</span>}
    <span style={{ flex: 1 }} />
    {action}
  </div>
);

const KV: React.FC<{ k: string; v: string; note?: string }> = ({ k, v, note }) => (
  <div style={S.kvRow}>
    <dt style={S.k}>{k}</dt>
    <dd style={S.v}>{v}{note && <span style={S.subtle}> · {note}</span>}</dd>
  </div>
);

const Stat: React.FC<{ k: string; v: string; warn?: boolean }> = ({ k, v, warn }) => (
  <div style={S.stat}>
    <dt style={S.statK}>{k}</dt>
    <dd style={{ ...S.statV, ...(warn ? { color: 'var(--color-warning)' } : null) }}>{v}</dd>
  </div>
);

const S: Record<string, React.CSSProperties> = {
  root: { flex: 1, minHeight: 0, display: 'flex' },
  nav: { width: 210, flexShrink: 0, overflow: 'auto', borderRight: '1px solid var(--color-border-subtle)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 },
  navItem: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '7px 10px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', background: 'transparent', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  navItemOn: { background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-subtle)' },
  navName: { fontSize: 12, fontWeight: 600 },
  navValue: { fontSize: 11.5, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' },
  navDetail: { fontSize: 10.5, color: 'var(--color-text-tertiary)' },
  navFoot: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 4px 4px', borderTop: '1px solid var(--color-border-subtle)' },
  navNote: { fontSize: 10.5, color: 'var(--color-text-tertiary)', lineHeight: 1.4 },
  main: { flex: 1, minWidth: 0, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  head: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 28 },
  title: { margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' },
  h3: { margin: '8px 0 0', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'none', letterSpacing: '0.01em' },
  subtle: { fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400 },
  caption: { margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.45 },
  empty: { margin: 0, padding: '6px 0', fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 },
  btn: { height: 26, padding: '0 10px', borderRadius: 9999, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  segment: { display: 'inline-flex', padding: 2, gap: 2, borderRadius: 9999, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' },
  segBtn: { height: 22, padding: '0 10px', borderRadius: 9999, border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  segBtnOn: { background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)' },
  chartHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  chartTitle: { fontSize: 12, fontWeight: 600 },
  chartBox: { border: '1px solid var(--color-border-subtle)', borderRadius: 6, overflow: 'hidden' },
  axisRow: { display: 'flex', justifyContent: 'space-between', padding: '3px 6px', fontSize: 10, color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border-subtle)' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px 20px', margin: '4px 0 0' },
  stat: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  statK: { fontSize: 11, color: 'var(--color-text-tertiary)' },
  statV: { margin: 0, fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  kv: { margin: 0, display: 'flex', flexDirection: 'column', maxWidth: 560 },
  kvRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minHeight: 26, borderBottom: '1px solid color-mix(in srgb, var(--color-border-subtle) 50%, transparent)' },
  k: { fontSize: 12, color: 'var(--color-text-secondary)' },
  v: { margin: 0, fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', padding: '4px 8px 4px 0', borderBottom: '1px solid var(--color-border-subtle)' },
  thNum: { textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', padding: '4px 0 4px 8px', borderBottom: '1px solid var(--color-border-subtle)', width: 84 },
  td: { padding: '5px 8px 5px 0', color: 'var(--color-text-primary)', borderBottom: '1px solid color-mix(in srgb, var(--color-border-subtle) 50%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tdNum: { padding: '5px 0 5px 8px', textAlign: 'right', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid color-mix(in srgb, var(--color-border-subtle) 50%, transparent)', whiteSpace: 'nowrap' },
  mono: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' },
  wf: { display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border-subtle)', borderRadius: 6, overflow: 'hidden' },
  wfRow: { display: 'grid', gridTemplateColumns: 'minmax(110px, 180px) 1fr 64px 64px', gap: 10, alignItems: 'center', height: 26, padding: '0 10px', borderBottom: '1px solid color-mix(in srgb, var(--color-border-subtle) 50%, transparent)', fontSize: 12 },
  wfName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' },
  wfTrack: { position: 'relative', height: 8, borderRadius: 2, background: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)' },
  wfBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2, background: 'var(--color-accent)' },
  wfNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  wfFoot: { display: 'flex', gap: 8, padding: '4px 10px', fontSize: 10, color: 'var(--color-text-tertiary)' },
};

export default NexusDiagnostics;
