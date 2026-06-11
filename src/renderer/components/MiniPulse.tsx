// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Mini Pulse
 * -----------------------------------------------------------------------------
 * Always-on-top 240x60 pill that shows live CPU / RAM / FPS sparklines and
 * the current stage. Double-click expands to the full Pulse panel (when wired).
 *
 * Designed to be cheap: one tick per second from PerformanceMonitor + a small
 * ring buffer per metric. No animations, tabular-nums, Premium Glass tokens.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSystemMetrics } from '../services/PerformanceMonitor';
import { useStageStore } from '../store/stageStore';
import { Z_MINI_PULSE } from '../../shared/zIndex';

const RING_LEN = 60;
const PILL_W = 240;
const PILL_H = 60;
const SPARK_W = 56;
const SPARK_H = 18;

interface RingState {
  cpu: number[];
  mem: number[];
  fps: number[];
}

const initialRing = (): RingState => ({ cpu: [], mem: [], fps: [] });

function pushRing(ring: number[], v: number, len = RING_LEN): number[] {
  const next = ring.length < len ? [...ring, v] : [...ring.slice(1), v];
  return next;
}

function sparkPath(samples: number[], width: number, height: number, max?: number): string {
  if (samples.length < 2) return '';
  const m = max ?? Math.max(...samples, 1);
  const dx = width / (samples.length - 1);
  let d = '';
  samples.forEach((v, i) => {
    const x = i * dx;
    const y = height - (v / m) * height;
    d += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return d;
}

interface MiniPulseProps {
  /** Open the full Pulse panel (Diagnostics / system monitor). */
  onExpand?: () => void;
  /** Hide pill (e.g. when full Pulse is open). */
  hidden?: boolean;
}

export const MiniPulse: React.FC<MiniPulseProps> = ({ onExpand, hidden }) => {
  const metrics = useSystemMetrics();
  const stage = useStageStore((s) => s.getActiveStage());
  const [ring, setRing] = useState<RingState>(initialRing);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem('dex-mini-pulse-pos');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { x: window.innerWidth - PILL_W - 16, y: 16 };
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // Sample 1/sec
  useEffect(() => {
    if (!metrics) return;
    setRing((prev) => ({
      cpu: pushRing(prev.cpu, Math.max(0, Math.min(100, metrics.cpuPercent ?? 0))),
      mem: pushRing(prev.mem, Math.max(0, Math.min(100, metrics.memoryPercent ?? 0))),
      fps: pushRing(prev.fps, Math.max(0, metrics.fps ?? 0)),
    }));
  }, [metrics?.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist position
  useEffect(() => {
    try { localStorage.setItem('dex-mini-pulse-pos', JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos]);

  const cpuPath = useMemo(() => sparkPath(ring.cpu, SPARK_W, SPARK_H, 100), [ring.cpu]);
  const memPath = useMemo(() => sparkPath(ring.mem, SPARK_W, SPARK_H, 100), [ring.mem]);
  const fpsPath = useMemo(() => sparkPath(ring.fps, SPARK_W, SPARK_H, 75),  [ring.fps]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - PILL_W, e.clientX - dragRef.current.dx));
    const y = Math.max(0, Math.min(window.innerHeight - PILL_H, e.clientY - dragRef.current.dy));
    setPos({ x, y });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  if (hidden) return null;

  const cpuVal = metrics?.cpuPercent ?? 0;
  const memVal = metrics?.memoryPercent ?? 0;
  const fpsVal = metrics?.fps ?? 0;

  const accent = stage?.accent || 'var(--color-accent, #60a5fa)';

  return (
    <div
      role="status"
      aria-label="System monitor mini pulse"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onExpand}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: PILL_W,
        height: PILL_H,
        zIndex: Z_MINI_PULSE,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 12px',
        borderRadius: 10,
        background: 'var(--pg-toolbar, rgba(28,28,32,0.78))',
        border: '1px solid var(--pg-border, rgba(255,255,255,0.08))',
        boxShadow: 'var(--pg-shadow-overlay, 0 12px 32px rgba(0,0,0,0.45))',
        backdropFilter: 'var(--blur-lg) saturate(180%)',
        WebkitBackdropFilter: 'var(--blur-lg) saturate(180%)',
        cursor: dragRef.current ? 'grabbing' : 'grab',
        userSelect: 'none',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 11,
        color: 'var(--color-text-secondary, #d4d4d8)',
      }}
    >
      <PulseColumn label="CPU" value={cpuVal} unit="%" path={cpuPath} accent={accent} />
      <PulseColumn label="MEM" value={memVal} unit="%" path={memPath} accent={accent} />
      <PulseColumn label="FPS" value={fpsVal} unit=""  path={fpsPath} accent={accent} />
    </div>
  );
};

interface ColProps { label: string; value: number; unit: string; path: string; accent: string }
const PulseColumn: React.FC<ColProps> = ({ label, value, unit, path, accent }) => (
  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 60 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 9, letterSpacing: 0.6, color: 'var(--color-text-tertiary, #9aa0a6)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-primary, #f5f5f7)' }}>
        {value.toFixed(value >= 100 ? 0 : 1)}<span style={{ fontSize: 9, opacity: 0.7 }}>{unit}</span>
      </span>
    </div>
    <svg width={SPARK_W} height={SPARK_H} aria-hidden="true" style={{ display: 'block' }}>
      {path && <path d={path} fill="none" stroke={accent} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  </div>
);

export default MiniPulse;
