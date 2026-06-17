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
import { useUkiStore } from '../store/ukiStore';

// One shared size for all three members of the cluster (Launcher / UKI / Search)
// so they read as a single, consistent group rather than a big orb with two
// smaller satellites.
const SIZE = 46;
const GAP = 7;
const EDGE_PAD = 18;
const MOVE_THRESHOLD = 4; // px before a press becomes a drag

export interface FloatingLauncherProps {
  /** Opens the launcher surface (app grid + search). Called on a clean click. */
  onOpen: () => void;
  /** Opens the universal Search overlay. Renders a dedicated Search satellite when set. */
  onSearch?: () => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const FloatingLauncher: React.FC<FloatingLauncherProps> = ({ onOpen, onSearch }) => {
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
  const [ukiHover, setUkiHover] = useState(false);
  const [searchHover, setSearchHover] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean; action: () => void } | null>(null);

  // Re-resolve when the stored position changes or the viewport resizes.
  useEffect(() => { setPos(resolve()); }, [resolve]);
  useEffect(() => {
    const onResize = () => setPos(resolve());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resolve]);

  // Drag is shared across all three members: pressing any of them can drag the
  // whole cluster, and a clean press (no movement past the threshold) fires that
  // member's own action. This is what makes them behave as one movable group.
  const beginPress = useCallback((e: React.PointerEvent<HTMLButtonElement>, action: () => void) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false, action };
    // Capture so a fast drag keeps tracking even if the pointer leaves the button.
    // Guard it: a failed capture must never prevent the drag from starting.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* unsupported / synthetic */ }
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
      // A clean click -> run the pressed member's action. Guard it so a throwing
      // handler (e.g. an overlay that fails to open) can never crash the dock.
      try { d.action(); } catch (err) { console.warn('[DEX launcher] action failed', err); }
    }
  }, [pos.x, pos.y, setPosition]);

  if (!enabled) return null;

  // The launcher (app menu) is the anchor; UKI and Search are equal-size members
  // stacked next to it. The whole cluster rides at `pos` and moves as one unit
  // when any member is dragged. Stacks upward when there's room above the anchor,
  // otherwise downward, so it never runs off the top/bottom edge.
  const count = onSearch ? 3 : 2;
  const stackUp = pos.y - (count - 1) * (SIZE + GAP) >= EDGE_PAD;
  const slotTop = (i: number) => (stackUp ? pos.y - i * (SIZE + GAP) : pos.y + i * (SIZE + GAP));
  const launcherTop = slotTop(0);
  const ukiTop = slotTop(1);
  const searchTop = slotTop(2);
  const tops = onSearch ? [launcherTop, ukiTop, searchTop] : [launcherTop, ukiTop];
  const groupTop = Math.min(...tops);
  const groupBottom = Math.max(...tops) + SIZE;
  const BPAD = 5;

  const memberStyle = (hover: boolean, top: number, isAnchor: boolean): React.CSSProperties => ({
    position: 'fixed',
    left: pos.x,
    top,
    width: SIZE,
    height: SIZE,
    zIndex: 'var(--z-dock)' as unknown as number,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
    background: 'var(--color-bg-glass, rgba(22,22,24,0.78))',
    boxShadow: dragging
      ? '0 14px 40px rgba(0,0,0,0.5), 0 0 0 1px var(--color-border-strong, rgba(255,255,255,0.22))'
      : 'var(--pg-shadow-popover, 0 8px 24px rgba(0,0,0,0.4))',
    cursor: dragging ? 'grabbing' : 'grab',
    padding: 0,
    outline: 'none',
    touchAction: 'none',
    transform: dragging && isAnchor ? 'scale(1.06)' : hover ? 'scale(1.05)' : 'scale(1)',
    transition: 'transform 0.14s cubic-bezier(0.2,0.9,0.3,1), box-shadow 0.16s ease',
  });

  const memberHandlers = (action: () => void, setHover: (v: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => beginPress(e, action),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onPointerEnter: () => setHover(true),
    onPointerLeave: () => setHover(false),
  });

  return (
    <>
      {/* Subtle shared backdrop so the three members read as one cohesive group
          (rendered first; the buttons paint on top). */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: pos.x - BPAD,
          top: groupTop - BPAD,
          width: SIZE + BPAD * 2,
          height: groupBottom - groupTop + BPAD * 2,
          borderRadius: SIZE / 2 + BPAD,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          zIndex: 'var(--z-dock)' as unknown as number,
          pointerEvents: 'none',
          opacity: dragging ? 1 : 0.85,
          transition: 'opacity 0.16s ease',
        }}
      />
      {onSearch && (
        <button type="button" aria-label="Search" title="Search" {...memberHandlers(onSearch, setSearchHover)} style={memberStyle(searchHover, searchTop, false)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={searchHover ? 'var(--color-accent)' : 'var(--color-text-secondary)'} strokeWidth="2.2" strokeLinecap="round" style={{ pointerEvents: 'none', transition: 'stroke 0.2s ease' }} aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </button>
      )}
      <button type="button" aria-label="Open UKI assistant" title="UKI assistant"
        {...memberHandlers(() => { try { useUkiStore.getState().togglePanel(); } catch { /* store not ready */ } }, setUkiHover)}
        style={memberStyle(ukiHover, ukiTop, false)}>
        {/* Microphone glyph -- UKI is the voice assistant. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ukiHover ? 'var(--color-accent)' : 'var(--color-text-secondary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none', transition: 'stroke 0.2s ease' }} aria-hidden="true">
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </button>
      <button type="button" aria-label="Open launcher (drag to move)" title="Launcher — click to open, drag the group to move"
        {...memberHandlers(onOpen, setHovered)}
        style={memberStyle(hovered, launcherTop, true)}>
        <svg width="22" height="22" viewBox="0 0 18 18" fill="none" style={{ pointerEvents: 'none' }} aria-hidden="true">
          <rect x="1" y="1" width="7" height="7" rx="2" fill={hovered || dragging ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.2s ease' }} />
          <rect x="10" y="1" width="7" height="7" rx="2" fill={hovered || dragging ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.2s ease' }} />
          <rect x="1" y="10" width="7" height="7" rx="2" fill={hovered || dragging ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.2s ease' }} />
          <rect x="10" y="10" width="7" height="7" rx="2" fill={hovered || dragging ? 'var(--color-accent)' : 'var(--color-text-secondary)'} style={{ transition: 'fill 0.2s ease' }} />
        </svg>
      </button>
    </>
  );
};

export default FloatingLauncher;
