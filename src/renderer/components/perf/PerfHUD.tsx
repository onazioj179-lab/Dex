// =============================================================================
// DEX Platform — Wave 8 perf HUD overlay (developer + power-user diagnostics)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Lightweight always-on-top overlay that shows the live PerfBudget snapshot,
 * frame time, JS heap (when exposed), and most recent ONNX inference timings.
 *
 * Toggle via Ctrl+Alt+P or Settings > Diagnostics > Show Perf HUD.
 *
 * Pure renderer-side: reads from `globalBudget` snapshots and a tiny in-process
 * frame-time ring. No IPC traffic; safe to leave on indefinitely.
 */

import React, { useEffect, useRef, useState } from 'react';
import { globalBudget, type BudgetSnapshot } from '../../../shared/perf/budget';

interface FrameStats {
  fpsAvg: number;
  fps1Lo: number;
  frameMs: number;
}

interface InferenceStat {
  model: string;
  ms: number;
  at: number;
}

const FRAME_RING = 120;

function useFrameStats(enabled: boolean): FrameStats {
  const [stats, setStats] = useState<FrameStats>({ fpsAvg: 0, fps1Lo: 0, frameMs: 0 });
  const ringRef = useRef<number[]>([]);
  const lastRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = (t: number) => {
      if (!alive) return;
      if (lastRef.current > 0) {
        const dt = t - lastRef.current;
        const ring = ringRef.current;
        ring.push(dt);
        if (ring.length > FRAME_RING) ring.shift();
      }
      lastRef.current = t;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    const updater = window.setInterval(() => {
      const ring = ringRef.current;
      if (ring.length === 0) return;
      const avg = ring.reduce((a, b) => a + b, 0) / ring.length;
      const sorted = [...ring].sort((a, b) => a - b);
      const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? avg;
      setStats({
        fpsAvg: avg > 0 ? 1000 / avg : 0,
        fps1Lo: p99 > 0 ? 1000 / p99 : 0,
        frameMs: avg,
      });
    }, 500);
    return () => {
      alive = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearInterval(updater);
    };
  }, [enabled]);

  return stats;
}

interface PerfHUDProps {
  /** Master visibility. */
  visible?: boolean;
  /** Position corner. */
  corner?: 'tl' | 'tr' | 'bl' | 'br';
  /** Recent inference timings (caller-supplied; rolling window of ~10). */
  inferenceLog?: InferenceStat[];
}

const cornerStyle: Record<NonNullable<PerfHUDProps['corner']>, React.CSSProperties> = {
  tl: { top: 8, left: 8 },
  tr: { top: 8, right: 8 },
  bl: { bottom: 8, left: 8 },
  br: { bottom: 8, right: 8 },
};

const statusColor: Record<BudgetSnapshot['status'], string> = {
  green: '#34d399',
  yellow: '#fbbf24',
  red: '#f87171',
};

export const PerfHUD: React.FC<PerfHUDProps> = ({
  visible = true,
  corner = 'br',
  inferenceLog = [],
}) => {
  const stats = useFrameStats(visible);
  const [snap, setSnap] = useState<BudgetSnapshot>(() => globalBudget.snapshot());

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setSnap(globalBudget.snapshot()), 500);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const heapMb = heap ? Math.round(heap.usedJSHeapSize / 1_048_576) : null;

  return (
    <div
      role="status"
      aria-label="Performance HUD"
      style={{
        position: 'fixed',
        ...cornerStyle[corner],
        zIndex: 10_000,
        background: 'rgba(15,15,18,0.82)',
        color: '#e5e7eb',
        font: '11px/1.35 ui-monospace, Menlo, Consolas, monospace',
        padding: 'var(--space-2) 10px',
        borderRadius: 6,
        backdropFilter: 'var(--blur-md)',
        minWidth: 180,
        pointerEvents: 'none',
        boxShadow: 'var(--pg-shadow-tooltip)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor[snap.status],
          }}
        />
        <span style={{ fontWeight: 600 }}>DEX Perf · {snap.tier}</span>
      </div>
      <div>FPS {stats.fpsAvg.toFixed(0)} <span style={{ opacity: 0.6 }}>(1% lo {stats.fps1Lo.toFixed(0)})</span></div>
      <div>frame {stats.frameMs.toFixed(2)}ms</div>
      <div>CPU {snap.cpuUsedThreads}/{snap.cpuMaxThreads} thr</div>
      <div>RAM {snap.ramUsedMb}/{snap.ramMaxMb}MB{heapMb !== null ? ` · heap ${heapMb}` : ''}</div>
      {snap.gpuMaxPct > 0 && (
        <div>GPU {snap.gpuUsedPct.toFixed(0)}/{snap.gpuMaxPct}%</div>
      )}
      {inferenceLog.length > 0 && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {inferenceLog.slice(-3).map((s, i) => (
            <div key={`${s.at}-${i}`} style={{ opacity: 0.85 }}>
              {s.model} {s.ms.toFixed(1)}ms
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PerfHUD;
