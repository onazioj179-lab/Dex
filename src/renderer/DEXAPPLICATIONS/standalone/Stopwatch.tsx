/**
 * DEX Platform - Stopwatch
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional stopwatch with lap tracking — shared timer state survives
 * app switches and reload (elapsed derived from wall-clock anchors).
 */
import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { computeLapStats } from '../../../shared/format/lapStats';
import { useTimerStore, stopwatchElapsed } from '../../store/timerStore';

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

  return (
    <div style={s.container}>
      <div style={s.displayArea}>
        <div style={s.time}>{fmt(elapsed)}</div>
      </div>

      <div style={s.controls}>
        {!running && elapsed === 0 && (
          <button style={{ ...s.btn, ...s.btnStart }} onClick={start}>Start</button>
        )}
        {running && (
          <>
            <button style={{ ...s.btn, ...s.btnLap }} onClick={lap}>Lap</button>
            <button style={{ ...s.btn, ...s.btnStop }} onClick={stop}>Stop</button>
          </>
        )}
        {!running && elapsed > 0 && (
          <>
            <button style={{ ...s.btn, ...s.btnReset }} onClick={reset}>Reset</button>
            <button style={{ ...s.btn, ...s.btnStart }} onClick={start}>Resume</button>
          </>
        )}
      </div>

      {laps.length > 0 && (
        <div style={s.lapsContainer}>
          <div style={s.lapHeader}>
            <span className="dex-label-caps" style={s.lapHeaderText}>Lap</span>
            <span className="dex-label-caps" style={s.lapHeaderText}>Split</span>
            <span className="dex-label-caps" style={s.lapHeaderText}>Time</span>
            <button style={s.exportBtn} onClick={exportLaps} disabled={exporting} title="Copy laps to clipboard" aria-label="Copy laps to clipboard">Copy</button>
          </div>
          <div style={s.lapList}>
            {laps.map((l, i) => {
              const split = splits[i];
              const isBest = laps.length > 2 && split === bestLap;
              const isWorst = laps.length > 2 && split === worstLap;
              return (
                <div key={i} style={{
                  ...s.lapRow,
                  color: isBest ? 'var(--color-success)' : isWorst ? 'var(--color-error)' : 'var(--color-text-primary)',
                }}>
                  <span style={s.lapNum}>Lap {laps.length - i}</span>
                  <span style={s.lapSplit}>{fmt(split)}</span>
                  <span style={s.lapTime}>{fmt(l)}</span>
                </div>
              );
            })}
          </div>
          {stats && stats.count > 1 && (
            <div style={s.statsBar}>
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
  },
  displayArea: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-10) var(--space-5) var(--space-6)', flexShrink: 0,
  },
  time: {
    fontSize: 56, fontWeight: 200, letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
  },
  controls: {
    display: 'flex', justifyContent: 'center', gap: 'var(--space-4)',
    padding: '0 var(--space-5) var(--space-6)', flexShrink: 0,
  },
  btn: {
    width: 80, height: 80, borderRadius: '50%', border: 'none',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  btnStart: {
    background: 'var(--color-success-muted, rgba(52,199,89,0.15))', color: 'var(--color-success)',
    boxShadow: 'inset 0 0 0 2px rgba(52,199,89,0.3)',
  },
  btnStop: {
    background: 'var(--color-error-muted, rgba(255,69,58,0.15))', color: 'var(--color-error)',
    boxShadow: 'inset 0 0 0 2px rgba(255,69,58,0.3)',
  },
  btnLap: {
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    boxShadow: 'inset 0 0 0 2px var(--color-border)',
  },
  btnReset: {
    background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
    boxShadow: 'inset 0 0 0 2px var(--color-border)',
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
    border: '1px solid var(--color-border)', borderRadius: 6,
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
    borderTop: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface)',
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
