/**
 * DEX Platform - Stopwatch
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Professional stopwatch with lap tracking
 */
import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';

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
  const { bestLap, worstLap } = useMemo(() => {
    if (laps.length <= 1) return { bestLap: -1, worstLap: -1 };
    const deltas = laps.map((l, i) => i === 0 ? l - (laps[1] ?? 0) : l - (laps[i + 1] ?? 0));
    return { bestLap: Math.min(...deltas), worstLap: Math.max(...deltas) };
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
            <span style={s.lapHeaderText}>Lap</span>
            <span style={s.lapHeaderText}>Split</span>
            <span style={s.lapHeaderText}>Time</span>
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
    padding: '40px 20px 24px', flexShrink: 0,
  },
  time: {
    fontSize: 56, fontWeight: 200, letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
  },
  controls: {
    display: 'flex', justifyContent: 'center', gap: 16,
    padding: '0 20px 24px', flexShrink: 0,
  },
  btn: {
    width: 80, height: 80, borderRadius: '50%', border: 'none',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  btnStart: {
    background: 'rgba(52,199,89,0.15)', color: 'var(--color-success)',
    boxShadow: 'inset 0 0 0 2px rgba(52,199,89,0.3)',
  },
  btnStop: {
    background: 'rgba(255,69,58,0.15)', color: 'var(--color-error)',
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
    display: 'flex', padding: '10px 20px', gap: 8,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  lapHeaderText: {
    flex: 1, fontSize: 12, fontWeight: 600,
    color: 'var(--color-text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  lapList: { flex: 1, overflow: 'auto', padding: '4px 0' },
  lapRow: {
    display: 'flex', padding: '8px 20px', gap: 8, fontSize: 14,
    fontVariantNumeric: 'tabular-nums',
  },
  lapNum: { flex: 1 },
  lapSplit: { flex: 1, textAlign: 'center' },
  lapTime: { flex: 1, textAlign: 'right' },
};

Stopwatch.displayName = 'Stopwatch';
export default memo(Stopwatch);
