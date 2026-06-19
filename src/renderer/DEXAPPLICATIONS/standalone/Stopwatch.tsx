/**
 * DEX Platform - Stopwatch
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional stopwatch with lap tracking
 */
import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { computeLapStats } from '../../../shared/format/lapStats';

const Stopwatch: React.FC = () => {
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const offsetRef = useRef(0);

  const tick = useCallback(() => {
    setElapsed(performance.now() - startRef.current + offsetRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    setRunning(true);
  }, [tick]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    offsetRef.current += performance.now() - startRef.current;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    offsetRef.current = 0;
    setElapsed(0);
    setLaps([]);
    setRunning(false);
  }, []);

  const lap = useCallback(() => {
    setLaps(prev => [elapsed, ...prev]);
  }, [elapsed]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const fmt = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  // Lap deltas depend only on `laps`, but the component re-renders ~60x/sec
  // via the RAF `elapsed` tick while running — memoize so the two passes over
  // `laps` don't run every frame.
  const { bestLap, worstLap, stats } = useMemo(() => {
    // Per-lap split durations (oldest lap counts from zero, hence the last entry).
    const splits = laps.map((l, i) => i === laps.length - 1 ? l : l - (laps[i + 1] ?? 0));
    if (laps.length <= 1) return { bestLap: -1, worstLap: -1, stats: null };
    return { bestLap: Math.min(...splits), worstLap: Math.max(...splits), stats: computeLapStats(splits) };
  }, [laps]);

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
          </div>
          <div style={s.lapList}>
            {laps.map((l, i) => {
              const split = i === laps.length - 1 ? l : l - (laps[i + 1] ?? 0);
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
    display: 'flex', padding: '10px var(--space-5)', gap: 'var(--space-2)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  lapHeaderText: {
    flex: 1,
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
