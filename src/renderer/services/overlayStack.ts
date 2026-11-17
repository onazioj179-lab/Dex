// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// One overlay stack for the whole shell. Menus, popovers, dialogs and panels
// register while open; the stack decides
//   - which overlay Escape closes (only the top one -- a submenu, not its menu
//     and the dialog behind it all at once),
//   - which overlay an outside click closes (the top one, unless the click is
//     inside an overlay above or its anchor),
//   - z-order (each newer overlay sits above the previous one),
//   - where focus goes back to when it closes.
// Plus a viewport clamp shared by every popup so none opens off-screen.

import { useEffect, useRef } from 'react';

export interface OverlayEntry {
  id: string;
  close: () => void;
  /** Elements that count as "inside" (the overlay, its anchor button). */
  contains?: (target: Node) => boolean;
  /** Close on a click outside (default true). */
  dismissOnOutside?: boolean;
  /** Element focused before opening; focus returns here on close. */
  restoreFocus?: HTMLElement | null;
  /** The overlay handles Escape itself (e.g. closes a submenu first); the
   *  stack only keeps Escape from reaching overlays underneath. */
  ownEscape?: boolean;
}

const BASE_Z = 7000;
const stack: OverlayEntry[] = [];
let wired = false;

function top(): OverlayEntry | undefined { return stack[stack.length - 1]; }

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !stack.length) return;
  const t = top()!;
  if (t.ownEscape) return; // its own handler runs and checks isTopOverlay
  e.preventDefault();
  e.stopImmediatePropagation();
  t.close();
}

function onPointer(e: PointerEvent): void {
  const t = top();
  if (!t || t.dismissOnOutside === false) return;
  const target = e.target as Node | null;
  if (!target) return;
  if (t.contains?.(target)) return;
  t.close();
}

function wire(): void {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPointer, true);
}

/** Register an open overlay; returns its z-index and an unregister function. */
export function pushOverlay(entry: OverlayEntry): { z: number; release: () => void } {
  wire();
  const existing = stack.findIndex((o) => o.id === entry.id);
  if (existing >= 0) stack.splice(existing, 1);
  stack.push(entry);
  const z = BASE_Z + stack.length * 10;
  return {
    z,
    release: () => {
      const i = stack.findIndex((o) => o.id === entry.id);
      if (i < 0) return;
      stack.splice(i, 1);
      const back = entry.restoreFocus;
      if (back && back.isConnected) { try { back.focus({ preventScroll: true }); } catch { /* detached */ } }
    },
  };
}

export function isTopOverlay(id: string): boolean { return top()?.id === id; }
export function overlayDepth(): number { return stack.length; }

/** Keep a popup of size w x h at (x, y) inside the viewport, `margin` px in. */
export function clampToViewport(x: number, y: number, w: number, h: number, vw = window.innerWidth, vh = window.innerHeight, margin = 8): { x: number; y: number } {
  return {
    x: Math.max(margin, Math.min(x, vw - w - margin)),
    y: Math.max(margin, Math.min(y, vh - h - margin)),
  };
}

let seq = 0;
/**
 * React binding: while `open`, the overlay is on the stack. Escape and outside
 * clicks call `onClose` only when it is the top overlay. Returns the z-index.
 */
export function useOverlay(
  open: boolean,
  onClose: () => void,
  opts: { ref?: React.RefObject<HTMLElement>; anchorRef?: React.RefObject<HTMLElement>; dismissOnOutside?: boolean; ownEscape?: boolean } = {},
): { zIndex: number; isTop: () => boolean } {
  const idRef = useRef(`ov-${++seq}`);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const zRef = useRef(BASE_Z);
  useEffect(() => {
    if (!open) return;
    const { z, release } = pushOverlay({
      id: idRef.current,
      close: () => closeRef.current(),
      dismissOnOutside: opts.dismissOnOutside,
      ownEscape: opts.ownEscape,
      restoreFocus: typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
      contains: (t) => !!(opts.ref?.current?.contains(t) || opts.anchorRef?.current?.contains(t)),
    });
    zRef.current = z;
    return release;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { zIndex: zRef.current, isTop: () => isTopOverlay(idRef.current) };
}

/** Test-only reset. */
export function _resetOverlayStack(): void { stack.length = 0; }
