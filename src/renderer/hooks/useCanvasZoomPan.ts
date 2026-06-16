// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX shared creative engine -- canvas zoom + pan.
 *
 * One implementation of the cursor-centred wheel-zoom and pan-offset math that the
 * creative apps were each re-rolling (DEX 5.5 P3: a SHARED creative engine, not
 * per-app reimplementations). Extracted from PRISM's battle-tested logic so a
 * migration is behaviour-preserving.
 *
 * Deliberately UI-agnostic: it owns the `zoom` (percent, 100 = 1:1) and
 * `panOffset` state and exposes the math; the host app decides WHEN to zoom
 * (which modifier / tool gates a wheel event) and supplies the element to centre
 * on at call time, so there are no global listeners and nothing to conflict with
 * an app's own drawing handlers.
 */

import { useCallback, useRef, useState } from 'react';

export interface UseCanvasZoomPanOptions {
  /** Minimum zoom percent (default 10). */
  min?: number;
  /** Maximum zoom percent (default 500). */
  max?: number;
  /** Initial zoom percent (default 100 = 1:1). */
  initial?: number;
}

export interface CanvasZoomPan {
  /** Zoom as a percent (100 = 1:1), matching the creative apps' convention. */
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  /** Pan offset in screen px applied as translate() before scale(). */
  panOffset: { x: number; y: number };
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  /** Pan by a screen-px delta (rAF-batched for smooth drag). */
  panBy: (dx: number, dy: number) => void;
  /**
   * Apply a wheel zoom centred on the cursor. The host gates WHEN to call this
   * (e.g. ctrl/meta held, or a zoom tool active) and passes the element being
   * scaled (whose `transformOrigin` is its centre) so the pixel under the cursor
   * stays fixed instead of the view recentring on the middle.
   */
  zoomAtCursor: (e: { deltaY: number; clientX: number; clientY: number }, el: HTMLElement | null) => void;
  /** Reset to the initial zoom and zero pan. */
  resetView: () => void;
}

export function useCanvasZoomPan(options: UseCanvasZoomPanOptions = {}): CanvasZoomPan {
  const { min = 10, max = 500, initial = 100 } = options;
  const [zoom, setZoom] = useState(initial);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panRaf = useRef(0);

  const panBy = useCallback((dx: number, dy: number) => {
    cancelAnimationFrame(panRaf.current);
    panRaf.current = requestAnimationFrame(() => {
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    });
  }, []);

  const zoomAtCursor = useCallback(
    (e: { deltaY: number; clientX: number; clientY: number }, el: HTMLElement | null) => {
      // Normalized delta for trackpad vs mouse wheel.
      const delta = Math.abs(e.deltaY) > 50 ? Math.sign(e.deltaY) * 50 : e.deltaY;
      const factor = 1 + Math.abs(delta) * 0.003;
      setZoom(prevZoom => {
        const next = delta < 0 ? Math.min(max, prevZoom * factor) : Math.max(min, prevZoom / factor);
        // Keep the pixel under the pointer fixed: measure the cursor offset from
        // the element's visual centre and undo the scale-induced drift of that
        // offset. Without this, the view always recentres on the middle.
        if (el && next !== prevZoom) {
          const rect = el.getBoundingClientRect();
          const cx = e.clientX - (rect.left + rect.width / 2);
          const cy = e.clientY - (rect.top + rect.height / 2);
          const k = next / prevZoom;
          setPanOffset(prev => ({ x: prev.x + cx * (1 - k), y: prev.y + cy * (1 - k) }));
        }
        return next;
      });
    },
    [min, max],
  );

  const resetView = useCallback(() => {
    setZoom(initial);
    setPanOffset({ x: 0, y: 0 });
  }, [initial]);

  return { zoom, setZoom, panOffset, setPanOffset, panBy, zoomAtCursor, resetView };
}
