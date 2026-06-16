// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// FloatingLauncher -- a single draggable orb the user can place ANYWHERE in DEX,
// accessible on every screen (it lives at the shell level). Replaces the fixed,
// content-width dock with something that never shifts as apps open/close.
//
//   - Drag the orb to move it (position persists across restarts).
//   - Click (no drag) opens the launcher: app grid + Spotlight search.
//   - Clear drag-vs-click separation via a small movement threshold, so a click
//     never accidentally drags and a drag never accidentally launches.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFloatingLauncher } from '../store/floatingLauncherStore';

const SIZE = 52;
const EDGE_PAD = 18;
const MOVE_THRESHOLD = 4; // px before a press becomes a drag

export interface FloatingLauncherProps {
  /** Opens the launcher surface (app grid + search). Called on a clean click. */
  onOpen: () => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const FloatingLauncher: React.FC<FloatingLauncherProps> = ({ onOpen }) => {
  const { x, y, enabled, setPosition } = useFloatingLauncher();

  // Resolve the live on-screen position: stored value, or a default bottom-right
  // corner when unset (x < 0). Kept in local state so dragging is smooth (the
  // store is written once, on release).
  const resolve = useCallback((): { x: number; y: number } => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    if (x < 0 || y < 0) return { x: vw - SIZE - EDGE_PAD, y: vh - SIZE - EDGE_PAD };
    return { x: clamp(x, 0, vw - SIZE), y: clamp(y, 0, vh - SIZE) };
  }, [x, y]);

  const [pos, setPos] = useState(resolve);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  // Re-resolve when the stored position changes or the viewport resizes.
  useEffect(() => { setPos(resolve()); }, [resolve]);
  useEffect(() => {
    const onResize = () => setPos(resolve());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resolve]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    const vw = window.innerWidth, vh = window.innerHeight;
    setPos({ x: clamp(d.origX + dx, 0, vw - SIZE), y: clamp(d.origY + dy, 0, vh - SIZE) });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* released */ }
    if (!d) return;
    if (d.moved) {
      setDragging(false);
      setPosition(pos.x, pos.y); // commit the new location (persisted)
    } else {
      onOpen(); // a clean click -> open the launcher
    }
  }, [pos.x, pos.y, setPosition, onOpen]);

  if (!enabled) return null;

  return (
    <button
      type="button"
      aria-label="Open launcher (drag to move)"
      title="Launcher — click to open, drag to move"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: SIZE,
        height: SIZE,
        zIndex: 'var(--z-dock)' as unknown as number,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
        background: 'var(--color-bg-glass, rgba(22,22,24,0.78))',
        backdropFilter: 'var(--blur-lg) saturate(160%)',
        WebkitBackdropFilter: 'var(--blur-lg) saturate(160%)',
        boxShadow: dragging
          ? '0 14px 40px rgba(0,0,0,0.5), 0 0 0 1px var(--color-border-strong, rgba(255,255,255,0.22))'
          : 'var(--pg-shadow-popover, 0 8px 24px rgba(0,0,0,0.4))',
        cursor: dragging ? 'grabbing' : 'grab',
        padding: 0,
        outline: 'none',
        touchAction: 'none',
        // No position transition (it tracks the pointer 1:1 while dragging); only
        // a subtle press/hover scale so it feels alive without ever drifting.
        transform: dragging ? 'scale(1.06)' : hovered ? 'scale(1.04)' : 'scale(1)',
        transition: 'transform 0.14s cubic-bezier(0.2,0.9,0.3,1), box-shadow 0.16s ease',
      }}
    >
      {/* DEX launcher glyph -- four rounded squares (consistent with the shell). */}
      <svg width="22" height="22" viewBox="0 0 18 18" fill="none" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <rect x="1" y="1" width="7" height="7" rx="2" fill={hovered || dragging ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.2s ease' }} />
        <rect x="10" y="1" width="7" height="7" rx="2" fill={hovered || dragging ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.2s ease' }} />
        <rect x="1" y="10" width="7" height="7" rx="2" fill={hovered || dragging ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.2s ease' }} />
        <rect x="10" y="10" width="7" height="7" rx="2" fill={hovered || dragging ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.2s ease' }} />
      </svg>
    </button>
  );
};

export default FloatingLauncher;
