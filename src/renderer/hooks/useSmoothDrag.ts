// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// useSmoothDrag — the canonical "grab and move it" behaviour, extracted from
// the FloatingLauncher so every draggable surface in DEX feels identical.
//
// Why this exists: drag logic was hand-rolled per surface and they drifted in
// quality. The FloatingLauncher had the best version; Home icons had the worst
// (they pushed a store write on EVERY pointermove, re-rendering the whole grid
// each frame). This hook is the FloatingLauncher's technique, generalized:
//
//   - position via left/top, NEVER transform. DEX global CSS forces
//     `transform: none !important` on hover/active/focus, which would wipe a
//     transform-positioned element the instant you grab it (the classic
//     snap-back glitch). Callers must apply the returned x/y as left/top.
//   - pointer capture, so the drag survives the cursor leaving the element.
//   - a move threshold, so a click isn't mistaken for a drag.
//   - rAF-batched updates: at most one position commit per frame, written to
//     local state (one re-render of the dragged element, not the whole list).
//   - the store is written ONCE, on release (onCommit) — not per move.
//
// Dependency-free beyond React.

import { useCallback, useRef, useState } from 'react';

export interface SmoothDragArgs {
  /** Committed position (usually from a store). Used when not dragging. */
  x: number;
  y: number;
  /** Called once on release with the final position. Persist here. */
  onCommit: (x: number, y: number) => void;
  /** Pixels of movement before a press becomes a drag. Default 4. */
  threshold?: number;
  /** Optional clamp (e.g. to the viewport) applied to every live position. */
  clamp?: (x: number, y: number) => { x: number; y: number };
  /** When true, the surface is not draggable (handlers no-op). */
  disabled?: boolean;
  /**
   * Called on pointer-up. `moved` is true when the gesture crossed the
   * threshold (i.e. it was a drag, not a click) — use it to suppress the
   * element's click/activate action after a drag.
   */
  onRelease?: (e: React.PointerEvent, moved: boolean) => void;
}

export interface SmoothDragResult {
  /** Position to render as left/top — live during a drag, committed otherwise. */
  x: number;
  y: number;
  /** True while an active drag is in progress (past the threshold). */
  dragging: boolean;
  /** Spread onto the draggable element. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

interface DragState { startX: number; startY: number; origX: number; origY: number; moved: boolean }

export function useSmoothDrag(args: SmoothDragArgs): SmoothDragResult {
  const { x, y, onCommit, threshold = 4, clamp, disabled, onRelease } = args;

  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  // Live position during a drag. Mirrored in a ref so the release commit reads
  // the latest value without waiting for a state flush.
  const [pos, setPos] = useState({ x, y });
  const posRef = useRef(pos);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ cx: number; cy: number } | null>(null);

  const apply = useCallback(() => {
    const d = dragRef.current, p = pendingRef.current;
    rafRef.current = null;
    if (!d || !p) return;
    const raw = { x: d.origX + (p.cx - d.startX), y: d.origY + (p.cy - d.startY) };
    const next = clamp ? clamp(raw.x, raw.y) : raw;
    posRef.current = next;
    setPos(next);
  }, [clamp]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y, moved: false };
    posRef.current = { x, y };
  }, [disabled, x, y]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    pendingRef.current = { cx: e.clientX, cy: e.clientY };
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(apply);
  }, [threshold, apply]);

  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* released */ }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const moved = d?.moved ?? false;
    if (moved) onCommit(posRef.current.x, posRef.current.y);
    pendingRef.current = null;
    setDragging(false);
    onRelease?.(e, moved);
  }, [onCommit, onRelease]);

  return {
    x: dragging ? pos.x : x,
    y: dragging ? pos.y : y,
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
  };
}
