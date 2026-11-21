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

import { useLayoutEffect, useRef, useState } from 'react';

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
type StackEntry = OverlayEntry & { z: number };
const stack: StackEntry[] = [];
let wired = false;

function top(): StackEntry | undefined { return stack[stack.length - 1]; }

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

// Wire at import (the shell imports this through ContextMenu at boot) so the
// stack's capture listeners run before window-level Escape handlers that
// register later; those then never see an Escape meant for an overlay.
wire();

/** Register an open overlay; returns its z-index and an unregister function. */
export function pushOverlay(entry: OverlayEntry): { z: number; release: () => void } {
  wire();
  const registered = { ...entry, z: (top()?.z ?? BASE_Z) + 10 };
  const existing = stack.findIndex((o) => o.id === entry.id);
  if (existing >= 0) stack.splice(existing, 1);
  stack.push(registered);
  return {
    z: registered.z,
    release: () => {
      const i = stack.indexOf(registered);
      if (i < 0) return;
      const wasTop = registered === top();
      stack.splice(i, 1);
      const back = entry.restoreFocus;
      const contains = top()?.contains;
      if (wasTop && back?.isConnected && (!contains || contains(back))) {
        back.focus({ preventScroll: true });
      }
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
  const [id] = useState(() => `ov-${++seq}`);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [zIndex, setZIndex] = useState(BASE_Z);
  useLayoutEffect(() => {
    if (!open) return;
    const { z, release } = pushOverlay({
      id,
      close: () => closeRef.current(),
      dismissOnOutside: opts.dismissOnOutside,
      ownEscape: opts.ownEscape,
      restoreFocus: typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
      contains: opts.ref || opts.anchorRef
        ? (t) => !!(opts.ref?.current?.contains(t) || opts.anchorRef?.current?.contains(t))
        : undefined,
    });
    setZIndex(z);
    return release;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);
  return { zIndex, isTop: () => isTopOverlay(id) };
}

/** Test-only reset. */
export function _resetOverlayStack(): void { stack.length = 0; }
