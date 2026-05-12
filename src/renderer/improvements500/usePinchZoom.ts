// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pinch-to-zoom hook (T11-012..T11-016, T11-026).
 *
 * Tracks two-pointer pinch gestures and reports a scale factor relative to
 * the start distance. Designed for canvas viewports and grids.
 *
 * Returned `scale` is multiplicative against the caller's current zoom and
 * resets to 1 between gestures. Caller composes: `nextZoom = baseZoom * scale`.
 */

import { useEffect, useRef, useState } from 'react';

export interface PinchZoomOptions {
  /** Minimum scale produced (default 0.1). */
  min?: number;
  /** Maximum scale produced (default 10). */
  max?: number;
  /** Disable while true. */
  disabled?: boolean;
}

export interface PinchZoomResult {
  /** Current relative scale during an active pinch (1 when idle). */
  scale: number;
  /** True while a pinch is in progress. */
  active: boolean;
  /** Centroid x in client coords during pinch. */
  centerX: number;
  /** Centroid y in client coords during pinch. */
  centerY: number;
}

export function usePinchZoom<T extends HTMLElement = HTMLElement>(
  options: PinchZoomOptions = {},
) {
  const { min = 0.1, max = 10, disabled = false } = options;
  const ref = useRef<T | null>(null);
  const pointers = useRef<Map<number, PointerEvent>>(new Map());
  const startDist = useRef<number>(0);
  const [state, setState] = useState<PinchZoomResult>({
    scale: 1, active: false, centerX: 0, centerY: 0,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    const dist = (a: PointerEvent, b: PointerEvent) => {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pointers.current.set(e.pointerId, e);
      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        startDist.current = dist(a, b) || 1;
        setState({
          scale: 1, active: true,
          centerX: (a.clientX + b.clientX) / 2,
          centerY: (a.clientY + b.clientY) / 2,
        });
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, e);
      if (pointers.current.size !== 2) return;
      const [a, b] = Array.from(pointers.current.values());
      const cur = dist(a, b);
      let scale = cur / (startDist.current || 1);
      if (scale < min) scale = min;
      if (scale > max) scale = max;
      setState({
        scale, active: true,
        centerX: (a.clientX + b.clientX) / 2,
        centerY: (a.clientY + b.clientY) / 2,
      });
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) {
        setState((prev) => ({ ...prev, scale: 1, active: false }));
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('pointerleave', onPointerEnd);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('pointerleave', onPointerEnd);
    };
  }, [min, max, disabled]);

  return { ref, ...state };
}
