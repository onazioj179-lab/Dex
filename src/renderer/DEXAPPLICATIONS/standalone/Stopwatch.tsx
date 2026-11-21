/**
 * DEX Platform - Stopwatch
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional stopwatch with lap tracking — shared timer state survives
 * app switches and reload (elapsed derived from wall-clock anchors).
 */
import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { computeLapStats } from '../../../shared/format/lapStats';
import { saveBlobAs } from '../../services/nativeSave';
import { sendFlow } from '../../services/FlowTransfer';
import { useTimerStore, stopwatchElapsed } from '../../store/timerStore';
import { keyEventForApp } from '../../shell/input/appKeyScope';

const Stopwatch: React.FC = () => {
  const stopwatch = useTimerStore(s => s.stopwatch);
  const start = useTimerStore(s => s.startStopwatch);
  const stop = useTimerStore(s => s.stopStopwatch);
  const reset = useTimerStore(s => s.resetStopwatch);
  const lap = useTimerStore(s => s.lapStopwatch);

  const { running, laps } = stopwatch;

  // Live elapsed for display. The store holds wall-clock anchors; a local ticker
  // only drives re-render while running, so unmounting never loses time.
  const [elapsed, setElapsed] = useState(() => stopwatchElapsed(stopwatch));
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setElapsed(stopwatchElapsed(stopwatch));
    if (!running) return;
    const tick = () => {
      setElapsed(stopwatchElapsed(useTimerStore.getState().stopwatch));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, stopwatch]);

  // Keyboard control (Apple Clock parity): Space toggles start/stop, L laps while
  // running, R resets when stopped. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'stopwatch')) return; // key meant for another app
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space') { e.preventDefault(); running ? stop() : start(); }
      else if (e.key.toLowerCase() === 'l' && running) { e.preventDefault(); lap(); }
      else if (e.key.toLowerCase() === 'r' && !running && elapsed > 0) { e.preventDefault(); reset(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, elapsed, start, stop, lap, reset]);

  const fmt = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  // Per-lap split durations (oldest lap counts from zero, hence the last entry).
  const { bestLap, worstLap, stats, splits } = useMemo(() => {
    const sp = laps.map((l, i) => i === laps.length - 1 ? l : l - (laps[i + 1] ?? 0));
    if (laps.length <= 1) return { bestLap: -1, worstLap: -1, stats: null, splits: sp };
    return { bestLap: Math.min(...sp), worstLap: Math.max(...sp), stats: computeLapStats(sp), splits: sp };
  }, [laps]);

  // Export lap splits + totals to the clipboard as a tidy table.
  const [exporting, setExporting] = useState(false);
  const exportLaps = useCallback(async () => {
    if (laps.length === 0 || exporting) return;
    setExporting(true);
    const lines = ['Lap\tSplit\tTime'];
    for (let i = 0; i < laps.length; i++) {
      lines.push(`${laps.length - i}\t${fmt(splits[i])}\t${fmt(laps[i])}`);
    }
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Copied ${laps.length} laps` } }));
    } catch {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: 'Clipboard unavailable' } }));
    } finally {
      setExporting(false);
    }
  }, [laps, splits, exporting]);

  const [sendingSession, setSendingSession] = useState(false);
  const sendSession = async () => {
    if (running || stopwatchElapsed(stopwatch) <= 0 || sendingSession) return;
    setSendingSession(true);
    const lines = ['Stopwatch session', 'Elapsed: ' + fmt(stopwatchElapsed(stopwatch))];
    for (let index = laps.length - 1; index >= 0; index--) {
      lines.push('Lap ' + (laps.length - index) + ' · ' + fmt(splits[index]) + ' split · ' + fmt(laps[index]) + ' elapsed');
    }
    try {
      await sendFlow('notes', { kind: 'text', content: lines.join('\n'), source: 'stopwatch', label: 'Stopwatch session' });
    } finally {
      setSendingSession(false);
    }
  };

  const [savingCsv, setSavingCsv] = useState(false);
  const saveCsv = async () => {
    if (!laps.length || savingCsv) return;
    setSavingCsv(true);
    try {
      const rows = ['Lap,Split (ms),Elapsed (ms)'];
      for (let index = laps.length - 1; index >= 0; index--) {
        rows.push([laps.length - index, splits[index], laps[index]].join(','));
      }
      await saveBlobAs('dex-stopwatch-laps.csv', new Blob([rows.join('\r\n') + '\r\n'], { type: 'text/csv' }),
        { title: 'Save stopwatch laps', source: 'Stopwatch' });
    } catch {
      // The shared save bridge reports native write failures.
    } finally {
      setSavingCsv(false);
    }
  };

  return (
    <div style={s.container} className="dex-stopwatch">
      <style>{`
        .dex-stopwatch button { transition: transform 0.12s ease, filter 0.12s ease, background 0.12s ease; }
        .dex-stopwatch button:hover { filter: brightness(1.08); }
        .dex-stopwatch button:active { transform: scale(0.94); }
        .dex-stopwatch .sw-lap-row { transition: background 0.1s ease; border-radius: 8px; }
        .dex-stopwatch .sw-lap-row:hover { background: var(--color-bg-hover, rgba(255,255,255,0.04)); }
      `}</style>
      <div style={s.displayArea}>
        <div style={s.time}>{fmt(elapsed)}</div>
      </div>

      {/* Clock-app layout: secondary action left (Lap / Reset), primary right
          (Start / Stop). Both always present so nothing jumps when state changes. */}
      <div style={s.controls}>
        {running || elapsed === 0 ? (
          <button style={{ ...s.btn, ...s.btnLap, opacity: running ? 1 : 0.45 }} onClick={lap} disabled={!running} aria-label="Lap">Lap</button>
        ) : (
          <button style={{ ...s.btn, ...s.btnReset }} onClick={reset} aria-label="Reset">Reset</button>
        )}
        {running ? (
          <button style={{ ...s.btn, ...s.btnStop }} onClick={stop} aria-label="Stop">Stop</button>
        ) : (
          <button style={{ ...s.btn, ...s.btnStart }} onClick={start} aria-label={elapsed > 0 ? 'Resume' : 'Start'}>{elapsed > 0 ? 'Resume' : 'Start'}</button>
        )}
      </div>

      <div style={s.hint}>
        <kbd style={s.kbd}>Space</kbd> {running ? 'stop' : 'start'}
        {running && <> &middot; <kbd style={s.kbd}>L</kbd> lap</>}
        {!running && elapsed > 0 && <> &middot; <kbd style={s.kbd}>R</kbd> reset</>}
      </div>

      {!running && elapsed > 0 && (
        <button style={{ ...s.exportBtn, alignSelf: 'center' }} disabled={sendingSession}
          onClick={() => void sendSession()}>Send session to Notes</button>
      )}

      {laps.length > 0 && (
        <div style={s.lapsContainer}>
          <div style={s.lapHeader}>
            <span className="dex-label-caps" style={s.lapHeaderText}>Lap</span>
            <span className="dex-label-caps" style={s.lapHeaderText}>Split</span>
            <span className="dex-label-caps" style={s.lapHeaderText}>Time</span>
            <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button style={s.exportBtn} onClick={exportLaps} disabled={exporting} title="Copy laps to clipboard" aria-label="Copy laps to clipboard">Copy</button>
              <button style={s.exportBtn} onClick={() => void saveCsv()} disabled={savingCsv} aria-label="Save laps as CSV">CSV</button>
            </span>
          </div>
          <div style={s.lapList}>
            {laps.map((l, i) => {
              const split = splits[i];
              const isBest = laps.length > 2 && split === bestLap;
              const isWorst = laps.length > 2 && split === worstLap;
              return (
                <div key={i} className="sw-lap-row" style={{
                  ...s.lapRow,
                  color: isBest ? 'var(--color-accent)' : isWorst ? 'var(--color-error)' : 'var(--color-text-primary)',
                }}>
                  <span style={s.lapNum}>Lap {laps.length - i}</span>
                  <span style={s.lapSplit}>{fmt(split)}</span>
                  <span style={s.lapTime}>{fmt(l)}</span>
                </div>
              );
            })}
          </div>
          {stats && stats.count > 1 && (
            <div className="dex-liquid-glass" style={s.statsBar}>
              <div style={s.statCell}>
                <span className="dex-label-caps" style={s.statLabel}>Avg</span>
                <span style={s.statVal}>{fmt(stats.average)}</span>
              </div>
              <div style={s.statCell}>
                <span className="dex-label-caps" style={s.statLabel}>Median</span>
                <span style={s.statVal}>{fmt(stats.median)}</span>
              </div>
              <div style={s.statCell}>
                <span className="dex-label-caps" style={s.statLabel}>Spread</span>
                <span style={s.statVal}>&plusmn;{fmt(stats.stdDev)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'hidden',
    width: '100%', maxWidth: 640, margin: '0 auto',
  },
  displayArea: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-10) var(--space-5) var(--space-6)', flexShrink: 0,
  },
  time: {
    fontSize: 'clamp(56px, 11vw, 104px)', fontWeight: 200, letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
  },
  controls: {
    display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)',
    padding: '0 var(--space-6) var(--space-5)', flexShrink: 0,
  },
  btn: {
    width: 80, height: 80, borderRadius: '50%', border: 'none',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  btnStart: {
    background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', color: 'var(--color-accent)',
    boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-accent) 35%, transparent)',
  },
  btnStop: {
    background: 'color-mix(in srgb, var(--color-error) 18%, transparent)', color: 'var(--color-error)',
    boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-error) 35%, transparent)',
  },
  btnLap: {
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    boxShadow: 'inset 0 0 0 2px var(--color-border)',
  },
  btnReset: {
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    boxShadow: 'inset 0 0 0 2px var(--color-border)',
  },
  hint: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '0 var(--space-5) var(--space-5)', flexShrink: 0,
    fontSize: 12, color: 'var(--color-text-tertiary)',
  },
  kbd: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 6,
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
    fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)',
    color: 'var(--color-text-secondary)',
  },
  lapsContainer: {
    flex: 1, display: 'flex', flexDirection: 'column',
    overflow: 'hidden', borderTop: '1px solid var(--color-border-subtle)',
  },
  lapHeader: {
    display: 'flex', alignItems: 'center', padding: '10px var(--space-5)', gap: 'var(--space-2)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  lapHeaderText: {
    flex: 1,
  },
  exportBtn: {
    border: '1px solid var(--color-border)', borderRadius: 10,
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer',
    fontFamily: 'var(--font-family)', flexShrink: 0,
  },
  lapList: { flex: 1, overflow: 'auto', padding: '4px 0' },
  lapRow: {
    display: 'flex', padding: 'var(--space-2) var(--space-5)', gap: 'var(--space-2)', fontSize: 14,
    fontVariantNumeric: 'tabular-nums',
  },
  lapNum: { flex: 1 },
  lapSplit: { flex: 1, textAlign: 'center' },
  lapTime: { flex: 1, textAlign: 'right' },
  statsBar: {
    display: 'flex', flexShrink: 0,
    borderRadius: 0,
  },
  statCell: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 2, padding: 'var(--space-3) var(--space-2)',
  },
  statLabel: { fontSize: 9, color: 'var(--color-text-tertiary)' },
  statVal: {
    fontSize: 14, fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
};

Stopwatch.displayName = 'Stopwatch';
export default memo(Stopwatch);
