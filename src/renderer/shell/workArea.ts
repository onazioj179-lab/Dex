// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Desktop Work Area Manager -- the one place that says where ordinary DEX
// windows may live. Pure: callers pass the live measurements (viewport, top bar,
// display scale, safe-area insets), so nothing here is tied to one resolution.
//
// The Dock is a floating overlay: it never shrinks the work area. Maximized
// windows start below the top bar and fill everything else.

export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface WorkAreaInput {
  /** Viewport (CSS px) of the surface windows are positioned in. */
  viewportW: number;
  viewportH: number;
  /** Top-bar height already above that surface (0 when the surface starts below it). */
  topBar?: number;
  /** Safe-area insets (env(safe-area-inset-*)), CSS px. */
  safe?: Partial<Insets>;
  /** window.devicePixelRatio; edges are snapped to whole device pixels. */
  scale?: number;
}

const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Snap a CSS length to the device-pixel grid so edges stay crisp at 125/150%. */
export function snapToDevice(v: number, scale = 1): number {
  const s = scale > 0 && Number.isFinite(scale) ? scale : 1;
  return Math.round(v * s) / s;
}

/** The usable rectangle for ordinary windows. */
export function computeWorkArea(input: WorkAreaInput): Rect {
  const s = { ...ZERO, ...input.safe };
  const scale = input.scale ?? 1;
  const top = (input.topBar ?? 0) + s.top;
  const x = snapToDevice(s.left, scale);
  const y = snapToDevice(top, scale);
  const w = snapToDevice(Math.max(0, input.viewportW - s.left - s.right), scale);
  const h = snapToDevice(Math.max(0, input.viewportH - top - s.bottom), scale);
  return { x, y, w, h };
}

/** Maximized = the whole work area. */
export function maximizedRect(area: Rect): Rect {
  return { ...area };
}

/**
 * Fit a window into the work area: never larger than the area, never smaller
 * than its minimum (unless the area itself is smaller), fully on-screen.
 */
export function fitToWorkArea(r: Rect, area: Rect, min: { w: number; h: number } = { w: 260, h: 200 }): Rect {
  const w = Math.min(area.w, Math.max(Math.min(min.w, area.w), Math.round(r.w)));
  const h = Math.min(area.h, Math.max(Math.min(min.h, area.h), Math.round(r.h)));
  const x = Math.max(area.x, Math.min(Math.round(r.x), area.x + area.w - w));
  const y = Math.max(area.y, Math.min(Math.round(r.y), area.y + area.h - h));
  return { x, y, w, h };
}

/**
 * Recover a window the display change left (partly) off-screen: if less than
 * `grip` px of its title strip is still reachable, pull it back inside.
 * Windows that are still reachable keep their place.
 */
export function recoverOffscreen(r: Rect, area: Rect, grip = 48): Rect {
  const visibleW = Math.min(r.x + r.w, area.x + area.w) - Math.max(r.x, area.x);
  const titleVisible = r.y >= area.y && r.y <= area.y + area.h - 24;
  if (visibleW >= grip && titleVisible && r.w <= area.w && r.h <= area.h) return r;
  return fitToWorkArea(r, area);
}

/** Read env(safe-area-inset-*) through a probe element (0 where unsupported). */
export function readSafeAreaInsets(doc: Document = document): Insets {
  try {
    const el = doc.createElement('div');
    el.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    doc.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = {
      top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0,
    };
    el.remove();
    return out;
  } catch { return { ...ZERO }; }
}
