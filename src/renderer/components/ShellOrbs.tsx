// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// ShellOrbs -- the three floating system orbs (DEX Master Overhaul, Part 2.4).
// A draggable vertical cluster of glass circles on the right edge. Each orb is a
// real, keyboard-activatable system control:
//   1. Command Palette   (Ctrl/Cmd+K)
//   2. System Health      (diagnostics overlay, Ctrl+Shift+D)
//   3. Live Activity      (opens Rewind -- the activity/session history app)
//
// Positioned via left/top (NOT transform) -- DEX has global `transform: none
// !important` rules on hover/active that would otherwise wipe a transform-based
// position and make the cluster snap to the corner. Position persists.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';

const KEY = 'dex-shell-orbs-v1';
const SIZE = 48;
const GAP = 16;
const EDGE = 16;
const MOVE_THRESHOLD = 6;

type OrbAction = 'palette' | 'health' | 'activity';

function clampCluster(x: number, y: number, vw: number, vh: number) {
  const clusterH = SIZE * 3 + GAP * 2;
  const maxX = Math.max(EDGE, vw - SIZE - EDGE);
  const maxY = Math.max(EDGE, vh - clusterH - EDGE);
  return {
    x: Math.min(Math.max(x, EDGE), maxX),
    y: Math.min(Math.max(y, EDGE + 40), Math.max(EDGE + 40, maxY)),
  };
}

function loadPos(): { x: number; y: number } {
  try { const r = localStorage.getItem(KEY); if (r) { const v = JSON.parse(r); if (typeof v?.x === 'number' && typeof v?.y === 'number') return v; } } catch { /* ignore */ }
  return { x: -1, y: -1 };
}

export const ShellOrbs: React.FC = () => {
  const launchApp = useRunningApps(s => s.launchApp);

  const resolve = useCallback((): { x: number; y: number } => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const stored = loadPos();
    const clusterH = SIZE * 3 + GAP * 2;
    if (stored.x < 0) return { x: vw - SIZE - EDGE, y: Math.max(EDGE + 40, Math.round((vh - clusterH) / 2)) };
    return clampCluster(stored.x, stored.y, vw, vh);
  }, []);

  const [pos, setPos] = useState(resolve);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<OrbAction | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean; action: OrbAction | null } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onResize = () => setPos(p => clampCluster(p.x, p.y, window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const fire = useCallback((a: OrbAction) => {
    try {
      if (a === 'palette') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, metaKey: true, bubbles: true }));
      else if (a === 'health') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true, bubbles: true }));
      else if (a === 'activity') { const def = APP_DEFINITIONS['rewind']; if (def) launchApp({ id: 'rewind', name: def.name, icon: def.icon, color: def.color }); }
    } catch (e) { console.warn('[DEX orbs] action failed', e); }
  }, [launchApp]);

  const beginPress = useCallback((e: React.PointerEvent<HTMLButtonElement>, action: OrbAction) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false, action };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, [pos.x, pos.y]);

  const onMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
    if (!d.moved) { d.moved = true; setDragging(true); setHover(null); }
    pendRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const p = pendRef.current, dd = dragRef.current;
        if (!p || !dd) return;
        setPos(clampCluster(dd.ox + (p.x - dd.sx), dd.oy + (p.y - dd.sy), window.innerWidth, window.innerHeight));
      });
    }
  }, []);

  const onUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* released */ }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (!d) return;
    if (d.moved) {
      setDragging(false);
      const p = pendRef.current;
      let fx = pos.x, fy = pos.y;
      if (p) { const c = clampCluster(d.ox + (p.x - d.sx), d.oy + (p.y - d.sy), window.innerWidth, window.innerHeight); fx = c.x; fy = c.y; setPos(c); }
      pendRef.current = null;
      try { localStorage.setItem(KEY, JSON.stringify({ x: fx, y: fy })); } catch { /* quota */ }
    } else if (d.action) {
      fire(d.action);
    }
  }, [pos.x, pos.y, fire]);

  const orb = (action: OrbAction, label: string, top: number, glyph: React.ReactNode) => {
    const active = hover === action;
    return (
      <button
        key={action}
        type="button"
        aria-label={label}
        title={label}
        onPointerDown={e => beginPress(e, action)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerEnter={() => { if (!dragging) setHover(action); }}
        onPointerLeave={() => setHover(h => (h === action ? null : h))}
        onFocus={() => setHover(action)}
        onBlur={() => setHover(h => (h === action ? null : h))}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(action); } }}
        style={{
          position: 'fixed', left: pos.x, top,
          width: SIZE, height: SIZE, borderRadius: '50%',
          zIndex: 'var(--z-dock)' as unknown as number,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          background: 'var(--glass-bg, rgba(12,12,12,0.85))',
          backdropFilter: 'var(--glass-blur, blur(16px))',
          WebkitBackdropFilter: 'var(--glass-blur, blur(16px))',
          border: `1px solid ${dragging ? 'var(--border-active, rgba(255,255,255,0.20))' : (active ? 'var(--border-visible, rgba(255,255,255,0.12))' : 'var(--glass-border, rgba(255,255,255,0.07))')}`,
          color: active ? 'var(--text-primary, #fff)' : 'var(--color-text-secondary, #aaa)',
          boxShadow: dragging ? '0 12px 30px rgba(0,0,0,0.5)' : '0 6px 18px rgba(0,0,0,0.4)',
          cursor: dragging ? 'grabbing' : 'pointer',
          transform: dragging && active ? 'scale(1.05)' : 'scale(1)',
          outline: 'none', touchAction: 'none',
          transition: dragging ? 'none' : 'border-color 0.12s ease, color 0.12s ease, box-shadow 0.16s ease',
        }}
      >
        {glyph}
      </button>
    );
  };

  return (
    <>
      {orb('palette', 'Command Palette', pos.y, (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z" />
        </svg>
      ))}
      {orb('health', 'System Health', pos.y + SIZE + GAP, (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12h4l2 6 4-14 2 8h6" />
        </svg>
      ))}
      {orb('activity', 'Live Activity', pos.y + (SIZE + GAP) * 2, (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="2" /><path d="M4 12a8 8 0 0 1 8-8" /><path d="M20 12a8 8 0 0 1-8 8" />
        </svg>
      ))}
    </>
  );
};

export default ShellOrbs;
